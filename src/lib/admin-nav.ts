import type { Module } from "./domain";

export type NavItem = {
  href: string;
  label: string;
  module: Module | null;
  counter?: "pedidos" | "estoque" | "convites";
  shortcut?: string;
};

/** Menu lateral na ordem da especificação (§3.2), com separadores por área. */
export const NAV: NavItem[][] = [
  [{ href: "/admin", label: "Dashboard", module: null, shortcut: "g d" }],
  [
    { href: "/admin/vendas", label: "Vendas", module: "pedidos", shortcut: "g v" },
    { href: "/admin/pedidos", label: "Pedidos", module: "pedidos", counter: "pedidos", shortcut: "g p" },
  ],
  [
    { href: "/admin/produtos", label: "Produtos", module: "produtos", shortcut: "g r" },
    { href: "/admin/categorias", label: "Categorias", module: "categorias" },
    { href: "/admin/variacoes", label: "Variações", module: "produtos" },
    { href: "/admin/estoque", label: "Estoque", module: "estoque", counter: "estoque", shortcut: "g e" },
  ],
  [
    { href: "/admin/clientes", label: "Clientes", module: "clientes", shortcut: "g c" },
    { href: "/admin/fornecedores", label: "Fornecedores", module: "fornecedores" },
  ],
  [
    { href: "/admin/financeiro", label: "Financeiro", module: "financeiro", shortcut: "g f" },
    { href: "/admin/relatorios", label: "Relatórios", module: "relatorios" },
    { href: "/admin/analytics", label: "Analytics", module: "analytics" },
  ],
  [
    { href: "/admin/whatsapp", label: "WhatsApp", module: "whatsapp" },
    { href: "/admin/automacoes", label: "Automações", module: "automacoes" },
    { href: "/admin/banners", label: "Banners", module: "banners" },
  ],
  [
    { href: "/admin/ideias", label: "Ideias / melhorias", module: "ideias" },
    { href: "/admin/planejados", label: "Produtos planejados", module: "produtos_planejados" },
  ],
  [
    { href: "/admin/equipe", label: "Usuários e equipe", module: "usuarios", counter: "convites", shortcut: "g u" },
    { href: "/admin/permissoes", label: "Permissões e papéis", module: "permissoes" },
    { href: "/admin/auditoria", label: "Logs de auditoria", module: "auditoria" },
  ],
  [{ href: "/admin/configuracoes", label: "Configurações", module: null }],
];
