"use server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireActionAuth } from "@/server/auth/session";
import { assertCan } from "@/server/rbac";
import { formToObject, runAction, type ActionResult } from "@/server/action";
import { saveCms } from "@/server/services/cms";
import { getDb, schema, write } from "@/server/db";
import { audit } from "@/server/audit";
import { AppError } from "@/server/errors";
import { normalizePhone } from "@/lib/text";
import { TEMPLATE_KEYS } from "@/lib/domain";
import { zBool, zOptionalText } from "@/server/validation";

export async function saveWhatsappConfigAction(brandId: string | null, _prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await requireActionAuth();
    assertCan(auth.perms, "whatsapp", "configurar", brandId);
    const data = z
      .object({ number: zOptionalText(30), driver: z.enum(["link", "cloud_api"]).optional(), cloudPhoneNumberId: zOptionalText(60) })
      .parse(formToObject(form));
    const number = data.number ? normalizePhone(data.number) : null;
    if (data.number && (!number || number.length < 12)) {
      throw new AppError("Número inválido. Use DDI + DDD + número (ex.: 55 11 91234-5678).", "app_error", { number: "Número inválido." });
    }
    if (brandId === null) {
      await saveCms(auth, null, "whatsapp", { number });
    } else {
      if (data.driver === "cloud_api" && !data.cloudPhoneNumberId) {
        throw new AppError("Informe o ID do número (Phone number ID) da Cloud API.", "app_error", { cloudPhoneNumberId: "Obrigatório." });
      }
      await saveCms(auth, brandId, "whatsapp", { number, driver: data.driver ?? "link", cloud_phone_number_id: data.cloudPhoneNumberId ?? null });
    }
    return { ok: true, message: "Configuração do WhatsApp salva." };
  });
}

export async function saveTemplateAction(key: string, brandId: string | null, _prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await requireActionAuth();
    assertCan(auth.perms, "automacoes", "editar", brandId);
    const tk = z.enum(TEMPLATE_KEYS).parse(key);
    const data = z.object({ body: z.string().trim().min(5, "Escreva a mensagem.").max(2000), isActive: zBool }).parse(formToObject(form));
    await write(async (tx) => {
      const t = schema.whatsappTemplates;
      const cond = and(eq(t.key, tk), brandId ? eq(t.brandId, brandId) : isNull(t.brandId));
      const [existing] = await tx.select().from(t).where(cond);
      if (existing) {
        await tx.update(t).set({ body: data.body, isActive: data.isActive, updatedBy: auth.user.id }).where(eq(t.id, existing.id));
      } else {
        const [base] = await tx.select().from(t).where(and(eq(t.key, tk), isNull(t.brandId)));
        await tx.insert(t).values({ brandId, key: tk, name: base?.name ?? tk, body: data.body, isActive: data.isActive, updatedBy: auth.user.id });
      }
      await audit(tx, { id: auth.user.id, fullName: auth.user.fullName, email: auth.user.email }, {
        action: "whatsapp.modelo",
        entity: "whatsapp_templates",
        entityId: tk,
        brandId,
        before: existing ? { body: existing.body, ativo: existing.isActive } : null,
        after: { body: data.body, ativo: data.isActive },
      });
    });
    return { ok: true, message: "Modelo salvo." };
  });
}

export async function resetTemplateAction(key: string, brandId: string): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await requireActionAuth();
    assertCan(auth.perms, "automacoes", "editar", brandId);
    await write(async (tx) => {
      const t = schema.whatsappTemplates;
      await tx.delete(t).where(and(eq(t.key, key), eq(t.brandId, brandId)));
      await audit(tx, { id: auth.user.id, fullName: auth.user.fullName, email: auth.user.email }, {
        action: "whatsapp.modelo",
        entity: "whatsapp_templates",
        entityId: key,
        brandId,
        after: { voltou_para: "modelo geral" },
      });
    });
    return { ok: true, message: "A marca voltou a usar o modelo geral." };
  });
}

export async function saveAutomationAction(id: string, _prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await requireActionAuth();
    const data = z
      .object({
        isEnabled: zBool,
        requireOptIn: zBool,
        delayMinutes: z.preprocess((v) => Number(v || 0), z.number().int().min(0).max(43200)),
        notes: zOptionalText(500),
      })
      .parse(formToObject(form));
    const db = await getDb();
    const [a] = await db.select().from(schema.automations).where(eq(schema.automations.id, id));
    if (!a) throw new AppError("Automação não encontrada.");
    assertCan(auth.perms, "automacoes", "configurar", a.brandId);
    await write(async (tx) => {
      await tx
        .update(schema.automations)
        .set({ isEnabled: data.isEnabled, requireOptIn: data.requireOptIn, delayMinutes: data.delayMinutes, notes: data.notes ?? null, updatedBy: auth.user.id })
        .where(eq(schema.automations.id, id));
      await audit(tx, { id: auth.user.id, fullName: auth.user.fullName, email: auth.user.email }, {
        action: "automacao.editar",
        entity: "automations",
        entityId: id,
        brandId: a.brandId,
        before: { ativa: a.isEnabled, opt_in: a.requireOptIn },
        after: { ativa: data.isEnabled, opt_in: data.requireOptIn, atraso_min: data.delayMinutes },
      });
    });
    return { ok: true, message: data.isEnabled ? "Automação ligada." : "Automação desligada." };
  });
}
