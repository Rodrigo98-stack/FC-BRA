import Link from "next/link";
import { guard } from "@/server/admin";
import { can } from "@/server/rbac";
import { listVariants } from "@/server/services/products";
import { getStockAlerts } from "@/server/services/dashboard";
import { formatBRL, formatNumber, toNumber } from "@/lib/format";
import {
  BrandTag,
  EmptyState,
  FilterBar,
  FilterSearch,
  FilterSelect,
  Forbidden,
  Kpi,
  KpiStrip,
  LinkButton,
  PageHeader,
  Panel,
  Table,
  Td,
  Th,
} from "@/components/admin/ui";
import { StockBadge } from "@/components/admin/badges";

export const metadata = { title: "Estoque" };

type SP = Record<string, string | undefined>;

export default async function StockPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await guard("estoque");
  if (!ctx.allowed) return <Forbidden module="Estoque" />;
  const sp = await searchParams;
  const brandId = sp.marca ?? ctx.selectedBrandId;
  const [variants, alerts] = await Promise.all([
    listVariants({ scope: ctx.scope, brandId, q: sp.q ?? null, productId: sp.produto ?? null, limit: 1000 }),
    getStockAlerts(ctx.scope, brandId),
  ]);
  const situation = sp.situacao;
  const rows = variants.filter((v) => {
    if (situation === "esgotado") return v.stock <= 0;
    if (situation === "baixo") return v.stock > 0 && v.stock <= v.min_stock;
    if (situation === "alerta") return v.stock <= v.min_stock;
    return true;
  });
  const totalUnits = variants.reduce((a, v) => a + v.stock, 0);
  const valueAtCost = variants.reduce((a, v) => a + (v.cost_price === null ? 0 : v.stock * toNumber(v.cost_price)), 0);
  const missingCost = variants.filter((v) => v.cost_price === null && v.stock > 0).length;
  const brands = new Map(ctx.brands.map((b) => [b.id, b]));
  const canMove = can(ctx.auth.perms, "estoque", "editar") || can(ctx.auth.perms, "estoque", "criar");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Estoque"
        description="Saldo por variação. Toda alteração gera histórico com saldo antes/depois e responsável."
        actions={
          <>
            <LinkButton href="/admin/estoque/historico">Histórico</LinkButton>
            {can(ctx.auth.perms, "estoque", "criar") && <LinkButton href="/admin/estoque/entrada">Entrada de mercadoria</LinkButton>}
            {canMove && (
              <LinkButton href="/admin/estoque/movimentar" variant="primary">
                Nova movimentação
              </LinkButton>
            )}
          </>
        }
      />
      <KpiStrip cols={4}>
        <Kpi label="Peças em estoque" value={formatNumber(totalUnits)} hint={`${variants.length} variação(ões)`} />
        <Kpi label="Valor a custo" value={formatBRL(valueAtCost)} hint={missingCost ? `${missingCost} variação(ões) sem custo cadastrado` : "Custo informado em todas"} />
        <Kpi label="Estoque baixo" value={alerts.low.length} tone={alerts.low.length ? "warning" : undefined} />
        <Kpi label="Esgotados" value={alerts.out.length} tone={alerts.out.length ? "danger" : undefined} />
      </KpiStrip>
      <Panel bodyClassName="p-0">
        <FilterBar>
          <FilterSearch value={sp.q} placeholder="Produto, SKU, cor ou tamanho" />
          {ctx.visibleBrands.length > 1 && (
            <FilterSelect name="marca" label="Marca" value={brandId} allLabel="Todas" options={ctx.visibleBrands.map((b) => ({ value: b.id, label: b.name }))} />
          )}
          <FilterSelect
            name="situacao"
            label="Situação"
            value={situation}
            options={{ alerta: "Com alerta (baixo ou esgotado)", baixo: "Estoque baixo", esgotado: "Esgotado" }}
          />
        </FilterBar>
        {rows.length === 0 ? (
          <EmptyState title="Nenhuma variação encontrada" text="Cadastre produtos com variações para controlar o estoque." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Produto</Th>
                <Th>Variação</Th>
                <Th>SKU</Th>
                <Th>Marca</Th>
                <Th align="right">Mínimo</Th>
                <Th align="right">Saldo</Th>
                <Th align="right">
                  <span className="sr-only">Ações</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 300).map((v) => {
                const b = brands.get(v.brand_id);
                return (
                  <tr key={v.id} className="hover:bg-stone-50/60">
                    <Td>
                      <Link href={`/admin/produtos/${v.product_id}`} className="hover:underline">
                        {v.product_name}
                      </Link>
                      {!v.is_active && <span className="ml-2 text-xs text-stone-400">(inativa)</span>}
                    </Td>
                    <Td>{[v.size, v.color].filter(Boolean).join(" · ") || "Único"}</Td>
                    <Td className="text-xs text-stone-600">{v.sku}</Td>
                    <Td>{b ? <BrandTag name={b.name} slug={b.slug} /> : "—"}</Td>
                    <Td align="right">{v.min_stock}</Td>
                    <Td align="right">
                      <StockBadge stock={v.stock} min={v.min_stock} />
                    </Td>
                    <Td align="right">
                      {canMove && (
                        <LinkButton href={`/admin/estoque/movimentar?variante=${v.id}`} variant="ghost" className="py-1">
                          Movimentar
                        </LinkButton>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        {rows.length > 300 && <p className="border-t border-stone-200 px-4 py-3 text-xs text-stone-500">Mostrando 300 de {rows.length}. Use a busca para refinar.</p>}
      </Panel>
    </div>
  );
}
