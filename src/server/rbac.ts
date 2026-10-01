/**
 * RBAC: papéis × permissões (módulo × ação) × escopo de marca (§35).
 *
 * Regras:
 *   - ADMINISTRADOR_PRINCIPAL (users.is_owner) tem acesso total irrevogável.
 *   - Uma atribuição de papel com brand_id NULL vale para todas as marcas;
 *     com brand_id definido, vale só para aquela marca (ex.: "só estoque da BRAVUS").
 *   - Permissões avulsas (papel PERSONALIZADO) seguem a mesma regra de escopo.
 *   - A mesma lógica existe no banco em public.has_permission() (RLS).
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Action, Module } from "@/lib/domain";
import type { Executor } from "./db";
import { schema } from "./db";
import { forbidden } from "./errors";

const ALL = "*";

export type PermissionSet = {
  isOwner: boolean;
  /** chave "modulo:acao" → conjunto de brand_ids (ou "*" = todas). */
  grants: Map<string, Set<string>>;
};

export async function loadPermissions(db: Executor, userId: string, isOwner: boolean): Promise<PermissionSet> {
  const grants = new Map<string, Set<string>>();
  if (isOwner) return { isOwner: true, grants };

  const { userRoles, roles, rolePermissions, permissions, userPermissions } = schema;
  const fromRoles = await db
    .select({ module: permissions.module, action: permissions.action, brandId: userRoles.brandId })
    .from(userRoles)
    .innerJoin(roles, and(eq(roles.id, userRoles.roleId), eq(roles.isActive, true), isNull(roles.deletedAt)))
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(userRoles.userId, userId));
  const custom = await db
    .select({ module: permissions.module, action: permissions.action, brandId: userPermissions.brandId })
    .from(userPermissions)
    .innerJoin(permissions, eq(permissions.id, userPermissions.permissionId))
    .where(eq(userPermissions.userId, userId));

  for (const g of [...fromRoles, ...custom]) {
    const key = `${g.module}:${g.action}`;
    const set = grants.get(key) ?? new Set<string>();
    set.add(g.brandId ?? ALL);
    grants.set(key, set);
  }
  return { isOwner: false, grants };
}

/**
 * Pode executar `action` em `module`?
 *  - brandId omitido → em pelo menos uma marca.
 *  - brandId null    → registro global (sem marca): basta ter a permissão.
 *  - brandId string  → precisa de escopo para aquela marca.
 */
export function can(perms: PermissionSet, module: Module, action: Action, brandId?: string | null): boolean {
  if (perms.isOwner) return true;
  const set = perms.grants.get(`${module}:${action}`);
  if (!set || set.size === 0) return false;
  if (brandId === undefined || brandId === null) return true;
  return set.has(ALL) || set.has(brandId);
}

export function assertCan(perms: PermissionSet, module: Module, action: Action, brandId?: string | null) {
  if (!can(perms, module, action, brandId)) throw forbidden();
}

/** Marcas acessíveis para (módulo, ação): "all" ou lista de ids. */
export function brandScope(perms: PermissionSet, module: Module, action: Action = "visualizar"): "all" | string[] {
  if (perms.isOwner) return "all";
  const set = perms.grants.get(`${module}:${action}`);
  if (!set) return [];
  if (set.has(ALL)) return "all";
  return [...set];
}

/** Filtro SQL de marca para listagens (inclui registros globais quando `includeGlobal`). */
export function brandFilter(
  column: Parameters<typeof eq>[0],
  scope: "all" | string[],
  selectedBrandId?: string | null,
  includeGlobal = false,
) {
  if (selectedBrandId) {
    if (scope !== "all" && !scope.includes(selectedBrandId)) return sql`false`;
    return includeGlobal ? sql`(${column} = ${selectedBrandId} or ${column} is null)` : eq(column, selectedBrandId);
  }
  if (scope === "all") return undefined;
  if (scope.length === 0) return sql`false`;
  const list = sql.join(
    scope.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  return includeGlobal ? sql`(${column} in (${list}) or ${column} is null)` : sql`${column} in (${list})`;
}

/** Algum acesso ao painel? (usuário sem nenhuma permissão vê só a tela inicial) */
export function hasAnyPermission(perms: PermissionSet): boolean {
  return perms.isOwner || perms.grants.size > 0;
}

/**
 * Pode conceder (module, action) com o escopo de marca indicado?
 * Ninguém concede permissão que não possui (evita escalonamento de privilégio).
 * brandId null = todas as marcas → exige escopo total.
 */
export function canGrant(perms: PermissionSet, module: string, action: string, brandId: string | null): boolean {
  if (perms.isOwner) return true;
  const set = perms.grants.get(`${module}:${action}`);
  if (!set) return false;
  if (set.has(ALL)) return true;
  return brandId !== null && set.has(brandId);
}
