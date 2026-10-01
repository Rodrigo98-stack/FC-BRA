import type { Metadata } from "next";
import { loadStore } from "@/server/store-context";
import { CatalogListing, type SearchParams } from "@/components/store/listing";

type Props = { params: Promise<{ brand: string }>; searchParams: Promise<SearchParams> };

export const metadata: Metadata = { title: "Busca", robots: { index: false } };

export default async function SearchPage({ params, searchParams }: Props) {
  const { brand: slug } = await params;
  const { brand } = await loadStore(slug);
  const sp = await searchParams;
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.trim().slice(0, 80) ?? "";
  return (
    <CatalogListing
      brand={brand}
      category={null}
      title={q ? `Busca: “${q}”` : "Buscar"}
      intro={q ? null : "Busque por nome, categoria, SKU, cor ou material."}
      basePath={`/${brand.slug}/busca`}
      searchParams={sp}
      query={q}
    />
  );
}
