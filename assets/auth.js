'use strict';

// ─── SUPABASE CLIENT ──────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://vmpsuhddwjghwcnhrkem.supabase.co';
const SUPABASE_KEY = 'sb_publishable_xOJV2yf7VEAZ9si9m15jZw_Kb2oka8S';

const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── LOCAL SESSION CACHE ──────────────────────────────────────────────────────
// El auth guard usa localStorage como fuente de verdad (sincrónico, sin race conditions).
// Supabase solo se usa para verificar credenciales en el login.
const _CACHE_KEY = 'aa_user_v4';

function authCacheSet(user) {
  // user: { id, username, display_name, role }
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
// Llama a la función SQL verify_credentials (compara bcrypt en el servidor).
// El hash nunca llega al cliente.
async function authSignIn(username, password) {
  const { data, error } = await _sb.rpc('verify_credentials', {
    p_username: username.trim().toLowerCase(),
    p_password: password,
  });

  if (error)                      return { error: 'Error de conexión. Intentá de nuevo.' };
  if (!data || data.length === 0) return { error: 'Usuario o contraseña incorrectos.' };

  const u    = data[0];
  const user = {
    id:           u.id,
    username:     u.username,
    display_name: u.display_name || u.username,
    role:         u.role,
  };
  authCacheSet(user);
  return { user };
}

// ─── SIGN OUT ────────────────────────────────────────────────────────────────
function authSignOut() {
  authCacheClear();
  location.replace('login.html');
}

// ─── ARCHER ACCESS ───────────────────────────────────────────────────────────
async function authGetArcherAccess(userId) {
  const { data, error } = await _sb
    .from('user_archer_access')
    .select('archer_id, archer_name')
    .eq('user_id', userId);
  if (error) console.warn('[auth] ArcherAccess:', error.message);
  return data || [];
}
