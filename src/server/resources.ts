/**
 * Cadastros simples do painel descritos por configuração (campos, validação,
 * permissão, escopo de marca, auditoria e soft delete). Evita repetir o mesmo
 * CRUD em fornecedores, ideias, produtos planejados, banners, categorias,
 * times, clientes e lançamentos financeiros.
 */
import { and, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { z } from "zod";
import { getDb, schema, write, type Tx } from "./db";
import { AppError, notFound } from "./errors";
import { audit, diff } from "./audit";
import { assertCan, brandScope } from "./rbac";
import type { AuthContext } from "./auth/session";
import { brandSql, likeTerm } from "./sql";
import type { Module } from "@/lib/domain";
import {
  BANNER_PLACEMENT_LABELS,
  CATEGORY_KIND_LABELS,
  ENTRY_KIND_LABELS,
  EXPENSE_CATEGORY_LABELS,
  IDEA_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PLANNED_STATUS_LABELS,
  PRIORITY_LABELS,
} from "@/lib/domain";
import {
  zBool,
  zDate,
  zEmail,
  zInt,
  zMoney,
  zOptionalDate,
  zOptionalEmail,
  zOptionalInt,
  zOptionalMoney,
  zOptionalText,
  zOptionalUrl,
  zOptionalUuid,
  zRequired,
  zState,
} from "./validation";
import { RESERVED_SLUGS } from "./services/catalog";
import { slugify } from "@/lib/text";

export type FieldType =
  | "text"
  | "textarea"
  | "money"
  | "int"
  | "date"
  | "datetime"
  | "select"
  | "brand"
  | "brandOptional"
  | "supplier"
  | "category"
  | "user"
  | "checkbox"
  | "url"
  | "image"
  | "email"
  | "state"
  | "phone";

export type FieldDef = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: Record<string, string>;
  help?: string;
  max?: number;
  wide?: boolean;
  placeholder?: string;
  defaultValue?: string | boolean | number;
};

export type ColumnDef = {
  key: string;
  label: string;
  type?: "text" | "money" | "date" | "datetime" | "badge" | "brand" | "bool" | "image" | "int";
  options?: Record<string, string>;
};

export type ResourceDef = {
  key: string;
  title: string;
  singular: string;
  /** Gênero do substantivo (para "Novo"/"Nova"). */
  feminine?: boolean;
  description: string;
  module: Module;
  table: PgTable & Record<string, unknown>;
  brandMode: "required" | "optional" | "none";
  fields: FieldDef[];
  columns: ColumnDef[];
  search: string[];
  filters?: { name: string; label: string; options: Record<string, string> }[];
  orderBy?: string;
  createdByColumn?: string;
  /** Regras extras (validação cruzada) antes de gravar. */
  beforeSave?: (tx: Tx, values: Record<string, unknown>, existing: Record<string, unknown> | null) => Promise<void>;
  /** Bloqueia edição/exclusão de registros gerados pelo sistema. */
  locked?: (row: Record<string, unknown>) => string | null;
  hardDelete?: boolean;
};

function fieldSchema(f: FieldDef): z.ZodTypeAny {
  const label = f.label;
  switch (f.type) {
    case "text":
    case "phone":
      return f.required ? zRequired(label, f.max ?? 200) : zOptionalText(f.max ?? 200);
    case "textarea":
      return f.required ? zRequired(label, f.max ?? 5000) : zOptionalText(f.max ?? 5000);
    case "money":
      return f.required ? zMoney(label) : zOptionalMoney(label);
    case "int":
      return f.required ? zInt(label) : zOptionalInt(label);
    case "date":
      return f.required ? zDate : zOptionalDate;
    case "datetime":
      return z.preprocess((v) => (v === "" || v == null ? null : v), z.string().max(30).nullable().optional());
    case "select": {
      const keys = Object.keys(f.options ?? {}) as [string, ...string[]];
      return f.required
        ? z.enum(keys, { error: `${label}: escolha uma opção.` })
        : z.preprocess((v) => (v === "" ? null : v), z.enum(keys).nullable().optional());
    }
    case "brand":
      return z.string({ error: "Escolha a marca." }).uuid("Escolha a marca.");
    case "brandOptional":
    case "supplier":
    case "category":
    case "user":
      return f.required ? z.string().uuid(`${label}: escolha uma opção.`) : zOptionalUuid;
    case "checkbox":
      return zBool;
    case "url":
    case "image":
      return f.required ? z.string().min(1, `${label} é obrigatório.`).max(1000) : zOptionalUrl;
    case "email":
      return f.required ? zEmail : zOptionalEmail;
    case "state":
      return zState;
  }
}

