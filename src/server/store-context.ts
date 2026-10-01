import { cache } from "react";
import { notFound } from "next/navigation";
import { getBrandBySlug } from "./services/brands";
import { getBrandCms } from "./services/cms";
import { getStoreCategories } from "./services/catalog";

/** Marca + CMS + categorias da loja (memoizado por requisição). 404 se a marca não existir. */
export const loadStore = cache(async (slug: string) => {
  const brand = await getBrandBySlug(slug);
  if (!brand) notFound();
  const [cms, categories] = await Promise.all([getBrandCms(brand.id), getStoreCategories(brand.id)]);
  return { brand, cms, categories };
});
