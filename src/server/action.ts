/**
 * Padrão de server action: valida, executa e devolve um resultado
 * serializável. Erros inesperados são registrados no servidor e o usuário
 * recebe uma mensagem genérica — nunca stack trace (§26).
 */
import { z } from "zod";
import { AppError } from "./errors";

export type ActionResult<T = unknown> =
  | { ok: true; message?: string; data?: T; redirectTo?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export const GENERIC_ERROR = "Não foi possível concluir a operação. Tente novamente.";

export function zodFieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export async function runAction<T>(fn: () => Promise<ActionResult<T> | void>): Promise<ActionResult<T>> {
  try {
    const result = await fn();
    return result ?? { ok: true };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message, fieldErrors: err.fieldErrors };
    if (err instanceof z.ZodError) {
      return { ok: false, error: "Revise os campos destacados.", fieldErrors: zodFieldErrors(err) };
    }
    // Erros de framework (redirect/notFound) precisam seguir adiante.
    const digest = (err as { digest?: string })?.digest;
    if (typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_NOT_FOUND"))) {
      throw err;
    }
    const pgCode = (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
    if (pgCode === "23505") return { ok: false, error: "Já existe um registro com estes dados (valor duplicado)." };
    if (pgCode === "23503") return { ok: false, error: "Este registro está vinculado a outros dados." };
    if (pgCode === "23514") return { ok: false, error: "Algum valor está fora das regras permitidas." };
    console.error("[action] erro inesperado:", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/** Converte FormData em objeto simples (campos repetidos viram array). */
export function formToObject(form: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    if (key.startsWith("$ACTION")) continue;
    const v = typeof value === "string" ? value : value;
    if (key in out) {
      const prev = out[key];
      out[key] = Array.isArray(prev) ? [...prev, v] : [prev, v];
    } else {
      out[key] = v;
    }
  }
  return out;
}
