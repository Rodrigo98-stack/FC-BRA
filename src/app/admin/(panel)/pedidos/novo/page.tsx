import { guard } from "@/server/admin";
import { brandScope } from "@/server/rbac";
import { Forbidden, PageHeader } from "@/components/admin/ui";
import { NewOrderForm } from "../new-order-client";

export const metadata = { title: "Registrar pedido" };

export default async function NewOrderPage() {
  const ctx = await guard("pedidos", "criar");
  if (!ctx.allowed) return <Forbidden module="Pedidos (criar)" />;
  const scope = brandScope(ctx.auth.perms, "pedidos", "criar");
  const brands = ctx.brands.filter((b) => scope === "all" || scope.includes(b.id)).map((b) => ({ id: b.id, name: b.name }));
  return (
    <div>
      <PageHeader
        title="Registrar pedido"
        description="Para vendas feitas pelo WhatsApp, Instagram ou na loja física. O pedido segue o mesmo fluxo da loja online."
        crumbs={[{ href: "/admin/pedidos", label: "Pedidos" }, { label: "Novo" }]}
      />
      <NewOrderForm brands={brands} defaultBrandId={ctx.selectedBrandId} />
    </div>
  );
}
