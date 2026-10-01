/**
 * Usuários, funcionários e sócios (§35): convites, papéis, permissões
 * customizadas, status, revogação, exclusão (soft delete + anonimização
 * parcial — LGPD) e redefinição de senha.
 *
 * Regras de proteção (§35.8):
 *   - O ADMINISTRADOR_PRINCIPAL não pode ser excluído, rebaixado, suspenso
 *     ou ter permissões alteradas por ninguém (inclusive SÓCIOS).
 *   - Ninguém concede permissão que não possui.
 *   - Ninguém altera os próprios papéis/permissões.
 *   - Toda alteração gera audit_log; ações sensíveis exigem motivo.
 *   - Revogar/suspender/excluir invalida as sessões imediatamente.
 */
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, rowsOf, schema, write, type Tx } from "../db";
import { AppError, forbidden, notFound } from "../errors";
import { audit } from "../audit";
import { canGrant, type PermissionSet } from "../rbac";
import { hashPassword, passwordProblem, protectCpf, randomToken, sha256 } from "../auth/crypto";
import type { AuthContext } from "../auth/session";
import { getAppSecret } from "../secret";
import { isEmailConfigured, sendEmail } from "../email";
import { getOrigin } from "../request";
import { OWNER_ROLE_KEY } from "@/lib/domain";

const { users, roles, userRoles, userPermissions, permissions, rolePermissions, invitations, passwordResets, sessions } =
  schema;

export type RoleAssignment = { roleId: string; brandId: string | null };

function actorOf(auth: AuthContext) {
  return { id: auth.user.id, fullName: auth.user.fullName, email: auth.user.email };
}

async function getUserOrThrow(tx: Tx, id: string) {
  const [u] = await tx.select().from(users).where(and(eq(users.id, id), isNull(users.deletedAt)));
  if (!u) throw notFound("Usuário não encontrado.");
  return u;
}

function protectOwner(target: { isOwner: boolean }, what = "alterar") {
  if (target.isOwner) throw new AppError(`Não é possível ${what} o ADMINISTRADOR_PRINCIPAL.`, "forbidden");
}

async function revokeSessionsTx(tx: Tx, userId: string) {
  await tx
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

/** Verifica se o ator pode conceder TODAS as permissões do papel no escopo. */
async function assertCanGrantRole(tx: Tx, perms: PermissionSet, assignment: RoleAssignment) {
  const [role] = await tx.select().from(roles).where(and(eq(roles.id, assignment.roleId), isNull(roles.deletedAt)));
  if (!role) throw notFound("Papel não encontrado.");
  if (role.key === OWNER_ROLE_KEY) throw new AppError("O papel ADMINISTRADOR_PRINCIPAL não pode ser atribuído.", "forbidden");
  if (!role.isActive) throw new AppError(`O papel "${role.name}" está desativado.`);
  if (perms.isOwner) return role;
  const granted = await tx
    .select({ module: permissions.module, action: permissions.action })
    .from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(rolePermissions.roleId, role.id));
  const missing = granted.find((g) => !canGrant(perms, g.module, g.action, assignment.brandId));
  if (missing) {
    throw forbidden(`Você não pode atribuir o papel "${role.name}" neste escopo: ele inclui permissões que você não possui.`);
  }
  return role;
}

