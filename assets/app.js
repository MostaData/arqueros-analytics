'use strict';

// ─── STATE ───────────────────────────────────────────────────────────────────
const state = {
  tournaments: null,
  results: null,
  archers: null,
  clubs: null,
  calendar: null,
  filters: {
    year: 'all',
    discipline: 'all',
    division: 'all',
    gender: 'all',
    club: 'all',
    zone: 'all',
  },
  charts: {},
  currentSection: 'resumen',
  archerFilters: { division: 'all', discipline: 'all', year: 'all' },
  archerSearchQuery: '',
  selectedArcherId: null,
  selectedClubId: null,
  selectedClubArcherIds: [],
  tournamentPage: 1,
  rankingPage: 1,
  PAGE_SIZE: 30,
};

// ─── DIVISION COLORS ─────────────────────────────────────────────────────────
// Palette of visually distinct colors for dynamic per-chart assignment
const CHART_PALETTE = [
  '#4f8ef7', '#22c55e', '#f59e0b', '#ef4444', '#7c5cfc',
  '#06b6d4', '#f97316', '#ec4899', '#14b8a6', '#a3e635',
  '#fb923c', '#818cf8', '#34d399', '#fbbf24', '#f472b6',
];
const DIVISION_COLOR_DEFAULT = '#8892a4';

// Builds a { divisionName → color } map for a specific set of divisions.
// Colors are assigned in order of first appearance, cycling the palette.
function buildDivisionColorMap(divisions) {
  const unique = [...new Set(divisions.filter(Boolean))];
  const map = {};
  unique.forEach((d, i) => { map[d] = CHART_PALETTE[i % CHART_PALETTE.length]; });
  return map;
}

