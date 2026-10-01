// Aplica as migrations pendentes no banco de DATABASE_URL (Supabase).
//   DATABASE_URL=postgres://... npm run db:migrate
import { applyMigrations } from "../src/server/db/migrator";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Defina DATABASE_URL (connection string do Supabase).");
  const { default: postgres } = await import("postgres");
  const client = postgres(url, { prepare: false, max: 1 });
  const applied = await applyMigrations(
    {
      query: async (text) => (await client.unsafe(text)) as unknown as Record<string, unknown>[],
      transaction: async (fn) => {
        await client.begin(async (tx) => {
          await fn({ query: async (text) => (await tx.unsafe(text)) as unknown as Record<string, unknown>[] });
        });
      },
    },
    { lock: true },
  );
  console.log(applied.length ? `Migrations aplicadas: ${applied.join(", ")}` : "Banco já está atualizado.");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
