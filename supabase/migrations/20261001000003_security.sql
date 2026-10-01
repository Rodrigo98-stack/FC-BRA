-- =============================================================================
-- FC-BRA · Migration 0003 — segurança (RBAC no banco + Row Level Security)
--
-- Camadas:
--   1. A aplicação (servidor Next.js) valida sessão e permissão em TODA ação
--      (src/server/rbac). Ela conecta com a role do banco via DATABASE_URL.
--   2. RLS habilitado em TODAS as tabelas: a API pública do Supabase
--      (chave anon) só enxerga o catálogo publicado — nada de pedidos,
--      clientes, financeiro, usuários ou sessões.
--   3. Para usuários autenticados pela API do Supabase (auth.uid() = users.id),
--      cada tabela tem políticas por papel × marca via has_permission().
-- =============================================================================

create or replace function public.has_permission(
  p_user   uuid,
  p_module text,
  p_action text,
  p_brand  uuid default null
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.users u
      where u.id = p_user and u.deleted_at is null and u.status = 'ativo' and u.is_owner
    )
    or exists (
      select 1
      from public.users u
      join public.user_roles ur        on ur.user_id = u.id
      join public.roles r              on r.id = ur.role_id and r.is_active and r.deleted_at is null
      join public.role_permissions rp  on rp.role_id = r.id
      join public.permissions p        on p.id = rp.permission_id
      where u.id = p_user and u.deleted_at is null and u.status = 'ativo'
        and p.module = p_module and p.action = p_action
        and (ur.brand_id is null or p_brand is null or ur.brand_id = p_brand)
    )
    or exists (
      select 1
      from public.users u
      join public.user_permissions up on up.user_id = u.id
      join public.permissions p       on p.id = up.permission_id
      where u.id = p_user and u.deleted_at is null and u.status = 'ativo'
        and p.module = p_module and p.action = p_action
        and (up.brand_id is null or p_brand is null or up.brand_id = p_brand)
    );
$$;

-- RLS em todas as tabelas do schema public.
do $$
declare
  t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- Políticas para a API do Supabase (só criadas quando as roles existem —
-- no banco embutido do modo demonstração elas não existem).
do $$
declare
  rec record;
  brand_expr text;
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    -- Catálogo público (somente leitura, somente conteúdo publicado).
    create policy catalogo_publico on public.brands for select to anon using (is_active);
    create policy catalogo_publico on public.categories for select to anon
      using (is_active and deleted_at is null);
    create policy catalogo_publico on public.products for select to anon
      using (status = 'ativo' and deleted_at is null);
    create policy catalogo_publico on public.product_variants for select to anon
      using (is_active and deleted_at is null
             and exists (select 1 from public.products p where p.id = product_id and p.status = 'ativo' and p.deleted_at is null));
    create policy catalogo_publico on public.product_images for select to anon
      using (exists (select 1 from public.products p where p.id = product_id and p.status = 'ativo' and p.deleted_at is null));
    create policy catalogo_publico on public.inventory for select to anon using (true);
    create policy catalogo_publico on public.banners for select to anon
      using (is_active and deleted_at is null);
    create policy catalogo_publico on public.cms_content for select to anon using (true);
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated')
     and exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'auth' and p.proname = 'uid') then
    for rec in
      select * from (values
        ('products',              'produtos',            true),
        ('product_variants',      'produtos',            true),
        ('product_images',        'produtos',            false),
        ('categories',            'categorias',          true),
        ('inventory',             'estoque',             false),
        ('inventory_movements',   'estoque',             true),
        ('suppliers',             'fornecedores',        true),
        ('customers',             'clientes',            false),
        ('orders',                'pedidos',             true),
        ('order_items',           'pedidos',             false),
        ('order_status_history',  'pedidos',             false),
        ('financial_entries',     'financeiro',          true),
        ('financial_expenses',    'financeiro',          true),
        ('whatsapp_templates',    'automacoes',          true),
        ('automations',           'automacoes',          true),
        ('whatsapp_messages_log', 'whatsapp',            true),
        ('banners',               'banners',             true),
        ('cms_content',           'cms',                 true),
        ('ideas',                 'ideias',              true),
        ('planned_products',      'produtos_planejados', true),
        ('audit_logs',            'auditoria',           true),
        ('analytics_events',      'analytics',           true),
        ('users',                 'usuarios',            false),
        ('user_roles',            'usuarios',            true),
        ('user_permissions',      'usuarios',            true),
        ('teams',                 'usuarios',            true),
        ('team_members',          'usuarios',            false),
        ('invitations',           'usuarios',            true),
        ('roles',                 'permissoes',          false),
        ('role_permissions',      'permissoes',          false),
        ('permissions',           'permissoes',          false),
        ('app_settings',          'configuracoes',       false)
      ) as m(tbl, module, has_brand)
    loop
      brand_expr := case when rec.has_brand then 'brand_id' else 'null::uuid' end;
      execute format(
        'create policy rbac_select on public.%I for select to authenticated using (public.has_permission(auth.uid(), %L, %L, %s))',
        rec.tbl, rec.module, 'visualizar', brand_expr);
      execute format(
        'create policy rbac_insert on public.%I for insert to authenticated with check (public.has_permission(auth.uid(), %L, %L, %s))',
        rec.tbl, rec.module, 'criar', brand_expr);
      execute format(
        'create policy rbac_update on public.%I for update to authenticated using (public.has_permission(auth.uid(), %L, %L, %s))',
        rec.tbl, rec.module, 'editar', brand_expr);
      execute format(
        'create policy rbac_delete on public.%I for delete to authenticated using (public.has_permission(auth.uid(), %L, %L, %s))',
        rec.tbl, rec.module, 'excluir', brand_expr);
    end loop;
  end if;
end;
$$;
-- sessions, password_resets e rate_limits ficam sem nenhuma política:
-- inacessíveis pela API pública em qualquer caso.
