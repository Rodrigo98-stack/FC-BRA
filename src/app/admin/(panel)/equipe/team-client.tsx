"use client";
import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { ACTIONS, ACTION_LABELS, MODULES, MODULE_LABELS } from "@/lib/domain";
import { btn, cx } from "@/components/admin/ui";
import { CopyBox, toast } from "@/components/admin/client";
import { inviteAction, resetLinkAction, setCustomPermissionsAction, setRolesAction, setTeamMembersAction } from "./actions";

type RoleOpt = { id: string; name: string; key: string; description: string | null };
type BrandOpt = { id: string; name: string };

export function InviteForm({ roles, brands }: { roles: RoleOpt[]; brands: BrandOpt[] }) {
  const [state, action, pending] = useActionState(inviteAction, null);
  const [roleId, setRoleId] = useState("");
  useEffect(() => {
    if (!state) return;
    if (state.ok) toast("success", state.message ?? "Convite criado.");
    else toast("error", state.error);
  }, [state]);
  const role = roles.find((r) => r.id === roleId);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  if (state?.ok && state.data) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-stone-700">
          {state.data.emailSent
            ? "O convite foi enviado por e-mail. Se preferir, envie também o link abaixo."
            : "E-mail não configurado: envie este link pelo WhatsApp ou outro canal. Ele expira automaticamente."}
        </p>
        <CopyBox value={state.data.link} label="Link do convite" />
        <a href="/admin/equipe/convidar" className={cx(btn.base, btn.secondary)}>
          Convidar outra pessoa
        </a>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="admin-label">E-mail *</span>
          <input name="email" type="email" required className={cx("admin-input", errors.email && "border-red-400")} />
          {errors.email && <span className="mt-1 block text-xs text-red-700">{errors.email}</span>}
        </label>
        <label className="block">
          <span className="admin-label">Nome (opcional)</span>
          <input name="fullName" className="admin-input" />
        </label>
        <label className="block">
          <span className="admin-label">Cargo interno</span>
          <input name="jobTitle" placeholder="Ex.: Vendedora sênior" className="admin-input" />
        </label>
        <label className="block">
          <span className="admin-label">Papel *</span>
          <select name="roleId" value={roleId} onChange={(e) => setRoleId(e.target.value)} className={cx("admin-input", errors.roleId && "border-red-400")}>
            <option value="">Escolha</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          {errors.roleId && <span className="mt-1 block text-xs text-red-700">{errors.roleId}</span>}
        </label>
        <label className="block">
          <span className="admin-label">Escopo de marca</span>
          <select name="brandId" defaultValue="" className="admin-input">
            <option value="">Ambas as marcas</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                Somente {b.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {role?.description && <p className="rounded-md bg-stone-50 px-3 py-2 text-xs text-stone-600">{role.description}</p>}
      <button type="submit" disabled={pending} className={cx(btn.base, btn.primary)}>
        {pending ? "Criando…" : "Criar convite"}
      </button>
    </form>
  );
}

export function RolesEditor({
  userId,
  roles,
  brands,
  initial,
  disabled,
}: {
  userId: string;
  roles: RoleOpt[];
  brands: BrandOpt[];
  initial: { roleId: string; brandId: string | null }[];
  disabled?: string | null;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initial.map((r, i) => ({ ...r, key: `r${i}` })));
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const changed = JSON.stringify(rows.map(({ roleId, brandId }) => ({ roleId, brandId }))) !== JSON.stringify(initial);
  if (disabled) return <p className="text-sm text-stone-600">{disabled}</p>;
  return (
    <div className="space-y-3">
      {rows.length === 0 && <p className="text-sm text-stone-500">Nenhum papel atribuído.</p>}
      {rows.map((r) => (
        <div key={r.key} className="flex flex-wrap items-center gap-2">
          <select
            value={r.roleId}
            onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, roleId: e.target.value } : x)))}
            className="admin-input w-auto flex-1"
            aria-label="Papel"
          >
            <option value="">Escolha o papel</option>
            {roles.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <select
            value={r.brandId ?? ""}
            onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, brandId: e.target.value || null } : x)))}
            className="admin-input w-auto"
            aria-label="Escopo de marca"
          >
            <option value="">Ambas as marcas</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                Somente {b.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="text-xs text-red-700">
            Remover
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setRows((rs) => [...rs, { roleId: "", brandId: null, key: `n${Date.now()}` }])} className={cx(btn.base, btn.secondary, "py-1.5")}>
        Adicionar papel
      </button>
      {changed && (
        <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3">
          <label className="block">
            <span className="admin-label">Motivo da alteração (auditoria)</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} className="admin-input" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="h-4 w-4 accent-stone-900" />
            Confirmo a alteração de papel deste usuário
          </label>
          <button
            type="button"
            disabled={pending || reason.trim().length < 3 || !confirm || rows.some((r) => !r.roleId)}
            onClick={() =>
              start(async () => {
                const res = await setRolesAction(
                  userId,
                  rows.map(({ roleId, brandId }) => ({ roleId, brandId })),
                  reason,
                );
                if (res.ok) {
                  toast("success", res.message ?? "Salvo.");
                  setReason("");
                  setConfirm(false);
                  router.refresh();
                } else toast("error", res.error);
              })
            }
            className={cx(btn.base, btn.primary)}
          >
            {pending ? "Salvando…" : "Salvar papéis"}
          </button>
        </div>
      )}
    </div>
  );
}

