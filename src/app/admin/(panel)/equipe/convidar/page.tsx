import { guard } from "@/server/admin";
import { listRolesWithUsage } from "@/server/services/users";
import { Forbidden, PageHeader, Panel } from "@/components/admin/ui";
import { OWNER_ROLE_KEY } from "@/lib/domain";
import { InviteForm } from "../team-client";

export const metadata = { title: "Convidar pessoa" };

export default async function InvitePage() {
  const ctx = await guard("usuarios", "convidar");
  if (!ctx.allowed) return <Forbidden module="Usuários (convidar)" />;
  const roles = (await listRolesWithUsage()).filter((r) => r.is_active && r.key !== OWNER_ROLE_KEY);
  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Convidar pessoa"
        description="A pessoa recebe um link único com validade para criar a senha e ativar a conta. Você só pode atribuir papéis com permissões que você também tem."
        crumbs={[{ href: "/admin/equipe", label: "Usuários e equipe" }, { label: "Convidar" }]}
      />
      <Panel>
        <InviteForm
          roles={roles.map((r) => ({ id: r.id, name: r.name, key: r.key, description: r.default_scope ? `${r.description ?? ""} Escopo padrão: ${r.default_scope}.` : r.description }))}
          brands={ctx.brands.map((b) => ({ id: b.id, name: b.name }))}
        />
      </Panel>
    </div>
  );
}
