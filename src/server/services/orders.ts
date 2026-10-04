/**
 * Pedidos (§8–§10, §21, §39).
 *
 * Criação (loja ou painel), numa única transação:
 *   valida itens (mesma marca, ativos, com estoque) → recalcula preços no
 *   servidor → frete da marca → cliente (cria/atualiza) → pedido + itens +
 *   histórico → mensagem do WhatsApp (link) + registro → evento → auditoria.
 *
 * Mudança de status, também transacional:
 *   - entrar num status "confirmado" → baixa de estoque (movimento "venda")
 *   - sair dele (cancelado/devolvido/retorno) → estorno do estoque
 *   - entrar em "pago" (ou adiante) → receita no financeiro
 *   - sair disso → lançamento de estorno
 * Assim nunca existe pedido confirmado sem baixa de estoque (§37).
 */
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema, write, type Tx } from "../db";
import { AppError, notFound } from "../errors";
import { audit, type AuditActor } from "../audit";
import { applyMovement, variantStock } from "./inventory";
import { getBrandById } from "./brands";
import { getBrandCms, getBrandWhatsappNumber } from "./cms";
import { buildCheckoutMessage, getDriver, getTemplate, logMessage, money, renderTemplate, waLink } from "./whatsapp";
import { recordEvent } from "./analytics";
import { computeShipping } from "@/lib/shipping";
import { todaySP } from "@/lib/period";
import { centsToDecimal, formatDate, orderCode, toCents, toNumber } from "@/lib/format";
import { normalizePhone } from "@/lib/text";
import {
  ORDER_STATUS_LABELS,
  REVENUE_STATUSES,
  STATUS_TEMPLATE,
  STOCK_COMMITTED_STATUSES,
  type OrderStatus,
} from "@/lib/domain";
import { zOptionalEmail, zOptionalText, zRequired, zState } from "../validation";

const { orders, orderItems, orderStatusHistory, products, productVariants, customers, financialEntries } = schema;

export const orderCustomerSchema = z.object({
  name: zRequired("Nome", 120),
  phone: zRequired("Telefone", 30).refine((v) => (normalizePhone(v) ?? "").length >= 12, "Telefone inválido (inclua o DDD)."),
  whatsapp: zOptionalText(30),
  email: zOptionalEmail,
  address: zOptionalText(300),
  city: zOptionalText(120),
  state: zState,
  zip: zOptionalText(12),
  notes: zOptionalText(1000),
});

export const createOrderSchema = z.object({
  brandId: z.string().uuid(),
  items: z
    .array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1).max(99) }))
    .min(1, "O carrinho está vazio.")
    .max(50),
  customer: orderCustomerSchema,
  whatsappOptIn: z.boolean().default(false),
  idempotencyKey: z.string().min(8).max(100).optional(),
  paymentMethod: z.string().max(40).nullable().optional(),
  discount: z.number().min(0).max(1_000_000).optional(),
  visitorId: z.string().max(80).nullable().optional(),
  /** "retirada": o cliente busca na loja (sem frete, sem endereço do cliente). */
  delivery: z.enum(["entrega", "retirada"]).default("entrega"),
});
export type CreateOrderInput = z.input<typeof createOrderSchema>;

export type CreatedOrder = {
  id: string;
  number: number;
  code: string;
  brandId: string;
  total: number;
  whatsappUrl: string | null;
  message: string;
  storeWhatsappConfigured: boolean;
  duplicate: boolean;
};

