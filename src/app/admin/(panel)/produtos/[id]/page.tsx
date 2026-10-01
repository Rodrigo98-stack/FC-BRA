import { notFound } from "next/navigation";
import { guard } from "@/server/admin";
import { can } from "@/server/rbac";
import { formOptions } from "@/server/resources";
import { getAdminProduct } from "@/server/services/products";
import { getBrandById } from "@/server/services/brands";
import { formatDateTime } from "@/lib/format";
import { DemoBadge, Forbidden, LinkButton, PageHeader } from "@/components/admin/ui";
import { ProductStatusBadge } from "@/components/admin/badges";
import { ConfirmAction } from "@/components/admin/client";
import { ProductForm } from "../product-form";
import { toFormValues } from "../product-loader";
import { deleteProductAction } from "../actions";

export const metadata = { title: "Produto" };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await guard("produtos");
  if (!ctx.allowed) return <Forbidden module="Produtos" />;
  const data = await getAdminProduct(id);
  if (!data) notFound();
  if (ctx.scope !== "all" && !ctx.scope.includes(data.product.brandId)) return <Forbidden module="Produtos desta marca" />;
  const [options, brand] = await Promise.all([formOptions(ctx.auth, "produtos"), getBrandById(data.product.brandId)]);
  const canEdit = can(ctx.auth.perms, "produtos", "editar", data.product.brandId);
  const canDelete = can(ctx.auth.perms, "produtos", "excluir", data.product.brandId);
  return (
    <div>
      <PageHeader
        title={data.product.name}
        crumbs={[{ href: "/admin/produtos", label: "Produtos" }, { label: data.product.sku }]}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <ProductStatusBadge status={data.product.status} />
            <DemoBadge show={data.product.isDemo} />
            <span className="text-stone-500">Atualizado em {formatDateTime(data.product.updatedAt)}</span>
          </span>
        }
        actions={
          <>
            {brand && data.product.status === "ativo" && (
              <LinkButton href={`/${brand.slug}/produto/${data.product.slug}`}>Ver na loja</LinkButton>
            )}
            {canDelete && (
              <ConfirmAction
                label="Excluir"
                title="Excluir produto?"
                description="O produto sai da loja e das listagens. Pedidos e movimentações antigas continuam no histórico."
                action={deleteProductAction.bind(null, id)}
              />
            )}
          </>
        }
      />
      <ProductForm
        productId={id}
        initial={toFormValues(data)}
        brands={options.brands}
        categories={options.categories}
        suppliers={options.suppliers}
        canSetInitialStock={can(ctx.auth.perms, "estoque", "criar", data.product.brandId)}
        canEdit={canEdit}
      />
    </div>
  );
}
