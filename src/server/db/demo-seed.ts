/**
 * Dados de DEMONSTRAÇÃO (§38).
 *
 * - Todos os registros têm is_demo = true e o texto "DEMO" no nome.
 * - Usados apenas para demonstrar a interface; o botão "Limpar dados DEMO"
 *   (Configurações) remove tudo com confirmação dupla.
 * - Pedidos são criados pelos MESMOS serviços da loja (estoque, financeiro,
 *   histórico e auditoria consistentes) e depois têm as datas retroativas.
 */
import { eq, inArray, sql } from "drizzle-orm";
import { runInTx, schema, type Tx } from "./index";
import { applyMovement } from "../services/inventory";
import { changeOrderStatus, createOrder } from "../services/orders";
import type { OrderStatus } from "@/lib/domain";

// PRNG determinístico (os dados DEMO são sempre os mesmos).
function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type DemoProduct = {
  category: string;
  name: string;
  price: number;
  promo?: number;
  cost: number;
  material: string;
  art: string;
  sizes: string[];
  colors: [string, string][];
  featured?: boolean;
  isNew?: boolean;
};

const FINA: DemoProduct[] = [
  { category: "vestidos", name: "Vestido midi acetinado", price: 389.9, cost: 158, material: "Cetim de poliéster", art: "vestido", sizes: ["P", "M", "G"], colors: [["Off-white", "#F2EDE4"], ["Rosé", "#D9B2A9"]], featured: true },
  { category: "vestidos", name: "Vestido longo de alças", price: 459.9, promo: 399.9, cost: 182, material: "Viscose", art: "vestido", sizes: ["P", "M", "G"], colors: [["Preto", "#1C1C1C"], ["Verde oliva", "#6B6B47"]] },
  { category: "camisas", name: "Camisa de seda com laço", price: 279.9, cost: 112, material: "Seda", art: "camisa", sizes: ["P", "M", "G"], colors: [["Off-white", "#F2EDE4"]], isNew: true },
  { category: "blusas", name: "Blusa de tricô canelado", price: 199.9, promo: 169.9, cost: 74, material: "Tricô de algodão", art: "blusa", sizes: ["P", "M", "G"], colors: [["Caramelo", "#B07A4F"], ["Off-white", "#F2EDE4"]] },
  { category: "calcas", name: "Calça pantalona de alfaiataria", price: 329.9, cost: 129, material: "Alfaiataria", art: "calca", sizes: ["36", "38", "40", "42"], colors: [["Azul marinho", "#1F2A44"], ["Preto", "#1C1C1C"]], featured: true },
  { category: "saias", name: "Saia lápis em crepe", price: 239.9, cost: 88, material: "Crepe", art: "saia", sizes: ["36", "38", "40"], colors: [["Preto", "#1C1C1C"]] },
  { category: "bolsas", name: "Bolsa estruturada média", price: 499.9, cost: 205, material: "Couro sintético", art: "bolsa", sizes: ["U"], colors: [["Caramelo", "#B07A4F"], ["Preto", "#1C1C1C"]], isNew: true },
  { category: "sapatos", name: "Scarpin bico fino", price: 349.9, promo: 299.9, cost: 131, material: "Couro", art: "sapato", sizes: ["34", "35", "36", "37", "38"], colors: [["Nude", "#D8BFA6"]] },
  { category: "acessorios", name: "Brinco gota dourado", price: 129.9, cost: 41, material: "Metal banhado", art: "acessorio", sizes: ["U"], colors: [["Dourado", "#C9A55A"]] },
];

