import Link from "next/link";
import { guard } from "@/server/admin";
import { listVariants } from "@/server/services/products";
import { formatBRL } from "@/lib/format";
import { Badge, BrandTag, EmptyState, FilterBar, FilterSearch, FilterSelect, Forbidden, PageHeader, Panel, Table, Td, Th } from "@/components/admin/ui";
import { StockBadge } from "@/components/admin/badges";

export const metadata = { title: "Variações" };

type SP = Record<string, string | undefined>;

export default async function VariantsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await guard("produtos");
  if (!ctx.allowed) return <Forbidden module="Variações" />;
  const sp = await searchParams;
  const brandId = sp.marca ?? ctx.selectedBrandId;
  const rows = await listVariants({ scope: ctx.scope, brandId, q: sp.q ?? null, limit: 1000 });
  const sizes = new Map<string, number>();
  const colors = new Map<string, { hex: string | null; n: number }>();
  for (const r of rows) {
    if (r.size) sizes.set(r.size, (sizes.get(r.size) ?? 0) + 1);
    if (r.color) colors.set(r.color, { hex: r.color_hex, n: (colors.get(r.color)?.n ?? 0) + 1 });
  }
  const brands = new Map(ctx.brands.map((b) => [b.id, b]));
  return (
    <div className="space-y-6">
      <PageHeader
        title="Variações"
        description="Todas as combinações de tamanho e cor, com SKU, preço e estoque próprios. Edite as variações no cadastro do produto."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Tamanhos em uso">
          {sizes.size ? (
            <div className="flex flex-wrap gap-2">
              {[...sizes.entries()].map(([s, n]) => (
                <Badge key={s}>
                  {s} · {n}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-stone-500">Nenhum tamanho cadastrado.</p>
          )}
        </Panel>
        <Panel title="Cores em uso">
          {colors.size ? (
            <div className="flex flex-wrap gap-2">
              {[...colors.entries()].map(([c, { hex, n }]) => (
                <span key={c} className="inline-flex items-center gap-1.5 rounded border border-stone-200 px-2 py-0.5 text-xs">
                  <span className="h-3 w-3 rounded-full border border-stone-300" style={{ background: hex ?? "transparent" }} aria-hidden />
                  {c} · {n}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-stone-500">Nenhuma cor cadastrada.</p>
          )}
        </Panel>
      </div>
      <Panel bodyClassName="p-0">
        <FilterBar>
          <FilterSearch value={sp.q} placeholder="Produto, SKU, cor ou tamanho" />
          {ctx.visibleBrands.length > 1 && (
            <FilterSelect name="marca" label="Marca" value={brandId} allLabel="Todas" options={ctx.visibleBrands.map((b) => ({ value: b.id, label: b.name }))} />
          )}
        </FilterBar>
        {rows.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Produto</Th>
                <Th>Tamanho</Th>
                <Th>Cor</Th>
                <Th>SKU</Th>
                <Th>Marca</Th>
                <Th align="right">Preço</Th>
                <Th align="right">Estoque</Th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 400).map((v) => {
                const b = brands.get(v.brand_id);
                return (
                  <tr key={v.id}>
                    <Td>
                      <Link href={`/admin/produtos/${v.product_id}`} className="hover:underline">
                        {v.product_name}
                      </Link>
                    </Td>
                    <Td>{v.size ?? "—"}</Td>
                    <Td>
                      <span className="inline-flex items-center gap-1.5">
                        {v.color_hex && <span className="h-3 w-3 rounded-full border border-stone-300" style={{ background: v.color_hex }} aria-hidden />}
                        {v.color ?? "—"}
                      </span>
                    </Td>
                    <Td className="text-xs text-stone-600">{v.sku}</Td>
                    <Td>{b ? <BrandTag name={b.name} slug={b.slug} /> : "—"}</Td>
                    <Td align="right">{formatBRL(v.price)}</Td>
                    <Td align="right">
                      <StockBadge stock={v.stock} min={v.min_stock} />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="Nenhuma variação" />
        )}
      </Panel>
    </div>
  );
}
