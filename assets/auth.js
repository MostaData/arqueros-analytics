'use strict';

// ─── SUPABASE CLIENT ──────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://vmpsuhddwjghwcnhrkem.supabase.co';
const SUPABASE_KEY = 'sb_publishable_xOJV2yf7VEAZ9si9m15jZw_Kb2oka8S';

const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── LOCAL SESSION CACHE ──────────────────────────────────────────────────────
// Auth guard uses localStorage as source of truth (sync, no race conditions).
// Supabase is only called for credential verification on login.
const _CACHE_KEY = 'aa_user_v6';   // bumped: now includes all_archers_access / all_clubs_access

function authCacheSet(user) {
  localStorage.setItem(_CACHE_KEY, JSON.stringify(user));
}

function authCacheGet() {
  try { return JSON.parse(localStorage.getItem(_CACHE_KEY) || 'null'); }
  catch { return null; }
}

function authCacheClear() {
  localStorage.removeItem(_CACHE_KEY);
}

// ─── SIGN IN ──────────────────────────────────────────────────────────────────
// Calls SQL verify_credentials (bcrypt comparison on the server).
// Hash never reaches the client.
async function authSignIn(username, password) {
  const { data, error } = await _sb.rpc('verify_credentials', {
    p_username: username.trim().toLowerCase(),
    p_password: password,
  });

  if (error)                      return { error: 'Error de conexión. Intentá de nuevo.' };
  if (!data || data.length === 0) return { error: 'Usuario o contraseña incorrectos.' };

  const u    = data[0];
  const user = {
    id:                  u.id,
    username:            u.username,
    display_name:        u.display_name || u.username,
    role:                u.role,
    section_access:      u.section_access      || 'both',
    all_archers_access:  u.all_archers_access  ?? false,
    all_clubs_access:    u.all_clubs_access    ?? false,
  };
  authCacheSet(user);
  return { user };
}

// ─── SIGN OUT ────────────────────────────────────────────────────────────────
function authSignOut() {
  authCacheClear();
  location.replace('login.html');
}

// ─── ARCHER ACCESS (individual archer / club rows) ────────────────────────────
// Returns rows for INDIVIDUAL archer IDs and club: entries.
// Full-access flags (all_archers_access / all_clubs_access) are stored on
// the app_users row and come back via verify_credentials — no separate query.
async function authGetArcherAccess(userId) {
  // Try SECURITY DEFINER RPC first (bypasses any RLS on user_archer_access)
  const { data, error } = await _sb.rpc('get_archer_access', { p_user_id: userId });
  if (!error) return data || [];

  // Fallback: direct table query
  console.warn('[auth] get_archer_access RPC failed, trying direct query:', error.message);
  const { data: d2, error: e2 } = await _sb
    .from('user_archer_access')
    .select('archer_id, archer_name')
    .eq('user_id', userId);
  if (e2) console.warn('[auth] ArcherAccess direct query also failed:', e2.message);
  return d2 || [];
}
