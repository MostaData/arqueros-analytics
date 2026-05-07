-- ─── MIGRATION: all_archers_access / all_clubs_access on app_users ──────────
-- Run once in Supabase SQL Editor.
-- Moves "full access" flags onto the user row so they come back in
-- verify_credentials — no extra round-trip query that RLS could block.

-- 1. Add columns
ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS all_archers_access boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS all_clubs_access   boolean NOT NULL DEFAULT false;

-- 2. verify_credentials — return new columns
CREATE OR REPLACE FUNCTION verify_credentials(p_username text, p_password text)
RETURNS TABLE(
  id                 uuid,
  username           text,
  display_name       text,
  role               text,
  section_access     text,
  all_archers_access boolean,
  all_clubs_access   boolean
)
SECURITY DEFINER SET search_path = public, extensions LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.username, u.display_name, u.role,
         u.section_access, u.all_archers_access, u.all_clubs_access
  FROM app_users u
  WHERE u.username = p_username
    AND u.password_hash = crypt(p_password, u.password_hash);
END;
$$;
GRANT EXECUTE ON FUNCTION verify_credentials TO anon;

-- 3. get_all_users — return new columns
CREATE OR REPLACE FUNCTION get_all_users()
RETURNS TABLE(
  id                 uuid,
  username           text,
  display_name       text,
  role               text,
  section_access     text,
  all_archers_access boolean,
  all_clubs_access   boolean
)
SECURITY DEFINER SET search_path = public LANGUAGE sql AS $$
  SELECT id, username, display_name, role,
         section_access, all_archers_access, all_clubs_access
  FROM app_users ORDER BY created_at;
$$;
GRANT EXECUTE ON FUNCTION get_all_users TO anon;

-- 4. get_archer_access — SECURITY DEFINER so it bypasses RLS on user_archer_access
CREATE OR REPLACE FUNCTION get_archer_access(p_user_id uuid)
RETURNS TABLE(archer_id text, archer_name text)
SECURITY DEFINER SET search_path = public LANGUAGE sql AS $$
  SELECT archer_id, archer_name
  FROM user_archer_access
  WHERE user_id = p_user_id;
$$;
GRANT EXECUTE ON FUNCTION get_archer_access TO anon;

-- 5. New function: set access flags from admin panel
CREATE OR REPLACE FUNCTION set_user_access_flags(
  p_user_id          uuid,
  p_all_archers      boolean,
  p_all_clubs        boolean
) RETURNS void
SECURITY DEFINER SET search_path = public LANGUAGE sql AS $$
  UPDATE app_users
  SET all_archers_access = p_all_archers,
      all_clubs_access   = p_all_clubs
  WHERE id = p_user_id;
$$;
GRANT EXECUTE ON FUNCTION set_user_access_flags TO anon;
