/**
 * Espelho tipado (Drizzle) do esquema SQL em supabase/migrations.
 * A fonte da verdade é o SQL; este arquivo só descreve as tabelas para
 * consultas tipadas. Ao alterar uma migration, atualize aqui também.
 */
import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  bigint,
  numeric,
  timestamp,
  date,
  jsonb,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const money = (name: string) => numeric(name, { precision: 12, scale: 2 });

const timestamps = {
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
};

export const brands = pgTable("brands", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  audience: text("audience"),
  positioning: text("positioning"),
  orderPrefix: text("order_prefix").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  fullName: text("full_name").notNull(),
  nickname: text("nickname"),
  email: text("email").notNull(),
  phone: text("phone"),
  whatsapp: text("whatsapp"),
  photoUrl: text("photo_url"),
  cpfHash: text("cpf_hash"),
  cpfLastDigits: text("cpf_last_digits"),
  birthDate: date("birth_date"),
  passwordHash: text("password_hash"),
  status: text("status").notNull().default("pendente"),
  isOwner: boolean("is_owner").notNull().default(false),
  admissionDate: date("admission_date"),
  jobTitle: text("job_title"),
  notes: text("notes"),
  mfaRequired: boolean("mfa_required").notNull().default(false),
  suspendedUntil: ts("suspended_until"),
  createdBy: uuid("created_by"),
  lastAccessAt: ts("last_access_at"),
  isDemo: boolean("is_demo").notNull().default(false),
  ...timestamps,
  deletedAt: ts("deleted_at"),
});

export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  defaultScope: text("default_scope"),
  isSystem: boolean("is_system").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: uuid("created_by"),
  ...timestamps,
  deletedAt: ts("deleted_at"),
});

export const permissions = pgTable("permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  module: text("module").notNull(),
  action: text("action").notNull(),
  description: text("description"),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id").notNull(),
    permissionId: uuid("permission_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

export const userRoles = pgTable("user_roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  roleId: uuid("role_id").notNull(),
  brandId: uuid("brand_id"),
  createdBy: uuid("created_by"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const userPermissions = pgTable("user_permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  permissionId: uuid("permission_id").notNull(),
  brandId: uuid("brand_id"),
  createdBy: uuid("created_by"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  brandId: uuid("brand_id"),
  isDemo: boolean("is_demo").notNull().default(false),
  ...timestamps,
  deletedAt: ts("deleted_at"),
});

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id").notNull(),
    userId: uuid("user_id").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] })],
);

export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  fullName: text("full_name"),
  jobTitle: text("job_title"),
  roleId: uuid("role_id").notNull(),
  brandId: uuid("brand_id"),
  tokenHash: text("token_hash").notNull(),
  status: text("status").notNull().default("pendente"),
  expiresAt: ts("expires_at").notNull(),
  acceptedAt: ts("accepted_at"),
  acceptedUserId: uuid("accepted_user_id"),
  invitedBy: uuid("invited_by"),
  ...timestamps,
});

export const passwordResets = pgTable("password_resets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdBy: uuid("created_by"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: ts("created_at").notNull().defaultNow(),
  lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
  expiresAt: ts("expires_at").notNull(),
  revokedAt: ts("revoked_at"),
});

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  hits: integer("hits").notNull().default(0),
  windowStartedAt: ts("window_started_at").notNull().defaultNow(),
});

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id").notNull(),
  parentId: uuid("parent_id"),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  kind: text("kind").notNull().default("padrao"),
  imageUrl: text("image_url"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  isDemo: boolean("is_demo").notNull().default(false),
  ...timestamps,
  deletedAt: ts("deleted_at"),
});

export const suppliers = pgTable("suppliers", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id"),
  name: text("name").notNull(),
  document: text("document"),
  contactName: text("contact_name"),
  phone: text("phone"),
  whatsapp: text("whatsapp"),
  email: text("email"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  isDemo: boolean("is_demo").notNull().default(false),
  createdBy: uuid("created_by"),
  ...timestamps,
  deletedAt: ts("deleted_at"),
});

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id").notNull(),
  categoryId: uuid("category_id"),
  subcategoryId: uuid("subcategory_id"),
  sku: text("sku").notNull(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  shortDescription: text("short_description"),
  longDescription: text("long_description"),
  costPrice: money("cost_price"),
  salePrice: money("sale_price").notNull(),
  promoPrice: money("promo_price"),
  marginPercent: numeric("margin_percent", { precision: 7, scale: 2 }),
  material: text("material"),
  supplierId: uuid("supplier_id"),
  minStock: integer("min_stock").notNull().default(0),
  videoUrl: text("video_url"),
  status: text("status").notNull().default("rascunho"),
  isNew: boolean("is_new").notNull().default(false),
  isFeatured: boolean("is_featured").notNull().default(false),
  tags: text("tags"),
  quantitySold: integer("quantity_sold").notNull().default(0),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  createdBy: uuid("created_by"),
  updatedBy: uuid("updated_by"),
  isDemo: boolean("is_demo").notNull().default(false),
  ...timestamps,
  deletedAt: ts("deleted_at"),
});

