"use server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireActionAuth } from "@/server/auth/session";
import { assertCan } from "@/server/rbac";
import { formToObject, runAction, type ActionResult } from "@/server/action";
import { AppError } from "@/server/errors";
import { getDb, schema, write } from "@/server/db";
import { audit } from "@/server/audit";
import {
  createPasswordResetLink,
  deleteUser,
  inviteUser,
  revokeInvitation,
  revokeUserAccess,
  setUserCustomPermissions,
  setUserRoles,
  setUserStatus,
  updateUserProfile,
} from "@/server/services/users";
import { zBool, zEmail, zOptionalDate, zOptionalText, zOptionalUrl, zOptionalUuid, zRequired } from "@/server/validation";

const reasonSchema = z.string().trim().min(3, "Informe o motivo.").max(500);

export async function inviteAction(_prev: ActionResult<{ link: string; emailSent: boolean }> | null, form: FormData): Promise<ActionResult<{ link: string; emailSent: boolean }>> {
  return runAction(async () => {
    const auth = await requireActionAuth();
    const data = z
      .object({
        email: zEmail,
        fullName: zOptionalText(160),
        jobTitle: zOptionalText(120),
        roleId: z.string().uuid("Escolha o papel."),
        brandId: zOptionalUuid,
      })
      .parse(formToObject(form));
    assertCan(auth.perms, "usuarios", "convidar", data.brandId ?? null);
    const res = await inviteUser(auth, {
      email: data.email,
      fullName: data.fullName ?? null,
      jobTitle: data.jobTitle ?? null,
      roleId: data.roleId,
      brandId: data.brandId ?? null,
    });
    return {
      ok: true,
      message: res.emailSent ? "Convite enviado por e-mail." : "Convite criado. Copie o link e envie para a pessoa.",
      data: { link: res.link, emailSent: res.emailSent },
    };
  });
}

export async function revokeInviteAction(id: string, reason: string): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await requireActionAuth();
    assertCan(auth.perms, "usuarios", "revogar");
    void reason;
    await revokeInvitation(auth, id);
    return { ok: true, message: "Convite revogado." };
  });
}

export async function updateProfileAction(userId: string, _prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await requireActionAuth();
    if (userId !== auth.user.id) assertCan(auth.perms, "usuarios", "editar");
    const d = z
      .object({
        fullName: zRequired("Nome", 160),
        nickname: zOptionalText(60),
        email: zEmail,
        phone: zOptionalText(30),
        whatsapp: zOptionalText(30),
        photoUrl: zOptionalUrl,
        cpf: zOptionalText(20),
        birthDate: zOptionalDate,
        admissionDate: zOptionalDate,
        jobTitle: zOptionalText(120),
        notes: zOptionalText(2000),
        mfaRequired: zBool,
      })
      .parse(formToObject(form));
    await updateUserProfile(auth, userId, {
      fullName: d.fullName,
      nickname: d.nickname ?? null,
      email: d.email,
      phone: d.phone ?? null,
      whatsapp: d.whatsapp ?? null,
      photoUrl: d.photoUrl ?? null,
      cpf: d.cpf ?? null,
      birthDate: d.birthDate ?? null,
      admissionDate: d.admissionDate ?? null,
      jobTitle: d.jobTitle ?? null,
      notes: d.notes ?? null,
      mfaRequired: d.mfaRequired,
    });
    return { ok: true, message: "Dados atualizados." };
  });
}

export async function setRolesAction(userId: string, payload: { roleId: string; brandId: string | null }[], reason: string): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await requireActionAuth();
    assertCan(auth.perms, "usuarios", "editar");
    const list = z.array(z.object({ roleId: z.string().uuid(), brandId: z.string().uuid().nullable() })).max(20).parse(payload);
    await setUserRoles(auth, userId, list, reasonSchema.parse(reason));
    return { ok: true, message: "Papéis atualizados. Valem a partir da próxima ação do usuário." };
  });
}

export async function setCustomPermissionsAction(userId: string, payload: { permissionId: string; brandId: string | null }[], reason: string): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await requireActionAuth();
    assertCan(auth.perms, "permissoes", "editar");
    const list = z.array(z.object({ permissionId: z.string().uuid(), brandId: z.string().uuid().nullable() })).max(400).parse(payload);
    await setUserCustomPermissions(auth, userId, list, reasonSchema.parse(reason));
    return { ok: true, message: "Permissões customizadas salvas." };
  });
}

export async function setStatusAction(userId: string, status: "ativo" | "inativo" | "suspenso", reason: string): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await requireActionAuth();
    assertCan(auth.perms, "usuarios", status === "ativo" ? "editar" : "revogar");
    await setUserStatus(auth, userId, status, reasonSchema.parse(reason));
    const msg = { ativo: "Usuário ativado.", inativo: "Usuário desativado e sessões encerradas.", suspenso: "Usuário suspenso e sessões encerradas." }[status];
    return { ok: true, message: msg };
  });
}

export async function revokeAccessAction(userId: string, reason: string): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await requireActionAuth();
    assertCan(auth.perms, "usuarios", "revogar");
    await revokeUserAccess(auth, userId, reasonSchema.parse(reason));
    return { ok: true, message: "Acesso revogado. Todas as sessões foram encerradas." };
  });
}

export async function deleteUserAction(userId: string, reason: string): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await requireActionAuth();
    assertCan(auth.perms, "usuarios", "excluir");
    await deleteUser(auth, userId, reasonSchema.parse(reason));
    return { ok: true, message: "Usuário excluído e dados pessoais anonimizados.", redirectTo: "/admin/equipe" };
  });
}

export async function resetLinkAction(userId: string): Promise<ActionResult<{ link: string; emailSent: boolean }>> {
  return runAction(async () => {
    const auth = await requireActionAuth();
    assertCan(auth.perms, "usuarios", "editar");
    const res = await createPasswordResetLink(auth, userId);
    return { ok: true, message: res.emailSent ? "Link enviado por e-mail." : "Link gerado. Copie e envie para a pessoa.", data: res };
  });
}

export async function setTeamMembersAction(teamId: string, userIds: string[]): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await requireActionAuth();
    assertCan(auth.perms, "usuarios", "editar");
    const ids = z.array(z.string().uuid()).max(500).parse(userIds);
    await write(async (tx) => {
      const [team] = await tx.select().from(schema.teams).where(eq(schema.teams.id, teamId));
      if (!team) throw new AppError("Time não encontrado.");
      const before = await tx.select().from(schema.teamMembers).where(eq(schema.teamMembers.teamId, teamId));
      await tx.delete(schema.teamMembers).where(eq(schema.teamMembers.teamId, teamId));
      if (ids.length) await tx.insert(schema.teamMembers).values(ids.map((userId) => ({ teamId, userId })));
      await audit(tx, { id: auth.user.id, fullName: auth.user.fullName, email: auth.user.email }, {
        action: "times.editar",
        entity: "team_members",
        entityId: teamId,
        before: before.map((b) => b.userId),
        after: ids,
      });
    });
    return { ok: true, message: "Membros do time atualizados." };
  });
}

