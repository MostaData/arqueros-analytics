'use strict';

// Panel de control admin: muestra estado del scraper, integridad de datos,
// y herramientas de preparación para segmentación por cliente.

const DATA_FILES = [
  { name: 'calendar.json', label: 'Calendario' },
  { name: 'tournaments.json', label: 'Torneos' },
  { name: 'all-results.json', label: 'Resultados' },
  { name: 'archers-index.json', label: 'Arqueros' },
  { name: 'clubs-index.json', label: 'Clubes' },
];

async function loadAdminData() {
  const results = {};
  await Promise.all(
    DATA_FILES.map(async (f) => {
      try {
        const r = await fetch(`data/${f.name}`);
        results[f.name] = await r.json();
      } catch {
        results[f.name] = null;
      }
    })
  );
  return results;
}

function renderDataStatus(data) {
  const container = document.getElementById('data-status-grid');
  if (!container) return;

  container.innerHTML = DATA_FILES.map((f) => {
    const d = data[f.name];
    if (!d) {
      return `<div class="status-card error">
        <div class="status-label">${f.label}</div>
        <div class="status-value">⚠ Error</div>
        <div class="status-sub">No se pudo cargar ${f.name}</div>
      </div>`;
    }

    const meta = d.meta || {};
    const updated = meta.last_updated
      ? new Date(meta.last_updated).toLocaleString('es-AR')
      : 'Nunca actualizado';

    let count = '—';
    let countLabel = '';
    if (d.tournaments) { count = d.tournaments.length; countLabel = 'torneos'; }
    else if (d.results) { count = d.results.length; countLabel = 'resultados'; }
    else if (d.archers) { count = d.archers.length; countLabel = 'arqueros'; }
    else if (d.clubs) { count = d.clubs.length; countLabel = 'clubes'; }

    const isPopulated = count !== '—' && count > 0;
    const statusClass = isPopulated ? 'ok' : 'warning';

    return `<div class="status-card ${statusClass}">
      <div class="status-label">${f.label}</div>
      <div class="status-value">${count.toLocaleString('es-AR')}</div>
      <div class="status-sub">${countLabel} · ${updated}</div>
    </div>`;
  }).join('');
}

function renderIntegrityWarnings(data) {
  const container = document.getElementById('integrity-warnings');
  if (!container) return;

  const warnings = [];
  const tournaments = data['tournaments.json']?.tournaments || [];
  const results = data['all-results.json']?.results || [];
  const archers = data['archers-index.json']?.archers || [];
  const clubs = data['clubs-index.json']?.clubs || [];

  if (!tournaments.length) warnings.push({ level: 'error', msg: 'No hay torneos cargados. Ejecutá el scraper primero.' });
  if (!results.length) warnings.push({ level: 'error', msg: 'No hay resultados cargados. El scraper aún no completó el proceso.' });

  // Tournaments without results
  const noResults = tournaments.filter((t) => !t.stub_only && t.total_archers === 0);
  if (noResults.length > 0) {
    warnings.push({ level: 'warning', msg: `${noResults.length} torneos sin resultados (pueden estar sin publicar o fallaron al scrapear).` });
  }

  // Score anomalies
  const highScores = results.filter((r) => r.total_score > 900);
  if (highScores.length > 0) {
    warnings.push({ level: 'info', msg: `${highScores.length} resultados con puntaje > 900. Verificar si son correctos.` });
  }

  // Partial results
  const partials = results.filter((r) => r.is_partial);
  if (partials.length > 0) {
    warnings.push({ level: 'info', msg: `${partials.length} resultados marcados como parciales (solo 1 ronda en Campo/3D).` });
  }

  // Zero scores
  const zeroScores = results.filter((r) => r.total_score === 0);
  if (zeroScores.length > 0) {
    warnings.push({ level: 'warning', msg: `${zeroScores.length} resultados con puntaje = 0. Posibles errores de parseo.` });
  }

  // Archer name duplicates (same display name, different slugs — possible normalization issue)
  const nameCounts = {};
  for (const a of archers) {
    const key = a.display_name.toLowerCase();
    nameCounts[key] = (nameCounts[key] || []).concat(a.id);
  }
  const dupes = Object.entries(nameCounts).filter(([, ids]) => ids.length > 1);
  if (dupes.length > 0) {
    warnings.push({ level: 'info', msg: `${dupes.length} posibles arqueros duplicados (mismo nombre visible, diferentes IDs). Ejemplo: "${dupes[0][0]}".` });
  }

  if (!warnings.length) {
    warnings.push({ level: 'ok', msg: 'Todos los controles pasaron. Los datos parecen íntegros.' });
  }

  const icons = { error: '🔴', warning: '🟡', info: '🔵', ok: '🟢' };
  container.innerHTML = warnings.map((w) =>
    `<div class="warning-item warning-${w.level}">${icons[w.level]} ${w.msg}</div>`
  ).join('');
}

