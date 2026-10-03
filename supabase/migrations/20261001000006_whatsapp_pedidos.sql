-- =============================================================================
-- FC-BRA · Migration 0006 — WhatsApp que recebe os pedidos
--
-- Número informado pelo cliente (wa.me/558173314464, o mesmo do Instagram):
-- DDI 55 + DDD 81 + 7331-4464. Vale para as duas lojas (modelo geral) e também
-- aparece no rodapé de cada uma. Só preenche onde o número ainda está vazio,
-- para nunca sobrescrever o que já foi definido em WhatsApp, no painel.
-- =============================================================================

update public.cms_content
set value = jsonb_set(value, '{number}', '"558173314464"'::jsonb, true)
where key = 'whatsapp'
  and coalesce(value->>'number', '') = '';
