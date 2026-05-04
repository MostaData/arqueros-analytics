'use strict';

const axios = require('axios');
const axiosRetry = require('axios-retry').default;
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');

// ─── CONFIGURATION ──────────────────────────────────────────────────────────
const BASE_URL = 'https://arquerosonline.com.ar';
const DELAY_MS = 1500;
const ID_RANGE_START = 800;
const ID_RANGE_END_DEFAULT = 1200;
const MAX_CONSECUTIVE_MISSES = 20;
const RAW_DATA_FILE = path.join(__dirname, '..', 'data', 'raw-scrape.json');
const USER_AGENT = 'ArqueroStatsBot/1.0 (github.com/archery-analytics; datos publicos)';

const DISCIPLINE_MAP = { 1: 'Aire Libre', 2: 'Sala', 3: 'Campo', 4: '3D' };

// ─── AXIOS SETUP ────────────────────────────────────────────────────────────
axiosRetry(axios, {
  retries: 3,
  retryDelay: (retryCount) => retryCount * 3000,
  retryCondition: (error) =>
    axiosRetry.isNetworkError(error) ||
    (error.response && error.response.status >= 500),
});

// ─── HELPERS ────────────────────────────────────────────────────────────────
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${ts}] ${msg}`);
}

function warn(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.warn(`[${ts}] WARN: ${msg}`);
}

async function fetchPage(url) {
  try {
    const response = await axios.get(url, {
      timeout: 20000,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'es-AR,es;q=0.9',
      },
    });
    return cheerio.load(response.data);
  } catch (err) {
    if (err.response && err.response.status === 404) return null;
    warn(`fetchPage failed: ${url} — ${err.message}`);
    return null;
  }
}

// ─── PARSERS ────────────────────────────────────────────────────────────────
function slugify(str) {
  if (!str) return 'desconocido';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function parseDate(raw) {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function parseScoreCell($cell) {
  const html = $cell.html() || '';
  const text = $cell.text().replace(/\s+/g, '').trim();
  if (!text || text === '-' || text === '') return { score: 0, targets: 0 };
  const parts = text.split('/');
  return {
    score: parseInt(parts[0]) || 0,
    targets: parts[1] !== undefined ? parseInt(parts[1]) || 0 : 0,
  };
}

function parseCategoryName(raw) {
  if (!raw) return { division: 'Desconocido', gender: 'Desconocido' };
  const parts = raw.trim().split(' ');
  const last = parts[parts.length - 1];
  if (last === 'Masculino' || last === 'Femenino' || last === 'Mixto') {
    return {
      division: parts.slice(0, -1).join(' '),
      gender: last,
    };
  }
  return { division: raw.trim(), gender: 'Desconocido' };
}

// ─── SCRAPE CALENDAR ────────────────────────────────────────────────────────
async function scrapeCalendar() {
  log('Scraping calendar /calendario ...');
  const tournaments = [];
  const seenIds = new Set();

  // Fetch the main calendar page (shows current/recent year by default)
  const $ = await fetchPage(`${BASE_URL}/calendario`);
  if (!$) {
    warn('Could not fetch /calendario');
    return tournaments;
  }

  $('.t-card').each((i, el) => {
    const $el = $(el);
    const resultLink = $el.find('a[href*="/resultado/"]').attr('href');
    if (!resultLink) return;

    const idMatch = resultLink.match(/\/resultado\/(\d+)/);
    if (!idMatch) return;
    const id = parseInt(idMatch[1]);
    if (seenIds.has(id)) return;
    seenIds.add(id);

    const discCode = parseInt($el.attr('data-disc')) || 0;
    const dateRaw = $el.find('.t-fecha').text().trim();
    const clubText = $el.find('.t-club-torneo').attr('title') || $el.find('.t-club-torneo').text().trim();

    const zones = [];
    $el.find('.t-icons-zona abbr').each((j, abbr) => {
      const title = $(abbr).attr('title');
      if (title) zones.push(title);
    });

    tournaments.push({
      id,
      date_raw: dateRaw,
      discipline_code: discCode,
      discipline_name: DISCIPLINE_MAP[discCode] || 'Desconocido',
      zone: zones[0] || '',
      zone_extra: zones[1] || '',
      club: clubText,
      has_results: true,
    });
  });

  log(`Calendar: found ${tournaments.length} tournaments`);
  return tournaments;
}

// ─── SCRAPE RESULT PAGE ──────────────────────────────────────────────────────
async function scrapeResult(id) {
  const url = `${BASE_URL}/resultado/${id}`;
  const $ = await fetchPage(url);
  if (!$) return null;

  // Detect empty result pages (no tables at all)
  const tableCount = $('table.table').length;
  if (tableCount === 0) {
    warn(`Result ${id}: no tables found, skipping`);
    return null;
  }

  // ── Tournament metadata ──
  let disciplineName = '';
  let tournamentType = '';
  let dateRaw = '';
  let club = '';

  // Try the standard .col-md-3 layout
  const colDivs = $('.col-md-3');
  colDivs.each((i, el) => {
    const text = $(el).text();
    if (text.includes('Disciplina')) disciplineName = $(el).find('b').text().trim();
    else if (text.includes('Tipo')) tournamentType = $(el).find('b').text().trim();
    else if (text.includes('Fecha')) dateRaw = $(el).find('b').first().text().trim();
  });

  // Club may appear in a .row without col-md-3
  $('b').each((i, el) => {
    const parentText = $(el).parent().text();
    if (parentText.includes('Club:') && !club) club = $(el).text().trim();
  });

  if (!dateRaw) {
    // Fallback: look for date pattern anywhere
    const bodyText = $('body').text();
    const dm = bodyText.match(/(\d{2}\/\d{2}\/\d{4})/);
    if (dm) dateRaw = dm[1];
  }

  // ── Results by category ──
  const categories = [];

  $('h6').each((i, h6el) => {
    const h6text = $(h6el).text();
    if (!h6text.toLowerCase().includes('categor')) return;

    const categoryRaw = $(h6el).find('b').text().trim() || h6text.replace(/Categor[ií]a\s*:\s*/i, '').trim();
    const { division, gender } = parseCategoryName(categoryRaw);

    // The table immediately follows the h6
    let tableEl = $(h6el).next('table');
    if (!tableEl.length) tableEl = $(h6el).next('.table-responsive-sm').find('table');
    if (!tableEl.length) tableEl = $(h6el).nextAll('table').first();
    if (!tableEl.length) return;

    const results = [];

    tableEl.find('tbody tr').each((j, row) => {
      const cells = $(row).find('td');
      if (cells.length < 3) return;

      const archerName = cells.eq(1).text().trim();
      if (!archerName) return;

      const clubName = cells.eq(2).text().trim();
      const round1 = parseScoreCell(cells.eq(3));
      const round2 = parseScoreCell(cells.eq(4));
      const total = parseScoreCell(cells.eq(5));
      const elevens = parseInt(cells.eq(6).text().trim()) || 0;
      const tens = parseInt(cells.eq(7).text().trim()) || 0;
      const position = parseInt(cells.eq(0).text().trim()) || (j + 1);

      results.push({
        position,
        archer_name: archerName,
        archer_id: slugify(archerName),
        club_name: clubName,
        club_id: slugify(clubName),
        category_raw: categoryRaw,
        division,
        gender,
        round1_score: round1.score,
        round1_targets: round1.targets,
        round2_score: round2.score,
        round2_targets: round2.targets,
        total_score: total.score,
        total_targets: total.targets,
        elevens,
        tens,
      });
    });

    if (results.length > 0) {
      categories.push({ category_raw: categoryRaw, division, gender, results });
    }
  });

  if (categories.length === 0) {
    warn(`Result ${id}: parsed 0 categories`);
    return null;
  }

  return {
    id,
    discipline_name: disciplineName,
    tournament_type: tournamentType,
    date_raw: dateRaw,
    date: parseDate(dateRaw),
    club,
    categories,
    scraped_at: new Date().toISOString(),
  };
}

// ─── LOAD EXISTING RAW DATA ──────────────────────────────────────────────────
async function loadExistingRawData() {
  try {
    const content = await fs.readFile(RAW_DATA_FILE, 'utf8');
    const data = JSON.parse(content);
    const scrapedIds = new Set(Object.keys(data.tournaments || {}).map(Number));
    return { scrapedIds, data };
  } catch {
    return { scrapedIds: new Set(), data: { calendar: [], tournaments: {} } };
  }
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  const forceFullRescrape = process.env.FORCE_FULL_RESCRAPE === 'true';
  if (forceFullRescrape) log('Force full rescrape mode enabled');

  // Ensure data directory exists
  await fs.mkdir(path.dirname(RAW_DATA_FILE), { recursive: true });

  // Load existing data
  const { scrapedIds, data: existingData } = await loadExistingRawData();
  log(`Existing scraped IDs: ${scrapedIds.size}`);

  // Stage 1: scrape the calendar for current metadata
  const calendarTournaments = await scrapeCalendar();
  await delay(DELAY_MS);

  // Stage 2: collect all known IDs
  const calendarIds = new Set(calendarTournaments.map((t) => t.id));
  const allKnownIds = new Set([...calendarIds, ...scrapedIds]);

  // Dynamic upper bound: max known ID + 100, or the default
  const maxKnownId = allKnownIds.size > 0 ? Math.max(...allKnownIds) : 0;
  const ID_RANGE_END = Math.max(ID_RANGE_END_DEFAULT, maxKnownId + 100);

  log(`Scanning ID range ${ID_RANGE_START}–${ID_RANGE_END} for new tournaments...`);

  // Stage 3: sequential scan for missing IDs
  const newIds = [];
  let consecutiveMisses = 0;

  for (let id = ID_RANGE_START; id <= ID_RANGE_END; id++) {
    if (!forceFullRescrape && allKnownIds.has(id)) {
      consecutiveMisses = 0;
      continue;
    }

    await delay(DELAY_MS);
    const $ = await fetchPage(`${BASE_URL}/resultado/${id}`);

    if ($ === null) {
      consecutiveMisses++;
      if (consecutiveMisses >= MAX_CONSECUTIVE_MISSES) {
        log(`Stopping scan after ${MAX_CONSECUTIVE_MISSES} consecutive misses at ID ${id}`);
        break;
      }
    } else {
      consecutiveMisses = 0;
      if (!allKnownIds.has(id)) newIds.push(id);
      allKnownIds.add(id);
    }
  }

  log(`Discovered ${newIds.length} new tournament IDs`);

  // Stage 4: scrape new results
  const tournaments = forceFullRescrape
    ? {}
    : { ...(existingData.tournaments || {}) };

  const toScrape = forceFullRescrape
    ? [...allKnownIds].sort((a, b) => a - b)
    : newIds;

  log(`Scraping ${toScrape.length} tournament result pages...`);

  for (let i = 0; i < toScrape.length; i++) {
    const id = toScrape[i];
    log(`[${i + 1}/${toScrape.length}] Scraping result ${id}...`);
    await delay(DELAY_MS);
    const result = await scrapeResult(id);
    if (result) {
      tournaments[id] = result;
      log(`  → ${result.discipline_name} ${result.date || result.date_raw} — ${result.categories.length} categories, ${result.categories.reduce((s, c) => s + c.results.length, 0)} archers`);
    }
  }

  // Merge calendar metadata into tournaments
  for (const stub of calendarTournaments) {
    if (!tournaments[stub.id]) {
      // Tournament in calendar but no results yet — store stub only
      tournaments[stub.id] = {
        id: stub.id,
        discipline_name: stub.discipline_name,
        tournament_type: '',
        date_raw: stub.date_raw,
        date: parseDate(stub.date_raw),
        club: stub.club,
        zone: stub.zone,
        zone_extra: stub.zone_extra,
        categories: [],
        scraped_at: new Date().toISOString(),
        stub_only: true,
      };
    } else {
      // Enrich with calendar metadata if missing
      if (!tournaments[stub.id].zone) tournaments[stub.id].zone = stub.zone;
      if (!tournaments[stub.id].zone_extra) tournaments[stub.id].zone_extra = stub.zone_extra;
    }
  }

  // Stage 5: save raw data
  const output = {
    meta: {
      scraped_at: new Date().toISOString(),
      total_tournaments: Object.keys(tournaments).length,
      id_range: { min: ID_RANGE_START, max: ID_RANGE_END },
    },
    calendar: calendarTournaments,
    tournaments,
  };

  await fs.writeFile(RAW_DATA_FILE, JSON.stringify(output, null, 2), 'utf8');
  log(`Scrape complete. ${Object.keys(tournaments).length} tournaments saved to raw-scrape.json`);
  log('Run: node build-data.js');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
