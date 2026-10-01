/**
 * Vocabulário do domínio compartilhado entre servidor e interface:
 * status, módulos, ações e rótulos em português.
 */

// ---------------------------------------------------------------------------
// RBAC (§35.3)
// ---------------------------------------------------------------------------
export const MODULES = [
  "produtos",
  "categorias",
  "estoque",
  "pedidos",
  "clientes",
  "fornecedores",
  "financeiro",
  "relatorios",
  "analytics",
  "whatsapp",
  "automacoes",
  "banners",
  "cms",
  "ideias",
  "produtos_planejados",
  "usuarios",
  "permissoes",
  "configuracoes",
  "auditoria",
] as const;
export type Module = (typeof MODULES)[number];

export const ACTIONS = [
  "visualizar",
  "criar",
  "editar",
  "excluir",
  "exportar",
  "aprovar",
  "configurar",
  "convidar",
  "revogar",
] as const;
export type Action = (typeof ACTIONS)[number];

export const MODULE_LABELS: Record<Module, string> = {
  produtos: "Produtos",
  categorias: "Categorias",
  estoque: "Estoque",
  pedidos: "Pedidos",
  clientes: "Clientes",
  fornecedores: "Fornecedores",
  financeiro: "Financeiro",
  relatorios: "Relatórios",
  analytics: "Analytics",
  whatsapp: "WhatsApp",
  automacoes: "Automações",
  banners: "Banners",
  cms: "CMS / Identidade visual",
  ideias: "Ideias",
  produtos_planejados: "Produtos planejados",
  usuarios: "Usuários",
  permissoes: "Permissões",
  configuracoes: "Configurações",
  auditoria: "Auditoria",
};

export const ACTION_LABELS: Record<Action, string> = {
  visualizar: "Visualizar",
  criar: "Criar",
  editar: "Editar",
  excluir: "Excluir",
  exportar: "Exportar",
  aprovar: "Aprovar",
  configurar: "Configurar",
  convidar: "Convidar",
  revogar: "Revogar",
};

export const OWNER_ROLE_KEY = "ADMINISTRADOR_PRINCIPAL";
export const PARTNER_ROLE_KEY = "SOCIO";
export const CUSTOM_ROLE_KEY = "PERSONALIZADO";

export const USER_STATUS_LABELS: Record<string, string> = {
  ativo: "Ativo",
  inativo: "Inativo",
  suspenso: "Suspenso",
  pendente: "Pendente",
};

export const INVITATION_STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  aceito: "Aceito",
  expirado: "Expirado",
  revogado: "Revogado",
};

// ---------------------------------------------------------------------------
// Pedidos (§10)
// ---------------------------------------------------------------------------
export const ORDER_STATUSES = [
  "carrinho_abandonado",
  "aguardando_confirmacao",
  "pedido_recebido",
  "aguardando_pagamento",
  "pago",
  "em_preparacao",
  "enviado",
  "entregue",
  "cancelado",
  "devolvido",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  carrinho_abandonado: "Carrinho abandonado",
  aguardando_confirmacao: "Aguardando confirmação",
  pedido_recebido: "Pedido recebido",
  aguardando_pagamento: "Aguardando pagamento",
  pago: "Pago",
  em_preparacao: "Em preparação",
  enviado: "Enviado",
  entregue: "Entregue",
  cancelado: "Cancelado",
  devolvido: "Devolvido",
};

/**
 * Status em que o pedido está CONFIRMADO pela loja: a baixa de estoque
 * acontece ao entrar em qualquer um deles (§21.6, §37).
 */
export const STOCK_COMMITTED_STATUSES: OrderStatus[] = [
  "aguardando_pagamento",
  "pago",
  "em_preparacao",
  "enviado",
  "entregue",
];

/** Status em que a receita da venda é reconhecida no financeiro (§39). */
export const REVENUE_STATUSES: OrderStatus[] = ["pago", "em_preparacao", "enviado", "entregue"];

/** Status que contam como venda realizada nos dashboards. */
export const SALE_STATUSES: OrderStatus[] = REVENUE_STATUSES;

export const ORDER_STATUS_TONES: Record<OrderStatus, "neutral" | "info" | "warning" | "success" | "danger"> = {
  carrinho_abandonado: "neutral",
  aguardando_confirmacao: "warning",
  pedido_recebido: "info",
  aguardando_pagamento: "warning",
  pago: "success",
  em_preparacao: "info",
  enviado: "info",
  entregue: "success",
  cancelado: "danger",
  devolvido: "danger",
};

export const PAYMENT_METHODS = ["pix", "cartao_credito", "cartao_debito", "dinheiro", "boleto", "transferencia", "a_combinar"] as const;
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pix: "PIX",
  cartao_credito: "Cartão de crédito",
  cartao_debito: "Cartão de débito",
  dinheiro: "Dinheiro",
  boleto: "Boleto",
  transferencia: "Transferência",
  a_combinar: "A combinar",
};

