/**
 * Estoque (§13): saldo por variação/local em `inventory`, e TODA alteração
 * registrada em `inventory_movements` com saldo antes/depois e responsável.
 * Sempre chamado dentro de uma transação (write()).
 */
import { and, eq, sql } from "drizzle-orm";
import { getDb, rowsOf, schema, write, type Tx } from "../db";
import { AppError } from "../errors";
import type { MovementType } from "@/lib/domain";
import { audit } from "../audit";
import { assertCan, can } from "../rbac";
import type { AuthContext } from "../auth/session";
import { brandSql, likeTerm } from "../sql";
import type { ResolvedPeriod } from "@/lib/period";

const { inventory, inventoryMovements, productVariants, products } = schema;

export type MovementInput = {
  variantId: string;
  location?: string;
  type: MovementType;
  /** Variação com sinal (+ entra, − sai). Para "inventario", use `countedQuantity`. */
  quantity?: number;
  countedQuantity?: number;
  unitCost?: number | null;
  supplierId?: string | null;
  orderId?: string | null;
  reason?: string | null;
  notes?: string | null;
  responsibleUserId?: string | null;
  occurredAt?: Date;
  isDemo?: boolean;
};

export type MovementResult = {
  movementId: string;
  productId: string;
  brandId: string;
  balanceBefore: number;
  balanceAfter: number;
  minStock: number;
  productName: string;
};

/** Trava a linha de saldo (SELECT … FOR UPDATE) e devolve o saldo atual. */
async function lockBalance(tx: Tx, variantId: string, location: string): Promise<number> {
  await tx
    .insert(inventory)
    .values({ variantId, location, quantity: 0 })
    .onConflictDoNothing({ target: [inventory.variantId, inventory.location] });
  const res = await tx.execute(
    sql`select quantity from public.inventory where variant_id = ${variantId} and location = ${location} for update`,
  );
  return Number(rowsOf<{ quantity: number }>(res)[0]?.quantity ?? 0);
}

