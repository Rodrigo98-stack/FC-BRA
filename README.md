# FC-BRA · FINA CLÁSSICA + BRAVUS

E-commerce multi-marca com painel administrativo unificado: duas lojas visualmente
independentes (FINA CLÁSSICA — moda feminina, BRAVUS — moda masculina) sobre um
único backend, com pedidos finalizados pelo WhatsApp, estoque, financeiro, DRE,
relatórios, analytics, CMS sem código e controle completo de usuários, funcionários
e sócios (papéis, permissões granulares e escopo por marca).

> Documento técnico completo (auditoria, arquitetura, modelo de dados, riscos):
> [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md)

---

## Como o sistema roda hoje

| Situação | O que acontece |
|---|---|
| **Sem `DATABASE_URL`** (modo demonstração) | Usa um PostgreSQL embutido (PGlite) com o mesmo esquema e as mesmas regras do banco de produção, já com **dados DEMO** para você ver tudo funcionando. No Netlify o estado é salvo no Netlify Blobs. Serve para conhecer e validar — **não para operar**. |
| **Com `DATABASE_URL`** (produção) | Conecta no PostgreSQL do Supabase. As migrations são aplicadas sozinhas na primeira inicialização e o banco começa **vazio** (sem DEMO). |

Tudo que for fictício aparece marcado como **DEMO** (produtos, clientes, vendas,
usuários). Em **Configurações › Sistema** há o botão **Limpar dados DEMO**
(com confirmação dupla).

## Primeiro acesso ao painel

1. Acesse `/admin`. Sem nenhum administrador cadastrado, o sistema abre **Primeiro acesso**.
2. Em produção é exigido o **código de instalação**: a variável de ambiente `SETUP_TOKEN`.
3. Informe nome, e-mail e senha (mín. 10 caracteres, letras e números). Essa conta é o
   **ADMINISTRADOR PRINCIPAL**: acesso total, não pode ser excluída nem rebaixada.
4. Depois convide a equipe em **Usuários e equipe › Convidar pessoa**. Sem e-mail
   configurado, o painel gera um **link de convite** para você enviar pelo WhatsApp.

Os usuários DEMO (Gerente, Vendedora FINA, Estoque BRAVUS, Financeiro, Marketing)
não têm senha. Para entrar como um deles e testar as permissões, abra o usuário em
**Usuários e equipe** e clique em **Gerar link de definição de senha**.

## Conectar o Supabase (operação real)