// ---------------------------------------------------------------------------
// Convites (§35.6)
// ---------------------------------------------------------------------------
export async function inviteUser(
  auth: AuthContext,
  input: { email: string; fullName?: string | null; jobTitle?: string | null; roleId: string; brandId: string | null },
) {
  const db = await getDb();
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(sql`lower(${users.email}) = ${input.email.toLowerCase()}`, isNull(users.deletedAt)));
  if (existing) throw new AppError("Já existe um usuário com este e-mail.", "conflict");

  const token = randomToken();
  const [settings] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, "general"));
  const hours = Number((settings?.value as { invite_expiration_hours?: number })?.invite_expiration_hours ?? 72);
  const expiresAt = new Date(Date.now() + hours * 3600 * 1000);

  const invitation = await write(async (tx) => {
    await assertCanGrantRole(tx, auth.perms, { roleId: input.roleId, brandId: input.brandId });
    // Convites pendentes anteriores para o mesmo e-mail são revogados.
    await tx
      .update(invitations)
      .set({ status: "revogado" })
      .where(and(sql`lower(${invitations.email}) = ${input.email.toLowerCase()}`, eq(invitations.status, "pendente")));
    const [inv] = await tx
      .insert(invitations)
      .values({
        email: input.email.toLowerCase(),
        fullName: input.fullName ?? null,
        jobTitle: input.jobTitle ?? null,
        roleId: input.roleId,
        brandId: input.brandId,
        tokenHash: sha256(token),
        expiresAt,
        invitedBy: auth.user.id,
      })
      .returning();
    await audit(tx, actorOf(auth), {
      action: "usuario.convidar",
      entity: "invitations",
      entityId: inv.id,
      brandId: input.brandId,
      after: { email: inv.email, papel: input.roleId, marca: input.brandId ?? "todas" },
    });
    return inv;
  });

  const link = `${await getOrigin()}/admin/convite/${token}`;
  let emailSent = false;
  if (isEmailConfigured()) {
    const res = await sendEmail(
      input.email,
      "Convite para o painel FINA CLÁSSICA + BRAVUS",
      `Olá${input.fullName ? `, ${input.fullName}` : ""}!\n\n${auth.user.fullName} convidou você para acessar o painel administrativo.\n\nAceite o convite e defina sua senha: ${link}\n\nO link expira em ${hours} horas.`,
    );
    emailSent = res.sent;
  }
  return { invitation, link, emailSent, expiresAt };
}

export async function getInvitationByToken(token: string) {
  const db = await getDb();
  const [inv] = await db.select().from(invitations).where(eq(invitations.tokenHash, sha256(token)));
  if (!inv) return null;
  if (inv.status === "pendente" && inv.expiresAt < new Date()) {
    await write(async (tx) => {
      await tx.update(invitations).set({ status: "expirado" }).where(eq(invitations.id, inv.id));
    });
    return { ...inv, status: "expirado" };
  }
  return inv;
}

export async function acceptInvitation(token: string, input: { fullName: string; password: string; phone?: string | null }) {
  const problem = passwordProblem(input.password);
  if (problem) throw new AppError(problem, "app_error", { password: problem });
  const inv = await getInvitationByToken(token);
  if (!inv || inv.status !== "pendente") throw new AppError("Convite inválido, expirado ou já utilizado.");
  const passwordHash = await hashPassword(input.password);
  return write(async (tx) => {
    const [dup] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(sql`lower(${users.email}) = ${inv.email}`, isNull(users.deletedAt)));
    if (dup) throw new AppError("Já existe um usuário com este e-mail.", "conflict");
    const [user] = await tx
      .insert(users)
      .values({
        fullName: input.fullName,
        email: inv.email,
        phone: input.phone ?? null,
        passwordHash,
        status: "ativo",
        jobTitle: inv.jobTitle,
        admissionDate: new Date().toISOString().slice(0, 10),
        createdBy: inv.invitedBy,
      })
      .returning();
    await tx.insert(userRoles).values({ userId: user.id, roleId: inv.roleId, brandId: inv.brandId, createdBy: inv.invitedBy });
    await tx
      .update(invitations)
      .set({ status: "aceito", acceptedAt: new Date(), acceptedUserId: user.id })
      .where(eq(invitations.id, inv.id));
    await audit(tx, { id: user.id, fullName: user.fullName, email: user.email }, {
      action: "usuario.aceitar_convite",
      entity: "users",
      entityId: user.id,
      brandId: inv.brandId,
      after: { email: user.email, convidado_por: inv.invitedBy },
    });
    return user;
  });
}

export async function revokeInvitation(auth: AuthContext, invitationId: string) {
  await write(async (tx) => {
    const [inv] = await tx.select().from(invitations).where(eq(invitations.id, invitationId));
    if (!inv) throw notFound("Convite não encontrado.");
    if (inv.status !== "pendente") throw new AppError("Somente convites pendentes podem ser revogados.");
    await tx.update(invitations).set({ status: "revogado" }).where(eq(invitations.id, inv.id));
    await audit(tx, actorOf(auth), {
      action: "usuario.revogar_convite",
      entity: "invitations",
      entityId: inv.id,
      brandId: inv.brandId,
      before: { status: inv.status },
      after: { status: "revogado", email: inv.email },
    });
  });
}

