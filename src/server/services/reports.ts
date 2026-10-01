/**
 * Relatórios (§18) e desempenho dos produtos (§19). Cada relatório declara
 * colunas, filtros (marca, categoria, período, status) e o módulo exigido;
 * todos têm paginação e exportação (CSV, Excel e impressão/PDF).
 */
import { sql, type SQL } from "drizzle-orm";
import { getDb, rowsOf } from "../db";
import { brandSql, SALE_STATUS_LIST } from "../sql";
import type { ResolvedPeriod } from "@/lib/period";
import type { Module } from "@/lib/domain";

export type ColumnType = "text" | "money" | "number" | "date" | "datetime" | "percent" | "status" | "brand";
export type ReportColumn = { key: string; label: string; type?: ColumnType };
export type ReportParams = {
  period: ResolvedPeriod;
  scope: "all" | string[];
  brandId?: string | null;
  categoryId?: string | null;
  status?: string | null;
  page: number;
  perPage: number;
  all?: boolean;
};
export type ReportDef = {
  slug: string;
  title: string;
  description: string;
  module: Module;
  filters: ("period" | "brand" | "category" | "status")[];
  statusOptions?: Record<string, string>;
  columns: ReportColumn[];
  query: (p: ReportParams) => SQL;
};

const periodOn = (col: SQL, p: ReportParams) =>
  sql`${col} >= ${p.period.from.toISOString()} and ${col} < ${p.period.to.toISOString()}`;
const dateOn = (col: SQL, p: ReportParams) => sql`${col} >= ${p.period.fromDate} and ${col} <= ${p.period.toDate}`;
const catOn = (p: ReportParams, alias = "p") =>
  p.categoryId ? sql`(${sql.raw(alias)}.category_id = ${p.categoryId} or ${sql.raw(alias)}.subcategory_id = ${p.categoryId})` : sql`true`;

const soldCte = (p: ReportParams) => sql`
  sold as (
    select oi.product_id, sum(oi.quantity)::int as units, sum(oi.total)::float as revenue,
           sum(coalesce(oi.unit_cost, 0) * oi.quantity)::float as cost,
           count(*) filter (where oi.unit_cost is null)::int as missing_cost
    from public.order_items oi join public.orders o on o.id = oi.order_id
    where o.deleted_at is null and o.status in ${SALE_STATUS_LIST} and ${periodOn(sql`o.created_at`, p)}
    group by oi.product_id
  ),
  stock as (
    select v.product_id, coalesce(sum(i.quantity), 0)::int as qty
    from public.product_variants v left join public.inventory i on i.variant_id = v.id
    where v.deleted_at is null group by v.product_id
  )`;