/** Matriz módulo × ação (checkbox) — usada em papéis e permissões customizadas. */
export function PermissionMatrix({
  permissions,
  selected,
  onToggle,
  disabled,
}: {
  permissions: { id: string; module: string; action: string }[];
  selected: Set<string>;
  onToggle: (id: string, on: boolean) => void;
  disabled?: boolean;
}) {
  const byKey = useMemo(() => new Map(permissions.map((p) => [`${p.module}:${p.action}`, p.id])), [permissions]);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 bg-white py-2 pr-3 text-left text-xs font-medium text-stone-500">Módulo</th>
            {ACTIONS.map((a) => (
              <th key={a} className="px-1.5 py-2 text-center text-[11px] font-medium text-stone-500">
                {ACTION_LABELS[a]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MODULES.map((m) => {
            const rowIds = ACTIONS.map((a) => byKey.get(`${m}:${a}`)).filter(Boolean) as string[];
            const all = rowIds.every((id) => selected.has(id));
            return (
              <tr key={m} className="border-t border-stone-100">
                <td className="sticky left-0 bg-white py-1.5 pr-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={all}
                      disabled={disabled}
                      onChange={(e) => rowIds.forEach((id) => onToggle(id, e.target.checked))}
                      className="h-3.5 w-3.5 accent-stone-900"
                      aria-label={`Todas as ações de ${MODULE_LABELS[m]}`}
                    />
                    {MODULE_LABELS[m]}
                  </label>
                </td>
                {ACTIONS.map((a) => {
                  const id = byKey.get(`${m}:${a}`);
                  return (
                    <td key={a} className="px-1.5 py-1.5 text-center">
                      {id && (
                        <input
                          type="checkbox"
                          checked={selected.has(id)}
                          disabled={disabled}
                          onChange={(e) => onToggle(id, e.target.checked)}
                          className="h-4 w-4 accent-stone-900"
                          aria-label={`${MODULE_LABELS[m]}: ${ACTION_LABELS[a]}`}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function CustomPermissionsEditor({
  userId,
  permissions,
  brands,
  initial,
}: {
  userId: string;
  permissions: { id: string; module: string; action: string }[];
  brands: BrandOpt[];
  initial: { permissionId: string; brandId: string | null }[];
}) {
  const router = useRouter();
  const [brandId, setBrandId] = useState<string | null>(initial[0]?.brandId ?? null);
  const [selected, setSelected] = useState(new Set(initial.map((i) => i.permissionId)));
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      <label className="block max-w-xs">
        <span className="admin-label">Escopo de marca destas permissões</span>
        <select value={brandId ?? ""} onChange={(e) => setBrandId(e.target.value || null)} className="admin-input">
          <option value="">Ambas as marcas</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              Somente {b.name}
            </option>
          ))}
        </select>
      </label>
      <PermissionMatrix
        permissions={permissions}
        selected={selected}
        onToggle={(id, on) =>
          setSelected((s) => {
            const n = new Set(s);
            if (on) n.add(id);
            else n.delete(id);
            return n;
          })
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <label className="block min-w-64 flex-1">
          <span className="admin-label">Motivo (auditoria)</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} className="admin-input" />
        </label>
        <button
          type="button"
          disabled={pending || reason.trim().length < 3}
          onClick={() =>
            start(async () => {
              const res = await setCustomPermissionsAction(
                userId,
                [...selected].map((permissionId) => ({ permissionId, brandId })),
                reason,
              );
              if (res.ok) {
                toast("success", res.message ?? "Salvo.");
                setReason("");
                router.refresh();
              } else toast("error", res.error);
            })
          }
          className={cx(btn.base, btn.primary)}
        >
          {pending ? "Salvando…" : `Salvar ${selected.size} permissão(ões)`}
        </button>
      </div>
    </div>
  );
}

export function ResetLinkButton({ userId }: { userId: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await resetLinkAction(userId);
            if (res.ok) {
              toast("success", res.message ?? "Link gerado.");
              setLink(res.data?.link ?? null);
            } else toast("error", res.error);
          })
        }
        className={cx(btn.base, btn.secondary, "w-full")}
      >
        {pending ? "Gerando…" : "Gerar link de definição de senha"}
      </button>
      {link && <CopyBox value={link} label="Válido por 24 horas" />}
    </div>
  );
}

export function TeamMembersEditor({ teamId, users, initial }: { teamId: string; users: { id: string; name: string }[]; initial: string[] }) {
  const router = useRouter();
  const [sel, setSel] = useState(new Set(initial));
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <ul className="max-h-80 space-y-1 overflow-y-auto">
        {users.map((u) => (
          <li key={u.id}>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={sel.has(u.id)}
                onChange={(e) =>
                  setSel((s) => {
                    const n = new Set(s);
                    if (e.target.checked) n.add(u.id);
                    else n.delete(u.id);
                    return n;
                  })
                }
                className="h-4 w-4 accent-stone-900"
              />
              {u.name}
            </label>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await setTeamMembersAction(teamId, [...sel]);
            if (res.ok) {
              toast("success", res.message ?? "Salvo.");
              router.refresh();
            } else toast("error", res.error);
          })
        }
        className={cx(btn.base, btn.primary)}
      >
        {pending ? "Salvando…" : "Salvar membros"}
      </button>
    </div>
  );
}

