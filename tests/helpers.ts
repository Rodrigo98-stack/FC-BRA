import { eq, sql } from "drizzle-orm";
import type { AuthContext } from "@/server/auth/session";

export async function makeAuth(userId: string): Promise<AuthContext> {
  const { getDb, schema } = await import("@/server/db");
  const { loadPermissions } = await import("@/server/rbac");
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  return {
    user: { id: u.id, fullName: u.fullName, nickname: u.nickname, email: u.email, photoUrl: u.photoUrl, isOwner: u.isOwner, isDemo: u.isDemo, jobTitle: u.jobTitle },
    sessionId: "test",
    perms: await loadPermissions(db, u.id, u.isOwner),
  };
}

export async function createUserWithRole(email: string, roleKey: string | null, brandSlug: string | null) {
  const { write, schema } = await import("@/server/db");
  return write(async (tx) => {
    const [user] = await tx
      .insert(schema.users)
      .values({ fullName: email.split("@")[0], email, status: "ativo", passwordHash: "x" })
      .returning();
    if (roleKey) {
      const [role] = await tx.select().from(schema.roles).where(eq(schema.roles.key, roleKey));
      const brand = brandSlug ? (await tx.select().from(schema.brands).where(eq(schema.brands.slug, brandSlug)))[0] : null;
      await tx.insert(schema.userRoles).values({ userId: user.id, roleId: role.id, brandId: brand?.id ?? null });
    }
    return user;
  });
}

export async function brandId(slug: string) {
  const { getDb, rowsOf } = await import("@/server/db");
  const db = await getDb();
  return rowsOf<{ id: string }>(await db.execute(sql`select id from brands where slug = ${slug}`))[0].id;
}

export async function roleId(key: string) {
  const { getDb, rowsOf } = await import("@/server/db");
  const db = await getDb();
  return rowsOf<{ id: string }>(await db.execute(sql`select id from roles where key = ${key}`))[0].id;
}
