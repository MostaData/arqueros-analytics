'use strict';

const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const RAW_FILE = path.join(DATA_DIR, 'raw-scrape.json');

function log(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${ts}] ${msg}`);
}

function now() {
  return new Date().toISOString();
}

// ─── UTILITIES ───────────────────────────────────────────────────────────────
function getMostFrequent(arr) {
  if (!arr || arr.length === 0) return null;
  const freq = {};
  for (const v of arr) {
    if (v) freq[v] = (freq[v] || 0) + 1;
  }
  return Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

function average(arr) {
  const nums = arr.filter((n) => n > 0);
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

// ─── ARCHER STATS ────────────────────────────────────────────────────────────
function computeArcherStats(rawResults) {
  const byDiscipline = {};
  for (const r of rawResults) {
    if (!byDiscipline[r.discipline]) byDiscipline[r.discipline] = [];
    byDiscipline[r.discipline].push(r);
  }

  const disciplines = {};
  let overallWins = 0;
  let podiums = 0;

  for (const [disc, entries] of Object.entries(byDiscipline)) {
    const scores = entries.map((e) => e.total_score).filter((s) => s > 0);
    const wins = entries.filter((e) => e.position === 1).length;
    const pod = entries.filter((e) => e.position <= 3).length;
    overallWins += wins;
    podiums += pod;
    disciplines[disc] = {
      count: entries.length,
      avg_total: average(scores),
      best_total: scores.length ? Math.max(...scores) : null,
      worst_total: scores.length ? Math.min(...scores) : null,
      wins,
      podiums: pod,
    };
  }

  const positions = rawResults.map((r) => r.position).filter((p) => p !== null && p > 0);
  const dates = rawResults.map((r) => r.date).filter(Boolean).sort();

  return {
    total_tournaments: new Set(rawResults.map((r) => r.tournament_id)).size,
    total_results: rawResults.length,
    disciplines,
    overall_wins: overallWins,
    podiums,
    avg_position: average(positions),
    last_competed: dates[dates.length - 1] || null,
    career_start: dates[0] || null,
  };
}

function buildClubsHistory(rawResults) {
  const clubDates = {};
  for (const r of rawResults) {
    if (!r.club_id) continue;
    if (!clubDates[r.club_id]) {
      clubDates[r.club_id] = { club_id: r.club_id, club_name: r.club_name, dates: [] };
    }
    if (r.date) clubDates[r.club_id].dates.push(r.date);
  }
  return Object.values(clubDates).map((c) => {
    const sorted = c.dates.sort();
    return {
      club_id: c.club_id,
      club_name: c.club_name,
      first_seen: sorted[0] || null,
      last_seen: sorted[sorted.length - 1] || null,
    };
  });
}

// ─── CLUB STATS ──────────────────────────────────────────────────────────────
function computeClubStats(rawEntries, tournamentMap) {
  const archerSet = new Set();
  const tournamentSet = new Set();
  const winsByDivision = {};
  const podiumsByDivision = {};
  const disciplineSet = new Set();
  let lastActivity = null;

  for (const e of rawEntries) {
    archerSet.add(e.archer_id);
    tournamentSet.add(e.tournament_id);
    if (e.division) {
      if (!winsByDivision[e.division]) winsByDivision[e.division] = 0;
      if (!podiumsByDivision[e.division]) podiumsByDivision[e.division] = 0;
      if (e.position === 1) winsByDivision[e.division]++;
      if (e.position <= 3) podiumsByDivision[e.division]++;
    }
    const t = tournamentMap[e.tournament_id];
    if (t && t.discipline_name) disciplineSet.add(t.discipline_name);
    if (t && t.date && (!lastActivity || t.date > lastActivity)) lastActivity = t.date;
  }

  return {
    total_members_seen: archerSet.size,
    tournaments_participated: tournamentSet.size,
    total_archer_entries: rawEntries.length,
    wins_by_division: winsByDivision,
    podiums_by_division: podiumsByDivision,
    disciplines_participated: [...disciplineSet],
    last_activity: lastActivity,
  };
}

// ─── MAIN BUILD ──────────────────────────────────────────────────────────────
async function main() {
  log('Reading raw-scrape.json...');

  let raw;
  try {
    const content = await fs.readFile(RAW_FILE, 'utf8');
    raw = JSON.parse(content);
  } catch (err) {
    console.error('Cannot read raw-scrape.json:', err.message);
    console.error('Run scrape.js first: node scrape.js');
    process.exit(1);
  }

  const { tournaments: rawTournaments = {}, calendar: rawCalendar = [] } = raw;

  log(`Processing ${Object.keys(rawTournaments).length} tournaments...`);

  const allResults = [];
  const tournamentMap = {};   // id -> tournament summary
  const archerRaw = {};       // archer_id -> { meta, raw_results[] }
  const clubRaw = {};         // club_id -> { meta, raw_entries[] }

  // ── PASS 1: Flatten all data ─────────────────────────────────────────────
  for (const [idStr, t] of Object.entries(rawTournaments)) {
    const tid = parseInt(idStr);

    // Find calendar stub for extra metadata
    const calStub = rawCalendar.find((c) => c.id === tid) || {};

    tournamentMap[tid] = {
      id: tid,
      date: t.date || null,
      date_raw: t.date_raw || '',
      discipline_name: t.discipline_name || calStub.discipline_name || '',
      discipline_code: calStub.discipline_code || 0,
      tournament_type: t.tournament_type || calStub.zone_extra || '',
      zone: t.zone || calStub.zone || '',
      club: t.club || calStub.club || '',
      categories: (t.categories || []).map((c) => c.category_raw),
      total_archers: (t.categories || []).reduce((s, c) => s + (c.results || []).length, 0),
      scraped_at: t.scraped_at || null,
      stub_only: t.stub_only || false,
    };

    if (t.stub_only || !t.categories) continue;

    for (const cat of t.categories) {
      for (const r of cat.results || []) {
        const disciplineName = t.discipline_name || calStub.discipline_name || '';
        const isPartial =
          r.round2_score === 0 &&
          r.round2_targets === 0 &&
          (disciplineName === 'Campo' || disciplineName === '3D');

        const resultRecord = {
          tournament_id: tid,
          archer_id: r.archer_id,
          archer_name: r.archer_name,
          club_id: r.club_id,
          club_name: r.club_name,
          category_raw: r.category_raw,
          division: r.division,
          gender: r.gender,
          position: r.position,
          round1_score: r.round1_score,
          round1_targets: r.round1_targets,
          round2_score: r.round2_score,
          round2_targets: r.round2_targets,
          total_score: r.total_score,
          total_targets: r.total_targets,
          elevens: r.elevens,
          tens: r.tens,
          is_partial: isPartial,
        };

        allResults.push(resultRecord);

        // ── Accumulate archer data ──
        if (!archerRaw[r.archer_id]) {
          archerRaw[r.archer_id] = {
            id: r.archer_id,
            name: r.archer_name,
            raw_results: [],
          };
        }
        archerRaw[r.archer_id].raw_results.push({
          tournament_id: tid,
          date: t.date,
          discipline: disciplineName,
          division: r.division,
          gender: r.gender,
          position: r.position,
          total_score: r.total_score,
          club_id: r.club_id,
          club_name: r.club_name,
        });

        // ── Accumulate club data ──
        if (!clubRaw[r.club_id]) {
          clubRaw[r.club_id] = {
            id: r.club_id,
            name: r.club_name,
            raw_entries: [],
          };
        }
        clubRaw[r.club_id].raw_entries.push({
          tournament_id: tid,
          archer_id: r.archer_id,
          division: r.division,
          gender: r.gender,
          position: r.position,
        });
      }
    }
  }

  log(`Flattened ${allResults.length} individual results`);

  // ── PASS 2: Compute archer stats ─────────────────────────────────────────
  log('Computing archer stats...');
  const archersOut = [];
  for (const archer of Object.values(archerRaw)) {
    const rawResults = archer.raw_results;
    const stats = computeArcherStats(rawResults);
    const clubsHistory = buildClubsHistory(rawResults);

    // Display name: "Rodriguez, Gustavo Hector" → "Gustavo Hector Rodriguez"
    let displayName = archer.name;
    const commaParts = archer.name.split(',');
    if (commaParts.length === 2) {
      displayName = `${commaParts[1].trim()} ${commaParts[0].trim()}`;
    }

    archersOut.push({
      id: archer.id,
      name: archer.name,
      name_normalized: archer.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, ''),
      display_name: displayName,
      clubs_history: clubsHistory,
      primary_division: getMostFrequent(rawResults.map((r) => r.division)),
      primary_gender: getMostFrequent(rawResults.map((r) => r.gender)),
      stats,
    });
  }
  archersOut.sort((a, b) => b.stats.total_results - a.stats.total_results);

  // ── PASS 3: Compute club stats ────────────────────────────────────────────
  log('Computing club stats...');
  const clubsOut = [];

  // Identify which clubs hosted tournaments
  const hostedByClub = {};
  for (const t of Object.values(tournamentMap)) {
    if (!t.club) continue;
    const clubSlug = t.club
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s-]/g, ' ')
      .trim()
      .replace(/\s+/g, '-');
    hostedByClub[clubSlug] = (hostedByClub[clubSlug] || 0) + 1;
  }

  for (const club of Object.values(clubRaw)) {
    const stats = computeClubStats(club.raw_entries, tournamentMap);
    stats.tournaments_hosted = hostedByClub[club.id] || 0;

    clubsOut.push({
      id: club.id,
      name: club.name,
      abbreviation: club.name,
      stats,
    });
  }
  clubsOut.sort((a, b) => b.stats.total_archer_entries - a.stats.total_archer_entries);

  // ── PASS 4: Build calendar.json ──────────────────────────────────────────
  log('Building calendar.json...');
  const calendarOut = Object.values(tournamentMap)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  // ── WRITE ALL FILES ──────────────────────────────────────────────────────
  const meta = { last_updated: now() };

  await fs.writeFile(
    path.join(DATA_DIR, 'calendar.json'),
    JSON.stringify({ meta: { ...meta, total_tournaments: calendarOut.length }, tournaments: calendarOut }, null, 2),
    'utf8'
  );
  log(`calendar.json → ${calendarOut.length} tournaments`);

  await fs.writeFile(
    path.join(DATA_DIR, 'tournaments.json'),
    JSON.stringify({ meta: { ...meta, total_tournaments: calendarOut.length }, tournaments: calendarOut }, null, 2),
    'utf8'
  );
  log(`tournaments.json → ${calendarOut.length} entries`);

  await fs.writeFile(
    path.join(DATA_DIR, 'all-results.json'),
    JSON.stringify({ meta: { ...meta, total_results: allResults.length }, results: allResults }, null, 2),
    'utf8'
  );
  log(`all-results.json → ${allResults.length} results`);

  await fs.writeFile(
    path.join(DATA_DIR, 'archers-index.json'),
    JSON.stringify({ meta: { ...meta, total_archers: archersOut.length }, archers: archersOut }, null, 2),
    'utf8'
  );
  log(`archers-index.json → ${archersOut.length} archers`);

  await fs.writeFile(
    path.join(DATA_DIR, 'clubs-index.json'),
    JSON.stringify({ meta: { ...meta, total_clubs: clubsOut.length }, clubs: clubsOut }, null, 2),
    'utf8'
  );
  log(`clubs-index.json → ${clubsOut.length} clubs`);

  log('Build complete! All JSON files updated.');
  log('');
  log('Summary:');
  log(`  Tournaments: ${calendarOut.length}`);
  log(`  Results:     ${allResults.length}`);
  log(`  Archers:     ${archersOut.length}`);
  log(`  Clubs:       ${clubsOut.length}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
