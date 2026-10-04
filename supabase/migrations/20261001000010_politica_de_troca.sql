-- =============================================================================
-- FC-BRA · Migration 0010 — Política de Troca de Produtos
--
-- Texto oficial enviado pelo cliente (POLITICA_DE_TROCA.pdf), fiel ao documento;
-- só a formatação mudou: "## " marca título de seção e "• " abre item de lista.
-- Vale para as duas lojas e só é gravado onde a política de troca ainda está vazia
-- (o que o cliente já publicou no painel nunca é sobrescrito).
-- =============================================================================

update public.cms_content c
set value = jsonb_set(c.value, '{troca}', to_jsonb($troca$Versão vigente a partir da data de publicação

## 1. Objeto e escopo

A presente Política estabelece as regras e condições para a troca voluntária de produtos adquiridos junto à empresa, seja em loja física ou por meio de canais digitais. Esta política aplica-se exclusivamente às trocas motivadas por arrependimento ou insatisfação do consumidor, não abrangendo hipóteses de defeito ou vício do produto, as quais se regem pelo Código de Defesa do Consumidor (Lei nº 8.078/1990).

## 2. Condições para aceitação da troca

A troca somente será realizada se todas as condições abaixo forem cumulativamente atendidas:

• O produto deverá estar em perfeito estado de conservação, sem qualquer marca de uso, sujidade, odor, avaria, alteração, desgaste ou sinal de manuseio indevido;
• Deverá conter a etiqueta original intacta, legível e devidamente afixada, bem como todas as embalagens originais, manuais, acessórios, certificados e demais itens que acompanhavam o produto no momento da compra;
• O prazo máximo para solicitação da troca é de 30 (trinta) dias corridos, contados a partir da data de emissão da nota fiscal ou cupom fiscal;
• É obrigatória a apresentação da nota fiscal ou cupom fiscal original correspondente à compra;
• A avaliação do estado de conservação e conformidade do produto é de exclusiva competência e critério da empresa, sendo soberana a decisão quanto à aceitação ou recusa da troca.

## 3. Forma de troca

A troca será efetuada, a critério exclusivo da empresa, por produto idêntico (mesma referência, cor, tamanho e modelo) ou mediante crédito no valor correspondente, para utilização em futuras compras. Não há direito a reembolso em espécie no âmbito desta Política de Troca Voluntária.

## 4. Produtos não elegíveis para troca

Não serão aceitos para troca os seguintes produtos, independentemente do estado de conservação:

• Produtos de higiene pessoal, íntimos, cosméticos, perfumaria, alimentos e demais itens de uso pessoal;
• Produtos adquiridos em liquidação, promoção, com desconto especial ou marcados como “não trocamos”, quando tal informação constar no momento da compra;
• Produtos personalizados, sob encomenda ou adaptados às especificações do cliente;
• Produtos cujo prazo de 30 dias tenha sido ultrapassado ou que não estejam acompanhados da documentação fiscal original.

## 5. Disposições gerais

A empresa reserva-se o direito de alterar, a qualquer tempo, os termos desta Política, prevalecendo a versão vigente na data da compra. Em hipóteses de defeito ou vício do produto, aplicam-se integralmente as disposições do Código de Defesa do Consumidor. A recusa de troca por não atendimento das condições aqui estabelecidas não configura ato ilícito nem gera direito a indenização.

Em caso de dúvidas, o cliente deverá entrar em contato com o setor de atendimento da empresa.

Documento de uso interno e externo — Política oficial de troca voluntária.$troca$::text), true)
from public.brands b
where c.brand_id = b.id and b.slug in ('fina-classica', 'bravus')
  and c.key = 'policies'
  and coalesce(c.value->>'troca', '') = '';
