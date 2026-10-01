"use server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/server/db";
import { requireActionAuth } from "@/server/auth/session";
import { assertCan } from "@/server/rbac";
import { formToObject, runAction, type ActionResult } from "@/server/action";
import { AppError } from "@/server/errors";
import { changeOrderStatus, createOrder } from "@/server/services/orders";
import { searchVariantsForOrder, sendOrderMessage, updateOrderInfo } from "@/server/services/orders-admin";
import { ORDER_STATUSES, ORDER_STATUS_LABELS, TEMPLATE_KEYS, type OrderStatus } from "@/lib/domain";
import { zOptionalText } from "@/server/validation";

export async function changeStatusAction(orderId: string, _prev: ActionResult | null, form: FormData): Promise<ActionResult<{ url: string | null }>> {
  return runAction(async () => {
    const auth = await requireActionAuth();
    const { status, note } = z
      .object({ status: z.enum(ORDER_STATUSES, { error: "Escolha o novo status." }), note: zOptionalText(500) })
      .parse(formToObject(form));
    const db = await getDb();
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    if (!order) throw new AppError("Pedido não encontrado.");
    // Cancelar/devolver exige aprovação; demais mudanças exigem edição.
    assertCan(auth.perms, "pedidos", ["cancelado", "devolvido"].includes(status) ? "aprovar" : "editar", order.brandId);
    if (["cancelado", "devolvido"].includes(status) && !note) {
      throw new AppError("Informe o motivo do cancelamento/devolução.", "app_error", { note: "Obrigatório." });
    }
    const res = await changeOrderStatus(orderId, status as OrderStatus, {
      actor: { id: auth.user.id, fullName: auth.user.fullName, email: auth.user.email },
      note: note ?? null,
    });
    const parts = [`Status alterado para ${ORDER_STATUS_LABELS[res.status]}.`];
    if (res.stockChanged === "baixa") parts.push("Estoque baixado.");
    if (res.stockChanged === "estorno") parts.push("Estoque devolvido.");
    if (res.revenueChanged === "receita") parts.push("Receita lançada no financeiro.");
    if (res.revenueChanged === "estorno") parts.push("Estorno lançado no financeiro.");
    if (res.notification?.status === "enviado") parts.push("Cliente notificado pelo WhatsApp (API).");
    return { ok: true, message: parts.join(" "), data: { url: res.notification?.url ?? null } };
  });
}

export async function updateOrderInfoAction(orderId: string, _prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await requireActionAuth();
    const data = z
      .object({ paymentMethod: zOptionalText(40), notes: zOptionalText(1000) })
      .parse(formToObject(form));
    await updateOrderInfo(auth, orderId, { paymentMethod: data.paymentMethod ?? null, notes: data.notes ?? null });
    return { ok: true, message: "Pedido atualizado." };
  });
}

export async function sendMessageAction(orderId: string, templateKey: string, via: "link" | "api"): Promise<ActionResult<{ url: string | null }>> {
  return runAction(async () => {
    const auth = await requireActionAuth();
    const key = z.enum(TEMPLATE_KEYS).parse(templateKey);
    const res = await sendOrderMessage(auth, orderId, key, via);
    if (res.status === "falhou") return { ok: false, error: `Falha no envio pela API: ${res.error ?? "erro desconhecido"}. Use o link.` };
    return {
      ok: true,
      message: res.status === "enviado" ? "Mensagem enviada pela API do WhatsApp." : "Mensagem gerada. Abra o link para enviar.",
      data: { url: res.url },
    };
  });
}

export async function searchVariantsAction(brandId: string, q: string) {
  const auth = await requireActionAuth();
  assertCan(auth.perms, "pedidos", "criar", brandId);
  if (!/^[0-9a-f-]{36}$/.test(brandId) || q.trim().length < 2) return [];
  return searchVariantsForOrder(brandId, q.trim().slice(0, 60));
}

export async function createPanelOrderAction(payload: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await requireActionAuth();
    const p = z
      .object({
        brandId: z.string().uuid("Escolha a marca."),
        items: z.array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1).max(99) })).min(1, "Adicione pelo menos um item."),
        customer: z.record(z.string(), z.string().nullable().optional()),
        paymentMethod: z.string().max(40).nullable().optional(),
        discount: z.number().min(0).max(1_000_000).optional(),
        whatsappOptIn: z.boolean().optional(),
        idempotencyKey: z.string().min(8).max(100),
      })
      .parse(payload);
    assertCan(auth.perms, "pedidos", "criar", p.brandId);
    const c = p.customer;
    const order = await createOrder(
      {
        brandId: p.brandId,
        items: p.items,
        customer: {
          name: c.name ?? "",
          phone: c.phone ?? "",
          whatsapp: c.whatsapp || null,
          email: c.email || null,
          address: c.address || null,
          city: c.city || null,
          state: c.state || null,
          zip: c.zip || null,
          notes: c.notes || null,
        },
        whatsappOptIn: !!p.whatsappOptIn,
        paymentMethod: p.paymentMethod || null,
        discount: p.discount ?? 0,
        idempotencyKey: p.idempotencyKey,
      },
      { source: "painel", actor: { id: auth.user.id, fullName: auth.user.fullName, email: auth.user.email } },
    );
    return { ok: true, message: `Pedido #${order.code} registrado.`, redirectTo: `/admin/pedidos/${order.id}` };
  });
}
