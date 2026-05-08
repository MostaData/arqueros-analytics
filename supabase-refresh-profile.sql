-- ─── MIGRATION: get_user_live_profile ──────────────────────────────────────
-- Run once in Supabase SQL Editor.
-- Adds a function to fetch fresh user flags on every page load,
-- bypassing the stale localStorage session cache.

CREATE OR REPLACE FUNCTION get_user_live_profile(p_user_id uuid)
RETURNS TABLE(
  role               text,
  section_access     text,
  all_archers_access boolean,
  all_clubs_access   boolean
)
SECURITY DEFINER SET search_path = public LANGUAGE sql AS $$
  SELECT role, section_access, all_archers_access, all_clubs_access
  FROM app_users WHERE id = p_user_id LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION get_user_live_profile TO anon;
