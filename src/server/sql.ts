import { sql, type SQL } from "drizzle-orm";
import { SALE_STATUSES } from "@/lib/domain";

export function uuidList(ids: string[]): SQL {
  return sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
}

/**
 * Filtro de marca para SQL bruto. `scope` vem do RBAC; `selected` é a marca
 * escolhida no seletor do painel (opcional). `includeGlobal` inclui linhas
 * sem marca (brand_id NULL).
 */
export function brandSql(column: SQL, scope: "all" | string[], selected?: string | null, includeGlobal = false): SQL {
  const globalPart = includeGlobal ? sql` or ${column} is null` : sql``;
  if (selected) {
    if (scope !== "all" && !scope.includes(selected)) return sql`false`;
    return sql`(${column} = ${selected}::uuid${globalPart})`;
  }
  if (scope === "all") return sql`true`;
  if (!scope.length) return includeGlobal ? sql`(${column} is null)` : sql`false`;
  return sql`(${column} in (${uuidList(scope)})${globalPart})`;
}

export const SALE_STATUS_LIST = sql.raw(`(${SALE_STATUSES.map((s) => `'${s}'`).join(", ")})`);

export function likeTerm(q: string): string {
  return `%${q.trim().slice(0, 100).replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}
