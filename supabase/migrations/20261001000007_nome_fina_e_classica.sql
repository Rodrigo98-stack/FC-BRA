-- =============================================================================
-- FC-BRA · Migration 0007 — nome da marca: FINA&CLÁSSICA
--
-- O nome oficial usa "&" (FINA&CLÁSSICA). Atualiza o nome da marca e o nome do
-- site. O endereço da loja (slug "fina-classica") e o prefixo dos pedidos (FC)
-- não mudam. Só altera se ainda estiver com o nome antigo.
-- =============================================================================

update public.brands
set name = 'FINA&CLÁSSICA'
where slug = 'fina-classica' and name = 'FINA CLÁSSICA';

update public.cms_content
set value = jsonb_set(value, '{name}', '"FINA&CLÁSSICA + BRAVUS"'::jsonb)
where brand_id is null and key = 'site' and value->>'name' = 'FINA CLÁSSICA + BRAVUS';
