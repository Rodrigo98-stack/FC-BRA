/**
 * Acesso ao banco.
 *
 * - Produção: PostgreSQL (Supabase) via DATABASE_URL.
 * - Modo demonstração (sem DATABASE_URL): PostgreSQL embutido (PGlite) com o
 *   MESMO esquema e as mesmas regras, persistido em Netlify Blobs (no Netlify)
 *   ou em .data/ (local). Serve para ver o sistema funcionando antes de
 *   conectar o Supabase — não é para operação real.
 *
 * Toda escrita passa por `write()`: uma transação única (§37) e, no modo
 * demonstração, a gravação do snapshot do banco ao final. Chamadas aninhadas
 * de `write()` reaproveitam a transação externa.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { applyMigrations, type SqlRunner } from "./migrator";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type Executor = Db | Tx;

export type DbMode = "postgres" | "demo";

export function dbMode(): DbMode {
  return process.env.DATABASE_URL ? "postgres" : "demo";
}

export type WriteOptions = {
  /**
   * Modo demo: false = não grava o snapshot agora (eventos de analytics,
   * rate limit). Os dados entram no próximo snapshot. Sem efeito em produção.
   */
  persist?: boolean;
};

type DbHandle = {
  readonly db: Db;
  mode: DbMode;
  store?: string;
  refresh: () => Promise<void>;
  runWrite: <T>(fn: (db: Db) => Promise<T>, opts?: WriteOptions) => Promise<T>;
};

const globalForDb = globalThis as unknown as { __fcbraDb?: Promise<DbHandle> };
const txContext = new AsyncLocalStorage<Tx>();

async function createPostgresHandle(): Promise<DbHandle> {
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const client = postgres(process.env.DATABASE_URL!, {
    // Compatível com o pooler do Supabase (modo transação).
    prepare: false,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idle_timeout: 20,
    connect_timeout: 15,
  });
  if (process.env.AUTO_MIGRATE !== "false") {
    const runner: SqlRunner = {
      query: async (text) => (await client.unsafe(text)) as unknown as Record<string, unknown>[],
      transaction: async (fn) => {
        await client.begin(async (tx) => {
          await fn({ query: async (text) => (await tx.unsafe(text)) as unknown as Record<string, unknown>[] });
        });
      },
    };
    await applyMigrations(runner, { lock: true });
  }
  const db = drizzle(client, { schema }) as unknown as Db;
  return { db, mode: "postgres", refresh: async () => {}, runWrite: (fn) => fn(db) };
}

export async function getDbHandle(): Promise<DbHandle> {
  if (!globalForDb.__fcbraDb) {
    const p: Promise<DbHandle> =
      dbMode() === "postgres" ? createPostgresHandle() : import("./demo").then((m) => m.createDemoHandle());
    globalForDb.__fcbraDb = p;
    p.catch((err) => {
      console.error("[db] falha ao inicializar o banco:", err);
      globalForDb.__fcbraDb = undefined;
    });
  }
  return globalForDb.__fcbraDb;
}

/** Banco para leituras (dentro de write(), devolve a transação corrente). */
export async function getDb(): Promise<Executor> {
  const current = txContext.getStore();
  if (current) return current;
  const handle = await getDbHandle();
  await handle.refresh();
  return handle.db;
}

/** Há uma transação corrente (dentro de write()/seed)? */
export function inTransaction(): boolean {
  return !!txContext.getStore();
}

/** Executa `fn` tratando `tx` como a transação corrente (usado no boot/seed). */
export function runInTx<T>(tx: Tx, fn: () => Promise<T>): Promise<T> {
  return txContext.run(tx, fn);
}

/** Executa escritas numa transação única e persiste (modo demo). */
export async function write<T>(fn: (tx: Tx) => Promise<T>, opts: WriteOptions = {}): Promise<T> {
  const current = txContext.getStore();
  if (current) return fn(current);
  const handle = await getDbHandle();
  return handle.runWrite((db) => db.transaction((tx) => txContext.run(tx, () => fn(tx))), opts);
}

export { schema };

/** Linhas de um `execute(sql\`...\`)` (formato difere entre drivers). */
export function rowsOf<T = Record<string, unknown>>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  return ((res as { rows?: T[] })?.rows ?? []) as T[];
}
