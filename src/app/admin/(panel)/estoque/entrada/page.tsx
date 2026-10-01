import { guard } from "@/server/admin";
import { can } from "@/server/rbac";
import { formOptions } from "@/server/resources";
import { Forbidden, PageHeader, Panel } from "@/components/admin/ui";
import { EntryForm } from "../stock-client";
import { entryAction } from "../actions";

export const metadata = { title: "Entrada de mercadoria" };

export default async function EntryPage() {
  const ctx = await guard("estoque", "criar");
  if (!ctx.allowed) return <Forbidden module="Estoque (entrada)" />;
  const options = await formOptions(ctx.auth, "estoque");
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Entrada de novos produtos"
        description="Registre a chegada de mercadoria: produto, fornecedor, quantidade e custo. O custo total é calculado."
        crumbs={[{ href: "/admin/estoque", label: "Estoque" }, { label: "Entrada" }]}
      />
      <Panel>
        <EntryForm action={entryAction} suppliers={options.suppliers} canRegisterExpense={can(ctx.auth.perms, "financeiro", "criar")} />
      </Panel>
    </div>
  );
}
