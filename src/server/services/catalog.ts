/**
 * Catálogo da loja (leitura pública): listagem com filtros (§7), página de
 * produto (§6.3), busca e facetas. Somente produtos ATIVOS, da marca pedida —
 * marcas nunca se misturam (§1.2).
 */
import { requestCache } from "../cache";
import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { getDb, rowsOf, schema } from "../db";
import type { Category } from "../db/schema";
import { toNumber } from "@/lib/format";

const { products, productVariants, productImages, categories, inventory } = schema;

export const RESERVED_SLUGS = ["carrinho", "checkout", "busca", "pedido", "politicas", "produto", "sitemap.xml", "admin", "api"];

export type ProductCard = {
  id: string;
  slug: string;
  name: string;
  categorySlug: string;
  categoryName: string | null;
  salePrice: number;
  promoPrice: number | null;
  price: number;
  image: string | null;
  imageAlt: string | null;
  /** Segunda foto (troca ao passar o mouse no card). */
  image2: string | null;
  isNew: boolean;
  isDemo: boolean;
  stock: number;
  colors: { name: string | null; hex: string | null }[];
};

export type ListFilters = {
  brandId: string;
  category?: Pick<Category, "id" | "kind"> | null;
  q?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  sizes?: string[];
  colors?: string[];
  availableOnly?: boolean;
  newOnly?: boolean;
  saleOnly?: boolean;
  sort?: "relevancia" | "novidades" | "menor_preco" | "maior_preco" | "mais_vendidos";
  page?: number;
  perPage?: number;
};

export const getNewProductDays = requestCache(async () => {
  const db = await getDb();
  const [row] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, "general"));
  return Number((row?.value as { new_product_days?: number } | undefined)?.new_product_days ?? 30);
});

const effectivePrice = sql`coalesce(${products.promoPrice}, ${products.salePrice})`;
const stockExpr = sql<number>`coalesce((
  select sum(i.quantity) from public.inventory i
  join public.product_variants v on v.id = i.variant_id
  where v.product_id = ${products.id} and v.deleted_at is null and v.is_active
), 0)`;

