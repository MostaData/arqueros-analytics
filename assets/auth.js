'use strict';

// ─── SUPABASE CLIENT ──────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://vmpsuhddwjghwcnhrkem.supabase.co';
const SUPABASE_KEY = 'sb_publishable_xOJV2yf7VEAZ9si9m15jZw_Kb2oka8S';

// Primary client — persists session in localStorage
const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Auxiliary client — for admin user-creation without overwriting own session
const _sbAux = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

// ─── AUTH HELPERS ─────────────────────────────────────────────────────────────

// getSession() puede retornar null mientras Supabase inicializa internamente.
// Reintenta hasta maxRetries veces con una pausa entre cada intento.
async function authWaitForSession(maxRetries = 6, delayMs = 300) {
  for (let i = 0; i < maxRetries; i++) {
    const { data } = await _sb.auth.getSession();
    if (data?.session) return data.session;
    if (i < maxRetries - 1) await new Promise(r => setTimeout(r, delayMs));
  }
  return null;
}

async function authGetSession() {
  const { data } = await _sb.auth.getSession();
  return data.session || null;
}

async function authGetProfile(userId) {
  const { data, error } = await _sb
    .from('profiles')
    .select('id,email,display_name,role')
    .eq('id', userId)
    .single();
  if (error) console.warn('[auth] Profile fetch error:', error.message);
  return data || null;
}

async function authGetArcherAccess(userId) {
  const { data, error } = await _sb
    .from('user_archer_access')
    .select('archer_id,archer_name')
    .eq('user_id', userId);
  if (error) console.warn('[auth] ArcherAccess fetch error:', error.message);
  return data || [];
}

async function authSignOut() {
  await _sb.auth.signOut();
  location.replace('login.html');
}
