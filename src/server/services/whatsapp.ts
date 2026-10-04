/**
 * WhatsAppService (§9.3): interface única com dois drivers.
 *   - LinkDriver (padrão): gera https://wa.me/{numero}?text={msg}. Nada é
 *     enviado automaticamente; o registro fica com status "gerado".
 *   - CloudApiDriver: WhatsApp Business Cloud API (Meta), somente quando
 *     configurado (ID do número no painel + WHATSAPP_CLOUD_API_TOKEN no
 *     ambiente). Nunca simulamos envio por API (§28.12).
 *
 * Observação (documentação oficial da Meta): mensagens de texto livre só
 * são entregues dentro da janela de 24h de atendimento; fora dela é preciso
 * usar modelos aprovados. Por isso o envio por API registra o retorno real.
 */
import { and, eq, isNull, or } from "drizzle-orm";
import { getDb, schema, type Executor } from "../db";
import { getBrandCms, getBrandWhatsappNumber } from "./cms";
import { formatBRL } from "@/lib/format";
import type { TemplateKey } from "@/lib/domain";

export type SendResult = {
  method: "link" | "api";
  status: "gerado" | "enviado" | "falhou";
  url: string | null;
  providerMessageId?: string | null;
  error?: string | null;
};

interface WhatsAppDriver {
  readonly kind: "link" | "api";
  send(to: string | null, body: string): Promise<SendResult>;
}

export function waLink(number: string | null, text: string): string | null {
  const digits = (number ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export class LinkDriver implements WhatsAppDriver {
  readonly kind = "link" as const;
  async send(to: string | null, body: string): Promise<SendResult> {
    return { method: "link", status: "gerado", url: waLink(to, body) };
  }
}

export class CloudApiDriver implements WhatsAppDriver {
  readonly kind = "api" as const;
  constructor(
    private readonly phoneNumberId: string,
    private readonly token: string,
    private readonly apiVersion = process.env.WHATSAPP_CLOUD_API_VERSION ?? "v21.0",
  ) {}

  async send(to: string | null, body: string): Promise<SendResult> {
    const digits = (to ?? "").replace(/\D/g, "");
    if (!digits) return { method: "api", status: "falhou", url: null, error: "Número de destino ausente." };
    try {
      const res = await fetch(`https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to: digits, type: "text", text: { body } }),
        signal: AbortSignal.timeout(10_000),
      });
      const json = (await res.json().catch(() => ({}))) as {
        messages?: { id: string }[];
        error?: { message?: string };
      };
      if (!res.ok || !json.messages?.[0]?.id) {
        return {
          method: "api",
          status: "falhou",
          url: waLink(digits, body),
          error: json.error?.message ?? `HTTP ${res.status}`,
        };
      }
      return { method: "api", status: "enviado", url: null, providerMessageId: json.messages[0].id };
    } catch (err) {
      return { method: "api", status: "falhou", url: waLink(digits, body), error: (err as Error).message };
    }
  }
}

/** Driver para mensagens loja → cliente de uma marca. */
export async function getDriver(brandId: string): Promise<WhatsAppDriver> {
  const cms = await getBrandCms(brandId);
  const token = process.env.WHATSAPP_CLOUD_API_TOKEN;
  if (cms.whatsapp.driver === "cloud_api" && cms.whatsapp.cloud_phone_number_id && token) {
    return new CloudApiDriver(cms.whatsapp.cloud_phone_number_id, token);
  }
  return new LinkDriver();
}

export async function isCloudApiConfigured(brandId: string) {
  return (await getDriver(brandId)).kind === "api";
}

/** Substitui {variavel} pelo valor; variáveis desconhecidas permanecem. */
export function renderTemplate(body: string, vars: Record<string, string | number | null | undefined>): string {
  return body.replace(/\{([a-z_]+)\}/g, (m, key: string) => {
    if (!(key in vars)) return m;
    const v = vars[key];
    return v === null || v === undefined || v === "" ? "Não informado" : String(v);
  });
}

/** Moeda sem espaço não separável (melhor no texto do WhatsApp). */
export const money = (v: unknown) => formatBRL(v).replace(/ /g, " ");

export async function getTemplate(db: Executor, brandId: string | null, key: TemplateKey) {
  const { whatsappTemplates: t } = schema;
  const rows = await db
    .select()
    .from(t)
    .where(and(eq(t.key, key), eq(t.isActive, true), brandId ? or(eq(t.brandId, brandId), isNull(t.brandId)) : isNull(t.brandId)));
  // Modelo específico da marca tem prioridade sobre o geral.
  return rows.find((r) => r.brandId === brandId) ?? rows.find((r) => r.brandId === null) ?? null;
}

export type CheckoutMessageInput = {
  brandName: string;
  orderNumber: string;
  items: { name: string; size: string | null; color: string | null; quantity: number; total: number }[];
  subtotal: number;
  shippingLabel: string;
  total: number;
  customerName: string;
  customerPhone: string;
  notes: string | null;
  /** "Retirada na loja: …" ou o endereço de entrega. */
  delivery: string;
};

export function renderItems(items: CheckoutMessageInput["items"]): string {
  return items
    .map(
      (it, i) =>
        `${i + 1}. ${it.name}\n   Tamanho: ${it.size ?? "Não informado"}\n   Cor: ${it.color ?? "Não informado"}\n   Quantidade: ${it.quantity}\n   Valor: ${money(it.total)}`,
    )
    .join("\n\n");
}

export async function buildCheckoutMessage(db: Executor, brandId: string, input: CheckoutMessageInput) {
  const tpl = await getTemplate(db, brandId, "checkout");
  const body =
    tpl?.body ??
    "Olá! Gostaria de realizar um pedido.\n\nLoja: {marca}\nPedido: #{numero}\n\nProdutos:\n{itens}\n\nSubtotal: {subtotal}\nFrete: {frete}\nTotal: {total}\n\nEntrega: {entrega}\n\nNome: {nome}\nTelefone: {telefone}\nObservações: {obs}\n\nGostaria de confirmar meu pedido.";
  return renderTemplate(body, {
    marca: input.brandName,
    numero: input.orderNumber,
    itens: renderItems(input.items),
    subtotal: money(input.subtotal),
    frete: input.shippingLabel,
    total: money(input.total),
    nome: input.customerName,
    telefone: input.customerPhone,
    obs: input.notes,
    entrega: input.delivery,
  });
}

export async function logMessage(
  db: Executor,
  entry: {
    brandId: string | null;
    orderId?: string | null;
    customerId?: string | null;
    toNumber: string | null;
    templateKey: string | null;
    body: string;
    result: SendResult;
    createdBy?: string | null;
    isDemo?: boolean;
  },
) {
  await db.insert(schema.whatsappMessagesLog).values({
    brandId: entry.brandId,
    orderId: entry.orderId ?? null,
    customerId: entry.customerId ?? null,
    toNumber: entry.toNumber,
    templateKey: entry.templateKey,
    body: entry.body,
    deliveryMethod: entry.result.method,
    status: entry.result.status,
    providerMessageId: entry.result.providerMessageId ?? null,
    error: entry.result.error ?? null,
    createdBy: entry.createdBy ?? null,
    isDemo: entry.isDemo ?? false,
  });
}

export async function storeWhatsappNumber(brandId: string) {
  return getBrandWhatsappNumber(brandId);
}

export async function listTemplates() {
  const db = await getDb();
  return db.select().from(schema.whatsappTemplates);
}
