/**
 * Dashboard principal (§12): KPIs, comparativo FINA × BRAVUS (tabela
 * objetiva, sem rankings opinativos), alertas de estoque (§14) e feed de
 * atividades (§36). Somente dados cadastrados — nada estimado.
 */
import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "../db";
import { brandSql, SALE_STATUS_LIST } from "../sql";
import { resolvePeriod, type ResolvedPeriod } from "@/lib/period";

type Scope = "all" | string[];

async function salesIn(period: ResolvedPeriod, scope: Scope, brandId?: string | null) {
  const db = await getDb();
  const res = await db.execute(sql`
    select coalesce(sum(o.total), 0)::float as revenue, count(*)::int as orders
    from public.orders o
    where o.deleted_at is null and o.status in ${SALE_STATUS_LIST}
      and o.created_at >= ${period.from.toISOString()} and o.created_at < ${period.to.toISOString()}
      and ${brandSql(sql`o.brand_id`, scope, brandId)}`);
  const r = rowsOf<{ revenue: number; orders: number }>(res)[0];
  return { revenue: Number(r?.revenue ?? 0), orders: Number(r?.orders ?? 0) };
}

export async function getSalesKpis(scope: Scope, brandId?: string | null) {
  const keys = ["hoje", "ontem", "semana", "mes", "ano"] as const;
  const out = await Promise.all(keys.map(async (k) => [k, await salesIn(resolvePeriod(k), scope, brandId)] as const));
  return Object.fromEntries(out) as Record<(typeof keys)[number], { revenue: number; orders: number }>;
}

export async function getOrderKpis(period: ResolvedPeriod, scope: Scope, brandId?: string | null) {
  const db = await getDb();
  const res = await db.execute(sql`
    select
      count(*) filter (where o.status <> 'carrinho_abandonado')::int as total_orders,
      count(*) filter (where o.status in ${SALE_STATUS_LIST})::int as sale_orders,
      coalesce(sum(o.total) filter (where o.status in ${SALE_STATUS_LIST}), 0)::float as revenue,
      count(*) filter (where o.status in ('pedido_recebido', 'aguardando_confirmacao'))::int as pending,
      count(*) filter (where o.status = 'cancelado')::int as cancelled
    from public.orders o
    where o.deleted_at is null
      and o.created_at >= ${period.from.toISOString()} and o.created_at < ${period.to.toISOString()}
      and ${brandSql(sql`o.brand_id`, scope, brandId)}`);
  const r = rowsOf<{ total_orders: number; sale_orders: number; revenue: number; pending: number; cancelled: number }>(res)[0];
  const saleOrders = Number(r?.sale_orders ?? 0);
  const revenue = Number(r?.revenue ?? 0);
  return {
    totalOrders: Number(r?.total_orders ?? 0),
    saleOrders,
    revenue,
    averageTicket: saleOrders ? revenue / saleOrders : null,
    pending: Number(r?.pending ?? 0),
    cancelled: Number(r?.cancelled ?? 0),
  };
}

/** Pedidos aguardando ação em qualquer data (para o menu e o dashboard). */
export async function countOpenOrders(scope: Scope) {
  const db = await getDb();
  const res = await db.execute(sql`
    select count(*)::int as n from public.orders o
    where o.deleted_at is null and o.status in ('pedido_recebido', 'aguardando_confirmacao')
      and ${brandSql(sql`o.brand_id`, scope)}`);
  return Number(rowsOf<{ n: number }>(res)[0]?.n ?? 0);
}

