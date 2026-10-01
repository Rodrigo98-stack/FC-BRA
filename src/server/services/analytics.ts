/**
 * Analytics próprio (§31): eventos anônimos por marca, sem cookies de
 * terceiros. Funil: visitantes → produto → carrinho → checkout → pedido →
 * compra confirmada, com taxa de conversão por etapa.
 */
import { sql } from "drizzle-orm";
import { getDb, rowsOf, schema, write, type Executor } from "../db";
import { FUNNEL_STEPS, type EventType } from "@/lib/domain";

export async function recordEvent(
  db: Executor,
  e: {
    brandId: string | null;
    type: EventType;
    visitorId?: string | null;
    productId?: string | null;
    orderId?: string | null;
    value?: number | null;
    path?: string | null;
    isDemo?: boolean;
    createdAt?: Date;
  },
) {
  await db.insert(schema.analyticsEvents).values({
    brandId: e.brandId,
    type: e.type,
    visitorId: e.visitorId ?? null,
    productId: e.productId ?? null,
    orderId: e.orderId ?? null,
    value: e.value === null || e.value === undefined ? null : e.value.toFixed(2),
    path: e.path?.slice(0, 300) ?? null,
    isDemo: e.isDemo ?? false,
    ...(e.createdAt ? { createdAt: e.createdAt } : {}),
  });
}

/** Evento vindo do navegador (sem persistência imediata do snapshot no modo demo). */
export async function trackPublicEvent(e: Parameters<typeof recordEvent>[1]) {
  await write((tx) => recordEvent(tx, e), { persist: false });
}

export type Period = { from: Date; to: Date };

export async function getFunnel(period: Period, brandIds: "all" | string[]) {
  const db = await getDb();
  const brandCond =
    brandIds === "all"
      ? sql`true`
      : brandIds.length
        ? sql`brand_id in (${sql.join(brandIds.map((b) => sql`${b}::uuid`), sql`, `)})`
        : sql`false`;
  const res = await db.execute(sql`
    select brand_id, type,
           count(distinct coalesce(visitor_id, id::text))::int as visitors,
           count(*)::int as events,
           coalesce(sum(value), 0)::float as value
    from public.analytics_events
    where created_at >= ${period.from.toISOString()} and created_at < ${period.to.toISOString()} and ${brandCond}
    group by brand_id, type`);
  const rows = rowsOf<{ brand_id: string | null; type: EventType; visitors: number; events: number; value: number }>(res);

  const build = (filter: (r: (typeof rows)[number]) => boolean) => {
    const steps = FUNNEL_STEPS.map((s) => {
      const matching = rows.filter((r) => r.type === s.type && filter(r));
      // Pedidos e compras contam eventos; navegação conta visitantes únicos.
      const count =
        s.type === "order_created" || s.type === "purchase_confirmed"
          ? matching.reduce((a, r) => a + Number(r.events), 0)
          : matching.reduce((a, r) => a + Number(r.visitors), 0);
      return { ...s, count };
    });
    return steps.map((s, i) => ({
      ...s,
      rateFromPrevious: i === 0 || !steps[i - 1].count ? null : (s.count / steps[i - 1].count) * 100,
      rateFromStart: !steps[0].count ? null : (s.count / steps[0].count) * 100,
    }));
  };

  const brandsInData = [...new Set(rows.map((r) => r.brand_id).filter((b): b is string => !!b))];
  return {
    total: build(() => true),
    byBrand: Object.fromEntries(brandsInData.map((b) => [b, build((r) => r.brand_id === b)])),
    revenue: rows.filter((r) => r.type === "purchase_confirmed").reduce((a, r) => a + Number(r.value), 0),
  };
}

export async function getTopViewedProducts(period: Period, brandIds: "all" | string[], limit = 10) {
  const db = await getDb();
  const brandCond =
    brandIds === "all"
      ? sql`true`
      : brandIds.length
        ? sql`e.brand_id in (${sql.join(brandIds.map((b) => sql`${b}::uuid`), sql`, `)})`
        : sql`false`;
  const res = await db.execute(sql`
    select p.id, p.name, p.brand_id, count(*)::int as views,
           count(distinct e.visitor_id)::int as visitors
    from public.analytics_events e
    join public.products p on p.id = e.product_id
    where e.type = 'product_view' and e.created_at >= ${period.from.toISOString()} and e.created_at < ${period.to.toISOString()}
      and ${brandCond}
    group by p.id, p.name, p.brand_id
    order by views desc
    limit ${limit}`);
  return rowsOf<{ id: string; name: string; brand_id: string; views: number; visitors: number }>(res);
}
