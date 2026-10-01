import { getAdminContext } from "@/server/admin";
import { can, brandScope } from "@/server/rbac";
import { NAV } from "@/lib/admin-nav";
import { countOpenOrders, countStockAlerts } from "@/server/services/dashboard";
import { countPendingInvitations } from "@/server/services/users";
import { getDb, schema } from "@/server/db";
import { eq } from "drizzle-orm";
import { AdminShell } from "@/components/admin/shell";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAdminContext();
  const { perms, user } = ctx.auth;
  const canSettings =
    can(perms, "cms", "visualizar") || can(perms, "cms", "editar") || can(perms, "configuracoes", "visualizar") || can(perms, "configuracoes", "configurar");
  const nav = NAV.map((group) =>
    group.filter((item) => (item.href === "/admin/configuracoes" ? canSettings : item.module === null || can(perms, item.module, "visualizar"))),
  ).filter((g) => g.length);
  const [pedidos, estoque, convites] = await Promise.all([
    can(perms, "pedidos", "visualizar") ? countOpenOrders(brandScope(perms, "pedidos")) : 0,
    can(perms, "estoque", "visualizar") ? countStockAlerts(brandScope(perms, "estoque")) : 0,
    can(perms, "usuarios", "visualizar") ? countPendingInvitations() : 0,
  ]);
  let roleLabel = "Sem papel atribuído";
  if (user.isOwner) roleLabel = "Administrador principal";
  else {
    const db = await getDb();
    const rows = await db
      .select({ name: schema.roles.name, brandId: schema.userRoles.brandId })
      .from(schema.userRoles)
      .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoles.roleId))
      .where(eq(schema.userRoles.userId, user.id));
    if (rows.length) {
      roleLabel = rows
        .map((r) => `${r.name}${r.brandId ? ` · ${ctx.brands.find((b) => b.id === r.brandId)?.name ?? ""}` : ""}`)
        .join(", ");
    }
  }
  return (
    <AdminShell
      nav={nav}
      counters={{ pedidos, estoque, convites }}
      user={{ fullName: user.fullName, email: user.email, isDemo: user.isDemo }}
      roleLabel={roleLabel}
      brands={ctx.visibleBrands.map((b) => ({ id: b.id, name: b.name, slug: b.slug }))}
      selectedBrandId={ctx.selectedBrandId}
      demoMode={{ active: ctx.mode === "demo", store: ctx.store }}
    >
      {children}
    </AdminShell>
  );
}
