"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { formatBRL } from "@/lib/format";
import { useCart } from "@/store/cart";
import { track } from "@/lib/visitor";
import { SmartImage } from "./ui";

type Img = { url: string; alt: string | null };

export function Gallery({ images, name }: { images: Img[]; name: string }) {
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(false);
  if (!images.length) {
    return <div className="muted flex aspect-[4/5] items-center justify-center bg-brand-secondary text-sm">Imagem não informada</div>;
  }
  const current = images[Math.min(active, images.length - 1)];
  return (
    <div className="grid gap-3 lg:grid-cols-[72px_1fr] lg:gap-4">
      <div className="order-2 flex gap-2 overflow-x-auto lg:order-1 lg:flex-col">
        {images.map((img, i) => (
          <button
            key={img.url + i}
            type="button"
            onClick={() => setActive(i)}
            aria-label={`Ver imagem ${i + 1} de ${images.length}`}
            aria-current={i === active}
            className={`relative aspect-[4/5] w-16 shrink-0 overflow-hidden bg-brand-secondary transition-opacity lg:w-full ${i === active ? "ring-1 ring-[var(--brand-accent)]" : "opacity-60 hover:opacity-100"}`}
          >
            <SmartImage src={img.url} alt="" sizes="72px" />
          </button>
        ))}
      </div>
      <div
        className="zoomable relative order-1 aspect-[4/5] cursor-zoom-in overflow-hidden bg-brand-secondary lg:order-2"
        data-zoom={zoom ? "on" : "off"}
        onPointerEnter={(e) => e.pointerType === "mouse" && setZoom(true)}
        onPointerLeave={() => setZoom(false)}
        onPointerMove={(e) => {
          if (e.pointerType !== "mouse") return;
          const r = e.currentTarget.getBoundingClientRect();
          e.currentTarget.style.setProperty("--zx", `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
          e.currentTarget.style.setProperty("--zy", `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
        }}
      >
        <div key={current.url} className="fade-up absolute inset-0" style={{ animationDuration: "0.6s" }}>
          <SmartImage src={current.url} alt={current.alt ?? name} sizes="(min-width: 1024px) 50vw, 100vw" priority />
        </div>
      </div>
    </div>
  );
}

export type BuyVariant = {
  id: string;
  size: string | null;
  color: string | null;
  colorHex: string | null;
  price: number;
  stock: number;
  imageUrl: string | null;
};

export function BuyBox({
  brand,
  product,
  variants,
  basePrice,
  promoPrice,
}: {
  brand: string;
  product: { id: string; slug: string; categorySlug: string; name: string; image: string | null };
  variants: BuyVariant[];
  basePrice: number;
  promoPrice: number | null;
}) {
  const colors = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const v of variants) if (v.color) m.set(v.color, v.colorHex);
    return [...m.entries()];
  }, [variants]);
  const sizes = useMemo(() => [...new Set(variants.map((v) => v.size).filter((s): s is string => !!s))], [variants]);

  const firstAvailable = variants.find((v) => v.stock > 0) ?? variants[0];
  const [color, setColor] = useState<string | null>(firstAvailable?.color ?? null);
  const [size, setSize] = useState<string | null>(sizes.length === 1 ? sizes[0] : null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const add = useCart((s) => s.add);

  const selected =
    variants.find((v) => (colors.length ? v.color === color : true) && (sizes.length ? v.size === size : true)) ?? null;
  const stockFor = (s: string) => variants.find((v) => v.size === s && (colors.length ? v.color === color : true))?.stock ?? 0;
  const price = selected?.price ?? promoPrice ?? basePrice;
  const showStrike = promoPrice !== null && price < basePrice;
  const maxQty = Math.max(0, Math.min(selected?.stock ?? 0, 10));

  function onAdd() {
    setError(null);
    if (sizes.length && !size) return setError("Escolha um tamanho.");
    if (!selected) return setError("Combinação indisponível.");
    if (selected.stock <= 0) return setError("Esta variação está esgotada.");
    add(brand, {
      variantId: selected.id,
      productId: product.id,
      slug: product.slug,
      categorySlug: product.categorySlug,
      name: product.name,
      size: selected.size,
      color: selected.color,
      image: selected.imageUrl ?? product.image,
      price: selected.price,
      quantity: qty,
      maxStock: selected.stock,
    });
    track({ brand, type: "add_to_cart", productId: product.id });
    setAdded(true);
  }

  return (
    <div>
      <p className="text-2xl tabular-nums">
        {formatBRL(price)}
        {showStrike && <s className="muted ml-3 text-base">{formatBRL(basePrice)}</s>}
      </p>

      {colors.length > 0 && (
        <fieldset className="mt-8">
          <legend className="mb-3 text-sm">
            Cor: <span className="muted">{color ?? "escolha"}</span>
          </legend>
          <div className="flex flex-wrap gap-2.5">
            {colors.map(([name, hex]) => (
              <button
                key={name}
                type="button"
                onClick={() => {
                  setColor(name);
                  setAdded(false);
                  setQty(1);
                }}
                aria-pressed={color === name}
                title={name}
                className={`h-9 w-9 rounded-full border p-0.5 ${color === name ? "border-[var(--brand-text)]" : "hairline"}`}
              >
                <span className="block h-full w-full rounded-full border hairline" style={{ background: hex ?? "transparent" }} />
                <span className="sr-only">{name}</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {sizes.length > 0 && (
        <fieldset className="mt-7">
          <legend className="mb-3 text-sm">
            Tamanho: <span className="muted">{size ?? "escolha"}</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {sizes.map((s) => {
              const stock = stockFor(s);
              return (
                <button
                  key={s}
                  type="button"
                  disabled={stock <= 0}
                  onClick={() => {
                    setSize(s);
                    setAdded(false);
                    setQty(1);
                  }}
                  aria-pressed={size === s}
                  className={`min-w-12 border px-3 py-2.5 text-sm tabular-nums transition-colors disabled:cursor-not-allowed disabled:line-through disabled:opacity-40 ${
                    size === s ? "border-[var(--brand-text)] bg-[var(--brand-text)] text-[var(--brand-bg)]" : "hairline hover:border-[var(--brand-text)]"
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <p className="muted mt-5 text-sm" aria-live="polite">
        {selected
          ? selected.stock <= 0
            ? "Esgotado nesta combinação."
            : selected.stock <= 3
              ? `Últimas ${selected.stock} unidade(s).`
              : "Disponível."
          : sizes.length && !size
            ? "Escolha o tamanho para ver a disponibilidade."
            : "Combinação indisponível."}
      </p>

      <div className="mt-6 flex items-stretch gap-3">
        <div className="flex items-center border hairline">
          <button type="button" className="px-3.5 py-3" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Diminuir quantidade">
            −
          </button>
          <span className="w-8 text-center tabular-nums" aria-live="polite" aria-label="Quantidade">
            {qty}
          </span>
          <button
            type="button"
            className="px-3.5 py-3 disabled:opacity-30"
            onClick={() => setQty((q) => Math.min(maxQty || 1, q + 1))}
            disabled={qty >= maxQty}
            aria-label="Aumentar quantidade"
          >
            +
          </button>
        </div>
        <button type="button" onClick={onAdd} className="btn-brand flex-1" disabled={!!selected && selected.stock <= 0}>
          Adicionar ao carrinho
        </button>
      </div>
      {error && (
        <p className="mt-3 text-sm" role="alert" style={{ color: "var(--brand-accent)" }}>
          {error}
        </p>
      )}
      {added && (
        <div className="mt-4 flex items-center justify-between border hairline px-4 py-3 text-sm" role="status">
          <span>Adicionado ao carrinho.</span>
          <Link href={`/${brand}/carrinho`} className="underline underline-offset-4">
            Ver carrinho
          </Link>
        </div>
      )}
    </div>
  );
}
