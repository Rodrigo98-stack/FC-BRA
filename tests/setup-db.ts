/** Banco de teste: PGlite em memória com migrations (+ seed DEMO opcional). */
process.env.DEMO_DB_PERSIST = "memory";
delete process.env.DATABASE_URL;

export async function freshDb(seed = false) {
  process.env.DEMO_SEED = seed ? "true" : "false";
  const g = globalThis as unknown as { __fcbraDb?: unknown };
  g.__fcbraDb = undefined;
  const { getDbHandle } = await import("@/server/db");
  return getDbHandle();
}
