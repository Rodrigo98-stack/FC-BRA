"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { btn, cx } from "@/components/admin/ui";
import { toast } from "@/components/admin/client";
import { PermissionMatrix } from "../equipe/team-client";
import { createRoleAction, updateRoleAction } from "./actions";

export function RoleEditor({
  roleId,
  initial,
  permissions,
  locked,
  isSystem,
  cloneFrom,
}: {
  roleId: string | null;
  initial: { name: string; description: string; isActive: boolean; permissionIds: string[] };
  permissions: { id: string; module: string; action: string }[];
  locked?: string | null;
  isSystem?: boolean;
  cloneFrom?: { id: string; name: string } | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [isActive, setIsActive] = useState(initial.isActive);
  const [selected, setSelected] = useState(new Set(initial.permissionIds));
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const payload = { name, description, isActive, permissionIds: [...selected], cloneFromId: null };
      const res = roleId ? await updateRoleAction(roleId, payload, reason) : await createRoleAction(payload);
      if (res.ok) {
        toast("success", res.message ?? "Salvo.");
        setReason("");
        if (res.redirectTo) router.push(res.redirectTo);
        else router.refresh();
      } else toast("error", res.error);
    });

  return (
    <div className="space-y-5">
      {cloneFrom && <p className="rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-900">Clonando as permissões de “{cloneFrom.name}”. Ajuste o que precisar.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="admin-label">Nome do papel *</span>
          <input value={name} onChange={(e) => setName(e.target.value)} disabled={!!locked || isSystem} className="admin-input" />
          {isSystem && <span className="mt-1 block text-xs text-stone-500">Papéis padrão mantêm o nome.</span>}
        </label>
        <label className="block">
          <span className="admin-label">Descrição</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} disabled={!!locked} className="admin-input" />
        </label>
        {roleId && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} disabled={!!locked} className="h-4 w-4 accent-stone-900" />
            Papel ativo (desativado = as permissões deixam de valer)
          </label>
        )}
      </div>
      {locked && <p className="rounded-md bg-stone-100 px-3 py-2 text-sm text-stone-700">{locked}</p>}
      <PermissionMatrix
        permissions={permissions}
        selected={selected}
        disabled={!!locked}
        onToggle={(id, on) =>
          setSelected((s) => {
            const n = new Set(s);
            if (on) n.add(id);
            else n.delete(id);
            return n;
          })
        }
      />
      {!locked && (
        <div className="flex flex-wrap items-end gap-3 border-t border-stone-200 pt-4">
          {roleId && (
            <label className="block min-w-64 flex-1">
              <span className="admin-label">Motivo da alteração (auditoria) *</span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} className="admin-input" />
            </label>
          )}
          <button type="button" onClick={save} disabled={pending || name.trim().length < 2 || (!!roleId && reason.trim().length < 3)} className={cx(btn.base, btn.primary)}>
            {pending ? "Salvando…" : roleId ? `Salvar (${selected.size} permissões)` : `Criar papel (${selected.size} permissões)`}
          </button>
        </div>
      )}
    </div>
  );
}
