-- =============================================================================
-- FC-BRA · Migration 0002 — dados-base do sistema
--
-- Somente o que está definido na especificação: marcas, categorias, papéis,
-- permissões, modelos de mensagem e configurações com PLACEHOLDERS explícitos.
-- Nenhum dado comercial (preço, cliente, fornecedor, logo, telefone) é criado.
-- =============================================================================

-- Marcas (§1.1)
insert into public.brands (slug, name, audience, positioning, order_prefix, sort_order) values
  ('fina-classica', 'FINA CLÁSSICA', 'Feminino',  'Fino, elegante, clássico, sofisticado', 'FC', 1),
  ('bravus',        'BRAVUS',        'Masculino', 'Elegante, moderno, forte, sofisticado', 'BR', 2);

-- Categorias iniciais (§3.1) — todas editáveis pelo painel.
insert into public.categories (brand_id, slug, name, kind, sort_order)
select b.id, c.slug, c.name, c.kind, c.sort_order
from public.brands b
join (values
  ('fina-classica', 'vestidos',   'Vestidos',   'padrao',    1),
  ('fina-classica', 'camisas',    'Camisas',    'padrao',    2),
  ('fina-classica', 'blusas',     'Blusas',     'padrao',    3),
  ('fina-classica', 'calcas',     'Calças',     'padrao',    4),
  ('fina-classica', 'saias',      'Saias',      'padrao',    5),
  ('fina-classica', 'bolsas',     'Bolsas',     'padrao',    6),
  ('fina-classica', 'sapatos',    'Sapatos',    'padrao',    7),
  ('fina-classica', 'acessorios', 'Acessórios', 'padrao',    8),
  ('fina-classica', 'novidades',  'Novidades',  'novidades', 9),
  ('fina-classica', 'promocoes',  'Promoções',  'promocoes', 10),
  ('bravus',        'camisas',    'Camisas',    'padrao',    1),
  ('bravus',        'camisetas',  'Camisetas',  'padrao',    2),
  ('bravus',        'calcas',     'Calças',     'padrao',    3),
  ('bravus',        'bermudas',   'Bermudas',   'padrao',    4),
  ('bravus',        'bolsas',     'Bolsas',     'padrao',    5),
  ('bravus',        'sapatos',    'Sapatos',    'padrao',    6),
  ('bravus',        'acessorios', 'Acessórios', 'padrao',    7),
  ('bravus',        'novidades',  'Novidades',  'novidades', 8),
  ('bravus',        'promocoes',  'Promoções',  'promocoes', 9)
) as c(brand_slug, slug, name, kind, sort_order) on c.brand_slug = b.slug;

-- Permissões: módulo × ação (§35.3). O módulo "cms" separa identidade visual
-- (marketing) de "configuracoes" (parâmetros do sistema).
insert into public.permissions (module, action)
select m, a
from unnest(array[
  'produtos', 'categorias', 'estoque', 'pedidos', 'clientes', 'fornecedores',
  'financeiro', 'relatorios', 'analytics', 'whatsapp', 'automacoes',
  'banners', 'cms', 'ideias', 'produtos_planejados', 'usuarios', 'permissoes',
  'configuracoes', 'auditoria'
]) as m
cross join unnest(array[
  'visualizar', 'criar', 'editar', 'excluir', 'exportar', 'aprovar', 'configurar', 'convidar', 'revogar'
]) as a;

-- Papéis pré-definidos (§35.2)
insert into public.roles (key, name, description, default_scope, is_system) values
  ('ADMINISTRADOR_PRINCIPAL', 'Administrador principal', 'Dono/proprietário da conta. Acesso total irrevogável.', 'Tudo', true),
  ('SOCIO',         'Sócio',         'Sócio com acesso amplo, mas não pode excluir o admin principal.', 'Tudo, exceto deletar admin principal e alterar plano de cobrança', true),
  ('GERENTE',       'Gerente',       'Gerencia operação do dia a dia.', 'Produtos, pedidos, estoque, clientes, relatórios, equipe (leitura)', true),
  ('VENDEDOR',      'Vendedor',      'Atende clientes e registra pedidos.', 'Pedidos, clientes, produtos (leitura)', true),
  ('ESTOQUE',       'Estoque',       'Cuida de inventário e movimentações.', 'Estoque, produtos (leitura), fornecedores (leitura)', true),
  ('FINANCEIRO',    'Financeiro',    'Cuida de contas, DRE, relatórios financeiros.', 'Financeiro, relatórios financeiros, pedidos (leitura)', true),
  ('MARKETING',     'Marketing',     'Cuida de banners, CMS, campanhas e automações.', 'CMS, banners, automações, analytics (leitura)', true),
  ('PERSONALIZADO', 'Personalizado', 'Papel customizado criado pelo admin com permissões granulares.', 'Definido pelo admin', true);

