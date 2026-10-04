import Link from "next/link";
import { loadStore } from "@/server/store-context";
import { getActiveBanners, listProducts } from "@/server/services/catalog";
import { BrandLogo, Marquee, ProductGrid, RotatingBadge, SectionTitle, SmartImage } from "@/components/store/ui";
import { Tilt } from "@/components/store/fx-client";

type Props = { params: Promise<{ brand: string }> };

const delay = (s: number) => ({ "--d": `${s}s` }) as React.CSSProperties;

/** Estrela de quatro pontas que pisca (só decoração). */
function Sparkle({ className, delay: d }: { className: string; delay: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={`sparkle ${className}`} style={{ color: "var(--brand-accent)", animationDelay: d }}>
      <path fill="currentColor" d="M12 0c.7 6.4 3.6 10.3 12 12-8.4 1.7-11.3 5.6-12 12-.7-6.4-3.6-10.3-12-12C8.4 10.3 11.3 6.4 12 0Z" />
    </svg>
  );
}

export default async function BrandHome({ params }: Props) {
  const { brand: slug } = await params;
  const { brand, cms, categories } = await loadStore(slug);
  const [heroBanners, secondary, news, sale, featured] = await Promise.all([
    getActiveBanners(brand.id, "home_hero"),
    getActiveBanners(brand.id, "home_secundario"),
    listProducts({
      brandId: brand.id,
      newOnly: true,
      sort: "novidades",
      perPage: 4,
    }),
    listProducts({
      brandId: brand.id,
      saleOnly: true,
      sort: "relevancia",
      perPage: 4,
    }),
    listProducts({ brandId: brand.id, sort: "relevancia", perPage: 8 }),
  ]);
  const id = cms.identity;
  const urban = id.look === "urbano";
  const hero = heroBanners[0];
  // Imagem cadastrada em "Capa da home" vale mais que a do banner de demonstração.
  const heroImage = hero?.isDemo ? (cms.home.hero_image_url ?? hero.imageUrl) : (hero?.imageUrl ?? cms.home.hero_image_url);
  // Banner DEMO: o selo "DEMO" fica visível; o prefixo técnico sai do título.
  const heroTitle = (hero?.title ?? cms.home.hero_title ?? brand.name).replace(/^BANNER DEMO · /, "");
  // Banner de demonstração não mostra o texto de exemplo; banners reais mostram o subtítulo cadastrado.
  const heroSubtitle = hero?.isDemo ? null : (hero?.subtitle ?? cms.home.hero_subtitle ?? id.tagline ?? brand.positioning);
  const novidades = categories.find((c) => c.kind === "novidades");
  const promocoes = categories.find((c) => c.kind === "promocoes");
  const standard = categories.filter((c) => c.kind === "padrao");
  const ctaHref = hero?.linkUrl ?? `/${brand.slug}/${novidades?.slug ?? standard[0]?.slug ?? ""}`;
  const ctaLabel = hero?.ctaLabel ?? "Ver a coleção";
  const motto = (id.tagline ?? brand.positioning ?? brand.name)
    .split(/\s*[·•,|]\s*/)
    .map((w) => w.trim())
    .filter(Boolean);

  const heroText = (
    <div className="relative z-10">
      <p
        className="fade-up text-sm"
        style={{
          ...delay(0.1),
          color: urban ? "var(--brand-accent)" : undefined,
        }}
      >
        <span className={urban ? "font-medium uppercase tracking-[0.2em]" : "muted"}>{id.card_subtitle ?? brand.audience}</span>
      </p>
      <h1
        className={`fade-up font-display font-bodoni mt-5 ${urban ? "text-[clamp(3.4rem,8.5vw,8.5rem)] leading-[0.86]" : "text-[clamp(3.2rem,7vw,6.8rem)] leading-[0.95]"}`}
        style={delay(0.22)}
      >
        {heroTitle}
      </h1>
      {urban && (
        <p aria-hidden className="fade-up font-display text-outline text-[clamp(2.6rem,6.5vw,6.5rem)] leading-[0.9]" style={delay(0.34)}>
          {brand.name}
        </p>
      )}
      {heroSubtitle && (
        <p className="fade-up muted mt-6 max-w-md text-[16px] leading-relaxed" style={delay(0.46)}>
          {heroSubtitle}
        </p>
      )}
      <div className="fade-up mt-9 flex flex-wrap gap-3" style={delay(0.58)}>
        <Link href={ctaHref} className="btn-brand">
          {ctaLabel}
        </Link>
        {promocoes && (
          <Link href={`/${brand.slug}/${promocoes.slug}`} className="btn-brand-outline">
            {promocoes.name}
          </Link>
        )}
      </div>
    </div>
  );

  const heroMedia = heroImage ? (
    <SmartImage
      src={heroImage}
      alt={hero?.title ?? brand.name}
      sizes="(min-width: 1024px) 45vw, 100vw"
      priority
      className="ken-burns object-cover"
    />
  ) : (
    <div className="flex h-full items-center justify-center p-10">
      <BrandLogo name={brand.name} identity={{ ...id, logo_shows_name: true }} variant="hero" animate="intro" />
    </div>
  );

  return (
    <>
      {urban ? (
        <section className="grain spotlight relative overflow-hidden">
          {id.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={id.logo_url}
              alt=""
              aria-hidden
              className="pointer-events-none absolute -left-[12%] top-1/2 w-[min(90vw,980px)] -translate-y-1/2 opacity-[0.06] grayscale"
            />
          )}
          <div className="mx-auto grid max-w-[1400px] items-center gap-12 px-5 py-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:px-10 lg:py-20">
            {heroText}
            <div className="fade-up relative mx-auto w-full max-w-[540px]" style={delay(0.3)}>
              <div
                aria-hidden
                className="frame-cut absolute inset-0 translate-x-3 translate-y-3 sm:translate-x-5 sm:translate-y-5"
                style={{ background: "var(--brand-accent)" }}
              />
              <div className="frame-cut relative aspect-[4/5] overflow-hidden bg-brand-secondary">{heroMedia}</div>
            </div>
          </div>
        </section>
      ) : (
        <section className="rings relative overflow-hidden">
          <div className="mx-auto grid max-w-[1400px] items-center gap-12 px-5 py-14 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:px-10 lg:py-20">
            {heroText}
            <div className="fade-up relative mx-auto w-full max-w-[500px]" style={delay(0.3)}>
              {/* Brilho dourado que respira atrás do arco */}
              <div aria-hidden className="arch-glow absolute -inset-8 -z-10 rounded-t-full" />
              {/* Contorno em arco, um pouco afastado, que se desenha ao carregar */}
              <div aria-hidden className="arch-outline frame-arch absolute -inset-3 border" style={{ borderColor: "var(--brand-accent)" }} />
              <Tilt max={4}>
                <div className="frame-arch arch-shine relative aspect-[4/5] bg-brand-secondary">
                  <div className="arch-reveal absolute inset-0">{heroMedia}</div>
                </div>
              </Tilt>
              {/* Estrelas douradas piscando, como as da ilustração */}
              {heroImage && (
                <>
                  <Sparkle className="absolute -right-3 top-[14%] h-5 w-5 sm:-right-6 sm:h-7 sm:w-7" delay="0s" />
                  <Sparkle className="absolute -left-4 top-[34%] h-3.5 w-3.5 sm:-left-8 sm:h-5 sm:w-5" delay="1.1s" />
                  <Sparkle className="absolute -right-2 bottom-[18%] h-4 w-4 sm:-right-5 sm:h-5 sm:w-5" delay="2.2s" />
                </>
              )}
              {heroImage && id.tagline && (
                <RotatingBadge
                  text={id.tagline}
                  logoUrl={id.logo_url}
                  className="absolute -bottom-10 -left-4 w-32 border hairline sm:-left-12 sm:w-40"
                />
              )}
            </div>
          </div>
        </section>
      )}

      {motto.length > 0 && (
        <div className={urban ? "overflow-hidden py-3" : "border-y hairline py-5"}>
          <div className={urban ? "tape py-3" : undefined}>
            <Marquee
              items={motto}
              separator={urban ? "✕" : "○"}
              speed={urban ? "26s" : "44s"}
              className={urban ? "font-display text-2xl tracking-[0.06em] sm:text-3xl" : "font-display text-2xl italic sm:text-3xl"}
            />
          </div>
        </div>
      )}

      {standard.length > 0 && (
        <nav aria-label="Categorias" className="mx-auto max-w-[1400px] px-5 pt-16 lg:px-10 lg:pt-24">
          <p className="muted mb-6 text-sm">Compre por categoria</p>
          <ul className="flex flex-wrap items-baseline gap-x-8 gap-y-3 sm:gap-x-12">
            {standard.map((c) => (
              <li key={c.id}>
                <Link href={`/${brand.slug}/${c.slug}`} className="cat-link font-display font-bodoni text-4xl leading-tight sm:text-5xl lg:text-6xl">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {news.items.length > 0 && (
        <section className="mx-auto max-w-[1400px] px-5 pt-20 lg:px-10 lg:pt-28">
          <SectionTitle title="Novidades" href={novidades ? `/${brand.slug}/${novidades.slug}` : undefined} />
          <ProductGrid brand={brand.slug} products={news.items} />
        </section>
      )}

      {secondary.length > 0 && (
        <section className="mx-auto mt-20 grid max-w-[1400px] gap-4 px-5 sm:grid-cols-2 lg:mt-28 lg:px-10">
          {secondary.slice(0, 2).map((b) => (
            <Link key={b.id} href={b.linkUrl ?? `/${brand.slug}`} className="card-media group reveal relative block aspect-[4/3]">
              {b.imageUrl && (
                <SmartImage src={b.imageUrl} alt={b.title ?? ""} sizes="(min-width: 640px) 50vw, 100vw" className="object-cover" />
              )}
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  background: "linear-gradient(to top, color-mix(in srgb, var(--brand-bg) 75%, transparent), transparent 55%)",
                }}
              />
              <div className="absolute bottom-6 left-6 right-6 transition-transform duration-500 group-hover:-translate-y-1">
                {b.title && <p className="font-display text-3xl sm:text-4xl">{b.title}</p>}
                {b.subtitle && <p className="mt-1 text-sm opacity-80">{b.subtitle}</p>}
              </div>
            </Link>
          ))}
        </section>
      )}

      {sale.items.length > 0 && (
        <section className="mx-auto max-w-[1400px] px-5 pt-20 lg:px-10 lg:pt-28">
          <SectionTitle title="Promoções" href={promocoes ? `/${brand.slug}/${promocoes.slug}` : undefined} />
          <ProductGrid brand={brand.slug} products={sale.items} />
        </section>
      )}

      {id.logo_url && (
        <section
          aria-label={`Sobre a ${brand.name}`}
          className={`mt-24 border-y hairline py-20 text-center lg:mt-32 lg:py-28 ${urban ? "grain spotlight" : "rings"}`}
        >
          <BrandLogo name={brand.name} identity={id} variant="statement" animate="scroll" nameClassName="text-5xl sm:text-6xl" />
          {id.tagline && <p className="reveal mx-auto mt-8 max-w-md px-5 text-[17px] leading-relaxed opacity-85">{id.tagline}</p>}
        </section>
      )}

      {cms.home.institutional_images?.length > 0 && (
        <section aria-label={`Imagens da ${brand.name}`} className="mx-auto mt-20 max-w-[1400px] px-5 lg:mt-28 lg:px-10">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:gap-4">
            {cms.home.institutional_images.slice(0, 6).map((src, i) => (
              <div
                key={src + i}
                className={`card-media reveal ${i === 0 ? "col-span-2 row-span-2 aspect-square sm:aspect-auto" : "aspect-[4/5]"}`}
              >
                <SmartImage src={src} alt={`${brand.name} — imagem institucional ${i + 1}`} sizes="(min-width: 640px) 33vw, 50vw" />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-[1400px] px-5 pt-20 lg:px-10 lg:pt-28">
        {featured.items.length ? (
          <>
            <SectionTitle title="Destaques" />
            <ProductGrid brand={brand.slug} products={featured.items} />
          </>
        ) : (
          <div className="py-24 text-center">
            <p className="font-display text-4xl">Coleção em preparação</p>
            <p className="muted mx-auto mt-4 max-w-md text-sm">
              Os produtos da {brand.name} aparecerão aqui assim que forem publicados no painel.
            </p>
          </div>
        )}
      </section>
    </>
  );
}
