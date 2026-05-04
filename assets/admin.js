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

async function init() {
  document.getElementById('admin-loading')?.style && (document.getElementById('admin-loading').style.display = 'flex');

  const data = await loadAdminData();

  document.getElementById('admin-loading')?.style && (document.getElementById('admin-loading').style.display = 'none');

  renderLastScrape(data);
  renderDataStatus(data);
  renderIntegrityWarnings(data);
  renderArcherSearch(data);
  renderClubSearch(data);
  renderSegmentPreview(data);
}

document.addEventListener('DOMContentLoaded', init);
