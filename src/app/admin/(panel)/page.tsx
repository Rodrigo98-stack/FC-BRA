import Link from "next/link";
import { guard } from "@/server/admin";
import { brandScope, can } from "@/server/rbac";
import {
  getActivityFeed,
  getBrandComparison,
  getCategoryBreakdown,
  getDailyRevenue,
  getOrderKpis,
  getProductRanking,
  getRecentProducts,
  getSalesKpis,
  getStockAlerts,
} from "@/server/services/dashboard";
import { resolvePeriod, PERIOD_KEYS, PERIOD_LABELS } from "@/lib/period";
import { formatBRL, formatDateTime, formatNumber, formatPercent } from "@/lib/format";
import { Badge, BrandTag, CellDate, EmptyState, Kpi, KpiStrip, LinkButton, PageHeader, Panel, Table, Td, Th } from "@/components/admin/ui";
import { ColumnChart } from "@/components/admin/charts";
import { AutoSubmitSelect } from "@/components/admin/client";
import { auditActionLabel } from "@/lib/audit-labels";

export const metadata = { title: "Dashboard" };


type Comparison = NonNullable<Awaited<ReturnType<typeof getBrandComparison>>>;
type CompRow = Comparison["rows"][number] | Comparison["total"];

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ periodo?: string; de?: string; ate?: string }> }) {
  const ctx = await guard(null);
  const { perms } = ctx.auth;
  const sp = await searchParams;
  const period = resolvePeriod(sp.periodo ?? "30d", sp.de, sp.ate);
  const brandId = ctx.selectedBrandId;
  const canOrders = can(perms, "pedidos", "visualizar");
  const canStock = can(perms, "estoque", "visualizar");
  const canProducts = can(perms, "produtos", "visualizar");
  const canFeed = can(perms, "auditoria", "visualizar") || can(perms, "usuarios", "visualizar");
  const orderScope = brandScope(perms, "pedidos");
  const productScope = brandScope(perms, "produtos");

  const [sales, orderKpis, daily, ranking, comparison, categories, stock, recent, feed] = await Promise.all([
    canOrders ? getSalesKpis(orderScope, brandId) : null,
    canOrders ? getOrderKpis(period, orderScope, brandId) : null,
    canOrders ? getDailyRevenue(["ano", "semestre"].includes(period.key) ? resolvePeriod("30d") : period, orderScope, brandId) : null,
    canProducts ? getProductRanking(period, productScope, brandId) : null,
    canOrders && !brandId ? getBrandComparison(period, orderScope) : null,
    canOrders && brandId ? getCategoryBreakdown(period, orderScope, brandId) : null,
    canStock ? getStockAlerts(brandScope(perms, "estoque"), brandId) : null,
    canProducts ? getRecentProducts(productScope, brandId) : null,
    canFeed ? getActivityFeed(10, can(perms, "auditoria", "visualizar") ? brandScope(perms, "auditoria") : "all") : null,
  ]);
  const brandOf = (id: string | null) => ctx.brands.find((b) => b.id === id);
  const firstName = ctx.auth.user.fullName.split(" ")[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title={ctx.selectedBrand ? `Dashboard · ${ctx.selectedBrand.name}` : "Dashboard"}
        description={`Olá, ${firstName}. ${ctx.selectedBrand ? "Indicadores somente desta marca." : "Indicadores de todas as marcas que você acessa."}`}
        actions={
          <form className="flex items-center gap-2">
            <label htmlFor="periodo" className="text-xs text-stone-500">
              Período
            </label>
            <AutoSubmitSelect id="periodo" name="periodo" defaultValue={period.key} className="admin-input w-auto py-1.5">
              {PERIOD_KEYS.filter((k) => k !== "personalizado").map((k) => (
                <option key={k} value={k}>
                  {PERIOD_LABELS[k]}
                </option>
              ))}
            </AutoSubmitSelect>
          </form>
        }
      />

      {!canOrders && !canProducts && !canStock && (
        <Panel>
          <EmptyState
            title="Bem-vindo(a) ao painel"
            text="Seu papel ainda não dá acesso a indicadores. Use o menu para acessar os módulos liberados para você."
          />
        </Panel>
      )}

      {sales && (
        <KpiStrip cols={5}>
          <Kpi label="Vendas hoje" value={formatBRL(sales.hoje.revenue)} hint={`${sales.hoje.orders} pedido(s)`} />
          <Kpi label="Ontem" value={formatBRL(sales.ontem.revenue)} hint={`${sales.ontem.orders} pedido(s)`} />
          <Kpi label="Esta semana" value={formatBRL(sales.semana.revenue)} hint={`${sales.semana.orders} pedido(s)`} />
          <Kpi label="Este mês" value={formatBRL(sales.mes.revenue)} hint={`${sales.mes.orders} pedido(s)`} />
          <Kpi label="Este ano" value={formatBRL(sales.ano.revenue)} hint={`${sales.ano.orders} pedido(s)`} />
        </KpiStrip>
      )}

      {orderKpis && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Panel
            title={`Faturamento por dia · ${["ano", "semestre"].includes(period.key) ? "últimos 30 dias" : period.label.toLowerCase()}`}
            description="Pedidos pagos, em preparação, enviados e entregues."
          >
            <ColumnChart
              valueLabel="Faturamento"
              format="brl"
              data={(daily ?? []).map((d) => ({
                key: d.day,
                label: d.day.slice(8, 10) + "/" + d.day.slice(5, 7),
                value: d.revenue,
                detail: `${d.orders} pedido(s)`,
              }))}
            />
          </Panel>
          <Panel title={`Pedidos · ${period.label.toLowerCase()}`}>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
              <div>
                <dt className="text-xs text-stone-500">Pedidos</dt>
                <dd className="text-xl font-semibold tabular-nums">{formatNumber(orderKpis.totalOrders)}</dd>
              </div>
              <div>
                <dt className="text-xs text-stone-500">Vendas efetivadas</dt>
                <dd className="text-xl font-semibold tabular-nums">{formatNumber(orderKpis.saleOrders)}</dd>
              </div>
              <div>
                <dt className="text-xs text-stone-500">Ticket médio</dt>
                <dd className="text-xl font-semibold tabular-nums">{orderKpis.averageTicket === null ? "—" : formatBRL(orderKpis.averageTicket)}</dd>
              </div>
              <div>
                <dt className="text-xs text-stone-500">Faturamento</dt>
                <dd className="text-xl font-semibold tabular-nums">{formatBRL(orderKpis.revenue)}</dd>
              </div>
              <div>
                <dt className="text-xs text-stone-500">Aguardando ação</dt>
                <dd className="text-xl font-semibold tabular-nums text-amber-700">{formatNumber(orderKpis.pending)}</dd>
              </div>
              <div>
                <dt className="text-xs text-stone-500">Cancelados</dt>
                <dd className="text-xl font-semibold tabular-nums">{formatNumber(orderKpis.cancelled)}</dd>
              </div>
            </dl>
            <LinkButton href="/admin/pedidos?status=pedido_recebido" className="mt-6 w-full">
              Ver pedidos aguardando ação
            </LinkButton>
          </Panel>
        </div>
      )}

      {comparison && ctx.visibleBrands.length > 1 && (
        <Panel title={`Comparativo FINA × BRAVUS · ${period.label.toLowerCase()}`} description="Valores objetivos do período, sem ranking." bodyClassName="p-0">
          <Table>
            <thead>
              <tr>
                <Th>Métrica</Th>
                {comparison.rows.map((r) => (
                  <Th key={r.brandId} align="right">
                    {r.name}
                  </Th>
                ))}
                <Th align="right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Faturamento", (v: CompRow) => formatBRL(v.revenue)],
                  ["Pedidos", (v) => formatNumber(v.orders)],
                  ["Ticket médio", (v) => (v.ticket === null ? "—" : formatBRL(v.ticket))],
                  ["Produtos vendidos", (v) => formatNumber(v.units)],
                  ["Participação no faturamento", (v) => (v.share === null ? "—" : formatPercent(v.share))],
                ] as [string, (v: CompRow) => string][]
              ).map(([label, fn]) => (
                <tr key={label}>
                  <Td className="text-stone-600">{label}</Td>
                  {comparison.rows.map((r) => (
                    <Td key={r.brandId} align="right">
                      {fn(r)}
                    </Td>
                  ))}
                  <Td align="right" className="font-medium">
                    {fn(comparison.total)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>
      )}

      {categories && (
        <Panel title={`Vendas por categoria · ${period.label.toLowerCase()}`} bodyClassName="p-0">
          {categories.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>Categoria</Th>
                  <Th align="right">Unidades</Th>
                  <Th align="right">Receita</Th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.category}>
                    <Td>{c.category}</Td>
                    <Td align="right">{formatNumber(c.units)}</Td>
                    <Td align="right">{formatBRL(c.revenue)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState title="Sem vendas no período" />
          )}
        </Panel>
      )}

      {ranking && (
        <div className="grid gap-6 lg:grid-cols-3">
          {(
            [
              ["Mais vendidos", ranking.best, "Nenhuma venda no período."],
              ["Menos vendidos", ranking.worst, "Nenhuma venda no período."],
              [`Sem vendas (${ranking.noSalesCount})`, ranking.noSales, "Todos os produtos ativos venderam."],
            ] as const
          ).map(([title, list, empty]) => (
            <Panel key={title} title={title} description={period.label} bodyClassName="p-0">
              {list.length ? (
                <ul className="divide-y divide-stone-100">
                  {list.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                      <Link href={`/admin/produtos/${p.id}`} className="min-w-0 truncate hover:underline">
                        {p.name}
                      </Link>
                      <span className="shrink-0 tabular-nums text-stone-600">{p.units} un.</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-6 text-sm text-stone-500">{empty}</p>
              )}
            </Panel>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {stock && (
          <Panel
            title="Alertas de estoque"
            actions={<LinkButton href="/admin/estoque?situacao=alerta">Ver estoque</LinkButton>}
            bodyClassName="p-0"
          >
            {stock.out.length + stock.low.length ? (
              <ul className="max-h-80 divide-y divide-stone-100 overflow-y-auto">
                {[...stock.out, ...stock.low].slice(0, 12).map((a) => (
                  <li key={a.variantId} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate">{a.name}</span>
                      <span className="text-xs text-stone-500">{[a.size, a.color, a.sku].filter(Boolean).join(" · ")}</span>
                    </span>
                    {a.stock === 0 ? <Badge tone="danger">PRODUTO ESGOTADO</Badge> : <Badge tone="warning">ESTOQUE BAIXO · {a.stock}</Badge>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-6 text-sm text-stone-500">Nenhuma variação abaixo do estoque mínimo.</p>
            )}
          </Panel>
        )}
        {recent && (
          <Panel
            title="Produtos recém-cadastrados"
            actions={can(perms, "produtos", "criar") ? <LinkButton href="/admin/produtos/novo">Novo produto</LinkButton> : null}
            bodyClassName="p-0"
          >
            {recent.length ? (
              <ul className="divide-y divide-stone-100">
                {recent.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <span className="min-w-0">
                      <Link href={`/admin/produtos/${p.id}`} className="block truncate hover:underline">
                        {p.name}
                      </Link>
                      <span className="text-xs text-stone-500">{p.sku}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      {brandOf(p.brand_id) && <BrandTag name={brandOf(p.brand_id)!.name} slug={brandOf(p.brand_id)!.slug} />}
                      <CellDate value={p.created_at} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="Nenhum produto cadastrado"
                action={can(perms, "produtos", "criar") ? <LinkButton href="/admin/produtos/novo" variant="primary">Cadastrar produto</LinkButton> : undefined}
              />
            )}
          </Panel>
        )}
      </div>

      {feed && (
        <Panel title="Atividades recentes da equipe" actions={can(perms, "auditoria", "visualizar") ? <LinkButton href="/admin/auditoria">Ver auditoria</LinkButton> : null} bodyClassName="p-0">
          {feed.length ? (
            <ul className="divide-y divide-stone-100">
              {feed.map((f) => (
                <li key={f.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-2.5 text-sm">
                  <span>
                    <strong className="font-medium">{f.actor_name ?? "Sistema"}</strong>{" "}
                    <span className="text-stone-600">{auditActionLabel(f.action)}</span>
                    {f.reason && <span className="text-stone-500"> — {f.reason}</span>}
                  </span>
                  <span className="text-xs tabular-nums text-stone-500">{formatDateTime(f.created_at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-sm text-stone-500">Nenhuma atividade registrada.</p>
          )}
        </Panel>
      )}
    </div>
  );
}