function likeEscape(s: string) {
  return `%${s.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}

async function newCondition(): Promise<SQL> {
  const days = await getNewProductDays();
  return sql`(${products.isNew} or ${products.createdAt} > now() - make_interval(days => ${days}))`;
}

export async function listProducts(f: ListFilters) {
  const db = await getDb();
  const where: SQL[] = [eq(products.brandId, f.brandId), eq(products.status, "ativo"), isNull(products.deletedAt)];

  if (f.category) {
    if (f.category.kind === "novidades") where.push(await newCondition());
    else if (f.category.kind === "promocoes") where.push(sql`${products.promoPrice} is not null`);
    else where.push(sql`(${products.categoryId} = ${f.category.id} or ${products.subcategoryId} = ${f.category.id})`);
  }
  if (f.newOnly) where.push(await newCondition());
  if (f.saleOnly) where.push(sql`${products.promoPrice} is not null`);
  if (f.q && f.q.trim()) {
    const term = likeEscape(f.q.trim().slice(0, 80));
    where.push(sql`(
      ${products.name} ilike ${term} or ${products.sku} ilike ${term} or coalesce(${products.tags}, '') ilike ${term}
      or coalesce(${products.material}, '') ilike ${term} or coalesce(${products.shortDescription}, '') ilike ${term}
      or exists (select 1 from public.categories c where c.id = ${products.categoryId} and c.name ilike ${term})
      or exists (select 1 from public.product_variants v where v.product_id = ${products.id} and v.deleted_at is null
                 and (v.sku ilike ${term} or coalesce(v.color, '') ilike ${term}))
    )`);
  }
  if (f.minPrice != null) where.push(sql`${effectivePrice} >= ${f.minPrice}`);
  if (f.maxPrice != null) where.push(sql`${effectivePrice} <= ${f.maxPrice}`);
  if (f.sizes?.length) {
    where.push(sql`exists (select 1 from public.product_variants v where v.product_id = ${products.id}
      and v.deleted_at is null and v.is_active and v.size in (${sql.join(f.sizes.map((s) => sql`${s}`), sql`, `)}))`);
  }
  if (f.colors?.length) {
    where.push(sql`exists (select 1 from public.product_variants v where v.product_id = ${products.id}
      and v.deleted_at is null and v.is_active and v.color in (${sql.join(f.colors.map((s) => sql`${s}`), sql`, `)}))`);
  }
  if (f.availableOnly) where.push(sql`${stockExpr} > 0`);

  const orderBy = (() => {
    switch (f.sort) {
      case "novidades":
        return [desc(products.createdAt)];
      case "menor_preco":
        return [asc(effectivePrice), asc(products.name)];
      case "maior_preco":
        return [desc(effectivePrice), asc(products.name)];
      case "mais_vendidos":
        return [desc(products.quantitySold), desc(products.createdAt)];
      default:
        return [desc(products.isFeatured), desc(products.createdAt)];
    }
  })();

  const perPage = Math.min(Math.max(f.perPage ?? 24, 1), 60);
  const page = Math.max(f.page ?? 1, 1);
  const condition = and(...where);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(condition);

  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      salePrice: products.salePrice,
      promoPrice: products.promoPrice,
      isNew: products.isNew,
      createdAt: products.createdAt,
      isDemo: products.isDemo,
      categorySlug: categories.slug,
      categoryName: categories.name,
      stock: stockExpr,
    })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(condition)
    .orderBy(...orderBy)
    .limit(perPage)
    .offset((page - 1) * perPage);

  const items = await hydrateCards(rows);
  return { items, total: Number(count), page, perPage, pages: Math.max(1, Math.ceil(Number(count) / perPage)) };
}

async function hydrateCards(
  rows: {
    id: string;
    slug: string;
    name: string;
    salePrice: string;
    promoPrice: string | null;
    isNew: boolean;
    createdAt: Date;
    isDemo: boolean;
    categorySlug: string | null;
    categoryName: string | null;
    stock: number;
  }[],
): Promise<ProductCard[]> {
  if (!rows.length) return [];
  const db = await getDb();
  const ids = rows.map((r) => r.id);
  const days = await getNewProductDays();
  const [images, variants] = await Promise.all([
    db
      .select({ productId: productImages.productId, url: productImages.url, alt: productImages.alt })
      .from(productImages)
      .where(inArray(productImages.productId, ids))
      .orderBy(asc(productImages.sortOrder)),
    db
      .select({ productId: productVariants.productId, color: productVariants.color, hex: productVariants.colorHex })
      .from(productVariants)
      .where(and(inArray(productVariants.productId, ids), isNull(productVariants.deletedAt), eq(productVariants.isActive, true)))
      .orderBy(asc(productVariants.sortOrder)),
  ]);
  const newSince = Date.now() - days * 86400_000;
  return rows.map((r) => {
    const own = images.filter((i) => i.productId === r.id);
    const img = own[0];
    const colorMap = new Map<string, { name: string | null; hex: string | null }>();
    for (const v of variants.filter((v) => v.productId === r.id)) {
      const key = `${v.color ?? ""}|${v.hex ?? ""}`;
      if ((v.color || v.hex) && !colorMap.has(key)) colorMap.set(key, { name: v.color, hex: v.hex });
    }
    const sale = toNumber(r.salePrice);
    const promo = r.promoPrice === null ? null : toNumber(r.promoPrice);
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      categorySlug: r.categorySlug ?? "produto",
      categoryName: r.categoryName,
      salePrice: sale,
      promoPrice: promo,
      price: promo ?? sale,
      image: img?.url ?? null,
      imageAlt: img?.alt ?? r.name,
      image2: own[1]?.url ?? null,
      isNew: r.isNew || r.createdAt.getTime() > newSince,
      isDemo: r.isDemo,
      stock: Number(r.stock),
      colors: [...colorMap.values()].slice(0, 6),
    };
  });
}

export const getStoreCategories = requestCache(async (brandId: string) => {
  const db = await getDb();
  return db
    .select()
    .from(categories)
    .where(and(eq(categories.brandId, brandId), eq(categories.isActive, true), isNull(categories.deletedAt)))
    .orderBy(asc(categories.sortOrder), asc(categories.name));
});

export async function getCategoryBySlug(brandId: string, slug: string) {
  const list = await getStoreCategories(brandId);
  return list.find((c) => c.slug === slug) ?? null;
}

/** Tamanhos, cores e faixa de preço disponíveis (para os filtros). */
export async function getFacets(brandId: string, category?: Pick<Category, "id" | "kind"> | null) {
  const db = await getDb();
  const catCond =
    !category || category.kind !== "padrao"
      ? sql`true`
      : sql`(p.category_id = ${category.id} or p.subcategory_id = ${category.id})`;
  const kindCond =
    category?.kind === "promocoes" ? sql`p.promo_price is not null` : sql`true`;
  const res = await db.execute(sql`
    select v.size, v.color, v.color_hex
    from public.product_variants v
    join public.products p on p.id = v.product_id
    where p.brand_id = ${brandId} and p.status = 'ativo' and p.deleted_at is null
      and v.deleted_at is null and v.is_active and ${catCond} and ${kindCond}`);
  const price = await db.execute(sql`
    select min(coalesce(p.promo_price, p.sale_price)) as min, max(coalesce(p.promo_price, p.sale_price)) as max
    from public.products p
    where p.brand_id = ${brandId} and p.status = 'ativo' and p.deleted_at is null and ${catCond} and ${kindCond}`);
  const rows = rowsOf<{ size: string | null; color: string | null; color_hex: string | null }>(res);
  const sizeOrder = ["PP", "P", "M", "G", "GG", "XG", "XGG", "U"];
  const sizes = [...new Set(rows.map((r) => r.size).filter((s): s is string => !!s))].sort((a, b) => {
    const ia = sizeOrder.indexOf(a);
    const ib = sizeOrder.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    const na = Number(a);
    const nb = Number(b);
    return Number.isFinite(na) && Number.isFinite(nb) ? na - nb : a.localeCompare(b);
  });
  const colorMap = new Map<string, string | null>();
  for (const r of rows) if (r.color && !colorMap.has(r.color)) colorMap.set(r.color, r.color_hex);
  const p = rowsOf<{ min: string | null; max: string | null }>(price)[0];
  return {
    sizes,
    colors: [...colorMap.entries()].map(([name, hex]) => ({ name, hex })),
    priceMin: p?.min ? Math.floor(toNumber(p.min)) : null,
    priceMax: p?.max ? Math.ceil(toNumber(p.max)) : null,
  };
}

export type ProductPage = NonNullable<Awaited<ReturnType<typeof getProductPage>>>;

export async function getProductPage(brandId: string, productSlug: string) {
  const db = await getDb();
  const [product] = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.brandId, brandId),
        eq(products.slug, productSlug),
        eq(products.status, "ativo"),
        isNull(products.deletedAt),
      ),
    )
    .limit(1);
  if (!product) return null;

  const [images, variantRows, category] = await Promise.all([
    db.select().from(productImages).where(eq(productImages.productId, product.id)).orderBy(asc(productImages.sortOrder)),
    db
      .select({
        id: productVariants.id,
        size: productVariants.size,
        color: productVariants.color,
        colorHex: productVariants.colorHex,
        sku: productVariants.sku,
        priceOverride: productVariants.priceOverride,
        imageUrl: productVariants.imageUrl,
        stock: sql<number>`coalesce((select sum(i.quantity) from public.inventory i where i.variant_id = ${productVariants.id}), 0)`,
      })
      .from(productVariants)
      .where(
        and(eq(productVariants.productId, product.id), isNull(productVariants.deletedAt), eq(productVariants.isActive, true)),
      )
      .orderBy(asc(productVariants.sortOrder)),
    product.categoryId
      ? db.select().from(categories).where(eq(categories.id, product.categoryId)).then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);

  const sale = toNumber(product.salePrice);
  const promo = product.promoPrice === null ? null : toNumber(product.promoPrice);
  const variants = variantRows.map((v) => ({
    ...v,
    stock: Number(v.stock),
    price: v.priceOverride !== null ? toNumber(v.priceOverride) : (promo ?? sale),
  }));

  const days = await getNewProductDays();
  return {
    product,
    category,
    images,
    variants,
    salePrice: sale,
    promoPrice: promo,
    price: promo ?? sale,
    stock: variants.reduce((s, v) => s + v.stock, 0),
    isNew: product.isNew || product.createdAt.getTime() > Date.now() - days * 86400_000,
  };
}

/** Relacionados: mesma categoria. Semelhantes: faixa de preço parecida em outras categorias. */
export async function getRelatedProducts(page: ProductPage) {
  const { product, price } = page;
  const [related, similar] = await Promise.all([
    product.categoryId
      ? listProducts({
          brandId: product.brandId,
          category: { id: product.categoryId, kind: "padrao" },
          perPage: 5,
          sort: "mais_vendidos",
        })
      : Promise.resolve({ items: [] as ProductCard[] }),
    listProducts({
      brandId: product.brandId,
      minPrice: Math.floor(price * 0.7),
      maxPrice: Math.ceil(price * 1.3),
      perPage: 9,
    }),
  ]);
  const relatedItems = related.items.filter((p) => p.id !== product.id).slice(0, 4);
  const taken = new Set([product.id, ...relatedItems.map((p) => p.id)]);
  const similarItems = similar.items.filter((p) => !taken.has(p.id)).slice(0, 4);
  return { related: relatedItems, similar: similarItems };
}

export async function getActiveBanners(brandId: string, placement: string, categoryId?: string | null) {
  const db = await getDb();
  const { banners } = schema;
  return db
    .select()
    .from(banners)
    .where(
      and(
        eq(banners.brandId, brandId),
        eq(banners.placement, placement),
        eq(banners.isActive, true),
        isNull(banners.deletedAt),
        sql`(${banners.startsAt} is null or ${banners.startsAt} <= now())`,
        sql`(${banners.endsAt} is null or ${banners.endsAt} >= now())`,
        categoryId ? sql`(${banners.categoryId} is null or ${banners.categoryId} = ${categoryId})` : sql`true`,
      ),
    )
    .orderBy(asc(banners.sortOrder));
}

/** Para o sitemap.xml. */
export async function listSitemapEntries(brandId: string) {
  const db = await getDb();
  return db
    .select({ slug: products.slug, updatedAt: products.updatedAt, categorySlug: categories.slug })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(and(eq(products.brandId, brandId), eq(products.status, "ativo"), isNull(products.deletedAt)))
    .orderBy(desc(products.updatedAt))
    .limit(5000);
}

export { inventory };