// ---------------------------------------------------------------------------
// Dados e status do usuário (§35.5, §35.7)
// ---------------------------------------------------------------------------
export type UserProfileInput = {
  fullName: string;
  nickname?: string | null;
  email: string;
  phone?: string | null;
  whatsapp?: string | null;
  photoUrl?: string | null;
  cpf?: string | null;
  birthDate?: string | null;
  admissionDate?: string | null;
  jobTitle?: string | null;
  notes?: string | null;
  mfaRequired?: boolean;
};

export async function updateUserProfile(auth: AuthContext, userId: string, input: UserProfileInput) {
  const pepper = await getAppSecret();
  await write(async (tx) => {
    const target = await getUserOrThrow(tx, userId);
    if (target.isOwner && !auth.user.isOwner) protectOwner(target, "editar os dados do");
    const cpf = input.cpf ? protectCpf(input.cpf, pepper) : null;
    if (input.cpf && !cpf?.cpfHash) throw new AppError("CPF inválido (11 dígitos).", "app_error", { cpf: "CPF inválido." });
    const patch = {
      fullName: input.fullName,
      nickname: input.nickname ?? null,
      email: input.email.toLowerCase(),
      phone: input.phone ?? null,
      whatsapp: input.whatsapp ?? null,
      photoUrl: input.photoUrl ?? null,
      birthDate: input.birthDate ?? null,
      admissionDate: input.admissionDate ?? null,
      jobTitle: input.jobTitle ?? null,
      notes: input.notes ?? null,
      mfaRequired: input.mfaRequired ?? target.mfaRequired,
      ...(cpf?.cpfHash ? cpf : {}),
    };
    await tx.update(users).set(patch).where(eq(users.id, userId));
    const { cpfHash: _a, cpfLastDigits: _b, ...visibleAfter } = patch as Record<string, unknown>;
    await audit(tx, actorOf(auth), {
      action: "usuario.editar",
      entity: "users",
      entityId: userId,
      before: { fullName: target.fullName, email: target.email, jobTitle: target.jobTitle, phone: target.phone },
      after: { ...visibleAfter, cpf: cpf?.cpfHash ? `•••.•••.•••-${cpf.cpfLastDigits}` : undefined },
    });
  });
}

export async function setUserStatus(
  auth: AuthContext,
  userId: string,
  status: "ativo" | "inativo" | "suspenso",
  reason: string,
  suspendedUntil?: Date | null,
) {
  if (userId === auth.user.id) throw new AppError("Você não pode alterar o seu próprio status.");
  await write(async (tx) => {
    const target = await getUserOrThrow(tx, userId);
    protectOwner(target, status === "ativo" ? "alterar" : "desativar ou suspender");
    if (status === "ativo" && !target.passwordHash) {
      throw new AppError("Este usuário ainda não definiu senha. Gere um link de redefinição de senha.");
    }
    await tx
      .update(users)
      .set({ status, suspendedUntil: status === "suspenso" ? (suspendedUntil ?? null) : null })
      .where(eq(users.id, userId));
    if (status !== "ativo") await revokeSessionsTx(tx, userId);
    await audit(tx, actorOf(auth), {
      action: `usuario.status.${status}`,
      entity: "users",
      entityId: userId,
      before: { status: target.status },
      after: { status, ate: suspendedUntil?.toISOString() ?? null },
      reason,
    });
  });
}

/** Revogar acesso: desativa e invalida todas as sessões imediatamente. */
export async function revokeUserAccess(auth: AuthContext, userId: string, reason: string) {
  if (userId === auth.user.id) throw new AppError("Você não pode revogar o seu próprio acesso.");
  await write(async (tx) => {
    const target = await getUserOrThrow(tx, userId);
    protectOwner(target, "revogar o acesso do");
    await tx.update(users).set({ status: "inativo" }).where(eq(users.id, userId));
    await revokeSessionsTx(tx, userId);
    await audit(tx, actorOf(auth), {
      action: "usuario.revogar_acesso",
      entity: "users",
      entityId: userId,
      before: { status: target.status },
      after: { status: "inativo", sessoes: "invalidadas" },
      reason,
    });
  });
}