export async function applyMovement(tx: Tx, input: MovementInput): Promise<MovementResult> {
  const location = input.location ?? "principal";
  const [variant] = await tx
    .select({
      id: productVariants.id,
      productId: productVariants.productId,
      brandId: productVariants.brandId,
      sku: productVariants.sku,
      minStock: productVariants.minStock,
      size: productVariants.size,
      color: productVariants.color,
      productName: products.name,
      productMinStock: products.minStock,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(productVariants.id, input.variantId))
    .limit(1);
  if (!variant) throw new AppError("Variação de produto não encontrada.", "not_found");

  const before = await lockBalance(tx, variant.id, location);
  let delta: number;
  if (input.type === "inventario") {
    if (input.countedQuantity === undefined || input.countedQuantity < 0) {
      throw new AppError("Informe a quantidade contada no inventário.");
    }
    delta = input.countedQuantity - before;
  } else {
    delta = Math.trunc(input.quantity ?? 0);
    if (delta === 0) throw new AppError("A quantidade da movimentação não pode ser zero.");
  }
  const after = before + delta;
  const label = [variant.productName, variant.size, variant.color].filter(Boolean).join(" · ");
  if (after < 0) {
    throw new AppError(`Estoque insuficiente para ${label} (disponível: ${before}, solicitado: ${Math.abs(delta)}).`, "conflict");
  }

  await tx
    .update(inventory)
    .set({ quantity: after, updatedAt: new Date() })
    .where(and(eq(inventory.variantId, variant.id), eq(inventory.location, location)));

  const unitCost = input.unitCost ?? null;
  const [movement] = await tx
    .insert(inventoryMovements)
    .values({
      brandId: variant.brandId,
      productId: variant.productId,
      variantId: variant.id,
      location,
      type: input.type,
      quantity: delta,
      balanceBefore: before,
      balanceAfter: after,
      unitCost: unitCost === null ? null : unitCost.toFixed(2),
      totalCost: unitCost === null ? null : (unitCost * Math.abs(delta)).toFixed(2),
      supplierId: input.supplierId ?? null,
      orderId: input.orderId ?? null,
      reason: input.reason ?? null,
      notes: input.notes ?? null,
      responsibleUserId: input.responsibleUserId ?? null,
      occurredAt: input.occurredAt ?? new Date(),
      isDemo: input.isDemo ?? false,
    })
    .returning({ id: inventoryMovements.id });

  return {
    movementId: movement.id,
    productId: variant.productId,
    brandId: variant.brandId,
    balanceBefore: before,
    balanceAfter: after,
    minStock: variant.minStock || variant.productMinStock,
    productName: label,
  };
}

/** Transferência entre locais (preparado para multi-CD): duas movimentações. */
export async function transferStock(
  tx: Tx,
  input: { variantId: string; from: string; to: string; quantity: number; responsibleUserId: string; reason?: string | null },
) {
  if (input.from === input.to) throw new AppError("Origem e destino precisam ser diferentes.");
  if (input.quantity <= 0) throw new AppError("Quantidade inválida.");
  const out = await applyMovement(tx, {
    variantId: input.variantId,
    location: input.from,
    type: "transferencia",
    quantity: -input.quantity,
    reason: input.reason ?? `Transferência para ${input.to}`,
    responsibleUserId: input.responsibleUserId,
  });
  const inn = await applyMovement(tx, {
    variantId: input.variantId,
    location: input.to,
    type: "transferencia",
    quantity: input.quantity,
    reason: input.reason ?? `Transferência de ${input.from}`,
    responsibleUserId: input.responsibleUserId,
  });
  return [out, inn];
}

/** Saldo total por variação (todos os locais). */
export async function variantStock(tx: Tx, variantIds: string[]): Promise<Map<string, number>> {
  if (!variantIds.length) return new Map();
  const res = await tx.execute(sql`
    select variant_id, coalesce(sum(quantity), 0)::int as qty from public.inventory
    where variant_id in (${sql.join(variantIds.map((id) => sql`${id}::uuid`), sql`, `)})
    group by variant_id`);
  return new Map(rowsOf<{ variant_id: string; qty: number }>(res).map((r) => [r.variant_id, Number(r.qty)]));
}

// ---------------------------------------------------------------------------
// Painel: movimentações manuais, entrada de mercadoria (§15) e histórico
// ---------------------------------------------------------------------------

async function variantBrand(tx: Tx, variantId: string) {
  const [v] = await tx
    .select({ brandId: productVariants.brandId, productId: productVariants.productId })
    .from(productVariants)
    .where(eq(productVariants.id, variantId));
  if (!v) throw new AppError("Variação não encontrada.", "not_found");
  return v;
}

export async function manualMovement(
  auth: AuthContext,
  input: {
    variantId: string;
    type: MovementType;
    quantity?: number;
    countedQuantity?: number;
    direction?: "mais" | "menos";
    location?: string;
    toLocation?: string;
    reason: string;
    notes?: string | null;
  },
) {
  return write(async (tx) => {
    const v = await variantBrand(tx, input.variantId);
    assertCan(auth.perms, "estoque", input.type === "entrada" ? "criar" : "editar", v.brandId);
    const actor = { id: auth.user.id, fullName: auth.user.fullName, email: auth.user.email };
    const location = input.location?.trim() || "principal";
    if (input.type === "transferencia") {
      const res = await transferStock(tx, {
        variantId: input.variantId,
        from: location,
        to: input.toLocation?.trim() || "",
        quantity: input.quantity ?? 0,
        responsibleUserId: auth.user.id,
        reason: input.reason,
      });
      await audit(tx, actor, {
        action: "estoque.transferir",
        entity: "inventory",
        entityId: input.variantId,
        brandId: v.brandId,
        after: { de: location, para: input.toLocation, quantidade: input.quantity },
        reason: input.reason,
      });
      return res[0];
    }
    const qty = Math.abs(Math.trunc(input.quantity ?? 0));
    const signed =
      input.type === "entrada" || input.type === "devolucao"
        ? qty
        : input.type === "saida" || input.type === "perda"
          ? -qty
          : input.direction === "menos"
            ? -qty
            : qty;
    const res = await applyMovement(tx, {
      variantId: input.variantId,
      location,
      type: input.type,
      quantity: input.type === "inventario" ? undefined : signed,
      countedQuantity: input.type === "inventario" ? input.countedQuantity : undefined,
      reason: input.reason,
      notes: input.notes ?? null,
      responsibleUserId: auth.user.id,
    });
    await audit(tx, actor, {
      action: "estoque.movimentar",
      entity: "inventory",
      entityId: input.variantId,
      brandId: v.brandId,
      before: { saldo: res.balanceBefore },
      after: { saldo: res.balanceAfter, tipo: input.type },
      reason: input.reason,
    });
    return res;
  });
}

/** Entrada de novos produtos (§15): estoque + (opcional) despesa de compra. */
export async function stockEntry(
  auth: AuthContext,
  input: {
    variantId: string;
    supplierId: string | null;
    quantity: number;
    unitCost: number | null;
    date: string;
    notes: string | null;
    registerExpense: boolean;
    location?: string;
  },
) {
  return write(async (tx) => {
    const v = await variantBrand(tx, input.variantId);
    assertCan(auth.perms, "estoque", "criar", v.brandId);
    if (input.quantity <= 0) throw new AppError("A quantidade deve ser maior que zero.", "app_error", { quantity: "Inválida." });
    if (input.registerExpense) {
      if (!can(auth.perms, "financeiro", "criar", v.brandId)) {
        throw new AppError("Você não tem permissão para lançar no financeiro. Desmarque a opção ou peça ao financeiro.", "forbidden");
      }
      if (input.unitCost === null) throw new AppError("Informe o custo unitário para lançar a compra no financeiro.", "app_error", { unitCost: "Obrigatório." });
    }
    const occurredAt = new Date(`${input.date}T12:00:00-03:00`);
    const res = await applyMovement(tx, {
      variantId: input.variantId,
      location: input.location || "principal",
      type: "entrada",
      quantity: input.quantity,
      unitCost: input.unitCost,
      supplierId: input.supplierId,
      reason: "Entrada de mercadoria",
      notes: input.notes,
      responsibleUserId: auth.user.id,
      occurredAt,
    });
    if (input.registerExpense && input.unitCost !== null) {
      await tx.insert(schema.financialExpenses).values({
        brandId: v.brandId,
        category: "compra_produtos",
        description: `Compra de mercadoria — ${res.productName} (${input.quantity} un.)`,
        amount: (input.unitCost * input.quantity).toFixed(2),
        occurredOn: input.date,
        supplierId: input.supplierId,
        inventoryMovementId: res.movementId,
        createdBy: auth.user.id,
      });
    }
    await audit(tx, { id: auth.user.id, fullName: auth.user.fullName, email: auth.user.email }, {
      action: "estoque.entrada",
      entity: "inventory",
      entityId: input.variantId,
      brandId: v.brandId,
      after: {
        produto: res.productName,
        quantidade: input.quantity,
        custo_unitario: input.unitCost,
        custo_total: input.unitCost === null ? null : input.unitCost * input.quantity,
        financeiro: input.registerExpense,
      },
    });
    return res;
  });
}

export async function listMovements(f: {
  scope: "all" | string[];
  brandId?: string | null;
  type?: string | null;
  productId?: string | null;
  q?: string | null;
  period?: ResolvedPeriod | null;
  page?: number;
  perPage?: number;
}) {
  const db = await getDb();
  const perPage = f.perPage ?? 30;
  const page = Math.max(f.page ?? 1, 1);
  const conds = [brandSql(sql`m.brand_id`, f.scope, f.brandId)];
  if (f.type) conds.push(sql`m.type = ${f.type}`);
  if (f.productId) conds.push(sql`m.product_id = ${f.productId}`);
  if (f.period) conds.push(sql`m.occurred_at >= ${f.period.from.toISOString()} and m.occurred_at < ${f.period.to.toISOString()}`);
  if (f.q) {
    const t = likeTerm(f.q);
    conds.push(sql`(p.name ilike ${t} or v.sku ilike ${t})`);
  }
  const rows = rowsOf<{
    id: string;
    occurred_at: string;
    type: string;
    quantity: number;
    balance_before: number;
    balance_after: number;
    unit_cost: string | null;
    total_cost: string | null;
    reason: string | null;
    notes: string | null;
    location: string;
    brand_id: string;
    product_id: string;
    product_name: string;
    size: string | null;
    color: string | null;
    sku: string;
    supplier_name: string | null;
    user_name: string | null;
    order_id: string | null;
    is_demo: boolean;
    total: number;
  }>(
    await db.execute(sql`
      select m.id, m.occurred_at, m.type, m.quantity, m.balance_before, m.balance_after, m.unit_cost, m.total_cost, m.reason, m.notes,
             m.location, m.brand_id, m.product_id, p.name as product_name, v.size, v.color, v.sku, s.name as supplier_name,
             u.full_name as user_name, m.order_id, m.is_demo, count(*) over()::int as total
      from public.inventory_movements m
      join public.products p on p.id = m.product_id
      join public.product_variants v on v.id = m.variant_id
      left join public.suppliers s on s.id = m.supplier_id
      left join public.users u on u.id = m.responsible_user_id
      where ${sql.join(conds, sql` and `)}
      order by m.occurred_at desc, m.created_at desc
      limit ${perPage} offset ${(page - 1) * perPage}`),
  );
  const total = Number(rows[0]?.total ?? 0);
  return { rows, total, page, perPage, pages: Math.max(1, Math.ceil(total / perPage)) };
}

export async function stockLocations(variantId: string) {
  const db = await getDb();
  return db.select().from(inventory).where(eq(inventory.variantId, variantId));
}