export function resourceSchema(def: ResourceDef) {
  return z.object(Object.fromEntries(def.fields.map((f) => [f.name, fieldSchema(f)])));
}

function toDbValues(def: ResourceDef, input: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const f of def.fields) {
    let v = input[f.name];
    if (f.type === "money" && typeof v === "number") v = v.toFixed(2);
    if (f.type === "datetime") v = v ? new Date(String(v)) : null;
    out[f.name] = v === undefined ? null : v;
  }
  return out;
}

const T = schema;

async function assertCategoryBrand(tx: Tx, categoryId: unknown, brandId: unknown) {
  if (!categoryId) return;
  const [c] = await tx.select().from(T.categories).where(eq(T.categories.id, String(categoryId)));
  if (!c || (brandId && c.brandId !== brandId)) {
    throw new AppError("A categoria escolhida não pertence a esta marca.", "app_error", { categoryId: "Categoria de outra marca." });
  }
}

export const RESOURCES: Record<string, ResourceDef> = {
  fornecedores: {
    key: "fornecedores",
    title: "Fornecedores",
    singular: "fornecedor",
    description: "Cadastro de fornecedores usado nas entradas de estoque, produtos e financeiro.",
    module: "fornecedores",
    table: T.suppliers as never,
    brandMode: "optional",
    fields: [
      { name: "name", label: "Nome / razão social", type: "text", required: true, wide: true },
      { name: "document", label: "CNPJ / CPF", type: "text", max: 30 },
      { name: "contactName", label: "Contato", type: "text" },
      { name: "phone", label: "Telefone", type: "phone", max: 30 },
      { name: "whatsapp", label: "WhatsApp", type: "phone", max: 30 },
      { name: "email", label: "E-mail", type: "email" },
      { name: "address", label: "Endereço", type: "text", wide: true, max: 300 },
      { name: "city", label: "Cidade", type: "text" },
      { name: "state", label: "UF", type: "state" },
      { name: "brandId", label: "Atende a marca", type: "brandOptional", help: "Vazio = atende as duas marcas." },
      { name: "isActive", label: "Ativo", type: "checkbox", defaultValue: true },
      { name: "notes", label: "Observações", type: "textarea", wide: true },
    ],
    columns: [
      { key: "name", label: "Fornecedor" },
      { key: "contactName", label: "Contato" },
      { key: "phone", label: "Telefone" },
      { key: "city", label: "Cidade" },
      { key: "brandId", label: "Marca", type: "brand" },
      { key: "isActive", label: "Ativo", type: "bool" },
    ],
    search: ["name", "document", "contact_name", "email", "city"],
    createdByColumn: "createdBy",
  },
  ideias: {
    key: "ideias",
    feminine: true,
    title: "Ideias e melhorias",
    singular: "ideia",
    description: "Registre ideias de melhoria com prioridade, responsável e acompanhamento de status.",
    module: "ideias",
    table: T.ideas as never,
    brandMode: "optional",
    fields: [
      { name: "title", label: "Título", type: "text", required: true, wide: true },
      { name: "description", label: "Descrição", type: "textarea", wide: true },
      { name: "category", label: "Categoria", type: "text", placeholder: "Ex.: Vendas, Conteúdo, Operação" },
      { name: "priority", label: "Prioridade", type: "select", required: true, options: PRIORITY_LABELS, defaultValue: "media" },
      { name: "status", label: "Status", type: "select", required: true, options: IDEA_STATUS_LABELS, defaultValue: "ideia" },
      { name: "responsibleUserId", label: "Responsável", type: "user" },
      { name: "ideaDate", label: "Data", type: "date", required: true },
      { name: "brandId", label: "Marca", type: "brandOptional", help: "Vazio = geral." },
      { name: "notes", label: "Observações", type: "textarea", wide: true },
    ],
    columns: [
      { key: "title", label: "Título" },
      { key: "priority", label: "Prioridade", type: "badge", options: PRIORITY_LABELS },
      { key: "status", label: "Status", type: "badge", options: IDEA_STATUS_LABELS },
      { key: "brandId", label: "Marca", type: "brand" },
      { key: "ideaDate", label: "Data", type: "date" },
    ],
    search: ["title", "description", "category"],
    filters: [
      { name: "status", label: "Status", options: IDEA_STATUS_LABELS },
      { name: "priority", label: "Prioridade", options: PRIORITY_LABELS },
    ],
    createdByColumn: "createdBy",
  },
  planejados: {
    key: "planejados",
    title: "Produtos planejados",
    singular: "produto planejado",
    description: "Pipeline de novos produtos: da pesquisa até ficar disponível na loja.",
    module: "produtos_planejados",
    table: T.plannedProducts as never,
    brandMode: "required",
    fields: [
      { name: "name", label: "Nome", type: "text", required: true, wide: true },
      { name: "brandId", label: "Marca", type: "brand", required: true },
      { name: "categoryId", label: "Categoria", type: "category" },
      { name: "supplierId", label: "Fornecedor", type: "supplier" },
      { name: "estimatedCost", label: "Custo estimado (R$)", type: "money" },
      { name: "estimatedPrice", label: "Preço estimado (R$)", type: "money" },
      { name: "plannedQuantity", label: "Quantidade planejada", type: "int" },
      { name: "status", label: "Status", type: "select", required: true, options: PLANNED_STATUS_LABELS, defaultValue: "pesquisa" },
      { name: "notes", label: "Observação", type: "textarea", wide: true },
    ],
    columns: [
      { key: "name", label: "Produto" },
      { key: "brandId", label: "Marca", type: "brand" },
      { key: "estimatedCost", label: "Custo est.", type: "money" },
      { key: "estimatedPrice", label: "Preço est.", type: "money" },
      { key: "plannedQuantity", label: "Qtd.", type: "int" },
      { key: "status", label: "Status", type: "badge", options: PLANNED_STATUS_LABELS },
    ],
    search: ["name", "notes"],
    filters: [{ name: "status", label: "Status", options: PLANNED_STATUS_LABELS }],
    createdByColumn: "createdBy",
    beforeSave: (tx, v) => assertCategoryBrand(tx, v.categoryId, v.brandId),
  },
  banners: {
    key: "banners",
    title: "Banners",
    singular: "banner",
    description: "Imagens de destaque da home, das categorias e das páginas de produto, por marca.",
    module: "banners",
    table: T.banners as never,
    brandMode: "required",
    fields: [
      { name: "brandId", label: "Marca", type: "brand", required: true },
      { name: "placement", label: "Posição", type: "select", required: true, options: BANNER_PLACEMENT_LABELS, defaultValue: "home_hero" },
      { name: "imageUrl", label: "Imagem", type: "image", required: true, wide: true, help: "Recomendado: 1600×900 px (home) ou 1200×900 px (secundário)." },
      { name: "title", label: "Título", type: "text", max: 120 },
      { name: "subtitle", label: "Subtítulo", type: "text", max: 200 },
      { name: "ctaLabel", label: "Texto do botão", type: "text", max: 40 },
      { name: "linkUrl", label: "Link", type: "url", placeholder: "/fina-classica/novidades" },
      { name: "categoryId", label: "Categoria (opcional)", type: "category", help: "Para banners de categoria." },
      { name: "sortOrder", label: "Ordem", type: "int", defaultValue: 0 },
      { name: "startsAt", label: "Início", type: "datetime" },
      { name: "endsAt", label: "Fim", type: "datetime" },
      { name: "isActive", label: "Publicado", type: "checkbox", defaultValue: true },
    ],
    columns: [
      { key: "imageUrl", label: "", type: "image" },
      { key: "title", label: "Título" },
      { key: "brandId", label: "Marca", type: "brand" },
      { key: "placement", label: "Posição", type: "badge", options: BANNER_PLACEMENT_LABELS },
      { key: "sortOrder", label: "Ordem", type: "int" },
      { key: "isActive", label: "Publicado", type: "bool" },
    ],
    search: ["title", "subtitle"],
    filters: [{ name: "placement", label: "Posição", options: BANNER_PLACEMENT_LABELS }],
    orderBy: "sort_order",
    createdByColumn: "publishedBy",
    beforeSave: (tx, v) => assertCategoryBrand(tx, v.categoryId, v.brandId),
  },
  categorias: {
    key: "categorias",
    feminine: true,
    title: "Categorias",
    singular: "categoria",
    description: "Categorias de cada loja. Novidades e Promoções são listas automáticas.",
    module: "categorias",
    table: T.categories as never,
    brandMode: "required",
    fields: [
      { name: "brandId", label: "Marca", type: "brand", required: true },
      { name: "name", label: "Nome", type: "text", required: true, max: 80 },
      { name: "slug", label: "Endereço (slug)", type: "text", max: 80, help: "Gerado a partir do nome se vazio. Ex.: vestidos" },
      { name: "kind", label: "Tipo", type: "select", required: true, options: CATEGORY_KIND_LABELS, defaultValue: "padrao" },
      { name: "parentId", label: "Categoria-mãe", type: "category", help: "Para subcategorias." },
      { name: "sortOrder", label: "Ordem no menu", type: "int", defaultValue: 0 },
      { name: "isActive", label: "Visível na loja", type: "checkbox", defaultValue: true },
      { name: "imageUrl", label: "Imagem", type: "image" },
      { name: "description", label: "Descrição", type: "textarea", wide: true, max: 1000 },
      { name: "seoTitle", label: "Título SEO", type: "text", max: 120 },
      { name: "seoDescription", label: "Descrição SEO", type: "text", max: 300, wide: true },
    ],
    columns: [
      { key: "name", label: "Categoria" },
      { key: "slug", label: "Endereço" },
      { key: "brandId", label: "Marca", type: "brand" },
      { key: "kind", label: "Tipo", type: "badge", options: CATEGORY_KIND_LABELS },
      { key: "sortOrder", label: "Ordem", type: "int" },
      { key: "isActive", label: "Visível", type: "bool" },
    ],
    search: ["name", "slug"],
    orderBy: "sort_order",
    beforeSave: async (tx, v, existing) => {
      v.slug = slugify(String(v.slug || v.name || ""));
      if (!v.slug) throw new AppError("Informe o nome da categoria.");
      if (RESERVED_SLUGS.includes(String(v.slug))) {
        throw new AppError(`"${v.slug}" é um endereço reservado do site.`, "app_error", { slug: "Endereço reservado." });
      }
      if (v.parentId) {
        if (existing && v.parentId === existing.id) throw new AppError("Uma categoria não pode ser mãe dela mesma.");
        await assertCategoryBrand(tx, v.parentId, v.brandId);
      }
      if (existing && existing.brandId !== v.brandId) throw new AppError("Não é possível mover a categoria para outra marca.");
    },
  },
  times: {
    key: "times",
    title: "Times",
    singular: "time",
    description: "Agrupe pessoas da equipe por área ou loja.",
    module: "usuarios",
    table: T.teams as never,
    brandMode: "optional",
    fields: [
      { name: "name", label: "Nome do time", type: "text", required: true },
      { name: "brandId", label: "Marca", type: "brandOptional", help: "Vazio = as duas marcas." },
      { name: "description", label: "Descrição", type: "textarea", wide: true, max: 500 },
    ],
    columns: [
      { key: "name", label: "Time" },
      { key: "brandId", label: "Marca", type: "brand" },
      { key: "description", label: "Descrição" },
    ],
    search: ["name", "description"],
  },
  clientes: {
    key: "clientes",
    title: "Clientes",
    singular: "cliente",
    description: "Cadastro de clientes.",
    module: "clientes",
    table: T.customers as never,
    brandMode: "none",
    fields: [
      { name: "name", label: "Nome", type: "text", required: true, wide: true },
      { name: "phone", label: "Telefone", type: "phone", required: true, max: 30 },
      { name: "whatsapp", label: "WhatsApp", type: "phone", max: 30 },
      { name: "email", label: "E-mail", type: "email" },
      { name: "address", label: "Endereço", type: "text", wide: true, max: 300 },
      { name: "city", label: "Cidade", type: "text" },
      { name: "state", label: "UF", type: "state" },
      { name: "zip", label: "CEP", type: "text", max: 12 },
      { name: "whatsappOptIn", label: "Autorizou mensagens no WhatsApp (opt-in)", type: "checkbox", wide: true },
      { name: "notes", label: "Observações", type: "textarea", wide: true },
    ],
    columns: [],
    search: ["name", "phone", "email"],
    beforeSave: async (_tx, v, existing) => {
      const { normalizePhone } = await import("@/lib/text");
      v.phoneNormalized = normalizePhone(String(v.phone ?? ""));
      if (v.whatsapp) v.whatsapp = normalizePhone(String(v.whatsapp));
      if (v.whatsappOptIn && !existing?.whatsappOptIn) v.optInAt = new Date();
    },
  },
  receitas: {
    key: "receitas",
    feminine: true,
    title: "Entradas",
    singular: "entrada",
    description: "Receitas avulsas. Vendas entram automaticamente quando o pedido é pago.",
    module: "financeiro",
    table: T.financialEntries as never,
    brandMode: "optional",
    fields: [
      { name: "description", label: "Descrição", type: "text", required: true, wide: true },
      { name: "kind", label: "Tipo", type: "select", required: true, options: { outra_receita: ENTRY_KIND_LABELS.outra_receita }, defaultValue: "outra_receita" },
      { name: "amount", label: "Valor (R$)", type: "money", required: true },
      { name: "occurredOn", label: "Data", type: "date", required: true },
      { name: "brandId", label: "Marca", type: "brandOptional", help: "Vazio = geral." },
      { name: "paymentMethod", label: "Forma de recebimento", type: "select", options: PAYMENT_METHOD_LABELS },
      { name: "category", label: "Categoria", type: "text", max: 60 },
    ],
    columns: [],
    search: ["description"],
    createdByColumn: "createdBy",
    beforeSave: async (_tx, v) => {
      if (!(Number(v.amount) > 0)) throw new AppError("O valor deve ser maior que zero.", "app_error", { amount: "Valor inválido." });
    },
    locked: (row) => (row.orderId ? "Lançamento gerado por um pedido. Altere o status do pedido para ajustar." : null),
  },
  despesas: {
    key: "despesas",
    feminine: true,
    title: "Saídas",
    singular: "saída",
    description: "Compras, fornecedores, fretes, despesas operacionais e marketing.",
    module: "financeiro",
    table: T.financialExpenses as never,
    brandMode: "optional",
    fields: [
      { name: "description", label: "Descrição", type: "text", required: true, wide: true },
      { name: "category", label: "Categoria", type: "select", required: true, options: EXPENSE_CATEGORY_LABELS },
      { name: "amount", label: "Valor (R$)", type: "money", required: true },
      { name: "occurredOn", label: "Data", type: "date", required: true },
      { name: "brandId", label: "Marca", type: "brandOptional", help: "Vazio = despesa geral." },
      { name: "supplierId", label: "Fornecedor", type: "supplier" },
    ],
    columns: [],
    search: ["description"],
    createdByColumn: "createdBy",
    beforeSave: async (_tx, v) => {
      if (!(Number(v.amount) > 0)) throw new AppError("O valor deve ser maior que zero.", "app_error", { amount: "Valor inválido." });
    },
    locked: (row) => (row.inventoryMovementId ? "Lançamento gerado por uma entrada de estoque." : null),
  },
};

