import Link from "next/link";
import { guard } from "@/server/admin";
import { can } from "@/server/rbac";
import { listOrders } from "@/server/services/orders-admin";
import { resolvePeriod, PERIOD_LABELS, PERIOD_KEYS } from "@/lib/period";
import { formatBRL, orderCode } from "@/lib/format";
import { ORDER_STATUS_LABELS } from "@/lib/domain";
import {
  AdminPagination,
  BrandTag,
  CellDate,
  DemoBadge,
  EmptyState,
  FilterBar,
  FilterSearch,
  FilterSelect,
  Forbidden,
  hrefWith,
  LinkButton,
  PageHeader,
  Panel,
  Table,
  Td,
  Th,
} from "@/components/admin/ui";
import { OrderStatusBadge } from "@/components/admin/badges";

export const metadata = { title: "Pedidos" };

type SP = Record<string, string | undefined>;

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await guard("pedidos");
  if (!ctx.allowed) return <Forbidden module="Pedidos" />;
  const sp = await searchParams;
  const brandId = sp.marca ?? ctx.selectedBrandId;
  const period = sp.periodo ? resolvePeriod(sp.periodo, sp.de, sp.ate) : null;
  const list = await listOrders({
    scope: ctx.scope,
    brandId,
    status: sp.status ?? null,
    q: sp.q ?? null,
    source: sp.origem ?? null,
    period,
    page: Number(sp.pagina ?? 1) || 1,
  });
  const brands = new Map(ctx.brands.map((b) => [b.id, b]));
  return (
    <div>
      <PageHeader
        title="Pedidos"
        description="Pedidos da loja online e registrados no painel. A baixa de estoque acontece quando o pedido é confirmado (aguardando pagamento) e a receita quando é pago."
        actions={can(ctx.auth.perms, "pedidos", "criar") ? <LinkButton href="/admin/pedidos/novo" variant="primary">Registrar pedido</LinkButton> : null}
      />
      <Panel bodyClassName="p-0">
        <FilterBar>
          <FilterSearch value={sp.q} placeholder="Nº do pedido, cliente ou telefone" />
          <FilterSelect name="status" label="Status" value={sp.status} options={ORDER_STATUS_LABELS} />
          {ctx.visibleBrands.length > 1 && (
            <FilterSelect name="marca" label="Marca" value={brandId} allLabel="Todas" options={ctx.visibleBrands.map((b) => ({ value: b.id, label: b.name }))} />
          )}
          <FilterSelect
            name="periodo"
            label="Período"
            value={sp.periodo}
            allLabel="Todo o período"
            options={PERIOD_KEYS.filter((k) => k !== "personalizado").map((k) => ({ value: k, label: PERIOD_LABELS[k] }))}
          />
          <FilterSelect name="origem" label="Origem" value={sp.origem} options={{ loja: "Loja online", painel: "Painel" }} />
        </FilterBar>
        {list.rows.length === 0 ? (
          <EmptyState
            title="Nenhum pedido encontrado"
            text={sp.q || sp.status ? "Ajuste os filtros para ver outros pedidos." : "Os pedidos feitos na loja aparecem aqui automaticamente."}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Pedido</Th>
                <Th>Data</Th>
                <Th>Cliente</Th>
                <Th>Marca</Th>
                <Th align="right">Itens</Th>
                <Th align="right">Total</Th>
                <Th>Status</Th>
                <Th>Canal</Th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((o) => {
                const b = brands.get(o.brand_id);
                return (
                  <tr key={o.id} className="hover:bg-stone-50/60">
                    <Td>
                      <span className="flex items-center gap-2">
                        <Link href={`/admin/pedidos/${o.id}`} className="font-medium tabular-nums text-stone-900 hover:underline">
                          #{orderCode(o.prefix, o.number)}
                        </Link>
                        <DemoBadge show={o.is_demo} />
                      </span>
                    </Td>
                    <Td>
                      <CellDate value={o.created_at} time />
                    </Td>
                    <Td>
                      <span className="block">{o.customer_name}</span>
                      <span className="text-xs text-stone-500">{o.customer_phone}</span>
                    </Td>
                    <Td>{b ? <BrandTag name={b.name} slug={b.slug} /> : "—"}</Td>
                    <Td align="right">{o.items}</Td>
                    <Td align="right">{formatBRL(o.total)}</Td>
                    <Td>
                      <OrderStatusBadge status={o.status} />
                    </Td>
                    <Td className="text-xs text-stone-600">
                      {o.source === "painel" ? "Painel" : "Loja"} · {o.delivery_method === "api" ? "API" : "Link"}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <AdminPagination page={list.page} pages={list.pages} total={list.total} makeHref={(p) => hrefWith("/admin/pedidos", sp, { pagina: p })} />
      </Panel>
    </div>
  );
}
