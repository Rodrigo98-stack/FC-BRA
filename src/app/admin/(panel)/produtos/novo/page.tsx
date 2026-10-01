import { guard } from "@/server/admin";
import { brandScope, can } from "@/server/rbac";
import { formOptions } from "@/server/resources";
import { Forbidden, PageHeader } from "@/components/admin/ui";
import { ProductForm } from "../product-form";
import { emptyProduct } from "../product-loader";

export const metadata = { title: "Novo produto" };

export default async function NewProductPage() {
  const ctx = await guard("produtos", "criar");
  if (!ctx.allowed) return <Forbidden module="Produtos (criar)" />;
  const options = await formOptions(ctx.auth, "produtos");
  const scope = brandScope(ctx.auth.perms, "produtos", "criar");
  const brands = options.brands.filter((b) => scope === "all" || scope.includes(b.id));
  return (
    <div>
      <PageHeader title="Novo produto" crumbs={[{ href: "/admin/produtos", label: "Produtos" }, { label: "Novo" }]} />
      <ProductForm
        productId={null}
        initial={emptyProduct(ctx.selectedBrandId ?? (brands.length === 1 ? brands[0].id : null))}
        brands={brands}
        categories={options.categories}
        suppliers={options.suppliers}
        canSetInitialStock={can(ctx.auth.perms, "estoque", "criar")}
        canEdit
      />
    </div>
  );
}
