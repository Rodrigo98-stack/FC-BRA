-- =============================================================================
-- FC-BRA · FINA CLÁSSICA + BRAVUS
-- Migration 0001 — esquema principal
--
-- Compatível com PostgreSQL 15+ (Supabase) e PGlite (banco embutido do modo
-- demonstração). Não depende de extensões: gen_random_uuid() é nativo.
--
-- Convenções:
--   * brand_id em toda entidade comercialmente relevante (§1.2)
--   * created_at / updated_at em todas as tabelas mutáveis
--   * deleted_at = soft delete (§28.7)
--   * is_demo = registros fictícios marcados explicitamente (§38)
-- =============================================================================

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Marcas
-- -----------------------------------------------------------------------------
create table public.brands (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name          text not null,
  audience      text,
  positioning   text,
  order_prefix  text not null unique check (order_prefix ~ '^[A-Z]{2,4}$'),
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Usuários, papéis e permissões (RBAC — §35)
-- -----------------------------------------------------------------------------
create table public.users (
  id               uuid primary key default gen_random_uuid(),
  full_name        text not null check (length(full_name) between 2 and 160),
  nickname         text,
  email            text not null check (position('@' in email) > 1),
  phone            text,
  whatsapp         text,
  photo_url        text,
  cpf_hash         text,              -- CPF nunca em texto puro (§26)
  cpf_last_digits  text check (cpf_last_digits ~ '^[0-9]{2}$'),
  birth_date       date,
  password_hash    text,              -- scrypt (formato: scrypt$N$r$p$salt$hash)
  status           text not null default 'pendente'
                   check (status in ('ativo', 'inativo', 'suspenso', 'pendente')),
  is_owner         boolean not null default false,   -- ADMINISTRADOR_PRINCIPAL
  admission_date   date,
  job_title        text,
  notes            text,
  mfa_required     boolean not null default false,
  suspended_until  timestamptz,
  created_by       uuid references public.users(id) on delete set null,
  last_access_at   timestamptz,
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create unique index users_email_unique on public.users (lower(email)) where deleted_at is null;
-- Só pode existir um ADMINISTRADOR_PRINCIPAL ativo.
create unique index users_single_owner on public.users (is_owner) where is_owner and deleted_at is null;
create index users_status_idx on public.users (status) where deleted_at is null;

create table public.roles (
  id             uuid primary key default gen_random_uuid(),
  key            text not null unique check (key ~ '^[A-Z0-9_]+$'),
  name           text not null,
  description    text,
  default_scope  text,
  is_system      boolean not null default false,   -- papéis padrão: não podem ser excluídos
  is_active      boolean not null default true,
  created_by     uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create table public.permissions (
  id           uuid primary key default gen_random_uuid(),
  module       text not null check (module ~ '^[a-z_]+$'),
  action       text not null check (action in ('visualizar', 'criar', 'editar', 'excluir', 'exportar',
                                                'aprovar', 'configurar', 'convidar', 'revogar')),
  description  text,
  unique (module, action)
);

create table public.role_permissions (
  role_id        uuid not null references public.roles(id) on delete cascade,
  permission_id  uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

-- Atribuição de papel com escopo de marca: brand_id NULL = todas as marcas.
create table public.user_roles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  role_id     uuid not null references public.roles(id),
  brand_id    uuid references public.brands(id),
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create unique index user_roles_unique
  on public.user_roles (user_id, role_id, coalesce(brand_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index user_roles_user_idx on public.user_roles (user_id);

-- Permissões customizadas por usuário (papel PERSONALIZADO).
create table public.user_permissions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade,
  permission_id  uuid not null references public.permissions(id) on delete cascade,
  brand_id       uuid references public.brands(id),
  created_by     uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create unique index user_permissions_unique
  on public.user_permissions (user_id, permission_id, coalesce(brand_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table public.teams (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  brand_id     uuid references public.brands(id),
  is_demo      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create table public.team_members (
  team_id     uuid not null references public.teams(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table public.invitations (
  id                uuid primary key default gen_random_uuid(),
  email             text not null,
  full_name         text,
  job_title         text,
  role_id           uuid not null references public.roles(id),
  brand_id          uuid references public.brands(id),
  token_hash        text not null unique,
  status            text not null default 'pendente'
                    check (status in ('pendente', 'aceito', 'expirado', 'revogado')),
  expires_at        timestamptz not null,
  accepted_at       timestamptz,
  accepted_user_id  uuid references public.users(id) on delete set null,
  invited_by        uuid references public.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index invitations_status_idx on public.invitations (status);

create table public.password_resets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  token_hash    text not null unique,     -- token bruto só existe no cookie httpOnly
  ip            text,
  user_agent    text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  expires_at    timestamptz not null,
  revoked_at    timestamptz
);
create index sessions_user_idx on public.sessions (user_id) where revoked_at is null;

create table public.rate_limits (
  key                text primary key,
  hits               integer not null default 0,
  window_started_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Catálogo
-- -----------------------------------------------------------------------------
create table public.categories (
  id               uuid primary key default gen_random_uuid(),
  brand_id         uuid not null references public.brands(id),
  parent_id        uuid references public.categories(id) on delete set null,
  slug             text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name             text not null,
  description      text,
  kind             text not null default 'padrao' check (kind in ('padrao', 'novidades', 'promocoes')),
  image_url        text,
  sort_order       integer not null default 0,
  is_active        boolean not null default true,
  seo_title        text,
  seo_description  text,
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create unique index categories_brand_slug on public.categories (brand_id, slug) where deleted_at is null;
create index categories_brand_idx on public.categories (brand_id, sort_order) where deleted_at is null;

create table public.suppliers (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid references public.brands(id),        -- NULL = atende as duas marcas
  name          text not null,
  document      text,
  contact_name  text,
  phone         text,
  whatsapp      text,
  email         text,
  address       text,
  city          text,
  state         text check (state is null or state ~ '^[A-Z]{2}$'),
  notes         text,
  is_active     boolean not null default true,
  is_demo       boolean not null default false,
  created_by    uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index suppliers_name_idx on public.suppliers (lower(name)) where deleted_at is null;

create table public.products (
  id                 uuid primary key default gen_random_uuid(),
  brand_id           uuid not null references public.brands(id),
  category_id        uuid references public.categories(id) on delete set null,
  subcategory_id     uuid references public.categories(id) on delete set null,
  sku                text not null,
  slug               text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name               text not null,
  short_description  text,
  long_description   text,
  cost_price         numeric(12,2) check (cost_price is null or cost_price >= 0),
  sale_price         numeric(12,2) not null check (sale_price >= 0),
  promo_price        numeric(12,2) check (promo_price is null or (promo_price >= 0 and promo_price < sale_price)),
  margin_percent     numeric(7,2) generated always as (
                       case
                         when cost_price is null or coalesce(promo_price, sale_price) <= 0 then null
                         else round(((coalesce(promo_price, sale_price) - cost_price) / coalesce(promo_price, sale_price)) * 100, 2)
                       end
                     ) stored,
  material           text,
  supplier_id        uuid references public.suppliers(id) on delete set null,
  min_stock          integer not null default 0 check (min_stock >= 0),
  video_url          text,
  status             text not null default 'rascunho' check (status in ('ativo', 'inativo', 'rascunho')),
  is_new             boolean not null default false,
  is_featured        boolean not null default false,
  tags               text,
  quantity_sold      integer not null default 0 check (quantity_sold >= 0),
  seo_title          text,
  seo_description    text,
  created_by         uuid references public.users(id) on delete set null,
  updated_by         uuid references public.users(id) on delete set null,
  is_demo            boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);
create unique index products_brand_sku on public.products (brand_id, sku) where deleted_at is null;
create unique index products_brand_slug on public.products (brand_id, slug) where deleted_at is null;
create index products_brand_status_idx on public.products (brand_id, status) where deleted_at is null;
create index products_category_idx on public.products (category_id) where deleted_at is null;
create index products_name_idx on public.products (lower(name));
create index products_created_idx on public.products (brand_id, created_at desc);

create table public.product_variants (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references public.products(id) on delete cascade,
  brand_id        uuid not null references public.brands(id),
  size            text,
  color           text,
  color_hex       text check (color_hex is null or color_hex ~ '^#[0-9a-fA-F]{6}$'),
  sku             text not null,
  price_override  numeric(12,2) check (price_override is null or price_override >= 0),
  min_stock       integer not null default 0 check (min_stock >= 0),
  weight_grams    integer check (weight_grams is null or weight_grams >= 0),
  dimensions      text,
  image_url       text,
  is_active       boolean not null default true,
  sort_order      integer not null default 0,
  is_demo         boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create unique index product_variants_brand_sku on public.product_variants (brand_id, sku) where deleted_at is null;
create index product_variants_product_idx on public.product_variants (product_id) where deleted_at is null;

create table public.product_images (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  url         text not null,
  alt         text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);
create index product_images_product_idx on public.product_images (product_id, sort_order);

-- Saldo por variação e local (preparado para multi-CD — §13).
create table public.inventory (
  variant_id  uuid not null references public.product_variants(id) on delete cascade,
  location    text not null default 'principal',
  quantity    integer not null default 0 check (quantity >= 0),
  updated_at  timestamptz not null default now(),
  primary key (variant_id, location)
);

-- -----------------------------------------------------------------------------
-- Clientes e pedidos
-- -----------------------------------------------------------------------------
create table public.customers (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  phone             text,
  phone_normalized  text,
  whatsapp          text,
  email             text,
  address           text,
  city              text,
  state             text check (state is null or state ~ '^[A-Z]{2}$'),
  zip               text,
  notes             text,
  whatsapp_opt_in   boolean not null default false,
  opt_in_at         timestamptz,
  is_demo           boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create unique index customers_phone_unique on public.customers (phone_normalized)
  where deleted_at is null and phone_normalized is not null;
create index customers_name_idx on public.customers (lower(name)) where deleted_at is null;

create sequence public.order_number_seq start 1;

create table public.orders (
  id                  uuid primary key default gen_random_uuid(),
  brand_id            uuid not null references public.brands(id),
  number              bigint not null unique default nextval('public.order_number_seq'),
  customer_id         uuid references public.customers(id) on delete set null,
  customer_name       text not null,
  customer_phone      text not null,
  customer_whatsapp   text,
  customer_email      text,
  address             text,
  city                text,
  state               text,
  zip                 text,
  notes               text,
  subtotal            numeric(12,2) not null check (subtotal >= 0),
  discount            numeric(12,2) not null default 0 check (discount >= 0),
  shipping            numeric(12,2) not null default 0 check (shipping >= 0),
  shipping_label      text,
  total               numeric(12,2) not null check (total >= 0),
  payment_method      text,
  status              text not null default 'pedido_recebido' check (status in (
                        'carrinho_abandonado', 'aguardando_confirmacao', 'pedido_recebido',
                        'aguardando_pagamento', 'pago', 'em_preparacao', 'enviado',
                        'entregue', 'cancelado', 'devolvido')),
  delivery_method     text not null default 'link' check (delivery_method in ('link', 'api')),
  whatsapp_url        text,
  stock_committed     boolean not null default false,
  revenue_registered  boolean not null default false,
  source              text not null default 'loja' check (source in ('loja', 'painel')),
  idempotency_key     text unique,
  created_by          uuid references public.users(id) on delete set null,
  updated_by          uuid references public.users(id) on delete set null,
  is_demo             boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);
create index orders_brand_created_idx on public.orders (brand_id, created_at desc) where deleted_at is null;
create index orders_status_idx on public.orders (status) where deleted_at is null;
create index orders_customer_idx on public.orders (customer_id);

create table public.order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  product_id    uuid references public.products(id) on delete set null,
  variant_id    uuid references public.product_variants(id) on delete set null,
  product_name  text not null,
  sku           text,
  size          text,
  color         text,
  quantity      integer not null check (quantity > 0),
  unit_price    numeric(12,2) not null check (unit_price >= 0),
  unit_cost     numeric(12,2) check (unit_cost is null or unit_cost >= 0),   -- snapshot p/ CMV
  total         numeric(12,2) not null check (total >= 0),
  created_at    timestamptz not null default now()
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);

create table public.order_status_history (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  from_status  text,
  to_status    text not null,
  note         text,
  changed_by   uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index order_status_history_order_idx on public.order_status_history (order_id, created_at);

-- Toda movimentação de estoque gera histórico (§13, §28.5).
create table public.inventory_movements (
  id                   uuid primary key default gen_random_uuid(),
  brand_id             uuid not null references public.brands(id),
  product_id           uuid not null references public.products(id),
  variant_id           uuid not null references public.product_variants(id),
  location             text not null default 'principal',
  type                 text not null check (type in ('cadastro', 'entrada', 'saida', 'ajuste', 'transferencia',
                                                      'perda', 'devolucao', 'inventario', 'venda', 'cancelamento')),
  quantity             integer not null,   -- delta com sinal
  balance_before       integer not null,
  balance_after        integer not null check (balance_after >= 0),
  unit_cost            numeric(12,2),
  total_cost           numeric(12,2),
  supplier_id          uuid references public.suppliers(id) on delete set null,
  order_id             uuid references public.orders(id) on delete set null,
  reason               text,
  notes                text,
  responsible_user_id  uuid references public.users(id) on delete set null,
  occurred_at          timestamptz not null default now(),
  is_demo              boolean not null default false,
  created_at           timestamptz not null default now()
);
create index inventory_movements_variant_idx on public.inventory_movements (variant_id, created_at desc);
create index inventory_movements_brand_idx on public.inventory_movements (brand_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Financeiro
-- -----------------------------------------------------------------------------
create table public.financial_entries (
  id              uuid primary key default gen_random_uuid(),
  brand_id        uuid references public.brands(id),
  kind            text not null check (kind in ('venda', 'outra_receita', 'estorno')),
  description     text not null,
  amount          numeric(12,2) not null check ((kind = 'estorno' and amount < 0) or (kind <> 'estorno' and amount > 0)),
  occurred_on     date not null default current_date,
  order_id        uuid references public.orders(id) on delete set null,
  payment_method  text,
  category        text,
  created_by      uuid references public.users(id) on delete set null,   -- lancado_por
  is_demo         boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index financial_entries_period_idx on public.financial_entries (brand_id, occurred_on) where deleted_at is null;

create table public.financial_expenses (
  id                     uuid primary key default gen_random_uuid(),
  brand_id               uuid references public.brands(id),
  category               text not null check (category in ('compra_produtos', 'fornecedores', 'fretes',
                                                           'despesas_operacionais', 'marketing', 'outros')),
  description            text not null,
  amount                 numeric(12,2) not null check (amount > 0),
  occurred_on            date not null default current_date,
  supplier_id            uuid references public.suppliers(id) on delete set null,
  inventory_movement_id  uuid references public.inventory_movements(id) on delete set null,
  created_by             uuid references public.users(id) on delete set null,
  is_demo                boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  deleted_at             timestamptz
);
create index financial_expenses_period_idx on public.financial_expenses (brand_id, occurred_on) where deleted_at is null;

-- -----------------------------------------------------------------------------
-- WhatsApp e automações (§9, §20)
-- -----------------------------------------------------------------------------
create table public.whatsapp_templates (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid references public.brands(id),    -- NULL = modelo geral
  key         text not null check (key in ('checkout', 'pedido_recebido', 'pagamento_confirmado',
                                           'pedido_enviado', 'pedido_entregue', 'pos_venda', 'estoque_baixo')),
  name        text not null,
  body        text not null,
  is_active   boolean not null default true,
  updated_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index whatsapp_templates_unique
  on public.whatsapp_templates (coalesce(brand_id, '00000000-0000-0000-0000-000000000000'::uuid), key);

create table public.whatsapp_messages_log (
  id                   uuid primary key default gen_random_uuid(),
  brand_id             uuid references public.brands(id),
  order_id             uuid references public.orders(id) on delete set null,
  customer_id          uuid references public.customers(id) on delete set null,
  to_number            text,
  template_key         text,
  body                 text not null,
  delivery_method      text not null check (delivery_method in ('link', 'api')),
  status               text not null check (status in ('gerado', 'enviado', 'falhou')),
  provider_message_id  text,
  error                text,
  created_by           uuid references public.users(id) on delete set null,
  is_demo              boolean not null default false,
  created_at           timestamptz not null default now()
);
create index whatsapp_messages_log_order_idx on public.whatsapp_messages_log (order_id);
create index whatsapp_messages_log_created_idx on public.whatsapp_messages_log (created_at desc);

create table public.automations (
  id               uuid primary key default gen_random_uuid(),
  brand_id         uuid references public.brands(id),
  trigger_event    text not null check (trigger_event in ('pedido_recebido', 'pagamento_confirmado', 'pedido_enviado',
                                                          'pedido_entregue', 'pos_venda', 'estoque_baixo')),
  template_key     text not null,
  is_enabled       boolean not null default false,
  require_opt_in   boolean not null default true,
  delay_minutes    integer not null default 0 check (delay_minutes >= 0),
  notes            text,
  updated_by       uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index automations_unique
  on public.automations (coalesce(brand_id, '00000000-0000-0000-0000-000000000000'::uuid), trigger_event);

-- -----------------------------------------------------------------------------
-- CMS, banners, ideias, planejamento
-- -----------------------------------------------------------------------------
create table public.banners (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid not null references public.brands(id),
  placement     text not null check (placement in ('home_hero', 'home_secundario', 'categoria', 'produto')),
  title         text,
  subtitle      text,
  cta_label     text,
  image_url     text,
  link_url      text,
  category_id   uuid references public.categories(id) on delete set null,
  sort_order    integer not null default 0,
  is_active     boolean not null default true,
  starts_at     timestamptz,
  ends_at       timestamptz,
  published_by  uuid references public.users(id) on delete set null,
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index banners_brand_idx on public.banners (brand_id, placement, sort_order) where deleted_at is null;

create table public.cms_content (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid references public.brands(id),   -- NULL = configuração geral
  key           text not null,
  value         jsonb not null default '{}'::jsonb,
  published_by  uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index cms_content_unique
  on public.cms_content (coalesce(brand_id, '00000000-0000-0000-0000-000000000000'::uuid), key);

create table public.ideas (
  id                   uuid primary key default gen_random_uuid(),
  brand_id             uuid references public.brands(id),
  title                text not null,
  description          text,
  category             text,
  priority             text not null default 'media' check (priority in ('baixa', 'media', 'alta', 'urgente')),
  status               text not null default 'ideia' check (status in ('ideia', 'planejado', 'em_andamento', 'concluido', 'cancelado')),
  responsible_user_id  uuid references public.users(id) on delete set null,
  idea_date            date not null default current_date,
  notes                text,
  created_by           uuid references public.users(id) on delete set null,
  is_demo              boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz
);

create table public.planned_products (
  id                uuid primary key default gen_random_uuid(),
  brand_id          uuid not null references public.brands(id),
  name              text not null,
  category_id       uuid references public.categories(id) on delete set null,
  supplier_id       uuid references public.suppliers(id) on delete set null,
  estimated_cost    numeric(12,2) check (estimated_cost is null or estimated_cost >= 0),
  estimated_price   numeric(12,2) check (estimated_price is null or estimated_price >= 0),
  planned_quantity  integer check (planned_quantity is null or planned_quantity >= 0),
  notes             text,
  status            text not null default 'pesquisa' check (status in ('pesquisa', 'cotacao', 'aguardando_compra',
                                                                     'comprado', 'cadastrado', 'disponivel')),
  created_by        uuid references public.users(id) on delete set null,
  is_demo           boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

-- -----------------------------------------------------------------------------
-- Auditoria, analytics e configurações gerais
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id             uuid primary key default gen_random_uuid(),
  actor_user_id  uuid references public.users(id) on delete set null,
  actor_name     text,
  actor_email    text,
  action         text not null,
  entity         text not null,
  entity_id      text,
  brand_id       uuid references public.brands(id),
  before         jsonb,
  after          jsonb,
  reason         text,
  ip             text,
  user_agent     text,
  created_at     timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_user_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id);

create table public.analytics_events (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid references public.brands(id),
  visitor_id  text,
  type        text not null check (type in ('page_view', 'product_view', 'add_to_cart', 'begin_checkout',
                                            'order_created', 'purchase_confirmed')),
  product_id  uuid references public.products(id) on delete set null,
  order_id    uuid references public.orders(id) on delete set null,
  value       numeric(12,2),
  path        text,
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index analytics_events_idx on public.analytics_events (brand_id, type, created_at);

create table public.app_settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_by  uuid references public.users(id) on delete set null,
  updated_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Gatilhos de updated_at
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    where c.table_schema = 'public' and c.column_name = 'updated_at'
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t
    );
  end loop;
end;
$$;
