/** Helpers Zod para formulários (strings vazias viram null, números pt-BR etc.). */
import { z } from "zod";

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const trimStr = (v: unknown) => (typeof v === "string" ? v.trim() : v);

export const zText = (max = 500) => z.preprocess(trimStr, z.string().max(max, `Máximo de ${max} caracteres.`));
export const zRequired = (label: string, max = 300) =>
  z.preprocess(trimStr, z.string({ error: `${label} é obrigatório.` }).min(1, `${label} é obrigatório.`).max(max));
export const zOptionalText = (max = 2000) =>
  z.preprocess((v) => emptyToNull(trimStr(v)), z.string().max(max, `Máximo de ${max} caracteres.`).nullable().optional());

/** Aceita "1.234,56", "1234.56", "1234,5". */
export function parseDecimal(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/\s|R\$/g, "");
  if (!s) return null;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

export const zMoney = (label: string) =>
  z.preprocess(parseDecimal, z.number({ error: `${label}: valor inválido.` }).min(0, `${label} não pode ser negativo.`).max(10_000_000));
export const zOptionalMoney = (label: string) =>
  z.preprocess(
    parseDecimal,
    z.number({ error: `${label}: valor inválido.` }).min(0, `${label} não pode ser negativo.`).max(10_000_000).nullable().optional(),
  );
export const zInt = (label: string, min = 0) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? NaN : Number(v)),
    z.number({ error: `${label}: número inválido.` }).int(`${label} deve ser inteiro.`).min(min),
  );
export const zOptionalInt = (label: string, min = 0) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    z.number({ error: `${label}: número inválido.` }).int().min(min).nullable().optional(),
  );
export const zBool = z.preprocess((v) => v === true || v === "on" || v === "true" || v === "1", z.boolean());
export const zUuid = z.string().uuid("Identificador inválido.");
export const zOptionalUuid = z.preprocess(emptyToNull, z.string().uuid().nullable().optional());
export const zEmail = z.preprocess(trimStr, z.string().email("E-mail inválido.").max(200).transform((s) => s.toLowerCase()));
export const zOptionalEmail = z.preprocess(
  (v) => emptyToNull(trimStr(v)),
  z.string().email("E-mail inválido.").max(200).nullable().optional(),
);
export const zOptionalDate = z.preprocess(
  emptyToNull,
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.").nullable().optional(),
);
export const zDate = z.preprocess(trimStr, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."));
export const zOptionalUrl = z.preprocess(
  (v) => emptyToNull(trimStr(v)),
  z
    .string()
    .max(1000)
    .refine((s) => /^https?:\/\//i.test(s) || s.startsWith("/"), "Use um endereço http(s) ou um caminho /.")
    .nullable()
    .optional(),
);
export const zState = z.preprocess(
  (v) => emptyToNull(typeof v === "string" ? v.trim().toUpperCase() : v),
  z.string().regex(/^[A-Z]{2}$/, "UF inválida.").nullable().optional(),
);
export const zHexColor = z.preprocess(
  (v) => emptyToNull(trimStr(v)),
  z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida (use #RRGGBB).").nullable().optional(),
);
