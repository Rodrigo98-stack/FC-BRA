import Link from "next/link";
import Image from "next/image";
import { formatBRL } from "@/lib/format";
import type { ProductCard as Card } from "@/server/services/catalog";
import type { BrandIdentity } from "@/server/services/cms";

export function SmartImage({
  src,
  alt,
  sizes,
  priority,
  className,
}: {
  src: string;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  const unoptimized = src.endsWith(".svg") || src.startsWith("data:");
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      unoptimized={unoptimized}
      className={className ?? "object-cover"}
    />
  );
}

/** Nome da marca; "&" ganha um ponto de quebra para o nome caber em telas estreitas. */
export function BrandName({ name }: { name: string }) {
  const parts = name.split("&");
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && (
            <>
              &amp;
              <wbr />
            </>
          )}
          {part}
        </span>
      ))}
    </>
  );
}

/** Logo da marca ou, enquanto não houver, o nome + placeholder explícito (§4). */
export function Wordmark({
  name,
  logoUrl,
  placeholder,
  className,
  showPlaceholder = false,
}: {
  name: string;
  logoUrl: string | null;
  placeholder: string;
  className?: string;
  showPlaceholder?: boolean;
}) {
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt={name} className={className ?? "h-10 w-auto"} />;
  }
  return (
    <span className={`inline-flex flex-col items-center ${className ?? ""}`}>
      <span className="font-display leading-none">
        <BrandName name={name} />
      </span>
      {showPlaceholder && (
        <span className="mt-2 text-[10px] font-normal tracking-[0.12em] opacity-50" title="Envie o logo em Configurações › Identidade visual">
          {placeholder}
        </span>
      )}
    </span>
  );
}

type LogoIdentity = Pick<BrandIdentity, "logo_url" | "logo_shows_name" | "look" | "logo_placeholder">;
type LogoVariant = "header" | "door" | "hero" | "footer" | "statement";

const LOGO_WIDTH: Record<LogoVariant, { classico: string; urbano: string }> = {
  header: { classico: "w-9 sm:w-11", urbano: "w-[74px] sm:w-[90px]" },
  door: { classico: "w-[min(44vw,190px)] md:w-[min(17vw,250px)]", urbano: "w-[min(76vw,360px)] md:w-[min(34vw,500px)]" },
  hero: { classico: "w-[min(60%,300px)]", urbano: "w-[min(80%,460px)]" },
  footer: { classico: "w-14", urbano: "w-36" },
  statement: { classico: "w-[min(52vw,240px)]", urbano: "w-[min(80vw,420px)]" },
};

