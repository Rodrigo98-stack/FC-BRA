-- =============================================================================
-- FC-BRA · Migration 0004 — ajustes do Security Advisor do Supabase
--
--   * set_updated_at com search_path fixo.
--   * has_permission() não pode ser chamada pela chave pública (anon) via
--     /rest/v1/rpc; continua disponível para "authenticated" porque as
--     políticas RLS dependem dela.
-- =============================================================================

alter function public.set_updated_at() set search_path = public;

revoke execute on function public.has_permission(uuid, text, text, uuid) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.has_permission(uuid, text, text, uuid) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.has_permission(uuid, text, text, uuid) to authenticated';
  end if;
end;
$$;
