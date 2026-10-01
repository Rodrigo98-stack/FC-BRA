"use server";
import { z } from "zod";
import { requireActionAuth } from "@/server/auth/session";
import { assertCan } from "@/server/rbac";
import { runAction, type ActionResult } from "@/server/action";
import { createRole, deleteRole, updateRole } from "@/server/services/users";
import { AppError } from "@/server/errors";

const roleSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do papel.").max(80),
  description: z.string().trim().max(300).optional(),
  isActive: z.boolean().optional(),
  permissionIds: z.array(z.string().uuid()).max(400),
  cloneFromId: z.string().uuid().nullable().optional(),
});

export async function createRoleAction(payload: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await requireActionAuth();
    assertCan(auth.perms, "permissoes", "criar");
    const d = roleSchema.parse(payload);
    const role = await createRole(auth, { name: d.name, description: d.description || null, permissionIds: d.permissionIds, cloneFromId: d.cloneFromId ?? null });
    return { ok: true, message: "Papel criado.", redirectTo: `/admin/permissoes/${role.id}` };
  });
}

export async function updateRoleAction(roleId: string, payload: unknown, reason: string): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await requireActionAuth();
    assertCan(auth.perms, "permissoes", "editar");
    const d = roleSchema.parse(payload);
    if (reason.trim().length < 3) throw new AppError("Informe o motivo da alteração.");
    await updateRole(auth, roleId, { name: d.name, description: d.description || null, isActive: d.isActive ?? true, permissionIds: d.permissionIds }, reason.trim());
    return { ok: true, message: "Papel atualizado. As permissões valem imediatamente para quem tem este papel." };
  });
}

export async function deleteRoleAction(roleId: string, reason: string): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await requireActionAuth();
    assertCan(auth.perms, "permissoes", "excluir");
    await deleteRole(auth, roleId, reason);
    return { ok: true, message: "Papel excluído.", redirectTo: "/admin/permissoes" };
  });
}
