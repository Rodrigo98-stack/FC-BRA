import { guard } from "@/server/admin";
import { getRoleDetail, listPermissions } from "@/server/services/users";
import { Forbidden, PageHeader, Panel } from "@/components/admin/ui";
import { RoleEditor } from "../role-editor";

export const metadata = { title: "Novo papel" };

export default async function NewRolePage({ searchParams }: { searchParams: Promise<{ clonar?: string }> }) {
  const ctx = await guard("permissoes", "criar");
  if (!ctx.allowed) return <Forbidden module="Permissões (criar)" />;
  const { clonar } = await searchParams;
  const [permissions, source] = await Promise.all([
    listPermissions(),
    clonar && /^[0-9a-f-]{36}$/.test(clonar) ? getRoleDetail(clonar) : Promise.resolve(null),
  ]);
  return (
    <div>
      <PageHeader title={source ? `Clonar papel: ${source.role.name}` : "Novo papel"} crumbs={[{ href: "/admin/permissoes", label: "Permissões e papéis" }, { label: "Novo" }]} />
      <Panel>
        <RoleEditor
          roleId={null}
          permissions={permissions}
          cloneFrom={source ? { id: source.role.id, name: source.role.name } : null}
          initial={{
            name: source ? `${source.role.name} (cópia)` : "",
            description: source?.role.description ?? "",
            isActive: true,
            permissionIds: source?.permissionIds ?? [],
          }}
        />
      </Panel>
    </div>
  );
}
