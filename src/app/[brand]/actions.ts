"use server";
/**
 * Ações da loja: cotação do carrinho (preços/estoque atuais vindos do banco)
 * e finalização do pedido. Nenhum preço enviado pelo navegador é usado.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/server/db";
import { getBrandBySlug } from "@/server/services/brands";
import { getBrandCms } from "@/server/services/cms";
import { variantStock } from "@/server/services/inventory";
import { createOrder } from "@/server/services/orders";
import { runAction, type ActionResult } from "@/server/action";
import { rateLimit } from "@/server/rate-limit";
import { getRequestMeta } from "@/server/request";
import { signValue } from "@/server/secret";
import { AppError } from "@/server/errors";
import { computeShipping } from "@/lib/shipping";
import { toNumber } from "@/lib/format";

const itemsSchema = z.array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1).max(99) })).max(50);

export type QuoteLine = {
  variantId: string;
  available: boolean;
  stock: number;
  price: number;
  name: string;
  size: string | null;
  color: string | null;
};
export type Quote = {
  lines: QuoteLine[];
  subtotal: number;
  shipping: { amount: number; label: string; known: boolean };
  total: number;
  shippingNotes: string | null;
};

export async function quoteCart(brandSlug: string, rawItems: unknown): Promise<ActionResult<Quote>> {
  return runAction(async () => {
    const items = itemsSchema.parse(rawItems);
    const brand = await getBrandBySlug(brandSlug);
    if (!brand) throw new AppError("Loja não encontrada.");
    const db = await getDb();
    const ids = items.map((i) => i.variantId);
    const rows = ids.length
      ? await db
          .select({
            id: schema.productVariants.id,
            brandId: schema.productVariants.brandId,
            size: schema.productVariants.size,
            color: schema.productVariants.color,
            priceOverride: schema.productVariants.priceOverride,
            active: schema.productVariants.isActive,
            name: schema.products.name,
            status: schema.products.status,
            salePrice: schema.products.salePrice,
            promoPrice: schema.products.promoPrice,
          })
          .from(schema.productVariants)
          .innerJoin(schema.products, eq(schema.products.id, schema.productVariants.productId))
          .where(and(inArray(schema.productVariants.id, ids), isNull(schema.productVariants.deletedAt), isNull(schema.products.deletedAt)))
      : [];
    const stock = ids.length ? await db.transaction((tx) => variantStock(tx, ids)) : new Map<string, number>();
    const lines: QuoteLine[] = items.map((it) => {
      const r = rows.find((x) => x.id === it.variantId);
      const ok = !!r && r.brandId === brand.id && r.status === "ativo" && r.active;
      const s = stock.get(it.variantId) ?? 0;
      const price = r ? toNumber(r.priceOverride ?? r.promoPrice ?? r.salePrice) : 0;
      return {
        variantId: it.variantId,
        available: ok && s >= it.quantity,
        stock: ok ? s : 0,
        price,
        name: r?.name ?? "Produto indisponível",
        size: r?.size ?? null,
        color: r?.color ?? null,
      };
    });
    const subtotal = lines.reduce((a, l, i) => a + (l.available ? l.price * items[i].quantity : 0), 0);
    const cms = await getBrandCms(brand.id);
    const shipping = computeShipping(cms.shipping, subtotal);
    return {
      ok: true,
      data: { lines, subtotal, shipping, total: subtotal + shipping.amount, shippingNotes: cms.shipping.notes },
    };
  });
}

export type PlacedOrder = { code: string; redirectTo: string; whatsappUrl: string | null };

export async function placeOrder(brandSlug: string, payload: unknown): Promise<ActionResult<PlacedOrder>> {
  return runAction(async () => {
    const brand = await getBrandBySlug(brandSlug);
    if (!brand) throw new AppError("Loja não encontrada.");
    const meta = await getRequestMeta();
    await rateLimit(`checkout:${meta.ip ?? "anon"}`, 8, 600);

    const p = z
      .object({
        items: itemsSchema.min(1, "O carrinho está vazio."),
        customer: z.record(z.string(), z.unknown()),
        whatsappOptIn: z.boolean(),
        idempotencyKey: z.string().min(8).max(100),
        visitorId: z.string().max(80).nullable().optional(),
      })
      .parse(payload);

    const c = p.customer as Record<string, string | null | undefined>;
    const missing: Record<string, string> = {};
    for (const [key, label] of [
      ["name", "Nome"],
      ["phone", "Telefone"],
      ["address", "Endereço"],
      ["city", "Cidade"],
      ["state", "Estado"],
      ["zip", "CEP"],
    ] as const) {
      if (!c[key] || !String(c[key]).trim()) missing[key] = `${label} é obrigatório.`;
    }
    if (Object.keys(missing).length) throw new AppError("Preencha os campos obrigatórios.", "app_error", missing);

    const order = await createOrder(
      {
        brandId: brand.id,
        items: p.items,
        customer: {
          name: c.name ?? "",
          phone: c.phone ?? "",
          whatsapp: c.whatsapp ?? null,
          email: c.email ?? null,
          address: c.address ?? null,
          city: c.city ?? null,
          state: c.state ?? null,
          zip: c.zip ?? null,
          notes: c.notes ?? null,
        },
        whatsappOptIn: p.whatsappOptIn,
        idempotencyKey: p.idempotencyKey,
        visitorId: p.visitorId ?? null,
      },
      { source: "loja" },
    );
    const sig = await signValue(order.id);
    return {
      ok: true,
      data: {
        code: order.code,
        redirectTo: `/${brand.slug}/pedido/${order.number}?t=${sig}`,
        whatsappUrl: order.whatsappUrl,
      },
    };
  });
}