export async function getProductRanking(period: ResolvedPeriod, scope: Scope, brandId?: string | null, limit = 5) {
  const db = await getDb();
  const res = await db.execute(sql`
    with sold as (
      select oi.product_id, sum(oi.quantity)::int as units, sum(oi.total)::float as revenue
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where o.deleted_at is null and o.status in ${SALE_STATUS_LIST}
        and o.created_at >= ${period.from.toISOString()} and o.created_at < ${period.to.toISOString()}
      group by oi.product_id
    )
    select p.id, p.name, p.sku, p.brand_id, coalesce(s.units, 0) as units, coalesce(s.revenue, 0) as revenue
    from public.products p
    left join sold s on s.product_id = p.id
    where p.deleted_at is null and p.status = 'ativo' and ${brandSql(sql`p.brand_id`, scope, brandId)}
    order by coalesce(s.units, 0) desc, p.name`);
  const rows = rowsOf<{ id: string; name: string; sku: string; brand_id: string; units: number; revenue: number }>(res).map(
    (r) => ({ ...r, units: Number(r.units), revenue: Number(r.revenue) }),
  );
  const withSales = rows.filter((r) => r.units > 0);
  return {
    best: withSales.slice(0, limit),
    worst: [...withSales].sort((a, b) => a.units - b.units).slice(0, limit),
    noSales: rows.filter((r) => r.units === 0).slice(0, limit),
    noSalesCount: rows.filter((r) => r.units === 0).length,
  };
}

export type StockAlert = {
  variantId: string;
  productId: string;
  brandId: string;
  name: string;
  size: string | null;
  color: string | null;
  sku: string;
  stock: number;
  minStock: number;
};

/** Estoque ≤ mínimo → ESTOQUE BAIXO; = 0 → PRODUTO ESGOTADO (§14). */
export async function getStockAlerts(scope: Scope, brandId?: string | null) {
  const db = await getDb();
  const res = await db.execute(sql`
    select v.id as variant_id, p.id as product_id, p.brand_id, p.name, v.size, v.color, v.sku,
           coalesce(sum(i.quantity), 0)::int as stock,
           greatest(v.min_stock, p.min_stock) as min_stock
    from public.product_variants v
    join public.products p on p.id = v.product_id
    left join public.inventory i on i.variant_id = v.id
    where v.deleted_at is null and v.is_active and p.deleted_at is null and p.status <> 'rascunho'
      and ${brandSql(sql`p.brand_id`, scope, brandId)}
    group by v.id, p.id
    having coalesce(sum(i.quantity), 0) <= greatest(v.min_stock, p.min_stock)
    order by stock asc, p.name`);
  const rows = rowsOf<{
    variant_id: string;
    product_id: string;
    brand_id: string;
    name: string;
    size: string | null;
    color: string | null;
    sku: string;
    stock: number;
    min_stock: number;
  }>(res).map(
    (r): StockAlert => ({
      variantId: r.variant_id,
      productId: r.product_id,
      brandId: r.brand_id,
      name: r.name,
      size: r.size,
      color: r.color,
      sku: r.sku,
      stock: Number(r.stock),
      minStock: Number(r.min_stock),
    }),
  );
  return { out: rows.filter((r) => r.stock === 0), low: rows.filter((r) => r.stock > 0) };
}

export async function countStockAlerts(scope: Scope) {
  const { out, low } = await getStockAlerts(scope);
  return out.length + low.length;
}

export async function getRecentProducts(scope: Scope, brandId?: string | null, limit = 5) {
  const db = await getDb();
  const res = await db.execute(sql`
    select p.id, p.name, p.sku, p.brand_id, p.status, p.created_at
    from public.products p
    where p.deleted_at is null and ${brandSql(sql`p.brand_id`, scope, brandId)}
    order by p.created_at desc limit ${limit}`);
  return rowsOf<{ id: string; name: string; sku: string; brand_id: string; status: string; created_at: string }>(res);
}