-- Matriz padrão de cada papel
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on (
  r.key in ('ADMINISTRADOR_PRINCIPAL', 'SOCIO')
  or (r.key = 'GERENTE' and (
        (p.module in ('produtos', 'categorias', 'estoque', 'pedidos', 'clientes')
           and p.action in ('visualizar', 'criar', 'editar', 'excluir', 'exportar', 'aprovar'))
     or (p.module = 'relatorios' and p.action in ('visualizar', 'exportar'))
     or (p.module = 'usuarios' and p.action = 'visualizar')))
  or (r.key = 'VENDEDOR' and (
        (p.module in ('pedidos', 'clientes') and p.action in ('visualizar', 'criar', 'editar'))
     or (p.module = 'produtos' and p.action = 'visualizar')))
  or (r.key = 'ESTOQUE' and (
        (p.module = 'estoque' and p.action in ('visualizar', 'criar', 'editar', 'exportar'))
     or (p.module in ('produtos', 'fornecedores') and p.action = 'visualizar')))
  or (r.key = 'FINANCEIRO' and (
        (p.module = 'financeiro' and p.action in ('visualizar', 'criar', 'editar', 'excluir', 'exportar', 'aprovar'))
     or (p.module = 'relatorios' and p.action in ('visualizar', 'exportar'))
     or (p.module = 'pedidos' and p.action = 'visualizar')))
  or (r.key = 'MARKETING' and (
        (p.module = 'cms' and p.action in ('visualizar', 'editar', 'configurar'))
     or (p.module = 'banners' and p.action in ('visualizar', 'criar', 'editar', 'excluir'))
     or (p.module = 'automacoes' and p.action in ('visualizar', 'criar', 'editar', 'configurar'))
     or (p.module = 'analytics' and p.action = 'visualizar')))
);

