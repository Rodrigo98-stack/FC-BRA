-- =============================================================================
-- FC-BRA · Migration 0005 — logos oficiais e estilo visual de cada marca
--
-- Logos enviados pelo cliente (arquivos em public/brand/). Só preenche o que
-- ainda está vazio, para não sobrescrever o que já foi publicado no painel.
--   * look: "classico" (FINA CLÁSSICA) | "urbano" (BRAVUS) — define os efeitos
--     visuais da loja (molduras, animações, texturas).
--   * logo_shows_name: o logo da BRAVUS já traz o nome escrito.
--   * Paleta BRAVUS derivada do logo (grafite + dourado), aplicada apenas se a
--     paleta ainda for a sugestão original.
-- =============================================================================

update public.cms_content c
set value = c.value
  || jsonb_build_object(
       'logo_url',        coalesce(c.value->>'logo_url', '/brand/fina-classica/logo.svg'),
       'favicon_url',     coalesce(c.value->>'favicon_url', '/brand/fina-classica/icon.png'),
       'look',            coalesce(c.value->>'look', 'classico'),
       'logo_shows_name', coalesce((c.value->>'logo_shows_name')::boolean, false)
     )
from public.brands b
where c.brand_id = b.id and b.slug = 'fina-classica' and c.key = 'identity';

update public.cms_content c
set value = c.value
  || jsonb_build_object(
       'logo_url',        coalesce(c.value->>'logo_url', '/brand/bravus/logo.webp'),
       'favicon_url',     coalesce(c.value->>'favicon_url', '/brand/bravus/icon.png'),
       'look',            coalesce(c.value->>'look', 'urbano'),
       'logo_shows_name', coalesce((c.value->>'logo_shows_name')::boolean, true)
     )
from public.brands b
where c.brand_id = b.id and b.slug = 'bravus' and c.key = 'identity';

update public.cms_content c
set value = jsonb_set(c.value, '{palette}',
      '{"primary": "#22252A", "secondary": "#2A2D32", "accent": "#B8955C", "text": "#ECE7E1", "background": "#17191C"}'::jsonb)
from public.brands b
where c.brand_id = b.id and b.slug = 'bravus' and c.key = 'identity'
  and c.value->'palette' = '{"primary": "#2C2D30", "secondary": "#2C2D30", "accent": "#B87333", "text": "#ECE7E1", "background": "#1E1F21"}'::jsonb;
