/**
 * Cadastro de produtos no painel (§6): produto base + variações
 * independentes (estoque, SKU, preço e imagem próprios) + galeria.
 * Estoque de variações existentes só muda por movimentação (§13).
 */
import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, rowsOf, schema, write } from "../db";
import { AppError, notFound } from "../errors";
import { audit, diff } from "../audit";
import { assertCan, can } from "../rbac";
import type { AuthContext } from "../auth/session";
import { applyMovement } from "./inventory";
import { brandSql, likeTerm } from "../sql";
import { RESERVED_SLUGS } from "./catalog";
import { slugify } from "@/lib/text";
import {
  zBool,
  zHexColor,
  zInt,
  zMoney,
  zOptionalInt,
  zOptionalMoney,
  zOptionalText,
  zOptionalUrl,
  zOptionalUuid,
  zRequired,
} from "../validation";

const { products, productVariants, productImages, categories, inventory } = schema;

export const variantSchema = z.object({
  id: zOptionalUuid,
  size: zOptionalText(40),
  color: zOptionalText(60),
  colorHex: zHexColor,
  sku: zRequired("SKU da variação", 80),
  priceOverride: zOptionalMoney("Preço da variação"),
  minStock: zInt("Estoque mínimo da variação"),
  weightGrams: zOptionalInt("Peso"),
  dimensions: zOptionalText(80),
  imageUrl: zOptionalUrl,
  isActive: zBool,
  initialStock: zOptionalInt("Estoque inicial"),
});

export const productSchema = z
  .object({
    brandId: z.string().uuid("Escolha a marca."),
    categoryId: z.string().uuid("Escolha a categoria."),
    subcategoryId: zOptionalUuid,
    name: zRequired("Nome", 160),
    sku: zRequired("SKU", 80),
    slug: zOptionalText(80),
    shortDescription: zOptionalText(300),
    longDescription: zOptionalText(8000),
    costPrice: zOptionalMoney("Preço de custo"),
    salePrice: zMoney("Preço de venda"),
    promoPrice: zOptionalMoney("Preço promocional"),
    material: zOptionalText(120),
    supplierId: zOptionalUuid,
    minStock: zInt("Estoque mínimo"),
    videoUrl: zOptionalUrl,
    status: z.enum(["ativo", "inativo", "rascunho"]),
    isNew: zBool,
    isFeatured: zBool,
    tags: zOptionalText(300),
    seoTitle: zOptionalText(120),
    seoDescription: zOptionalText(300),
    images: z.array(z.object({ url: z.string().min(1).max(1000), alt: zOptionalText(200) })).max(20),
    variants: z.array(variantSchema).min(1, "Cadastre pelo menos uma variação (ex.: tamanho/cor ou “Único”)."),
  })
  .superRefine((p, ctx) => {
    if (p.promoPrice != null && p.promoPrice >= p.salePrice) {
      ctx.addIssue({ code: "custom", path: ["promoPrice"], message: "O preço promocional deve ser menor que o preço de venda." });
    }
    const skus = new Set<string>();
    p.variants.forEach((v, i) => {
      const key = v.sku.toLowerCase();
      if (skus.has(key)) ctx.addIssue({ code: "custom", path: ["variants", i, "sku"], message: "SKU repetido entre variações." });
      skus.add(key);
    });
  });
export type ProductInput = z.infer<typeof productSchema>;

const money = (v: number | null | undefined) => (v === null || v === undefined ? null : v.toFixed(2));