function renderArcherSearch(data) {
  const archers = data['archers-index.json']?.archers || [];
  const input = document.getElementById('admin-archer-search');
  const list = document.getElementById('admin-archer-list');
  if (!input || !list) return;

  input.addEventListener('input', () => {
    const q = input.value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (q.length < 2) { list.innerHTML = ''; return; }

    const matches = archers.filter((a) =>
      a.name_normalized.includes(q) || a.display_name.toLowerCase().includes(q)
    ).slice(0, 20);

    list.innerHTML = matches.length
      ? matches.map((a) => `
        <div class="admin-list-item">
          <strong>${a.display_name}</strong> <span class="text-muted">(${a.id})</span><br>
          <small class="text-muted">${a.primary_division || '—'} · ${a.stats.total_results} participaciones · ${a.clubs_history.map((c) => c.club_name).join(', ')}</small>
        </div>
      `).join('')
      : '<div class="text-muted" style="padding:12px">Sin resultados</div>';
  });
}

function renderClubSearch(data) {
  const clubs = data['clubs-index.json']?.clubs || [];
  const input = document.getElementById('admin-club-search');
  const list = document.getElementById('admin-club-list');
  if (!input || !list) return;

  input.addEventListener('input', () => {
    const q = input.value.toLowerCase();
    const matches = clubs.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 20);

    list.innerHTML = matches.length
      ? matches.map((c) => `
        <div class="admin-list-item">
          <strong>${c.name}</strong> <span class="text-muted">(${c.id})</span><br>
          <small class="text-muted">${c.stats.total_members_seen} arqueros · ${c.stats.total_archer_entries} entradas · ${(c.stats.disciplines_participated || []).join(', ')}</small>
        </div>
      `).join('')
      : '<div class="text-muted" style="padding:12px">Sin resultados</div>';
  });
}

function renderSegmentPreview(data) {
  const archers = data['archers-index.json']?.archers || [];
  const clubs = data['clubs-index.json']?.clubs || [];
  const results = data['all-results.json']?.results || [];

  document.getElementById('seg-total-archers').textContent = archers.length;
  document.getElementById('seg-total-clubs').textContent = clubs.length;
  document.getElementById('seg-total-results').textContent = results.length;
}

function renderLastScrape(data) {
  const meta = data['all-results.json']?.meta;
  const lu = meta?.last_updated;
  if (lu) {
    document.getElementById('last-scrape-time').textContent = new Date(lu).toLocaleString('es-AR');
  } else {
    document.getElementById('last-scrape-time').textContent = 'Nunca (datos vacíos)';
  }
}

async function loadVisitStats() {
  try {
    const { data, error } = await _sb.rpc('get_page_view_stats');
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.warn('[admin] visit stats failed:', e.message);
    return null;
  }
}

