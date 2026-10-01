import Link from "next/link";
import { guard } from "@/server/admin";
import { can } from "@/server/rbac";
import { listAdminProducts } from "@/server/services/products";
import { formOptions } from "@/server/resources";
import { formatBRL, formatPercent } from "@/lib/format";
import { PRODUCT_STATUS_LABELS } from "@/lib/domain";
import {
  AdminPagination,
  BrandTag,
  DemoBadge,
  EmptyState,
  FilterBar,
  FilterSearch,
  FilterSelect,
  Forbidden,
  hrefWith,
  LinkButton,
  Money,
  PageHeader,
  Panel,
  Table,
  Td,
  Th,
} from "@/components/admin/ui";
import { ProductStatusBadge, StockBadge } from "@/components/admin/badges";

export const metadata = { title: "Produtos" };

type SP = Record<string, string | undefined>;

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await guard("produtos");
  if (!ctx.allowed) return <Forbidden module="Produtos" />;
  const sp = await searchParams;
  const brandId = sp.marca ?? ctx.selectedBrandId;
  const [list, options] = await Promise.all([
    listAdminProducts({
      scope: ctx.scope,
      brandId,
      categoryId: sp.categoria ?? null,
      status: sp.status ?? null,
      stock: sp.estoque === "baixo" || sp.estoque === "esgotado" ? sp.estoque : null,
      q: sp.q ?? null,
      page: Number(sp.pagina ?? 1) || 1,
    }),
    formOptions(ctx.auth, "produtos"),
  ]);
  const brands = new Map(ctx.brands.map((b) => [b.id, b]));
  const categoryOptions = options.categories
    .filter((c) => c.kind === "padrao" && (!brandId || c.brandId === brandId))
    .map((c) => ({ value: c.id, label: `${c.name}${brandId ? "" : ` · ${brands.get(c.brandId)?.name ?? ""}`}` }));

  return (
    <div>
      <PageHeader
        title="Produtos"
        description="Catálogo das duas lojas. Produtos, estoque e métricas nunca se misturam entre marcas."
        actions={
          <>
            {can(ctx.auth.perms, "relatorios", "visualizar") && <LinkButton href="/admin/relatorios/produtos">Exportar</LinkButton>}
            {can(ctx.auth.perms, "produtos", "criar") && (
              <LinkButton href="/admin/produtos/novo" variant="primary">
                Novo produto
              </LinkButton>
            )}
          </>
        }
      />
      <Panel bodyClassName="p-0">
        <FilterBar>
          <FilterSearch value={sp.q} placeholder="Nome ou SKU" />
          {ctx.visibleBrands.length > 1 && (
            <FilterSelect name="marca" label="Marca" value={brandId} allLabel="Todas" options={ctx.visibleBrands.map((b) => ({ value: b.id, label: b.name }))} />
          )}
          <FilterSelect name="categoria" label="Categoria" value={sp.categoria} allLabel="Todas" options={categoryOptions} />
          <FilterSelect name="status" label="Status" value={sp.status} options={PRODUCT_STATUS_LABELS} />
          <FilterSelect name="estoque" label="Estoque" value={sp.estoque} options={{ baixo: "Estoque baixo", esgotado: "Esgotado" }} />
        </FilterBar>
        {list.rows.length === 0 ? (
          <EmptyState
            title={sp.q || sp.status || sp.estoque ? "Nenhum produto com esses filtros" : "Nenhum produto cadastrado"}
            text="Cadastre produtos com variações (tamanho, cor), preços e estoque."
            action={can(ctx.auth.perms, "produtos", "criar") ? <LinkButton href="/admin/produtos/novo" variant="primary">Cadastrar produto</LinkButton> : undefined}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Produto</Th>
                <Th>Marca</Th>
                <Th>Categoria</Th>
                <Th align="right">Preço</Th>
                <Th align="right">Custo</Th>
                <Th align="right">Margem</Th>
                <Th align="right">Estoque</Th>
                <Th align="right">Vendidos</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((p) => {
                const b = brands.get(p.brand_id);
                return (
                  <tr key={p.id} className="hover:bg-stone-50/60">
                    <Td>
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-10 shrink-0 overflow-hidden rounded bg-stone-100">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {p.image && <img src={p.image} alt="" className="h-full w-full object-cover" />}
                        </div>
                        <div className="min-w-0">
                          <Link href={`/admin/produtos/${p.id}`} className="block max-w-xs truncate font-medium text-stone-900 hover:underline">
                            {p.name}
                          </Link>
                          <span className="flex items-center gap-2 text-xs text-stone-500">
                            {p.sku} · {p.variants} variação(ões) <DemoBadge show={p.is_demo} />
                          </span>
                        </div>
                      </div>
                    </Td>
                    <Td>{b ? <BrandTag name={b.name} slug={b.slug} /> : "—"}</Td>
                    <Td>{p.category_name ?? <span className="text-stone-400">—</span>}</Td>
                    <Td align="right">
                      {p.promo_price ? (
                        <>
                          {formatBRL(p.promo_price)}
                          <s className="block text-xs text-stone-400">{formatBRL(p.sale_price)}</s>
                        </>
                      ) : (
                        formatBRL(p.sale_price)
                      )}
                    </Td>
                    <Td align="right">
                      <Money value={p.cost_price} empty="—" />
                    </Td>
                    <Td align="right">{p.margin_percent === null ? <span className="text-stone-400">—</span> : formatPercent(p.margin_percent)}</Td>
                    <Td align="right">
                      <StockBadge stock={p.stock} min={p.min_stock} />
                    </Td>
                    <Td align="right">{p.quantity_sold}</Td>
                    <Td>
                      <ProductStatusBadge status={p.status} />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <AdminPagination page={list.page} pages={list.pages} total={list.total} makeHref={(p) => hrefWith("/admin/produtos", sp, { pagina: p })} />
      </Panel>
    </div>
  );
}