export async function saveProduct(auth: AuthContext, productId: string | null, raw: unknown) {
  const input = productSchema.parse(raw);
  assertCan(auth.perms, "produtos", productId ? "editar" : "criar", input.brandId);
  const actor = { id: auth.user.id, fullName: auth.user.fullName, email: auth.user.email };

  return write(async (tx) => {
    const [category] = await tx
      .select()
      .from(categories)
      .where(and(eq(categories.id, input.categoryId), isNull(categories.deletedAt)));
    if (!category || category.brandId !== input.brandId) {
      throw new AppError("A categoria escolhida não pertence a esta marca.", "app_error", { categoryId: "Categoria inválida." });
    }
    if (category.kind !== "padrao") {
      throw new AppError("Novidades e Promoções são automáticas — escolha uma categoria comum.", "app_error", {
        categoryId: "Escolha uma categoria comum.",
      });
    }
    if (input.subcategoryId) {
      const [sub] = await tx.select().from(categories).where(eq(categories.id, input.subcategoryId));
      if (!sub || sub.brandId !== input.brandId) throw new AppError("Subcategoria inválida.");
    }

    const slug = slugify(input.slug || input.name);
    if (!slug) throw new AppError("Não foi possível gerar o endereço (slug) do produto.");
    const slugTaken = await tx
      .select({ id: products.id })
      .from(products)
      .where(
        and(
          eq(products.brandId, input.brandId),
          eq(products.slug, slug),
          isNull(products.deletedAt),
          productId ? ne(products.id, productId) : sql`true`,
        ),
      );
    if (slugTaken.length) throw new AppError("Já existe um produto com este endereço (slug) nesta marca.", "conflict", { slug: "Em uso." });

    const values = {
      brandId: input.brandId,
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId ?? null,
      name: input.name,
      sku: input.sku,
      slug,
      shortDescription: input.shortDescription ?? null,
      longDescription: input.longDescription ?? null,
      costPrice: money(input.costPrice),
      salePrice: money(input.salePrice)!,
      promoPrice: money(input.promoPrice),
      material: input.material ?? null,
      supplierId: input.supplierId ?? null,
      minStock: input.minStock,
      videoUrl: input.videoUrl ?? null,
      status: input.status,
      isNew: input.isNew,
      isFeatured: input.isFeatured,
      tags: input.tags ?? null,
      seoTitle: input.seoTitle ?? null,
      seoDescription: input.seoDescription ?? null,
      updatedBy: auth.user.id,
    };

    let id: string;
    let before: typeof products.$inferSelect | null = null;
    if (productId) {
      [before] = await tx.select().from(products).where(and(eq(products.id, productId), isNull(products.deletedAt)));
      if (!before) throw notFound("Produto não encontrado.");
      if (before.brandId !== input.brandId) throw new AppError("Não é possível mover um produto para outra marca.");
      await tx.update(products).set(values).where(eq(products.id, productId));
      id = productId;
    } else {
      const [created] = await tx
        .insert(products)
        .values({ ...values, createdBy: auth.user.id })
        .returning({ id: products.id });
      id = created.id;
    }

    // Galeria
    await tx.delete(productImages).where(eq(productImages.productId, id));
    if (input.images.length) {
      await tx.insert(productImages).values(
        input.images.map((img, i) => ({ productId: id, url: img.url, alt: img.alt ?? input.name, sortOrder: i })),
      );
    }

    // Variações
    const existing = await tx
      .select()
      .from(productVariants)
      .where(and(eq(productVariants.productId, id), isNull(productVariants.deletedAt)));
    const keepIds = new Set(input.variants.map((v) => v.id).filter(Boolean) as string[]);
    for (const old of existing) {
      if (!keepIds.has(old.id)) {
        await tx.update(productVariants).set({ deletedAt: new Date(), isActive: false }).where(eq(productVariants.id, old.id));
      }
    }
    for (const [i, v] of input.variants.entries()) {
      const variantValues = {
        size: v.size ?? null,
        color: v.color ?? null,
        colorHex: v.colorHex ?? null,
        sku: v.sku,
        priceOverride: money(v.priceOverride),
        minStock: v.minStock,
        weightGrams: v.weightGrams ?? null,
        dimensions: v.dimensions ?? null,
        imageUrl: v.imageUrl ?? null,
        isActive: v.isActive,
        sortOrder: i,
      };
      if (v.id && existing.some((e) => e.id === v.id)) {
        await tx.update(productVariants).set(variantValues).where(eq(productVariants.id, v.id));
      } else {
        const [created] = await tx
          .insert(productVariants)
          .values({ ...variantValues, productId: id, brandId: input.brandId })
          .returning({ id: productVariants.id });
        await tx.insert(inventory).values({ variantId: created.id, location: "principal", quantity: 0 }).onConflictDoNothing();
        if (v.initialStock && v.initialStock > 0) {
          if (!can(auth.perms, "estoque", "criar", input.brandId)) {
            throw new AppError("Você não tem permissão para lançar estoque inicial.", "forbidden");
          }
          await applyMovement(tx, {
            variantId: created.id,
            type: "cadastro",
            quantity: v.initialStock,
            unitCost: input.costPrice ?? null,
            supplierId: input.supplierId ?? null,
            reason: "Estoque inicial no cadastro do produto",
            responsibleUserId: auth.user.id,
          });
        }
      }
    }

    if (before) {
      const d = diff(before as unknown as Record<string, unknown>, values as unknown as Record<string, unknown>);
      await audit(tx, actor, {
        action: "produto.editar",
        entity: "products",
        entityId: id,
        brandId: input.brandId,
        before: d.before,
        after: { ...d.after, variacoes: input.variants.length, imagens: input.images.length },
      });
    } else {
      await audit(tx, actor, {
        action: "produto.criar",
        entity: "products",
        entityId: id,
        brandId: input.brandId,
        after: { nome: input.name, sku: input.sku, preco: input.salePrice, variacoes: input.variants.length },
      });
    }
    return { id };
  });
}

