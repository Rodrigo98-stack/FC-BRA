import { describe, expect, it, beforeAll } from "vitest";
import { sql } from "drizzle-orm";
import { freshDb } from "./setup-db";

describe("fluxo de pedido (§39)", () => {
  beforeAll(async () => {
    await freshDb(true);
  }, 180_000);

  it("seed DEMO cria dados marcados", async () => {
    const { getDb, rowsOf } = await import("@/server/db");
    const db = await getDb();
    const r = rowsOf<{ p: number; o: number; nd: number }>(
      await db.execute(sql`select (select count(*) from products)::int as p, (select count(*) from orders)::int as o,
        (select count(*) from products where not is_demo)::int as nd`),
    )[0];
    expect(r.p).toBeGreaterThan(10);
    expect(r.o).toBeGreaterThan(10);
    expect(r.nd).toBe(0);
  });

  it("cria pedido, baixa estoque na confirmação, lança receita e estorna no cancelamento", async () => {
    const { getDb, rowsOf, schema } = await import("@/server/db");
    const { createOrder, changeOrderStatus } = await import("@/server/services/orders");
    const db = await getDb();
    const [brand] = await db.select().from(schema.brands).where(sql`slug = 'bravus'`);
    const variant = rowsOf<{ id: string; qty: number; price: string }>(
      await db.execute(sql`select v.id, i.quantity as qty, coalesce(v.price_override, p.promo_price, p.sale_price) as price
        from product_variants v join products p on p.id = v.product_id join inventory i on i.variant_id = v.id
        where v.brand_id = ${brand.id} and i.quantity >= 3 limit 1`),
    )[0];
    const order = await createOrder(
      {
        brandId: brand.id,
        items: [{ variantId: variant.id, quantity: 2 }],
        customer: { name: "Teste", phone: "(81) 99999-0000", whatsapp: null, email: null, address: "Rua A", city: "Recife", state: "PE", zip: "50000-000", notes: null },
        whatsappOptIn: true,
        idempotencyKey: "teste-123456",
      },
      { source: "loja" },
    );
    expect(order.total).toBeCloseTo(Number(variant.price) * 2, 2);
    expect(order.message).toContain("Gostaria de realizar um pedido");
    expect(order.message).toContain("Quantidade: 2");
    expect(order.message).toContain("Entrega: Rua A, Recife - PE");

    // idempotência
    const again = await createOrder(
      {
        brandId: brand.id,
        items: [{ variantId: variant.id, quantity: 2 }],
        customer: { name: "Teste", phone: "(81) 99999-0000", whatsapp: null, email: null, address: null, city: null, state: null, zip: null, notes: null },
        whatsappOptIn: false,
        idempotencyKey: "teste-123456",
      },
      { source: "loja" },
    );
    expect(again.id).toBe(order.id);
    expect(again.duplicate).toBe(true);

    const stockOf = async () =>
      Number(rowsOf<{ q: number }>(await (await getDb()).execute(sql`select quantity as q from inventory where variant_id = ${variant.id}`))[0].q);
    expect(await stockOf()).toBe(variant.qty); // ainda não confirmado

    const [actorRow] = await db.select().from(schema.users).limit(1);
    const actor = { id: actorRow.id, fullName: actorRow.fullName, email: actorRow.email };
    await changeOrderStatus(order.id, "aguardando_pagamento", { actor });
    expect(await stockOf()).toBe(variant.qty - 2);
    await changeOrderStatus(order.id, "pago", { actor });
    const fin = rowsOf<{ s: number }>(await (await getDb()).execute(sql`select sum(amount)::float as s from financial_entries where order_id = ${order.id}`))[0];
    expect(fin.s).toBeCloseTo(order.total, 2);

    await changeOrderStatus(order.id, "cancelado", { actor, note: "teste" });
    expect(await stockOf()).toBe(variant.qty);
    const fin2 = rowsOf<{ s: number }>(await (await getDb()).execute(sql`select sum(amount)::float as s from financial_entries where order_id = ${order.id}`))[0];
    expect(fin2.s).toBeCloseTo(0, 2);
    await expect(changeOrderStatus(order.id, "pago", { actor })).rejects.toThrow();
  });

  it("retirada na loja: sem frete, endereço da loja no pedido e cadastro do cliente intacto", async () => {
    const { getDb, rowsOf, schema } = await import("@/server/db");
    const { createOrder } = await import("@/server/services/orders");
    const db = await getDb();
    const [fina] = await db.select().from(schema.brands).where(sql`slug = 'fina-classica'`);
    const variant = rowsOf<{ id: string }>(
      await db.execute(sql`select v.id from product_variants v join inventory i on i.variant_id = v.id
        where v.brand_id = ${fina.id} and i.quantity >= 2 limit 1`),
    )[0];
    const base = { name: "Cliente Retirada", phone: "(81) 97777-0000", whatsapp: null, email: null, zip: null, notes: null };
    await createOrder(
      { brandId: fina.id, items: [{ variantId: variant.id, quantity: 1 }], customer: { ...base, address: "Rua do Cliente, 1", city: "Recife", state: "PE" } },
      { source: "loja" },
    );
    const pickup = await createOrder(
      {
        brandId: fina.id,
        items: [{ variantId: variant.id, quantity: 1 }],
        customer: { ...base, address: "não deve ser usado", city: "Olinda", state: "PE" },
        delivery: "retirada",
      },
      { source: "loja" },
    );
    const [row] = await db.select().from(schema.orders).where(sql`id = ${pickup.id}`);
    expect(row.address).toBe("Retirada na loja: Rua Desembargador Oscar Coutinho, 15");
    expect(row.city).toBeNull();
    expect(Number(row.shipping)).toBe(0);
    expect(row.shippingLabel).toMatch(/Retirada na loja/);
    expect(pickup.message).toContain("Entrega: Retirada na loja: Rua Desembargador Oscar Coutinho, 15");
    const [cust] = await db.select().from(schema.customers).where(sql`phone_normalized = '5581977770000'`);
    expect(cust.address).toBe("Rua do Cliente, 1");
    expect(cust.city).toBe("Recife");
  });

  it("não deixa misturar marcas nem vender acima do estoque", async () => {
    const { getDb, rowsOf, schema } = await import("@/server/db");
    const { createOrder } = await import("@/server/services/orders");
    const db = await getDb();
    const [fina] = await db.select().from(schema.brands).where(sql`slug = 'fina-classica'`);
    const bravusVariant = rowsOf<{ id: string }>(
      await db.execute(sql`select v.id from product_variants v join brands b on b.id = v.brand_id where b.slug = 'bravus' limit 1`),
    )[0];
    const customer = { name: "X", phone: "(81) 98888-0000", whatsapp: null, email: null, address: null, city: null, state: null, zip: null, notes: null };
    await expect(
      createOrder({ brandId: fina.id, items: [{ variantId: bravusVariant.id, quantity: 1 }], customer, whatsappOptIn: false }, { source: "loja" }),
    ).rejects.toThrow(/outra loja/);
    const finaVariant = rowsOf<{ id: string; q: number }>(
      await db.execute(sql`select v.id, i.quantity as q from product_variants v join inventory i on i.variant_id = v.id where v.brand_id = ${fina.id} limit 1`),
    )[0];
    await expect(
      createOrder({ brandId: fina.id, items: [{ variantId: finaVariant.id, quantity: finaVariant.q + 1 }], customer, whatsappOptIn: false }, { source: "loja" }),
    ).rejects.toThrow(/Estoque insuficiente|esgotado/);
  });
});