export const REPORTS: ReportDef[] = [
  {
    slug: "vendas",
    title: "Vendas",
    description: "Pedidos efetivados (pagos, em preparação, enviados e entregues) no período.",
    module: "pedidos",
    filters: ["period", "brand"],
    columns: [
      { key: "pedido", label: "Pedido" },
      { key: "data", label: "Data", type: "datetime" },
      { key: "marca", label: "Marca", type: "brand" },
      { key: "cliente", label: "Cliente" },
      { key: "itens", label: "Itens", type: "number" },
      { key: "subtotal", label: "Subtotal", type: "money" },
      { key: "desconto", label: "Desconto", type: "money" },
      { key: "frete", label: "Frete", type: "money" },
      { key: "total", label: "Total", type: "money" },
      { key: "pagamento", label: "Pagamento" },
      { key: "status", label: "Status", type: "status" },
    ],
    query: (p) => sql`
      select b.order_prefix || '-' || lpad(o.number::text, 6, '0') as pedido, o.created_at as data, o.brand_id as marca,
             o.customer_name as cliente, (select sum(quantity) from public.order_items oi where oi.order_id = o.id)::int as itens,
             o.subtotal::float as subtotal, o.discount::float as desconto, o.shipping::float as frete, o.total::float as total,
             coalesce(o.payment_method, 'Não informado') as pagamento, o.status
      from public.orders o join public.brands b on b.id = o.brand_id
      where o.deleted_at is null and o.status in ${SALE_STATUS_LIST} and ${periodOn(sql`o.created_at`, p)}
        and ${brandSql(sql`o.brand_id`, p.scope, p.brandId)}
      order by o.created_at desc`,
  },
  {
    slug: "pedidos",
    title: "Pedidos",
    description: "Todos os pedidos do período, com filtro por status.",
    module: "pedidos",
    filters: ["period", "brand", "status"],
    columns: [
      { key: "pedido", label: "Pedido" },
      { key: "data", label: "Data", type: "datetime" },
      { key: "marca", label: "Marca", type: "brand" },
      { key: "cliente", label: "Cliente" },
      { key: "telefone", label: "Telefone" },
      { key: "total", label: "Total", type: "money" },
      { key: "origem", label: "Origem" },
      { key: "envio", label: "Canal WhatsApp" },
      { key: "status", label: "Status", type: "status" },
    ],
    query: (p) => sql`
      select b.order_prefix || '-' || lpad(o.number::text, 6, '0') as pedido, o.created_at as data, o.brand_id as marca,
             o.customer_name as cliente, o.customer_phone as telefone, o.total::float as total, o.source as origem,
             o.delivery_method as envio, o.status
      from public.orders o join public.brands b on b.id = o.brand_id
      where o.deleted_at is null and ${periodOn(sql`o.created_at`, p)} and ${brandSql(sql`o.brand_id`, p.scope, p.brandId)}
        and ${p.status ? sql`o.status = ${p.status}` : sql`true`}
      order by o.created_at desc`,
  },
  {
    slug: "produtos",
    title: "Produtos",
    description: "Catálogo com preços, custo, margem, estoque e quantidade vendida (total).",
    module: "produtos",
    filters: ["brand", "category", "status"],
    statusOptions: { ativo: "Ativo", inativo: "Inativo", rascunho: "Rascunho" },
    columns: [
      { key: "sku", label: "SKU" },
      { key: "produto", label: "Produto" },
      { key: "marca", label: "Marca", type: "brand" },
      { key: "categoria", label: "Categoria" },
      { key: "preco", label: "Preço", type: "money" },
      { key: "promocional", label: "Promocional", type: "money" },
      { key: "custo", label: "Custo", type: "money" },
      { key: "margem", label: "Margem", type: "percent" },
      { key: "estoque", label: "Estoque", type: "number" },
      { key: "vendidos", label: "Vendidos", type: "number" },
      { key: "status", label: "Status" },
    ],
    query: (p) => sql`
      select p.sku, p.name as produto, p.brand_id as marca, c.name as categoria, p.sale_price::float as preco,
             p.promo_price::float as promocional, p.cost_price::float as custo, p.margin_percent::float as margem,
             coalesce((select sum(i.quantity) from public.inventory i join public.product_variants v on v.id = i.variant_id
                       where v.product_id = p.id and v.deleted_at is null), 0)::int as estoque,
             p.quantity_sold as vendidos, p.status
      from public.products p left join public.categories c on c.id = p.category_id
      where p.deleted_at is null and ${brandSql(sql`p.brand_id`, p.scope, p.brandId)} and ${catOn(p)}
        and ${p.status ? sql`p.status = ${p.status}` : sql`true`}
      order by p.name`,
  },
  {
    slug: "estoque",
    title: "Estoque",
    description: "Saldo por variação, mínimo, situação e valor de estoque a custo.",
    module: "estoque",
    filters: ["brand", "category", "status"],
    statusOptions: { ok: "Normal", baixo: "Estoque baixo", esgotado: "Esgotado" },
    columns: [
      { key: "sku", label: "SKU" },
      { key: "produto", label: "Produto" },
      { key: "variacao", label: "Variação" },
      { key: "marca", label: "Marca", type: "brand" },
      { key: "saldo", label: "Saldo", type: "number" },
      { key: "minimo", label: "Mínimo", type: "number" },
      { key: "situacao", label: "Situação" },
      { key: "valor_custo", label: "Valor a custo", type: "money" },
    ],
    query: (p) => sql`
      select * from (
        select v.sku, p.name as produto, concat_ws(' · ', v.size, v.color) as variacao, p.brand_id as marca,
               coalesce(sum(i.quantity), 0)::int as saldo, greatest(v.min_stock, p.min_stock) as minimo,
               case when coalesce(sum(i.quantity), 0) = 0 then 'Esgotado'
                    when coalesce(sum(i.quantity), 0) <= greatest(v.min_stock, p.min_stock) then 'Estoque baixo'
                    else 'Normal' end as situacao,
               case when p.cost_price is null then null else (coalesce(sum(i.quantity), 0) * p.cost_price)::float end as valor_custo
        from public.product_variants v join public.products p on p.id = v.product_id
        left join public.inventory i on i.variant_id = v.id
        where v.deleted_at is null and p.deleted_at is null and ${brandSql(sql`p.brand_id`, p.scope, p.brandId)} and ${catOn(p)}
        group by v.id, p.id
      ) t
      where ${p.status === "esgotado" ? sql`situacao = 'Esgotado'` : p.status === "baixo" ? sql`situacao = 'Estoque baixo'` : p.status === "ok" ? sql`situacao = 'Normal'` : sql`true`}
      order by produto, variacao`,
  },
  {
    slug: "financeiro",
    title: "Financeiro",
    description: "Entradas e saídas lançadas no período.",
    module: "financeiro",
    filters: ["period", "brand"],
    columns: [
      { key: "data", label: "Data", type: "date" },
      { key: "tipo", label: "Tipo" },
      { key: "categoria", label: "Categoria" },
      { key: "descricao", label: "Descrição" },
      { key: "marca", label: "Marca", type: "brand" },
      { key: "valor", label: "Valor", type: "money" },
      { key: "lancado_por", label: "Lançado por" },
    ],
    query: (p) => sql`
      select * from (
        select e.occurred_on as data, 'Entrada' as tipo, e.kind as categoria, e.description as descricao, e.brand_id as marca,
               e.amount::float as valor, u.full_name as lancado_por, e.created_at
        from public.financial_entries e left join public.users u on u.id = e.created_by
        where e.deleted_at is null and ${dateOn(sql`e.occurred_on`, p)} and ${brandSql(sql`e.brand_id`, p.scope, p.brandId, !p.brandId)}
        union all
        select x.occurred_on, 'Saída', x.category, x.description, x.brand_id, (-x.amount)::float, u.full_name, x.created_at
        from public.financial_expenses x left join public.users u on u.id = x.created_by
        where x.deleted_at is null and ${dateOn(sql`x.occurred_on`, p)} and ${brandSql(sql`x.brand_id`, p.scope, p.brandId, !p.brandId)}
      ) t order by data desc, created_at desc`,
  },
  {
    slug: "clientes",
    title: "Clientes",
    description: "Clientes com compras no período: quantidade, valor e ticket médio.",
    module: "clientes",
    filters: ["period", "brand"],
    columns: [
      { key: "cliente", label: "Cliente" },
      { key: "telefone", label: "Telefone" },
      { key: "cidade", label: "Cidade/UF" },
      { key: "compras", label: "Compras", type: "number" },
      { key: "valor_total", label: "Valor total", type: "money" },
      { key: "ticket_medio", label: "Ticket médio", type: "money" },
      { key: "ultima_compra", label: "Última compra", type: "datetime" },
    ],
    query: (p) => sql`
      select c.name as cliente, c.phone as telefone, concat_ws('/', c.city, c.state) as cidade,
             count(o.id)::int as compras, sum(o.total)::float as valor_total, (sum(o.total) / count(o.id))::float as ticket_medio,
             max(o.created_at) as ultima_compra
      from public.customers c join public.orders o on o.customer_id = c.id
      where c.deleted_at is null and o.deleted_at is null and o.status in ${SALE_STATUS_LIST}
        and ${periodOn(sql`o.created_at`, p)} and ${brandSql(sql`o.brand_id`, p.scope, p.brandId)}
      group by c.id order by valor_total desc`,
  },
  {
    slug: "categorias",
    title: "Categorias",
    description: "Vendas por categoria no período e quantidade de produtos ativos.",
    module: "produtos",
    filters: ["period", "brand"],
    columns: [
      { key: "categoria", label: "Categoria" },
      { key: "marca", label: "Marca", type: "brand" },
      { key: "produtos", label: "Produtos ativos", type: "number" },
      { key: "unidades", label: "Unidades vendidas", type: "number" },
      { key: "receita", label: "Receita", type: "money" },
    ],
    query: (p) => sql`
      select c.name as categoria, c.brand_id as marca,
             (select count(*) from public.products pp where pp.category_id = c.id and pp.deleted_at is null and pp.status = 'ativo')::int as produtos,
             coalesce(sum(oi.quantity), 0)::int as unidades, coalesce(sum(oi.total), 0)::float as receita
      from public.categories c
      left join public.products p on p.category_id = c.id
      left join public.order_items oi on oi.product_id = p.id
        and exists (select 1 from public.orders o where o.id = oi.order_id and o.deleted_at is null
                    and o.status in ${SALE_STATUS_LIST} and ${periodOn(sql`o.created_at`, p)})
      where c.deleted_at is null and c.kind = 'padrao' and ${brandSql(sql`c.brand_id`, p.scope, p.brandId)}
      group by c.id order by receita desc, c.sort_order`,
  },
  {
    slug: "entradas",
    title: "Entradas de estoque",
    description: "Entradas de mercadoria e cadastros iniciais no período (fornecedor, custo unitário e total).",
    module: "estoque",
    filters: ["period", "brand", "category"],
    columns: [
      { key: "data", label: "Data", type: "datetime" },
      { key: "produto", label: "Produto" },
      { key: "variacao", label: "Variação" },
      { key: "marca", label: "Marca", type: "brand" },
      { key: "fornecedor", label: "Fornecedor" },
      { key: "quantidade", label: "Quantidade", type: "number" },
      { key: "custo_unitario", label: "Custo unitário", type: "money" },
      { key: "custo_total", label: "Custo total", type: "money" },
      { key: "responsavel", label: "Responsável" },
    ],
    query: (p) => sql`
      select m.occurred_at as data, p.name as produto, concat_ws(' · ', v.size, v.color) as variacao, m.brand_id as marca,
             s.name as fornecedor, m.quantity as quantidade, m.unit_cost::float as custo_unitario, m.total_cost::float as custo_total,
             u.full_name as responsavel
      from public.inventory_movements m
      join public.products p on p.id = m.product_id join public.product_variants v on v.id = m.variant_id
      left join public.suppliers s on s.id = m.supplier_id left join public.users u on u.id = m.responsible_user_id
      where m.type in ('entrada', 'cadastro') and ${periodOn(sql`m.occurred_at`, p)}
        and ${brandSql(sql`m.brand_id`, p.scope, p.brandId)} and ${catOn(p)}
      order by m.occurred_at desc`,
  },
  {
    slug: "saidas",
    title: "Saídas de estoque",
    description: "Vendas, saídas manuais e perdas no período.",
    module: "estoque",
    filters: ["period", "brand", "category"],
    columns: [
      { key: "data", label: "Data", type: "datetime" },
      { key: "tipo", label: "Tipo" },
      { key: "produto", label: "Produto" },
      { key: "variacao", label: "Variação" },
      { key: "marca", label: "Marca", type: "brand" },
      { key: "quantidade", label: "Quantidade", type: "number" },
      { key: "motivo", label: "Motivo" },
      { key: "responsavel", label: "Responsável" },
    ],
    query: (p) => sql`
      select m.occurred_at as data, m.type as tipo, p.name as produto, concat_ws(' · ', v.size, v.color) as variacao,
             m.brand_id as marca, abs(m.quantity) as quantidade, m.reason as motivo, u.full_name as responsavel
      from public.inventory_movements m
      join public.products p on p.id = m.product_id join public.product_variants v on v.id = m.variant_id
      left join public.users u on u.id = m.responsible_user_id
      where m.quantity < 0 and m.type in ('venda', 'saida', 'perda', 'ajuste', 'inventario')
        and ${periodOn(sql`m.occurred_at`, p)} and ${brandSql(sql`m.brand_id`, p.scope, p.brandId)} and ${catOn(p)}
      order by m.occurred_at desc`,
  },
  {
    slug: "margem",
    title: "Margem",
    description: "Margem cadastrada e margem realizada nas vendas do período (usa o custo gravado no pedido).",
    module: "financeiro",
    filters: ["period", "brand", "category"],
    columns: [
      { key: "produto", label: "Produto" },
      { key: "marca", label: "Marca", type: "brand" },
      { key: "margem_cadastrada", label: "Margem cadastrada", type: "percent" },
      { key: "receita", label: "Receita", type: "money" },
      { key: "custo", label: "Custo (CMV)", type: "money" },
      { key: "lucro_bruto", label: "Lucro bruto", type: "money" },
      { key: "margem_realizada", label: "Margem realizada", type: "percent" },
      { key: "obs", label: "Observação" },
    ],
    query: (p) => sql`
      with ${soldCte(p)}
      select p.name as produto, p.brand_id as marca, p.margin_percent::float as margem_cadastrada,
             s.revenue as receita, s.cost as custo, (s.revenue - s.cost) as lucro_bruto,
             case when s.revenue > 0 and s.missing_cost = 0 then ((s.revenue - s.cost) / s.revenue * 100) end as margem_realizada,
             case when s.missing_cost > 0 then 'Custo não informado em ' || s.missing_cost || ' item(ns)' end as obs
      from sold s join public.products p on p.id = s.product_id
      where ${brandSql(sql`p.brand_id`, p.scope, p.brandId)} and ${catOn(p)}
      order by s.revenue desc`,
  },
  {
    slug: "mais-vendidos",
    title: "Mais vendidos",
    description: "Ranking de unidades vendidas no período.",
    module: "produtos",
    filters: ["period", "brand", "category"],
    columns: [
      { key: "produto", label: "Produto" },
      { key: "sku", label: "SKU" },
      { key: "marca", label: "Marca", type: "brand" },
      { key: "vendidos", label: "Vendidos", type: "number" },
      { key: "receita", label: "Receita", type: "money" },
      { key: "estoque", label: "Estoque", type: "number" },
    ],
    query: (p) => sql`
      with ${soldCte(p)}
      select p.name as produto, p.sku, p.brand_id as marca, s.units as vendidos, s.revenue as receita, coalesce(st.qty, 0) as estoque
      from sold s join public.products p on p.id = s.product_id left join stock st on st.product_id = p.id
      where ${brandSql(sql`p.brand_id`, p.scope, p.brandId)} and ${catOn(p)}
      order by s.units desc, s.revenue desc`,
  },
  {
    slug: "sem-venda",
    title: "Sem venda",
    description: "Produtos ativos que não venderam no período.",
    module: "produtos",
    filters: ["period", "brand", "category"],
    columns: [
      { key: "produto", label: "Produto" },
      { key: "sku", label: "SKU" },
      { key: "marca", label: "Marca", type: "brand" },
      { key: "cadastro", label: "Cadastrado em", type: "date" },
      { key: "estoque", label: "Estoque", type: "number" },
      { key: "preco", label: "Preço", type: "money" },
    ],
    query: (p) => sql`
      with ${soldCte(p)}
      select p.name as produto, p.sku, p.brand_id as marca, p.created_at as cadastro, coalesce(st.qty, 0) as estoque,
             coalesce(p.promo_price, p.sale_price)::float as preco
      from public.products p left join sold s on s.product_id = p.id left join stock st on st.product_id = p.id
      where p.deleted_at is null and p.status = 'ativo' and s.product_id is null
        and ${brandSql(sql`p.brand_id`, p.scope, p.brandId)} and ${catOn(p)}
      order by p.created_at`,
  },
  {
    slug: "desempenho",
    title: "Desempenho dos produtos",
    description: "Produto | Vendidos | Receita | Estoque | Margem — por marca, categoria e período (§19).",
    module: "produtos",
    filters: ["period", "brand", "category"],
    columns: [
      { key: "produto", label: "Produto" },
      { key: "marca", label: "Marca", type: "brand" },
      { key: "vendidos", label: "Vendidos", type: "number" },
      { key: "receita", label: "Receita", type: "money" },
      { key: "estoque", label: "Estoque", type: "number" },
      { key: "margem", label: "Margem", type: "percent" },
      { key: "indicador", label: "Indicador" },
    ],
    query: (p) => sql`
      with ${soldCte(p)},
      base as (
        select p.id, p.name as produto, p.brand_id as marca, coalesce(s.units, 0) as vendidos, coalesce(s.revenue, 0) as receita,
               coalesce(st.qty, 0) as estoque, p.margin_percent::float as margem, p.min_stock
        from public.products p left join sold s on s.product_id = p.id left join stock st on st.product_id = p.id
        where p.deleted_at is null and p.status = 'ativo' and ${brandSql(sql`p.brand_id`, p.scope, p.brandId)} and ${catOn(p)}
      )
      select produto, marca, vendidos, receita, estoque, margem,
             concat_ws(', ',
               case when vendidos > 0 and vendidos = (select max(vendidos) from base) then 'Mais vendido' end,
               case when receita > 0 and receita = (select max(receita) from base) then 'Maior faturamento' end,
               case when estoque > 0 and estoque = (select max(estoque) from base) then 'Maior quantidade em estoque' end,
               case when vendidos = 0 then 'Sem vendas' end,
               case when estoque <= min_stock then 'Baixo estoque' end) as indicador
      from base order by vendidos desc, receita desc, produto`,
  },
];

export function getReport(slug: string) {
  return REPORTS.find((r) => r.slug === slug) ?? null;
}

export async function runReport(def: ReportDef, p: ReportParams) {
  const db = await getDb();
  const inner = def.query(p);
  const limit = p.all ? sql`limit 20000` : sql`limit ${p.perPage} offset ${(p.page - 1) * p.perPage}`;
  const rows = rowsOf<Record<string, unknown>>(
    await db.execute(sql`select t.*, count(*) over()::int as __total from (${inner}) t ${limit}`),
  );
  const total = Number(rows[0]?.__total ?? 0);
  for (const r of rows) delete r.__total;
  return { rows, total, pages: Math.max(1, Math.ceil(total / p.perPage)) };
}
