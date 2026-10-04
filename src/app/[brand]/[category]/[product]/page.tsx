import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { loadStore } from "@/server/store-context";
import { getProductPage, getRelatedProducts } from "@/server/services/catalog";
import { POLICY_LABELS } from "@/server/services/cms";
import { BuyBox, Gallery } from "@/components/store/product-client";
import { ProductGrid, SectionTitle } from "@/components/store/ui";
import { Track } from "@/components/store/track";
import { CONFIG_PENDING } from "@/lib/format";
import { policySummary } from "@/lib/text";
import { getOrigin } from "@/server/request";

type Props = { params: Promise<{ brand: string; category: string; product: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { brand: slug, product: productSlug } = await params;
  const { brand } = await loadStore(slug);
  const page = await getProductPage(brand.id, productSlug);
  if (!page) return {};
  const { product, images, category } = page;
  const description = product.seoDescription ?? product.shortDescription ?? `${product.name} — ${brand.name}`;
  const url = `/${brand.slug}/${category?.slug ?? "produto"}/${product.slug}`;
  return {
    title: product.seoTitle ?? product.name,
    description,
    alternates: { canonical: url },
    openGraph: { title: product.name, description, url, images: images[0] ? [images[0].url] : undefined },
    twitter: { card: images[0] ? "summary_large_image" : "summary", title: product.name, description },
  };
}

export default async function ProductPage({ params }: Props) {
  const { brand: slug, category: catSlug, product: productSlug } = await params;
  const { brand, cms } = await loadStore(slug);
  const page = await getProductPage(brand.id, productSlug);
  if (!page) notFound();
  const { product, category, images, variants } = page;
  const canonicalCat = category?.slug ?? "produto";
  if (catSlug !== canonicalCat) redirect(`/${brand.slug}/${canonicalCat}/${product.slug}`);

  const { related, similar } = await getRelatedProducts(page);
  const base = process.env.SITE_URL ?? (await getOrigin());
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: product.sku,
    description: product.shortDescription ?? product.longDescription ?? undefined,
    image: images.map((i) => (i.url.startsWith("http") ? i.url : `${base}${i.url}`)),
    brand: { "@type": "Brand", name: brand.name },
    material: product.material ?? undefined,
    offers: {
      "@type": "Offer",
      priceCurrency: "BRL",
      price: page.price.toFixed(2),
      availability: page.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: `${base}/${brand.slug}/${canonicalCat}/${product.slug}`,
    },
  };
  const policies = (Object.keys(POLICY_LABELS) as (keyof typeof POLICY_LABELS)[]).filter((k) =>
    ["troca", "devolucao", "entrega"].includes(k),
  );

  return (
    <div className="mx-auto max-w-[1400px] px-5 pt-8 lg:px-10 lg:pt-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <Track brand={brand.slug} type="product_view" productId={product.id} />
      <nav aria-label="Trilha" className="muted mb-6 text-xs">
        <Link href={`/${brand.slug}`} className="hover:underline">{brand.name}</Link>
        {category && (
          <>
            <span className="mx-2">/</span>
            <Link href={`/${brand.slug}/${category.slug}`} className="hover:underline">{category.name}</Link>
          </>
        )}
        <span className="mx-2">/</span>
        <span aria-current="page">{product.name}</span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16">
        <Gallery images={images.map((i) => ({ url: i.url, alt: i.alt }))} name={product.name} />
        <div className="lg:sticky lg:top-28 lg:self-start">
          {page.isNew && <p className="mb-3 text-xs" style={{ color: "var(--brand-accent)" }}>Novidade</p>}
          <h1 className="font-display text-4xl leading-[1.05] lg:text-5xl">{product.name}</h1>
          {product.shortDescription && <p className="muted mt-4 text-[15px] leading-relaxed">{product.shortDescription}</p>}
          <div className="mt-8">
            <BuyBox
              brand={brand.slug}
              product={{ id: product.id, slug: product.slug, categorySlug: canonicalCat, name: product.name, image: images[0]?.url ?? null }}
              variants={variants.map((v) => ({
                id: v.id,
                size: v.size,
                color: v.color,
                colorHex: v.colorHex,
                price: v.price,
                stock: v.stock,
                imageUrl: v.imageUrl,
              }))}
              basePrice={page.salePrice}
              promoPrice={page.promoPrice}
            />
          </div>

          <div className="mt-10 divide-y hairline border-y hairline text-sm">
            <details className="group py-4" open>
              <summary className="flex cursor-pointer list-none items-center justify-between">
                Descrição <span className="muted transition-transform group-open:rotate-45">+</span>
              </summary>
              <div className="muted mt-3 space-y-3 whitespace-pre-line leading-relaxed">
                {product.longDescription ?? product.shortDescription ?? "Descrição não informada."}
              </div>
            </details>
            <details className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between">
                Detalhes <span className="muted transition-transform group-open:rotate-45">+</span>
              </summary>
              <dl className="muted mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5">
                <dt>Material</dt>
                <dd>{product.material ?? "Não informado"}</dd>
                <dt>Referência</dt>
                <dd>{product.sku}</dd>
                {product.videoUrl && (
                  <>
                    <dt>Vídeo</dt>
                    <dd>
                      <a href={product.videoUrl} target="_blank" rel="noopener noreferrer" className="underline">Assistir</a>
                    </dd>
                  </>
                )}
              </dl>
            </details>
            {policies.map((k) => (
              <details key={k} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between">
                  {POLICY_LABELS[k]} <span className="muted transition-transform group-open:rotate-45">+</span>
                </summary>
                <div className="muted mt-3 leading-relaxed">
                  {cms.policies[k] ? policySummary(cms.policies[k]!, 280) : CONFIG_PENDING}
                  {cms.policies[k] && cms.policies[k]!.length > 280 && (
                    <Link href={`/${brand.slug}/politicas/${k}`} className="mt-3 block underline underline-offset-4" style={{ color: "var(--brand-text)" }}>
                      Ler a política completa
                    </Link>
                  )}
                </div>
              </details>
            ))}
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-24">
          <SectionTitle title="Relacionados" href={category ? `/${brand.slug}/${category.slug}` : undefined} linkLabel={category ? `Ver ${category.name.toLowerCase()}` : undefined} />
          <ProductGrid brand={brand.slug} products={related} />
        </section>
      )}
      {similar.length > 0 && (
        <section className="mt-20">
          <SectionTitle title="Você também pode gostar" />
          <ProductGrid brand={brand.slug} products={similar} />
        </section>
      )}
    </div>
  );
}
