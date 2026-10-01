import Link from "next/link";
import clsx from "clsx";
import { formatBRL, formatDate, formatDateTime, formatNumber, NOT_INFORMED } from "@/lib/format";

export const cx = clsx;

export const btn = {
  base: "inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap",
  primary: "bg-stone-900 text-white hover:bg-stone-800",
  secondary: "border border-stone-300 bg-white text-stone-800 hover:bg-stone-50",
  ghost: "text-stone-700 hover:bg-stone-100",
  danger: "bg-red-700 text-white hover:bg-red-800",
  dangerOutline: "border border-red-200 bg-white text-red-700 hover:bg-red-50",
};

export function LinkButton({
  href,
  children,
  variant = "secondary",
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: keyof Omit<typeof btn, "base">;
  className?: string;
}) {
  return (
    <Link href={href} className={cx(btn.base, btn[variant], className)}>
      {children}
    </Link>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  crumbs,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  crumbs?: { href?: string; label: string }[];
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="Trilha" className="mb-2 flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden>/</span>}
                {c.href ? (
                  <Link href={c.href} className="hover:text-stone-900">
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current="page">{c.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-stone-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cx("min-w-0 rounded-lg border border-stone-200 bg-white", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-5 py-3.5">
          <div>
            {title && <h2 className="text-[15px] font-semibold text-stone-900">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-stone-500">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cx("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

const TONES = {
  neutral: "bg-stone-100 text-stone-700 ring-stone-200",
  info: "bg-sky-50 text-sky-800 ring-sky-200",
  success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  danger: "bg-red-50 text-red-800 ring-red-200",
  demo: "bg-violet-50 text-violet-800 ring-violet-200",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset", TONES[tone], className)}>
      {children}
    </span>
  );
}

export function DemoBadge({ show }: { show: boolean | null | undefined }) {
  return show ? <Badge tone="demo">DEMO</Badge> : null;
}

/** Ponto de cor que identifica a marca (FINA = dourado, BRAVUS = cobre). */
export function BrandTag({ name, slug }: { name: string; slug?: string | null }) {
  const color = slug === "bravus" ? "#B87333" : slug === "fina-classica" ? "#B39256" : "#a8a29e";
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] text-stone-700">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden />
      {name}
    </span>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <p className="text-[15px] font-medium text-stone-900">{title}</p>
      {text && <p className="mt-1.5 max-w-md text-sm text-stone-500">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cx("overflow-x-auto", className)}>
      <table className="w-full min-w-[640px] border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className, align }: { children?: React.ReactNode; className?: string; align?: "right" | "center" }) {
  return (
    <th
      scope="col"
      className={cx(
        "whitespace-nowrap border-b border-stone-200 bg-stone-50/70 px-4 py-2.5 text-left text-xs font-medium text-stone-500",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  align,
  colSpan,
}: {
  children?: React.ReactNode;
  className?: string;
  align?: "right" | "center";
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cx(
        "border-b border-stone-100 px-4 py-3 align-middle text-stone-800",
        align === "right" && "text-right tabular-nums",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </td>
  );
}

export function Money({ value, empty }: { value: unknown; empty?: string }) {
  if (value === null || value === undefined || value === "") return <span className="text-stone-400">{empty ?? NOT_INFORMED}</span>;
  return <span className="tabular-nums">{formatBRL(value)}</span>;
}

export function Kpi({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "danger" | "warning" }) {
  return (
    <div className="min-w-0 px-5 py-4">
      <dt className="text-xs text-stone-500">{label}</dt>
      <dd className={cx("mt-1 truncate text-xl font-semibold tabular-nums", tone === "danger" ? "text-red-700" : tone === "warning" ? "text-amber-700" : "text-stone-900")}>
        {value}
      </dd>
      {hint && <dd className="mt-0.5 truncate text-xs text-stone-500">{hint}</dd>}
    </div>
  );
}

/** Faixa de indicadores numa única superfície (não um card por número). */
export function KpiStrip({ children, cols = 5 }: { children: React.ReactNode; cols?: 3 | 4 | 5 | 6 }) {
  const grid = { 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5", 6: "lg:grid-cols-6" }[cols];
  return (
    <dl className={cx("grid grid-cols-2 divide-stone-200 rounded-lg border border-stone-200 bg-white sm:grid-cols-3 [&>*]:border-stone-200 max-lg:[&>*]:border-b lg:divide-x", grid)}>
      {children}
    </dl>
  );
}

export function AdminPagination({
  page,
  pages,
  total,
  makeHref,
}: {
  page: number;
  pages: number;
  total?: number;
  makeHref: (p: number) => string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-stone-200 px-4 py-3 text-sm text-stone-600">
      <span className="tabular-nums">{total !== undefined ? `${formatNumber(total)} registro(s)` : ""}</span>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          <PageLink href={page > 1 ? makeHref(page - 1) : null}>Anterior</PageLink>
          <span className="px-2 tabular-nums">
            {page} de {pages}
          </span>
          <PageLink href={page < pages ? makeHref(page + 1) : null}>Próxima</PageLink>
        </div>
      )}
    </div>
  );
}

function PageLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  if (!href) return <span className="rounded-md px-2.5 py-1 text-stone-300">{children}</span>;
  return (
    <Link href={href} className="rounded-md px-2.5 py-1 hover:bg-stone-100">
      {children}
    </Link>
  );
}

/** Monta hrefs preservando os filtros atuais. */
export function hrefWith(base: string, params: Record<string, string | string[] | undefined | null>, patch: Record<string, string | number | null>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    for (const item of Array.isArray(v) ? v : [v]) q.append(k, item);
  }
  for (const [k, v] of Object.entries(patch)) {
    q.delete(k);
    if (v !== null && v !== "") q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

export function FilterBar({ children, action }: { children: React.ReactNode; action?: string }) {
  return (
    <form action={action} className="flex flex-wrap items-end gap-3 border-b border-stone-200 px-4 py-3">
      {children}
      <button type="submit" className={cx(btn.base, btn.secondary, "py-1.5")}>
        Filtrar
      </button>
    </form>
  );
}

export function FilterSelect({
  name,
  label,
  value,
  options,
  allLabel = "Todos",
}: {
  name: string;
  label: string;
  value?: string | null;
  options: Record<string, string> | { value: string; label: string }[];
  allLabel?: string;
}) {
  const list = Array.isArray(options) ? options : Object.entries(options).map(([value, label]) => ({ value, label }));
  return (
    <label className="flex flex-col gap-1 text-xs text-stone-500">
      {label}
      <select name={name} defaultValue={value ?? ""} className="admin-input min-w-36 py-1.5">
        <option value="">{allLabel}</option>
        {list.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FilterSearch({ value, placeholder = "Buscar" }: { value?: string | null; placeholder?: string }) {
  return (
    <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-stone-500">
      Busca
      <input type="search" name="q" defaultValue={value ?? ""} placeholder={placeholder} className="admin-input py-1.5" />
    </label>
  );
}

export function CellDate({ value, time }: { value: Date | string | null | undefined; time?: boolean }) {
  if (!value) return <span className="text-stone-400">{NOT_INFORMED}</span>;
  return <span className="whitespace-nowrap tabular-nums">{time ? formatDateTime(value) : formatDate(value)}</span>;
}

export function Forbidden({ module }: { module?: string }) {
  return (
    <div className="mx-auto max-w-lg rounded-lg border border-stone-200 bg-white p-10 text-center">
      <h1 className="text-lg font-semibold text-stone-900">Acesso não permitido</h1>
      <p className="mt-2 text-sm text-stone-600">
        Seu papel não inclui acesso {module ? <>ao módulo <strong>{module}</strong></> : "a esta área"}. Peça a um administrador para ajustar suas permissões.
      </p>
      <LinkButton href="/admin" className="mt-6">
        Voltar ao dashboard
      </LinkButton>
    </div>
  );
}

export function DefinitionList({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(120px,auto)_1fr] gap-x-6 gap-y-2.5 text-sm">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-stone-500">{k}</dt>
          <dd className="min-w-0 break-words text-stone-900">{v ?? <span className="text-stone-400">{NOT_INFORMED}</span>}</dd>
        </div>
      ))}
    </dl>
  );
}
