import { guard } from "@/server/admin";
import { can } from "@/server/rbac";
import { getDre } from "@/server/services/financial";
import { resolvePeriod } from "@/lib/period";
import { formatBRL, formatPercent } from "@/lib/format";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/domain";
import { Forbidden, hrefWith, LinkButton, PageHeader, Panel } from "@/components/admin/ui";
import { PeriodFilter } from "../period-filter";

export const metadata = { title: "DRE simplificada" };

type SP = Record<string, string | undefined>;

function Line({ label, value, strong, sub, sign }: { label: string; value: number; strong?: boolean; sub?: boolean; sign?: "-" | "=" }) {
  return (
    <div className={`flex items-baseline justify-between gap-6 border-b border-stone-100 py-3 ${sub ? "pl-6 text-stone-600" : ""} ${strong ? "font-semibold" : ""}`}>
      <span>
        {sign && <span className="mr-2 inline-block w-6 text-stone-400">({sign})</span>}
        {label}
      </span>
      <span className={`tabular-nums ${value < 0 && strong ? "text-red-700" : ""}`}>{formatBRL(value)}</span>
    </div>
  );
}

export default async function DrePage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await guard("financeiro");
  if (!ctx.allowed) return <Forbidden module="Financeiro" />;
  const sp = await searchParams;
  const period = resolvePeriod(sp.periodo ?? "mes", sp.de, sp.ate);
  const brandId = sp.marca ?? ctx.selectedBrandId;
  const dre = await getDre(period, ctx.scope, brandId);
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="DRE simplificada"
        description={`Usa somente dados cadastrados — nada é estimado · ${period.label}`}
        crumbs={[{ href: hrefWith("/admin/financeiro", sp, {}), label: "Financeiro" }, { label: "DRE" }]}
        actions={can(ctx.auth.perms, "relatorios", "visualizar") ? <LinkButton href={`/admin/relatorios/margem?periodo=${period.key}`}>Margem por produto</LinkButton> : null}
      />
      <Panel bodyClassName="p-0">
        <PeriodFilter period={period} brands={ctx.visibleBrands} brandId={brandId} />
      </Panel>
      <Panel>
        <Line label="RECEITA BRUTA" value={dre.grossRevenue} strong />
        {dre.refunds !== 0 && <Line label="Estornos e devoluções" value={dre.refunds} sub sign="-" />}
        <Line label="CUSTO DOS PRODUTOS VENDIDOS (CMV)" value={-dre.cmv} sign="-" />
        <Line label="LUCRO BRUTO" value={dre.grossProfit} strong sign="=" />
        <Line label="DESPESAS OPERACIONAIS" value={-dre.operatingExpenses} sign="-" />
        {Object.entries(dre.operatingBreakdown).map(([k, v]) => (
          <Line key={k} label={EXPENSE_CATEGORY_LABELS[k] ?? k} value={-Number(v)} sub />
        ))}
        <Line label="RESULTADO DO PERÍODO" value={dre.result} strong sign="=" />
        <div className="mt-4 space-y-2 text-xs text-stone-500">
          <p>Margem bruta: {dre.grossMargin === null ? "Não informado" : formatPercent(dre.grossMargin)}</p>
          {dre.missingCostItems > 0 && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-900">
              Atenção: {dre.missingCostItems} item(ns) vendido(s) sem preço de custo cadastrado. O CMV está incompleto — cadastre o custo nos produtos.
            </p>
          )}
          <p>
            Compras de mercadoria e pagamentos a fornecedores entram no estoque e viram CMV quando vendidos — por isso não aparecem como despesa
            operacional (veja o fluxo de caixa em Financeiro).
          </p>
        </div>
      </Panel>
    </div>
  );
}