export async function createOrder(
  raw: CreateOrderInput,
  ctx: { source: "loja" | "painel"; actor?: AuditActor; isDemo?: boolean },
): Promise<CreatedOrder> {
  const input = createOrderSchema.parse(raw);
  const brand = await getBrandById(input.brandId);
  if (!brand || (!brand.isActive && ctx.source === "loja")) throw new AppError("Loja indisponível.");

  // Idempotência: o mesmo envio (duplo clique / reenvio) devolve o mesmo pedido.
  if (input.idempotencyKey) {
    const db = await getDb();
    const [existing] = await db.select().from(orders).where(eq(orders.idempotencyKey, input.idempotencyKey)).limit(1);
    if (existing) {
      return {
        id: existing.id,
        number: existing.number,
        code: orderCode(brand.orderPrefix, existing.number),
        brandId: existing.brandId,
        total: toNumber(existing.total),
        whatsappUrl: existing.whatsappUrl,
        message: "",
        storeWhatsappConfigured: !!existing.whatsappUrl,
        duplicate: true,
      };
    }
  }

  const cms = await getBrandCms(brand.id);
  const storeNumber = await getBrandWhatsappNumber(brand.id);

  return write(async (tx) => {
    // Agrupa linhas repetidas da mesma variação.
    const qtyByVariant = new Map<string, number>();
    for (const it of input.items) qtyByVariant.set(it.variantId, (qtyByVariant.get(it.variantId) ?? 0) + it.quantity);
    const variantIds = [...qtyByVariant.keys()];

    const rows = await tx
      .select({
        variantId: productVariants.id,
        variantBrandId: productVariants.brandId,
        size: productVariants.size,
        color: productVariants.color,
        sku: productVariants.sku,
        priceOverride: productVariants.priceOverride,
        variantActive: productVariants.isActive,
        productId: products.id,
        productName: products.name,
        productStatus: products.status,
        salePrice: products.salePrice,
        promoPrice: products.promoPrice,
        costPrice: products.costPrice,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(and(inArray(productVariants.id, variantIds), isNull(productVariants.deletedAt), isNull(products.deletedAt)));

    const stock = await variantStock(tx, variantIds);
    const lines = variantIds.map((variantId) => {
      const row = rows.find((r) => r.variantId === variantId);
      if (!row) throw new AppError("Um dos produtos do carrinho não está mais disponível.", "conflict");
      // Regra absoluta: um pedido pertence a UMA marca.
      if (row.variantBrandId !== brand.id) throw new AppError("O carrinho contém produtos de outra loja.", "conflict");
      if (ctx.source === "loja" && (row.productStatus !== "ativo" || !row.variantActive)) {
        throw new AppError(`"${row.productName}" não está mais disponível.`, "conflict");
      }
      const quantity = qtyByVariant.get(variantId)!;
      const available = stock.get(variantId) ?? 0;
      if (quantity > available) {
        const label = [row.productName, row.size, row.color].filter(Boolean).join(" · ");
        throw new AppError(
          available > 0
            ? `Estoque insuficiente para ${label}: restam ${available} unidade(s).`
            : `${label} está esgotado.`,
          "conflict",
        );
      }
      const unitCents =
        row.priceOverride !== null ? toCents(row.priceOverride) : toCents(row.promoPrice ?? row.salePrice);
      return { row, quantity, unitCents, totalCents: unitCents * quantity };
    });

    const subtotalCents = lines.reduce((s, l) => s + l.totalCents, 0);
    const discountCents = Math.min(toCents(input.discount ?? 0), subtotalCents);
    const pickup = input.delivery === "retirada";
    if (pickup && !(cms.pickup.enabled && cms.pickup.address)) {
      throw new AppError("A retirada na loja não está disponível no momento. Escolha a entrega.", "app_error", { delivery: "Indisponível." });
    }
    const shipping = pickup
      ? { amount: 0, label: "Retirada na loja (sem frete)", known: true }
      : computeShipping(cms.shipping, (subtotalCents - discountCents) / 100);
    const shippingCents = toCents(shipping.amount);
    const totalCents = subtotalCents - discountCents + shippingCents;

    // Cliente: cria ou atualiza pelo telefone normalizado. Na retirada o endereço do
    // cliente não é pedido nem alterado.
    const c = pickup ? { ...input.customer, address: null, city: null, state: null, zip: null } : input.customer;
    const pickupAddress = pickup ? `Retirada na loja: ${cms.pickup.address}` : null;
    const phoneNorm = normalizePhone(c.phone)!;
    const whatsapp = normalizePhone(c.whatsapp) ?? phoneNorm;
    const [existingCustomer] = await tx
      .select()
      .from(customers)
      .where(and(eq(customers.phoneNormalized, phoneNorm), isNull(customers.deletedAt)))
      .limit(1);
    const customerPatch = {
      name: c.name,
      phone: c.phone,
      phoneNormalized: phoneNorm,
      whatsapp,
      ...(c.email ? { email: c.email } : {}),
      ...(c.address ? { address: c.address } : {}),
      ...(c.city ? { city: c.city } : {}),
      ...(c.state ? { state: c.state } : {}),
      ...(c.zip ? { zip: c.zip } : {}),
      ...(input.whatsappOptIn ? { whatsappOptIn: true, optInAt: new Date() } : {}),
    };
    let customerId: string;
    if (existingCustomer) {
      customerId = existingCustomer.id;
      await tx.update(customers).set(customerPatch).where(eq(customers.id, customerId));
    } else {
      const [created] = await tx
        .insert(customers)
        .values({ ...customerPatch, isDemo: ctx.isDemo ?? false })
        .returning({ id: customers.id });
      customerId = created.id;
    }

    const [order] = await tx
      .insert(orders)
      .values({
        brandId: brand.id,
        customerId,
        customerName: c.name,
        customerPhone: c.phone,
        customerWhatsapp: whatsapp,
        customerEmail: c.email ?? null,
        address: pickupAddress ?? c.address ?? null,
        city: c.city ?? null,
        state: c.state ?? null,
        zip: c.zip ?? null,
        notes: c.notes ?? null,
        subtotal: centsToDecimal(subtotalCents),
        discount: centsToDecimal(discountCents),
        shipping: centsToDecimal(shippingCents),
        shippingLabel: shipping.label,
        total: centsToDecimal(totalCents),
        paymentMethod: input.paymentMethod ?? null,
        status: "pedido_recebido",
        deliveryMethod: "link",
        source: ctx.source,
        idempotencyKey: input.idempotencyKey ?? null,
        createdBy: ctx.actor?.id ?? null,
        updatedBy: ctx.actor?.id ?? null,
        isDemo: ctx.isDemo ?? false,
      })
      .returning();

    await tx.insert(orderItems).values(
      lines.map((l) => ({
        orderId: order.id,
        productId: l.row.productId,
        variantId: l.row.variantId,
        productName: l.row.productName,
        sku: l.row.sku,
        size: l.row.size,
        color: l.row.color,
        quantity: l.quantity,
        unitPrice: centsToDecimal(l.unitCents),
        unitCost: l.row.costPrice,
        total: centsToDecimal(l.totalCents),
      })),
    );
    await tx.insert(orderStatusHistory).values({
      orderId: order.id,
      fromStatus: null,
      toStatus: "pedido_recebido",
      note: ctx.source === "loja" ? "Pedido criado pela loja online" : "Pedido registrado no painel",
      changedBy: ctx.actor?.id ?? null,
    });

    const code = orderCode(brand.orderPrefix, order.number);
    const message = await buildCheckoutMessage(tx, brand.id, {
      brandName: brand.name,
      orderNumber: code,
      items: lines.map((l) => ({
        name: l.row.productName,
        size: l.row.size,
        color: l.row.color,
        quantity: l.quantity,
        total: l.totalCents / 100,
      })),
      subtotal: subtotalCents / 100,
      shippingLabel: shipping.label,
      total: totalCents / 100,
      customerName: c.name,
      customerPhone: c.phone,
      notes: c.notes ?? null,
      delivery: pickupAddress ?? ([c.address, [c.city, c.state].filter(Boolean).join(" - ")].filter(Boolean).join(", ") || "A combinar"),
    });
    const whatsappUrl = ctx.source === "loja" ? waLink(storeNumber, message) : null;
    if (whatsappUrl) await tx.update(orders).set({ whatsappUrl }).where(eq(orders.id, order.id));
    if (ctx.source === "loja") {
      await logMessage(tx, {
        brandId: brand.id,
        orderId: order.id,
        customerId,
        toNumber: storeNumber,
        templateKey: "checkout",
        body: message,
        result: { method: "link", status: "gerado", url: whatsappUrl },
        isDemo: ctx.isDemo,
      });
    }

    await recordEvent(tx, {
      brandId: brand.id,
      type: "order_created",
      orderId: order.id,
      value: totalCents / 100,
      visitorId: input.visitorId ?? null,
      isDemo: ctx.isDemo,
    });
    await audit(tx, ctx.actor ?? null, {
      action: "pedido.criar",
      entity: "orders",
      entityId: order.id,
      brandId: brand.id,
      after: { numero: code, total: centsToDecimal(totalCents), itens: lines.length, origem: ctx.source },
    });

    return {
      id: order.id,
      number: order.number,
      code,
      brandId: brand.id,
      total: totalCents / 100,
      whatsappUrl,
      message,
      storeWhatsappConfigured: !!storeNumber,
      duplicate: false,
    };
  });
}

// ---------------------------------------------------------------------------
// Mudança de status
// ---------------------------------------------------------------------------
const TERMINAL: OrderStatus[] = ["cancelado", "devolvido"];

export function allowedTransitions(from: OrderStatus): OrderStatus[] {
  if (TERMINAL.includes(from)) return [];
  const all = Object.keys(ORDER_STATUS_LABELS) as OrderStatus[];
  return all.filter((to) => {
    if (to === from) return false;
    if (to === "devolvido") return ["pago", "em_preparacao", "enviado", "entregue"].includes(from);
    if (to === "cancelado") return from !== "entregue";
    if (to === "carrinho_abandonado") return ["aguardando_confirmacao", "pedido_recebido"].includes(from);
    if (from === "entregue") return false; // entregue só pode virar devolvido
    return true;
  });
}

export type StatusChangeResult = {
  status: OrderStatus;
  stockChanged: "baixa" | "estorno" | null;
  revenueChanged: "receita" | "estorno" | null;
  notification: { url: string | null; status: string; method: string } | null;
};

export async function changeOrderStatus(
  orderId: string,
  toStatus: OrderStatus,
  ctx: { actor: NonNullable<AuditActor>; note?: string | null; isDemo?: boolean },
): Promise<StatusChangeResult> {
  return write(async (tx) => {
    const locked = await tx.execute(sql`select id from public.orders where id = ${orderId} for update`);
    void locked;
    const [order] = await tx.select().from(orders).where(and(eq(orders.id, orderId), isNull(orders.deletedAt)));
    if (!order) throw notFound("Pedido não encontrado.");
    const from = order.status as OrderStatus;
    if (!allowedTransitions(from).includes(toStatus)) {
      throw new AppError(
        `Não é possível mudar de "${ORDER_STATUS_LABELS[from]}" para "${ORDER_STATUS_LABELS[toStatus]}".`,
        "conflict",
      );
    }
    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    const brand = await getBrandById(order.brandId);
    const code = orderCode(brand?.orderPrefix, order.number);

    let stockChanged: StatusChangeResult["stockChanged"] = null;
    let revenueChanged: StatusChangeResult["revenueChanged"] = null;
    const patch: Partial<typeof orders.$inferInsert> = { status: toStatus, updatedBy: ctx.actor.id };

    const shouldCommit = STOCK_COMMITTED_STATUSES.includes(toStatus);
    if (!order.stockCommitted && shouldCommit) {
      for (const it of items) {
        if (!it.variantId) throw new AppError(`O item "${it.productName}" não tem variação vinculada.`, "conflict");
        await applyMovement(tx, {
          variantId: it.variantId,
          type: "venda",
          quantity: -it.quantity,
          orderId: order.id,
          reason: `Pedido ${code}`,
          responsibleUserId: ctx.actor.id,
          isDemo: order.isDemo,
        });
        if (it.productId) {
          await tx
            .update(products)
            .set({ quantitySold: sql`${products.quantitySold} + ${it.quantity}` })
            .where(eq(products.id, it.productId));
        }
      }
      patch.stockCommitted = true;
      stockChanged = "baixa";
    } else if (order.stockCommitted && !shouldCommit) {
      for (const it of items) {
        if (!it.variantId) continue;
        await applyMovement(tx, {
          variantId: it.variantId,
          type: toStatus === "devolvido" ? "devolucao" : "cancelamento",
          quantity: it.quantity,
          orderId: order.id,
          reason: `Pedido ${code} — ${ORDER_STATUS_LABELS[toStatus].toLowerCase()}`,
          responsibleUserId: ctx.actor.id,
          isDemo: order.isDemo,
        });
        if (it.productId) {
          await tx
            .update(products)
            .set({ quantitySold: sql`greatest(${products.quantitySold} - ${it.quantity}, 0)` })
            .where(eq(products.id, it.productId));
        }
      }
      patch.stockCommitted = false;
      stockChanged = "estorno";
    }

    const shouldRecognize = REVENUE_STATUSES.includes(toStatus);
    if (!order.revenueRegistered && shouldRecognize) {
      await tx.insert(financialEntries).values({
        brandId: order.brandId,
        kind: "venda",
        description: `Venda — pedido ${code}`,
        amount: order.total,
        occurredOn: todaySP(),
        orderId: order.id,
        paymentMethod: order.paymentMethod,
        category: "vendas",
        createdBy: ctx.actor.id,
        isDemo: order.isDemo,
      });
      patch.revenueRegistered = true;
      revenueChanged = "receita";
      await recordEvent(tx, {
        brandId: order.brandId,
        type: "purchase_confirmed",
        orderId: order.id,
        value: toNumber(order.total),
        isDemo: order.isDemo,
      });
    } else if (order.revenueRegistered && !shouldRecognize && toNumber(order.total) > 0) {
      await tx.insert(financialEntries).values({
        brandId: order.brandId,
        kind: "estorno",
        description: `Estorno — pedido ${code} (${ORDER_STATUS_LABELS[toStatus].toLowerCase()})`,
        amount: (-toNumber(order.total)).toFixed(2),
        occurredOn: todaySP(),
        orderId: order.id,
        paymentMethod: order.paymentMethod,
        category: "estornos",
        createdBy: ctx.actor.id,
        isDemo: order.isDemo,
      });
      patch.revenueRegistered = false;
      revenueChanged = "estorno";
    }

    await tx.update(orders).set(patch).where(eq(orders.id, order.id));
    await tx.insert(orderStatusHistory).values({
      orderId: order.id,
      fromStatus: from,
      toStatus,
      note: ctx.note ?? null,
      changedBy: ctx.actor.id,
    });
    await audit(tx, ctx.actor, {
      action: "pedido.status",
      entity: "orders",
      entityId: order.id,
      brandId: order.brandId,
      before: { status: from },
      after: { status: toStatus, estoque: stockChanged, financeiro: revenueChanged },
      reason: ctx.note ?? null,
    });

    const notification = await notifyStatus(tx, order, toStatus, code, brand?.name ?? "", ctx.actor.id);
    return { status: toStatus, stockChanged, revenueChanged, notification };
  });
}

/**
 * Automação de mensagem por status (§20): só envia por API se a automação
 * estiver ligada, a API configurada e o cliente tiver dado opt-in. Caso
 * contrário, apenas gera o link para envio manual e registra.
 */
async function notifyStatus(
  tx: Tx,
  order: typeof orders.$inferSelect,
  toStatus: OrderStatus,
  code: string,
  brandName: string,
  actorId: string,
) {
  const templateKey = STATUS_TEMPLATE[toStatus];
  if (!templateKey) return null;
  const { automations } = schema;
  const autos = await tx
    .select()
    .from(automations)
    .where(and(eq(automations.triggerEvent, templateKey), sql`(${automations.brandId} = ${order.brandId} or ${automations.brandId} is null)`));
  const automation = autos.find((a) => a.brandId === order.brandId) ?? autos.find((a) => a.brandId === null);
  if (!automation?.isEnabled) return null;

  const tpl = await getTemplate(tx, order.brandId, templateKey);
  if (!tpl) return null;
  const body = renderTemplate(tpl.body, {
    nome: order.customerName.split(" ")[0],
    pedido: code,
    valor: money(order.total),
    marca: brandName,
    data: formatDate(new Date()),
    produto: null,
    link: null,
  });
  const to = order.customerWhatsapp ?? normalizePhone(order.customerPhone);

  let optedIn = false;
  if (order.customerId) {
    const [cust] = await tx.select({ optIn: customers.whatsappOptIn }).from(customers).where(eq(customers.id, order.customerId));
    optedIn = !!cust?.optIn;
  }
  const driver = await getDriver(order.brandId);
  const canUseApi = driver.kind === "api" && (!automation.requireOptIn || optedIn);
  const result = canUseApi
    ? await driver.send(to, body)
    : { method: "link" as const, status: "gerado" as const, url: waLink(to, body) };
  await logMessage(tx, {
    brandId: order.brandId,
    orderId: order.id,
    customerId: order.customerId,
    toNumber: to,
    templateKey,
    body,
    result,
    createdBy: actorId,
    isDemo: order.isDemo,
  });
  if (result.method === "api" && result.status === "enviado") {
    await tx.update(orders).set({ deliveryMethod: "api" }).where(eq(orders.id, order.id));
  }
  return { url: result.url, status: result.status, method: result.method };
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------
export async function getOrderDetail(orderId: string) {
  const db = await getDb();
  const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), isNull(orders.deletedAt)));
  if (!order) return null;
  const { users, whatsappMessagesLog } = schema;
  const [items, history, messages] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(asc(orderItems.createdAt)),
    db
      .select({
        id: orderStatusHistory.id,
        fromStatus: orderStatusHistory.fromStatus,
        toStatus: orderStatusHistory.toStatus,
        note: orderStatusHistory.note,
        createdAt: orderStatusHistory.createdAt,
        userName: users.fullName,
      })
      .from(orderStatusHistory)
      .leftJoin(users, eq(users.id, orderStatusHistory.changedBy))
      .where(eq(orderStatusHistory.orderId, order.id))
      .orderBy(asc(orderStatusHistory.createdAt)),
    db
      .select()
      .from(whatsappMessagesLog)
      .where(eq(whatsappMessagesLog.orderId, order.id))
      .orderBy(desc(whatsappMessagesLog.createdAt)),
  ]);
  return { order, items, history, messages };
}

/** Pedido para a página pública de confirmação (dados mínimos). */
export async function getPublicOrder(brandId: string, number: number) {
  const db = await getDb();
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.brandId, brandId), eq(orders.number, number), isNull(orders.deletedAt)));
  if (!order) return null;
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  return { order, items };
}
