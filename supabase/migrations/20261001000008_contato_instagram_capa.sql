-- =============================================================================
-- FC-BRA · Migration 0008 — contato, Instagram e imagem da capa (FINA&CLÁSSICA)
--
-- Dados informados pelo cliente:
--   * WhatsApp / telefone: (81) 97331-4464  ->  5581973314464 (DDI 55 + DDD 81 + 9 7331-4464).
--     Substitui o número provisório 558173314464 (vindo do link do Instagram, sem o 9)
--     e preenche WhatsApp e Telefone do rodapé das duas lojas.
--   * Instagram da FINA&CLÁSSICA: https://www.instagram.com/finaeclassica
--   * Imagem da capa da FINA&CLÁSSICA: /brand/fina-classica/hero.webp
-- Só preenche o que está vazio (ou o número provisório); nunca sobrescreve o que o
-- cliente já publicou no painel.
-- =============================================================================

-- Número que recebe os pedidos (modelo geral e por marca)
update public.cms_content
set value = jsonb_set(value, '{number}', '"5581973314464"'::jsonb, true)
where key = 'whatsapp'
  and coalesce(value->>'number', '') in ('', '558173314464');

-- WhatsApp e telefone exibidos no rodapé de cada marca
update public.cms_content
set value = value || jsonb_build_object(
      'whatsapp', case when coalesce(value->>'whatsapp', '') in ('', '558173314464') then '5581973314464' else value->>'whatsapp' end,
      'phone',    case when coalesce(value->>'phone', '')    in ('', '558173314464') then '5581973314464' else value->>'phone' end)
where key = 'contact' and brand_id is not null;

-- Instagram da FINA&CLÁSSICA
update public.cms_content c
set value = jsonb_set(c.value, '{instagram}', '"https://www.instagram.com/finaeclassica"'::jsonb, true)
from public.brands b
where c.brand_id = b.id and b.slug = 'fina-classica' and c.key = 'social'
  and coalesce(c.value->>'instagram', '') = '';

-- Imagem da capa da FINA&CLÁSSICA
update public.cms_content c
set value = jsonb_set(c.value, '{hero_image_url}', '"/brand/fina-classica/hero.webp"'::jsonb, true)
from public.brands b
where c.brand_id = b.id and b.slug = 'fina-classica' and c.key = 'home'
  and coalesce(c.value->>'hero_image_url', '') = '';
