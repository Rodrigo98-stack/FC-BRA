"use server";
import { z } from "zod";
import { requireActionAuth } from "@/server/auth/session";
import { assertCan } from "@/server/rbac";
import { formToObject, runAction, type ActionResult } from "@/server/action";
import { saveCms, FONT_OPTIONS, LOOK_OPTIONS } from "@/server/services/cms";
import { clearDemoData } from "@/server/services/demo-data";
import { schema, write } from "@/server/db";
import { audit } from "@/server/audit";
import { AppError } from "@/server/errors";
import { eq } from "drizzle-orm";
import { zHexColor, zOptionalMoney, zOptionalText, zOptionalUrl, zRequired } from "@/server/validation";
import { normalizePhone } from "@/lib/text";

const font = z.enum(FONT_OPTIONS as unknown as [string, ...string[]]);
const color = zHexColor.refine((v) => !!v, "Informe a cor (#RRGGBB).");


export async function saveIdentityAction(brandId: string, _prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await requireActionAuth();
    assertCan(auth.perms, "cms", "editar", brandId);
    const d = z
      .object({
        logo_url: zOptionalUrl,
        favicon_url: zOptionalUrl,
        tagline: zOptionalText(160),
        card_subtitle: zOptionalText(80),
        primary: color,
        secondary: color,
        accent: color,
        text: color,
        background: color,
        display: font,
        body: font,
        look: z.enum(LOOK_OPTIONS.map((o) => o.value) as [string, ...string[]]),
        logo_shows_name: z.string().optional(),
      })
      .parse(formToObject(form));
    await saveCms(auth, brandId, "identity", {
      logo_url: d.logo_url ?? null,
      logo_shows_name: d.logo_shows_name === "on",
      look: d.look,
      favicon_url: d.favicon_url ?? null,
      tagline: d.tagline ?? null,
      card_subtitle: d.card_subtitle ?? null,
      palette: { primary: d.primary, secondary: d.secondary, accent: d.accent, text: d.text, background: d.background },
      palette_is_placeholder: false,
      typography: { display: d.display, body: d.body },
    });
    return { ok: true, message: "Identidade visual publicada." };
  });
}

export async function saveHomeAction(brandId: string, _prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await requireActionAuth();
    assertCan(auth.perms, "cms", "editar", brandId);
    const raw = formToObject(form);
    const d = z
      .object({ hero_title: zOptionalText(120), hero_subtitle: zOptionalText(300), hero_image_url: zOptionalUrl })
      .parse(raw);
    const images = (Array.isArray(raw.institutional) ? raw.institutional : [raw.institutional])
      .map((v) => String(v ?? "").trim())
      .filter((v) => /^https?:\/\//.test(v) || v.startsWith("/"));
    await saveCms(auth, brandId, "home", {
      hero_title: d.hero_title ?? null,
      hero_subtitle: d.hero_subtitle ?? null,
      hero_image_url: d.hero_image_url ?? null,
      institutional_images: images.slice(0, 12),
    });
    return { ok: true, message: "Home da marca atualizada." };
  });
}

export async function saveContactAction(brandId: string, _prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await requireActionAuth();
    assertCan(auth.perms, "cms", "editar", brandId);
    const d = z
      .object({
        whatsapp: zOptionalText(30),
        email: zOptionalText(160),
        phone: zOptionalText(30),
        address: zOptionalText(300),
        instagram: zOptionalUrl,
        facebook: zOptionalUrl,
        tiktok: zOptionalUrl,
        pinterest: zOptionalUrl,
        youtube: zOptionalUrl,
      })
      .parse(formToObject(form));
    if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) throw new AppError("E-mail inválido.", "app_error", { email: "E-mail inválido." });
    await saveCms(auth, brandId, "contact", {
      whatsapp: d.whatsapp ? normalizePhone(d.whatsapp) : null,
      email: d.email ?? null,
      phone: d.phone ? normalizePhone(d.phone) : null,
      address: d.address ?? null,
    });
    await saveCms(auth, brandId, "social", {
      instagram: d.instagram ?? null,
      facebook: d.facebook ?? null,
      tiktok: d.tiktok ?? null,
      pinterest: d.pinterest ?? null,
      youtube: d.youtube ?? null,
    });
    return { ok: true, message: "Contato e redes sociais salvos." };
  });
}

