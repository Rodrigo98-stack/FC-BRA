/**
 * Log de auditoria (§28.13): quem, o quê, quando, antes/depois.
 * Deve ser chamado DENTRO da mesma transação da alteração auditada.
 */
import type { Executor } from "./db";
import { schema } from "./db";
import { getRequestMeta } from "./request";

export type AuditActor = { id: string; fullName: string; email: string } | null;

const SENSITIVE_KEYS = new Set(["passwordHash", "password_hash", "tokenHash", "token_hash", "cpfHash", "cpf_hash"]);

/** Remove campos sensíveis e converte para JSON simples. */
export function sanitizeForAudit(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(sanitizeForAudit);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k)) continue;
      out[k] = sanitizeForAudit(v);
    }
    return out;
  }
  return value;
}

export async function audit(
  db: Executor,
  actor: AuditActor,
  entry: {
    action: string;
    entity: string;
    entityId?: string | null;
    brandId?: string | null;
    before?: unknown;
    after?: unknown;
    reason?: string | null;
  },
) {
  const meta = await getRequestMeta();
  await db.insert(schema.auditLogs).values({
    actorUserId: actor?.id ?? null,
    actorName: actor?.fullName ?? "Sistema / cliente",
    actorEmail: actor?.email ?? null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    brandId: entry.brandId ?? null,
    before: entry.before === undefined ? null : sanitizeForAudit(entry.before),
    after: entry.after === undefined ? null : sanitizeForAudit(entry.after),
    reason: entry.reason ?? null,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
}

/** Diferença rasa entre dois objetos (só os campos alterados). */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    const prev = before[key];
    const next = after[key];
    const same =
      prev instanceof Date && next instanceof Date
        ? prev.getTime() === next.getTime()
        : JSON.stringify(prev ?? null) === JSON.stringify(next ?? null);
    if (!same) {
      b[key] = prev;
      a[key] = next;
    }
  }
  return { before: b, after: a, changed: Object.keys(a).length > 0 };
}
