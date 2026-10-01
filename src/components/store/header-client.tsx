"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { cartCount, useCart } from "@/store/cart";

export function CartLink({ brand }: { brand: string }) {
  const items = useCart((s) => s.carts[brand]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const count = mounted ? cartCount(items) : 0;
  return (
    <Link href={`/${brand}/carrinho`} className="relative inline-flex items-center gap-2 py-2 text-[13px]" aria-label={`Carrinho, ${count} item(ns)`}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
        <path d="M5 8h14l-1.2 11.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8L5 8Z" />
        <path d="M9 8V6a3 3 0 0 1 6 0v2" />
      </svg>
      <span className="hidden sm:inline">Carrinho</span>
      {count > 0 && (
        <span
          className="absolute -right-2.5 top-0 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-semibold tabular-nums sm:static sm:h-auto sm:min-w-0 sm:rounded-none sm:bg-transparent sm:p-0 sm:text-[13px] sm:font-normal"
          style={{ background: "var(--brand-accent)", color: "var(--brand-bg)" }}
        >
          <span className="sm:hidden">{count}</span>
          <span className="hidden sm:inline" style={{ color: "var(--brand-text)" }}>
            ({count})
          </span>
        </span>
      )}
    </Link>
  );
}

export function MobileNav({
  brand,
  categories,
}: {
  brand: string;
  categories: { slug: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);
  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="mobile-nav"
        className="inline-flex items-center gap-2 py-2 text-[13px]"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
          {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 8h16M4 16h16" />}
        </svg>
        <span>{open ? "Fechar" : "Menu"}</span>
      </button>
      {open && (
        <div id="mobile-nav" className="store fixed inset-x-0 bottom-0 top-[var(--header-h,64px)] z-40 overflow-y-auto border-t hairline px-6 py-8">
          <form action={`/${brand}/busca`} className="mb-8">
            <label className="sr-only" htmlFor="m-q">
              Buscar
            </label>
            <input id="m-q" name="q" placeholder="Buscar produtos" className="store-input" />
          </form>
          <ul className="space-y-1">
            {categories.map((c) => (
              <li key={c.slug}>
                <Link href={`/${brand}/${c.slug}`} className="font-display block py-2.5 text-2xl">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/" className="muted mt-10 inline-block text-sm underline underline-offset-4">
            Trocar de loja
          </Link>
        </div>
      )}
    </div>
  );
}
