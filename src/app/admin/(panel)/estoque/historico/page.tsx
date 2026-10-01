import Link from "next/link";
import { guard } from "@/server/admin";
import { can } from "@/server/rbac";
import { listMovements } from "@/server/services/inventory";
import { resolvePeriod, PERIOD_KEYS, PERIOD_LABELS } from "@/lib/period";
import { formatBRL } from "@/lib/format";
import { MOVEMENT_LABELS } from "@/lib/domain";
import {
  AdminPagination,
  Badge,
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

export const metadata = { title: "Histórico de estoque" };

type SP = Record<string, string | undefined>;

export default async function StockHistoryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await guard("estoque");
  if (!ctx.allowed) return <Forbidden module="Estoque" />;
  const sp = await searchParams;
  const brandId = sp.marca ?? ctx.selectedBrandId;
  const list = await listMovements({
    scope: ctx.scope,
    brandId,
    type: sp.tipo ?? null,
    q: sp.q ?? null,
    period: sp.periodo ? resolvePeriod(sp.periodo) : null,
    page: Number(sp.pagina ?? 1) || 1,
  });
  const brands = new Map(ctx.brands.map((b) => [b.id, b]));
  return (
    <div>
      <PageHeader
        title="Histórico de movimentações"
        description="inventory_movements: tipo, produto, variação, quantidade, motivo, responsável, data e saldos antes/depois."
        crumbs={[{ href: "/admin/estoque", label: "Estoque" }, { label: "Histórico" }]}
        actions={can(ctx.auth.perms, "relatorios", "visualizar") ? <LinkButton href="/admin/relatorios/entradas">Relatórios de entradas e saídas</LinkButton> : null}
      />
      <Panel bodyClassName="p-0">
        <FilterBar>
          <FilterSearch value={sp.q} placeholder="Produto ou SKU" />
          <FilterSelect name="tipo" label="Tipo" value={sp.tipo} options={MOVEMENT_LABELS} />
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
        </FilterBar>
        {list.rows.length === 0 ? (
          <EmptyState title="Nenhuma movimentação encontrada" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Tipo</Th>
                <Th>Produto</Th>
                <Th>Marca</Th>
                <Th align="right">Qtd.</Th>
                <Th align="right">Saldo</Th>
                <Th>Motivo</Th>
                <Th>Responsável</Th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((m) => {
                const b = brands.get(m.brand_id);
                return (
                  <tr key={m.id}>
                    <Td>
                      <CellDate value={m.occurred_at} time />
                    </Td>
                    <Td>
                      <span className="flex items-center gap-1.5">
                        <Badge tone={m.quantity > 0 ? "success" : "warning"}>{MOVEMENT_LABELS[m.type as keyof typeof MOVEMENT_LABELS] ?? m.type}</Badge>
                        <DemoBadge show={m.is_demo} />
                      </span>
                    </Td>
                    <Td>
                      <Link href={`/admin/produtos/${m.product_id}`} className="hover:underline">
                        {m.product_name}
                      </Link>
                      <span className="block text-xs text-stone-500">
                        {[m.size, m.color, m.sku].filter(Boolean).join(" · ")} {m.location !== "principal" && `· ${m.location}`}
                      </span>
                    </Td>
                    <Td>{b ? <BrandTag name={b.name} slug={b.slug} /> : "—"}</Td>
                    <Td align="right" className={m.quantity > 0 ? "text-emerald-700" : "text-red-700"}>
                      {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                    </Td>
                    <Td align="right" className="whitespace-nowrap">
                      {m.balance_before} → {m.balance_after}
                    </Td>
                    <Td className="max-w-xs">
                      <span className="block truncate">{m.reason ?? "—"}</span>
                      {(m.supplier_name || m.total_cost) && (
                        <span className="block text-xs text-stone-500">
                          {[m.supplier_name, m.total_cost && `custo ${formatBRL(m.total_cost)}`].filter(Boolean).join(" · ")}
                        </span>
                      )}
                      {m.order_id && (
                        <Link href={`/admin/pedidos/${m.order_id}`} className="text-xs underline">
                          ver pedido
                        </Link>
                      )}
                    </Td>
                    <Td className="text-xs">{m.user_name ?? "Sistema"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <AdminPagination page={list.page} pages={list.pages} total={list.total} makeHref={(p) => hrefWith("/admin/estoque/historico", sp, { pagina: p })} />
      </Panel>
    </div>
  );
}