export async function softDeleteProduct(auth: AuthContext, productId: string, reason: string) {
  await write(async (tx) => {
    const [p] = await tx.select().from(products).where(and(eq(products.id, productId), isNull(products.deletedAt)));
    if (!p) throw notFound("Produto não encontrado.");
    assertCan(auth.perms, "produtos", "excluir", p.brandId);
    await tx.update(products).set({ deletedAt: new Date(), status: "inativo", updatedBy: auth.user.id }).where(eq(products.id, productId));
    await audit(tx, { id: auth.user.id, fullName: auth.user.fullName, email: auth.user.email }, {
      action: "produto.excluir",
      entity: "products",
      entityId: productId,
      brandId: p.brandId,
      before: { nome: p.name, sku: p.sku, status: p.status },
      reason,
    });
  });
}

export type AdminProductFilters = {
  scope: "all" | string[];
  brandId?: string | null;
  categoryId?: string | null;
  status?: string | null;
  stock?: "baixo" | "esgotado" | null;
  q?: string | null;
  page?: number;
  perPage?: number;
};

export async function listAdminProducts(f: AdminProductFilters) {
  const db = await getDb();
  const perPage = f.perPage ?? 25;
  const page = Math.max(f.page ?? 1, 1);
  const conds = [sql`p.deleted_at is null`, brandSql(sql`p.brand_id`, f.scope, f.brandId)];
  if (f.categoryId) conds.push(sql`(p.category_id = ${f.categoryId} or p.subcategory_id = ${f.categoryId})`);
  if (f.status) conds.push(sql`p.status = ${f.status}`);
  if (f.q) {
    const t = likeTerm(f.q);
    conds.push(sql`(p.name ilike ${t} or p.sku ilike ${t} or exists (select 1 from public.product_variants v where v.product_id = p.id and v.sku ilike ${t}))`);
  }
  const stockSql = sql`coalesce((select sum(i.quantity) from public.inventory i join public.product_variants v on v.id = i.variant_id
                                 where v.product_id = p.id and v.deleted_at is null), 0)`;
  if (f.stock === "esgotado") conds.push(sql`${stockSql} = 0`);
  if (f.stock === "baixo") conds.push(sql`${stockSql} > 0 and ${stockSql} <= p.min_stock`);
  const where = sql.join(conds, sql` and `);
  const rows = rowsOf<{
    id: string;
    name: string;
    sku: string;
    brand_id: string;
    status: string;
    sale_price: string;
    promo_price: string | null;
    cost_price: string | null;
    margin_percent: string | null;
    quantity_sold: number;
    min_stock: number;
    is_demo: boolean;
    category_name: string | null;
    image: string | null;
    stock: number;
    variants: number;
    created_at: string;
    total: number;
  }>(
    await db.execute(sql`
      select p.id, p.name, p.sku, p.brand_id, p.status, p.sale_price, p.promo_price, p.cost_price, p.margin_percent,
             p.quantity_sold, p.min_stock, p.is_demo, p.created_at, c.name as category_name,
             (select url from public.product_images pi where pi.product_id = p.id order by sort_order limit 1) as image,
             ${stockSql}::int as stock,
             (select count(*) from public.product_variants v where v.product_id = p.id and v.deleted_at is null)::int as variants,
             count(*) over()::int as total
      from public.products p
      left join public.categories c on c.id = p.category_id
      where ${where}
      order by p.created_at desc
      limit ${perPage} offset ${(page - 1) * perPage}`),
  );
  const total = rows[0]?.total ?? 0;
  return { rows, total: Number(total), page, perPage, pages: Math.max(1, Math.ceil(Number(total) / perPage)) };
}

