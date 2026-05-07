'use strict';
// ─── USER MANAGEMENT ─────────────────────────────────────────────────────────
// Usa funciones SQL security-definer en Supabase (sin Supabase Auth).
// Depende de: auth.js (_sb)

let _allUsers    = [];
let _archerList  = [];
let _clubList    = [];
let _editingUser = null;

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function initUserManagement() {
  await _loadArcherList();
  await loadUsers();
}

// ── Cargar lista de arqueros y clubes ─────────────────────────────────────────
async function _loadArcherList() {
  if (location.protocol === 'file:') return;
  try {
    const [archerRes, clubRes] = await Promise.all([
      fetch('data/archers-index.json'),
      fetch('data/clubs-index.json'),
    ]);
    const archerData = await archerRes.json();
    const clubData   = await clubRes.json();

    _archerList = (archerData.archers || [])
      .map(a => ({ archer_id: a.id, name: a.display_name || a.name || a.id }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));

    _clubList = (clubData.clubs || [])
      .map(c => ({ club_id: c.id, name: c.name || c.id }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  } catch (e) {
    console.warn('[admin-users] datos no disponibles:', e.message);
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
        <button class="btn-icon" onclick="openAccessModal('${u.id}')" title="Gestionar acceso">
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

// ── Modal de acceso ───────────────────────────────────────────────────────────
async function openAccessModal(userId) {
  _editingUser = _allUsers.find(u => u.id === userId) || null;
  if (!_editingUser) return;

  const { data: rows } = await _sb
    .from('user_archer_access')
    .select('archer_id, archer_name')
    .eq('user_id', userId);

  const allRows     = rows || [];
  // Full-access flags come from the app_users row (reliable, not RLS-gated)
  const hasAllArch  = _editingUser.all_archers_access ?? false;
  const hasAllClubs = _editingUser.all_clubs_access   ?? false;
  const clubRows    = allRows.filter(r => r.archer_id.startsWith('club:'));
  const archerRows  = allRows.filter(r => !r.archer_id.startsWith('club:') && !r.archer_id.startsWith('__'));

  const backdrop = document.createElement('div');
  backdrop.className = 'access-modal-backdrop';
  backdrop.id = 'access-modal-backdrop';
  backdrop.onclick = e => { if (e.target === backdrop) closeAccessModal(); };

  if (_editingUser.role === 'admin') {
    backdrop.innerHTML = `
      <div class="access-modal">
        <h3>🔑 Acceso — <span style="color:var(--accent)">${_esc(_editingUser.display_name || _editingUser.username)}</span></h3>
        <div style="font-size:0.82rem;color:var(--muted);margin:12px 0">
          ⚠ Este usuario es <strong>Admin</strong> y ya tiene acceso completo a todo.
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeAccessModal()">Cerrar</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    return;
  }

  backdrop.innerHTML = `
    <div class="access-modal" style="max-width:520px">
      <h3>🏹 Acceso — <span style="color:var(--accent)">${_esc(_editingUser.display_name || _editingUser.username)}</span></h3>

      <!-- ════ SECCIÓN ARQUEROS ════ -->
      <div class="access-block">
        <div class="access-block-header">🏹 Arqueros</div>

        <label class="access-all-toggle">
          <input type="checkbox" id="chk-all-archers" ${hasAllArch ? 'checked' : ''}
            onchange="toggleAllAccess('${userId}','all_archers',this.checked,'individual-archers-section')">
          <span>Todos los arqueros</span>
        </label>

        <div id="individual-archers-section" style="${hasAllArch ? 'opacity:0.4;pointer-events:none' : ''}">
          <div class="access-sub-label">Arqueros individuales</div>
          <div class="current-access-tags" id="access-tags">
            ${archerRows.length
              ? archerRows.map(r => _archerTagHTML(userId, r.archer_id, r.archer_name)).join('')
              : '<span class="access-empty">Ninguno aún</span>'}
          </div>
          <input type="text" class="modal-archer-search" id="modal-archer-search"
            placeholder="🔍 Buscá por nombre…" oninput="filterModalArchers(this.value)" style="margin-top:10px">
          <div class="modal-archer-results" id="modal-archer-results">
            ${_renderModalArcherList(archerRows.map(r => r.archer_id), '')}
          </div>
        </div>
      </div>

      <!-- ════ SECCIÓN CLUBES ════ -->
      <div class="access-block">
        <div class="access-block-header">🏛 Clubes / Escuelas</div>

        <label class="access-all-toggle">
          <input type="checkbox" id="chk-all-clubs" ${hasAllClubs ? 'checked' : ''}
            onchange="toggleAllAccess('${userId}','all_clubs',this.checked,'individual-clubs-section')">
          <span>Todos los clubes / escuelas</span>
        </label>

        <div id="individual-clubs-section" style="${hasAllClubs ? 'opacity:0.4;pointer-events:none' : ''}">
          <div class="access-sub-label">Clubes individuales <span style="opacity:.55;font-weight:400">(da acceso a todos sus arqueros)</span></div>
          <div class="current-access-tags" id="club-access-tags">
            ${clubRows.length
              ? clubRows.map(r => _clubTagHTML(userId, r.archer_id, r.archer_name)).join('')
              : '<span class="access-empty">Ninguno aún</span>'}
          </div>
          <input type="text" class="modal-archer-search" id="modal-club-search"
            placeholder="🔍 Buscá por nombre de club…" oninput="filterModalClubs(this.value)" style="margin-top:10px">
          <div class="modal-archer-results" id="modal-club-results">
            ${_renderModalClubList(clubRows.map(r => r.archer_id), '')}
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeAccessModal()">Cerrar</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);
}

function closeAccessModal() {
  document.getElementById('access-modal-backdrop')?.remove();
  _editingUser = null;
}

// ── Toggle "todos" (arqueros o clubes) ────────────────────────────────────────
// Flags are stored on app_users (via set_user_access_flags RPC), NOT as
// sentinel rows in user_archer_access — this avoids any RLS read issues.
async function toggleAllAccess(userId, flagField, checked, sectionId) {
  // Build the update: only change the relevant flag, keep the other unchanged
  const user      = _allUsers.find(u => u.id === userId);
  const allArch   = flagField === 'all_archers' ? checked : (user?.all_archers_access ?? false);
  const allClubs  = flagField === 'all_clubs'   ? checked : (user?.all_clubs_access   ?? false);

  const { error } = await _sb.rpc('set_user_access_flags', {
    p_user_id:     userId,
    p_all_archers: allArch,
    p_all_clubs:   allClubs,
  });

  if (error) {
    alert(`Error al guardar: ${error.message}`);
    // revert checkbox
    const chkId = flagField === 'all_archers' ? 'chk-all-archers' : 'chk-all-clubs';
    const chk = document.getElementById(chkId);
    if (chk) chk.checked = !checked;
    return;
  }

  // Update local cache so next toggle has correct "other flag" value
  if (user) {
    if (flagField === 'all_archers') user.all_archers_access = checked;
    else                             user.all_clubs_access   = checked;
  }

  // Dim/undim the individual section
  const sec = document.getElementById(sectionId);
  if (sec) {
    sec.style.opacity       = checked ? '0.4' : '';
    sec.style.pointerEvents = checked ? 'none' : '';
  }
}

// ── Arqueros individuales ─────────────────────────────────────────────────────
function filterModalArchers(query) {
  if (!_editingUser) return;
  const currentIds = _getCurrentTagIds('#access-tags');
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

async function addArcherAccess(userId, archerId, archerName) {
  const { error } = await _sb.from('user_archer_access').insert({
    user_id: userId, archer_id: archerId, archer_name: archerName,
  });
  if (error && !error.message.includes('duplicate')) {
    alert(`Error: ${error.message}`); return;
  }
  const tagsEl = document.getElementById('access-tags');
  if (tagsEl) {
    tagsEl.querySelector('.access-empty')?.remove();
    tagsEl.insertAdjacentHTML('beforeend', _archerTagHTML(userId, archerId, archerName));
  }
  const currentIds = _getCurrentTagIds('#access-tags');
  const query = document.getElementById('modal-archer-search')?.value || '';
  const resultsEl = document.getElementById('modal-archer-results');
  if (resultsEl) resultsEl.innerHTML = _renderModalArcherList(currentIds, query);
}

async function removeArcherAccess(userId, archerId) {
  const { error } = await _sb.from('user_archer_access')
    .delete().eq('user_id', userId).eq('archer_id', archerId);
  if (error) { alert(`Error: ${error.message}`); return; }

  document.querySelector(`#access-tags .archer-tag[data-archer-id="${archerId}"]`)?.remove();
  const tagsEl = document.getElementById('access-tags');
  if (tagsEl && !tagsEl.querySelector('.archer-tag')) {
    tagsEl.innerHTML = '<span class="access-empty">Ninguno aún</span>';
  }
  const currentIds = _getCurrentTagIds('#access-tags');
  const query = document.getElementById('modal-archer-search')?.value || '';
  const resultsEl = document.getElementById('modal-archer-results');
  if (resultsEl) resultsEl.innerHTML = _renderModalArcherList(currentIds, query);
}

// ── Clubes individuales ───────────────────────────────────────────────────────
function filterModalClubs(query) {
  if (!_editingUser) return;
  const currentIds = _getCurrentTagIds('#club-access-tags');
  const el = document.getElementById('modal-club-results');
  if (el) el.innerHTML = _renderModalClubList(currentIds, query);
}

function _renderModalClubList(assignedClubEntryIds, query) {
  // assignedClubEntryIds are like ['club:cuda', 'club:rain']
  const q        = (query || '').toLowerCase();
  const assigned = new Set(assignedClubEntryIds);
  const visible  = _clubList.filter(c => !q || c.name.toLowerCase().includes(q)).slice(0, 60);

  if (!visible.length) return '<div style="padding:10px 12px;font-size:0.8rem;color:var(--muted)">Sin resultados</div>';

  return visible.map(c => {
    const entryId = `club:${c.club_id}`;
    const done    = assigned.has(entryId);
    return `<div class="modal-archer-item${done ? ' already-added' : ''}"
      onclick="${done ? '' : `addClubAccess('${_editingUser?.id}','${c.club_id}','${_esc(c.name)}')`}">
      ${done ? '✓ ' : ''}${_esc(c.name)}
      <span style="font-size:0.72rem;color:var(--muted);margin-left:4px">${c.club_id}</span>
    </div>`;
  }).join('');
}

function _clubTagHTML(userId, clubEntryId, clubName) {
  // clubEntryId = 'club:cuda'
  return `<span class="archer-tag" data-archer-id="${clubEntryId}">
    ${_esc(clubName || clubEntryId)}
    <button onclick="removeClubAccess('${userId}','${clubEntryId}')" title="Quitar">×</button>
  </span>`;
}

async function addClubAccess(userId, clubId, clubName) {
  const entryId = `club:${clubId}`;
  const { error } = await _sb.from('user_archer_access').insert({
    user_id: userId, archer_id: entryId, archer_name: clubName,
  });
  if (error && !error.message.includes('duplicate')) {
    alert(`Error: ${error.message}`); return;
  }
  const tagsEl = document.getElementById('club-access-tags');
  if (tagsEl) {
    tagsEl.querySelector('.access-empty')?.remove();
    tagsEl.insertAdjacentHTML('beforeend', _clubTagHTML(userId, entryId, clubName));
  }
  const currentIds = _getCurrentTagIds('#club-access-tags');
  const query = document.getElementById('modal-club-search')?.value || '';
  const resultsEl = document.getElementById('modal-club-results');
  if (resultsEl) resultsEl.innerHTML = _renderModalClubList(currentIds, query);
}

async function removeClubAccess(userId, clubEntryId) {
  const { error } = await _sb.from('user_archer_access')
    .delete().eq('user_id', userId).eq('archer_id', clubEntryId);
  if (error) { alert(`Error: ${error.message}`); return; }

  document.querySelector(`#club-access-tags .archer-tag[data-archer-id="${clubEntryId}"]`)?.remove();
  const tagsEl = document.getElementById('club-access-tags');
  if (tagsEl && !tagsEl.querySelector('.archer-tag')) {
    tagsEl.innerHTML = '<span class="access-empty">Ninguno aún</span>';
  }
  const currentIds = _getCurrentTagIds('#club-access-tags');
  const query = document.getElementById('modal-club-search')?.value || '';
  const resultsEl = document.getElementById('modal-club-results');
  if (resultsEl) resultsEl.innerHTML = _renderModalClubList(currentIds, query);
}

// ── Utilidades ────────────────────────────────────────────────────────────────
function _getCurrentTagIds(containerSelector) {
  return [...document.querySelectorAll(`${containerSelector} .archer-tag`)]
    .map(el => el.dataset.archerId).filter(Boolean);
}

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
