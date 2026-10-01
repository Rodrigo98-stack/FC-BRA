import Link from "next/link";
import { loadStore } from "@/server/store-context";
import { getActiveBanners, listProducts } from "@/server/services/catalog";
import { ProductGrid, SectionTitle, SmartImage } from "@/components/store/ui";

type Props = { params: Promise<{ brand: string }> };

export default async function BrandHome({ params }: Props) {
  const { brand: slug } = await params;
  const { brand, cms, categories } = await loadStore(slug);
  const [heroBanners, secondary, news, sale, featured] = await Promise.all([
    getActiveBanners(brand.id, "home_hero"),
    getActiveBanners(brand.id, "home_secundario"),
    listProducts({ brandId: brand.id, newOnly: true, sort: "novidades", perPage: 4 }),
    listProducts({ brandId: brand.id, saleOnly: true, sort: "relevancia", perPage: 4 }),
    listProducts({ brandId: brand.id, sort: "relevancia", perPage: 8 }),
  ]);
  const hero = heroBanners[0];
  const heroImage = hero?.imageUrl ?? cms.home.hero_image_url;
  const heroTitle = hero?.title ?? cms.home.hero_title ?? brand.name;
  const heroSubtitle = hero?.subtitle ?? cms.home.hero_subtitle ?? cms.identity.tagline ?? brand.positioning;
  const novidades = categories.find((c) => c.kind === "novidades");
  const promocoes = categories.find((c) => c.kind === "promocoes");
  const standard = categories.filter((c) => c.kind === "padrao");

  return (
    <>
      <section className="relative">
        <div className="relative h-[72svh] min-h-[460px] overflow-hidden bg-brand-secondary">
          {heroImage ? (
            <SmartImage src={heroImage} alt={hero?.title ?? brand.name} sizes="100vw" priority className="object-cover" />
          ) : (
            <div className="muted absolute right-6 top-6 text-xs">Imagem de capa: configuração pendente</div>
          )}
          {heroImage && (
            <div
              aria-hidden
              className="absolute inset-0"
              style={{ background: "linear-gradient(to top, color-mix(in srgb, var(--brand-bg) 78%, transparent), transparent 58%)" }}
            />
          )}
          <div className="absolute inset-x-0 bottom-0 mx-auto max-w-[1400px] px-5 pb-12 lg:px-10 lg:pb-16">
            <div className="max-w-xl">
              <h1 className="font-display text-5xl leading-[0.95] sm:text-6xl lg:text-7xl">{heroTitle}</h1>
              {heroSubtitle && <p className="mt-5 max-w-md text-[15px] leading-relaxed opacity-80">{heroSubtitle}</p>}
              <Link href={hero?.linkUrl ?? `/${brand.slug}/${novidades?.slug ?? standard[0]?.slug ?? ""}`} className="btn-brand mt-8">
                {hero?.ctaLabel ?? "Ver a coleção"}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <nav aria-label="Categorias" className="mx-auto max-w-[1400px] border-b hairline px-5 py-12 lg:px-10 lg:py-16">
        <ul className="flex flex-wrap items-baseline gap-x-8 gap-y-3 sm:gap-x-12">
          {standard.map((c) => (
            <li key={c.id}>
              <Link href={`/${brand.slug}/${c.slug}`} className="font-display text-3xl leading-tight decoration-1 underline-offset-[10px] hover:underline sm:text-4xl lg:text-5xl">
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {news.items.length > 0 && (
        <section className="mx-auto max-w-[1400px] px-5 pt-16 lg:px-10 lg:pt-24">
          <SectionTitle title="Novidades" href={novidades ? `/${brand.slug}/${novidades.slug}` : undefined} />
          <ProductGrid brand={brand.slug} products={news.items} />
        </section>
      )}

      {secondary.length > 0 && (
        <section className="mx-auto mt-16 grid max-w-[1400px] gap-4 px-5 sm:grid-cols-2 lg:mt-24 lg:px-10">
          {secondary.slice(0, 2).map((b) => (
            <Link key={b.id} href={b.linkUrl ?? `/${brand.slug}`} className="group relative block aspect-[4/3] overflow-hidden bg-brand-secondary">
              {b.imageUrl && <SmartImage src={b.imageUrl} alt={b.title ?? ""} sizes="(min-width: 640px) 50vw, 100vw" className="object-cover transition-transform duration-700 group-hover:scale-[1.02]" />}
              <div className="absolute bottom-6 left-6">
                {b.title && <p className="font-display text-3xl">{b.title}</p>}
                {b.subtitle && <p className="mt-1 text-sm opacity-80">{b.subtitle}</p>}
              </div>
            </Link>
          ))}
        </section>
      )}

      {sale.items.length > 0 && (
        <section className="mx-auto max-w-[1400px] px-5 pt-16 lg:px-10 lg:pt-24">
          <SectionTitle title="Promoções" href={promocoes ? `/${brand.slug}/${promocoes.slug}` : undefined} />
          <ProductGrid brand={brand.slug} products={sale.items} />
        </section>
      )}

      {cms.home.institutional_images?.length > 0 && (
        <section aria-label={`Sobre a ${brand.name}`} className="mx-auto mt-16 max-w-[1400px] px-5 lg:mt-24 lg:px-10">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:gap-4">
            {cms.home.institutional_images.slice(0, 6).map((src, i) => (
              <div key={src + i} className={`relative overflow-hidden bg-brand-secondary ${i === 0 ? "col-span-2 row-span-2 aspect-square sm:aspect-auto" : "aspect-[4/5]"}`}>
                <SmartImage src={src} alt={`${brand.name} — imagem institucional ${i + 1}`} sizes="(min-width: 640px) 33vw, 50vw" />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-[1400px] px-5 pt-16 lg:px-10 lg:pt-24">
        {featured.items.length ? (
          <>
            <SectionTitle title="Destaques" />
            <ProductGrid brand={brand.slug} products={featured.items} />
          </>
        ) : (
          <div className="py-24 text-center">
            <p className="font-display text-4xl">Coleção em preparação</p>
            <p className="muted mx-auto mt-4 max-w-md text-sm">Os produtos da {brand.name} aparecerão aqui assim que forem publicados no painel.</p>
          </div>
        )}
      </section>
    </>
  );
}