1. Crie um projeto no [Supabase](https://supabase.com) (região São Paulo recomendada).
2. Em *Project Settings › Database › Connection string*, copie a URL do
   **Transaction pooler** (porta `6543`) e substitua `[YOUR-PASSWORD]` pela senha do banco.
3. No Netlify: *Site configuration › Environment variables* e cadastre:
   - `DATABASE_URL` — a connection string do passo 2
   - `APP_SECRET` — um texto aleatório longo (ex.: `openssl rand -base64 48`)
   - `SETUP_TOKEN` — um código só seu para o primeiro acesso
4. Faça um novo deploy (*Deploys › Trigger deploy*). As tabelas, papéis, permissões,
   categorias e políticas de segurança (RLS) são criados automaticamente.
5. Acesse `/admin`, crie o administrador principal e cadastre os produtos reais.

Alternativa pela linha de comando: `DATABASE_URL=... npm run db:migrate`.

## Variáveis de ambiente

Todas documentadas em [`.env.example`](.env.example). Segredos ficam **somente** no
Netlify — nunca no código.

| Variável | Obrigatória | Para quê |
|---|---|---|
| `DATABASE_URL` | produção | PostgreSQL (Supabase, pooler porta 6543) |
| `APP_SECRET` | recomendada | Assinatura dos links de pedido e hash de CPF |
| `SETUP_TOKEN` | produção | Libera a criação do administrador principal |
| `SITE_URL` | não | URL canônica (sitemap/links); por padrão usa o domínio acessado |
| `RESEND_API_KEY`, `EMAIL_FROM` | não | Envio de convites e redefinição de senha por e-mail |
| `WHATSAPP_CLOUD_API_TOKEN` | não | Envio pela WhatsApp Business Cloud API (sem ele: links wa.me) |
| `SESSION_HOURS` | não | Duração da sessão do painel (padrão 12 h) |

## O que preencher no painel antes de vender

Nada é inventado: o que não foi informado aparece como **“Configuração pendente”**.

- **Configurações › (marca) › Identidade visual**: logo, favicon, cores oficiais
  (as atuais são *placeholders* sugeridos), fontes.
- **WhatsApp**: número que recebe os pedidos de cada marca.
- **Configurações › (marca)**: contato, redes sociais, políticas (troca, devolução,
  entrega, privacidade, termos), SEO e regra de frete.
- **Produtos**: cadastro com variações (tamanho/cor), preços, custo e estoque.

## Funcionalidades (resumo)

- **Loja**: seleção de marca, home por marca, categorias editáveis, busca (nome,
  categoria, SKU, cor, material), filtros (preço, tamanho, cor, categoria,
  disponibilidade, novidades, promoções), página de produto com galeria e variações,
  carrinho por marca (localStorage), checkout, pedido com número único e mensagem
  pré-preenchida no WhatsApp, páginas de política, SEO por marca (title, Open Graph,
  Twitter Cards, sitemap por marca, robots.txt, JSON-LD de produto).
- **Painel**: dashboard com KPIs (hoje/ontem/semana/mês/ano), comparativo FINA × BRAVUS
  e dashboards individuais; vendas; pedidos com mudança de status transacional (baixa
  de estoque na confirmação, receita no pagamento, estornos automáticos); produtos,
  categorias, variações; estoque (entrada, saída, ajuste, perda, devolução, inventário,
  transferência entre locais, histórico com saldo antes/depois) e alertas; clientes
  (CRM com métricas); fornecedores; financeiro e DRE simplificada; 13 relatórios com
  exportação CSV, Excel e PDF; analytics próprio com funil; WhatsApp e automações (nada
  é enviado sem API + opt-in); banners; ideias; produtos planejados; usuários e equipe;
  permissões e papéis (matriz módulo × ação, clonagem, escopo por marca); logs de
  auditoria; configurações/CMS; busca global (Ctrl K) e atalhos de teclado.

## Stack

Next.js 15 (App Router, Server Actions) · React 19 · TypeScript · Tailwind CSS 4 ·
PostgreSQL (Supabase) com Drizzle ORM · PGlite no modo demonstração · Zod ·
Zustand · Netlify (Next.js runtime, Blobs) · Vitest · Playwright.

## Desenvolvimento

```bash
npm install
npm run dev            # http://localhost:3000 (modo demonstração, dados em .data/)
npm run typecheck
npm test               # Vitest: pedidos, estoque, financeiro, RBAC, DEMO, utilitários
npm run build && npm start
E2E_BASE_URL=http://localhost:3000 npm run test:e2e   # Playwright (servidor no ar)
```

Outros comandos: `npm run db:migrate`, `npm run db:seed-demo -- --sim`,
`npm run admin:create -- --nome "Nome" --email email@dominio.com` (com `ADMIN_PASSWORD`).

## Estrutura

```
supabase/migrations/   SQL: esquema, dados-base (marcas, papéis, permissões), RLS
src/app/               Rotas: loja ([brand]/...), painel (admin/...), APIs (api/...)
src/server/            Banco, autenticação, RBAC, auditoria, serviços de domínio
src/components/        Componentes da loja e do painel
src/lib/               Domínio (status, módulos, rótulos), formatação, períodos
scripts/               Migrations, snapshot DEMO, seed DEMO, criar admin
tests/                 Vitest (unitários/integração) e Playwright (e2e)
docs/ARQUITETURA.md    Auditoria, arquitetura, modelo de dados, riscos
```

## Limitações conhecidas

- O modo demonstração não substitui um banco de produção (sem backup e com
  concorrência limitada entre instâncias). Para operar, conecte o Supabase.
- 2FA: o painel registra a exigência por usuário; a verificação em duas etapas ainda
  não está implementada.
- Automações por API: o "atraso" fica registrado, mas o disparo acontece na mudança de
  status (não há fila agendada). Fora da janela de 24 h a Meta exige modelos aprovados.
- Não há conta de cliente na loja (o carrinho fica no navegador); pagamentos online,
  cupons e fidelidade não fazem parte desta versão, mas o modelo de dados está pronto
  para recebê-los.