-- Modelos de mensagem do WhatsApp (§9.2 e §20)
insert into public.whatsapp_templates (brand_id, key, name, body) values
  (null, 'checkout', 'Finalização do pedido (cliente → loja)',
'Olá! Gostaria de realizar um pedido.

Loja: {marca}
Pedido: #{numero}

Produtos:
{itens}

Subtotal: {subtotal}
Frete: {frete}
Total: {total}

Nome: {nome}
Telefone: {telefone}
Observações: {obs}

Gostaria de confirmar meu pedido.'),
  (null, 'pedido_recebido', 'Pedido recebido',
'Olá, {nome}! Recebemos o seu pedido #{pedido} na {marca}, no valor de {valor}. Em breve confirmaremos os detalhes por aqui.'),
  (null, 'pagamento_confirmado', 'Pagamento confirmado',
'Olá, {nome}! O pagamento do pedido #{pedido} ({valor}) foi confirmado em {data}. Obrigado por comprar na {marca}!'),
  (null, 'pedido_enviado', 'Pedido enviado',
'Olá, {nome}! O seu pedido #{pedido} da {marca} foi enviado em {data}. {link}'),
  (null, 'pedido_entregue', 'Pedido entregue',
'Olá, {nome}! Consta que o seu pedido #{pedido} da {marca} foi entregue. Qualquer dúvida, estamos por aqui.'),
  (null, 'pos_venda', 'Pós-venda',
'Olá, {nome}! Como foi a sua experiência com o pedido #{pedido} da {marca}? A sua opinião é muito importante para nós.'),
  (null, 'estoque_baixo', 'Estoque baixo (alerta interno)',
'Alerta de estoque na {marca}: {produto} está com estoque baixo. Verifique a reposição.');

-- Automações: todas DESLIGADAS e exigindo opt-in (§20 — nada é enviado sem API + opt-in).
insert into public.automations (brand_id, trigger_event, template_key, is_enabled, require_opt_in)
select null, t, t, false, true
from unnest(array['pedido_recebido', 'pagamento_confirmado', 'pedido_enviado',
                  'pedido_entregue', 'pos_venda', 'estoque_baixo']) as t;

-- Conteúdo do CMS com placeholders explícitos (§4: nunca inventar logos/cores oficiais/dados).
insert into public.cms_content (brand_id, key, value)
select b.id, v.key, v.value::jsonb
from public.brands b
join (values
  ('fina-classica', 'identity', '{
     "logo_url": null, "logo_placeholder": "[LOGO FINA — A DEFINIR]", "favicon_url": null,
     "tagline": "Elegância · Sofisticação · Clássico", "card_subtitle": "Moda feminina",
     "palette": {"primary": "#3A2F29", "secondary": "#E9E1DA", "accent": "#B39256", "text": "#2A2320", "background": "#F6F2EF"},
     "palette_is_placeholder": true,
     "typography": {"display": "Bodoni Moda", "body": "Jost"}
   }'),
  ('bravus', 'identity', '{
     "logo_url": null, "logo_placeholder": "[LOGO BRAVUS — A DEFINIR]", "favicon_url": null,
     "tagline": "Estilo · Elegância · Personalidade", "card_subtitle": "Moda masculina",
     "palette": {"primary": "#2C2D30", "secondary": "#2C2D30", "accent": "#B87333", "text": "#ECE7E1", "background": "#1E1F21"},
     "palette_is_placeholder": true,
     "typography": {"display": "Barlow Condensed", "body": "Barlow"}
   }'),
  ('fina-classica', 'home', '{"hero_title": null, "hero_subtitle": null, "hero_image_url": null, "institutional_images": []}'),
  ('bravus',        'home', '{"hero_title": null, "hero_subtitle": null, "hero_image_url": null, "institutional_images": []}'),
  ('fina-classica', 'contact', '{"whatsapp": null, "email": null, "phone": null, "address": null}'),
  ('bravus',        'contact', '{"whatsapp": null, "email": null, "phone": null, "address": null}'),
  ('fina-classica', 'social', '{"instagram": null, "facebook": null, "tiktok": null, "pinterest": null, "youtube": null}'),
  ('bravus',        'social', '{"instagram": null, "facebook": null, "tiktok": null, "pinterest": null, "youtube": null}'),
  ('fina-classica', 'policies', '{"troca": null, "devolucao": null, "entrega": null, "privacidade": null, "termos": null}'),
  ('bravus',        'policies', '{"troca": null, "devolucao": null, "entrega": null, "privacidade": null, "termos": null}'),
  ('fina-classica', 'seo', '{"title": null, "description": null, "og_image_url": null}'),
  ('bravus',        'seo', '{"title": null, "description": null, "og_image_url": null}'),
  ('fina-classica', 'shipping', '{"mode": "a_combinar", "fixed_amount": null, "free_over": null, "notes": null}'),
  ('bravus',        'shipping', '{"mode": "a_combinar", "fixed_amount": null, "free_over": null, "notes": null}'),
  ('fina-classica', 'whatsapp', '{"number": null, "driver": "link", "cloud_phone_number_id": null}'),
  ('bravus',        'whatsapp', '{"number": null, "driver": "link", "cloud_phone_number_id": null}')
) as v(brand_slug, key, value) on v.brand_slug = b.slug;

insert into public.cms_content (brand_id, key, value) values
  (null, 'site', '{"name": "FINA CLÁSSICA + BRAVUS", "selection_title": "ESCOLHA SUA EXPERIÊNCIA", "favicon_url": null}'),
  (null, 'whatsapp', '{"number": null}');

insert into public.app_settings (key, value) values
  ('general', '{"new_product_days": 30, "invite_expiration_hours": 72, "session_hours": 12}');