/** Exclusão: soft delete + anonimização parcial (LGPD). Histórico preservado. */
export async function deleteUser(auth: AuthContext, userId: string, reason: string) {
  if (userId === auth.user.id) throw new AppError("Você não pode excluir a sua própria conta.");
  await write(async (tx) => {
    const target = await getUserOrThrow(tx, userId);
    protectOwner(target, "excluir o");
    const suffix = userId.slice(0, 8);
    await tx
      .update(users)
      .set({
        deletedAt: new Date(),
        status: "inativo",
        fullName: `Usuário removido ${suffix}`,
        nickname: null,
        email: `removido+${suffix}@anonimizado.invalid`,
        phone: null,
        whatsapp: null,
        photoUrl: null,
        cpfHash: null,
        cpfLastDigits: null,
        birthDate: null,
        passwordHash: null,
        notes: null,
      })
      .where(eq(users.id, userId));
    await revokeSessionsTx(tx, userId);
    await tx.delete(teamMembersTable()).where(eq(teamMembersTable().userId, userId));
    await audit(tx, actorOf(auth), {
      action: "usuario.excluir",
      entity: "users",
      entityId: userId,
      before: { fullName: target.fullName, email: target.email, status: target.status },
      after: { anonimizado: true },
      reason,
    });
  });
}

function teamMembersTable() {
  return schema.teamMembers;
}

export async function createPasswordResetLink(auth: AuthContext, userId: string) {
  const token = randomToken();
  const target = await write(async (tx) => {
    const t = await getUserOrThrow(tx, userId);
    if (t.isOwner && !auth.user.isOwner) protectOwner(t, "redefinir a senha do");
    await tx.update(passwordResets).set({ usedAt: new Date() }).where(and(eq(passwordResets.userId, userId), isNull(passwordResets.usedAt)));
    await tx.insert(passwordResets).values({
      userId,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
      createdBy: auth.user.id,
    });
    await audit(tx, actorOf(auth), { action: "usuario.resetar_senha", entity: "users", entityId: userId });
    return t;
  });
  const link = `${await getOrigin()}/admin/redefinir-senha/${token}`;
  let emailSent = false;
  if (isEmailConfigured()) {
    emailSent = (
      await sendEmail(
        target.email,
        "Redefinição de senha — painel FINA CLÁSSICA + BRAVUS",
        `Olá, ${target.fullName}!\n\nUse o link abaixo para definir uma nova senha (válido por 24 horas):\n${link}`,
      )
    ).sent;
  }
  return { link, emailSent };
}

export async function getPasswordReset(token: string) {
  const db = await getDb();
  const [row] = await db
    .select({ id: passwordResets.id, userId: passwordResets.userId, expiresAt: passwordResets.expiresAt, usedAt: passwordResets.usedAt, email: users.email, fullName: users.fullName })
    .from(passwordResets)
    .innerJoin(users, eq(users.id, passwordResets.userId))
    .where(and(eq(passwordResets.tokenHash, sha256(token)), isNull(users.deletedAt)));
  if (!row || row.usedAt || row.expiresAt < new Date()) return null;
  return row;
}

export async function resetPasswordWithToken(token: string, password: string) {
  const problem = passwordProblem(password);
  if (problem) throw new AppError(problem, "app_error", { password: problem });
  const reset = await getPasswordReset(token);
  if (!reset) throw new AppError("Link inválido ou expirado. Peça um novo link ao administrador.");
  const passwordHash = await hashPassword(password);
  await write(async (tx) => {
    await tx.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, reset.id));
    const [u] = await tx.select().from(users).where(eq(users.id, reset.userId));
    await tx
      .update(users)
      .set({ passwordHash, ...(u?.status === "pendente" ? { status: "ativo" } : {}) })
      .where(eq(users.id, reset.userId));
    await revokeSessionsTx(tx, reset.userId);
    await audit(tx, { id: reset.userId, fullName: reset.fullName, email: reset.email }, {
      action: "usuario.senha_redefinida",
      entity: "users",
      entityId: reset.userId,
    });
  });
}

