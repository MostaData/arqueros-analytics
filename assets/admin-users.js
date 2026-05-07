'use strict';
// ─── USER MANAGEMENT ─────────────────────────────────────────────────────────
// Depends on: auth.js (_sb, _sbAux), admin.js (for archer/club data)

// ── Internal state ───────────────────────────────────────────────────────────
let _allUsers    = [];   // profiles rows
let _archerList  = [];   // [{ archer_id, name }] from archers-index.json
let _editingUser = null; // profile being edited in the access modal

// ── Bootstrap ────────────────────────────────────────────────────────────────
async function initUserManagement() {
  await _loadArcherList();
  await loadUsers();
}

// ── Load archer list from data JSON ──────────────────────────────────────────
async function _loadArcherList() {
  if (location.protocol === 'file:') return; // skip on local dev
  try {
    const res  = await fetch('data/archers-index.json');
    const data = await res.json();
    const archers = data.archers || [];
    _archerList = archers.map((a) => ({
      archer_id: a.archer_id,
      name:      a.name || a.archer_id,
    })).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  } catch (e) {
    console.warn('[admin-users] Could not load archers-index.json:', e.message);
  }
}

// ── Load and render user list ─────────────────────────────────────────────────
async function loadUsers() {
  const container = document.getElementById('user-list-container');
  if (!container) return;
  container.innerHTML = '<div style="padding:16px;color:var(--muted);font-size:0.84rem">Cargando…</div>';

  const { data, error } = await _sb.from('profiles').select('*').order('created_at');
  if (error) {
    container.innerHTML = `<div style="padding:16px;color:#f87171;font-size:0.84rem">Error: ${error.message}</div>`;
    return;
  }
  _allUsers = data || [];
  renderUserList();
}

// ── Render user cards ─────────────────────────────────────────────────────────
function renderUserList() {
  const container = document.getElementById('user-list-container');
  if (!container) return;

  if (!_allUsers.length) {
    container.innerHTML = '<div style="padding:16px;color:var(--muted);font-size:0.84rem">No hay usuarios registrados.</div>';
    return;
  }

  container.innerHTML = _allUsers.map((u) => {
    const uname = _esc(authUsernameFromEmail(u.email));
    return `
    <div class="user-card" data-uid="${u.id}">
      <div class="user-avatar">${_avatarEmoji(u.role)}</div>
      <div class="user-info">
        <div class="user-name">${_esc(u.display_name || uname || '—')}</div>
        <div class="user-email" style="color:var(--muted)">${uname}</div>
      </div>
      <span class="user-role-badge role-${u.role}">${u.role === 'admin' ? 'Admin' : 'Viewer'}</span>
      <div class="user-actions">
        <button class="btn-icon" onclick="openAccessModal('${u.id}')" title="Gestionar acceso a arqueros">
          🏹 Acceso
        </button>
        <button class="btn-icon danger" onclick="deleteUser('${u.id}','${uname}')" title="Eliminar usuario">
          🗑
        </button>
      </div>
    </div>
  `}).join('');
}

