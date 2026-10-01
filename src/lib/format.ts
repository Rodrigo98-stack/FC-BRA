/** Formatação pt-BR (moeda, datas, números) — usada no servidor e no cliente. */

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const num = new Intl.NumberFormat("pt-BR");
const dateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" });
const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});

export const NOT_INFORMED = "Não informado";
export const CONFIG_PENDING = "Configuração pendente";
export const ADD_INFO = "Adicionar informação";

export function toNumber(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function formatBRL(v: unknown): string {
  return brl.format(toNumber(v));
}

/** Moeda ou "Não informado" quando o valor não existe. */
export function formatBRLOrEmpty(v: unknown): string {
  return v === null || v === undefined || v === "" ? NOT_INFORMED : formatBRL(v);
}

export function formatNumber(v: unknown): string {
  return num.format(toNumber(v));
}

export function formatPercent(v: unknown, digits = 1): string {
  if (v === null || v === undefined || v === "") return NOT_INFORMED;
  return `${toNumber(v).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

export function formatDate(v: Date | string | null | undefined): string {
  if (!v) return NOT_INFORMED;
  const d = typeof v === "string" ? new Date(v.length === 10 ? `${v}T12:00:00` : v) : v;
  return Number.isNaN(d.getTime()) ? NOT_INFORMED : dateFmt.format(d);
}

export function formatDateTime(v: Date | string | null | undefined): string {
  if (!v) return NOT_INFORMED;
  const d = typeof v === "string" ? new Date(v) : v;
  return Number.isNaN(d.getTime()) ? NOT_INFORMED : dateTimeFmt.format(d);
}

export function orderCode(prefix: string | null | undefined, number: number | string): string {
  return `${prefix ?? ""}${prefix ? "-" : ""}${String(number).padStart(6, "0")}`;
}

/** Valores monetários em centavos inteiros (evita erros de ponto flutuante). */
export function toCents(v: unknown): number {
  return Math.round(toNumber(v) * 100);
}

export function centsToDecimal(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function orEmpty(v: string | null | undefined, fallback = NOT_INFORMED): string {
  return v && v.trim() ? v : fallback;
}
