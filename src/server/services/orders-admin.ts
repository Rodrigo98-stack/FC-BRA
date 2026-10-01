/** Consultas e ações de pedidos usadas no painel. */
import { eq, sql } from "drizzle-orm";
import { getDb, rowsOf, schema, write } from "../db";
import { brandSql, likeTerm } from "../sql";
import { AppError, notFound } from "../errors";
import { audit } from "../audit";
import { assertCan } from "../rbac";
import type { AuthContext } from "../auth/session";
import { getTemplate, logMessage, getDriver, money, renderTemplate, waLink } from "./whatsapp";
import { getBrandById } from "./brands";
import { formatDate, orderCode } from "@/lib/format";
import { normalizePhone } from "@/lib/text";
import type { ResolvedPeriod } from "@/lib/period";
import type { TemplateKey } from "@/lib/domain";

export type OrderListRow = {
  id: string;
  number: number;
  prefix: string;
  brand_id: string;
  customer_name: string;
  customer_phone: string;
  total: string;
  status: string;
  source: string;
  delivery_method: string;
  payment_method: string | null;
  is_demo: boolean;
  created_at: string;
  items: number;
  total_count: number;
};

export async function listOrders(f: {
  scope: "all" | string[];
  brandId?: string | null;
  status?: string | null;
  statuses?: string[];
  q?: string | null;
  source?: string | null;
  period?: ResolvedPeriod | null;
  page?: number;
  perPage?: number;
}) {
  const db = await getDb();
  const perPage = f.perPage ?? 25;
  const page = Math.max(f.page ?? 1, 1);
  const conds = [sql`o.deleted_at is null`, brandSql(sql`o.brand_id`, f.scope, f.brandId)];
  if (f.status) conds.push(sql`o.status = ${f.status}`);
  if (f.statuses?.length) conds.push(sql`o.status in (${sql.join(f.statuses.map((s) => sql`${s}`), sql`, `)})`);
  if (f.source) conds.push(sql`o.source = ${f.source}`);
  if (f.period) conds.push(sql`o.created_at >= ${f.period.from.toISOString()} and o.created_at < ${f.period.to.toISOString()}`);
  if (f.q) {
    const t = likeTerm(f.q);
    const digits = f.q.replace(/\D/g, "");
    conds.push(
      sql`(o.customer_name ilike ${t} or o.customer_phone ilike ${t} ${digits ? sql`or o.number = ${Number(digits.slice(-12))} or regexp_replace(o.customer_phone, '\\D', '', 'g') like ${`%${digits}%`}` : sql``})`,
    );
  }
  const rows = rowsOf<OrderListRow>(
    await db.execute(sql`
      select o.id, o.number, b.order_prefix as prefix, o.brand_id, o.customer_name, o.customer_phone, o.total, o.status, o.source,
             o.delivery_method, o.payment_method, o.is_demo, o.created_at,
             (select coalesce(sum(quantity), 0) from public.order_items oi where oi.order_id = o.id)::int as items,
             count(*) over()::int as total_count
      from public.orders o join public.brands b on b.id = o.brand_id
      where ${sql.join(conds, sql` and `)}
      order by o.created_at desc
      limit ${perPage} offset ${(page - 1) * perPage}`),
  );
  const total = Number(rows[0]?.total_count ?? 0);
  return { rows, total, page, perPage, pages: Math.max(1, Math.ceil(total / perPage)) };
}

export async function salesSummary(period: ResolvedPeriod, scope: "all" | string[], brandId?: string | null) {
  const db = await getDb();
  const r = rowsOf<{ revenue: number; orders: number; units: number; discount: number; shipping: number }>(
    await db.execute(sql`
      select coalesce(sum(o.total), 0)::float as revenue, count(*)::int as orders,
             coalesce(sum((select sum(quantity) from public.order_items oi where oi.order_id = o.id)), 0)::int as units,
             coalesce(sum(o.discount), 0)::float as discount, coalesce(sum(o.shipping), 0)::float as shipping
      from public.orders o
      where o.deleted_at is null and o.status in ('pago', 'em_preparacao', 'enviado', 'entregue')
        and o.created_at >= ${period.from.toISOString()} and o.created_at < ${period.to.toISOString()}
        and ${brandSql(sql`o.brand_id`, scope, brandId)}`),
  )[0];
  return {
    revenue: Number(r?.revenue ?? 0),
    orders: Number(r?.orders ?? 0),
    units: Number(r?.units ?? 0),
    discount: Number(r?.discount ?? 0),
    shipping: Number(r?.shipping ?? 0),
    ticket: r?.orders ? Number(r.revenue) / Number(r.orders) : null,
  };
}

