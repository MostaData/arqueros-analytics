'use strict';
// ─── USER MANAGEMENT ─────────────────────────────────────────────────────────
// Usa funciones SQL security-definer en Supabase (sin Supabase Auth).
// Depende de: auth.js (_sb)

let _allUsers   = [];
let _archerList = [];
let _editingUser = null;

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function initUserManagement() {
  await _loadArcherList();
  await loadUsers();
}

// ── Cargar lista de arqueros ──────────────────────────────────────────────────
async function _loadArcherList() {
  if (location.protocol === 'file:') return;
  try {
    const res  = await fetch('data/archers-index.json');
    const data = await res.json();
    _archerList = (data.archers || [])
      .map(a => ({ archer_id: a.id, name: a.display_name || a.name || a.id }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  } catch (e) {
    console.warn('[admin-users] archers-index.json no disponible:', e.message);
  }
}

// ── Cargar y renderizar usuarios ──────────────────────────────────────────────
async function loadUsers() {
  const container = document.getElementById('user-list-container');
  if (!container) return;
  container.innerHTML = '<div style="padding:16px;color:var(--muted);font-size:0.84rem">Cargando…</div>';

  const { data, error } = await _sb.rpc('get_all_users');
  if (error) {
    container.innerHTML = `<div style="padding:16px;color:#f87171;font-size:0.84rem">Error: ${error.message}</div>`;
    return;
  }
  _allUsers = data || [];
  renderUserList();
}

function renderUserList() {
  const container = document.getElementById('user-list-container');
  if (!container) return;

  if (!_allUsers.length) {
    container.innerHTML = '<div style="padding:16px;color:var(--muted);font-size:0.84rem">No hay usuarios registrados.</div>';
    return;
  }

  const sectionLabel = { archers: '🏹 Solo Arqueros', clubs: '🏛 Solo Clubes', both: '🏹🏛 Ambas' };

  container.innerHTML = _allUsers.map(u => `
    <div class="user-card" data-uid="${u.id}">
      <div class="user-avatar">${u.role === 'admin' ? '🔑' : '👤'}</div>
      <div class="user-info">
        <div class="user-name">${_esc(u.display_name || u.username)}</div>
        <div class="user-email">${_esc(u.username)}
          ${u.role !== 'admin' ? `<span style="margin-left:8px;opacity:.6;font-size:0.72rem">${sectionLabel[u.section_access] || ''}</span>` : ''}
        </div>
      </div>
      <span class="user-role-badge role-${u.role}">${u.role === 'admin' ? 'Admin' : 'Viewer'}</span>
      <div class="user-actions">
        <button class="btn-icon" onclick="openAccessModal('${u.id}')" title="Gestionar acceso a arqueros">
          🏹 Acceso
        </button>
        ${u.username !== 'admin' ? `
        <button class="btn-icon danger" onclick="deleteUser('${u.id}','${_esc(u.username)}')" title="Eliminar usuario">
          🗑
        </button>` : ''}
      </div>
    </div>
  `).join('');
}

// ── Crear usuario ─────────────────────────────────────────────────────────────
async function createUser() {
  const nameEl     = document.getElementById('nu-name');
  const usernameEl = document.getElementById('nu-username');
  const passEl     = document.getElementById('nu-password');
  const roleEl     = document.getElementById('nu-role');
  const sectionEl  = document.getElementById('nu-section');
  const msgEl      = document.getElementById('create-user-msg');
  const btn        = document.getElementById('btn-create-user');

  const name          = nameEl.value.trim();
  const username      = usernameEl.value.trim().toLowerCase().replace(/\s+/g, '_');
  const pass          = passEl.value;
  const role          = roleEl.value;
  const sectionAccess = sectionEl?.value || 'both';

  if (!username || !pass) { _msg(msgEl, '⚠ Completá usuario y contraseña', 'warn'); return; }
  if (pass.length < 6)    { _msg(msgEl, '⚠ La contraseña debe tener al menos 6 caracteres', 'warn'); return; }

  btn.disabled = true;
  _msg(msgEl, 'Creando usuario…', 'muted');

  const { error } = await _sb.rpc('create_user', {
    p_username:       username,
    p_password:       pass,
    p_display_name:   name || username,
    p_role:           role,
    p_section_access: sectionAccess,
  });

  if (error) {
    const msg = error.message.includes('unique') || error.message.includes('duplicate')
      ? `El usuario "${username}" ya existe`
      : error.message;
    _msg(msgEl, `❌ ${msg}`, 'error');
    btn.disabled = false;
    return;
  }

  _msg(msgEl, `✅ Usuario "${username}" creado`, 'ok');
  nameEl.value = usernameEl.value = passEl.value = '';
  btn.disabled = false;
  await loadUsers();
}

// ── Eliminar usuario ──────────────────────────────────────────────────────────
async function deleteUser(userId, username) {
  if (!confirm(`¿Eliminar al usuario "${username}"? Esta acción no se puede deshacer.`)) return;

  const { error } = await _sb.rpc('delete_user', { p_user_id: userId });
  if (error) { alert(`Error al eliminar: ${error.message}`); return; }
  await loadUsers();
}

// ── Modal de acceso a arqueros ────────────────────────────────────────────────
async function openAccessModal(userId) {
  _editingUser = _allUsers.find(u => u.id === userId) || null;
  if (!_editingUser) return;

  const { data: rows } = await _sb
    .from('user_archer_access')
    .select('archer_id, archer_name')
    .eq('user_id', userId);

  const currentAccess = rows || [];

  const backdrop = document.createElement('div');
  backdrop.className = 'access-modal-backdrop';
  backdrop.id = 'access-modal-backdrop';
  backdrop.onclick = e => { if (e.target === backdrop) closeAccessModal(); };

  backdrop.innerHTML = `
    <div class="access-modal">
      <h3>🏹 Acceso de arqueros — <span style="color:var(--accent)">${_esc(_editingUser.display_name || _editingUser.username)}</span></h3>
      <div style="font-size:0.78rem;color:var(--muted);margin-bottom:10px">
        ${_editingUser.role === 'admin'
          ? '⚠ Este usuario es <strong>Admin</strong> y ya tiene acceso a todos los arqueros.'
          : 'Seleccioná los arqueros que este usuario puede ver.'}
      </div>

      <div class="section-title" style="font-size:0.76rem;margin-bottom:8px">Arqueros asignados</div>
      <div class="current-access-tags" id="access-tags">
        ${currentAccess.length
          ? currentAccess.map(r => _archerTagHTML(userId, r.archer_id, r.archer_name)).join('')
          : '<span style="font-size:0.8rem;color:var(--muted)">Ninguno aún</span>'}
      </div>

      <div class="section-title" style="font-size:0.76rem;margin-bottom:8px">Agregar arquero</div>
      <input type="text" class="modal-archer-search" id="modal-archer-search"
        placeholder="Buscá por nombre…" oninput="filterModalArchers(this.value)">
      <div class="modal-archer-results" id="modal-archer-results">
        ${_renderModalArcherList(currentAccess.map(r => r.archer_id), '')}
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
  if (!_editingUser) return;
  const currentIds = _getCurrentTagIds();
  const el = document.getElementById('modal-archer-results');
  if (el) el.innerHTML = _renderModalArcherList(currentIds, query);
}

function _renderModalArcherList(assignedIds, query) {
  const q        = (query || '').toLowerCase();
  const assigned = new Set(assignedIds);
  const visible  = _archerList.filter(a => !q || a.name.toLowerCase().includes(q)).slice(0, 60);

  if (!visible.length) return '<div style="padding:10px 12px;font-size:0.8rem;color:var(--muted)">Sin resultados</div>';

  return visible.map(a => {
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
    .map(el => el.dataset.archerId).filter(Boolean);
}

// ── Agregar / Quitar acceso a arquero ─────────────────────────────────────────
async function addArcherAccess(userId, archerId, archerName) {
  const { error } = await _sb.from('user_archer_access').insert({
    user_id: userId, archer_id: archerId, archer_name: archerName,
  });
  if (error && !error.message.includes('duplicate')) {
    alert(`Error: ${error.message}`); return;
  }
  const tagsEl = document.getElementById('access-tags');
  if (tagsEl) {
    const placeholder = tagsEl.querySelector('span:not(.archer-tag)');
    if (placeholder) placeholder.remove();
    tagsEl.insertAdjacentHTML('beforeend', _archerTagHTML(userId, archerId, archerName));
  }
  const currentIds = _getCurrentTagIds();
  const query = document.getElementById('modal-archer-search')?.value || '';
  const resultsEl = document.getElementById('modal-archer-results');
  if (resultsEl) resultsEl.innerHTML = _renderModalArcherList(currentIds, query);
}

async function removeArcherAccess(userId, archerId) {
  const { error } = await _sb.from('user_archer_access')
    .delete().eq('user_id', userId).eq('archer_id', archerId);
  if (error) { alert(`Error: ${error.message}`); return; }

  const tag = document.querySelector(`#access-tags .archer-tag[data-archer-id="${archerId}"]`);
  if (tag) tag.remove();

  const tagsEl = document.getElementById('access-tags');
  if (tagsEl && !tagsEl.querySelector('.archer-tag')) {
    tagsEl.innerHTML = '<span style="font-size:0.8rem;color:var(--muted)">Ninguno aún</span>';
  }
  const currentIds = _getCurrentTagIds();
  const query = document.getElementById('modal-archer-search')?.value || '';
  const resultsEl = document.getElementById('modal-archer-results');
  if (resultsEl) resultsEl.innerHTML = _renderModalArcherList(currentIds, query);
}

// ── Utilidades ────────────────────────────────────────────────────────────────
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
