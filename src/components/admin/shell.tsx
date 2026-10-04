"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { NavItem } from "@/lib/admin-nav";
import { initials } from "@/lib/text";
import { setAdminBrand, logout } from "@/app/admin/auth-actions";
import { Toaster } from "./client";
import { cx } from "./ui";

type Counters = { pedidos: number; estoque: number; convites: number };
type SearchHit = { type: string; label: string; detail?: string; href: string };

export function AdminShell({
  nav,
  counters,
  user,
  roleLabel,
  brands,
  selectedBrandId,
  demoMode,
  children,
}: {
  nav: NavItem[][];
  counters: Counters;
  user: { fullName: string; email: string; isDemo: boolean };
  roleLabel: string;
  brands: { id: string; name: string; slug: string }[];
  selectedBrandId: string | null;
  demoMode: { active: boolean; store: string | null };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [pendingBrand, startBrand] = useTransition();

  useEffect(() => setMenuOpen(false), [pathname]);

  // Atalhos: Ctrl/Cmd+K busca, "/" busca, "?" ajuda, "g" + tecla navega.
  useEffect(() => {
    let gPressed = 0;
    const shortcuts = new Map(
      nav.flat().filter((n) => n.shortcut).map((n) => [n.shortcut!.split(" ")[1], n.href] as const),
    );
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "/") {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (e.key === "?") {
        setHelpOpen(true);
      } else if (e.key === "g") {
        gPressed = Date.now();
      } else if (Date.now() - gPressed < 1200 && shortcuts.has(e.key)) {
        gPressed = 0;
        router.push(shortcuts.get(e.key)!);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav, router]);

  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`));

  const sidebar = (
    <nav aria-label="Menu do painel" className="flex h-full flex-col">
      <div className="px-5 pb-3 pt-4">
        <Link href="/admin" className="block text-[13px] font-semibold tracking-[0.14em] text-stone-900">
          FC-BRA
        </Link>
        <p className="text-xs text-stone-500">FINA&CLÁSSICA + BRAVUS</p>
      </div>
      {brands.length > 1 && (
        <div className="px-3 pb-3">
          <label htmlFor="brand-switch" className="sr-only">
            Marca ativa
          </label>
          <select
            id="brand-switch"
            value={selectedBrandId ?? ""}
            disabled={pendingBrand}
            onChange={(e) => {
              const v = e.target.value || null;
              startBrand(async () => {
                await setAdminBrand(v);
                router.refresh();
              });
            }}
            className="admin-input py-1.5 text-[13px]"
          >
            <option value="">Todas as marcas</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-3 pb-6">
        {nav.map((group, gi) => (
          <ul key={gi} className={cx("space-y-px", gi > 0 && "mt-2 border-t border-stone-200 pt-2")}>
            {group.map((item) => {
              const count = item.counter ? counters[item.counter] : 0;
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "flex items-center justify-between rounded-md px-2.5 py-[5px] text-[13.5px] transition-colors",
                      active ? "bg-stone-900 text-white" : "text-stone-700 hover:bg-stone-200/60 hover:text-stone-900",
                    )}
                  >
                    <span>{item.label}</span>
                    {count > 0 && (
                      <span
                        className={cx(
                          "min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold tabular-nums",
                          active ? "bg-white/20 text-white" : item.counter === "estoque" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900",
                        )}
                        title={item.counter === "estoque" ? "Alertas de estoque" : item.counter === "convites" ? "Convites pendentes" : "Pedidos aguardando ação"}
                      >
                        {count}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        ))}
      </div>
    </nav>
  );

  return (
    <div className="min-h-svh bg-stone-100">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-stone-200 bg-stone-50 lg:block">{sidebar}</aside>
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Fechar menu" className="absolute inset-0 bg-stone-900/40" onClick={() => setMenuOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-stone-200 bg-stone-50 shadow-xl">{sidebar}</aside>
        </div>
      )}
      <div className="lg:pl-60">
        {demoMode.active && (
          <div className="border-b border-violet-200 bg-violet-50 px-4 py-2 text-center text-xs text-violet-900">
            Modo demonstração: banco embutido {demoMode.store === "netlify-blobs" ? "salvo no Netlify Blobs" : "local"}. Para operar de verdade, conecte o Supabase
            (variável <code>DATABASE_URL</code>) — veja Configurações › Sistema.
          </div>
        )}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-stone-200 bg-white/90 px-4 py-2.5 backdrop-blur lg:px-8">
          <button type="button" className="rounded-md p-1.5 text-stone-700 hover:bg-stone-100 lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Abrir menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-stone-200 bg-stone-50 px-3 py-1.5 text-left text-sm text-stone-500 hover:border-stone-300 sm:max-w-md"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <span className="truncate">Buscar produtos, pedidos, clientes…</span>
            <kbd className="ml-auto hidden rounded border border-stone-300 bg-white px-1.5 text-[10px] text-stone-500 sm:inline">Ctrl K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-3">
            <button type="button" onClick={() => setHelpOpen(true)} className="hidden rounded-md px-2 py-1 text-xs text-stone-500 hover:bg-stone-100 sm:block" title="Atalhos de teclado">
              Atalhos
            </button>
            <UserMenu user={user} roleLabel={roleLabel} />
          </div>
        </header>
        <main className="px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} nav={nav.flat()} />
      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} nav={nav.flat()} />
      <Toaster />
    </div>
  );
}

function UserMenu({ user, roleLabel }: { user: { fullName: string; email: string; isDemo: boolean }; roleLabel: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-2.5 rounded-md py-1 pl-1 pr-2 hover:bg-stone-100"
        title="Usuário conectado"
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-stone-900 text-xs font-semibold text-white">{initials(user.fullName)}</span>
        <span className="hidden text-left leading-tight md:block">
          <span className="block max-w-40 truncate text-[13px] font-medium text-stone-900">{user.fullName}</span>
          <span className="block max-w-40 truncate text-[11px] text-stone-500">{roleLabel}</span>
        </span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-lg border border-stone-200 bg-white p-1.5 shadow-lg">
          <div className="border-b border-stone-100 px-3 py-2.5">
            <p className="truncate text-sm font-medium text-stone-900">{user.fullName}</p>
            <p className="truncate text-xs text-stone-500">{user.email}</p>
            <p className="mt-1 text-xs text-stone-500">{roleLabel}</p>
          </div>
          <Link href="/admin/minha-conta" className="block rounded-md px-3 py-2 text-sm text-stone-700 hover:bg-stone-100">
            Minha conta e senha
          </Link>
          <a href="/" target="_blank" rel="noopener" className="block rounded-md px-3 py-2 text-sm text-stone-700 hover:bg-stone-100">
            Ver a loja
          </a>
          <form action={logout}>
            <button type="submit" className="w-full rounded-md px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50">
              Sair
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function CommandPalette({ open, onClose, nav }: { open: boolean; onClose: () => void; nav: NavItem[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      setTimeout(() => inputRef.current?.focus(), 0);
    }
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (!open || q.trim().length < 2) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/admin/search?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((j: { hits: SearchHit[] }) => setHits(j.hits ?? []))
        .catch(() => {});
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, open]);

  const pages = useMemo(() => {
    const term = q.trim().toLowerCase();
    return nav
      .filter((n) => !term || n.label.toLowerCase().includes(term))
      .slice(0, term ? 6 : 8)
      .map((n) => ({ type: "Página", label: n.label, href: n.href }) as SearchHit);
  }, [q, nav]);
  const all = useMemo(() => [...pages, ...hits], [pages, hits]);
  useEffect(() => setActive(0), [q]);

  const go = useCallback(
    (hit: SearchHit | undefined) => {
      if (!hit) return;
      onClose();
      setQ("");
      router.push(hit.href);
    },
    [onClose, router],
  );

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-label="Busca global"
      className="mt-[12vh] w-[min(94vw,560px)] rounded-lg border border-stone-200 p-0 shadow-2xl backdrop:bg-stone-900/40"
    >
      <div className="border-b border-stone-200 p-3">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, all.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              go(all[active]);
            }
          }}
          placeholder="Digite um produto, SKU, nº do pedido, cliente ou página"
          className="w-full bg-transparent px-2 py-1.5 text-[15px] outline-none"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-results"
        />
      </div>
      <ul id="palette-results" role="listbox" className="max-h-[50vh] overflow-y-auto p-1.5">
        {all.length === 0 && <li className="px-3 py-6 text-center text-sm text-stone-500">Nenhum resultado.</li>}
        {all.map((h, i) => (
          <li key={`${h.type}-${h.href}-${i}`} role="option" aria-selected={i === active}>
            <button
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => go(h)}
              className={cx("flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm", i === active ? "bg-stone-100" : "")}
            >
              <span className="min-w-0">
                <span className="block truncate text-stone-900">{h.label}</span>
                {h.detail && <span className="block truncate text-xs text-stone-500">{h.detail}</span>}
              </span>
              <span className="shrink-0 text-[11px] text-stone-400">{h.type}</span>
            </button>
          </li>
        ))}
      </ul>
    </dialog>
  );
}

function ShortcutsHelp({ open, onClose, nav }: { open: boolean; onClose: () => void; nav: NavItem[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const rows: [string, string][] = [
    ["Ctrl K ou /", "Busca global"],
    ["?", "Mostrar atalhos"],
    ...nav.filter((n) => n.shortcut).map((n) => [n.shortcut!, n.label] as [string, string]),
  ];
  return (
    <dialog ref={ref} onClose={onClose} className="w-[min(92vw,400px)] rounded-lg border border-stone-200 p-0 shadow-xl backdrop:bg-stone-900/40">
      <div className="p-6">
        <h2 className="text-lg font-semibold">Atalhos de teclado</h2>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt>
                <kbd className="rounded border border-stone-300 bg-stone-50 px-1.5 py-0.5 text-xs">{k}</kbd>
              </dt>
              <dd className="text-stone-700">{v}</dd>
            </div>
          ))}
        </dl>
        <button type="button" onClick={onClose} className="mt-6 rounded-md border border-stone-300 px-3 py-1.5 text-sm">
          Fechar
        </button>
      </div>
    </dialog>
  );
}
