import { notFound } from "next/navigation";
import { desc, eq, or } from "drizzle-orm";
import { guard } from "@/server/admin";
import { can } from "@/server/rbac";
import { getUserDetail, listPermissions, listRolesWithUsage } from "@/server/services/users";
import { getDb, schema } from "@/server/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { auditActionLabel } from "@/lib/audit-labels";
import { CUSTOM_ROLE_KEY, OWNER_ROLE_KEY } from "@/lib/domain";
import { ActionForm, CheckboxField, ConfirmAction, ImageField, SubmitButton, TextAreaField, TextField } from "@/components/admin/client";
import { Badge, DemoBadge, Forbidden, LinkButton, PageHeader, Panel } from "@/components/admin/ui";
import { UserStatusBadge } from "@/components/admin/badges";
import { CustomPermissionsEditor, ResetLinkButton, RolesEditor } from "../team-client";
import { deleteUserAction, revokeAccessAction, setStatusAction, updateProfileAction } from "../actions";

export const metadata = { title: "Usuário" };

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await guard("usuarios");
  if (!ctx.allowed && id !== ctx.auth.user.id) return <Forbidden module="Usuários e equipe" />;
  const detail = await getUserDetail(id);
  if (!detail) notFound();
  const { user, assignments, custom, activeSessions } = detail;
  const { perms } = ctx.auth;
  const isSelf = id === ctx.auth.user.id;
  const ownerLocked = user.isOwner && !perms.isOwner;
  const canEdit = (can(perms, "usuarios", "editar") && !ownerLocked) || isSelf;
  const canRevoke = can(perms, "usuarios", "revogar") && !user.isOwner && !isSelf;
  const canDelete = can(perms, "usuarios", "excluir") && !user.isOwner && !isSelf;
  const [roles, permissions] = await Promise.all([listRolesWithUsage(), listPermissions()]);
  const db = await getDb();
  const logs = can(perms, "auditoria", "visualizar")
    ? await db
        .select()
        .from(schema.auditLogs)
        .where(or(eq(schema.auditLogs.actorUserId, id), eq(schema.auditLogs.entityId, id)))
        .orderBy(desc(schema.auditLogs.createdAt))
        .limit(15)
    : [];
  const brands = ctx.brands.map((b) => ({ id: b.id, name: b.name }));
  const hasCustomRole = assignments.some((a) => a.roleKey === CUSTOM_ROLE_KEY) || custom.length > 0;
  const rolesDisabled = user.isOwner
    ? "O ADMINISTRADOR_PRINCIPAL tem acesso total e não pode ser rebaixado."
    : isSelf
      ? "Você não pode alterar os seus próprios papéis."
      : !can(perms, "usuarios", "editar")
        ? "Sem permissão para alterar papéis."
        : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={user.fullName}
        crumbs={[{ href: "/admin/equipe", label: "Usuários e equipe" }, { label: user.fullName }]}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <UserStatusBadge status={user.status} />
            {user.isOwner && <Badge tone="info">Administrador principal</Badge>}
            <DemoBadge show={user.isDemo} />
            <span className="text-stone-500">
              {user.email} · último acesso {user.lastAccessAt ? formatDateTime(user.lastAccessAt) : "nunca"}
            </span>
          </span>
        }
        actions={can(perms, "auditoria", "visualizar") ? <LinkButton href={`/admin/auditoria?usuario=${id}`}>Ver todos os logs</LinkButton> : null}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Panel title="Cadastro">
            {canEdit ? (
              <ActionForm action={updateProfileAction.bind(null, id)} className="grid gap-4 sm:grid-cols-2">
                <TextField name="fullName" label="Nome completo" required defaultValue={user.fullName} className="sm:col-span-2" />
                <TextField name="nickname" label="Apelido" defaultValue={user.nickname} />
                <TextField name="email" label="E-mail" type="email" required defaultValue={user.email} />
                <TextField name="phone" label="Telefone" type="tel" defaultValue={user.phone} />
                <TextField name="whatsapp" label="WhatsApp" type="tel" defaultValue={user.whatsapp} />
                <TextField
                  name="cpf"
                  label="CPF (opcional)"
                  placeholder={user.cpfLastDigits ? `•••.•••.•••-${user.cpfLastDigits} (já cadastrado)` : "000.000.000-00"}
                  help="Armazenado apenas como hash; exibido mascarado."
                />
                <TextField name="birthDate" label="Data de nascimento" type="date" defaultValue={user.birthDate} />
                <TextField name="admissionDate" label="Data de admissão" type="date" defaultValue={user.admissionDate} />
                <TextField name="jobTitle" label="Cargo interno" defaultValue={user.jobTitle} placeholder="Ex.: Vendedor sênior" />
                <ImageField name="photoUrl" label="Foto" defaultValue={user.photoUrl} className="sm:col-span-2" />
                <TextAreaField name="notes" label="Observações" defaultValue={user.notes} className="sm:col-span-2" rows={3} />
                <CheckboxField
                  name="mfaRequired"
                  label="Exigir verificação em duas etapas (2FA)"
                  help="Registro da exigência; a verificação em duas etapas será ativada quando o recurso for implementado."
                  defaultChecked={user.mfaRequired}
                  className="sm:col-span-2"
                />
                <div className="sm:col-span-2">
                  <SubmitButton>Salvar dados</SubmitButton>
                </div>
              </ActionForm>
            ) : (
              <p className="text-sm text-stone-600">Somente leitura.</p>
            )}
          </Panel>

          <Panel title="Papéis e escopo de marca" description="Um papel pode valer para as duas marcas ou só para uma (ex.: Estoque somente na BRAVUS).">
            <RolesEditor
              userId={id}
              roles={roles.filter((r) => r.is_active && r.key !== OWNER_ROLE_KEY).map((r) => ({ id: r.id, name: r.name, key: r.key, description: r.description }))}
              brands={brands}
              initial={assignments.filter((a) => a.roleKey !== OWNER_ROLE_KEY).map((a) => ({ roleId: a.roleId, brandId: a.brandId }))}
              disabled={rolesDisabled}
            />
          </Panel>

          {hasCustomRole && !user.isOwner && can(perms, "permissoes", "editar") && !isSelf && (
            <Panel title="Permissões customizadas" description="Para o papel PERSONALIZADO: marque exatamente o que esta pessoa pode fazer.">
              <CustomPermissionsEditor userId={id} permissions={permissions} brands={brands} initial={custom.map((c) => ({ permissionId: c.permissionId, brandId: c.brandId }))} />
            </Panel>
          )}

          {logs.length > 0 && (
            <Panel title="Atividade recente" bodyClassName="p-0">
              <ul className="divide-y divide-stone-100">
                {logs.map((l) => (
                  <li key={l.id} className="flex flex-wrap justify-between gap-2 px-5 py-2.5 text-sm">
                    <span>
                      <strong className="font-medium">{l.actorName}</strong> {auditActionLabel(l.action)}
                      {l.reason && <span className="text-stone-500"> — {l.reason}</span>}
                    </span>
                    <span className="text-xs text-stone-500">{formatDateTime(l.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <div className="space-y-6">
          <Panel title="Acesso">
            <div className="space-y-3">
              {!user.hasPassword && <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">Esta pessoa ainda não definiu senha.</p>}
              {canEdit && !ownerLocked && <ResetLinkButton userId={id} />}
              {canRevoke && user.status !== "ativo" && (
                <ConfirmAction
                  label="Ativar"
                  variant="secondary"
                  className="w-full"
                  title="Ativar usuário?"
                  confirmLabel="Ativar"
                  action={setStatusAction.bind(null, id, "ativo")}
                />
              )}
              {canRevoke && user.status === "ativo" && (
                <ConfirmAction
                  label="Suspender temporariamente"
                  variant="secondary"
                  className="w-full"
                  title="Suspender usuário?"
                  description="As sessões ativas são encerradas na hora. Você pode reativar depois."
                  action={setStatusAction.bind(null, id, "suspenso")}
                />
              )}
              {canRevoke && user.status === "ativo" && (
                <ConfirmAction
                  label="Desativar (sem excluir histórico)"
                  variant="secondary"
                  className="w-full"
                  title="Desativar usuário?"
                  description="A pessoa perde o acesso; o histórico é mantido."
                  action={setStatusAction.bind(null, id, "inativo")}
                />
              )}
              {canRevoke && (
                <ConfirmAction
                  label="Revogar acesso agora"
                  className="w-full"
                  title="Revogar acesso?"
                  description="Desativa a conta e invalida imediatamente todas as sessões abertas."
                  action={revokeAccessAction.bind(null, id)}
                />
              )}
              {canDelete && (
                <ConfirmAction
                  label="Excluir usuário"
                  variant="danger"
                  className="w-full"
                  title="Excluir usuário?"
                  description="Exclusão lógica com anonimização parcial dos dados pessoais (LGPD). Os registros de auditoria são preservados."
                  action={deleteUserAction.bind(null, id)}
                />
              )}
              {user.isOwner && <p className="text-xs text-stone-500">O administrador principal não pode ser excluído, suspenso ou rebaixado.</p>}
            </div>
          </Panel>
          <Panel title={`Sessões ativas (${activeSessions.length})`}>
            {activeSessions.length ? (
              <ul className="space-y-2 text-xs text-stone-600">
                {activeSessions.map((s) => (
                  <li key={s.id}>
                    Desde {formatDateTime(s.createdAt)} · último uso {formatDateTime(s.lastSeenAt)}
                    <span className="block truncate text-stone-400">{s.userAgent ?? "—"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-stone-500">Nenhuma sessão aberta.</p>
            )}
          </Panel>
          <Panel title="Registro">
            <dl className="space-y-1.5 text-xs text-stone-600">
              <div>Criado em {formatDateTime(user.createdAt)}</div>
              <div>Admissão: {user.admissionDate ? formatDate(user.admissionDate) : "Não informado"}</div>
              <div>CPF: {user.cpfLastDigits ? `•••.•••.•••-${user.cpfLastDigits}` : "Não informado"}</div>
            </dl>
          </Panel>
        </div>
      </div>
    </div>
  );
}
