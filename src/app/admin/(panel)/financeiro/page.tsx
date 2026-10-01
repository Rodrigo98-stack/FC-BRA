import Link from "next/link";
import { guard } from "@/server/admin";
import { can } from "@/server/rbac";
import { getFinancialSummary, listFinancialMovements } from "@/server/services/financial";
import { deleteResourceAction } from "../resource-actions";
import { resolvePeriod } from "@/lib/period";
import { formatBRL } from "@/lib/format";
import { ENTRY_KIND_LABELS, EXPENSE_CATEGORY_LABELS, COST_CATEGORIES } from "@/lib/domain";
import {
  AdminPagination,
  Badge,
  BrandTag,
  CellDate,
  DemoBadge,
  EmptyState,
  FilterSelect,
  Forbidden,
  hrefWith,
  Kpi,
  KpiStrip,
  LinkButton,
  PageHeader,
  Panel,
  Table,
  Td,
  Th,
} from "@/components/admin/ui";
import { ConfirmAction } from "@/components/admin/client";
import { PeriodFilter } from "./period-filter";

export const metadata = { title: "Financeiro" };

type SP = Record<string, string | undefined>;

export default async function FinancePage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await guard("financeiro");
  if (!ctx.allowed) return <Forbidden module="Financeiro" />;
  const sp = await searchParams;
  const period = resolvePeriod(sp.periodo ?? "mes", sp.de, sp.ate);
  const brandId = sp.marca ?? ctx.selectedBrandId;
  const type = sp.tipo === "entrada" || sp.tipo === "saida" ? sp.tipo : null;
  const [summary, list] = await Promise.all([
    getFinancialSummary(period, ctx.scope, brandId),
    listFinancialMovements(period, ctx.scope, brandId, { type, page: Number(sp.pagina ?? 1) || 1 }),
  ]);
  const canCreate = can(ctx.auth.perms, "financeiro", "criar");
  const canDelete = can(ctx.auth.perms, "financeiro", "excluir");
  const brands = new Map(ctx.brands.map((b) => [b.id, b]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financeiro"
        description={`Receita − Custos − Despesas = Resultado do período · ${period.label}`}
        actions={
          <>
            <LinkButton href={hrefWith("/admin/financeiro/dre", sp, {})}>DRE simplificada</LinkButton>
            {canCreate && <LinkButton href="/admin/financeiro/entrada/novo">Nova entrada</LinkButton>}
            {canCreate && (
              <LinkButton href="/admin/financeiro/saida/novo" variant="primary">
                Nova saída
              </LinkButton>
            )}
          </>
        }
      />
      <Panel bodyClassName="p-0">
        <PeriodFilter period={period} brands={ctx.visibleBrands} brandId={brandId} />
      </Panel>
      <KpiStrip cols={4}>
        <Kpi
          label="Receitas"
          value={formatBRL(summary.income)}
          hint={`Vendas ${formatBRL(summary.sales)} · outras ${formatBRL(summary.otherIncome)}${summary.refunds ? ` · estornos ${formatBRL(summary.refunds)}` : ""}`}
        />
        <Kpi label="Custos (mercadoria)" value={formatBRL(summary.costs)} hint="Compra de produtos e fornecedores" />
        <Kpi label="Despesas" value={formatBRL(summary.expenses)} hint="Fretes, operacionais, marketing, outros" />
        <Kpi label="Resultado do período" value={formatBRL(summary.result)} tone={summary.result < 0 ? "danger" : undefined} />
      </KpiStrip>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title="Lançamentos" bodyClassName="p-0">
          <form className="flex items-end gap-3 border-b border-stone-200 px-4 py-3">
            {Object.entries(sp)
              .filter(([k, v]) => v && !["tipo", "pagina"].includes(k))
              .map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
            <FilterSelect name="tipo" label="Tipo" value={type} options={{ entrada: "Entradas", saida: "Saídas" }} />
            <button type="submit" className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm">
              Filtrar
            </button>
          </form>
          {list.rows.length === 0 ? (
            <EmptyState title="Nenhum lançamento no período" text="Vendas pagas entram automaticamente. Lance aqui outras receitas e as saídas." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Data</Th>
                  <Th>Descrição</Th>
                  <Th>Categoria</Th>
                  <Th>Marca</Th>
                  <Th align="right">Valor</Th>
                  <Th>Lançado por</Th>
                  <Th align="right">
                    <span className="sr-only">Ações</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((r) => {
                  const b = r.brand_id ? brands.get(r.brand_id) : null;
                  const auto = r.type === "entrada" && !!r.order_id;
                  const label =
                    r.type === "entrada" ? ENTRY_KIND_LABELS[r.category] ?? r.category : EXPENSE_CATEGORY_LABELS[r.category] ?? r.category;
                  return (
                    <tr key={`${r.type}-${r.id}`}>
                      <Td>
                        <CellDate value={r.occurred_on} />
                      </Td>
                      <Td>
                        <span className="flex items-center gap-2">
                          {r.description} <DemoBadge show={r.is_demo} />
                        </span>
                        {r.order_id && (
                          <Link href={`/admin/pedidos/${r.order_id}`} className="text-xs underline">
                            ver pedido
                          </Link>
                        )}
                      </Td>
                      <Td>
                        <Badge tone={r.type === "entrada" ? "success" : COST_CATEGORIES.includes(r.category) ? "info" : "warning"}>{label}</Badge>
                      </Td>
                      <Td>{b ? <BrandTag name={b.name} slug={b.slug} /> : <span className="text-stone-500">Geral</span>}</Td>
                      <Td align="right" className={r.amount < 0 ? "text-red-700" : "text-emerald-700"}>
                        {formatBRL(r.amount)}
                      </Td>
                      <Td className="text-xs">{r.created_by_name ?? "Sistema"}</Td>
                      <Td align="right">
                        {!auto && (
                          <div className="flex justify-end gap-1">
                            <LinkButton href={`/admin/financeiro/${r.type}/${r.id}`} variant="ghost" className="py-1">
                              Editar
                            </LinkButton>
                            {canDelete && (
                              <ConfirmAction
                                label="Excluir"
                                variant="ghost"
                                className="py-1 text-red-700"
                                title="Excluir lançamento?"
                                description="A exclusão fica registrada na auditoria."
                                action={deleteResourceAction.bind(null, r.type === "entrada" ? "receitas" : "despesas", r.id)}
                              />
                            )}
                          </div>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
          <AdminPagination page={list.page} pages={list.hasMore ? list.page + 1 : list.page} makeHref={(p) => hrefWith("/admin/financeiro", sp, { pagina: p })} />
        </Panel>
        <Panel title="Saídas por categoria">
          <ul className="space-y-2.5 text-sm">
            {Object.entries(summary.byCategory).map(([k, v]) => (
              <li key={k} className="flex items-center justify-between gap-3">
                <span className="text-stone-600">{EXPENSE_CATEGORY_LABELS[k]}</span>
                <span className="tabular-nums">{formatBRL(v)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 border-t border-stone-100 pt-4 text-xs text-stone-500">
            Vendas entram quando o pedido é marcado como pago; cancelamentos e devoluções geram estorno automático.
          </p>
        </Panel>
      </div>
    </div>
  );
}
