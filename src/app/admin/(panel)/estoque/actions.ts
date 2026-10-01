"use server";
import { z } from "zod";
import { requireActionAuth } from "@/server/auth/session";
import { brandScope } from "@/server/rbac";
import { formToObject, runAction, type ActionResult } from "@/server/action";
import { AppError } from "@/server/errors";
import { manualMovement, stockEntry } from "@/server/services/inventory";
import { listVariants } from "@/server/services/products";
import { zBool, zDate, zOptionalMoney, zOptionalText, zOptionalUuid, zRequired } from "@/server/validation";

export async function searchStockVariants(q: string) {
  const auth = await requireActionAuth();
  const scope = brandScope(auth.perms, "estoque");
  if (q.trim().length < 2) return [];
  const rows = await listVariants({ scope, q: q.trim().slice(0, 60), limit: 25 });
  return rows.map((r) => ({
    id: r.id,
    label: `${r.product_name} · ${[r.size, r.color].filter(Boolean).join(" / ") || "único"}`,
    sku: r.sku,
    stock: r.stock,
    brandId: r.brand_id,
    costPrice: r.cost_price,
  }));
}

export async function movementAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await requireActionAuth();
    const data = z
      .object({
        variantId: z.string().uuid("Escolha a variação."),
        type: z.enum(["entrada", "saida", "ajuste", "perda", "devolucao", "inventario", "transferencia"]),
        quantity: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().int().min(0).max(100000).optional()),
        direction: z.enum(["mais", "menos"]).optional(),
        location: zOptionalText(60),
        toLocation: zOptionalText(60),
        reason: zRequired("Motivo", 300),
        notes: zOptionalText(1000),
      })
      .parse(formToObject(form));
    if (data.type !== "inventario" && !(data.quantity && data.quantity > 0)) {
      throw new AppError("Informe uma quantidade maior que zero.", "app_error", { quantity: "Obrigatório." });
    }
    if (data.type === "inventario" && data.quantity === undefined) {
      throw new AppError("Informe a quantidade contada.", "app_error", { quantity: "Obrigatório." });
    }
    if (data.type === "transferencia" && !data.toLocation) {
      throw new AppError("Informe o local de destino.", "app_error", { toLocation: "Obrigatório." });
    }
    const res = await manualMovement(auth, {
      variantId: data.variantId,
      type: data.type as never,
      quantity: data.quantity,
      countedQuantity: data.type === "inventario" ? data.quantity : undefined,
      direction: data.direction,
      location: data.location ?? undefined,
      toLocation: data.toLocation ?? undefined,
      reason: data.reason,
      notes: data.notes ?? null,
    });
    return { ok: true, message: `Movimentação registrada. Saldo: ${res.balanceBefore} → ${res.balanceAfter}.`, redirectTo: "/admin/estoque/historico" };
  });
}

export async function entryAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await requireActionAuth();
    const data = z
      .object({
        variantId: z.string().uuid("Escolha o produto/variação."),
        supplierId: zOptionalUuid,
        quantity: z.preprocess((v) => Number(v), z.number({ error: "Quantidade inválida." }).int().min(1, "Mínimo 1.").max(100000)),
        unitCost: zOptionalMoney("Custo unitário"),
        date: zDate,
        notes: zOptionalText(1000),
        registerExpense: zBool,
        location: zOptionalText(60),
      })
      .parse(formToObject(form));
    const res = await stockEntry(auth, {
      variantId: data.variantId,
      supplierId: data.supplierId ?? null,
      quantity: data.quantity,
      unitCost: data.unitCost ?? null,
      date: data.date,
      notes: data.notes ?? null,
      registerExpense: data.registerExpense,
      location: data.location ?? undefined,
    });
    return { ok: true, message: `Entrada registrada: ${res.productName} (${res.balanceBefore} → ${res.balanceAfter}).`, redirectTo: "/admin/estoque/historico?tipo=entrada" };
  });
}
