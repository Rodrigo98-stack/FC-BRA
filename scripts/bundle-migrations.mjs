// Empacota supabase/migrations/*.sql em um módulo TS para que o servidor
// (inclusive em funções serverless) aplique as migrations sem depender do
// sistema de arquivos em tempo de execução. Rodado automaticamente antes de
// dev/build/test.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dir = path.join(root, "supabase", "migrations");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const entries = files.map((name) => ({ name, sql: fs.readFileSync(path.join(dir, name), "utf8") }));

const out =
  "// ARQUIVO GERADO por scripts/bundle-migrations.mjs — não edite manualmente.\n" +
  "export const MIGRATIONS: { name: string; sql: string }[] = " +
  JSON.stringify(entries, null, 2) +
  ";\n";

fs.writeFileSync(path.join(root, "src", "server", "db", "migrations.generated.ts"), out);
console.log(`[migrations] ${files.length} arquivo(s) empacotado(s)`);