const BRAVUS: DemoProduct[] = [
  { category: "camisas", name: "Camisa oxford slim", price: 249.9, cost: 96, material: "Algodão oxford", art: "camisa", sizes: ["P", "M", "G", "GG"], colors: [["Branco", "#F5F5F5"], ["Azul marinho", "#1D2636"]], featured: true },
  { category: "camisas", name: "Camisa de linho manga longa", price: 289.9, promo: 239.9, cost: 118, material: "Linho", art: "camisa", sizes: ["M", "G", "GG"], colors: [["Areia", "#CBB89D"]] },
  { category: "camisetas", name: "Camiseta algodão pima", price: 129.9, cost: 44, material: "Algodão pima", art: "camiseta", sizes: ["P", "M", "G", "GG"], colors: [["Grafite", "#3A3A3C"], ["Branco", "#F5F5F5"], ["Preto", "#111111"]], isNew: true },
  { category: "calcas", name: "Calça chino de sarja", price: 279.9, cost: 104, material: "Sarja com elastano", art: "calca", sizes: ["40", "42", "44", "46"], colors: [["Areia", "#CBB89D"], ["Verde musgo", "#4B5320"]] },
  { category: "bermudas", name: "Bermuda de alfaiataria", price: 219.9, promo: 189.9, cost: 79, material: "Alfaiataria leve", art: "bermuda", sizes: ["40", "42", "44"], colors: [["Grafite", "#3A3A3C"]] },
  { category: "bolsas", name: "Mochila de couro", price: 549.9, cost: 231, material: "Couro", art: "bolsa", sizes: ["U"], colors: [["Café", "#4A3426"]], featured: true },
  { category: "sapatos", name: "Tênis de couro minimalista", price: 459.9, cost: 176, material: "Couro", art: "sapato", sizes: ["39", "40", "41", "42", "43"], colors: [["Branco", "#F5F5F5"], ["Preto", "#111111"]] },
  { category: "acessorios", name: "Cinto de couro", price: 149.9, cost: 48, material: "Couro", art: "acessorio", sizes: ["90", "95", "100"], colors: [["Café", "#4A3426"], ["Preto", "#111111"]] },
];

const CUSTOMERS = [
  ["CLIENTE DEMO 01", "São Paulo", "SP"],
  ["CLIENTE DEMO 02", "Rio de Janeiro", "RJ"],
  ["CLIENTE DEMO 03", "Belo Horizonte", "MG"],
  ["CLIENTE DEMO 04", "Curitiba", "PR"],
  ["CLIENTE DEMO 05", "Recife", "PE"],
  ["CLIENTE DEMO 06", "Salvador", "BA"],
  ["CLIENTE DEMO 07", "Porto Alegre", "RS"],
  ["CLIENTE DEMO 08", "Goiânia", "GO"],
  ["CLIENTE DEMO 09", "Fortaleza", "CE"],
  ["CLIENTE DEMO 10", "Florianópolis", "SC"],
] as const;

const DEMO_USERS = [
  { name: "USUÁRIO DEMO · Gerente", email: "gerente.demo@demo.invalid", role: "GERENTE", brand: null, title: "Gerente de loja" },
  { name: "USUÁRIO DEMO · Vendedora FINA", email: "vendas.fina.demo@demo.invalid", role: "VENDEDOR", brand: "fina-classica", title: "Vendedora" },
  { name: "USUÁRIO DEMO · Estoque BRAVUS", email: "estoque.bravus.demo@demo.invalid", role: "ESTOQUE", brand: "bravus", title: "Assistente de estoque" },
  { name: "USUÁRIO DEMO · Financeiro", email: "financeiro.demo@demo.invalid", role: "FINANCEIRO", brand: null, title: "Analista financeiro" },
  { name: "USUÁRIO DEMO · Marketing", email: "marketing.demo@demo.invalid", role: "MARKETING", brand: null, title: "Marketing" },
] as const;

const PATHS: Record<string, OrderStatus[]> = {
  entregue: ["aguardando_pagamento", "pago", "em_preparacao", "enviado", "entregue"],
  enviado: ["aguardando_pagamento", "pago", "em_preparacao", "enviado"],
  em_preparacao: ["aguardando_pagamento", "pago", "em_preparacao"],
  pago: ["aguardando_pagamento", "pago"],
  aguardando_pagamento: ["aguardando_pagamento"],
  pedido_recebido: [],
  cancelado: ["cancelado"],
  devolvido: ["aguardando_pagamento", "pago", "em_preparacao", "enviado", "entregue", "devolvido"],
};

