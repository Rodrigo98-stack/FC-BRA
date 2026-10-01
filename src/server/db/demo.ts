/**
 * Banco do MODO DEMONSTRAÇÃO: PostgreSQL embutido (PGlite / WebAssembly).
 *
 * Mesmo esquema, mesmas migrations e mesmas regras do banco de produção.
 * O estado é gravado como snapshot compactado:
 *   - no Netlify: Netlify Blobs (store "fc-bra-demo")
 *   - localmente: .data/demo-db.tar.gz
 * Não substitui um banco de produção (sem backup, sem concorrência real
 * entre instâncias). Para operar de verdade, configure DATABASE_URL.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import fs from "node:fs/promises";
import path from "node:path";
import * as schema from "./schema";
import { applyMigrations, type SqlRunner } from "./migrator";
import type { Db } from "./index";

const SNAPSHOT_KEY = "pglite-snapshot.tar.gz";
const REFRESH_INTERVAL_MS = 3000;

type Snapshot = { data: Blob; version: string };
type SnapshotStore = {
  kind: "netlify-blobs" | "file" | "memory";
  load: () => Promise<Snapshot | null>;
  version: () => Promise<string | null>;
  save: (data: Blob, version: string) => Promise<void>;
};

const newVersion = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

async function netlifyStore(): Promise<SnapshotStore | null> {
  if (process.env.NODE_ENV !== "production" && !process.env.NETLIFY_BLOBS_CONTEXT) return null;
  try {
    const { getStore } = await import("@netlify/blobs");
    const store = getStore({ name: "fc-bra-demo", consistency: "strong" });
    await store.getMetadata(SNAPSHOT_KEY); // valida o acesso
    return {
      kind: "netlify-blobs",
      load: async () => {
        const res = await store.getWithMetadata(SNAPSHOT_KEY, { type: "arrayBuffer" });
        if (!res) return null;
        return { data: new Blob([res.data]), version: String(res.metadata?.version ?? "") };
      },
      version: async () => {
        const meta = await store.getMetadata(SNAPSHOT_KEY);
        return meta ? String(meta.metadata?.version ?? "") : null;
      },
      save: async (data, version) => {
        await store.set(SNAPSHOT_KEY, await data.arrayBuffer(), { metadata: { version } });
      },
    };
  } catch (err) {
    console.warn("[demo-db] Netlify Blobs indisponível:", (err as Error).message);
    return null;
  }
}

function fileStore(): SnapshotStore {
  const dir = path.join(process.cwd(), ".data");
  const file = path.join(dir, "demo-db.tar.gz");
  const versionFile = path.join(dir, "demo-db.version");
  return {
    kind: "file",
    load: async () => {
      try {
        const [buf, version] = await Promise.all([fs.readFile(file), fs.readFile(versionFile, "utf8")]);
        return { data: new Blob([new Uint8Array(buf)]), version };
      } catch {
        return null;
      }
    },
    version: async () => fs.readFile(versionFile, "utf8").catch(() => null),
    save: async (data, version) => {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(file, Buffer.from(await data.arrayBuffer()));
      await fs.writeFile(versionFile, version);
    },
  };
}

function memoryStore(): SnapshotStore {
  return { kind: "memory", load: async () => null, version: async () => null, save: async () => {} };
}

async function pickStore(): Promise<SnapshotStore> {
  if (process.env.DEMO_DB_PERSIST === "memory") return memoryStore();
  const nl = await netlifyStore();
  if (nl) return nl;
  try {
    await fs.mkdir(path.join(process.cwd(), ".data"), { recursive: true });
    return fileStore();
  } catch {
    return memoryStore();
  }
}

function runnerFor(pg: PGlite): SqlRunner {
  return {
    query: async (text) => {
      const results = await pg.exec(text);
      return (results.at(-1)?.rows ?? []) as Record<string, unknown>[];
    },
    transaction: async (fn) => {
      await pg.transaction(async (tx) => {
        await fn({
          query: async (text) => {
            const results = await tx.exec(text);
            return (results.at(-1)?.rows ?? []) as Record<string, unknown>[];
          },
        });
      });
    },
  };
}

/** Mutex simples: evita trocar de snapshot no meio de uma escrita. */
function createLock() {
  let tail = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const run = tail.then(fn, fn);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

async function boot(store: SnapshotStore): Promise<{ pg: PGlite; version: string | null; fresh: boolean }> {
  const snap = await store.load().catch(() => null);
  if (snap) {
    try {
      const pg = new PGlite({ loadDataDir: snap.data });
      await pg.waitReady;
      const applied = await applyMigrations(runnerFor(pg));
      return { pg, version: applied.length ? null : snap.version, fresh: false };
    } catch (err) {
      console.error("[demo-db] snapshot inválido, recriando banco:", (err as Error).message);
    }
  }
  // Snapshot inicial gerado no build (migrations + DEMO): carrega em ~1 s.
  const bundled = await loadBundledSnapshot();
  if (bundled && process.env.DEMO_SEED !== "false") {
    try {
      const pg = new PGlite({ loadDataDir: bundled });
      await pg.waitReady;
      await applyMigrations(runnerFor(pg));
      return { pg, version: null, fresh: false };
    } catch (err) {
      console.error("[demo-db] snapshot do build inválido:", (err as Error).message);
    }
  }
  const pg = new PGlite();
  await pg.waitReady;
  await applyMigrations(runnerFor(pg));
  return { pg, version: null, fresh: true };
}

async function loadBundledSnapshot(): Promise<Blob | null> {
  const candidates = [
    process.env.DEMO_SNAPSHOT_PATH,
    path.join(process.cwd(), ".demo-snapshot", "pglite.tar.gz"),
    path.join(process.cwd(), "..", ".demo-snapshot", "pglite.tar.gz"),
  ].filter(Boolean) as string[];
  for (const file of candidates) {
    try {
      const buf = await fs.readFile(file);
      return new Blob([new Uint8Array(buf)]);
    } catch {
      /* tenta o próximo */
    }
  }
  return null;
}

export async function createDemoHandle() {
  const store = await pickStore();
  const lock = createLock();

  let { pg, version, fresh } = await boot(store);
  let db = drizzle(pg, { schema }) as unknown as Db;
  let lastCheck = Date.now();

  const persist = async () => {
    const data = await pg.dumpDataDir("gzip");
    version = newVersion();
    await store.save(data, version);
  };

  if (fresh && process.env.DEMO_SEED !== "false") {
    const { seedDemoData } = await import("./demo-seed");
    const { runInTx } = await import("./index");
    await db.transaction((tx) => runInTx(tx, () => seedDemoData(tx)));
  }
  if (version === null) await persist();

  let writing = 0;
  let refreshing: Promise<void> | null = null;

  const doRefresh = async (force = false) => {
    if (store.kind !== "netlify-blobs") return;
    if (!force && Date.now() - lastCheck < REFRESH_INTERVAL_MS) return;
    if (refreshing) return refreshing;
    refreshing = (async () => {
      lastCheck = Date.now();
      const remote = await store.version().catch(() => null);
      if (!remote || remote === version) return;
      const snap = await store.load();
      if (!snap) return;
      const next = new PGlite({ loadDataDir: snap.data });
      await next.waitReady;
      const old = pg;
      pg = next;
      db = drizzle(pg, { schema }) as unknown as Db;
      version = snap.version;
      // Consultas em andamento ainda podem usar a instância antiga.
      setTimeout(() => void old.close().catch(() => {}), 60_000).unref?.();
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  };

  return {
    mode: "demo" as const,
    store: store.kind,
    get db() {
      return db;
    },
    refresh: async () => {
      if (writing > 0) return;
      await doRefresh();
    },
    runWrite: <T>(fn: (db: Db) => Promise<T>, opts: { persist?: boolean } = {}) =>
      lock(async () => {
        writing++;
        try {
          await doRefresh(true);
          const result = await fn(db);
          if (opts.persist !== false) await persist();
          return result;
        } finally {
          writing--;
        }
      }),
  };
}