export async function updateOrderInfo(auth: AuthContext, orderId: string, input: { paymentMethod: string | null; notes: string | null }) {
  await write(async (tx) => {
    const [order] = await tx.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    if (!order || order.deletedAt) throw notFound("Pedido não encontrado.");
    assertCan(auth.perms, "pedidos", "editar", order.brandId);
    await tx
      .update(schema.orders)
      .set({ paymentMethod: input.paymentMethod, notes: input.notes, updatedBy: auth.user.id })
      .where(eq(schema.orders.id, orderId));
    await audit(tx, { id: auth.user.id, fullName: auth.user.fullName, email: auth.user.email }, {
      action: "pedido.editar",
      entity: "orders",
      entityId: orderId,
      brandId: order.brandId,
      before: { pagamento: order.paymentMethod, observacoes: order.notes },
      after: { pagamento: input.paymentMethod, observacoes: input.notes },
    });
  });
}

/**
 * Gera (e envia, se a API estiver configurada e houver opt-in) uma mensagem
 * de WhatsApp para o cliente do pedido a partir de um modelo.
 */
export async function sendOrderMessage(auth: AuthContext, orderId: string, templateKey: TemplateKey, via: "link" | "api") {
  return write(async (tx) => {
    const [order] = await tx.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    if (!order || order.deletedAt) throw notFound("Pedido não encontrado.");
    assertCan(auth.perms, "pedidos", "editar", order.brandId);
    const brand = await getBrandById(order.brandId);
    const tpl = await getTemplate(tx, order.brandId, templateKey);
    if (!tpl) throw new AppError("Modelo de mensagem não encontrado ou desativado.");
    const items = await tx.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, order.id));
    const code = orderCode(brand?.orderPrefix, order.number);
    const body = renderTemplate(tpl.body, {
      nome: order.customerName.split(" ")[0],
      pedido: code,
      valor: money(order.total),
      marca: brand?.name ?? "",
      data: formatDate(new Date()),
      produto: items.map((i) => i.productName).join(", "),
      link: null,
    });
    const to = order.customerWhatsapp ?? normalizePhone(order.customerPhone);
    let result: { method: "link" | "api"; status: "gerado" | "enviado" | "falhou"; url: string | null; providerMessageId?: string | null; error?: string | null } = {
      method: "link",
      status: "gerado",
      url: waLink(to, body),
    };
    if (via === "api") {
      const driver = await getDriver(order.brandId);
      if (driver.kind !== "api") throw new AppError("A API do WhatsApp não está configurada para esta marca. Use o link.");
      if (order.customerId) {
        const [c] = await tx.select().from(schema.customers).where(eq(schema.customers.id, order.customerId));
        if (!c?.whatsappOptIn) throw new AppError("O cliente não autorizou mensagens (opt-in). Envie pelo link.");
      }
      result = await driver.send(to, body);
    }
    await logMessage(tx, {
      brandId: order.brandId,
      orderId: order.id,
      customerId: order.customerId,
      toNumber: to,
      templateKey,
      body,
      result,
      createdBy: auth.user.id,
    });
    await audit(tx, { id: auth.user.id, fullName: auth.user.fullName, email: auth.user.email }, {
      action: "whatsapp.mensagem",
      entity: "orders",
      entityId: order.id,
      brandId: order.brandId,
      after: { modelo: templateKey, canal: result.method, status: result.status },
    });
    return { url: result.url, status: result.status, method: result.method, error: result.error ?? null, body };
  });
}

/** Variações para o formulário de pedido manual (marca obrigatória). */
export async function searchVariantsForOrder(brandId: string, q: string) {
  const db = await getDb();
  const t = likeTerm(q);
  return rowsOf<{
    id: string;
    product_name: string;
    sku: string;
    size: string | null;
    color: string | null;
    price: string;
    stock: number;
  }>(
    await db.execute(sql`
      select v.id, p.name as product_name, v.sku, v.size, v.color,
             coalesce(v.price_override, p.promo_price, p.sale_price) as price,
             coalesce((select sum(i.quantity) from public.inventory i where i.variant_id = v.id), 0)::int as stock
      from public.product_variants v join public.products p on p.id = v.product_id
      where p.brand_id = ${brandId} and p.deleted_at is null and v.deleted_at is null and v.is_active
        and (p.name ilike ${t} or v.sku ilike ${t} or p.sku ilike ${t})
      order by p.name, v.sort_order limit 25`),
  );
}
