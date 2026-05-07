-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN: agregar section_access a app_users
-- Ejecutar en Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Agregar columna section_access
alter table app_users
  add column if not exists section_access text not null default 'both'
  check (section_access in ('archers', 'clubs', 'both'));

-- 2. Actualizar verify_credentials para devolver section_access
drop function if exists verify_credentials(text, text) cascade;
create or replace function verify_credentials(p_username text, p_password text)
returns table(id uuid, username text, display_name text, role text, section_access text)
language sql security definer as $$
  select id, username, display_name, role, section_access
  from   app_users
  where  username      = lower(p_username)
    and  password_hash = crypt(p_password, password_hash);
$$;
grant execute on function verify_credentials(text, text) to anon;

-- 3. Actualizar get_all_users para devolver section_access
drop function if exists get_all_users() cascade;
create or replace function get_all_users()
returns table(id uuid, username text, display_name text, role text, section_access text, created_at timestamptz)
language sql security definer as $$
  select id, username, display_name, role, section_access, created_at
  from   app_users
  order  by created_at;
$$;
grant execute on function get_all_users() to anon;

-- 4. Actualizar create_user para aceptar section_access
drop function if exists create_user(text, text, text, text) cascade;
create or replace function create_user(
  p_username      text,
  p_password      text,
  p_display_name  text,
  p_role          text,
  p_section_access text default 'both'
) returns uuid language plpgsql security definer as $$
declare
  new_id uuid;
begin
  insert into app_users (username, password_hash, display_name, role, section_access)
  values (
    lower(p_username),
    crypt(p_password, gen_salt('bf', 10)),
    coalesce(nullif(trim(p_display_name), ''), p_username),
    coalesce(nullif(p_role, ''), 'viewer'),
    coalesce(nullif(p_section_access, ''), 'both')
  )
  returning id into new_id;
  return new_id;
end;
$$;
grant execute on function create_user(text, text, text, text, text) to anon;

-- Verificar
select id, username, role, section_access from get_all_users();
