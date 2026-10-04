-- =============================================================================
-- FC-BRA · Migration 0009 — retirada na loja
--
-- Endereço informado pelo cliente: Rua Desembargador Oscar Coutinho, 15
-- (link do Google Maps enviado por ele, sem os parâmetros de rastreamento).
--   * Bloco "pickup" do CMS nas duas lojas: ativa a opção "Retirar na loja" no checkout.
--   * Endereço do rodapé (contato), só onde ainda está vazio.
--   * Modelo da mensagem de finalização ganha a linha "Entrega: {entrega}" (retirada ou
--     endereço do cliente), só se ainda não tiver.
-- =============================================================================

insert into public.cms_content (brand_id, key, value)
select b.id, 'pickup', jsonb_build_object(
  'enabled', true,
  'address', 'Rua Desembargador Oscar Coutinho, 15',
  'maps_url', 'https://www.google.com/maps/@-8.032573,-34.9323046,9a,75y,277.06h,89.87t/data=!3m7!1e1!3m5!1sURrJPhBRrIr1dalM88EwJw!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D0.1331393457605401%26panoid%3DURrJPhBRrIr1dalM88EwJw%26yaw%3D277.059400570218!7i16384!8i8192',
  'notes', null)
from public.brands b
where b.slug in ('fina-classica', 'bravus')
  and not exists (select 1 from public.cms_content c where c.brand_id = b.id and c.key = 'pickup');

update public.cms_content
set value = jsonb_set(value, '{address}', '"Rua Desembargador Oscar Coutinho, 15"'::jsonb, true)
where key = 'contact' and brand_id is not null
  and coalesce(value->>'address', '') = '';

update public.whatsapp_templates
set body = replace(body, E'Total: {total}\n\nNome:', E'Total: {total}\n\nEntrega: {entrega}\n\nNome:')
where key = 'checkout'
  and body not like '%{entrega}%';