export async function seedDemoData(tx: Tx) {
  const rand = prng(20261001);
  const pick = <T>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

  const brands = await tx.select().from(schema.brands);
  const bySlug = new Map(brands.map((b) => [b.slug, b]));
  const roles = await tx.select().from(schema.roles);
  const roleByKey = new Map(roles.map((r) => [r.key, r]));
  const cats = await tx.select().from(schema.categories);

  // Usuários DEMO (sem senha: para entrar, o admin gera um link de redefinição).
  const demoUsers = [];
  for (const u of DEMO_USERS) {
    const [user] = await tx
      .insert(schema.users)
      .values({
        fullName: u.name,
        email: u.email,
        status: "pendente",
        jobTitle: u.title,
        admissionDate: "2026-01-15",
        isDemo: true,
      })
      .returning();
    await tx.insert(schema.userRoles).values({
      userId: user.id,
      roleId: roleByKey.get(u.role)!.id,
      brandId: u.brand ? bySlug.get(u.brand)!.id : null,
    });
    demoUsers.push(user);
  }
  const manager = demoUsers[0];
  const actor = { id: manager.id, fullName: manager.fullName, email: manager.email };

  const [team] = await tx
    .insert(schema.teams)
    .values({ name: "EQUIPE DEMO · Loja", description: "Time de demonstração", isDemo: true })
    .returning();
  await tx.insert(schema.teamMembers).values(demoUsers.slice(0, 3).map((u) => ({ teamId: team.id, userId: u.id })));

  // Fornecedores DEMO
  const suppliers = [];
  for (const [i, name] of ["FORNECEDOR DEMO · Tecidos", "FORNECEDOR DEMO · Calçados", "FORNECEDOR DEMO · Acessórios"].entries()) {
    const [s] = await tx
      .insert(schema.suppliers)
      .values({ name, contactName: "Contato DEMO", city: ["São Paulo", "Franca", "Belo Horizonte"][i], state: ["SP", "SP", "MG"][i], isDemo: true })
      .returning();
    suppliers.push(s);
  }

  // Produtos DEMO com variações e estoque inicial
  const variantsByBrand = new Map<string, { id: string; productId: string }[]>();
  for (const [brandSlug, list] of [
    ["fina-classica", FINA],
    ["bravus", BRAVUS],
  ] as const) {
    const brand = bySlug.get(brandSlug)!;
    const theme = brandSlug === "bravus" ? "dark" : "light";
    const variantList: { id: string; productId: string }[] = [];
    for (const [pi, p] of list.entries()) {
      const category = cats.find((c) => c.brandId === brand.id && c.slug === p.category)!;
      const supplier = p.art === "sapato" ? suppliers[1] : p.art === "acessorio" || p.art === "bolsa" ? suppliers[2] : suppliers[0];
      const code = `${brand.orderPrefix}-DEMO-${String(pi + 1).padStart(3, "0")}`;
      const createdDaysAgo = p.isNew ? int(2, 12) : int(40, 120);
      const [product] = await tx
        .insert(schema.products)
        .values({
          brandId: brand.id,
          categoryId: category.id,
          sku: code,
          slug: `demo-${p.name
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")}`,
          name: `PRODUTO DEMO · ${p.name}`,
          shortDescription: "Produto de demonstração — substitua pelos produtos reais no painel.",
          longDescription:
            "Este é um PRODUTO DEMO, criado apenas para demonstrar a loja e o painel. Preço, estoque, custo e imagens são fictícios. Use “Limpar dados DEMO” em Configurações para removê-lo.",
          costPrice: p.cost.toFixed(2),
          salePrice: p.price.toFixed(2),
          promoPrice: p.promo ? p.promo.toFixed(2) : null,
          material: p.material,
          supplierId: supplier.id,
          minStock: 2,
          status: "ativo",
          isNew: !!p.isNew,
          isFeatured: !!p.featured,
          tags: `${p.category} demo`,
          createdBy: manager.id,
          isDemo: true,
          createdAt: new Date(Date.now() - createdDaysAgo * 86400_000),
        })
        .returning();
      await tx.insert(schema.productImages).values([
        { productId: product.id, url: `/demo/${p.art}-${theme}.svg`, alt: `${p.name} (imagem DEMO)`, sortOrder: 0 },
        { productId: product.id, url: `/demo/${p.art}-${theme}-alt.svg`, alt: `${p.name} — detalhe (imagem DEMO)`, sortOrder: 1 },
      ]);
      let vi = 0;
      for (const [colorName, hex] of p.colors) {
        for (const size of p.sizes) {
          const [variant] = await tx
            .insert(schema.productVariants)
            .values({
              productId: product.id,
              brandId: brand.id,
              size,
              color: colorName,
              colorHex: hex,
              sku: `${code}-${size}-${colorName.slice(0, 3).toUpperCase()}`,
              minStock: 1,
              isDemo: true,
              sortOrder: vi++,
            })
            .returning();
          await tx.insert(schema.inventory).values({ variantId: variant.id, quantity: 0 });
          await applyMovement(tx, {
            variantId: variant.id,
            type: "cadastro",
            quantity: int(6, 14),
            unitCost: p.cost,
            supplierId: supplier.id,
            reason: "Estoque inicial DEMO",
            responsibleUserId: manager.id,
            occurredAt: new Date(Date.now() - createdDaysAgo * 86400_000),
            isDemo: true,
          });
          variantList.push({ id: variant.id, productId: product.id });
        }
      }
    }
    variantsByBrand.set(brand.id, variantList);
  }
  await tx.execute(sql`update public.inventory_movements set is_demo = true where reason = 'Estoque inicial DEMO'`);

  // Banners DEMO (capa de cada marca)
  for (const b of brands) {
    const theme = b.slug === "bravus" ? "dark" : "light";
    await tx.insert(schema.banners).values({
      brandId: b.id,
      placement: "home_hero",
      title: b.slug === "bravus" ? "Nova coleção" : "Coleção atemporal",
      subtitle: "Banner de demonstração — troque a imagem e o texto em Banners.",
      ctaLabel: "Ver novidades",
      imageUrl: `/demo/hero-${theme}.svg`,
      linkUrl: `/${b.slug}/novidades`,
      sortOrder: 0,
      publishedBy: manager.id,
      isDemo: true,
    });
  }

  // Clientes DEMO
  const customers = [];
  for (const [i, [name, city, state]] of CUSTOMERS.entries()) {
    const phone = `(11) 90000-${String(i + 1).padStart(4, "0")}`;
    customers.push({ name, phone, city, state });
  }

  // Vendas DEMO: criadas pelos serviços reais e depois datadas no passado.
  const weights: [string, number][] = [
    ["entregue", 34],
    ["enviado", 8],
    ["em_preparacao", 6],
    ["pago", 12],
    ["aguardando_pagamento", 10],
    ["pedido_recebido", 12],
    ["cancelado", 10],
    ["devolvido", 3],
  ];
  const pickStatus = () => {
    let r = rand() * 95;
    for (const [s, w] of weights) {
      if ((r -= w) <= 0) return s;
    }
    return "entregue";
  };
  const orderIds: { id: string; daysAgo: number }[] = [];
  for (let i = 0; i < 36; i++) {
    const brand = rand() < 0.55 ? bySlug.get("fina-classica")! : bySlug.get("bravus")!;
    const variants = variantsByBrand.get(brand.id)!;
    const nItems = rand() < 0.6 ? 1 : 2;
    const chosen = new Map<string, number>();
    for (let k = 0; k < nItems; k++) chosen.set(pick(variants).id, rand() < 0.85 ? 1 : 2);
    const c = pick(customers);
    let daysAgo = int(0, 75);
    const target = pickStatus();
    if (target === "pedido_recebido" || target === "aguardando_pagamento") daysAgo = int(0, 4);
    try {
      // Savepoint por pedido: uma falha não compromete o restante da carga DEMO.
      const created = await tx.transaction((sp) => runInTx(sp, async () => {
      const created = await createOrder(
        {
          brandId: brand.id,
          items: [...chosen.entries()].map(([variantId, quantity]) => ({ variantId, quantity })),
          customer: {
            name: c.name,
            phone: c.phone,
            whatsapp: null,
            email: null,
            address: "Endereço DEMO, 100",
            city: c.city,
            state: c.state,
            zip: "00000-000",
            notes: rand() < 0.3 ? "Observação DEMO" : null,
          },
          whatsappOptIn: rand() < 0.5,
          paymentMethod: pick(["pix", "cartao_credito", "pix", "dinheiro"]),
          idempotencyKey: `demo-order-${i}`,
        },
        { source: "loja", isDemo: true },
      );
      for (const status of PATHS[target]) {
        await changeOrderStatus(created.id, status, { actor, note: "Movimentação DEMO", isDemo: true });
      }
      return created;
      }));
      orderIds.push({ id: created.id, daysAgo });
    } catch {
      // Variação sem estoque suficiente — ignora este pedido DEMO.
    }
  }

  // Retrodata pedidos e tudo o que foi gerado por eles.
  for (const o of orderIds) {
    const at = new Date(Date.now() - o.daysAgo * 86400_000 - int(1, 10) * 3600_000);
    const day = new Date(at.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
    await tx.update(schema.orders).set({ createdAt: at, updatedAt: at }).where(eq(schema.orders.id, o.id));
    await tx.execute(sql`update public.order_status_history
      set created_at = ${at.toISOString()}::timestamptz + (row_number_offset * interval '7 hours')
      from (select id as hid, row_number() over (order by created_at) - 1 as row_number_offset
            from public.order_status_history where order_id = ${o.id}) h
      where public.order_status_history.id = h.hid`);
    await tx.execute(sql`update public.inventory_movements set occurred_at = ${at.toISOString()}::timestamptz + interval '7 hours',
      created_at = ${at.toISOString()}::timestamptz + interval '7 hours' where order_id = ${o.id}`);
    await tx.execute(sql`update public.financial_entries set occurred_on = ${day}::date, created_at = ${at.toISOString()}::timestamptz
      where order_id = ${o.id}`);
    await tx.execute(sql`update public.analytics_events set created_at = ${at.toISOString()}::timestamptz where order_id = ${o.id}`);
    await tx.execute(sql`update public.whatsapp_messages_log set created_at = ${at.toISOString()}::timestamptz where order_id = ${o.id}`);
    await tx.execute(sql`update public.audit_logs set created_at = ${at.toISOString()}::timestamptz where entity_id = ${o.id}`);
  }
  if (orderIds.length) {
    const ids = orderIds.map((o) => o.id);
    await tx.update(schema.orders).set({ isDemo: true }).where(inArray(schema.orders.id, ids));
  }
  await tx.update(schema.customers).set({ isDemo: true }).where(sql`${schema.customers.name} like 'CLIENTE DEMO%'`);

  // Duas variações esgotadas por marca (demonstra os alertas).
  for (const [, variants] of variantsByBrand) {
    for (const v of variants.slice(-2)) {
      const [inv] = await tx.select().from(schema.inventory).where(eq(schema.inventory.variantId, v.id));
      if (inv && inv.quantity > 0) {
        await applyMovement(tx, {
          variantId: v.id,
          type: "perda",
          quantity: -inv.quantity,
          reason: "Ajuste DEMO (demonstra alerta de esgotado)",
          responsibleUserId: manager.id,
          isDemo: true,
        });
      }
    }
  }

  // Funil DEMO (últimos 30 dias), inserido em lotes.
  const events: (typeof schema.analyticsEvents.$inferInsert)[] = [];
  for (let d = 29; d >= 0; d--) {
    for (const b of brands) {
      const visitors = int(18, 55);
      for (let v = 0; v < visitors; v++) {
        const visitorId = `demo-${b.orderPrefix}-${d}-${v}`;
        const createdAt = new Date(Date.now() - d * 86400_000 - int(0, 20) * 3600_000);
        const base = { brandId: b.id, visitorId, isDemo: true, createdAt };
        events.push({ ...base, type: "page_view", path: `/${b.slug}` });
        if (rand() < 0.62) {
          const variant = pick(variantsByBrand.get(b.id)!);
          events.push({ ...base, type: "product_view", productId: variant.productId });
          if (rand() < 0.38) {
            events.push({ ...base, type: "add_to_cart", productId: variant.productId });
            if (rand() < 0.45) events.push({ ...base, type: "begin_checkout" });
          }
        }
      }
    }
  }
  for (let i = 0; i < events.length; i += 500) {
    await tx.insert(schema.analyticsEvents).values(events.slice(i, i + 500));
  }

  // Financeiro DEMO: despesas mensais e uma receita avulsa.
  const today = new Date();
  for (let m = 0; m < 3; m++) {
    const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - m, 5)).toISOString().slice(0, 10);
    const rows: [string, string, number][] = [
      ["despesas_operacionais", "Despesa DEMO · aluguel", 3200],
      ["marketing", "Despesa DEMO · anúncios", 850],
      ["fretes", "Despesa DEMO · fretes do mês", 420],
      ["compra_produtos", "Compra DEMO · reposição de estoque", 2600],
    ];
    for (const [category, description, amount] of rows) {
      await tx.insert(schema.financialExpenses).values({
        category,
        description,
        amount: (amount * (0.85 + rand() * 0.3)).toFixed(2),
        occurredOn: date,
        brandId: category === "despesas_operacionais" ? null : pick(brands).id,
        supplierId: category === "compra_produtos" ? suppliers[0].id : null,
        createdBy: demoUsers[3].id,
        isDemo: true,
      });
    }
  }
  await tx.insert(schema.financialEntries).values({
    kind: "outra_receita",
    description: "Receita DEMO · ajuste de caixa",
    amount: "150.00",
    occurredOn: new Date().toISOString().slice(0, 10),
    category: "outras",
    createdBy: demoUsers[3].id,
    isDemo: true,
  });

  // Ideias e produtos planejados DEMO
  await tx.insert(schema.ideas).values([
    { title: "IDEIA DEMO · Programa de fidelidade", description: "Pontos por compra nas duas marcas.", category: "Relacionamento", priority: "alta", status: "planejado", responsibleUserId: demoUsers[4].id, ideaDate: "2026-09-10", createdBy: manager.id, isDemo: true },
    { title: "IDEIA DEMO · Cupom de primeira compra", description: "Desconto no primeiro pedido.", category: "Vendas", priority: "media", status: "ideia", ideaDate: "2026-09-18", createdBy: manager.id, isDemo: true },
    { title: "IDEIA DEMO · Lookbook mensal", description: "Conteúdo editorial por marca.", category: "Conteúdo", priority: "baixa", status: "em_andamento", responsibleUserId: demoUsers[4].id, ideaDate: "2026-08-30", createdBy: manager.id, isDemo: true },
  ]);
  const fina = bySlug.get("fina-classica")!;
  const bravus = bySlug.get("bravus")!;
  await tx.insert(schema.plannedProducts).values([
    { brandId: fina.id, name: "PLANEJADO DEMO · Trench coat", categoryId: cats.find((c) => c.brandId === fina.id && c.slug === "vestidos")?.id, supplierId: suppliers[0].id, estimatedCost: "260.00", estimatedPrice: "649.90", plannedQuantity: 20, status: "cotacao", createdBy: manager.id, isDemo: true },
    { brandId: bravus.id, name: "PLANEJADO DEMO · Blazer de linho", categoryId: cats.find((c) => c.brandId === bravus.id && c.slug === "camisas")?.id, supplierId: suppliers[0].id, estimatedCost: "310.00", estimatedPrice: "799.90", plannedQuantity: 15, status: "pesquisa", createdBy: manager.id, isDemo: true },
    { brandId: bravus.id, name: "PLANEJADO DEMO · Loafer de camurça", categoryId: cats.find((c) => c.brandId === bravus.id && c.slug === "sapatos")?.id, supplierId: suppliers[1].id, estimatedCost: "190.00", estimatedPrice: "489.90", plannedQuantity: 24, status: "aguardando_compra", createdBy: manager.id, isDemo: true },
  ]);

  await tx
    .insert(schema.appSettings)
    .values({ key: "demo", value: { seeded_at: new Date().toISOString() } })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value: { seeded_at: new Date().toISOString() } } });

  return { orders: orderIds.length };
}

