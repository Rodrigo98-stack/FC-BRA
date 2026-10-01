import Link from "next/link";
import { guard } from "@/server/admin";
import { can } from "@/server/rbac";
import { listRolesWithUsage } from "@/server/services/users";
import { Badge, Forbidden, LinkButton, PageHeader, Panel, Table, Td, Th } from "@/components/admin/ui";

export const metadata = { title: "Permissões e papéis" };

export default async function RolesPage() {
  const ctx = await guard("permissoes");
  if (!ctx.allowed) return <Forbidden module="Permissões e papéis" />;
  const roles = await listRolesWithUsage();
  const canCreate = can(ctx.auth.perms, "permissoes", "criar");
  return (
    <div>
      <PageHeader
        title="Permissões e papéis"
        description="Cada papel é uma matriz de módulo × ação. O escopo de marca é definido ao atribuir o papel a uma pessoa. Papéis padrão não podem ser excluídos, apenas desativados."
        actions={canCreate ? <LinkButton href="/admin/permissoes/novo" variant="primary">Novo papel</LinkButton> : null}
      />
      <Panel bodyClassName="p-0">
        <Table>
          <thead>
            <tr>
              <Th>Papel</Th>
              <Th>Escopo padrão</Th>
              <Th align="right">Permissões</Th>
              <Th align="right">Pessoas</Th>
              <Th>Situação</Th>
              <Th align="right">
                <span className="sr-only">Ações</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.id} className="hover:bg-stone-50/60">
                <Td>
                  <Link href={`/admin/permissoes/${r.id}`} className="font-medium text-stone-900 hover:underline">
                    {r.name}
                  </Link>
                  <span className="block text-xs text-stone-500">{r.key}</span>
                </Td>
                <Td className="max-w-sm text-xs text-stone-600">{r.default_scope ?? r.description ?? "—"}</Td>
                <Td align="right">{r.key === "ADMINISTRADOR_PRINCIPAL" ? "todas" : r.permissions_count}</Td>
                <Td align="right">{r.users_count}</Td>
                <Td>
                  <span className="flex gap-1">
                    {r.is_system && <Badge>Padrão</Badge>}
                    {r.is_active ? <Badge tone="success">Ativo</Badge> : <Badge tone="warning">Desativado</Badge>}
                  </span>
                </Td>
                <Td align="right">
                  <div className="flex justify-end gap-1">
                    <LinkButton href={`/admin/permissoes/${r.id}`} variant="ghost" className="py-1">
                      Abrir
                    </LinkButton>
                    {canCreate && r.key !== "ADMINISTRADOR_PRINCIPAL" && (
                      <LinkButton href={`/admin/permissoes/novo?clonar=${r.id}`} variant="ghost" className="py-1">
                        Clonar
                      </LinkButton>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>
    </div>
  );
}