export async function getAdminProduct(productId: string) {
  const db = await getDb();
  const [product] = await db.select().from(products).where(and(eq(products.id, productId), isNull(products.deletedAt)));
  if (!product) return null;
  const [images, variants] = await Promise.all([
    db.select().from(productImages).where(eq(productImages.productId, productId)).orderBy(asc(productImages.sortOrder)),
    db
      .select({
        variant: productVariants,
        stock: sql<number>`coalesce((select sum(i.quantity) from public.inventory i where i.variant_id = ${productVariants.id}), 0)::int`,
      })
      .from(productVariants)
      .where(and(eq(productVariants.productId, productId), isNull(productVariants.deletedAt)))
      .orderBy(asc(productVariants.sortOrder)),
  ]);
  return { product, images, variants: variants.map((v) => ({ ...v.variant, stock: Number(v.stock) })) };
}

/** Todas as variações (tela Variações / seletores de estoque e pedido). */
export async function listVariants(f: { scope: "all" | string[]; brandId?: string | null; q?: string | null; limit?: number; productId?: string | null }) {
  const db = await getDb();
  const conds = [sql`v.deleted_at is null`, sql`p.deleted_at is null`, brandSql(sql`p.brand_id`, f.scope, f.brandId)];
  if (f.productId) conds.push(sql`p.id = ${f.productId}`);
  if (f.q) {
    const t = likeTerm(f.q);
    conds.push(sql`(p.name ilike ${t} or v.sku ilike ${t} or p.sku ilike ${t} or coalesce(v.color, '') ilike ${t} or coalesce(v.size, '') ilike ${t})`);
  }
  return rowsOf<{
    id: string;
    product_id: string;
    product_name: string;
    brand_id: string;
    status: string;
    size: string | null;
    color: string | null;
    color_hex: string | null;
    sku: string;
    price: string;
    min_stock: number;
    is_active: boolean;
    stock: number;
    cost_price: string | null;
  }>(
    await db.execute(sql`
      select v.id, p.id as product_id, p.name as product_name, p.brand_id, p.status, v.size, v.color, v.color_hex, v.sku,
             coalesce(v.price_override, p.promo_price, p.sale_price) as price, greatest(v.min_stock, p.min_stock) as min_stock,
             v.is_active, p.cost_price,
             coalesce((select sum(i.quantity) from public.inventory i where i.variant_id = v.id), 0)::int as stock
      from public.product_variants v
      join public.products p on p.id = v.product_id
      where ${sql.join(conds, sql` and `)}
      order by p.name, v.sort_order
      limit ${f.limit ?? 500}`),
  );
}

export async function listAdminCategories(scope: "all" | string[], brandId?: string | null) {
  const db = await getDb();
  return rowsOf<{
    id: string;
    brand_id: string;
    parent_id: string | null;
    slug: string;
    name: string;
    description: string | null;
    kind: string;
    image_url: string | null;
    sort_order: number;
    is_active: boolean;
    seo_title: string | null;
    seo_description: string | null;
    products: number;
  }>(
    await db.execute(sql`
      select c.*, (select count(*) from public.products p where (p.category_id = c.id or p.subcategory_id = c.id) and p.deleted_at is null)::int as products
      from public.categories c
      where c.deleted_at is null and ${brandSql(sql`c.brand_id`, scope, brandId)}
      order by c.brand_id, c.sort_order, c.name`),
  );
}

export function assertCategorySlug(slug: string) {
  if (RESERVED_SLUGS.includes(slug)) throw new AppError(`"${slug}" é um endereço reservado do site. Escolha outro.`, "app_error", { slug: "Reservado." });
}

export async function productOptions(scope: "all" | string[], brandId?: string | null) {
  const db = await getDb();
  return db
    .select({ id: products.id, name: products.name, sku: products.sku, brandId: products.brandId })
    .from(products)
    .where(and(isNull(products.deletedAt), scope === "all" ? sql`true` : scope.length ? inArray(products.brandId, scope) : sql`false`, brandId ? eq(products.brandId, brandId) : sql`true`))
    .orderBy(asc(products.name));
}