function getDivisionColor(d, colorMap) {
  if (colorMap && colorMap[d]) return colorMap[d];
  return DIVISION_COLOR_DEFAULT;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function fmt(n) {
  if (n === null || n === undefined) return '—';
  return Number.isInteger(n) ? n.toLocaleString('es-AR') : n.toFixed(1);
}

function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function average(arr) {
  const nums = arr.filter((n) => n !== null && n > 0);
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function disciplineBadge(name) {
  const map = { 'Aire Libre': 1, Sala: 2, Campo: 3, '3D': 4 };
  const code = map[name] || 0;
  return `<span class="badge badge-disc-${code}">${name || '—'}</span>`;
}

function rankClass(pos) {
  if (pos === 1) return 'rank-1';
  if (pos === 2) return 'rank-2';
  if (pos === 3) return 'rank-3';
  return '';
}

// ─── DATA LOADING ─────────────────────────────────────────────────────────────
async function loadAllData() {
  // fetch() is blocked by browsers when opening files directly (file:// protocol)
  if (location.protocol === 'file:') {
    document.getElementById('loading-overlay').innerHTML = `
      <div style="text-align:center;padding:32px;max-width:520px;margin:auto">
        <div style="font-size:2.5rem;margin-bottom:16px">⚠️</div>
        <div style="color:#f59e0b;font-weight:700;font-size:1.1rem;margin-bottom:10px">
          Abrí el dashboard con un servidor</div>
        <div style="color:#8892a4;font-size:0.88rem;line-height:1.8">
          Los navegadores bloquean la carga de archivos locales por seguridad.<br><br>
          <strong style="color:#e2e8f0">Opción 1 — GitHub Pages (recomendado):</strong><br>
          <a href="https://mostadata.github.io/arqueros-analytics/" target="_blank"
             style="color:#4f8ef7">mostadata.github.io/arqueros-analytics</a><br><br>
          <strong style="color:#e2e8f0">Opción 2 — Servidor local:</strong><br>
          <code style="background:#1a1f2e;padding:4px 8px;border-radius:4px">
            python3 -m http.server 8080</code><br>
          luego abrí <a href="http://localhost:8080" target="_blank"
             style="color:#4f8ef7">localhost:8080</a>
        </div>
      </div>`;
    return;
  }

  const files = ['calendar', 'tournaments', 'all-results', 'archers-index', 'clubs-index'];
  try {
    const responses = await Promise.all(
      files.map((f) =>
        fetch(`data/${f}.json`).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status} al cargar ${f}.json`);
          return r.json();
        })
      )
    );
    state.calendar = responses[0];
    state.tournaments = responses[1];
    state.results = responses[2];
    state.archers = responses[3];
    state.clubs = responses[4];
  } catch (err) {
    console.error('Error loading data:', err);
    document.getElementById('loading-overlay').innerHTML =
      `<div class="loading-text" style="color:#ef4444">Error cargando datos: ${err.message}</div>`;
    throw err;
  }
}

// ─── FILTER PIPELINE ─────────────────────────────────────────────────────────
function getTournamentById(id) {
  return state.tournaments?.tournaments?.find((t) => t.id === id) || null;
}

function applyFilters(results) {
  const { year, discipline, division, gender, club, zone } = state.filters;
  return results.filter((r) => {
    const t = getTournamentById(r.tournament_id);
    if (!t) return false;
    if (year !== 'all' && (!t.date || !t.date.startsWith(year))) return false;
    if (discipline !== 'all' && t.discipline_name !== discipline) return false;
    if (division !== 'all' && r.division !== division) return false;
    if (gender !== 'all' && r.gender !== gender) return false;
    if (club !== 'all' && r.club_id !== club) return false;
    if (zone !== 'all' && t.zone !== zone) return false;
    return true;
  });
}

function getFilteredResults() {
  return applyFilters(state.results?.results || []);
}

// ─── POPULATE FILTER DROPDOWNS ────────────────────────────────────────────────
function populateFilters() {
  const results = state.results?.results || [];
  const tournaments = state.tournaments?.tournaments || [];

  const years = [...new Set(tournaments.map((t) => t.date?.slice(0, 4)).filter(Boolean))].sort().reverse();
  const disciplines = [...new Set(tournaments.map((t) => t.discipline_name).filter(Boolean))].sort();
  const divisions = [...new Set(results.map((r) => r.division).filter(Boolean))].sort();
  const genders = [...new Set(results.map((r) => r.gender).filter(Boolean))].sort();
  const zones = [...new Set(tournaments.map((t) => t.zone).filter(Boolean))].sort();

  function fillSelect(id, values, currentVal) {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = `<option value="all">Todos</option>` +
      values.map((v) => `<option value="${v}"${currentVal === v ? ' selected' : ''}>${v}</option>`).join('');
  }

  document.querySelectorAll('[data-filter="year"]').forEach((el) => {
    el.innerHTML = `<option value="all">Todos los años</option>` +
      years.map((y) => `<option value="${y}"${state.filters.year === y ? ' selected' : ''}>${y}</option>`).join('');
  });
  document.querySelectorAll('[data-filter="discipline"]').forEach((el) => {
    el.innerHTML = `<option value="all">Todas</option>` +
      disciplines.map((d) => `<option value="${d}"${state.filters.discipline === d ? ' selected' : ''}>${d}</option>`).join('');
  });
  document.querySelectorAll('[data-filter="division"]').forEach((el) => {
    el.innerHTML = `<option value="all">Todas</option>` +
      divisions.map((d) => `<option value="${d}"${state.filters.division === d ? ' selected' : ''}>${d}</option>`).join('');
  });
  document.querySelectorAll('[data-filter="gender"]').forEach((el) => {
    el.innerHTML = `<option value="all">Todos</option>` +
      genders.map((g) => `<option value="${g}"${state.filters.gender === g ? ' selected' : ''}>${g}</option>`).join('');
  });
  document.querySelectorAll('[data-filter="zone"]').forEach((el) => {
    el.innerHTML = `<option value="all">Todas</option>` +
      zones.map((z) => `<option value="${z}"${state.filters.zone === z ? ' selected' : ''}>${z}</option>`).join('');
  });

  // Club filter
  const clubs = state.clubs?.clubs || [];
  document.querySelectorAll('[data-filter="club"]').forEach((el) => {
    el.innerHTML = `<option value="all">Todos</option>` +
      clubs.map((c) => `<option value="${c.id}"${state.filters.club === c.id ? ' selected' : ''}>${c.name}</option>`).join('');
  });
}

function bindFilters() {
  document.querySelectorAll('[data-filter]').forEach((el) => {
    el.addEventListener('change', () => {
      state.filters[el.dataset.filter] = el.value;
      // Sync all same-name filters
      document.querySelectorAll(`[data-filter="${el.dataset.filter}"]`).forEach((other) => {
        other.value = el.value;
      });
      renderCurrentSection();
    });
  });
}

// ─── SECTION: RESUMEN ────────────────────────────────────────────────────────
function renderResumen() {
  const results = getFilteredResults();
  const tournaments = state.tournaments?.tournaments || [];
  const archers = state.archers?.archers || [];
  const clubs = state.clubs?.clubs || [];

  const filteredTournaments = tournaments.filter((t) => {
    const { year, discipline, zone } = state.filters;
    if (year !== 'all' && (!t.date || !t.date.startsWith(year))) return false;
    if (discipline !== 'all' && t.discipline_name !== discipline) return false;
    if (zone !== 'all' && t.zone !== zone) return false;
    return !t.stub_only || true;
  });

  const uniqueArcherIds = new Set(results.map((r) => r.archer_id));
  const uniqueClubIds = new Set(results.map((r) => r.club_id));

  const scores = results.map((r) => r.total_score).filter((s) => s > 0);
  const avgScore = average(scores);
  const bestScore = scores.length ? Math.max(...scores) : null;

  const participationCount = {};
  for (const r of results) {
    participationCount[r.archer_id] = (participationCount[r.archer_id] || 0) + 1;
  }
  const topArcherId = Object.entries(participationCount).sort((a, b) => b[1] - a[1])[0];
  const topArcherObj = topArcherId ? archers.find((a) => a.id === topArcherId[0]) : null;

  const clubPartCount = {};
  for (const r of results) {
    clubPartCount[r.club_id] = (clubPartCount[r.club_id] || 0) + 1;
  }
  const topClubId = Object.entries(clubPartCount).sort((a, b) => b[1] - a[1])[0];
  const topClubObj = topClubId ? clubs.find((c) => c.id === topClubId[0]) : null;

  const datesWithResults = filteredTournaments.filter((t) => !t.stub_only).map((t) => t.date).filter(Boolean).sort();
  const lastTournament = datesWithResults[datesWithResults.length - 1];
  const lastTournamentObj = lastTournament
    ? filteredTournaments.find((t) => t.date === lastTournament)
    : null;

  document.getElementById('kpi-torneos').textContent = fmt(filteredTournaments.filter((t) => !t.stub_only).length);
  document.getElementById('kpi-arqueros').textContent = fmt(uniqueArcherIds.size);
  document.getElementById('kpi-clubes').textContent = fmt(uniqueClubIds.size);
  document.getElementById('kpi-participaciones').textContent = fmt(results.length);
  document.getElementById('kpi-avg-score').textContent = avgScore ? avgScore.toFixed(1) : '—';
  document.getElementById('kpi-best-score').textContent = fmt(bestScore);
  document.getElementById('kpi-top-archer').textContent = topArcherObj ? topArcherObj.display_name : '—';
  document.getElementById('kpi-top-archer-sub').textContent = topArcherId ? `${topArcherId[1]} participaciones` : '';
  document.getElementById('kpi-top-club').textContent = topClubObj ? topClubObj.name : '—';
  document.getElementById('kpi-top-club-sub').textContent = topClubId ? `${topClubId[1]} entradas` : '';
  document.getElementById('kpi-last-torneo').textContent = lastTournamentObj
    ? `${lastTournamentObj.club} (${fmtDate(lastTournament)})`
    : '—';

  renderResumenCharts(results, filteredTournaments);
  renderRecentTournaments(filteredTournaments);
}

function renderResumenCharts(results, tournaments) {
  // Monthly tournament activity
  const monthlyCount = {};
  for (const t of tournaments) {
    if (!t.date || t.stub_only) continue;
    const ym = t.date.slice(0, 7);
    monthlyCount[ym] = (monthlyCount[ym] || 0) + 1;
  }
  const sortedMonths = Object.keys(monthlyCount).sort().slice(-18);
  renderBarChart('chart-activity', sortedMonths.map((m) => m.slice(0, 7)), sortedMonths.map((m) => monthlyCount[m]), 'Torneos por mes', '#4f8ef7');

  // Discipline distribution
  const discCount = {};
  for (const r of results) {
    const t = getTournamentById(r.tournament_id);
    if (!t) continue;
    discCount[t.discipline_name] = (discCount[t.discipline_name] || 0) + 1;
  }
  renderDoughnutChart('chart-disciplines', Object.keys(discCount), Object.values(discCount));

  // Top clubs by participation
  const clubCount = {};
  for (const r of results) {
    clubCount[r.club_name] = (clubCount[r.club_name] || 0) + 1;
  }
  const topClubs = Object.entries(clubCount).sort((a, b) => b[1] - a[1]).slice(0, 10);
  renderBarChart('chart-clubs', topClubs.map((c) => c[0]), topClubs.map((c) => c[1]), 'Participaciones por club', '#7c5cfc', true);

  // Score distribution
  const scores = results.map((r) => r.total_score).filter((s) => s > 0);
  if (scores.length > 0) {
    const min = Math.floor(Math.min(...scores) / 50) * 50;
    const max = Math.ceil(Math.max(...scores) / 50) * 50;
    const buckets = {};
    for (let b = min; b < max; b += 50) buckets[`${b}-${b + 49}`] = 0;
    for (const s of scores) {
      const bucket = Math.floor(s / 50) * 50;
      const key = `${bucket}-${bucket + 49}`;
      buckets[key] = (buckets[key] || 0) + 1;
    }
    renderBarChart('chart-score-dist', Object.keys(buckets), Object.values(buckets), 'Distribución de puntajes', '#22c55e');
  }
}

function renderRecentTournaments(tournaments) {
  const recent = [...tournaments]
    .filter((t) => t.date && !t.stub_only)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10);

  const container = document.getElementById('recent-tournaments-list');
  if (!container) return;

  if (!recent.length) {
    container.innerHTML = '<div class="empty-state"><span class="icon">📭</span>Sin datos disponibles. Ejecutá el scraper primero.</div>';
    return;
  }

  container.innerHTML = recent.map((t) => `
    <tr>
      <td>${fmtDate(t.date)}</td>
      <td>${disciplineBadge(t.discipline_name)}</td>
      <td>${t.club || '—'}</td>
      <td>${t.zone || '—'}</td>
      <td class="num">${fmt(t.total_archers)}</td>
      <td>${t.tournament_type ? `<span class="badge badge-disc-2">${t.tournament_type}</span>` : '—'}</td>
    </tr>
  `).join('');
}

// ─── SECTION: ARQUEROS ────────────────────────────────────────────────────────
function renderArqueros() {
  setupArcherAutocomplete();
  if (state.selectedArcherId) {
    renderArcherDetail(state.selectedArcherId);
  }
}

function setupArcherAutocomplete() {
  const input = document.getElementById('archer-search-input');
  const list  = document.getElementById('archer-autocomplete');
  if (!input || !list) return;

  // Avoid duplicate listeners
  if (input.dataset.bound) return;
  input.dataset.bound = '1';

  input.addEventListener('input', () => {
    const q = input.value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (q.length < 2) { list.innerHTML = ''; list.style.display = 'none'; return; }

    const archers = state.archers?.archers || [];
    const matches = archers.filter((a) =>
      a.name_normalized.includes(q) || a.display_name.toLowerCase().includes(q)
    ).slice(0, 12);

    if (!matches.length) { list.innerHTML = ''; list.style.display = 'none'; return; }

    list.style.display = 'block';
    list.innerHTML = matches.map((a) => `
      <div class="ac-item" data-id="${a.id}">
        <strong>${a.display_name}</strong>
        <div class="ac-sub">${a.primary_division || ''} · ${a.stats.total_results} torneos · ${a.clubs_history.map((c) => c.club_name).join(', ')}</div>
      </div>
    `).join('');

    list.querySelectorAll('.ac-item').forEach((item) => {
      item.addEventListener('click', () => {
        state.selectedArcherId = item.dataset.id;
        // Reset archer-specific filters on new selection
        state.archerFilters = { division: 'all', discipline: 'all', year: 'all' };
        input.value = archers.find((a) => a.id === item.dataset.id)?.display_name || '';
        list.innerHTML = ''; list.style.display = 'none';
        renderArcherDetail(item.dataset.id);
      });
    });
  });

  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !list.contains(e.target)) {
      list.style.display = 'none';
    }
  });
}

// ── Aplica los filtros propios del arquero (no los globales) ──────────────────
function applyArcherFilters(results) {
  const { division, discipline, year } = state.archerFilters;
  return results.filter((r) => {
    if (division   !== 'all' && r.division !== division) return false;
    if (discipline !== 'all' && r.tournament?.discipline_name !== discipline) return false;
    if (year       !== 'all' && (!r.tournament?.date || !r.tournament.date.startsWith(year))) return false;
    return true;
  });
}

// ── Rellena y muestra la barra de filtros del arquero ─────────────────────────
function setupArcherFilters(allResults, archerId) {
  const bar = document.getElementById('archer-filters');
  if (!bar) return;
  bar.style.display = 'flex';

  const divisions   = [...new Set(allResults.map((r) => r.division).filter(Boolean))].sort();
  const disciplines = [...new Set(allResults.map((r) => r.tournament?.discipline_name).filter(Boolean))].sort();
  const years       = [...new Set(allResults.map((r) => r.tournament?.date?.slice(0, 4)).filter(Boolean))].sort().reverse();

  function fill(id, values, placeholder) {
    const sel = document.getElementById(id);
    if (!sel) return;
    const cur = state.archerFilters[id.replace('af-', '')] || 'all';
    sel.innerHTML = `<option value="all">${placeholder}</option>` +
      values.map((v) => `<option value="${v}"${cur === v ? ' selected' : ''}>${v}</option>`).join('');
    sel.onchange = () => {
      state.archerFilters.division   = document.getElementById('af-division')?.value   || 'all';
      state.archerFilters.discipline = document.getElementById('af-discipline')?.value || 'all';
      state.archerFilters.year       = document.getElementById('af-year')?.value       || 'all';
      renderArcherDetail(archerId);
    };
  }

  fill('af-division',   divisions,   'Todas las divisiones');
  fill('af-discipline', disciplines, 'Todas las disciplinas');
  fill('af-year',       years,       'Todos los años');
}

// ── Detalle completo del arquero ──────────────────────────────────────────────
function renderArcherDetail(archerId) {
  const archer = state.archers?.archers?.find((a) => a.id === archerId);
  const detail = document.getElementById('archer-detail');
  const noSel  = document.getElementById('archer-no-selection');
  if (!archer || !detail) return;

  detail.classList.add('visible');
  if (noSel) noSel.style.display = 'none';

  // Todos los resultados del arquero (con objeto tournament adjunto)
  const allArcherResults = (state.results?.results || [])
    .filter((r) => r.archer_id === archerId)
    .map((r) => ({ ...r, tournament: getTournamentById(r.tournament_id) }))
    .filter((r) => r.tournament)
    .sort((a, b) => (b.tournament.date || '').localeCompare(a.tournament.date || ''));

  // Poblar filtros con solo los valores disponibles para este arquero
  setupArcherFilters(allArcherResults, archerId);

  // Aplicar filtros propios
  const filtered = applyArcherFilters(allArcherResults);

  // ── Encabezado ──
  document.getElementById('archer-detail-name').textContent = archer.display_name;
  document.getElementById('archer-detail-meta').innerHTML =
    `${archer.primary_division || '—'} · ${archer.primary_gender || '—'} · Activo desde ${fmtDate(archer.stats.career_start)}`;

  const wins    = filtered.filter((r) => r.position === 1).length;
  const podiums = filtered.filter((r) => r.position <= 3).length;
  const positions = filtered.map((r) => r.position).filter((p) => p > 0);
  const avgPos  = positions.length ? (positions.reduce((a, b) => a + b, 0) / positions.length).toFixed(1) : '—';
  const lastDate = filtered[0]?.tournament?.date;

  document.getElementById('archer-detail-pills').innerHTML = `
    <span class="pill green">${fmt(wins)} victorias</span>
    <span class="pill accent">${fmt(podiums)} podios</span>
    <span class="pill">${fmt(filtered.length)} participaciones</span>
    <span class="pill yellow">Pos. prom: ${avgPos}</span>
    <span class="pill">Último torneo: ${fmtDate(lastDate)}</span>
  `;

  // ── KPIs por disciplina (sobre resultados filtrados) ──
  const discKpis = document.getElementById('archer-disc-kpis');
  const byDisc = {};
  for (const r of filtered) {
    const d = r.tournament?.discipline_name;
    if (d) { if (!byDisc[d]) byDisc[d] = []; byDisc[d].push(r); }
  }
  discKpis.innerHTML = Object.entries(byDisc).map(([disc, rr]) => {
    const scores = rr.map((r) => r.total_score).filter((s) => s > 0);
    return `<div class="kpi-card">
      <div class="kpi-label">${disc}</div>
      <div class="kpi-value">${fmt(scores.length ? Math.max(...scores) : null)}</div>
      <div class="kpi-sub">Mejor · Prom: ${fmt(average(scores))} · ${rr.length} torneos · ${rr.filter((r) => r.position === 1).length} 🥇</div>
    </div>`;
  }).join('');

  // ── Gráficos ──
  const timeline = [...filtered].reverse();
  renderMultiDivisionProgressChart('chart-archer-progress', timeline);
  renderPodiumChart('chart-archer-podium', filtered);
  renderArcherCategoryComparison(filtered);

  // ── Tabla historial ──
  const historyBody = document.getElementById('archer-history-body');
  if (!filtered.length) {
    historyBody.innerHTML = `<tr><td colspan="11" style="text-align:center;color:var(--muted);padding:20px">Sin resultados para los filtros seleccionados</td></tr>`;
    return;
  }
  historyBody.innerHTML = filtered.map((r) => `
    <tr>
      <td>${fmtDate(r.tournament.date)}</td>
      <td>${disciplineBadge(r.tournament.discipline_name)}</td>
      <td>${r.tournament.club || '—'}</td>
      <td>${r.category_raw}</td>
      <td class="pos ${rankClass(r.position)}">${r.position}</td>
      <td class="num"><strong>${fmt(r.total_score)}</strong></td>
      <td class="num text-muted">${r.round1_score > 0 ? fmt(r.round1_score) : '—'}</td>
      <td class="num text-muted">${r.round2_score > 0 ? fmt(r.round2_score) : '—'}</td>
      <td class="num">${r.elevens}</td>
      <td class="num">${r.tens}</td>
      ${r.is_partial ? '<td><span class="badge badge-partial">Parcial</span></td>' : '<td></td>'}
    </tr>
  `).join('');
}

// ── Línea de evolución con segmentos coloreados por División ──────────────────
function renderMultiDivisionProgressChart(canvasId, timelineResults, legendId = 'archer-progress-legend') {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  destroyChart(canvasId);
  if (!timelineResults.length) return;

  const labels   = timelineResults.map((r) => fmtDate(r.tournament?.date));
  const data     = timelineResults.map((r) => r.total_score);
  const divs     = timelineResults.map((r) => r.division);

  // Assign a distinct color to each division that appears in THIS chart
  const colorMap  = buildDivisionColorMap(divs);
  const ptColors  = divs.map((d) => getDivisionColor(d, colorMap));

  state.charts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Puntaje',
        data,
        borderColor: '#4f8ef7',
        segment: {
          borderColor: (c) => getDivisionColor(divs[c.p1DataIndex], colorMap),
        },
        pointBackgroundColor: ptColors,
        pointBorderColor:     ptColors,
        pointRadius: 5,
        pointHoverRadius: 7,
        tension: 0.3,
        fill: false,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: { afterLabel: (c) => `División: ${divs[c.dataIndex]}` },
        },
      },
    },
  });

  // Leyenda: un ítem por cada división presente en el gráfico
  const legendEl = document.getElementById(legendId);
  if (legendEl) {
    legendEl.innerHTML = Object.entries(colorMap).map(([d, color]) =>
      `<span class="legend-item">
        <span class="legend-dot" style="background:${color}"></span>${d}
      </span>`
    ).join('');
  }
}

// ── Gráfico de podio: recuento por posición ───────────────────────────────────
function renderPodiumChart(canvasId, archerResults) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  destroyChart(canvasId);

  const posCount = {};
  for (const r of archerResults) {
    if (r.position >= 1) {
      const bucket = r.position <= 10 ? r.position : 'resto';
      posCount[bucket] = (posCount[bucket] || 0) + 1;
    }
  }

  const positions = Object.keys(posCount)
    .filter((k) => k !== 'resto')
    .map(Number)
    .sort((a, b) => a - b);
  const hasResto = !!posCount['resto'];
  if (!positions.length && !hasResto) return;

  const allLabels = [...positions.map((p) => `${p}°`), ...(hasResto ? ['Otros'] : [])];
  const allData   = [...positions.map((p) => posCount[p]), ...(hasResto ? [posCount['resto']] : [])];
  const allColors = [
    ...positions.map((p) => p === 1 ? '#ffd700' : p === 2 ? '#c0c0c0' : p === 3 ? '#cd7f32' : 'rgba(79,142,247,0.55)'),
    ...(hasResto ? ['rgba(136,146,164,0.4)'] : []),
  ];

  state.charts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: allLabels,
      datasets: [{
        label: 'Veces',
        data:   allData,
        backgroundColor: allColors,
        borderColor:     allColors,
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: { legend: { display: false } },
      scales: {
        x: { ...CHART_DEFAULTS.scales.x },
        y: { ...CHART_DEFAULTS.scales.y, ticks: { ...CHART_DEFAULTS.scales.y.ticks, stepSize: 1 } },
      },
    },
  });
}

// ── Comparación vs promedio de categoría ─────────────────────────────────────
function renderArcherCategoryComparison(filteredResults) {
  const container = document.getElementById('archer-category-comparison');
  if (!container) return;

  const divisions  = [...new Set(filteredResults.map((r) => r.division))];
  const allResults = state.results?.results || [];

  container.innerHTML = divisions.map((div) => {
    const archerScores = filteredResults.filter((r) => r.division === div).map((r) => r.total_score).filter((s) => s > 0);
    const divAvgAll    = average(allResults.filter((r) => r.division === div && r.total_score > 0).map((r) => r.total_score));
    const archerAvg    = average(archerScores);
    if (!archerAvg || !divAvgAll) return '';

    const diff      = archerAvg - divAvgAll;
    const diffClass = diff > 0 ? 'text-green' : diff < 0 ? 'text-red' : 'text-muted';
    const diffStr   = (diff > 0 ? '+' : '') + diff.toFixed(1);

    return `<div class="kpi-card" style="border-left:3px solid ${getDivisionColor(div)}">
      <div class="kpi-label">${div}</div>
      <div class="kpi-value">${archerAvg.toFixed(1)}</div>
      <div class="kpi-sub">Prom. personal · Cat: ${divAvgAll.toFixed(1)} · <span class="${diffClass}">${diffStr}</span></div>
    </div>`;
  }).join('');
}

// ─── SECTION: CLUBES ──────────────────────────────────────────────────────────
function renderClubes() {
  setupClubAutocomplete();
  if (state.selectedClubId) renderClubDetail(state.selectedClubId);
}

function setupClubAutocomplete() {
  const input = document.getElementById('club-search-input');
  const list  = document.getElementById('club-autocomplete');
  if (!input || !list || input.dataset.bound) return;
  input.dataset.bound = '1';

  input.addEventListener('input', () => {
    const q = input.value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (q.length < 2) { list.style.display = 'none'; return; }
    const clubs = state.clubs?.clubs || [];
    const matches = clubs
      .filter((c) => c.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q))
      .slice(0, 12);
    if (!matches.length) { list.style.display = 'none'; return; }
    list.style.display = 'block';
    list.innerHTML = matches.map((c) => `
      <div class="ac-item" data-id="${c.id}">
        <strong>${c.name}</strong>
        <div class="ac-sub">${c.stats.total_members_seen} arqueros · ${c.stats.tournaments_participated} torneos</div>
      </div>`).join('');
    list.querySelectorAll('.ac-item').forEach((item) => {
      item.addEventListener('click', () => {
        state.selectedClubId = item.dataset.id;
        state.selectedClubArcherIds = [];
        input.value = clubs.find((c) => c.id === item.dataset.id)?.name || '';
        list.style.display = 'none';
        renderClubDetail(item.dataset.id);
      });
    });
  });
  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !list.contains(e.target)) list.style.display = 'none';
  });
}

function renderClubDetail(clubId) {
  const club = state.clubs?.clubs?.find((c) => c.id === clubId);
  if (!club) return;
  document.getElementById('club-detail').style.display = 'block';
  document.getElementById('club-no-selection').style.display = 'none';

  // Todos los resultados de arqueros de este club
  const allResults = (state.results?.results || [])
    .filter((r) => r.club_id === clubId)
    .map((r) => ({ ...r, tournament: getTournamentById(r.tournament_id) }))
    .filter((r) => r.tournament)
    .sort((a, b) => (b.tournament.date || '').localeCompare(a.tournament.date || ''));

  // Arqueros que compitieron por este club
  const clubArchers = (state.archers?.archers || [])
    .filter((a) => a.clubs_history?.some((c) => c.club_id === clubId))
    .sort((a, b) => b.stats.total_results - a.stats.total_results);

  const wins    = allResults.filter((r) => r.position === 1).length;
  const podiums = allResults.filter((r) => r.position <= 3).length;
  const lastDate = allResults[0]?.tournament?.date;

  document.getElementById('club-detail-name').textContent = club.name;
  document.getElementById('club-detail-pills').innerHTML = `
    <span class="pill green">${fmt(wins)} victorias</span>
    <span class="pill accent">${fmt(podiums)} podios</span>
    <span class="pill">${fmt(allResults.length)} participaciones</span>
    <span class="pill yellow">${fmt(clubArchers.length)} arqueros</span>
    ${lastDate ? `<span class="pill">Última actividad: ${fmtDate(lastDate)}</span>` : ''}`;

  renderClubActivityChart(allResults);
  renderClubDivisionsChart(allResults);
  renderClubArchersList(clubArchers, clubId, allResults);

  if (state.selectedClubArcherIds.length) renderClubComparison();
  else document.getElementById('club-comparison-area').style.display = 'none';
}

function renderClubActivityChart(allResults) {
  const byYear = {};
  for (const r of allResults) {
    const y = r.tournament?.date?.slice(0, 4);
    if (y) byYear[y] = (byYear[y] || 0) + 1;
  }
  const years = Object.keys(byYear).sort();
  renderBarChart('chart-club-activity', years, years.map((y) => byYear[y]), 'Participaciones');
}

function renderClubDivisionsChart(allResults) {
  const byDiv = {};
  for (const r of allResults) if (r.division) byDiv[r.division] = (byDiv[r.division] || 0) + 1;
  const sorted = Object.entries(byDiv).sort((a, b) => b[1] - a[1]).slice(0, 12);
  renderBarChart('chart-club-divisions', sorted.map((e) => e[0]), sorted.map((e) => e[1]), 'Arqueros', '#22c55e', true);
}

function renderClubArchersList(clubArchers, clubId, allResults) {
  const container = document.getElementById('club-archers-list');
  if (!container) return;
  container.innerHTML = clubArchers.map((a) => {
    const ar = allResults.filter((r) => r.archer_id === a.id);
    const wins = ar.filter((r) => r.position === 1).length;
    const scores = ar.map((r) => r.total_score).filter((s) => s > 0);
    const best = scores.length ? Math.max(...scores) : null;
    const checked = state.selectedClubArcherIds.includes(a.id);
    return `<label class="club-archer-item${checked ? ' selected' : ''}" data-id="${a.id}">
      <input type="checkbox" value="${a.id}"${checked ? ' checked' : ''} onchange="onClubArcherToggle(this)">
      <div class="club-archer-info">
        <strong>${a.display_name}</strong>
        <span>${a.primary_division || '—'} · ${ar.length} torneos · ${wins} 🥇 · mejor: ${fmt(best)}</span>
      </div>
    </label>`;
  }).join('');
}

function onClubArcherToggle(checkbox) {
  const id = checkbox.value;
  if (checkbox.checked) {
    if (!state.selectedClubArcherIds.includes(id)) state.selectedClubArcherIds.push(id);
    checkbox.closest('.club-archer-item')?.classList.add('selected');
  } else {
    state.selectedClubArcherIds = state.selectedClubArcherIds.filter((x) => x !== id);
    checkbox.closest('.club-archer-item')?.classList.remove('selected');
  }
  renderClubComparison();
}

function renderClubComparison() {
  const area = document.getElementById('club-comparison-area');
  if (!area) return;
  const ids = state.selectedClubArcherIds;
  if (!ids.length) { area.style.display = 'none'; return; }
  area.style.display = 'block';

  const allResults = (state.results?.results || [])
    .map((r) => ({ ...r, tournament: getTournamentById(r.tournament_id) }))
    .filter((r) => r.tournament);

  destroyChart('chart-club-single-progress');
  destroyChart('chart-club-comparison');

  if (ids.length === 1) renderClubSingleArcher(area, ids[0], allResults);
  else renderClubMultiComparison(area, ids, allResults);
}

function renderClubSingleArcher(area, archerId, allResults) {
  const archer = state.archers?.archers?.find((a) => a.id === archerId);
  if (!archer) return;
  const results = allResults
    .filter((r) => r.archer_id === archerId)
    .sort((a, b) => (a.tournament.date || '').localeCompare(b.tournament.date || ''));
  const wins    = results.filter((r) => r.position === 1).length;
  const podiums = results.filter((r) => r.position <= 3).length;
  const scores  = results.map((r) => r.total_score).filter((s) => s > 0);
  const positions = results.map((r) => r.position).filter((p) => p > 0);
  const avgPos = positions.length ? (positions.reduce((a, b) => a + b, 0) / positions.length).toFixed(1) : '—';

  area.innerHTML = `
    <div class="card">
      <div class="section-title">${archer.display_name}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px;margin-bottom:16px">
        <div class="kpi-card"><div class="kpi-label">Participaciones</div><div class="kpi-value">${results.length}</div></div>
        <div class="kpi-card"><div class="kpi-label">Victorias</div><div class="kpi-value text-green">${wins}</div></div>
        <div class="kpi-card"><div class="kpi-label">Podios</div><div class="kpi-value text-accent">${podiums}</div></div>
        <div class="kpi-card"><div class="kpi-label">Mejor puntaje</div><div class="kpi-value">${fmt(scores.length ? Math.max(...scores) : null)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Promedio</div><div class="kpi-value">${fmt(average(scores))}</div></div>
        <div class="kpi-card"><div class="kpi-label">Pos. prom.</div><div class="kpi-value">${avgPos}</div></div>
      </div>
      <div class="chart-card">
        <h3>Evolución de puntaje</h3>
        <div id="club-single-legend" class="chart-legend"></div>
        <canvas id="chart-club-single-progress"></canvas>
      </div>
    </div>`;
  renderMultiDivisionProgressChart('chart-club-single-progress', results, 'club-single-legend');
}

function renderClubMultiComparison(area, ids, allResults) {
  const archers = ids.map((id) => state.archers?.archers?.find((a) => a.id === id)).filter(Boolean);
  const colorMap = {};
  archers.forEach((a, i) => { colorMap[a.id] = CHART_PALETTE[i % CHART_PALETTE.length]; });

  const tableRows = archers.map((a) => {
    const results   = allResults.filter((r) => r.archer_id === a.id);
    const wins      = results.filter((r) => r.position === 1).length;
    const podiums   = results.filter((r) => r.position <= 3).length;
    const scores    = results.map((r) => r.total_score).filter((s) => s > 0);
    const positions = results.map((r) => r.position).filter((p) => p > 0);
    const avgPos    = positions.length ? (positions.reduce((x, y) => x + y, 0) / positions.length).toFixed(1) : '—';
    const dot = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${colorMap[a.id]};margin-right:6px;flex-shrink:0"></span>`;
    return `<tr>
      <td>${dot}<strong>${a.display_name}</strong></td>
      <td class="num">${results.length}</td>
      <td class="num text-green">${wins}</td>
      <td class="num text-accent">${podiums}</td>
      <td class="num"><strong>${fmt(scores.length ? Math.max(...scores) : null)}</strong></td>
      <td class="num">${fmt(average(scores))}</td>
      <td class="num">${avgPos}</td>
    </tr>`;
  }).join('');

  area.innerHTML = `
    <div class="card">
      <div class="section-title">Comparación de arqueros (${archers.length})</div>
      <div class="table-wrapper" style="margin-bottom:16px">
        <table class="data-table">
          <thead><tr>
            <th>Arquero</th><th>Torneos</th><th>Victorias</th><th>Podios</th>
            <th>Mejor</th><th>Promedio</th><th>Pos. prom.</th>
          </tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
      <div class="chart-card">
        <h3>Puntaje promedio por año</h3>
        <canvas id="chart-club-comparison"></canvas>
      </div>
    </div>`;

  // Multi-line chart: avg score per year per archer
  const allYears = [...new Set(
    allResults
      .filter((r) => ids.includes(r.archer_id))
      .map((r) => r.tournament?.date?.slice(0, 4))
      .filter(Boolean)
  )].sort();

  const datasets = archers.map((a) => {
    const results = allResults.filter((r) => r.archer_id === a.id);
    const data = allYears.map((y) => {
      const scores = results
        .filter((r) => r.tournament?.date?.startsWith(y) && r.total_score > 0)
        .map((r) => r.total_score);
      return scores.length ? Math.round(scores.reduce((x, y) => x + y, 0) / scores.length) : null;
    });
    const color = colorMap[a.id];
    return {
      label: a.display_name, data,
      borderColor: color, backgroundColor: color + '33',
      pointBackgroundColor: color, pointRadius: 4, tension: 0.3,
      fill: false, spanGaps: true,
    };
  });

  const ctx = document.getElementById('chart-club-comparison');
  if (ctx) {
    state.charts['chart-club-comparison'] = new Chart(ctx, {
      type: 'line',
      data: { labels: allYears, datasets },
      options: {
        ...CHART_DEFAULTS,
        plugins: {
          legend: { display: true, labels: { color: '#8892a4', font: { size: 11 } } },
          tooltip: { mode: 'index', intersect: false },
        },
      },
    });
  }
}

// ─── SECTION: TORNEOS ────────────────────────────────────────────────────────
function renderTorneos() {
  const tournaments = (state.tournaments?.tournaments || []).filter((t) => !t.stub_only);
  const { year, discipline, zone } = state.filters;

  const filtered = tournaments.filter((t) => {
    if (year !== 'all' && (!t.date || !t.date.startsWith(year))) return false;
    if (discipline !== 'all' && t.discipline_name !== discipline) return false;
    if (zone !== 'all' && t.zone !== zone) return false;
    return true;
  }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const total = filtered.length;
  const pages = Math.ceil(total / state.PAGE_SIZE);
  const page = Math.min(state.tournamentPage, pages || 1);
  const slice = filtered.slice((page - 1) * state.PAGE_SIZE, page * state.PAGE_SIZE);

  const tbody = document.getElementById('tournaments-table-body');
  if (!tbody) return;

  tbody.innerHTML = slice.map((t) => `
    <tr>
      <td>${fmtDate(t.date)}</td>
      <td>${disciplineBadge(t.discipline_name)}</td>
      <td>${t.club || '—'}</td>
      <td>${t.zone || '—'}</td>
      <td>${t.tournament_type || '—'}</td>
      <td class="num">${fmt(t.total_archers)}</td>
      <td style="font-size:0.75rem;color:var(--muted)">${(t.categories || []).slice(0, 3).join(', ')}${t.categories?.length > 3 ? '…' : ''}</td>
    </tr>
  `).join('');

  renderPagination('tournaments-pagination', page, pages, (p) => {
    state.tournamentPage = p;
    renderTorneos();
  });

  document.getElementById('torneos-count').textContent = `${total} torneos`;
}

// ─── SECTION: RANKINGS ────────────────────────────────────────────────────────
function renderRankings() {
  const results = getFilteredResults();
  const activeTab = document.querySelector('.ranking-tab.active')?.dataset.tab || 'score';
  renderRankingTable(results, activeTab);
}

function renderRankingTable(results, tab) {
  const tbody = document.getElementById('ranking-table-body');
  const thead = document.getElementById('ranking-table-head');
  if (!tbody || !thead) return;

  let rows = [];

  if (tab === 'score') {
    // Best score per archer
    const bestByArcher = {};
    for (const r of results) {
      if (!r.total_score) continue;
      if (!bestByArcher[r.archer_id] || r.total_score > bestByArcher[r.archer_id].total_score) {
        bestByArcher[r.archer_id] = r;
      }
    }
    rows = Object.values(bestByArcher).sort((a, b) => b.total_score - a.total_score);
    thead.innerHTML = `<tr>
      <th>Pos.</th><th>Arquero</th><th>Club</th><th>División</th><th class="sorted">Mejor Puntaje <span class="sort-arrow">▼</span></th><th>Torneo</th>
    </tr>`;
    tbody.innerHTML = rows.slice(0, 100).map((r, i) => `
      <tr>
        <td class="pos ${rankClass(i + 1)}">${i + 1}</td>
        <td>${r.archer_name}</td>
        <td>${r.club_name}</td>
        <td>${r.division}</td>
        <td class="num text-accent"><strong>${fmt(r.total_score)}</strong></td>
        <td class="text-muted" style="font-size:0.78rem">${fmtDate(getTournamentById(r.tournament_id)?.date)}</td>
      </tr>
    `).join('');

  } else if (tab === 'participaciones') {
    const countByArcher = {};
    for (const r of results) {
      countByArcher[r.archer_id] = countByArcher[r.archer_id] || { archer_id: r.archer_id, archer_name: r.archer_name, club_name: r.club_name, count: 0, wins: 0 };
      countByArcher[r.archer_id].count++;
      if (r.position === 1) countByArcher[r.archer_id].wins++;
    }
    rows = Object.values(countByArcher).sort((a, b) => b.count - a.count);
    thead.innerHTML = `<tr><th>Pos.</th><th>Arquero</th><th>Club</th><th class="sorted">Participaciones <span class="sort-arrow">▼</span></th><th>Victorias</th></tr>`;
    tbody.innerHTML = rows.slice(0, 100).map((r, i) => `
      <tr>
        <td class="pos ${rankClass(i + 1)}">${i + 1}</td>
        <td>${r.archer_name}</td>
        <td>${r.club_name}</td>
        <td class="num text-accent"><strong>${fmt(r.count)}</strong></td>
        <td class="num">${fmt(r.wins)}</td>
      </tr>
    `).join('');

  } else if (tab === 'victorias') {
    const winsByArcher = {};
    for (const r of results) {
      if (!winsByArcher[r.archer_id]) {
        winsByArcher[r.archer_id] = { archer_id: r.archer_id, archer_name: r.archer_name, club_name: r.club_name, wins: 0, podiums: 0 };
      }
      if (r.position === 1) winsByArcher[r.archer_id].wins++;
      if (r.position <= 3) winsByArcher[r.archer_id].podiums++;
    }
    rows = Object.values(winsByArcher).sort((a, b) => b.wins - a.wins || b.podiums - a.podiums);
    thead.innerHTML = `<tr><th>Pos.</th><th>Arquero</th><th>Club</th><th class="sorted">Victorias <span class="sort-arrow">▼</span></th><th>Podios</th></tr>`;
    tbody.innerHTML = rows.slice(0, 100).map((r, i) => `
      <tr>
        <td class="pos ${rankClass(i + 1)}">${i + 1}</td>
        <td>${r.archer_name}</td>
        <td>${r.club_name}</td>
        <td class="num text-green"><strong>${fmt(r.wins)}</strong></td>
        <td class="num">${fmt(r.podiums)}</td>
      </tr>
    `).join('');

  } else if (tab === 'clubes') {
    const clubs = [...(state.clubs?.clubs || [])].sort(
      (a, b) => (Object.values(b.stats.wins_by_division || {}).reduce((s, v) => s + v, 0)) -
                (Object.values(a.stats.wins_by_division || {}).reduce((s, v) => s + v, 0))
    );
    thead.innerHTML = `<tr><th>Pos.</th><th>Club</th><th class="sorted">Victorias <span class="sort-arrow">▼</span></th><th>Participaciones</th><th>Arqueros</th></tr>`;
    tbody.innerHTML = clubs.slice(0, 50).map((c, i) => {
      const wins = Object.values(c.stats.wins_by_division || {}).reduce((a, b) => a + b, 0);
      return `<tr>
        <td class="pos ${rankClass(i + 1)}">${i + 1}</td>
        <td><strong>${c.name}</strong></td>
        <td class="num text-green"><strong>${fmt(wins)}</strong></td>
        <td class="num">${fmt(c.stats.total_archer_entries)}</td>
        <td class="num">${fmt(c.stats.total_members_seen)}</td>
      </tr>`;
    }).join('');
  }
}

// ─── SECTION: PROGRESO ────────────────────────────────────────────────────────
function renderProgreso() {
  const results = getFilteredResults();

  // Annual average
  const byYear = {};
  for (const r of results) {
    const t = getTournamentById(r.tournament_id);
    if (!t || !t.date || !r.total_score) continue;
    const y = t.date.slice(0, 4);
    if (!byYear[y]) byYear[y] = [];
    byYear[y].push(r.total_score);
  }
  const years = Object.keys(byYear).sort();
  const avgByYear = years.map((y) => average(byYear[y]));
  renderLineChart('chart-annual-avg', years, avgByYear, 'Promedio anual de puntaje');

  // Participation by year
  const countByYear = {};
  const toursByYear = {};
  for (const t of (state.tournaments?.tournaments || [])) {
    if (!t.date || t.stub_only) continue;
    const y = t.date.slice(0, 4);
    const { year, discipline } = state.filters;
    if (year !== 'all' && y !== year) continue;
    if (discipline !== 'all' && t.discipline_name !== discipline) continue;
    toursByYear[y] = (toursByYear[y] || 0) + 1;
  }
  for (const r of results) {
    const t = getTournamentById(r.tournament_id);
    if (!t || !t.date) continue;
    const y = t.date.slice(0, 4);
    countByYear[y] = (countByYear[y] || 0) + 1;
  }
  const allYears = [...new Set([...Object.keys(countByYear), ...Object.keys(toursByYear)])].sort();
  renderBarChart('chart-participation-year', allYears, allYears.map((y) => countByYear[y] || 0), 'Participaciones por año', '#7c5cfc');

  // Top scorers this selection
  const bestByArcher = {};
  for (const r of results) {
    if (!r.total_score) continue;
    if (!bestByArcher[r.archer_id] || r.total_score > bestByArcher[r.archer_id].total_score) {
      bestByArcher[r.archer_id] = r;
    }
  }
  const topScorers = Object.values(bestByArcher).sort((a, b) => b.total_score - a.total_score).slice(0, 15);
  renderBarChart('chart-top-scorers', topScorers.map((r) => r.archer_name.split(',')[0]), topScorers.map((r) => r.total_score), 'Top puntajes', '#22c55e', true);
}

// ─── SECTION: EXPORTAR ────────────────────────────────────────────────────────
function renderExportar() {
  const results = getFilteredResults();
  document.getElementById('export-count').textContent = `${results.length} resultados con los filtros actuales`;
}

function exportCSV() {
  const results = getFilteredResults();
  if (!results.length) { alert('No hay resultados para exportar.'); return; }

  const headers = ['Torneo ID', 'Fecha', 'Disciplina', 'Club Torneo', 'Zona', 'Arquero', 'Club Arquero', 'División', 'Género', 'Pos.', 'R1', 'R2', 'Total', '11s', '10s'];
  const rows = results.map((r) => {
    const t = getTournamentById(r.tournament_id) || {};
    return [
      r.tournament_id,
      t.date || '',
      t.discipline_name || '',
      t.club || '',
      t.zone || '',
      r.archer_name,
      r.club_name,
      r.division,
      r.gender,
      r.position,
      r.round1_score,
      r.round2_score,
      r.total_score,
      r.elevens,
      r.tens,
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `arqueros-resultados-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function copyFilterLink() {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(state.filters)) {
    if (v !== 'all') params.set(k, v);
  }
  const url = `${location.origin}${location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.getElementById('btn-copy-link');
    if (btn) { btn.textContent = '✓ Copiado'; setTimeout(() => btn.textContent = '🔗 Copiar link con filtros', 2000); }
  });
}

// ─── CHARTS (Chart.js) ────────────────────────────────────────────────────────
const CHART_DEFAULTS = {
  plugins: { legend: { display: false } },
  scales: {
    x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8892a4', font: { size: 11 } } },
    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8892a4', font: { size: 11 } } },
  },
  responsive: true,
  maintainAspectRatio: true,
};

function destroyChart(id) {
  if (state.charts[id]) { state.charts[id].destroy(); delete state.charts[id]; }
}

function renderLineChart(canvasId, labels, data, label) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  destroyChart(canvasId);
  state.charts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label,
        data,
        borderColor: '#4f8ef7',
        backgroundColor: 'rgba(79,142,247,0.1)',
        tension: 0.3,
        fill: true,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: '#4f8ef7',
      }],
    },
    options: { ...CHART_DEFAULTS, plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } } },
  });
}

