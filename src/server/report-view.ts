/** Formatação e parâmetros compartilhados entre tela, impressão e exportação de relatórios. */
import { brandScope, can } from "./rbac";
import type { AuthContext } from "./auth/session";
import { getReport, runReport, type ReportColumn, type ReportDef } from "./services/reports";
import { resolvePeriod } from "@/lib/period";
import { formatBRL, formatDate, formatDateTime, formatNumber, formatPercent } from "@/lib/format";
import { MOVEMENT_LABELS, ORDER_STATUS_LABELS, ENTRY_KIND_LABELS, EXPENSE_CATEGORY_LABELS } from "@/lib/domain";
import type { Brand } from "./db/schema";

export type ReportQuery = Record<string, string | undefined>;

export function reportAccess(auth: AuthContext, def: ReportDef) {
  return {
    view: can(auth.perms, "relatorios", "visualizar") && can(auth.perms, def.module, "visualizar"),
    export: can(auth.perms, "relatorios", "exportar") && can(auth.perms, def.module, "visualizar"),
  };
}

export async function loadReport(auth: AuthContext, slug: string, q: ReportQuery, opts: { all?: boolean; selectedBrandId?: string | null } = {}) {
  const def = getReport(slug);
  if (!def) return null;
  const period = resolvePeriod(q.periodo ?? "30d", q.de, q.ate);
  const brandId = q.marca ?? opts.selectedBrandId ?? null;
  const scope = brandScope(auth.perms, def.module);
  const page = Math.max(1, Number(q.pagina ?? 1) || 1);
  const data = await runReport(def, {
    period,
    scope,
    brandId,
    categoryId: q.categoria || null,
    status: q.status || null,
    page,
    perPage: 50,
    all: opts.all,
  });
  return { def, period, brandId, page, ...data };
}

const LABEL_MAPS: Record<string, string> = {
  ...ORDER_STATUS_LABELS,
  ...MOVEMENT_LABELS,
  ...ENTRY_KIND_LABELS,
  ...EXPENSE_CATEGORY_LABELS,
  loja: "Loja online",
  painel: "Painel",
  link: "Link",
  api: "API",
};

export function formatCell(col: ReportColumn, value: unknown, brands: Map<string, Brand>): string {
  if (value === null || value === undefined || value === "") return "—";
  switch (col.type) {
    case "money":
      return formatBRL(value);
    case "number":
      return formatNumber(value);
    case "percent":
      return formatPercent(value);
    case "date":
      return formatDate(value instanceof Date ? value : String(value));
    case "datetime":
      return formatDateTime(value instanceof Date ? value : String(value));
    case "brand":
      return brands.get(String(value))?.name ?? "—";
    case "status":
      return LABEL_MAPS[String(value)] ?? String(value);
    default:
      return LABEL_MAPS[String(value)] ?? String(value);
  }
}

/** Valor para planilha: números ficam numéricos. */
export function exportCell(col: ReportColumn, value: unknown, brands: Map<string, Brand>): string | number | null {
  if (value === null || value === undefined || value === "") return null;
  if (col.type === "money" || col.type === "number" || col.type === "percent") {
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
  }
  return formatCell(col, value, brands);
}
