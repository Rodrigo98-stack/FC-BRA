import { MIGRATIONS } from "./migrations.generated";

type Rows = Record<string, unknown>[];
export type SqlRunner = {
  query: (text: string) => Promise<Rows>;
  transaction: (fn: (tx: { query: (text: string) => Promise<Rows> }) => Promise<void>) => Promise<void>;
};

const quote = (v: string) => `'${v.replace(/'/g, "''")}'`;

/**
 * Aplica as migrations pendentes em ordem, numa única transação.
 * Se o projeto já foi migrado pela CLI do Supabase (`supabase db push`),
 * reconhece as versões registradas em supabase_migrations.schema_migrations.
 */
export async function applyMigrations(runner: SqlRunner, opts: { lock?: boolean } = {}) {
  const applied: string[] = [];
  await runner.transaction(async (tx) => {
    if (opts.lock) await tx.query("select pg_advisory_xact_lock(4207262)");
    await tx.query(
      "create table if not exists public._migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    await tx.query("alter table public._migrations enable row level security");
    const done = new Set((await tx.query("select name from public._migrations")).map((r) => String(r.name)));

    const cli = await tx.query("select to_regclass('supabase_migrations.schema_migrations') as t");
    let cliVersions = new Set<string>();
    if (cli[0]?.t) {
      const rows = await tx.query("select version from supabase_migrations.schema_migrations");
      cliVersions = new Set(rows.map((r) => String(r.version)));
    }

    for (const m of MIGRATIONS) {
      if (done.has(m.name)) continue;
      const version = m.name.split("_")[0];
      if (!cliVersions.has(version)) {
        await tx.query(m.sql);
        applied.push(m.name);
      }
      await tx.query(`insert into public._migrations (name) values (${quote(m.name)})`);
    }
  });
  return applied;
}
