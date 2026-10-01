import Link from "next/link";
import { guard } from "@/server/admin";
import { getFunnel, getTopViewedProducts } from "@/server/services/analytics";
import { resolvePeriod, PERIOD_KEYS, PERIOD_LABELS } from "@/lib/period";
import { formatBRL, formatNumber, formatPercent } from "@/lib/format";
import { EmptyState, FilterBar, FilterSelect, Forbidden, Kpi, KpiStrip, PageHeader, Panel, Table, Td, Th } from "@/components/admin/ui";
import { FunnelBars } from "@/components/admin/charts";

export const metadata = { title: "Analytics" };

type SP = Record<string, string | undefined>;

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await guard("analytics");
  if (!ctx.allowed) return <Forbidden module="Analytics" />;
  const sp = await searchParams;
  const period = resolvePeriod(sp.periodo ?? "30d", sp.de, sp.ate);
  const brandId = sp.marca ?? ctx.selectedBrandId;
  const brandIds = brandId ? (ctx.scope === "all" || ctx.scope.includes(brandId) ? [brandId] : []) : ctx.scope;
  const [funnel, top] = await Promise.all([getFunnel(period, brandIds), getTopViewedProducts(period, brandIds)]);
  const steps = funnel.total;
  const visitors = steps[0]?.count ?? 0;
  const orders = steps.find((s) => s.type === "order_created")?.count ?? 0;
  const purchases = steps.find((s) => s.type === "purchase_confirmed")?.count ?? 0;
  const brands = new Map(ctx.brands.map((b) => [b.id, b]));
  const perBrand = Object.entries(funnel.byBrand).filter(([id]) => !brandId || id === brandId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Funil próprio da loja (sem rastreadores de terceiros): visitantes → produto → carrinho → checkout → pedido → compra confirmada."
      />
      <Panel bodyClassName="p-0">
        <FilterBar>
          <FilterSelect
            name="periodo"
            label="Período"
            value={period.key}
            allLabel="Últimos 30 dias"
            options={PERIOD_KEYS.filter((k) => k !== "personalizado").map((k) => ({ value: k, label: PERIOD_LABELS[k] }))}
          />
          {ctx.visibleBrands.length > 1 && (
            <FilterSelect name="marca" label="Marca" value={brandId} allLabel="Todas" options={ctx.visibleBrands.map((b) => ({ value: b.id, label: b.name }))} />
          )}
        </FilterBar>
      </Panel>
      <KpiStrip cols={4}>
        <Kpi label="Visitantes" value={formatNumber(visitors)} hint={period.label} />
        <Kpi label="Pedidos criados" value={formatNumber(orders)} />
        <Kpi label="Taxa de conversão (pedido)" value={visitors ? formatPercent((orders / visitors) * 100, 2) : "—"} />
        <Kpi label="Compras confirmadas" value={formatNumber(purchases)} hint={`Faturamento ${formatBRL(funnel.revenue)}`} />
      </KpiStrip>
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title={brandId ? `Funil · ${brands.get(brandId)?.name ?? ""}` : "Funil · todas as marcas"} description="Percentual = conversão em relação à etapa anterior.">
          {visitors ? <FunnelBars steps={steps} /> : <EmptyState title="Sem visitas registradas no período" />}
        </Panel>
        {!brandId &&
          perBrand.map(([id, s]) => (
            <Panel key={id} title={`Funil · ${brands.get(id)?.name ?? "—"}`}>
              <FunnelBars steps={s} />
            </Panel>
          ))}
      </div>
      <Panel title="Produtos mais visualizados" bodyClassName="p-0">
        {top.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Produto</Th>
                <Th>Marca</Th>
                <Th align="right">Visualizações</Th>
                <Th align="right">Visitantes únicos</Th>
              </tr>
            </thead>
            <tbody>
              {top.map((p) => (
                <tr key={p.id}>
                  <Td>
                    <Link href={`/admin/produtos/${p.id}`} className="hover:underline">
                      {p.name}
                    </Link>
                  </Td>
                  <Td>{brands.get(p.brand_id)?.name ?? "—"}</Td>
                  <Td align="right">{formatNumber(p.views)}</Td>
                  <Td align="right">{formatNumber(p.visitors)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="Nenhuma visualização de produto no período" />
        )}
      </Panel>
    </div>
  );
}
