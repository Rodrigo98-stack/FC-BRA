# FC-BRA e CRM no mesmo banco (Supabase `FC-BRA`)

O projeto Supabase `sirqxjsucenruntsbkyb` é usado por **dois sistemas**: a loja e o
painel do FC-BRA (este repositório) e o **CRM/PDV** (migrações `crm_*`, aplicadas em
2–3/out/2026). Eles compartilham o cadastro de pessoas, marcas, produtos, estoque,
clientes e pedidos. Combinado com o cliente: **ficam no mesmo banco, um sem atrapalhar o outro.**

## Quem é dono de quê

| Dono | O que é |
|---|---|
| **CRM** | Tabelas `cash_sessions`, `cash_movements`, `credit_accounts`, `credit_installments`, `credit_payments`, `order_payments`; funções `crm_*`; gatilhos `crm_guard_*` e `*_immutable`; `app_settings` com `key = 'crm'`; chaves de limite `crm-*`; colunas `customers.document` e `product_variants.barcode` |
| **FC-BRA** | Demais tabelas do esquema (marcas, RBAC, CMS, WhatsApp, banners, ideias, analytics…), funções `set_updated_at` e `has_permission`, `_migrations`, `app_settings` com `key = 'general'` |
| **Compartilhado** | `users`, `roles`, `permissions`, `user_roles`, `brands`, `categories`, `products`, `product_variants`, `product_images`, `inventory`, `inventory_movements`, `customers`, `orders`, `order_items`, `order_status_history`, `financial_entries`, `audit_logs`, `rate_limits`, `order_number_seq` |

## Regras para o FC-BRA (este repositório)

1. Migrações do FC-BRA são **somente aditivas** nas tabelas compartilhadas: nada de
   apagar/renomear coluna, apagar tabela, apertar `CHECK` ou `NOT NULL` sem antes checar o CRM.
2. Nunca criar objeto com o prefixo `crm_` nem mexer nos objetos do CRM.
3. Antes de qualquer migração no Supabase: listar as migrações já aplicadas
   (`list_migrations`), rodar o verificador de segurança (`get_advisors`) e conferir se a
   mudança não toca nada da coluna "CRM" acima.
4. Dados reais não têm `is_demo`; **Limpar dados DEMO** só apaga linhas marcadas `is_demo`.
5. Nomes de ações de auditoria e chaves de limite do FC-BRA seguem o padrão `modulo.acao`
   e `login:…`; o CRM usa `snake_case` simples e `crm-…`. Não reutilizar.

## O que um sistema sente do outro

- **Vendas do PDV** (pedidos que têm `order_payments`) ficam protegidas pelo gatilho
  `crm_guard_pdv_order`: o painel do FC-BRA não consegue mudar status, valores nem cancelar
  essas vendas. A mensagem pede para usar o CRM, que mantém caixa, estoque e crediário
  corretos. **Pedidos da loja** (sem pagamento no PDV) não são afetados.
- **Estoque** é o mesmo (`inventory`). A regra `quantity >= 0` impede saldo negativo: se os
  dois sistemas disputarem a última unidade, um deles recebe erro de estoque insuficiente.
- **Numeração dos pedidos** usa a mesma sequência (`order_number_seq`); números nunca
  repetem. O código do pedido é o prefixo da marca + número (ex.: `FC-000012`).
- **Produtos** cadastrados no CRM aparecem na loja quando estão `ativo`; produto `inativo`
  não aparece.
- **Login**: a conta é a mesma. O CRM entra pelo Supabase Auth e sincroniza a senha com o
  painel do FC-BRA (registro de auditoria `senha_sincronizada_painel_loja`).

## Texto para colar na sessão do CRM

> O banco `FC-BRA` (Supabase `sirqxjsucenruntsbkyb`) também é usado pela loja FINA&CLÁSSICA +
> BRAVUS (repositório `Rodrigo98-stack/FC-BRA`). Regras: migrações do CRM só aditivas nas
> tabelas compartilhadas (users, roles, permissions, user_roles, brands, categories,
> products, product_variants, product_images, inventory, inventory_movements, customers,
> orders, order_items, order_status_history, financial_entries, audit_logs, rate_limits);
> não renomear nem apagar colunas/tabelas do FC-BRA; não mexer em `cms_content`, `banners`,
> `whatsapp_*`, `automations`, `ideas`, `planned_products`, `analytics_events`, `teams`,
> `invitations`, `password_resets`, `sessions`, `_migrations` nem em `app_settings` com
> `key = 'general'`; manter o prefixo `crm_` nos objetos do CRM; antes de aplicar uma
> migração, listar as já aplicadas (`fcbra_*` são da loja). O site da loja grava pedidos
> com `source = 'loja'`, sem `order_payments`; o CRM deve manter esse comportamento
> compatível e a trava `crm_guard_pdv_order` só deve valer para vendas com pagamento no PDV.
