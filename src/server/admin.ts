/**
 * Contexto do painel: sessão, permissões, marca ativa no seletor (cookie)
 * e contadores do menu.
 */
import { cache } from "react";
import { cookies } from "next/headers";
import { requireAuth } from "./auth/session";
import { brandScope, can } from "./rbac";
import { getBrands } from "./services/brands";
import { dbMode, getDbHandle } from "./db";
import type { Action, Module } from "@/lib/domain";
import { MODULES } from "@/lib/domain";

export const ADMIN_BRAND_COOKIE = "fcbra_admin_brand";

export const getAdminContext = cache(async () => {
  const auth = await requireAuth();
  const brands = await getBrands();
  // Marcas visíveis = união do escopo em qualquer módulo.
  let visible: Set<string> | "all" = new Set();
  if (auth.perms.isOwner) visible = "all";
  else {
    for (const m of MODULES) {
      const s = brandScope(auth.perms, m);
      if (s === "all") {
        visible = "all";
        break;
      }
      s.forEach((id) => (visible as Set<string>).add(id));
    }
  }
  const visibleBrands = visible === "all" ? brands : brands.filter((b) => (visible as Set<string>).has(b.id));
  const jar = await cookies();
  const chosen = jar.get(ADMIN_BRAND_COOKIE)?.value ?? null;
  const selectedBrandId = chosen && visibleBrands.some((b) => b.id === chosen) ? chosen : visibleBrands.length === 1 ? visibleBrands[0].id : null;
  const handle = await getDbHandle();
  return {
    auth,
    brands,
    visibleBrands,
    selectedBrandId,
    selectedBrand: brands.find((b) => b.id === selectedBrandId) ?? null,
    mode: dbMode(),
    store: (handle as { store?: string }).store ?? null,
  };
});

export type AdminContext = Awaited<ReturnType<typeof getAdminContext>>;

/** Para páginas: contexto + se o usuário pode ver o módulo. */
export async function guard(module: Module | null, action: Action = "visualizar") {
  const ctx = await getAdminContext();
  const allowed = module === null ? true : can(ctx.auth.perms, module, action);
  return { ...ctx, allowed, scope: module ? brandScope(ctx.auth.perms, module, action) : ("all" as const) };
}

export function brandName(ctx: AdminContext, id: string | null | undefined) {
  if (!id) return "Ambas";
  return ctx.brands.find((b) => b.id === id)?.name ?? "—";
}