function renderVisitStats(rows) {
  const container = document.getElementById('visit-stats-container');
  if (!container) return;

  if (rows === null) {
    container.innerHTML = '<div class="warning-item warning-error">🔴 No se pudieron cargar las estadísticas. ¿Ejecutaste <code>supabase-pageviews.sql</code>?</div>';
    return;
  }
  if (!rows.length) {
    container.innerHTML = '<div class="warning-item warning-info">🔵 Sin visitas registradas todavía.</div>';
    return;
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const d7Str    = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);

  let totalToday = 0, total7d = 0, total30d = 0;
  const byPage = {};
  const byDay  = {};

  for (const r of rows) {
    const count = Number(r.total);
    total30d += count;
    if (r.day >= d7Str)    total7d    += count;
    if (r.day === todayStr) totalToday += count;

    if (!byPage[r.page]) byPage[r.page] = { today: 0, d7: 0, d30: 0 };
    byPage[r.page].d30 += count;
    if (r.day >= d7Str)    byPage[r.page].d7    += count;
    if (r.day === todayStr) byPage[r.page].today += count;

    byDay[r.day] = (byDay[r.day] || 0) + count;
  }

  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    last7.push({ day: d, count: byDay[d] || 0 });
  }
  const maxDay = Math.max(...last7.map((d) => d.count), 1);

  const pageLabels = { dashboard: '📊 Dashboard', login: '🔑 Login', admin: '⚙ Admin' };

  const barsHtml = last7.map((d) => {
    const barH  = Math.max(d.count ? 3 : 0, Math.round((d.count / maxDay) * 64));
    const label = new Date(d.day + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' });
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px">
      <span style="font-size:0.7rem;color:var(--accent);height:16px;line-height:16px">${d.count || ''}</span>
      <div style="width:100%;height:64px;display:flex;align-items:flex-end">
        <div style="width:100%;height:${barH}px;background:var(--accent);border-radius:3px 3px 0 0;opacity:0.75"></div>
      </div>
      <span style="font-size:0.65rem;color:var(--muted);white-space:nowrap">${label}</span>
    </div>`;
  }).join('');

  const tableRows = Object.entries(byPage).map(([page, c]) => `
    <div style="display:grid;grid-template-columns:1fr repeat(3,70px);padding:10px 16px;font-size:0.84rem;border-bottom:1px solid var(--border)">
      <span>${pageLabels[page] || page}</span>
      <span style="text-align:center;color:var(--accent)">${c.today}</span>
      <span style="text-align:center">${c.d7}</span>
      <span style="text-align:center;color:var(--muted)">${c.d30}</span>
    </div>`).join('');

  container.innerHTML = `
    <div class="seg-grid" style="margin-bottom:20px">
      <div class="kpi-card">
        <div class="kpi-label">Visitas hoy</div>
        <div class="kpi-value text-accent">${totalToday}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Últimos 7 días</div>
        <div class="kpi-value text-accent">${total7d}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Últimos 30 días</div>
        <div class="kpi-value text-accent">${total30d}</div>
      </div>
    </div>

    <div class="section-title" style="font-size:0.78rem;margin-bottom:8px">Por página (últimos 30 días)</div>
    <div class="user-list-container" style="margin-bottom:20px">
      <div style="display:grid;grid-template-columns:1fr repeat(3,70px);padding:8px 16px;font-size:0.72rem;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid var(--border)">
        <span>Página</span><span style="text-align:center">Hoy</span><span style="text-align:center">7d</span><span style="text-align:center">30d</span>
      </div>
      ${tableRows}
    </div>

    <div class="section-title" style="font-size:0.78rem;margin-bottom:8px">Últimos 7 días (todas las páginas)</div>
    <div style="display:flex;gap:6px;padding:0 4px">${barsHtml}</div>
  `;
}

async function init() {
  document.getElementById('admin-loading')?.style && (document.getElementById('admin-loading').style.display = 'flex');

  const [data, visitRows] = await Promise.all([loadAdminData(), loadVisitStats()]);

  document.getElementById('admin-loading')?.style && (document.getElementById('admin-loading').style.display = 'none');

  renderLastScrape(data);
  renderDataStatus(data);
  renderIntegrityWarnings(data);
  renderVisitStats(visitRows);
  renderArcherSearch(data);
  renderClubSearch(data);
  renderSegmentPreview(data);
}

document.addEventListener('DOMContentLoaded', init);