// ── Create user ───────────────────────────────────────────────────────────────
async function createUser() {
  const nameEl     = document.getElementById('nu-name');
  const usernameEl = document.getElementById('nu-username');
  const passEl     = document.getElementById('nu-password');
  const roleEl     = document.getElementById('nu-role');
  const msgEl      = document.getElementById('create-user-msg');
  const btn        = document.getElementById('btn-create-user');

  const name     = nameEl.value.trim();
  const rawUser  = usernameEl.value.trim().toLowerCase().replace(/\s+/g, '_');
  const email    = authEmailFromUsername(rawUser);   // "pedro" → "pedro@arqueros.app"
  const pass     = passEl.value;
  const role     = roleEl.value;

  if (!rawUser || !pass) { _msg(msgEl, '⚠ Completá usuario y contraseña', 'warn'); return; }
  if (pass.length < 8)   { _msg(msgEl, '⚠ La contraseña debe tener al menos 8 caracteres', 'warn'); return; }

  btn.disabled = true;
  _msg(msgEl, 'Creando usuario…', 'muted');

  // Use auxiliary client so admin's own session is not replaced
  const { data, error } = await _sbAux.auth.signUp({
    email,
    password: pass,
    options: { data: { display_name: name || rawUser, role } },
  });

  if (error) {
    _msg(msgEl, `❌ ${error.message}`, 'error');
    btn.disabled = false;
    return;
  }

  // Upsert profile with correct role
  if (data.user) {
    await _sb.from('profiles').upsert({
      id:           data.user.id,
      email,
      display_name: name || rawUser,
      role,
    });
  }

  _msg(msgEl, `✅ Usuario "${rawUser}" creado`, 'ok');
  nameEl.value = usernameEl.value = passEl.value = '';
  btn.disabled = false;
  await loadUsers();
}

// ── Delete user ───────────────────────────────────────────────────────────────
async function deleteUser(userId, username) {
  if (!confirm(`¿Eliminar al usuario "${username}"? Esta acción no se puede deshacer.`)) return;

  const { error } = await _sb.rpc('admin_delete_user', { target_id: userId });
  if (error) {
    alert(`Error al eliminar: ${error.message}`);
    return;
  }
  await loadUsers();
}

