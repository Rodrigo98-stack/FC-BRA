import Link from "next/link";
import Image from "next/image";
import { formatBRL } from "@/lib/format";
import type { ProductCard as Card } from "@/server/services/catalog";

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
      <span className="font-display leading-none">{name}</span>
      {showPlaceholder && (
        <span className="mt-2 text-[10px] font-normal tracking-[0.12em] opacity-50" title="Envie o logo em Configurações › Identidade visual">
          {placeholder}
        </span>
      )}
    </span>
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
  return (
    <article className="group relative">
      <Link href={href} className="block focus-visible:outline-offset-4">
        <div className="relative aspect-[4/5] overflow-hidden bg-brand-secondary">
          {product.image ? (
            <SmartImage
              src={product.image}
              alt={product.imageAlt ?? product.name}
              sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
              priority={priority}
              className={`object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03] ${soldOut ? "opacity-60" : ""}`}
            />
          ) : (
            <div className="muted flex h-full items-center justify-center p-6 text-center text-xs">Imagem não informada</div>
          )}
          <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
            {soldOut && <Tag>Esgotado</Tag>}
            {!soldOut && product.promoPrice !== null && <Tag accent>Promoção</Tag>}
            {!soldOut && product.isNew && product.promoPrice === null && <Tag>Novidade</Tag>}
          </div>
        </div>
        <div className="mt-3.5 space-y-1">
          <h3 className="text-[15px] leading-snug">{product.name}</h3>
          <Price price={product.salePrice} promo={product.promoPrice} className="text-[14px] tabular-nums" />
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
      <h2 className="font-display text-3xl leading-none sm:text-4xl">{title}</h2>
      {href && (
        <Link href={href} className="muted shrink-0 text-sm underline-offset-4 hover:underline">
          {linkLabel ?? "Ver tudo"}
        </Link>
      )}
    </div>
  );
}