/** Comparativo FINA × BRAVUS (§12.2). */
export async function getBrandComparison(period: ResolvedPeriod, scope: Scope) {
  const db = await getDb();
  const res = await db.execute(sql`
    select b.id as brand_id, b.name,
      coalesce(sum(o.total) filter (where o.status in ${SALE_STATUS_LIST}), 0)::float as revenue,
      count(o.id) filter (where o.status in ${SALE_STATUS_LIST})::int as orders,
      coalesce((select sum(oi.quantity) from public.order_items oi join public.orders o2 on o2.id = oi.order_id
                where o2.brand_id = b.id and o2.deleted_at is null and o2.status in ${SALE_STATUS_LIST}
                  and o2.created_at >= ${period.from.toISOString()} and o2.created_at < ${period.to.toISOString()}), 0)::int as units
    from public.brands b
    left join public.orders o on o.brand_id = b.id and o.deleted_at is null
      and o.created_at >= ${period.from.toISOString()} and o.created_at < ${period.to.toISOString()}
    where ${brandSql(sql`b.id`, scope)}
    group by b.id, b.name, b.sort_order
    order by b.sort_order`);
  const rows = rowsOf<{ brand_id: string; name: string; revenue: number; orders: number; units: number }>(res).map((r) => ({
    brandId: r.brand_id,
    name: r.name,
    revenue: Number(r.revenue),
    orders: Number(r.orders),
    units: Number(r.units),
  }));
  const total = rows.reduce(
    (a, r) => ({ revenue: a.revenue + r.revenue, orders: a.orders + r.orders, units: a.units + r.units }),
    { revenue: 0, orders: 0, units: 0 },
  );
  return {
    rows: rows.map((r) => ({
      ...r,
      ticket: r.orders ? r.revenue / r.orders : null,
      share: total.revenue ? (r.revenue / total.revenue) * 100 : null,
    })),
    total: { ...total, ticket: total.orders ? total.revenue / total.orders : null, share: total.revenue ? 100 : null },
  };
}

/** Evolução diária do faturamento (para os dashboards individuais). */
export async function getDailyRevenue(period: ResolvedPeriod, scope: Scope, brandId?: string | null) {
  const db = await getDb();
  const res = await db.execute(sql`
    select to_char((o.created_at at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') as day,
           coalesce(sum(o.total), 0)::float as revenue, count(*)::int as orders
    from public.orders o
    where o.deleted_at is null and o.status in ${SALE_STATUS_LIST}
      and o.created_at >= ${period.from.toISOString()} and o.created_at < ${period.to.toISOString()}
      and ${brandSql(sql`o.brand_id`, scope, brandId)}
    group by 1 order by 1`);
  const map = new Map(rowsOf<{ day: string; revenue: number; orders: number }>(res).map((r) => [r.day, r]));
  const days: { day: string; revenue: number; orders: number }[] = [];
  const cursor = new Date(`${period.fromDate}T12:00:00Z`);
  const last = new Date(`${period.toDate}T12:00:00Z`);
  let guard = 0;
  while (cursor <= last && guard++ < 400) {
    const key = cursor.toISOString().slice(0, 10);
    const r = map.get(key);
    days.push({ day: key, revenue: Number(r?.revenue ?? 0), orders: Number(r?.orders ?? 0) });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export async function getCategoryBreakdown(period: ResolvedPeriod, scope: Scope, brandId?: string | null) {
  const db = await getDb();
  const res = await db.execute(sql`
    select coalesce(c.name, 'Sem categoria') as category, p.brand_id,
           sum(oi.quantity)::int as units, sum(oi.total)::float as revenue
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    left join public.products p on p.id = oi.product_id
    left join public.categories c on c.id = p.category_id
    where o.deleted_at is null and o.status in ${SALE_STATUS_LIST}
      and o.created_at >= ${period.from.toISOString()} and o.created_at < ${period.to.toISOString()}
      and ${brandSql(sql`o.brand_id`, scope, brandId)}
    group by 1, 2 order by revenue desc`);
  return rowsOf<{ category: string; brand_id: string; units: number; revenue: number }>(res).map((r) => ({
    ...r,
    units: Number(r.units),
    revenue: Number(r.revenue),
  }));
}

export async function getActivityFeed(limit = 12, brandScope: Scope = "all") {
  const db = await getDb();
  const res = await db.execute(sql`
    select a.id, a.actor_name, a.action, a.entity, a.entity_id, a.brand_id, a.created_at, a.after, a.reason
    from public.audit_logs a
    where ${brandSql(sql`a.brand_id`, brandScope, null, true)}
    order by a.created_at desc limit ${limit}`);
  return rowsOf<{
    id: string;
    actor_name: string | null;
    action: string;
    entity: string;
    entity_id: string | null;
    brand_id: string | null;
    created_at: string;
    after: unknown;
    reason: string | null;
  }>(res);
}
