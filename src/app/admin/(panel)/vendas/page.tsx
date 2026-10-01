import Link from "next/link";
import { guard } from "@/server/admin";
import { can } from "@/server/rbac";
import { listOrders, salesSummary } from "@/server/services/orders-admin";
import { getDailyRevenue } from "@/server/services/dashboard";
import { resolvePeriod, PERIOD_KEYS, PERIOD_LABELS } from "@/lib/period";
import { formatBRL, formatNumber, orderCode } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/domain";
import {
  AdminPagination,
  BrandTag,
  CellDate,
  DemoBadge,
  EmptyState,
  FilterBar,
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
import { OrderStatusBadge } from "@/components/admin/badges";
import { ColumnChart } from "@/components/admin/charts";

export const metadata = { title: "Vendas" };

type SP = Record<string, string | undefined>;

export default async function SalesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await guard("pedidos");
  if (!ctx.allowed) return <Forbidden module="Vendas" />;
  const sp = await searchParams;
  const period = resolvePeriod(sp.periodo ?? "30d", sp.de, sp.ate);
  const brandId = sp.marca ?? ctx.selectedBrandId;
  const [summary, daily, list] = await Promise.all([
    salesSummary(period, ctx.scope, brandId),
    getDailyRevenue(["ano", "semestre"].includes(period.key) ? resolvePeriod("30d") : period, ctx.scope, brandId),
    listOrders({
      scope: ctx.scope,
      brandId,
      statuses: ["pago", "em_preparacao", "enviado", "entregue"],
      period,
      page: Number(sp.pagina ?? 1) || 1,
    }),
  ]);
  const brands = new Map(ctx.brands.map((b) => [b.id, b]));
  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendas"
        description={`Pedidos efetivados (pagos, em preparação, enviados e entregues) · ${period.label}`}
        actions={
          can(ctx.auth.perms, "relatorios", "visualizar") ? (
            <LinkButton href={`/admin/relatorios/vendas?periodo=${period.key}${sp.de ? `&de=${sp.de}&ate=${sp.ate}` : ""}`}>Relatório e exportação</LinkButton>
          ) : null
        }
      />
      <Panel bodyClassName="p-0">
        <FilterBar>
          <FilterSelect
            name="periodo"
            label="Período"
            value={period.key}
            allLabel="Últimos 30 dias"
            options={PERIOD_KEYS.map((k) => ({ value: k, label: PERIOD_LABELS[k] }))}
          />
          <label className="flex flex-col gap-1 text-xs text-stone-500">
            De
            <input type="date" name="de" defaultValue={sp.de ?? period.fromDate} className="admin-input py-1.5" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-stone-500">
            Até
            <input type="date" name="ate" defaultValue={sp.ate ?? period.toDate} className="admin-input py-1.5" />
          </label>
          {ctx.visibleBrands.length > 1 && (
            <FilterSelect name="marca" label="Marca" value={brandId} allLabel="Todas" options={ctx.visibleBrands.map((b) => ({ value: b.id, label: b.name }))} />
          )}
        </FilterBar>
        <p className="px-4 py-2 text-xs text-stone-500">Para usar datas específicas, escolha “Personalizado” e preencha De/Até.</p>
      </Panel>
      <KpiStrip cols={5}>
        <Kpi label="Faturamento" value={formatBRL(summary.revenue)} />
        <Kpi label="Vendas" value={formatNumber(summary.orders)} />
        <Kpi label="Ticket médio" value={summary.ticket === null ? "—" : formatBRL(summary.ticket)} />
        <Kpi label="Peças vendidas" value={formatNumber(summary.units)} />
        <Kpi label="Descontos concedidos" value={formatBRL(summary.discount)} />
      </KpiStrip>
      <Panel title="Evolução diária">
        <ColumnChart
          valueLabel="Faturamento"
          format="brl"
          data={daily.map((d) => ({ key: d.day, label: `${d.day.slice(8, 10)}/${d.day.slice(5, 7)}`, value: d.revenue, detail: `${d.orders} venda(s)` }))}
        />
      </Panel>
      <Panel title="Vendas do período" bodyClassName="p-0">
        {list.rows.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Pedido</Th>
                <Th>Data</Th>
                <Th>Cliente</Th>
                <Th>Marca</Th>
                <Th>Pagamento</Th>
                <Th align="right">Total</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((o) => {
                const b = brands.get(o.brand_id);
                return (
                  <tr key={o.id}>
                    <Td>
                      <span className="flex items-center gap-2">
                        <Link href={`/admin/pedidos/${o.id}`} className="font-medium hover:underline">
                          #{orderCode(o.prefix, o.number)}
                        </Link>
                        <DemoBadge show={o.is_demo} />
                      </span>
                    </Td>
                    <Td>
                      <CellDate value={o.created_at} time />
                    </Td>
                    <Td>{o.customer_name}</Td>
                    <Td>{b ? <BrandTag name={b.name} slug={b.slug} /> : "—"}</Td>
                    <Td>{o.payment_method ? PAYMENT_METHOD_LABELS[o.payment_method] ?? o.payment_method : <span className="text-stone-400">Não informado</span>}</Td>
                    <Td align="right">{formatBRL(o.total)}</Td>
                    <Td>
                      <OrderStatusBadge status={o.status} />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="Nenhuma venda no período" text="Vendas aparecem aqui quando o pedido é marcado como pago." />
        )}
        <AdminPagination page={list.page} pages={list.pages} total={list.total} makeHref={(p) => hrefWith("/admin/vendas", sp, { pagina: p })} />
      </Panel>
    </div>
  );
}