export function getResource(key: string): ResourceDef {
  const def = RESOURCES[key];
  if (!def) throw notFound("Cadastro não encontrado.");
  return def;
}

function col(def: ResourceDef, name: string) {
  return (def.table as unknown as Record<string, Parameters<typeof eq>[0]>)[name];
}

export async function getResourceRow(def: ResourceDef, id: string) {
  const db = await getDb();
  const conds: SQL[] = [eq(col(def, "id"), id)];
  if (col(def, "deletedAt")) conds.push(isNull(col(def, "deletedAt")));
  const [row] = await db.select().from(def.table).where(and(...conds)).limit(1);
  return (row as Record<string, unknown>) ?? null;
}

export async function listResource(
  def: ResourceDef,
  auth: AuthContext,
  opts: { q?: string | null; brandId?: string | null; filters?: Record<string, string | null>; page?: number; perPage?: number },
) {
  const db = await getDb();
  const perPage = opts.perPage ?? 25;
  const page = Math.max(opts.page ?? 1, 1);
  const t = def.table as unknown as { [k: string]: unknown };
  const tableName = (def.table as unknown as { [k: symbol]: string })[Symbol.for("drizzle:Name")];
  const conds: SQL[] = [];
  if (t.deletedAt) conds.push(sql`deleted_at is null`);
  if (def.brandMode !== "none") {
    conds.push(brandSql(sql.raw("brand_id"), brandScope(auth.perms, def.module), opts.brandId, def.brandMode === "optional"));
  }
  if (opts.q && def.search.length) {
    const term = likeTerm(opts.q);
    conds.push(sql`(${sql.join(def.search.map((c) => sql`coalesce(${sql.raw(c)}::text, '') ilike ${term}`), sql` or `)})`);
  }
  for (const f of def.filters ?? []) {
    const v = opts.filters?.[f.name];
    if (v && v in f.options) conds.push(sql`${sql.raw(f.name.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`))} = ${v}`);
  }
  const where = conds.length ? sql`where ${sql.join(conds, sql` and `)}` : sql``;
  const order = def.orderBy ? sql.raw(`${def.orderBy}, created_at desc`) : sql.raw("created_at desc");
  const res = await db.execute(
    sql`select *, count(*) over()::int as __total from ${sql.raw(`public.${tableName}`)} ${where} order by ${order} limit ${perPage} offset ${(page - 1) * perPage}`,
  );
  const { rowsOf } = await import("./db");
  const raw = rowsOf<Record<string, unknown>>(res);
  const total = Number(raw[0]?.__total ?? 0);
  // snake_case → camelCase para casar com os nomes dos campos
  const rows = raw.map((r) =>
    Object.fromEntries(Object.entries(r).filter(([k]) => k !== "__total").map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v])),
  );
  return { rows, total, page, perPage, pages: Math.max(1, Math.ceil(total / perPage)) };
}

export async function saveResource(def: ResourceDef, auth: AuthContext, id: string | null, raw: Record<string, unknown>) {
  const parsed = resourceSchema(def).parse(raw) as Record<string, unknown>;
  const values = toDbValues(def, parsed);
  const brandId = (values.brandId as string | null | undefined) ?? null;
  if (def.brandMode === "required" && !brandId) throw new AppError("Escolha a marca.", "app_error", { brandId: "Obrigatório." });
  const actor = { id: auth.user.id, fullName: auth.user.fullName, email: auth.user.email };

  return write(async (tx) => {
    let existing: Record<string, unknown> | null = null;
    if (id) {
      existing = await getResourceRow(def, id);
      if (!existing) throw notFound();
      const lock = def.locked?.(existing);
      if (lock) throw new AppError(lock, "conflict");
      // Precisa poder editar na marca de origem E na de destino.
      assertCan(auth.perms, def.module, "editar", def.brandMode === "none" ? null : ((existing.brandId as string | null) ?? null));
    }
    assertCan(auth.perms, def.module, id ? "editar" : "criar", def.brandMode === "none" ? null : brandId);
    await def.beforeSave?.(tx, values, existing);

    const table = def.table;
    if (existing) {
      await tx.update(table).set(values as never).where(eq(col(def, "id"), id!));
      const d = diff(existing, values);
      await audit(tx, actor, {
        action: `${def.key}.editar`,
        entity: tableNameOf(def),
        entityId: id,
        brandId: brandId ?? ((existing.brandId as string | null) ?? null),
        before: d.before,
        after: d.after,
      });
      return { id: id! };
    }
    const insertValues = { ...values, ...(def.createdByColumn ? { [def.createdByColumn]: auth.user.id } : {}) };
    const [created] = (await tx.insert(table).values(insertValues as never).returning()) as Record<string, unknown>[];
    await audit(tx, actor, {
      action: `${def.key}.criar`,
      entity: tableNameOf(def),
      entityId: String(created.id),
      brandId,
      after: values,
    });
    return { id: String(created.id) };
  });
}

export async function deleteResource(def: ResourceDef, auth: AuthContext, id: string, reason: string) {
  const actor = { id: auth.user.id, fullName: auth.user.fullName, email: auth.user.email };
  await write(async (tx) => {
    const existing = await getResourceRow(def, id);
    if (!existing) throw notFound();
    const lock = def.locked?.(existing);
    if (lock) throw new AppError(lock, "conflict");
    assertCan(auth.perms, def.module, "excluir", def.brandMode === "none" ? null : ((existing.brandId as string | null) ?? null));
    if (def.key === "categorias") {
      const [{ n }] = (await tx.execute(
        sql`select count(*)::int as n from public.products where (category_id = ${id} or subcategory_id = ${id}) and deleted_at is null`,
      ).then((r) => (Array.isArray(r) ? r : (r as { rows: unknown[] }).rows))) as { n: number }[];
      if (Number(n) > 0) throw new AppError(`Esta categoria tem ${n} produto(s). Mova-os antes de excluir.`, "conflict");
    }
    if (col(def, "deletedAt") && !def.hardDelete) {
      await tx.update(def.table).set({ deletedAt: new Date() } as never).where(eq(col(def, "id"), id));
    } else {
      await tx.delete(def.table).where(eq(col(def, "id"), id));
    }
    await audit(tx, actor, {
      action: `${def.key}.excluir`,
      entity: tableNameOf(def),
      entityId: id,
      brandId: (existing.brandId as string | null) ?? null,
      before: existing,
      reason,
    });
  });
}

function tableNameOf(def: ResourceDef): string {
  return (def.table as unknown as { [k: symbol]: string })[Symbol.for("drizzle:Name")];
}

/** Opções para selects de formulários (marcas, fornecedores, categorias, usuários). */
export async function formOptions(auth: AuthContext, module: Module) {
  const db = await getDb();
  const scope = brandScope(auth.perms, module, "visualizar");
  const brands = (await db.select().from(T.brands).orderBy(T.brands.sortOrder)).filter(
    (b) => scope === "all" || scope.includes(b.id),
  );
  const [suppliers, categories, users] = await Promise.all([
    db
      .select({ id: T.suppliers.id, name: T.suppliers.name, brandId: T.suppliers.brandId })
      .from(T.suppliers)
      .where(isNull(T.suppliers.deletedAt))
      .orderBy(T.suppliers.name),
    db
      .select({ id: T.categories.id, name: T.categories.name, brandId: T.categories.brandId, kind: T.categories.kind })
      .from(T.categories)
      .where(isNull(T.categories.deletedAt))
      .orderBy(T.categories.sortOrder),
    db
      .select({ id: T.users.id, name: T.users.fullName })
      .from(T.users)
      .where(and(isNull(T.users.deletedAt), eq(T.users.status, "ativo")))
      .orderBy(T.users.fullName),
  ]);
  return {
    brands: brands.map((b) => ({ id: b.id, name: b.name })),
    suppliers,
    categories: categories.filter((c) => scope === "all" || scope.includes(c.brandId)),
    users,
  };
}
export type FormOptions = Awaited<ReturnType<typeof formOptions>>;


export function newLabel(def: Pick<ResourceDef, "singular" | "feminine">) {
  return `${def.feminine ? "Nova" : "Novo"} ${def.singular}`;
}
