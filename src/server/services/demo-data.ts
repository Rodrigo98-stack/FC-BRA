/** "Limpar dados DEMO" (§38): remove tudo marcado is_demo, na ordem certa das FKs. */
import { sql } from "drizzle-orm";
import { rowsOf, schema, write } from "../db";
import { audit } from "../audit";
import type { AuthContext } from "../auth/session";

export async function countDemoData() {
  const { getDb } = await import("../db");
  const db = await getDb();
  const r = rowsOf<Record<string, number>>(
    await db.execute(sql`select
      (select count(*) from public.products where is_demo)::int as produtos,
      (select count(*) from public.orders where is_demo)::int as pedidos,
      (select count(*) from public.customers where is_demo)::int as clientes,
      (select count(*) from public.users where is_demo)::int as usuarios,
      (select count(*) from public.suppliers where is_demo)::int as fornecedores,
      (select count(*) from public.financial_expenses where is_demo)::int + (select count(*) from public.financial_entries where is_demo)::int as lancamentos,
      (select count(*) from public.analytics_events where is_demo)::int as eventos`),
  )[0];
  return r ?? {};
}

export async function clearDemoData(auth: AuthContext, reason: string) {
  const before = await countDemoData();
  await write(async (tx) => {
    const demoOrders = sql`(select id from public.orders where is_demo)`;
    const demoProducts = sql`(select id from public.products where is_demo)`;
    await tx.execute(sql`delete from public.analytics_events where is_demo or product_id in ${demoProducts} or order_id in ${demoOrders}`);
    await tx.execute(sql`delete from public.whatsapp_messages_log where is_demo or order_id in ${demoOrders}`);
    await tx.execute(sql`delete from public.financial_entries where is_demo or order_id in ${demoOrders}`);
    await tx.execute(sql`delete from public.financial_expenses where is_demo`);
    await tx.execute(sql`delete from public.inventory_movements where is_demo or product_id in ${demoProducts} or order_id in ${demoOrders}`);
    await tx.execute(sql`delete from public.orders where is_demo`);
    await tx.execute(sql`delete from public.banners where is_demo`);
    await tx.execute(sql`delete from public.ideas where is_demo`);
    await tx.execute(sql`delete from public.planned_products where is_demo`);
    await tx.execute(sql`delete from public.products where is_demo`);
    await tx.execute(sql`delete from public.customers where is_demo`);
    await tx.execute(sql`delete from public.suppliers where is_demo`);
    await tx.execute(sql`delete from public.teams where is_demo`);
    await tx.execute(sql`delete from public.users where is_demo and not is_owner`);
    await tx
      .insert(schema.appSettings)
      .values({ key: "demo", value: { cleared_at: new Date().toISOString(), cleared_by: auth.user.id } })
      .onConflictDoUpdate({ target: schema.appSettings.key, set: { value: { cleared_at: new Date().toISOString(), cleared_by: auth.user.id } } });
    await audit(tx, { id: auth.user.id, fullName: auth.user.fullName, email: auth.user.email }, {
      action: "demo.limpar",
      entity: "demo",
      before,
      after: { removidos: true },
      reason,
    });
  });
  return before;
}
