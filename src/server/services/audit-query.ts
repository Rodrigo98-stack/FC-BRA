import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "../db";
import { brandSql, likeTerm } from "../sql";
import type { ResolvedPeriod } from "@/lib/period";

export async function listAuditLogs(f: {
  scope: "all" | string[];
  brandId?: string | null;
  userId?: string | null;
  entity?: string | null;
  q?: string | null;
  period?: ResolvedPeriod | null;
  page?: number;
  perPage?: number;
}) {
  const db = await getDb();
  const perPage = f.perPage ?? 40;
  const page = Math.max(f.page ?? 1, 1);
  const conds = [brandSql(sql`a.brand_id`, f.scope, f.brandId, true)];
  if (f.userId) conds.push(sql`(a.actor_user_id = ${f.userId} or a.entity_id = ${f.userId})`);
  if (f.entity) conds.push(sql`a.entity = ${f.entity}`);
  if (f.period) conds.push(sql`a.created_at >= ${f.period.from.toISOString()} and a.created_at < ${f.period.to.toISOString()}`);
  if (f.q) {
    const t = likeTerm(f.q);
    conds.push(sql`(a.action ilike ${t} or coalesce(a.actor_name, '') ilike ${t} or coalesce(a.reason, '') ilike ${t} or coalesce(a.entity_id, '') ilike ${t})`);
  }
  const rows = rowsOf<{
    id: string;
    actor_user_id: string | null;
    actor_name: string | null;
    actor_email: string | null;
    action: string;
    entity: string;
    entity_id: string | null;
    brand_id: string | null;
    before: unknown;
    after: unknown;
    reason: string | null;
    ip: string | null;
    created_at: string;
    total: number;
  }>(
    await db.execute(sql`
      select a.*, count(*) over()::int as total from public.audit_logs a
      where ${sql.join(conds, sql` and `)}
      order by a.created_at desc
      limit ${perPage} offset ${(page - 1) * perPage}`),
  );
  const total = Number(rows[0]?.total ?? 0);
  const entities = rowsOf<{ entity: string }>(await db.execute(sql`select distinct entity from public.audit_logs order by 1`)).map((r) => r.entity);
  return { rows, total, page, perPage, pages: Math.max(1, Math.ceil(total / perPage)), entities };
}