/** Só aceita caminhos/URLs simples dentro de url(...) do CSS. */
function cssUrl(url: string) {
  return /^(\/|https?:\/\/)[^"'()\\\s]+$/.test(url) ? `url("${url}")` : null;
}

/**
 * Logo com o efeito do estilo da marca: no clássico o traço se desenha em
 * círculo; no urbano o logo sobe da névoa e um brilho dourado o percorre.
 */
export function BrandLogo({
  name,
  identity,
  variant,
  animate,
  nameClassName,
}: {
  name: string;
  identity: LogoIdentity;
  variant: LogoVariant;
  /** "intro" anima ao carregar; "scroll" anima ao entrar na tela. */
  animate?: "intro" | "scroll";
  nameClassName?: string;
}) {
  const url = identity.logo_url;
  if (!url) {
    return (
      <Wordmark name={name} logoUrl={null} placeholder={identity.logo_placeholder} showPlaceholder={variant === "door"} className={nameClassName} />
    );
  }
  const urban = identity.look === "urbano";
  const mask = urban ? cssUrl(url) : null;
  const motion = !animate ? "" : urban ? (animate === "intro" ? "logo-rise" : "reveal") : animate === "intro" ? "logo-draw" : "reveal-draw";
  const logo = (
    <span
      className={`brand-logo shrink-0 ${LOGO_WIDTH[variant][urban ? "urbano" : "classico"]} ${mask ? "logo-sheen" : ""} ${motion}`}
      style={mask ? ({ "--logo": mask } as React.CSSProperties) : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={identity.logo_shows_name ? name : ""} />
    </span>
  );
  if (identity.logo_shows_name) return logo;
  const stacked = variant === "door" || variant === "hero" || variant === "statement";
  return (
    <span className={`inline-flex items-center ${stacked ? "flex-col gap-6" : "gap-3"}`}>
      {logo}
      <span className={`font-display leading-none ${nameClassName ?? ""}`}>
        <BrandName name={name} />
      </span>
    </span>
  );
}

/** Faixa contínua com palavras da marca (pausa ao passar o mouse). */
export function Marquee({ items, separator, className, speed }: { items: string[]; separator: string; className?: string; speed?: string }) {
  if (!items.length) return null;
  const words = Array.from({ length: Math.max(2, Math.ceil(8 / items.length)) }, () => items).flat();
  const track = (hidden: boolean) => (
    <div className="marquee__track" aria-hidden={hidden || undefined}>
      {words.map((w, i) => (
        <span key={i} className="flex items-center gap-12">
          <span>{w}</span>
          <span aria-hidden className="opacity-70">{separator}</span>
        </span>
      ))}
    </div>
  );
  return (
    <div className={`marquee ${className ?? ""}`} style={speed ? ({ "--marquee-speed": speed } as React.CSSProperties) : undefined}>
      <p className="sr-only">{items.join(", ")}</p>
      {track(true)}
      {track(true)}
    </div>
  );
}

/** Selo com o lema girando em volta do símbolo da marca. */
export function RotatingBadge({ text, logoUrl, className }: { text: string; logoUrl: string | null; className?: string }) {
  const ring = `${text} · `.repeat(Math.max(1, Math.ceil(64 / (text.length + 3))));
  return (
    <div className={`grid aspect-square place-items-center rounded-full ${className ?? ""}`} style={{ background: "var(--brand-bg)" }} aria-hidden>
      <svg viewBox="0 0 200 200" className="spin-slow absolute inset-0 h-full w-full">
        <defs>
          <path id="badge-ring" d="M100,100 m-78,0 a78,78 0 1,1 156,0 a78,78 0 1,1 -156,0" />
        </defs>
        <text fill="currentColor" fontSize="12.5" letterSpacing="2.6" style={{ textTransform: "uppercase" }}>
          <textPath href="#badge-ring" textLength="488" lengthAdjust="spacing">
            {ring}
          </textPath>
        </text>
      </svg>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {logoUrl && <img src={logoUrl} alt="" className="w-[42%]" />}
    </div>
  );
}

export function Price({ price, promo, className = "" }: { price: number; promo: number | null; className?: string }) {
  if (promo !== null && promo < price) {
    return (
      <span className={`inline-flex items-baseline gap-2 ${className}`}>
        <span>{formatBRL(promo)}</span>
        <s className="muted text-[0.85em]">{formatBRL(price)}</s>
      </span>
    );
  }
  return <span className={className}>{formatBRL(price)}</span>;
}

export function ProductCard({ brand, product, priority }: { brand: string; product: Card; priority?: boolean }) {
  const href = `/${brand}/${product.categorySlug}/${product.slug}`;
  const soldOut = product.stock <= 0;
  const sizes = "(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw";
  return (
    <article className="reveal group relative">
      <Link href={href} className="block focus-visible:outline-offset-4">
        <div className="card-media aspect-[4/5]">
          {product.image ? (
            <>
              <SmartImage
                src={product.image}
                alt={product.imageAlt ?? product.name}
                sizes={sizes}
                priority={priority}
                className={`object-cover ${soldOut ? "opacity-60" : ""}`}
              />
              {product.image2 && <SmartImage src={product.image2} alt="" sizes={sizes} className="img-alt object-cover" />}
            </>
          ) : (
            <div className="muted flex h-full items-center justify-center p-6 text-center text-xs">Imagem não informada</div>
          )}
          <div className="absolute left-3 top-3 z-10 flex flex-col items-start gap-1.5">
            {soldOut && <Tag>Esgotado</Tag>}
            {!soldOut && product.promoPrice !== null && <Tag accent>Promoção</Tag>}
            {!soldOut && product.isNew && product.promoPrice === null && <Tag>Novidade</Tag>}
          </div>
          <span className="card-cta absolute inset-x-0 bottom-0 z-10 hidden py-3 text-center text-[11px] font-medium uppercase tracking-[0.22em] sm:block">
            Ver produto
          </span>
        </div>
        <div className="mt-3.5 space-y-1">
          <h3 className="text-[15px] leading-snug">{product.name}</h3>
          <Price price={product.salePrice} promo={product.promoPrice} className="card-price text-[14px] tabular-nums" />
          {product.colors.length > 1 && (
            <div className="flex gap-1.5 pt-1" aria-label={`${product.colors.length} cores`}>
              {product.colors.map((c) => (
                <span
                  key={`${c.name}-${c.hex}`}
                  title={c.name ?? undefined}
                  className="h-2.5 w-2.5 rounded-full border hairline"
                  style={{ background: c.hex ?? "transparent" }}
                />
              ))}
            </div>
          )}
        </div>
      </Link>
    </article>
  );
}

export function Tag({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className="px-2 py-1 text-[10px] font-medium uppercase tracking-[0.16em]"
      style={
        accent
          ? { background: "var(--brand-accent)", color: "var(--brand-bg)" }
          : { background: "var(--brand-bg)", color: "var(--brand-text)" }
      }
    >
      {children}
    </span>
  );
}

export function ProductGrid({ brand, products }: { brand: string; products: Card[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-6">
      {products.map((p, i) => (
        <ProductCard key={p.id} brand={brand} product={p} priority={i < 4} />
      ))}
    </div>
  );
}

export function StorePagination({
  page,
  pages,
  makeHref,
}: {
  page: number;
  pages: number;
  makeHref: (page: number) => string;
}) {
  if (pages <= 1) return null;
  const nums = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 1);
  return (
    <nav className="mt-16 flex items-center justify-center gap-1 text-sm" aria-label="Paginação">
      {page > 1 && (
        <Link className="px-3 py-2 underline-offset-4 hover:underline" href={makeHref(page - 1)}>
          Anterior
        </Link>
      )}
      {nums.map((n, i) => (
        <span key={n} className="flex items-center">
          {i > 0 && nums[i - 1] !== n - 1 && <span className="muted px-1">…</span>}
          <Link
            href={makeHref(n)}
            aria-current={n === page ? "page" : undefined}
            className={`min-w-9 px-3 py-2 text-center tabular-nums ${n === page ? "border-b border-current" : "muted hover:opacity-100"}`}
          >
            {n}
          </Link>
        </span>
      ))}
      {page < pages && (
        <Link className="px-3 py-2 underline-offset-4 hover:underline" href={makeHref(page + 1)}>
          Próxima
        </Link>
      )}
    </nav>
  );
}

export function SectionTitle({ title, href, linkLabel }: { title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-8 flex items-end justify-between gap-6">
      <h2 className="font-display text-4xl leading-none sm:text-5xl">{title}</h2>
      {href && (
        <Link href={href} className="nav-link muted shrink-0 text-sm hover:opacity-100">
          {linkLabel ?? "Ver tudo"}
        </Link>
      )}
    </div>
  );
}