// ---------------------------------------------------------------------------
// Estoque (§13)
// ---------------------------------------------------------------------------
export const MOVEMENT_TYPES = [
  "cadastro",
  "entrada",
  "saida",
  "ajuste",
  "transferencia",
  "perda",
  "devolucao",
  "inventario",
  "venda",
  "cancelamento",
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  cadastro: "Cadastro",
  entrada: "Entrada",
  saida: "Saída",
  ajuste: "Ajuste",
  transferencia: "Transferência",
  perda: "Perda",
  devolucao: "Devolução",
  inventario: "Inventário",
  venda: "Venda",
  cancelamento: "Cancelamento de venda",
};

/** Tipos que o usuário lança manualmente no painel. */
export const MANUAL_MOVEMENT_TYPES: MovementType[] = ["entrada", "saida", "ajuste", "perda", "devolucao", "inventario"];

// ---------------------------------------------------------------------------
// Financeiro (§16)
// ---------------------------------------------------------------------------
export const ENTRY_KIND_LABELS: Record<string, string> = {
  venda: "Venda",
  outra_receita: "Outra receita",
  estorno: "Estorno",
};

export const EXPENSE_CATEGORIES = [
  "compra_produtos",
  "fornecedores",
  "fretes",
  "despesas_operacionais",
  "marketing",
  "outros",
] as const;
export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  compra_produtos: "Compra de produtos",
  fornecedores: "Fornecedores",
  fretes: "Fretes",
  despesas_operacionais: "Despesas operacionais",
  marketing: "Marketing",
  outros: "Outros custos",
};
/** Categorias que são CUSTO (mercadoria) — o resto é DESPESA. */
export const COST_CATEGORIES = ["compra_produtos", "fornecedores"];

// ---------------------------------------------------------------------------
// Produtos, ideias, planejamento
// ---------------------------------------------------------------------------
export const PRODUCT_STATUS_LABELS: Record<string, string> = {
  ativo: "Ativo",
  inativo: "Inativo",
  rascunho: "Rascunho",
};

export const IDEA_STATUS_LABELS: Record<string, string> = {
  ideia: "Ideia",
  planejado: "Planejado",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

export const PRIORITY_LABELS: Record<string, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
};

export const PLANNED_STATUS_LABELS: Record<string, string> = {
  pesquisa: "Pesquisa",
  cotacao: "Cotação",
  aguardando_compra: "Aguardando compra",
  comprado: "Comprado",
  cadastrado: "Cadastrado",
  disponivel: "Disponível",
};

export const BANNER_PLACEMENT_LABELS: Record<string, string> = {
  home_hero: "Home — destaque principal",
  home_secundario: "Home — secundário",
  categoria: "Página de categoria",
  produto: "Página de produto",
};

export const CATEGORY_KIND_LABELS: Record<string, string> = {
  padrao: "Categoria",
  novidades: "Novidades (automática)",
  promocoes: "Promoções (automática)",
};

// ---------------------------------------------------------------------------
// WhatsApp (§9, §20)
// ---------------------------------------------------------------------------
export const TEMPLATE_KEYS = [
  "checkout",
  "pedido_recebido",
  "pagamento_confirmado",
  "pedido_enviado",
  "pedido_entregue",
  "pos_venda",
  "estoque_baixo",
] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export const TEMPLATE_LABELS: Record<TemplateKey, string> = {
  checkout: "Finalização do pedido",
  pedido_recebido: "Pedido recebido",
  pagamento_confirmado: "Pagamento confirmado",
  pedido_enviado: "Pedido enviado",
  pedido_entregue: "Pedido entregue",
  pos_venda: "Pós-venda",
  estoque_baixo: "Estoque baixo",
};

/** Status do pedido que disparam cada modelo de mensagem. */
export const STATUS_TEMPLATE: Partial<Record<OrderStatus, TemplateKey>> = {
  pedido_recebido: "pedido_recebido",
  pago: "pagamento_confirmado",
  enviado: "pedido_enviado",
  entregue: "pedido_entregue",
};

export const TEMPLATE_VARIABLES = ["{nome}", "{pedido}", "{produto}", "{valor}", "{marca}", "{data}", "{link}"];

// ---------------------------------------------------------------------------
// Analytics (§31)
// ---------------------------------------------------------------------------
export const EVENT_TYPES = [
  "page_view",
  "product_view",
  "add_to_cart",
  "begin_checkout",
  "order_created",
  "purchase_confirmed",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const FUNNEL_STEPS: { type: EventType; label: string }[] = [
  { type: "page_view", label: "Visitantes" },
  { type: "product_view", label: "Produto" },
  { type: "add_to_cart", label: "Carrinho" },
  { type: "begin_checkout", label: "Checkout" },
  { type: "order_created", label: "Pedido" },
  { type: "purchase_confirmed", label: "Compra confirmada" },
];

export const BR_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];