function renderBarChart(canvasId, labels, data, label, color = '#4f8ef7', horizontal = false) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  destroyChart(canvasId);
  state.charts[canvasId] = new Chart(ctx, {
    type: horizontal ? 'bar' : 'bar',
    data: {
      labels,
      datasets: [{ label, data, backgroundColor: color + 'cc', borderColor: color, borderWidth: 1 }],
    },
    options: {
      ...CHART_DEFAULTS,
      indexAxis: horizontal ? 'y' : 'x',
      plugins: { legend: { display: false } },
    },
  });
}

function renderDoughnutChart(canvasId, labels, data) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  destroyChart(canvasId);
  const colors = ['#22c55e', '#4f8ef7', '#f59e0b', '#ef4444', '#7c5cfc'];
  state.charts[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors.slice(0, labels.length), borderWidth: 2, borderColor: '#1a1d27' }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#8892a4', font: { size: 11 }, padding: 12 } },
      },
    },
  });
}

// ─── PAGINATION ────────────────────────────────────────────────────────────────
function renderPagination(containerId, current, total, onPage) {
  const container = document.getElementById(containerId);
  if (!container || total <= 1) { if (container) container.innerHTML = ''; return; }

  const pages = [];
  if (total <= 7) {
    for (let i = 1; i <= total; i++) pages.push(i);
  } else {
    pages.push(1);
    if (current > 3) pages.push('...');
    for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
    if (current < total - 2) pages.push('...');
    pages.push(total);
  }

  container.innerHTML = pages.map((p) =>
    p === '...'
      ? `<span class="page-info">…</span>`
      : `<button class="page-btn ${p === current ? 'active' : ''}" data-page="${p}">${p}</button>`
  ).join('') + `<span class="page-info">${current}/${total}</span>`;

  container.querySelectorAll('.page-btn').forEach((btn) => {
    btn.addEventListener('click', () => onPage(parseInt(btn.dataset.page)));
  });
}