// ---------------------------------------------------------------------------
// Papéis e permissões de um usuário
// ---------------------------------------------------------------------------
export async function setUserRoles(auth: AuthContext, userId: string, assignments: RoleAssignment[], reason: string) {
  if (userId === auth.user.id) throw new AppError("Você não pode alterar os seus próprios papéis.");
  await write(async (tx) => {
    const target = await getUserOrThrow(tx, userId);
    protectOwner(target, "alterar as permissões do");
    const current = await tx.select().from(userRoles).where(eq(userRoles.userId, userId));
    const key = (a: RoleAssignment) => `${a.roleId}|${a.brandId ?? "*"}`;
    const wanted = new Map(assignments.map((a) => [key(a), a]));
    const existing = new Map(current.map((c) => [key({ roleId: c.roleId, brandId: c.brandId }), c]));
    // Remover ou adicionar papéis exige poder conceder o papel (ninguém mexe acima do próprio nível).
    for (const [k, c] of existing) {
      if (!wanted.has(k)) {
        await assertCanGrantRole(tx, auth.perms, { roleId: c.roleId, brandId: c.brandId }).catch((e) => {
          if (e instanceof AppError && e.message.includes("desativado")) return null;
          throw e;
        });
        await tx.delete(userRoles).where(eq(userRoles.id, c.id));
      }
    }
    for (const [k, a] of wanted) {
      if (!existing.has(k)) {
        await assertCanGrantRole(tx, auth.perms, a);
        await tx.insert(userRoles).values({ userId, roleId: a.roleId, brandId: a.brandId, createdBy: auth.user.id });
      }
    }
    await audit(tx, actorOf(auth), {
      action: "usuario.papeis",
      entity: "users",
      entityId: userId,
      before: current.map((c) => ({ papel: c.roleId, marca: c.brandId ?? "todas" })),
      after: assignments.map((a) => ({ papel: a.roleId, marca: a.brandId ?? "todas" })),
      reason,
    });
  });
}

export async function setUserCustomPermissions(
  auth: AuthContext,
  userId: string,
  grants: { permissionId: string; brandId: string | null }[],
  reason: string,
) {
  if (userId === auth.user.id) throw new AppError("Você não pode alterar as suas próprias permissões.");
  await write(async (tx) => {
    const target = await getUserOrThrow(tx, userId);
    protectOwner(target, "alterar as permissões do");
    const all = await tx.select().from(permissions);
    const byId = new Map(all.map((p) => [p.id, p]));
    const current = await tx.select().from(userPermissions).where(eq(userPermissions.userId, userId));
    for (const g of [...grants, ...current.map((c) => ({ permissionId: c.permissionId, brandId: c.brandId }))]) {
      const p = byId.get(g.permissionId);
      if (!p) throw new AppError("Permissão inválida.");
      if (!canGrant(auth.perms, p.module, p.action, g.brandId)) {
        throw forbidden(`Você não pode conceder/remover "${p.module}: ${p.action}" neste escopo.`);
      }
    }
    await tx.delete(userPermissions).where(eq(userPermissions.userId, userId));
    if (grants.length) {
      await tx.insert(userPermissions).values(
        grants.map((g) => ({ userId, permissionId: g.permissionId, brandId: g.brandId, createdBy: auth.user.id })),
      );
    }
    const label = (id: string, b: string | null) => {
      const p = byId.get(id);
      return `${p?.module}:${p?.action}@${b ?? "todas"}`;
    };
    await audit(tx, actorOf(auth), {
      action: "usuario.permissoes_customizadas",
      entity: "users",
      entityId: userId,
      before: current.map((c) => label(c.permissionId, c.brandId)),
      after: grants.map((g) => label(g.permissionId, g.brandId)),
      reason,
    });
  });
}

