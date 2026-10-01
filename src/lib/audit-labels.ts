/** Rótulos legíveis das ações registradas em audit_logs. */
const LABELS: Record<string, string> = {
  "pedido.criar": "registrou um pedido",
  "pedido.status": "alterou o status de um pedido",
  "pedido.editar": "editou um pedido",
  "produto.criar": "cadastrou um produto",
  "produto.editar": "editou um produto",
  "produto.excluir": "excluiu um produto",
  "estoque.movimentar": "movimentou o estoque",
  "estoque.entrada": "lançou entrada de mercadoria",
  "estoque.transferir": "transferiu estoque entre locais",
  "usuario.convidar": "convidou um usuário",
  "usuario.revogar_convite": "revogou um convite",
  "usuario.aceitar_convite": "aceitou o convite e ativou a conta",
  "usuario.editar": "editou dados de um usuário",
  "usuario.papeis": "alterou os papéis de um usuário",
  "usuario.permissoes_customizadas": "alterou permissões customizadas",
  "usuario.revogar_acesso": "revogou o acesso de um usuário",
  "usuario.excluir": "excluiu um usuário",
  "usuario.resetar_senha": "gerou link de redefinição de senha",
  "usuario.senha_redefinida": "redefiniu a senha",
  "usuario.trocar_senha": "trocou a própria senha",
  "usuario.criar_admin_principal": "criou o administrador principal",
  "usuario.status.ativo": "reativou um usuário",
  "usuario.status.inativo": "desativou um usuário",
  "usuario.status.suspenso": "suspendeu um usuário",
  "papel.criar": "criou um papel",
  "papel.clonar": "clonou um papel",
  "papel.editar": "editou um papel",
  "papel.excluir": "excluiu um papel",
  "sessao.login": "entrou no painel",
  "cms.editar": "editou a identidade visual / conteúdo",
  "config.editar": "alterou configurações",
  "whatsapp.mensagem": "gerou mensagem de WhatsApp",
  "whatsapp.modelo": "editou um modelo de mensagem",
  "automacao.editar": "alterou uma automação",
  "demo.limpar": "limpou os dados DEMO",
  "marca.status": "alterou o status de uma marca",
  "relatorio.exportar": "exportou um relatório",
};

const ENTITY: Record<string, string> = {
  fornecedores: "fornecedor",
  ideias: "ideia",
  planejados: "produto planejado",
  banners: "banner",
  categorias: "categoria",
  times: "time",
  clientes: "cliente",
  receitas: "entrada financeira",
  despesas: "saída financeira",
};

export function auditActionLabel(action: string): string {
  if (LABELS[action]) return LABELS[action];
  const [entity, verb] = action.split(".");
  const noun = ENTITY[entity];
  if (noun && verb === "criar") return `cadastrou ${noun}`;
  if (noun && verb === "editar") return `editou ${noun}`;
  if (noun && verb === "excluir") return `excluiu ${noun}`;
  return action;
}
