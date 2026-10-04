/**
 * Conteúdo editável (CMS sem código — §4, §24). Valores ausentes ficam
 * nulos e a interface mostra placeholders explícitos; nada é inventado.
 */
import { requestCache } from "../cache";
import { getDb, schema } from "../db";
import { and, eq, isNull } from "drizzle-orm";
import { write as writeDb } from "../db";
import { audit } from "../audit";
import type { AuthContext } from "../auth/session";

export type Palette = { primary: string; secondary: string; accent: string; text: string; background: string };

/** Estilo visual da loja: "classico" (traço fino, serifa) ou "urbano" (grafite, textura). */
export type BrandLook = "classico" | "urbano";
export const LOOK_OPTIONS: { value: BrandLook; label: string }[] = [
  { value: "classico", label: "Clássico — traço fino, luz suave" },
  { value: "urbano", label: "Urbano — grafite, textura e brilho" },
];

export type BrandIdentity = {
  logo_url: string | null;
  /** O arquivo do logo já traz o nome escrito (não repetir o nome ao lado). */
  logo_shows_name: boolean;
  look: BrandLook;
  logo_placeholder: string;
  favicon_url: string | null;
  tagline: string | null;
  card_subtitle: string | null;
  palette: Palette;
  palette_is_placeholder: boolean;
  typography: { display: string; body: string };
};
export type BrandHome = {
  hero_title: string | null;
  hero_subtitle: string | null;
  hero_image_url: string | null;
  institutional_images: string[];
};
export type BrandContact = { whatsapp: string | null; email: string | null; phone: string | null; address: string | null };
export type BrandSocial = Record<"instagram" | "facebook" | "tiktok" | "pinterest" | "youtube", string | null>;
export type BrandPolicies = Record<"troca" | "devolucao" | "entrega" | "privacidade" | "termos", string | null>;
export type BrandSeo = { title: string | null; description: string | null; og_image_url: string | null };
export type ShippingConfig = {
  mode: "a_combinar" | "gratis" | "fixo";
  fixed_amount: number | null;
  free_over: number | null;
  notes: string | null;
};
export type WhatsappConfig = { number: string | null; driver: "link" | "cloud_api"; cloud_phone_number_id: string | null };
export type SiteConfig = { name: string; selection_title: string; favicon_url: string | null };

export type BrandCms = {
  identity: BrandIdentity;
  home: BrandHome;
  contact: BrandContact;
  social: BrandSocial;
  policies: BrandPolicies;
  seo: BrandSeo;
  shipping: ShippingConfig;
  whatsapp: WhatsappConfig;
};

export const POLICY_LABELS: Record<keyof BrandPolicies, string> = {
  troca: "Política de troca",
  devolucao: "Política de devolução",
  entrega: "Entrega",
  privacidade: "Privacidade",
  termos: "Termos de uso",
};

const DEFAULT_BRAND: BrandCms = {
  identity: {
    logo_url: null,
    logo_shows_name: false,
    look: "classico",
    logo_placeholder: "[LOGO — A DEFINIR]",
    favicon_url: null,
    tagline: null,
    card_subtitle: null,
    palette: { primary: "#222222", secondary: "#eeeeee", accent: "#999999", text: "#222222", background: "#ffffff" },
    palette_is_placeholder: true,
    typography: { display: "Cormorant Garamond", body: "Inter" },
  },
  home: { hero_title: null, hero_subtitle: null, hero_image_url: null, institutional_images: [] },
  contact: { whatsapp: null, email: null, phone: null, address: null },
  social: { instagram: null, facebook: null, tiktok: null, pinterest: null, youtube: null },
  policies: { troca: null, devolucao: null, entrega: null, privacidade: null, termos: null },
  seo: { title: null, description: null, og_image_url: null },
  shipping: { mode: "a_combinar", fixed_amount: null, free_over: null, notes: null },
  whatsapp: { number: null, driver: "link", cloud_phone_number_id: null },
};

function merge<T>(base: T, value: unknown): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const b = (base as Record<string, unknown>)[k];
    out[k] = b && typeof b === "object" && !Array.isArray(b) && v && typeof v === "object" && !Array.isArray(v) ? merge(b, v) : v;
  }
  return out as T;
}

