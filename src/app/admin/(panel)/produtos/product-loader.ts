import type { ProductFormValues, VariantRow } from "./product-form";
import { getAdminProduct } from "@/server/services/products";

const dec = (v: string | null | undefined) => (v === null || v === undefined ? "" : Number(v).toFixed(2).replace(".", ","));

export function emptyProduct(brandId: string | null): ProductFormValues {
  return {
    brandId: brandId ?? "",
    categoryId: "",
    subcategoryId: "",
    name: "",
    sku: "",
    slug: "",
    shortDescription: "",
    longDescription: "",
    costPrice: "",
    salePrice: "",
    promoPrice: "",
    material: "",
    supplierId: "",
    minStock: "0",
    videoUrl: "",
    status: "rascunho",
    isNew: false,
    isFeatured: false,
    tags: "",
    seoTitle: "",
    seoDescription: "",
    images: [],
    variants: [
      {
        key: "v0",
        size: "",
        color: "",
        colorHex: "",
        sku: "",
        priceOverride: "",
        minStock: "0",
        weightGrams: "",
        dimensions: "",
        imageUrl: "",
        isActive: true,
        initialStock: "",
      },
    ],
  };
}

export function toFormValues(data: NonNullable<Awaited<ReturnType<typeof getAdminProduct>>>): ProductFormValues {
  const p = data.product;
  return {
    brandId: p.brandId,
    categoryId: p.categoryId ?? "",
    subcategoryId: p.subcategoryId ?? "",
    name: p.name,
    sku: p.sku,
    slug: p.slug,
    shortDescription: p.shortDescription ?? "",
    longDescription: p.longDescription ?? "",
    costPrice: dec(p.costPrice),
    salePrice: dec(p.salePrice),
    promoPrice: dec(p.promoPrice),
    material: p.material ?? "",
    supplierId: p.supplierId ?? "",
    minStock: String(p.minStock),
    videoUrl: p.videoUrl ?? "",
    status: p.status as ProductFormValues["status"],
    isNew: p.isNew,
    isFeatured: p.isFeatured,
    tags: p.tags ?? "",
    seoTitle: p.seoTitle ?? "",
    seoDescription: p.seoDescription ?? "",
    images: data.images.map((i) => ({ url: i.url, alt: i.alt ?? "" })),
    variants: data.variants.map(
      (v): VariantRow => ({
        key: v.id,
        id: v.id,
        size: v.size ?? "",
        color: v.color ?? "",
        colorHex: v.colorHex ?? "",
        sku: v.sku,
        priceOverride: dec(v.priceOverride),
        minStock: String(v.minStock),
        weightGrams: v.weightGrams === null ? "" : String(v.weightGrams),
        dimensions: v.dimensions ?? "",
        imageUrl: v.imageUrl ?? "",
        isActive: v.isActive,
        initialStock: "",
        stock: v.stock,
      }),
    ),
  };
}
