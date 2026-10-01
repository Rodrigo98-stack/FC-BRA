/**
 * Financeiro (§16) e DRE simplificada (§17).
 *
 * Fluxo de caixa: Receitas − Custos (compra de mercadoria/fornecedores)
 *                 − Despesas = Resultado do período.
 * DRE: Receita bruta − Estornos − CMV = Lucro bruto − Despesas operacionais
 *      = Resultado. O CMV usa o custo gravado em cada item no momento da
 *      venda; itens sem custo cadastrado são sinalizados (nunca estimados).
 */
import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "../db";
import { brandSql } from "../sql";
import type { ResolvedPeriod } from "@/lib/period";
import { COST_CATEGORIES, EXPENSE_CATEGORIES } from "@/lib/domain";

type Scope = "all" | string[];

const COST_LIST = sql.raw(`(${COST_CATEGORIES.map((c) => `'${c}'`).join(", ")})`);

export async function getFinancialSummary(period: ResolvedPeriod, scope: Scope, brandId?: string | null) {
  const db = await getDb();
  const entries = rowsOf<{ kind: string; total: number; n: number }>(
    await db.execute(sql`
      select kind, coalesce(sum(amount), 0)::float as total, count(*)::int as n
      from public.financial_entries e
      where e.deleted_at is null and e.occurred_on >= ${period.fromDate} and e.occurred_on <= ${period.toDate}
        and ${brandSql(sql`e.brand_id`, scope, brandId, !brandId)}
      group by kind`),
  );
  const expenses = rowsOf<{ category: string; total: number; n: number }>(
    await db.execute(sql`
      select category, coalesce(sum(amount), 0)::float as total, count(*)::int as n
      from public.financial_expenses x
      where x.deleted_at is null and x.occurred_on >= ${period.fromDate} and x.occurred_on <= ${period.toDate}
        and ${brandSql(sql`x.brand_id`, scope, brandId, !brandId)}
      group by category`),
  );
  const sumKind = (k: string) => Number(entries.find((e) => e.kind === k)?.total ?? 0);
  const byCategory = Object.fromEntries(
    EXPENSE_CATEGORIES.map((c) => [c, Number(expenses.find((e) => e.category === c)?.total ?? 0)]),
  ) as Record<(typeof EXPENSE_CATEGORIES)[number], number>;

  const sales = sumKind("venda");
  const otherIncome = sumKind("outra_receita");
  const refunds = sumKind("estorno"); // negativo
  const income = sales + otherIncome + refunds;
  const costs = COST_CATEGORIES.reduce((a, c) => a + (byCategory[c as keyof typeof byCategory] ?? 0), 0);
  const operating = EXPENSE_CATEGORIES.filter((c) => !COST_CATEGORIES.includes(c)).reduce((a, c) => a + byCategory[c], 0);
  return {
    sales,
    otherIncome,
    refunds,
    income,
    costs,
    expenses: operating,
    byCategory,
    result: income - costs - operating,
    entriesCount: entries.reduce((a, e) => a + Number(e.n), 0),
    expensesCount: expenses.reduce((a, e) => a + Number(e.n), 0),
  };
}

export async function getDre(period: ResolvedPeriod, scope: Scope, brandId?: string | null) {
  const db = await getDb();
  const summary = await getFinancialSummary(period, scope, brandId);
  // CMV das vendas reconhecidas no período, menos o custo das vendas estornadas.
  const cmvRows = rowsOf<{ kind: string; cost: number; missing: number }>(
    await db.execute(sql`
      select e.kind,
             coalesce(sum(oi.unit_cost * oi.quantity), 0)::float as cost,
             count(*) filter (where oi.unit_cost is null)::int as missing
      from public.financial_entries e
      join public.order_items oi on oi.order_id = e.order_id
      where e.deleted_at is null and e.kind in ('venda', 'estorno') and e.order_id is not null
        and e.occurred_on >= ${period.fromDate} and e.occurred_on <= ${period.toDate}
        and ${brandSql(sql`e.brand_id`, scope, brandId)}
      group by e.kind`),
  );
  const saleCost = Number(cmvRows.find((r) => r.kind === "venda")?.cost ?? 0);
  const refundCost = Number(cmvRows.find((r) => r.kind === "estorno")?.cost ?? 0);
  const missingCostItems = cmvRows.reduce((a, r) => a + Number(r.missing), 0);
  const grossRevenue = summary.sales + summary.otherIncome;
  const netRevenue = grossRevenue + summary.refunds;
  const cmv = saleCost - refundCost;
  const grossProfit = netRevenue - cmv;
  return {
    grossRevenue,
    refunds: summary.refunds,
    netRevenue,
    cmv,
    grossProfit,
    operatingExpenses: summary.expenses,
    operatingBreakdown: Object.fromEntries(
      Object.entries(summary.byCategory).filter(([c]) => !COST_CATEGORIES.includes(c)),
    ),
    result: grossProfit - summary.expenses,
    missingCostItems,
    grossMargin: netRevenue ? (grossProfit / netRevenue) * 100 : null,
  };
}

export async function listFinancialMovements(
  period: ResolvedPeriod,
  scope: Scope,
  brandId?: string | null,
  opts: { type?: "entrada" | "saida" | null; page?: number; perPage?: number } = {},
) {
  const db = await getDb();
  const perPage = opts.perPage ?? 30;
  const page = Math.max(opts.page ?? 1, 1);
  const entriesSql = sql`
    select e.id, 'entrada' as type, e.kind as category, e.description, e.amount::float as amount, e.occurred_on::text as occurred_on,
           e.brand_id, e.order_id, u.full_name as created_by_name, e.is_demo, e.created_at
    from public.financial_entries e left join public.users u on u.id = e.created_by
    where e.deleted_at is null and e.occurred_on >= ${period.fromDate} and e.occurred_on <= ${period.toDate}
      and ${brandSql(sql`e.brand_id`, scope, brandId, !brandId)}`;
  const expensesSql = sql`
    select x.id, 'saida' as type, x.category, x.description, (-x.amount)::float as amount, x.occurred_on::text as occurred_on,
           x.brand_id, null::uuid as order_id, u.full_name as created_by_name, x.is_demo, x.created_at
    from public.financial_expenses x left join public.users u on u.id = x.created_by
    where x.deleted_at is null and x.occurred_on >= ${period.fromDate} and x.occurred_on <= ${period.toDate}
      and ${brandSql(sql`x.brand_id`, scope, brandId, !brandId)}`;
  const union =
    opts.type === "entrada" ? entriesSql : opts.type === "saida" ? expensesSql : sql`${entriesSql} union all ${expensesSql}`;
  const rows = rowsOf<{
    id: string;
    type: "entrada" | "saida";
    category: string;
    description: string;
    amount: number;
    occurred_on: string;
    brand_id: string | null;
    order_id: string | null;
    created_by_name: string | null;
    is_demo: boolean;
    created_at: string;
  }>(
    await db.execute(sql`
      select * from (${union}) t order by occurred_on desc, created_at desc
      limit ${perPage + 1} offset ${(page - 1) * perPage}`),
  );
  return { rows: rows.slice(0, perPage), hasMore: rows.length > perPage, page };
}
