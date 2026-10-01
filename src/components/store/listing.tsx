import Link from "next/link";
import type { Brand, Category } from "@/server/db/schema";
import { getFacets, getStoreCategories, listProducts, type ListFilters } from "@/server/services/catalog";
import { parseDecimal } from "@/server/validation";
import { ProductGrid, StorePagination } from "./ui";

export type SearchParams = Record<string, string | string[] | undefined>;

const arr = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean).slice(0, 20);
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const SORTS: { value: NonNullable<ListFilters["sort"]>; label: string }[] = [
  { value: "relevancia", label: "Relevância" },
  { value: "novidades", label: "Mais recentes" },
  { value: "menor_preco", label: "Menor preço" },
  { value: "maior_preco", label: "Maior preço" },
  { value: "mais_vendidos", label: "Mais vendidos" },
];

export async function CatalogListing({
  brand,
  category,
  title,
  intro,
  basePath,
  searchParams,
  query,
}: {
  brand: Brand;
  category: Category | null;
  title: string;
  intro?: string | null;
  basePath: string;
  searchParams: SearchParams;
  query?: string;
}) {
  const sizes = arr(searchParams.tamanho);
  const colors = arr(searchParams.cor);
  const min = parseDecimal(one(searchParams.min));
  const max = parseDecimal(one(searchParams.max));
  const sortParam = one(searchParams.ordem);
  const sort = (SORTS.find((s) => s.value === sortParam)?.value ?? "relevancia") as ListFilters["sort"];
  const page = Math.max(1, Number(one(searchParams.pagina)) || 1);
  const filters: ListFilters = {
    brandId: brand.id,
    category,
    q: query ?? null,
    sizes,
    colors,
    minPrice: Number.isFinite(min) ? min : null,
    maxPrice: Number.isFinite(max) ? max : null,
    availableOnly: one(searchParams.disponivel) === "1",
    newOnly: one(searchParams.novidades) === "1",
    saleOnly: one(searchParams.promocoes) === "1",
    sort,
    page,
    perPage: 24,
  };
  // Na busca (sem categoria fixa), a categoria vira um filtro (§7).
  const storeCategories = category ? [] : (await getStoreCategories(brand.id)).filter((c) => c.kind === "padrao");
  const chosenCategory = !category ? storeCategories.find((c) => c.slug === one(searchParams.categoria)) ?? null : null;
  if (chosenCategory) filters.category = chosenCategory;
  const [result, facets] = await Promise.all([listProducts(filters), getFacets(brand.id, category ?? chosenCategory)]);

  const keep = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (k === "pagina") continue;
    for (const item of arr(v)) keep.append(k, item);
  }
  const makeHref = (p: number) => {
    const q = new URLSearchParams(keep);
    if (p > 1) q.set("pagina", String(p));
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const activeCount =
    (chosenCategory ? 1 : 0) +
    sizes.length + colors.length + (filters.minPrice != null ? 1 : 0) + (filters.maxPrice != null ? 1 : 0) +
    (filters.availableOnly ? 1 : 0) + (filters.newOnly ? 1 : 0) + (filters.saleOnly ? 1 : 0);

  const filterForm = (
    <form action={basePath} className="space-y-8 text-sm">
      {query !== undefined && <input type="hidden" name="q" value={query} />}
      <input type="hidden" name="ordem" value={sort} />
      {storeCategories.length > 0 && (
        <fieldset>
          <legend className="mb-3 font-medium">Categoria</legend>
          <select name="categoria" defaultValue={chosenCategory?.slug ?? ""} className="store-input py-2 text-sm">
            <option value="" style={{ color: "#111" }}>Todas</option>
            {storeCategories.map((c) => (
              <option key={c.id} value={c.slug} style={{ color: "#111" }}>
                {c.name}
              </option>
            ))}
          </select>
        </fieldset>
      )}
      <fieldset>
        <legend className="mb-3 font-medium">Preço</legend>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="f-min">Mínimo</label>
          <input id="f-min" name="min" inputMode="decimal" defaultValue={one(searchParams.min)} placeholder={facets.priceMin != null ? `R$ ${facets.priceMin}` : "Mín."} className="store-input py-2 text-sm" />
          <span className="muted">a</span>
          <label className="sr-only" htmlFor="f-max">Máximo</label>
          <input id="f-max" name="max" inputMode="decimal" defaultValue={one(searchParams.max)} placeholder={facets.priceMax != null ? `R$ ${facets.priceMax}` : "Máx."} className="store-input py-2 text-sm" />
        </div>
      </fieldset>
      {facets.sizes.length > 0 && (
        <fieldset>
          <legend className="mb-3 font-medium">Tamanho</legend>
          <div className="flex flex-wrap gap-2">
            {facets.sizes.map((s) => (
              <label key={s} className="cursor-pointer">
                <input type="checkbox" name="tamanho" value={s} defaultChecked={sizes.includes(s)} className="peer sr-only" />
                <span className="inline-block min-w-10 border hairline px-2.5 py-1.5 text-center text-[13px] peer-checked:border-current peer-checked:bg-[var(--brand-text)] peer-checked:text-[var(--brand-bg)] peer-focus-visible:outline">
                  {s}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {facets.colors.length > 0 && (
        <fieldset>
          <legend className="mb-3 font-medium">Cor</legend>
          <div className="space-y-2">
            {facets.colors.map((c) => (
              <label key={c.name} className="flex cursor-pointer items-center gap-2.5">
                <input type="checkbox" name="cor" value={c.name} defaultChecked={colors.includes(c.name)} className="accent-[var(--brand-text)]" />
                <span className="h-3.5 w-3.5 rounded-full border hairline" style={{ background: c.hex ?? "transparent" }} aria-hidden />
                {c.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset className="space-y-2">
        <legend className="mb-3 font-medium">Mostrar</legend>
        <label className="flex cursor-pointer items-center gap-2.5">
          <input type="checkbox" name="disponivel" value="1" defaultChecked={filters.availableOnly} className="accent-[var(--brand-text)]" /> Somente disponíveis
        </label>
        {category?.kind !== "novidades" && (
          <label className="flex cursor-pointer items-center gap-2.5">
            <input type="checkbox" name="novidades" value="1" defaultChecked={filters.newOnly} className="accent-[var(--brand-text)]" /> Novidades
          </label>
        )}
        {category?.kind !== "promocoes" && (
          <label className="flex cursor-pointer items-center gap-2.5">
            <input type="checkbox" name="promocoes" value="1" defaultChecked={filters.saleOnly} className="accent-[var(--brand-text)]" /> Em promoção
          </label>
        )}
      </fieldset>
      <div className="flex items-center gap-4">
        <button type="submit" className="btn-brand px-5 py-2.5">Aplicar</button>
        {activeCount > 0 && (
          <Link href={query !== undefined ? `${basePath}?q=${encodeURIComponent(query)}` : basePath} className="muted underline underline-offset-4">
            Limpar
          </Link>
        )}
      </div>
    </form>
  );

  return (
    <div className="mx-auto max-w-[1400px] px-5 pb-8 pt-10 lg:px-10 lg:pt-14">
      <nav aria-label="Trilha" className="muted mb-6 text-xs">
        <Link href={`/${brand.slug}`} className="hover:underline">{brand.name}</Link>
        <span className="mx-2">/</span>
        <span aria-current="page">{title}</span>
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-6 border-b hairline pb-8">
        <div>
          <h1 className="font-display text-5xl leading-none lg:text-6xl">{title}</h1>
          {intro && <p className="muted mt-4 max-w-xl text-[15px] leading-relaxed">{intro}</p>}
          <p className="muted mt-4 text-sm tabular-nums">
            {result.total} {result.total === 1 ? "produto" : "produtos"}
          </p>
        </div>
        <form action={basePath} className="flex items-center gap-2 text-sm">
          {[...keep.entries()].filter(([k]) => k !== "ordem").map(([k, v], i) => (
            <input key={`${k}-${i}`} type="hidden" name={k} value={v} />
          ))}
          <label htmlFor="ordem" className="muted">Ordenar por</label>
          <select id="ordem" name="ordem" defaultValue={sort} className="border-b hairline bg-transparent py-1.5 pr-1 outline-none">
            {SORTS.map((s) => (
              <option key={s.value} value={s.value} style={{ color: "#111" }}>{s.label}</option>
            ))}
          </select>
          <button type="submit" className="underline underline-offset-4">Ok</button>
        </form>
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[220px_1fr] lg:gap-14">
        <aside>
          <details className="lg:hidden" open={activeCount > 0 ? undefined : undefined}>
            <summary className="cursor-pointer list-none border hairline px-4 py-3 text-sm">
              Filtrar {activeCount > 0 && <span className="muted">({activeCount})</span>}
            </summary>
            <div className="pt-6">{filterForm}</div>
          </details>
          <div className="hidden lg:block">{filterForm}</div>
        </aside>
        <div>
          {result.items.length ? (
            <ProductGrid brand={brand.slug} products={result.items} />
          ) : (
            <div className="border hairline px-6 py-20 text-center">
              <p className="font-display text-3xl">Nenhum produto encontrado</p>
              <p className="muted mx-auto mt-3 max-w-sm text-sm">
                {activeCount > 0 || query ? "Tente remover alguns filtros ou buscar por outro termo." : "Ainda não há produtos publicados nesta categoria."}
              </p>
            </div>
          )}
          <StorePagination page={result.page} pages={result.pages} makeHref={makeHref} />
        </div>
      </div>
    </div>
  );
}
