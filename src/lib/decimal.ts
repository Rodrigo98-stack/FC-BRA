/** Aceita "1.234,56", "1234.56", "1234,5" (uso no cliente e no servidor). */
export function parseDecimal(v: unknown): number {
  if (v === null || v === undefined) return NaN;
  if (typeof v === "number") return v;
  const s = String(v).trim().replace(/\s|R\$/g, "");
  if (!s) return NaN;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  return Number(normalized);
}