export const productVariants = pgTable("product_variants", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull(),
  brandId: uuid("brand_id").notNull(),
  size: text("size"),
  color: text("color"),
  colorHex: text("color_hex"),
  sku: text("sku").notNull(),
  priceOverride: money("price_override"),
  minStock: integer("min_stock").notNull().default(0),
  weightGrams: integer("weight_grams"),
  dimensions: text("dimensions"),
  imageUrl: text("image_url"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  isDemo: boolean("is_demo").notNull().default(false),
  ...timestamps,
  deletedAt: ts("deleted_at"),
});

export const productImages = pgTable("product_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull(),
  url: text("url").notNull(),
  alt: text("alt"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const inventory = pgTable(
  "inventory",
  {
    variantId: uuid("variant_id").notNull(),
    location: text("location").notNull().default("principal"),
    quantity: integer("quantity").notNull().default(0),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.variantId, t.location] })],
);

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  phone: text("phone"),
  phoneNormalized: text("phone_normalized"),
  whatsapp: text("whatsapp"),
  email: text("email"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  notes: text("notes"),
  whatsappOptIn: boolean("whatsapp_opt_in").notNull().default(false),
  optInAt: ts("opt_in_at"),
  isDemo: boolean("is_demo").notNull().default(false),
  ...timestamps,
  deletedAt: ts("deleted_at"),
});

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id").notNull(),
  number: bigint("number", { mode: "number" })
    .notNull()
    .default(sql`nextval('public.order_number_seq')`),
  customerId: uuid("customer_id"),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  customerWhatsapp: text("customer_whatsapp"),
  customerEmail: text("customer_email"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  notes: text("notes"),
  subtotal: money("subtotal").notNull(),
  discount: money("discount").notNull().default("0"),
  shipping: money("shipping").notNull().default("0"),
  shippingLabel: text("shipping_label"),
  total: money("total").notNull(),
  paymentMethod: text("payment_method"),
  status: text("status").notNull().default("pedido_recebido"),
  deliveryMethod: text("delivery_method").notNull().default("link"),
  whatsappUrl: text("whatsapp_url"),
  stockCommitted: boolean("stock_committed").notNull().default(false),
  revenueRegistered: boolean("revenue_registered").notNull().default(false),
  source: text("source").notNull().default("loja"),
  idempotencyKey: text("idempotency_key"),
  createdBy: uuid("created_by"),
  updatedBy: uuid("updated_by"),
  isDemo: boolean("is_demo").notNull().default(false),
  ...timestamps,
  deletedAt: ts("deleted_at"),
});

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull(),
  productId: uuid("product_id"),
  variantId: uuid("variant_id"),
  productName: text("product_name").notNull(),
  sku: text("sku"),
  size: text("size"),
  color: text("color"),
  quantity: integer("quantity").notNull(),
  unitPrice: money("unit_price").notNull(),
  unitCost: money("unit_cost"),
  total: money("total").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const orderStatusHistory = pgTable("order_status_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  note: text("note"),
  changedBy: uuid("changed_by"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const inventoryMovements = pgTable("inventory_movements", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id").notNull(),
  productId: uuid("product_id").notNull(),
  variantId: uuid("variant_id").notNull(),
  location: text("location").notNull().default("principal"),
  type: text("type").notNull(),
  quantity: integer("quantity").notNull(),
  balanceBefore: integer("balance_before").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  unitCost: money("unit_cost"),
  totalCost: money("total_cost"),
  supplierId: uuid("supplier_id"),
  orderId: uuid("order_id"),
  reason: text("reason"),
  notes: text("notes"),
  responsibleUserId: uuid("responsible_user_id"),
  occurredAt: ts("occurred_at").notNull().defaultNow(),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const financialEntries = pgTable("financial_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id"),
  kind: text("kind").notNull(),
  description: text("description").notNull(),
  amount: money("amount").notNull(),
  occurredOn: date("occurred_on").notNull(),
  orderId: uuid("order_id"),
  paymentMethod: text("payment_method"),
  category: text("category"),
  createdBy: uuid("created_by"),
  isDemo: boolean("is_demo").notNull().default(false),
  ...timestamps,
  deletedAt: ts("deleted_at"),
});

export const financialExpenses = pgTable("financial_expenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id"),
  category: text("category").notNull(),
  description: text("description").notNull(),
  amount: money("amount").notNull(),
  occurredOn: date("occurred_on").notNull(),
  supplierId: uuid("supplier_id"),
  inventoryMovementId: uuid("inventory_movement_id"),
  createdBy: uuid("created_by"),
  isDemo: boolean("is_demo").notNull().default(false),
  ...timestamps,
  deletedAt: ts("deleted_at"),
});

