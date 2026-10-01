import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadStore } from "@/server/store-context";
import { getCategoryBySlug } from "@/server/services/catalog";
import { CatalogListing, type SearchParams } from "@/components/store/listing";

type Props = { params: Promise<{ brand: string; category: string }>; searchParams: Promise<SearchParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { brand: slug, category: catSlug } = await params;
  const { brand } = await loadStore(slug);
  const category = await getCategoryBySlug(brand.id, catSlug);
  if (!category) return {};
  return {
    title: category.seoTitle ?? category.name,
    description: category.seoDescription ?? category.description ?? `${category.name} — ${brand.name}`,
    alternates: { canonical: `/${brand.slug}/${category.slug}` },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { brand: slug, category: catSlug } = await params;
  const { brand } = await loadStore(slug);
  const category = await getCategoryBySlug(brand.id, catSlug);
  if (!category) notFound();
  return (
    <CatalogListing
      brand={brand}
      category={category}
      title={category.name}
      intro={category.description}
      basePath={`/${brand.slug}/${category.slug}`}
      searchParams={await searchParams}
    />
  );
}