// ---------------------------------------------------------------------------
// Consultas para as telas Equipe / Permissões (§35.9, §35.10)
// ---------------------------------------------------------------------------
export async function listTeam(filters: {
  roleId?: string | null;
  status?: string | null;
  brandId?: string | null;
  q?: string | null;
  admissionFrom?: string | null;
  admissionTo?: string | null;
}) {
  const db = await getDb();
  const conds = [isNull(users.deletedAt)];
  if (filters.status) conds.push(eq(users.status, filters.status));
  if (filters.q) {
    const term = `%${filters.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    conds.push(sql`(${users.fullName} ilike ${term} or ${users.email} ilike ${term} or coalesce(${users.jobTitle}, '') ilike ${term})`);
  }
  if (filters.admissionFrom) conds.push(sql`${users.admissionDate} >= ${filters.admissionFrom}`);
  if (filters.admissionTo) conds.push(sql`${users.admissionDate} <= ${filters.admissionTo}`);
  if (filters.roleId) {
    conds.push(sql`exists (select 1 from public.user_roles ur where ur.user_id = ${users.id} and ur.role_id = ${filters.roleId})`);
  }
  if (filters.brandId) {
    conds.push(
      sql`(${users.isOwner} or exists (select 1 from public.user_roles ur where ur.user_id = ${users.id} and (ur.brand_id is null or ur.brand_id = ${filters.brandId}))
           or exists (select 1 from public.user_permissions up where up.user_id = ${users.id} and (up.brand_id is null or up.brand_id = ${filters.brandId})))`,
    );
  }
  const list = await db
    .select()
    .from(users)
    .where(and(...conds))
    .orderBy(desc(users.isOwner), asc(users.fullName));
  const ids = list.map((u) => u.id);
  const assignments = ids.length
    ? await db
        .select({ userId: userRoles.userId, roleId: userRoles.roleId, brandId: userRoles.brandId, roleName: roles.name, roleKey: roles.key })
        .from(userRoles)
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(inArray(userRoles.userId, ids))
    : [];
  const customCounts = ids.length
    ? rowsOf<{ user_id: string; n: number }>(
        await db.execute(sql`select user_id, count(*)::int as n from public.user_permissions where user_id in (${sql.join(
          ids.map((id) => sql`${id}::uuid`),
          sql`, `,
        )}) group by user_id`),
      )
    : [];
  return list.map((u) => ({
    ...u,
    passwordHash: undefined,
    cpfHash: undefined,
    hasPassword: !!u.passwordHash,
    roles: assignments.filter((a) => a.userId === u.id),
    customPermissions: Number(customCounts.find((c) => c.user_id === u.id)?.n ?? 0),
  }));
}

export async function listInvitations() {
  const db = await getDb();
  // Expira convites vencidos antes de listar.
  const expired = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(and(eq(invitations.status, "pendente"), sql`${invitations.expiresAt} < now()`));
  if (expired.length) {
    await write(async (tx) => {
      await tx
        .update(invitations)
        .set({ status: "expirado" })
        .where(inArray(invitations.id, expired.map((e) => e.id)));
    });
  }
  return db
    .select({
      id: invitations.id,
      email: invitations.email,
      fullName: invitations.fullName,
      jobTitle: invitations.jobTitle,
      status: invitations.status,
      brandId: invitations.brandId,
      expiresAt: invitations.expiresAt,
      createdAt: invitations.createdAt,
      roleName: roles.name,
      invitedByName: users.fullName,
    })
    .from(invitations)
    .innerJoin(roles, eq(roles.id, invitations.roleId))
    .leftJoin(users, eq(users.id, invitations.invitedBy))
    .orderBy(desc(invitations.createdAt))
    .limit(200);
}

export async function countPendingInvitations() {
  const db = await getDb();
  const res = await db.execute(
    sql`select count(*)::int as n from public.invitations where status = 'pendente' and expires_at > now()`,
  );
  return Number(rowsOf<{ n: number }>(res)[0]?.n ?? 0);
}

export async function getUserDetail(userId: string) {
  const db = await getDb();
  const [u] = await db.select().from(users).where(and(eq(users.id, userId), isNull(users.deletedAt)));
  if (!u) return null;
  const [assignments, custom, activeSessions] = await Promise.all([
    db
      .select({ id: userRoles.id, roleId: userRoles.roleId, brandId: userRoles.brandId, roleName: roles.name, roleKey: roles.key })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(userRoles.userId, userId)),
    db
      .select({ permissionId: userPermissions.permissionId, brandId: userPermissions.brandId, module: permissions.module, action: permissions.action })
      .from(userPermissions)
      .innerJoin(permissions, eq(permissions.id, userPermissions.permissionId))
      .where(eq(userPermissions.userId, userId)),
    db
      .select({ id: sessions.id, createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt, ip: sessions.ip, userAgent: sessions.userAgent })
      .from(sessions)
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), sql`${sessions.expiresAt} > now()`))
      .orderBy(desc(sessions.lastSeenAt)),
  ]);
  const { passwordHash, cpfHash: _c, ...safe } = u;
  return { user: { ...safe, hasPassword: !!passwordHash }, assignments, custom, activeSessions };
}

// ---------------------------------------------------------------------------
// Papéis (§35.10)
// ---------------------------------------------------------------------------
export async function listRolesWithUsage() {
  const db = await getDb();
  const res = await db.execute(sql`
    select r.*,
      (select count(distinct ur.user_id)::int from public.user_roles ur join public.users u on u.id = ur.user_id
        where ur.role_id = r.id and u.deleted_at is null) as users_count,
      (select count(*)::int from public.role_permissions rp where rp.role_id = r.id) as permissions_count
    from public.roles r where r.deleted_at is null
    order by r.is_system desc, r.created_at asc`);
  return rowsOf<{
    id: string;
    key: string;
    name: string;
    description: string | null;
    default_scope: string | null;
    is_system: boolean;
    is_active: boolean;
    users_count: number;
    permissions_count: number;
  }>(res);
}

export async function getRoleDetail(roleId: string) {
  const db = await getDb();
  const [role] = await db.select().from(roles).where(and(eq(roles.id, roleId), isNull(roles.deletedAt)));
  if (!role) return null;
  const [granted, members] = await Promise.all([
    db.select({ permissionId: rolePermissions.permissionId }).from(rolePermissions).where(eq(rolePermissions.roleId, roleId)),
    db
      .select({ id: users.id, fullName: users.fullName, email: users.email, status: users.status, brandId: userRoles.brandId })
      .from(userRoles)
      .innerJoin(users, eq(users.id, userRoles.userId))
      .where(and(eq(userRoles.roleId, roleId), isNull(users.deletedAt))),
  ]);
  return { role, permissionIds: granted.map((g) => g.permissionId), members };
}

export async function listPermissions() {
  const db = await getDb();
  return db.select().from(permissions);
}

function roleKeyFrom(name: string) {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "PAPEL"
  );
}

export async function createRole(
  auth: AuthContext,
  input: { name: string; description?: string | null; permissionIds: string[]; cloneFromId?: string | null },
) {
  return write(async (tx) => {
    let permissionIds = input.permissionIds;
    if (input.cloneFromId) {
      const src = await tx.select().from(rolePermissions).where(eq(rolePermissions.roleId, input.cloneFromId));
      permissionIds = src.map((s) => s.permissionId);
    }
    await assertPermissionsGrantable(tx, auth.perms, permissionIds);
    let key = roleKeyFrom(input.name);
    const clash = await tx.select({ id: roles.id }).from(roles).where(eq(roles.key, key));
    if (clash.length) key = `${key}_${Date.now().toString(36).toUpperCase()}`;
    const [role] = await tx
      .insert(roles)
      .values({ key, name: input.name, description: input.description ?? null, isSystem: false, createdBy: auth.user.id })
      .returning();
    if (permissionIds.length) {
      await tx.insert(rolePermissions).values(permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })));
    }
    await audit(tx, actorOf(auth), {
      action: input.cloneFromId ? "papel.clonar" : "papel.criar",
      entity: "roles",
      entityId: role.id,
      after: { nome: role.name, permissoes: permissionIds.length, clonado_de: input.cloneFromId ?? null },
    });
    return role;
  });
}

async function assertPermissionsGrantable(tx: Tx, perms: PermissionSet, permissionIds: string[]) {
  if (perms.isOwner || !permissionIds.length) return;
  const rows = await tx.select().from(permissions).where(inArray(permissions.id, permissionIds));
  const bad = rows.find((p) => !canGrant(perms, p.module, p.action, null));
  if (bad) throw forbidden(`Você não pode incluir "${bad.module}: ${bad.action}" em um papel (permissão que você não possui em todas as marcas).`);
}

export async function updateRole(
  auth: AuthContext,
  roleId: string,
  input: { name: string; description?: string | null; isActive: boolean; permissionIds: string[] },
  reason: string,
) {
  await write(async (tx) => {
    const [role] = await tx.select().from(roles).where(and(eq(roles.id, roleId), isNull(roles.deletedAt)));
    if (!role) throw notFound("Papel não encontrado.");
    if (role.key === OWNER_ROLE_KEY) throw new AppError("O papel ADMINISTRADOR_PRINCIPAL é fixo e não pode ser alterado.", "forbidden");
    const before = await tx.select().from(rolePermissions).where(eq(rolePermissions.roleId, roleId));
    const beforeIds = new Set(before.map((b) => b.permissionId));
    const afterIds = new Set(input.permissionIds);
    const changed = [...beforeIds].filter((id) => !afterIds.has(id)).concat([...afterIds].filter((id) => !beforeIds.has(id)));
    await assertPermissionsGrantable(tx, auth.perms, changed);
    // Quem tem este papel não pode editar o próprio papel (evita auto-escalonamento).
    if (!auth.perms.isOwner) {
      const mine = await tx
        .select({ id: userRoles.id })
        .from(userRoles)
        .where(and(eq(userRoles.roleId, roleId), eq(userRoles.userId, auth.user.id)));
      if (mine.length && changed.length) throw new AppError("Você não pode alterar as permissões de um papel que você mesmo possui.", "forbidden");
    }
    await tx
      .update(roles)
      .set({ name: role.isSystem ? role.name : input.name, description: input.description ?? null, isActive: input.isActive })
      .where(eq(roles.id, roleId));
    await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
    if (input.permissionIds.length) {
      await tx.insert(rolePermissions).values(input.permissionIds.map((permissionId) => ({ roleId, permissionId })));
    }
    if (role.isActive && !input.isActive) {
      // Papel desativado: as permissões deixam de valer imediatamente (validadas a cada requisição).
    }
    await audit(tx, actorOf(auth), {
      action: "papel.editar",
      entity: "roles",
      entityId: roleId,
      before: { nome: role.name, ativo: role.isActive, permissoes: before.length },
      after: { nome: input.name, ativo: input.isActive, permissoes: input.permissionIds.length, alteradas: changed.length },
      reason,
    });
  });
}

/** Papéis padrão não podem ser excluídos, apenas desativados (§35.10). */
export async function deleteRole(auth: AuthContext, roleId: string, reason: string) {
  await write(async (tx) => {
    const [role] = await tx.select().from(roles).where(and(eq(roles.id, roleId), isNull(roles.deletedAt)));
    if (!role) throw notFound("Papel não encontrado.");
    if (role.isSystem) throw new AppError("Papéis padrão não podem ser excluídos — apenas desativados.", "forbidden");
    const inUse = await tx.select({ id: userRoles.id }).from(userRoles).where(eq(userRoles.roleId, roleId)).limit(1);
    if (inUse.length) throw new AppError("Este papel está atribuído a usuários. Remova as atribuições antes de excluir.", "conflict");
    await tx.update(roles).set({ deletedAt: new Date(), isActive: false }).where(eq(roles.id, roleId));
    await audit(tx, actorOf(auth), { action: "papel.excluir", entity: "roles", entityId: roleId, before: { nome: role.name }, reason });
  });
}

export async function hasOwner() {
  const db = await getDb();
  const rows = await db.select({ id: users.id }).from(users).where(and(eq(users.isOwner, true), isNull(users.deletedAt))).limit(1);
  return rows.length > 0;
}

/** Cria o ADMINISTRADOR_PRINCIPAL (primeiro acesso / script). */
export async function createOwner(input: { fullName: string; email: string; password: string }) {
  const problem = passwordProblem(input.password);
  if (problem) throw new AppError(problem, "app_error", { password: problem });
  const passwordHash = await hashPassword(input.password);
  return write(async (tx) => {
    const existing = await tx.select({ id: users.id }).from(users).where(and(eq(users.isOwner, true), isNull(users.deletedAt)));
    if (existing.length) throw new AppError("O administrador principal já foi criado.", "conflict");
    const dup = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(sql`lower(${users.email}) = ${input.email.toLowerCase()}`, isNull(users.deletedAt)));
    if (dup.length) throw new AppError("Já existe um usuário com este e-mail.", "conflict");
    const [user] = await tx
      .insert(users)
      .values({
        fullName: input.fullName,
        email: input.email.toLowerCase(),
        passwordHash,
        status: "ativo",
        isOwner: true,
        jobTitle: "Administrador principal",
        admissionDate: new Date().toISOString().slice(0, 10),
      })
      .returning();
    const [ownerRole] = await tx.select().from(roles).where(eq(roles.key, OWNER_ROLE_KEY));
    if (ownerRole) await tx.insert(userRoles).values({ userId: user.id, roleId: ownerRole.id, brandId: null });
    await audit(tx, { id: user.id, fullName: user.fullName, email: user.email }, {
      action: "usuario.criar_admin_principal",
      entity: "users",
      entityId: user.id,
      after: { email: user.email },
    });
    return user;
  });
}