export async function savePoliciesAction(brandId: string, _prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await requireActionAuth();
    assertCan(auth.perms, "cms", "editar", brandId);
    const d = z
      .object({
        troca: zOptionalText(20000),
        devolucao: zOptionalText(20000),
        entrega: zOptionalText(20000),
        privacidade: zOptionalText(20000),
        termos: zOptionalText(20000),
      })
      .parse(formToObject(form));
    await saveCms(auth, brandId, "policies", {
      troca: d.troca ?? null,
      devolucao: d.devolucao ?? null,
      entrega: d.entrega ?? null,
      privacidade: d.privacidade ?? null,
      termos: d.termos ?? null,
    });
    return { ok: true, message: "Políticas publicadas." };
  });
}

export async function saveSeoAction(brandId: string, _prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await requireActionAuth();
    assertCan(auth.perms, "cms", "editar", brandId);
    const d = z.object({ title: zOptionalText(120), description: zOptionalText(300), og_image_url: zOptionalUrl }).parse(formToObject(form));
    await saveCms(auth, brandId, "seo", { title: d.title ?? null, description: d.description ?? null, og_image_url: d.og_image_url ?? null });
    return { ok: true, message: "SEO salvo." };
  });
}

export async function saveShippingAction(brandId: string, _prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await requireActionAuth();
    assertCan(auth.perms, "configuracoes", "configurar", brandId);
    const d = z
      .object({
        mode: z.enum(["a_combinar", "gratis", "fixo"]),
        fixed_amount: zOptionalMoney("Valor do frete"),
        free_over: zOptionalMoney("Frete grátis acima de"),
        notes: zOptionalText(300),
      })
      .parse(formToObject(form));
    if (d.mode === "fixo" && (d.fixed_amount === null || d.fixed_amount === undefined)) {
      throw new AppError("Informe o valor do frete fixo.", "app_error", { fixed_amount: "Obrigatório." });
    }
    await saveCms(auth, brandId, "shipping", {
      mode: d.mode,
      fixed_amount: d.mode === "fixo" ? d.fixed_amount : null,
      free_over: d.mode === "fixo" ? (d.free_over ?? null) : null,
      notes: d.notes ?? null,
    });
    return { ok: true, message: "Regra de frete salva." };
  });
}

export async function savePickupAction(brandId: string, _prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await requireActionAuth();
    assertCan(auth.perms, "configuracoes", "configurar", brandId);
    const d = z
      .object({
        enabled: z.string().optional(),
        address: zOptionalText(200),
        maps_url: zOptionalUrl,
        notes: zOptionalText(200),
      })
      .parse(formToObject(form));
    const enabled = d.enabled === "on";
    if (enabled && !d.address) {
      throw new AppError("Informe o endereço da loja para ativar a retirada.", "app_error", { address: "Obrigatório." });
    }
    await saveCms(auth, brandId, "pickup", {
      enabled,
      address: d.address ?? null,
      maps_url: d.maps_url ?? null,
      notes: d.notes ?? null,
    });
    return { ok: true, message: enabled ? "Retirada na loja ativada." : "Retirada na loja desativada." };
  });
}

export async function saveSiteAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await requireActionAuth();
    assertCan(auth.perms, "cms", "editar");
    const d = z.object({ name: zRequired("Nome do site", 80), selection_title: zRequired("Título da seleção", 80), favicon_url: zOptionalUrl }).parse(formToObject(form));
    await saveCms(auth, null, "site", { name: d.name, selection_title: d.selection_title, favicon_url: d.favicon_url ?? null });
    return { ok: true, message: "Configurações gerais do site salvas." };
  });
}

export async function setBrandActiveAction(brandId: string, active: boolean, reason: string): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await requireActionAuth();
    assertCan(auth.perms, "configuracoes", "configurar", brandId);
    await write(async (tx) => {
      await tx.update(schema.brands).set({ isActive: active }).where(eq(schema.brands.id, brandId));
      await audit(tx, { id: auth.user.id, fullName: auth.user.fullName, email: auth.user.email }, {
        action: "marca.status",
        entity: "brands",
        entityId: brandId,
        brandId,
        after: { ativa: active },
        reason,
      });
    });
    return { ok: true, message: active ? "Loja reativada." : "Loja desativada: deixa de aparecer para os clientes." };
  });
}

export async function clearDemoAction(reason: string): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await requireActionAuth();
    assertCan(auth.perms, "configuracoes", "configurar");
    assertCan(auth.perms, "configuracoes", "excluir");
    const removed = await clearDemoData(auth, reason);
    const total = Object.values(removed).reduce((a, b) => a + Number(b), 0);
    return { ok: true, message: `Dados DEMO removidos (${total} registros principais).` };
  });
}

