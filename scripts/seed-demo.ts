// Popula um banco (vazio) com dados DEMO, marcados is_demo = true.
//   DATABASE_URL=postgres://... npm run db:seed-demo -- --sim
// Os dados podem ser removidos depois em Configurações › Limpar dados DEMO.
import { sql } from "drizzle-orm";

async function main() {
  if (!process.argv.includes("--sim")) {
    console.log("Isto cria produtos, pedidos e clientes DEMO no banco configurado. Rode novamente com --sim para confirmar.");
    return;
  }
  const { getDb, rowsOf, write } = await import("../src/server/db");
  const { seedDemoData } = await import("../src/server/db/demo-seed");
  const db = await getDb();
  const [{ n }] = rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int as n from public.products where is_demo`));
  if (Number(n) > 0) {
    console.log("Já existem dados DEMO neste banco. Nada foi feito.");
    return;
  }
  const res = await write((tx) => seedDemoData(tx));
  console.log(`Dados DEMO criados (${res.orders} pedidos).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
