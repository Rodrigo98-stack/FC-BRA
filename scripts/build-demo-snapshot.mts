// Gera, no build, o snapshot inicial do banco de demonstração (migrations +
// dados DEMO). No primeiro acesso em produção o servidor carrega este arquivo
// em ~1 s em vez de criar e popular o banco (~8 s), evitando timeout no Netlify.
// Não contém usuários com senha nem segredos.
import fs from "node:fs/promises";
import path from "node:path";

process.env.DEMO_DB_PERSIST = "memory";
delete process.env.DATABASE_URL;

const root = path.resolve(import.meta.dirname, "..");
const outDir = path.join(root, ".demo-snapshot");
const t0 = Date.now();
const { PGlite } = await import("@electric-sql/pglite");
const { drizzle } = await import("drizzle-orm/pglite");
const schema = await import("../src/server/db/schema.ts");
const { applyMigrations } = await import("../src/server/db/migrator.ts");
const { runInTx } = await import("../src/server/db/index.ts");
const { seedDemoData } = await import("../src/server/db/demo-seed.ts");

const pg = new PGlite();
await pg.waitReady;
await applyMigrations({
  query: async (text) => ((await pg.exec(text)).at(-1)?.rows ?? []) as Record<string, unknown>[],
  transaction: async (fn) => {
    await pg.transaction(async (tx) => {
      await fn({ query: async (text) => ((await tx.exec(text)).at(-1)?.rows ?? []) as Record<string, unknown>[] });
    });
  },
});
const db = drizzle(pg, { schema });
const res = await db.transaction((tx) => runInTx(tx as never, () => seedDemoData(tx as never)));
const blob = await pg.dumpDataDir("gzip");
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, "pglite.tar.gz"), Buffer.from(await blob.arrayBuffer()));
await fs.writeFile(path.join(outDir, "info.json"), JSON.stringify({ createdAt: new Date().toISOString(), orders: res.orders }));
await pg.close();
console.log(`[demo-snapshot] gerado em ${Date.now() - t0} ms (${(blob.size / 1024 / 1024).toFixed(1)} MB, ${res.orders} pedidos DEMO)`);
process.exit(0);
