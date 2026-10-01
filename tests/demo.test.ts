import { beforeAll, describe, expect, it } from "vitest";
import { freshDb } from "./setup-db";
import { makeAuth } from "./helpers";

describe("dados DEMO (§38)", () => {
  let ownerId: string;
  beforeAll(async () => {
    await freshDb(true);
    const { createOwner } = await import("@/server/services/users");
    ownerId = (await createOwner({ fullName: "Dona", email: "dona2@teste.local", password: "SenhaForte123" })).id;
  }, 180_000);

  it("todo registro fictício está marcado e nomeado como DEMO", async () => {
    const { getDb, rowsOf } = await import("@/server/db");
    const { sql } = await import("drizzle-orm");
    const db = await getDb();
    const r = rowsOf<Record<string, number>>(
      await db.execute(sql`select
        (select count(*) from products where not is_demo or name not like 'PRODUTO DEMO%')::int as p,
        (select count(*) from customers where not is_demo or name not like 'CLIENTE DEMO%')::int as c,
        (select count(*) from users where not is_owner and (not is_demo or full_name not like 'USUÁRIO DEMO%'))::int as u,
        (select count(*) from orders where not is_demo)::int as o`),
    )[0];
    expect(r).toEqual({ p: 0, c: 0, u: 0, o: 0 });
  });

  it("limpar dados DEMO remove tudo e preserva o administrador", async () => {
    const { clearDemoData, countDemoData } = await import("@/server/services/demo-data");
    await clearDemoData(await makeAuth(ownerId), "teste");
    const after = await countDemoData();
    expect(Object.values(after).every((n) => Number(n) === 0)).toBe(true);
    const { getDb, rowsOf } = await import("@/server/db");
    const { sql } = await import("drizzle-orm");
    const db = await getDb();
    const r = rowsOf<{ owners: number; stock: number; brands: number; cats: number }>(
      await db.execute(sql`select (select count(*) from users where is_owner)::int as owners,
        (select count(*) from inventory)::int as stock, (select count(*) from brands)::int as brands,
        (select count(*) from categories)::int as cats`),
    )[0];
    expect(r).toEqual({ owners: 1, stock: 0, brands: 2, cats: 19 });
  });
});
