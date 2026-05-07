'use strict';

// ─── SUPABASE CLIENT ──────────────────────────────────────────────────────────
const SUPABASE_URL    = 'https://vmpsuhddwjghwcnhrkem.supabase.co';
const SUPABASE_KEY    = 'sb_publishable_xOJV2yf7VEAZ9si9m15jZw_Kb2oka8S';
const _AUTH_DOMAIN    = '@arqueros-analytics.com';   // dominio ficticio para auth interna

/** Convierte nombre de usuario a email interno: "pedro" → "pedro@arqueros.app" */
function authEmailFromUsername(u) {
  return u.includes('@') ? u : u + _AUTH_DOMAIN;
}
/** Extrae nombre de usuario del email interno: "pedro@arqueros.app" → "pedro" */
function authUsernameFromEmail(email) {
  return email ? email.replace(_AUTH_DOMAIN, '').replace(/@.*$/, '') : '';
}

const _sb    = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const _sbAux = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

// ─── BOOTSTRAP ADMINS ────────────────────────────────────────────────────────
// Emails que siempre tienen rol 'admin' sin necesitar UPDATE en la BD.
const _ADMIN_EMAILS = ['lvalenzuela@mostadata.com'];

// ─── LOCAL SESSION CACHE ──────────────────────────────────────────────────────
// El auth guard usa localStorage como fuente de verdad (sin esperar a Supabase).
// Supabase solo se usa para signIn / signOut — elimina todos los race conditions.
const _CACHE_KEY = 'aa_user_v3';

function authCacheSet(email) {
  const role     = _ADMIN_EMAILS.includes(email) ? 'admin' : 'viewer';
  const username = authUsernameFromEmail(email);
  localStorage.setItem(_CACHE_KEY, JSON.stringify({ email, username, role }));
}

function authCacheGet() {
  try { return JSON.parse(localStorage.getItem(_CACHE_KEY) || 'null'); }
  catch { return null; }
}

function authCacheClear() {
  localStorage.removeItem(_CACHE_KEY);
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
async function authGetArcherAccess(userId) {
  const { data, error } = await _sb
    .from('user_archer_access')
    .select('archer_id,archer_name')
    .eq('user_id', userId);
  if (error) console.warn('[auth] ArcherAccess:', error.message);
  return data || [];
}

async function authSignOut() {
  authCacheClear();
  try { await _sb.auth.signOut(); } catch (_) {}
  location.replace('login.html');
}
