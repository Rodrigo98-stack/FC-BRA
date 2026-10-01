import { guard } from "@/server/admin";
import { can } from "@/server/rbac";
import { listVariants } from "@/server/services/products";
import { Forbidden, PageHeader, Panel } from "@/components/admin/ui";
import { MovementForm } from "../stock-client";
import { movementAction } from "../actions";

export const metadata = { title: "Movimentar estoque" };

export default async function MovementPage({ searchParams }: { searchParams: Promise<{ variante?: string }> }) {
  const ctx = await guard("estoque");
  if (!ctx.allowed || !(can(ctx.auth.perms, "estoque", "editar") || can(ctx.auth.perms, "estoque", "criar"))) {
    return <Forbidden module="Estoque (movimentar)" />;
  }
  const { variante } = await searchParams;
  let initial = null;
  if (variante && /^[0-9a-f-]{36}$/.test(variante)) {
    const rows = await listVariants({ scope: ctx.scope, limit: 2000 });
    const v = rows.find((r) => r.id === variante);
    if (v) {
      initial = {
        id: v.id,
        label: `${v.product_name} · ${[v.size, v.color].filter(Boolean).join(" / ") || "único"}`,
        sku: v.sku,
        stock: v.stock,
        brandId: v.brand_id,
        costPrice: v.cost_price,
      };
    }
  }
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Movimentar estoque"
        description="Saída, ajuste, perda, devolução, inventário (contagem) ou transferência entre locais. Vendas baixam o estoque automaticamente."
        crumbs={[{ href: "/admin/estoque", label: "Estoque" }, { label: "Movimentar" }]}
      />
      <Panel>
        <MovementForm action={movementAction} initial={initial} />
      </Panel>
    </div>
  );
}
