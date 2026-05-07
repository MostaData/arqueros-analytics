-- ═══════════════════════════════════════════════════════════════════════════════
-- RESET COMPLETO — Arqueros Analytics Auth
-- Ejecutar en Supabase SQL Editor (Database → SQL Editor → New query)
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Limpiar objetos anteriores
drop table  if exists user_archer_access  cascade;
drop table  if exists profiles            cascade;
drop table  if exists app_users           cascade;
drop function if exists verify_credentials(text,text)           cascade;
drop function if exists get_all_users()                         cascade;
drop function if exists create_user(text,text,text,text)        cascade;
drop function if exists delete_user(uuid)                       cascade;
drop function if exists update_user_password(uuid,text)         cascade;
drop function if exists admin_delete_user(uuid)                 cascade;
drop function if exists is_admin()                              cascade;
drop function if exists handle_new_user()                       cascade;

-- 2. Extensión pgcrypto (necesaria para crypt / gen_salt)
create extension if not exists pgcrypto;

-- 3. Tabla de usuarios (sin dependencia de auth.users)
create table app_users (
  id            uuid        primary key default gen_random_uuid(),
  username      text        unique not null,
  password_hash text        not null,
  display_name  text,
  role          text        not null default 'viewer'
                            check (role in ('admin','viewer')),
  created_at    timestamptz default now()
);

-- 4. Tabla de acceso a arqueros por usuario
create table user_archer_access (
  user_id     uuid  references app_users(id) on delete cascade,
  archer_id   text  not null,
  archer_name text,
  primary key (user_id, archer_id)
);

-- 5. Row Level Security
alter table app_users          enable row level security;
alter table user_archer_access enable row level security;

-- app_users: bloquear SELECT directo (se accede solo via funciones security definer)
create policy "no_direct_select" on app_users for select using (false);
create policy "allow_insert"     on app_users for insert          with check (true);
create policy "allow_update"     on app_users for update using (true) with check (true);
create policy "allow_delete"     on app_users for delete using (true);

-- user_archer_access: acceso completo via anon key
create policy "allow_all" on user_archer_access for all using (true) with check (true);

-- 6. Funciones seguras (security definer bypasea el RLS de SELECT)

-- Verificar credenciales → devuelve datos del usuario si son correctos, sin exponer el hash
create or replace function verify_credentials(p_username text, p_password text)
returns table(id uuid, username text, display_name text, role text)
language sql security definer as $$
  select id, username, display_name, role
  from   app_users
  where  username      = lower(p_username)
    and  password_hash = crypt(p_password, password_hash);
$$;

-- Listar todos los usuarios (para panel admin, sin hash)
create or replace function get_all_users()
returns table(id uuid, username text, display_name text, role text, created_at timestamptz)
language sql security definer as $$
  select id, username, display_name, role, created_at
  from   app_users
  order  by created_at;
$$;

-- Crear usuario (hashea la contraseña internamente)
create or replace function create_user(
  p_username     text,
  p_password     text,
  p_display_name text,
  p_role         text
) returns uuid language plpgsql security definer as $$
declare
  new_id uuid;
begin
  insert into app_users (username, password_hash, display_name, role)
  values (
    lower(p_username),
    crypt(p_password, gen_salt('bf', 10)),
    coalesce(nullif(trim(p_display_name),''), p_username),
    coalesce(nullif(p_role,''), 'viewer')
  )
  returning id into new_id;
  return new_id;
end;
$$;

-- Eliminar usuario (el usuario 'admin' no se puede eliminar)
create or replace function delete_user(p_user_id uuid)
returns void language sql security definer as $$
  delete from app_users
  where  id       = p_user_id
    and  username != 'admin';
$$;

-- Cambiar contraseña de un usuario
create or replace function update_user_password(p_user_id uuid, p_new_password text)
returns void language sql security definer as $$
  update app_users
  set    password_hash = crypt(p_new_password, gen_salt('bf', 10))
  where  id = p_user_id;
$$;

-- Permisos de ejecución para el rol anon (clave publishable del frontend)
grant execute on function verify_credentials(text, text)    to anon;
grant execute on function get_all_users()                   to anon;
grant execute on function create_user(text, text, text, text) to anon;
grant execute on function delete_user(uuid)                 to anon;
grant execute on function update_user_password(uuid, text)  to anon;

-- 7. Usuario admin inicial
insert into app_users (username, password_hash, display_name, role)
values ('admin', crypt('147258', gen_salt('bf', 10)), 'Administrador', 'admin');

-- Verificar creación
select id, username, display_name, role, created_at from get_all_users();
