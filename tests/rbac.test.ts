import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { freshDb } from "./setup-db";
import { brandId, createUserWithRole, makeAuth, roleId } from "./helpers";

describe("RBAC e usuários (§35)", () => {
  let ownerId: string;

  beforeAll(async () => {
    await freshDb(false);
    const { createOwner } = await import("@/server/services/users");
    const owner = await createOwner({ fullName: "Dona Principal", email: "dona@teste.local", password: "SenhaForte123" });
    ownerId = owner.id;
  }, 180_000);

  it("escopo por marca: ESTOQUE só na BRAVUS", async () => {
    const { can, brandScope } = await import("@/server/rbac");
    const u = await createUserWithRole("estoque@teste.local", "ESTOQUE", "bravus");
    const auth = await makeAuth(u.id);
    const bravus = await brandId("bravus");
    const fina = await brandId("fina-classica");
    expect(can(auth.perms, "estoque", "editar", bravus)).toBe(true);
    expect(can(auth.perms, "estoque", "editar", fina)).toBe(false);
    expect(can(auth.perms, "financeiro", "visualizar")).toBe(false);
    expect(can(auth.perms, "produtos", "visualizar", bravus)).toBe(true);
    expect(can(auth.perms, "produtos", "editar", bravus)).toBe(false);
    expect(brandScope(auth.perms, "estoque")).toEqual([bravus]);
  });

  it("has_permission() no banco concorda com o RBAC da aplicação", async () => {
    const { getDb, rowsOf } = await import("@/server/db");
    const { can } = await import("@/server/rbac");
    const u = await createUserWithRole("vend@teste.local", "VENDEDOR", "fina-classica");
    const auth = await makeAuth(u.id);
    const fina = await brandId("fina-classica");
    const bravus = await brandId("bravus");
    const db = await getDb();
    for (const [m, a, b] of [
      ["pedidos", "criar", fina],
      ["pedidos", "criar", bravus],
      ["pedidos", "excluir", fina],
      ["produtos", "visualizar", fina],
      ["financeiro", "visualizar", fina],
    ] as const) {
      const dbResult = rowsOf<{ ok: boolean }>(await db.execute(sql`select public.has_permission(${u.id}::uuid, ${m}, ${a}, ${b}::uuid) as ok`))[0].ok;
      expect(dbResult).toBe(can(auth.perms, m, a, b));
    }
  });

  it("ninguém concede permissão que não possui (escalonamento bloqueado)", async () => {
    const { setUserRoles } = await import("@/server/services/users");
    const manager = await createUserWithRole("gerente@teste.local", "GERENTE", null);
    const target = await createUserWithRole("alvo@teste.local", "VENDEDOR", null);
    const auth = await makeAuth(manager.id);
    await expect(setUserRoles(auth, target.id, [{ roleId: await roleId("SOCIO"), brandId: null }], "teste")).rejects.toThrow(/não pode atribuir/);
    await expect(setUserRoles(auth, manager.id, [{ roleId: await roleId("SOCIO"), brandId: null }], "teste")).rejects.toThrow(/próprios papéis/);
  });

  it("ADMINISTRADOR_PRINCIPAL é protegido", async () => {
    const { deleteUser, revokeUserAccess, setUserRoles, setUserStatus } = await import("@/server/services/users");
    const partner = await createUserWithRole("socio@teste.local", "SOCIO", null);
    const auth = await makeAuth(partner.id);
    await expect(deleteUser(auth, ownerId, "teste")).rejects.toThrow(/ADMINISTRADOR_PRINCIPAL/);
    await expect(revokeUserAccess(auth, ownerId, "teste")).rejects.toThrow(/ADMINISTRADOR_PRINCIPAL/);
    await expect(setUserStatus(auth, ownerId, "suspenso", "teste")).rejects.toThrow(/ADMINISTRADOR_PRINCIPAL/);
    await expect(setUserRoles(auth, ownerId, [], "teste")).rejects.toThrow(/ADMINISTRADOR_PRINCIPAL/);
  });

  it("revogar acesso invalida as sessões na hora e gera auditoria", async () => {
    const { write, getDb, rowsOf, schema } = await import("@/server/db");
    const { revokeUserAccess } = await import("@/server/services/users");
    const u = await createUserWithRole("revogar@teste.local", "VENDEDOR", null);
    await write(async (tx) => {
      await tx.insert(schema.sessions).values({ userId: u.id, tokenHash: "hash-revogar", expiresAt: new Date(Date.now() + 3600_000) });
    });
    await revokeUserAccess(await makeAuth(ownerId), u.id, "desligamento");
    const db = await getDb();
    const s = rowsOf<{ revoked: boolean; status: string; logs: number }>(
      await db.execute(sql`select (select revoked_at is not null from sessions where token_hash = 'hash-revogar') as revoked,
        (select status from users where id = ${u.id}) as status,
        (select count(*)::int from audit_logs where entity_id = ${u.id} and action = 'usuario.revogar_acesso' and reason = 'desligamento') as logs`),
    )[0];
    expect(s.revoked).toBe(true);
    expect(s.status).toBe("inativo");
    expect(s.logs).toBe(1);
  });

  it("convite: token único, aceite cria usuário ativo com o papel e escopo", async () => {
    const { inviteUser, acceptInvitation, getInvitationByToken } = await import("@/server/services/users");
    const bravus = await brandId("bravus");
    const res = await inviteUser(await makeAuth(ownerId), { email: "novo@teste.local", fullName: "Novo", jobTitle: "Vendedor", roleId: await roleId("VENDEDOR"), brandId: bravus });
    expect(res.emailSent).toBe(false);
    const token = res.link.split("/").pop()!;
    expect((await getInvitationByToken(token))?.status).toBe("pendente");
    const user = await acceptInvitation(token, { fullName: "Novo Vendedor", password: "OutraSenha123" });
    const auth = await makeAuth(user.id);
    const { can } = await import("@/server/rbac");
    expect(can(auth.perms, "pedidos", "criar", bravus)).toBe(true);
    expect(can(auth.perms, "pedidos", "criar", await brandId("fina-classica"))).toBe(false);
    await expect(acceptInvitation(token, { fullName: "x", password: "OutraSenha123" })).rejects.toThrow(/Convite inválido/);
  });

  it("senha fraca é recusada e senha é guardada como hash scrypt", async () => {
    const { hashPassword, verifyPassword, passwordProblem } = await import("@/server/auth/crypto");
    expect(passwordProblem("curta1")).toMatch(/10 caracteres/);
    expect(passwordProblem("somenteletrasaqui")).toMatch(/letras e números/);
    const h = await hashPassword("SenhaForte123");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("SenhaForte123", h)).toBe(true);
    expect(await verifyPassword("errada", h)).toBe(false);
  });
});