export const whatsappTemplates = pgTable("whatsapp_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id"),
  key: text("key").notNull(),
  name: text("name").notNull(),
  body: text("body").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  updatedBy: uuid("updated_by"),
  ...timestamps,
});

export const whatsappMessagesLog = pgTable("whatsapp_messages_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id"),
  orderId: uuid("order_id"),
  customerId: uuid("customer_id"),
  toNumber: text("to_number"),
  templateKey: text("template_key"),
  body: text("body").notNull(),
  deliveryMethod: text("delivery_method").notNull(),
  status: text("status").notNull(),
  providerMessageId: text("provider_message_id"),
  error: text("error"),
  createdBy: uuid("created_by"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const automations = pgTable("automations", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id"),
  triggerEvent: text("trigger_event").notNull(),
  templateKey: text("template_key").notNull(),
  isEnabled: boolean("is_enabled").notNull().default(false),
  requireOptIn: boolean("require_opt_in").notNull().default(true),
  delayMinutes: integer("delay_minutes").notNull().default(0),
  notes: text("notes"),
  updatedBy: uuid("updated_by"),
  ...timestamps,
});

export const banners = pgTable("banners", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id").notNull(),
  placement: text("placement").notNull(),
  title: text("title"),
  subtitle: text("subtitle"),
  ctaLabel: text("cta_label"),
  imageUrl: text("image_url"),
  linkUrl: text("link_url"),
  categoryId: uuid("category_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  startsAt: ts("starts_at"),
  endsAt: ts("ends_at"),
  publishedBy: uuid("published_by"),
  isDemo: boolean("is_demo").notNull().default(false),
  ...timestamps,
  deletedAt: ts("deleted_at"),
});

export const cmsContent = pgTable("cms_content", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id"),
  key: text("key").notNull(),
  value: jsonb("value").notNull().$type<Record<string, unknown>>(),
  publishedBy: uuid("published_by"),
  ...timestamps,
});

export const ideas = pgTable("ideas", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id"),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category"),
  priority: text("priority").notNull().default("media"),
  status: text("status").notNull().default("ideia"),
  responsibleUserId: uuid("responsible_user_id"),
  ideaDate: date("idea_date").notNull(),
  notes: text("notes"),
  createdBy: uuid("created_by"),
  isDemo: boolean("is_demo").notNull().default(false),
  ...timestamps,
  deletedAt: ts("deleted_at"),
});

export const plannedProducts = pgTable("planned_products", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id").notNull(),
  name: text("name").notNull(),
  categoryId: uuid("category_id"),
  supplierId: uuid("supplier_id"),
  estimatedCost: money("estimated_cost"),
  estimatedPrice: money("estimated_price"),
  plannedQuantity: integer("planned_quantity"),
  notes: text("notes"),
  status: text("status").notNull().default("pesquisa"),
  createdBy: uuid("created_by"),
  isDemo: boolean("is_demo").notNull().default(false),
  ...timestamps,
  deletedAt: ts("deleted_at"),
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorUserId: uuid("actor_user_id"),
  actorName: text("actor_name"),
  actorEmail: text("actor_email"),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  brandId: uuid("brand_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  reason: text("reason"),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const analyticsEvents = pgTable("analytics_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id"),
  visitorId: text("visitor_id"),
  type: text("type").notNull(),
  productId: uuid("product_id"),
  orderId: uuid("order_id"),
  value: money("value"),
  path: text("path"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull().$type<Record<string, unknown>>(),
  updatedBy: uuid("updated_by"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export type Brand = typeof brands.$inferSelect;
export type User = typeof users.$inferSelect;
export type Role = typeof roles.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Supplier = typeof suppliers.$inferSelect;
export type Product = typeof products.$inferSelect;
export type ProductVariant = typeof productVariants.$inferSelect;
export type ProductImage = typeof productImages.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type Banner = typeof banners.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