// ─── NAVIGATION ──────────────────────────────────────────────────────────────
function renderCurrentSection() {
  const s = state.currentSection;
  if (s === 'resumen') renderResumen();
  else if (s === 'arqueros') renderArqueros();
  else if (s === 'clubes') renderClubes();
  else if (s === 'torneos') renderTorneos();
  else if (s === 'rankings') renderRankings();
  else if (s === 'progreso') renderProgreso();
  else if (s === 'exportar') renderExportar();
}

function navigateTo(section) {
  state.currentSection = section;
  document.querySelectorAll('.section').forEach((el) => el.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach((el) => el.classList.remove('active'));
  const secEl = document.getElementById(`section-${section}`);
  if (secEl) secEl.classList.add('active');
  const navEl = document.querySelector(`.nav-link[data-section="${section}"]`);
  if (navEl) navEl.classList.add('active');
  renderCurrentSection();
}

// ─── URL PARAMS ───────────────────────────────────────────────────────────────
function applyUrlParams() {
  const params = new URLSearchParams(location.search);
  for (const key of Object.keys(state.filters)) {
    if (params.has(key)) state.filters[key] = params.get(key);
  }
  if (params.has('archer')) {
    state.selectedArcherId = params.get('archer');
    navigateTo('arqueros');
  }
  if (params.has('section')) navigateTo(params.get('section'));
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
async function init() {
  await loadAllData();

  document.getElementById('loading-overlay').style.display = 'none';

  populateFilters();
  bindFilters();

  document.querySelectorAll('.nav-link[data-section]').forEach((el) => {
    el.addEventListener('click', () => {
      navigateTo(el.dataset.section);
      // Close sidebar on mobile
      document.querySelector('.sidebar')?.classList.remove('open');
    });
  });

  document.getElementById('menu-toggle')?.addEventListener('click', () => {
    document.querySelector('.sidebar')?.classList.toggle('open');
  });

  document.getElementById('btn-export-csv')?.addEventListener('click', exportCSV);
  document.getElementById('btn-copy-link')?.addEventListener('click', copyFilterLink);

  // Ranking tabs
  document.querySelectorAll('.ranking-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.ranking-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      renderRankings();
    });
  });

  // Update last-updated display
  const lu = state.results?.meta?.last_updated;
  if (lu) {
    const el = document.getElementById('last-updated');
    if (el) el.textContent = `Actualizado: ${new Date(lu).toLocaleDateString('es-AR')}`;
  }

  applyUrlParams();
  navigateTo(state.currentSection);
}

document.addEventListener('DOMContentLoaded', init);
