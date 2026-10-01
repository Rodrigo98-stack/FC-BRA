/**
 * Clientes / CRM (§11). Métricas calculadas a partir dos pedidos
 * (somente vendas efetivas) e respeitando o escopo de marca do usuário.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb, rowsOf, schema } from "../db";
import { brandSql, likeTerm, SALE_STATUS_LIST } from "../sql";

type Scope = "all" | string[];

export type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  whatsapp_opt_in: boolean;
  is_demo: boolean;
  created_at: string;
  orders_count: number;
  total_spent: number;
  last_purchase: string | null;
  avg_ticket: number | null;
  preferred_brand: string | null;
  total: number;
};

export async function listCustomers(f: {
  scope: Scope;
  brandId?: string | null;
  q?: string | null;
  sort?: "recentes" | "valor" | "compras" | "nome";
  page?: number;
  perPage?: number;
}) {
  const db = await getDb();
  const perPage = f.perPage ?? 25;
  const page = Math.max(f.page ?? 1, 1);
  const orderBrand = brandSql(sql`o.brand_id`, f.scope, f.brandId);
  const conds = [sql`c.deleted_at is null`];
  if (f.q) {
    const t = likeTerm(f.q);
    conds.push(sql`(c.name ilike ${t} or coalesce(c.phone, '') ilike ${t} or coalesce(c.email, '') ilike ${t} or coalesce(c.city, '') ilike ${t})`);
  }
  // Usuário restrito a uma marca só enxerga clientes daquela marca (ou sem pedidos ainda).
  if (f.scope !== "all" || f.brandId) {
    conds.push(sql`(exists (select 1 from public.orders o where o.customer_id = c.id and o.deleted_at is null and ${orderBrand})
                   or not exists (select 1 from public.orders o where o.customer_id = c.id))`);
  }
  const order = (() => {
    switch (f.sort) {
      case "valor":
        return sql`total_spent desc, c.name`;
      case "compras":
        return sql`orders_count desc, c.name`;
      case "nome":
        return sql`c.name`;
      default:
        return sql`coalesce(m.last_purchase, c.created_at) desc`;
    }
  })();
  const rows = rowsOf<CustomerRow>(
    await db.execute(sql`
      with m as (
        select o.customer_id,
               count(*)::int as orders_count,
               sum(o.total)::float as total_spent,
               max(o.created_at) as last_purchase
        from public.orders o
        where o.deleted_at is null and o.status in ${SALE_STATUS_LIST} and ${orderBrand}
        group by o.customer_id
      ), pref as (
        select distinct on (o.customer_id) o.customer_id, b.name as preferred_brand
        from public.orders o join public.brands b on b.id = o.brand_id
        where o.deleted_at is null and o.status in ${SALE_STATUS_LIST} and ${orderBrand}
        group by o.customer_id, b.name
        order by o.customer_id, sum(o.total) desc
      )
      select c.id, c.name, c.phone, c.whatsapp, c.email, c.city, c.state, c.whatsapp_opt_in, c.is_demo, c.created_at,
             coalesce(m.orders_count, 0) as orders_count, coalesce(m.total_spent, 0) as total_spent, m.last_purchase,
             case when m.orders_count > 0 then m.total_spent / m.orders_count end as avg_ticket,
             pref.preferred_brand, count(*) over()::int as total
      from public.customers c
      left join m on m.customer_id = c.id
      left join pref on pref.customer_id = c.id
      where ${sql.join(conds, sql` and `)}
      order by ${order}
      limit ${perPage} offset ${(page - 1) * perPage}`),
  );
  const total = Number(rows[0]?.total ?? 0);
  return { rows, total, page, perPage, pages: Math.max(1, Math.ceil(total / perPage)) };
}

export async function getCustomerDetail(customerId: string, scope: Scope) {
  const db = await getDb();
  const [customer] = await db
    .select()
    .from(schema.customers)
    .where(and(eq(schema.customers.id, customerId), isNull(schema.customers.deletedAt)));
  if (!customer) return null;
  const orders = rowsOf<{
    id: string;
    number: number;
    brand_id: string;
    status: string;
    total: string;
    created_at: string;
    items: number;
  }>(
    await db.execute(sql`
      select o.id, o.number, o.brand_id, o.status, o.total, o.created_at,
             (select coalesce(sum(quantity), 0) from public.order_items oi where oi.order_id = o.id)::int as items
      from public.orders o
      where o.customer_id = ${customerId} and o.deleted_at is null and ${brandSql(sql`o.brand_id`, scope)}
      order by o.created_at desc limit 200`),
  );
  const sales = orders.filter((o) =>
    ["pago", "em_preparacao", "enviado", "entregue"].includes(o.status),
  );
  const totalSpent = sales.reduce((a, o) => a + Number(o.total), 0);
  const byBrand = new Map<string, number>();
  for (const o of sales) byBrand.set(o.brand_id, (byBrand.get(o.brand_id) ?? 0) + Number(o.total));
  const preferredBrandId = [...byBrand.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    customer,
    orders,
    metrics: {
      ordersCount: sales.length,
      totalSpent,
      lastPurchase: sales[0]?.created_at ?? null,
      avgTicket: sales.length ? totalSpent / sales.length : null,
      preferredBrandId,
    },
  };
}

export async function customerOptions(q: string) {
  const db = await getDb();
  const t = likeTerm(q);
  return rowsOf<{ id: string; name: string; phone: string | null }>(
    await db.execute(sql`select id, name, phone from public.customers where deleted_at is null
      and (name ilike ${t} or coalesce(phone, '') ilike ${t}) order by name limit 20`),
  );
}