// ── Access modal ──────────────────────────────────────────────────────────────
async function openAccessModal(userId) {
  _editingUser = _allUsers.find((u) => u.id === userId) || null;
  if (!_editingUser) return;

  // Load current access for this user
  const { data: rows } = await _sb
    .from('user_archer_access')
    .select('archer_id,archer_name')
    .eq('user_id', userId);

  const currentAccess = rows || [];

  // Build modal HTML
  const backdrop = document.createElement('div');
  backdrop.className = 'access-modal-backdrop';
  backdrop.id = 'access-modal-backdrop';
  backdrop.onclick = (e) => { if (e.target === backdrop) closeAccessModal(); };

  backdrop.innerHTML = `
    <div class="access-modal">
      <h3>🏹 Acceso de arqueros — <span style="color:var(--accent)">${_esc(_editingUser.display_name || authUsernameFromEmail(_editingUser.email))}</span></h3>

      <div style="font-size:0.78rem;color:var(--muted);margin-bottom:10px">
        ${_editingUser.role === 'admin'
          ? '⚠ Este usuario es <strong>Admin</strong> y ya tiene acceso a todos los arqueros.'
          : 'Seleccioná los arqueros que este usuario puede ver.'}
      </div>

      <div class="section-title" style="font-size:0.76rem;margin-bottom:8px">Arqueros asignados</div>
      <div class="current-access-tags" id="access-tags">
        ${currentAccess.length
          ? currentAccess.map((r) => _archerTagHTML(userId, r.archer_id, r.archer_name)).join('')
          : '<span style="font-size:0.8rem;color:var(--muted)">Ninguno aún</span>'}
      </div>

      <div class="section-title" style="font-size:0.76rem;margin-bottom:8px">Agregar arquero</div>
      <input type="text" class="modal-archer-search" id="modal-archer-search"
        placeholder="Buscá por nombre…" oninput="filterModalArchers(this.value)">
      <div class="modal-archer-results" id="modal-archer-results">
        ${_renderModalArcherList(currentAccess.map((r) => r.archer_id), '')}
      </div>

      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeAccessModal()">Cerrar</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);
  document.getElementById('modal-archer-search')?.focus();
}

function closeAccessModal() {
  document.getElementById('access-modal-backdrop')?.remove();
  _editingUser = null;
}

function filterModalArchers(query) {
  const userId = _editingUser?.id;
  if (!userId) return;
  // Get currently assigned IDs from the tags
  const currentIds = _getCurrentTagIds();
  const el = document.getElementById('modal-archer-results');
  if (el) el.innerHTML = _renderModalArcherList(currentIds, query);
}

function _renderModalArcherList(assignedIds, query) {
  const q = (query || '').toLowerCase();
  const assigned = new Set(assignedIds);
  const visible = _archerList
    .filter((a) => !q || a.name.toLowerCase().includes(q))
    .slice(0, 60);

  if (!visible.length) return '<div style="padding:10px 12px;font-size:0.8rem;color:var(--muted)">Sin resultados</div>';

  return visible.map((a) => {
    const done = assigned.has(a.archer_id);
    return `<div class="modal-archer-item${done ? ' already-added' : ''}"
      onclick="${done ? '' : `addArcherAccess('${_editingUser?.id}','${a.archer_id}','${_esc(a.name)}')`}">
      ${done ? '✓ ' : ''}${_esc(a.name)}
      <span style="font-size:0.72rem;color:var(--muted);margin-left:4px">${a.archer_id}</span>
    </div>`;
  }).join('');
}

function _archerTagHTML(userId, archerId, archerName) {
  return `<span class="archer-tag" data-archer-id="${archerId}">
    ${_esc(archerName || archerId)}
    <button onclick="removeArcherAccess('${userId}','${archerId}')" title="Quitar">×</button>
  </span>`;
}

function _getCurrentTagIds() {
  return [...document.querySelectorAll('#access-tags .archer-tag')]
    .map((el) => el.dataset.archerId).filter(Boolean);
}

// ── Add / Remove archer access ────────────────────────────────────────────────
async function addArcherAccess(userId, archerId, archerName) {
  const { error } = await _sb.from('user_archer_access').insert({
    user_id:     userId,
    archer_id:   archerId,
    archer_name: archerName,
  });
  if (error && !error.message.includes('duplicate')) {
    alert(`Error: ${error.message}`); return;
  }
  // Update tags
  const tagsEl = document.getElementById('access-tags');
  if (tagsEl) {
    // Remove "ninguno" placeholder if present
    const placeholder = tagsEl.querySelector('span:not(.archer-tag)');
    if (placeholder) placeholder.remove();
    tagsEl.insertAdjacentHTML('beforeend', _archerTagHTML(userId, archerId, archerName));
  }
  // Refresh archer list to mark as assigned
  const currentIds = _getCurrentTagIds();
  const query = document.getElementById('modal-archer-search')?.value || '';
  const resultsEl = document.getElementById('modal-archer-results');
  if (resultsEl) resultsEl.innerHTML = _renderModalArcherList(currentIds, query);
}

async function removeArcherAccess(userId, archerId) {
  const { error } = await _sb.from('user_archer_access')
    .delete()
    .eq('user_id', userId)
    .eq('archer_id', archerId);
  if (error) { alert(`Error: ${error.message}`); return; }

  // Remove tag from DOM
  const tag = document.querySelector(`#access-tags .archer-tag[data-archer-id="${archerId}"]`);
  if (tag) tag.remove();

  // Show placeholder if no tags left
  const tagsEl = document.getElementById('access-tags');
  if (tagsEl && !tagsEl.querySelector('.archer-tag')) {
    tagsEl.innerHTML = '<span style="font-size:0.8rem;color:var(--muted)">Ninguno aún</span>';
  }

  // Refresh archer list
  const currentIds = _getCurrentTagIds();
  const query = document.getElementById('modal-archer-search')?.value || '';
  const resultsEl = document.getElementById('modal-archer-results');
  if (resultsEl) resultsEl.innerHTML = _renderModalArcherList(currentIds, query);
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function _avatarEmoji(role) { return role === 'admin' ? '🔑' : '👤'; }

function _esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _msg(el, text, type) {
  if (!el) return;
  const colors = { ok: 'var(--green)', warn: 'var(--yellow)', error: '#f87171', muted: 'var(--muted)' };
  el.style.color = colors[type] || 'var(--muted)';
  el.textContent = text;
}