export const getAllCms = requestCache(async () => {
  const db = await getDb();
  const rows = await db.select().from(schema.cmsContent);
  const byBrand = new Map<string, BrandCms>();
  let site: SiteConfig = { name: "FINA&CLÁSSICA + BRAVUS", selection_title: "ESCOLHA SUA EXPERIÊNCIA", favicon_url: null };
  let globalWhatsapp: { number: string | null } = { number: null };
  for (const row of rows) {
    if (!row.brandId) {
      if (row.key === "site") site = merge(site, row.value);
      if (row.key === "whatsapp") globalWhatsapp = merge(globalWhatsapp, row.value);
      continue;
    }
    const current = byBrand.get(row.brandId) ?? structuredClone(DEFAULT_BRAND);
    if (row.key in current) {
      (current as Record<string, unknown>)[row.key] = merge((current as Record<string, unknown>)[row.key], row.value);
    }
    byBrand.set(row.brandId, current);
  }
  return { site, globalWhatsapp, byBrand };
});

export async function getBrandCms(brandId: string): Promise<BrandCms> {
  const all = await getAllCms();
  return all.byBrand.get(brandId) ?? structuredClone(DEFAULT_BRAND);
}

/** Número de WhatsApp efetivo da marca (marca → geral → nenhum). */
export async function getBrandWhatsappNumber(brandId: string): Promise<string | null> {
  const all = await getAllCms();
  return all.byBrand.get(brandId)?.whatsapp.number || all.globalWhatsapp.number || null;
}

// Fontes permitidas no CMS (Google Fonts) — lista fechada evita injeção.
export const FONT_OPTIONS = [
  "Cormorant Garamond",
  "Playfair Display",
  "Bodoni Moda",
  "Libre Caslon Display",
  "Fraunces",
  "DM Serif Display",
  "Italiana",
  "Marcellus",
  "Barlow Condensed",
  "Oswald",
  "Archivo",
  "Archivo Narrow",
  "Big Shoulders Display",
  "Syne",
  "Jost",
  "Inter",
  "Manrope",
  "Barlow",
  "DM Sans",
  "Work Sans",
  "Lato",
  "Montserrat",
] as const;

export function googleFontsHref(fonts: string[]): string | null {
  const allowed = [...new Set(fonts)].filter((f) => (FONT_OPTIONS as readonly string[]).includes(f));
  if (!allowed.length) return null;
  const families = allowed
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}

const SANS_FONTS = new Set([
  "Barlow Condensed", "Oswald", "Archivo", "Archivo Narrow", "Big Shoulders Display", "Syne",
  "Jost", "Inter", "Manrope", "Barlow", "DM Sans", "Work Sans", "Lato", "Montserrat",
]);

export function themeStyle(identity: BrandIdentity): Record<string, string> {
  const p = identity.palette;
  const display = identity.typography.display;
  const displayIsSans = SANS_FONTS.has(display);
  const safe = (c: string, fallback: string) => (/^#[0-9a-fA-F]{6}$/.test(c) ? c : fallback);
  const fontOk = (f: string, fallback: string) => ((FONT_OPTIONS as readonly string[]).includes(f) ? f : fallback);
  return {
    "--brand-primary": safe(p.primary, "#222222"),
    "--brand-secondary": safe(p.secondary, "#eeeeee"),
    "--brand-accent": safe(p.accent, "#999999"),
    "--brand-text": safe(p.text, "#222222"),
    "--brand-bg": safe(p.background, "#ffffff"),
    "--font-display": `"${fontOk(display, "Cormorant Garamond")}", ${displayIsSans ? "system-ui, sans-serif" : "Georgia, serif"}`,
    "--display-weight": displayIsSans ? "600" : "400",
    "--font-body": `"${fontOk(identity.typography.body, "Inter")}", system-ui, sans-serif`,
  };
}

// ---------------------------------------------------------------------------
// Escrita (painel)
// ---------------------------------------------------------------------------

/** Grava (mescla) um bloco do CMS e registra quem publicou. */
export async function saveCms(auth: AuthContext, brandId: string | null, key: string, value: Record<string, unknown>) {
  await writeDb(async (tx) => {
    const cond = and(eq(schema.cmsContent.key, key), brandId ? eq(schema.cmsContent.brandId, brandId) : isNull(schema.cmsContent.brandId));
    const [existing] = await tx.select().from(schema.cmsContent).where(cond);
    const merged = { ...((existing?.value as Record<string, unknown>) ?? {}), ...value };
    if (existing) {
      await tx.update(schema.cmsContent).set({ value: merged, publishedBy: auth.user.id }).where(eq(schema.cmsContent.id, existing.id));
    } else {
      await tx.insert(schema.cmsContent).values({ brandId, key, value: merged, publishedBy: auth.user.id });
    }
    await audit(tx, { id: auth.user.id, fullName: auth.user.fullName, email: auth.user.email }, {
      action: key === "whatsapp" || key === "shipping" ? "config.editar" : "cms.editar",
      entity: "cms_content",
      entityId: key,
      brandId,
      before: existing?.value ?? null,
      after: merged,
    });
  });
}
