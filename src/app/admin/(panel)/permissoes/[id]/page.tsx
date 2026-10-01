import Link from "next/link";
import { notFound } from "next/navigation";
import { guard } from "@/server/admin";
import { can } from "@/server/rbac";
import { getRoleDetail, listPermissions } from "@/server/services/users";
import { ConfirmAction } from "@/components/admin/client";
import { Badge, Forbidden, LinkButton, PageHeader, Panel } from "@/components/admin/ui";
import { UserStatusBadge } from "@/components/admin/badges";
import { RoleEditor } from "../role-editor";
import { deleteRoleAction } from "../actions";

export const metadata = { title: "Papel" };

export default async function RolePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await guard("permissoes");
  if (!ctx.allowed) return <Forbidden module="Permissões e papéis" />;
  const [detail, permissions] = await Promise.all([getRoleDetail(id), listPermissions()]);
  if (!detail) notFound();
  const { role, permissionIds, members } = detail;
  const isOwnerRole = role.key === "ADMINISTRADOR_PRINCIPAL";
  const locked = isOwnerRole
    ? "Papel fixo: o administrador principal tem acesso total e irrevogável."
    : !can(ctx.auth.perms, "permissoes", "editar")
      ? "Você pode visualizar, mas não editar papéis."
      : null;
  const brands = new Map(ctx.brands.map((b) => [b.id, b.name]));
  return (
    <div className="space-y-6">
      <PageHeader
        title={role.name}
        crumbs={[{ href: "/admin/permissoes", label: "Permissões e papéis" }, { label: role.name }]}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {role.isSystem && <Badge>Padrão</Badge>}
            {role.isActive ? <Badge tone="success">Ativo</Badge> : <Badge tone="warning">Desativado</Badge>}
            <span className="text-stone-500">{role.defaultScope ?? role.description}</span>
          </span>
        }
        actions={
          <>
            {!isOwnerRole && can(ctx.auth.perms, "permissoes", "criar") && <LinkButton href={`/admin/permissoes/novo?clonar=${role.id}`}>Clonar</LinkButton>}
            {!role.isSystem && can(ctx.auth.perms, "permissoes", "excluir") && (
              <ConfirmAction label="Excluir" title="Excluir papel?" description="Só é possível excluir papéis sem pessoas atribuídas." action={deleteRoleAction.bind(null, role.id)} />
            )}
          </>
        }
      />
      <Panel title="Matriz de permissões">
        <RoleEditor
          roleId={role.id}
          isSystem={role.isSystem}
          locked={locked}
          permissions={permissions}
          initial={{ name: role.name, description: role.description ?? "", isActive: role.isActive, permissionIds: isOwnerRole ? permissions.map((p) => p.id) : permissionIds }}
        />
      </Panel>
      <Panel title={`Quem usa este papel (${members.length})`} bodyClassName="p-0">
        {members.length ? (
          <ul className="divide-y divide-stone-100">
            {members.map((m) => (
              <li key={`${m.id}-${m.brandId}`} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <Link href={`/admin/equipe/${m.id}`} className="hover:underline">
                  {m.fullName} <span className="text-xs text-stone-500">{m.email}</span>
                </Link>
                <span className="flex items-center gap-2 text-xs text-stone-600">
                  {m.brandId ? `Somente ${brands.get(m.brandId)}` : "Ambas as marcas"}
                  <UserStatusBadge status={m.status} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-6 text-sm text-stone-500">Ninguém usa este papel.</p>
        )}
      </Panel>
    </div>
  );
}
