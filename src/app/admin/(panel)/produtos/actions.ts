"use server";
import { requireActionAuth } from "@/server/auth/session";
import { runAction, type ActionResult } from "@/server/action";
import { AppError } from "@/server/errors";
import { saveProduct, softDeleteProduct } from "@/server/services/products";

export async function saveProductAction(id: string | null, payload: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await requireActionAuth();
    const res = await saveProduct(auth, id, payload);
    return { ok: true, message: id ? "Produto atualizado." : "Produto cadastrado.", redirectTo: `/admin/produtos/${res.id}` };
  });
}

export async function deleteProductAction(id: string, reason: string): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await requireActionAuth();
    if (reason.length < 3) throw new AppError("Informe o motivo.");
    await softDeleteProduct(auth, id, reason);
    return { ok: true, message: "Produto excluído.", redirectTo: "/admin/produtos" };
  });
}
