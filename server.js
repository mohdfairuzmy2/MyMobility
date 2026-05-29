/**
 * MyMobility — local API for live Malaysian transit data
 * Sources: api.data.gov.my (GTFS), Google News RSS, Meta Threads API (optional)
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const AdmZip = require('adm-zip');
const { transit_realtime } = require('gtfs-realtime-bindings');
const RssParser = require('rss-parser');

// Load .env without extra dependency (optional)
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8')
    .split('\n')
    .forEach((line) => {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
    });
}

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_GOV = 'https://api.data.gov.my';
const THREADS_GRAPH = 'https://graph.threads.net/v1.0';
const rss = new RssParser({ timeout: 15000 });

const cache = { gtfs: {}, vehicles: {}, alerts: null };
const CACHE_MS = { gtfs: 6 * 60 * 60 * 1000, vehicles: 25 * 1000, alerts: 5 * 60 * 1000 };
const THREADS_KEYWORDS = ['Rapid KL gangguan', 'RapidKL delay', 'MRT gangguan', 'LRT gangguan'];
const THREADS_PROFILES = ['myrapidkl', 'rapidkl'];

// CORS: benarkan frontend (cth GitHub Pages) panggil API ini dari origin lain.
// Data awam sahaja, tiada kuki/auth — selamat untuk dibuka.
app.use('/api', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(
  express.static(path.join(__dirname), {
    setHeaders(res, filePath) {
      if (filePath.endsWith('.webmanifest')) {
        res.setHeader('Content-Type', 'application/manifest+json');
      }
    },
  })
);

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'MyMobility-Prototype/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchBuffer(res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).href)
            .then(resolve)
            .catch(reject);
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          else resolve(Buffer.concat(chunks));
        });
      })
      .on('error', reject);
  });
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).filter(Boolean).map((line) => {
    const vals = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = vals[i] ?? '';
    });
    return row;
  });
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQ = !inQ;
    else if (ch === ',' && !inQ) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

async function loadGtfs(category) {
  const key = category;
  const hit = cache.gtfs[key];
  if (hit && Date.now() - hit.at < CACHE_MS.gtfs) return hit.data;

  const url = `${DATA_GOV}/gtfs-static/prasarana/?category=${category}`;
  const buf = await fetchBuffer(url);
  const zip = new AdmZip(buf);
  const read = (name) => {
    const e = zip.getEntry(name);
    return e ? zip.readAsText(e, 'utf8') : '';
  };

  const data = {
    category,
    routes: parseCsv(read('routes.txt')),
    stops: parseCsv(read('stops.txt')),
    trips: parseCsv(read('trips.txt')),
    stop_times: parseCsv(read('stop_times.txt')),
    frequencies: parseCsv(read('frequencies.txt')),
    fetchedAt: new Date().toISOString(),
  };

  cache.gtfs[key] = { at: Date.now(), data };
  return data;
}

async function loadVehicles(category) {
  const key = category;
  const hit = cache.vehicles[key];
  if (hit && Date.now() - hit.at < CACHE_MS.vehicles) return hit.data;

  const url = `${DATA_GOV}/gtfs-realtime/vehicle-position/prasarana/?category=${category}`;
  const buf = await fetchBuffer(url);
  const feed = transit_realtime.FeedMessage.decode(buf);
  const vehicles = (feed.entity || [])
    .filter((e) => e.vehicle && e.vehicle.position)
    .map((e) => ({
      id: e.id,
      lat: e.vehicle.position.latitude,
      lon: e.vehicle.position.longitude,
      bearing: e.vehicle.position.bearing,
      routeId: e.vehicle.trip?.route_id || null,
      tripId: e.vehicle.trip?.trip_id || null,
      timestamp: e.vehicle.timestamp ? Number(e.vehicle.timestamp) : null,
    }));

  const data = { category, count: vehicles.length, vehicles, fetchedAt: new Date().toISOString() };
  cache.vehicles[key] = { at: Date.now(), data };
  return data;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** MyRapid-style rail cashless fare tiers (distance km) — approximate */
function fareFromDistanceKm(km) {
  if (km <= 4.9) return { cashless: 0.97, cash: 1.2, token: 1.7 };
  if (km <= 9.9) return { cashless: 1.21, cash: 1.5, token: 2.0 };
  if (km <= 14.9) return { cashless: 1.55, cash: 1.9, token: 2.5 };
  if (km <= 19.9) return { cashless: 1.85, cash: 2.2, token: 2.9 };
  if (km <= 24.9) return { cashless: 2.1, cash: 2.5, token: 3.2 };
  if (km <= 29.9) return { cashless: 2.4, cash: 2.8, token: 3.5 };
  return { cashless: 2.8, cash: 3.2, token: 4.0 };
}

function titleCase(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function nearestStops(stops, lat, lon, limit = 5) {
  return stops
    .map((s) => ({
      ...s,
      lat: parseFloat(s.stop_lat),
      lon: parseFloat(s.stop_lon),
      dist: haversineKm(lat, lon, parseFloat(s.stop_lat), parseFloat(s.stop_lon)),
    }))
    .filter((s) => !Number.isNaN(s.lat))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, limit);
}

const HUBS = [
  { id: 'KJ15', name: 'KL Sentral', lat: 3.1342, lon: 101.6868 },
  { id: 'AG7', name: 'Masjid Jamek', lat: 3.1493, lon: 101.6964 },
  { id: 'PY17', name: 'Titiwangsa', lat: 3.1741, lon: 101.6958 },
  { id: 'KJ10', name: 'KLCC', lat: 3.1589, lon: 101.7133 },
];

async function geocodeNominatim(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=my&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'MyMobility-Prototype/1.0 (educational)' } });
  if (!res.ok) throw new Error('Geocode failed');
  const arr = await res.json();
  if (!arr.length) return null;
  return { lat: parseFloat(arr[0].lat), lon: parseFloat(arr[0].lon), label: arr[0].display_name };
}

function planJourneyOptions(fromStop, toStop) {
  const dist = haversineKm(fromStop.lat, fromStop.lon, toStop.lat, toStop.lon);
  const options = [];

  if (fromStop.route_id && fromStop.route_id === toStop.route_id) {
    const mins = Math.max(12, Math.round(dist * 3.5 + 8));
    options.push({
      type: 'direct',
      label: 'direct',
      legs: [
        {
          mode: fromStop.category || 'Transit',
          name: fromStop.route_id,
          from: titleCase(fromStop.stop_name),
          to: titleCase(toStop.stop_name),
        },
      ],
      durationMin: mins,
      fare: fareFromDistanceKm(dist),
      transfers: 0,
      hub: null,
    });
  }

  for (const hub of HUBS) {
    const d1 = haversineKm(fromStop.lat, fromStop.lon, hub.lat, hub.lon);
    const d2 = haversineKm(hub.lat, hub.lon, toStop.lat, toStop.lon);
    const total = d1 + d2;
    const dur = Math.round(total * 3.5 + 18);
    options.push({
      type: 'transfer',
      label: `via-${hub.id}`,
      legs: [
        { mode: 'Transit', name: fromStop.category || 'Rail', from: titleCase(fromStop.stop_name), to: hub.name },
        { mode: 'Walk', name: '5 min', from: hub.name, to: hub.name },
        { mode: 'Transit', name: toStop.category || 'Rail', from: hub.name, to: titleCase(toStop.stop_name) },
      ],
      durationMin: dur,
      fare: fareFromDistanceKm(total * 0.85),
      transfers: 1,
      hub: hub.name,
      hubId: hub.id,
    });
  }

  options.sort((a, b) => a.durationMin - b.durationMin);
  const seen = new Set();
  const unique = [];
  for (const o of options) {
    const key = o.type === 'direct' ? 'direct' : o.hub;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(o);
    if (unique.length >= 3) break;
  }
  return unique;
}

function nearestFeederBuses(lat, lon, vehicles, limit = 5) {
  return (vehicles || [])
    .map((v) => ({
      id: v.id,
      lat: v.lat,
      lon: v.lon,
      routeId: v.routeId,
      bearing: v.bearing,
      distKm: haversineKm(lat, lon, v.lat, v.lon),
      distM: Math.round(haversineKm(lat, lon, v.lat, v.lon) * 1000),
    }))
    .filter((v) => !Number.isNaN(v.distKm))
    .sort((a, b) => a.distKm - b.distKm)
    .slice(0, limit);
}

async function getRailStops() {
  const gtfs = await loadGtfs('rapid-rail-kl');
  return gtfs.stops.filter((s) => s.status !== 'invalid');
}

function mapStopRow(s, extra = {}) {
  return {
    stop_id: s.stop_id,
    stop_name: s.stop_name,
    route_id: s.route_id,
    category: s.category,
    lat: parseFloat(s.stop_lat),
    lon: parseFloat(s.stop_lon),
    ...extra,
  };
}

async function fetchJson(url, headers = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'MyMobility-Prototype/1.0', ...headers },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(body.slice(0, 200) || res.statusText);
  return JSON.parse(body);
}

function normalizeAlert(item) {
  return {
    title: item.title || '—',
    link: item.link || '#',
    pubDate: item.pubDate || new Date().toISOString(),
    source: item.source || 'Unknown',
    snippet: item.snippet || '',
    platform: item.platform || 'news',
  };
}

function dedupeAlerts(items) {
  const seen = new Set();
  return items.filter((it) => {
    const key = (it.title || '').toLowerCase().replace(/\s+/g, ' ').slice(0, 80);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function loadGoogleNewsAlerts(q) {
  const feed = await rss.parseURL(
    `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ms-MY&gl=MY&ceid=MY:ms`
  );
  return (feed.items || []).map((it) =>
    normalizeAlert({
      title: it.title,
      link: it.link,
      pubDate: it.pubDate,
      source: it.creator || (it.source && it.source.title) || 'Google News',
      snippet: (it.contentSnippet || it.content || '').slice(0, 280),
      platform: 'news',
    })
  );
}

async function loadThreadsAlerts() {
  const token = process.env.THREADS_ACCESS_TOKEN;
  if (!token) {
    return { items: [], configured: false, error: 'THREADS_ACCESS_TOKEN not set' };
  }

  const items = [];
  const auth = { Authorization: `Bearer ${token}` };

  for (const q of THREADS_KEYWORDS) {
    try {
      const url = new URL(`${THREADS_GRAPH}/keyword_search`);
      url.searchParams.set('q', q);
      url.searchParams.set('search_type', 'RECENT');
      url.searchParams.set('fields', 'id,text,timestamp,permalink,username');
      url.searchParams.set('limit', '8');
      const data = await fetchJson(url, auth);
      for (const row of data.data || []) {
        const text = row.text || '';
        if (!text.trim()) continue;
        items.push(
          normalizeAlert({
            title: text.length > 180 ? `${text.slice(0, 177)}…` : text,
            link: row.permalink || `https://www.threads.net/@${row.username || 'threads'}`,
            pubDate: row.timestamp ? new Date(Number(row.timestamp) * 1000).toISOString() : new Date().toISOString(),
            source: `Threads @${row.username || 'pengguna'}`,
            snippet: text,
            platform: 'threads',
          })
        );
      }
    } catch (e) {
      console.warn('[Threads] keyword_search:', q, e.message);
    }
  }

  for (const username of THREADS_PROFILES) {
    try {
      const lookup = await fetchJson(
        `${THREADS_GRAPH}/profile_lookup?username=${encodeURIComponent(username)}`,
        auth
      );
      const userId = lookup.id;
      if (!userId) continue;
      const posts = await fetchJson(
        `${THREADS_GRAPH}/${userId}/threads?fields=id,text,timestamp,permalink,username&limit=8`,
        auth
      );
      for (const row of posts.data || []) {
        const text = row.text || '';
        if (!text.trim()) continue;
        items.push(
          normalizeAlert({
            title: text.length > 180 ? `${text.slice(0, 177)}…` : text,
            link: row.permalink || `https://www.threads.net/@${username}`,
            pubDate: row.timestamp ? new Date(Number(row.timestamp) * 1000).toISOString() : new Date().toISOString(),
            source: `Threads @${username}`,
            snippet: text,
            platform: 'threads',
          })
        );
      }
    } catch (e) {
      console.warn('[Threads] profile:', username, e.message);
    }
  }

  return { items: dedupeAlerts(items), configured: true };
}

async function loadAllAlerts(opts = {}) {
  const q = opts.q || 'Rapid KL (gangguan OR disruption OR delay OR lambat)';
  const want = (opts.source || 'all').toLowerCase();
  const parts = [];

  if (want === 'all' || want === 'news') {
    try {
      parts.push(...(await loadGoogleNewsAlerts(q)));
    } catch (e) {
      console.warn('[News]', e.message);
    }
  }

  let threadsMeta = { configured: false };
  if (want === 'all' || want === 'threads') {
    threadsMeta = await loadThreadsAlerts();
    parts.push(...threadsMeta.items);
  }

  const items = dedupeAlerts(parts)
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
    .slice(0, 20);

  return {
    items,
    fetchedAt: new Date().toISOString(),
    query: q,
    threads: {
      configured: threadsMeta.configured,
      count: items.filter((i) => i.platform === 'threads').length,
      hint: threadsMeta.configured
        ? null
        : 'Sambungan Threads belum diaktifkan',
    },
  };
}

// ——— API routes ———

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    sources: ['data.gov.my', 'Google News RSS', 'OpenStreetMap Nominatim'],
    threads: !!process.env.THREADS_ACCESS_TOKEN,
    endpoints: [
      '/api/stops/search',
      '/api/stops/nearby',
      '/api/journey',
      '/api/fare',
      '/api/dashboard',
    ],
  });
});

let _ktmCache = null;
function loadKtmFares() {
  if (_ktmCache) return _ktmCache;
  const p = path.join(__dirname, 'data', 'ktm_fares.json');
  _ktmCache = JSON.parse(fs.readFileSync(p, 'utf8'));
  return _ktmCache;
}

app.get('/api/ktm/fares', (_req, res) => {
  try {
    res.json(loadKtmFares());
  } catch (e) {
    res.status(500).json({ error: 'KTM fare data unavailable: ' + e.message });
  }
});

app.get('/api/gtfs/:category', async (req, res) => {
  try {
    const data = await loadGtfs(req.params.category);
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get('/api/vehicles/:category', async (req, res) => {
  try {
    const data = await loadVehicles(req.params.category);
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get('/api/alerts', async (req, res) => {
  try {
    const cacheKey = `${req.query.source || 'all'}:${req.query.q || ''}`;
    if (cache.alerts && cache.alerts.key === cacheKey && Date.now() - cache.alerts.at < CACHE_MS.alerts) {
      return res.json(cache.alerts.data);
    }
    const data = await loadAllAlerts({ q: req.query.q, source: req.query.source });
    cache.alerts = { at: Date.now(), key: cacheKey, data };
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get('/api/stops/search', async (req, res) => {
  try {
    const q = String(req.query.q || '')
      .trim()
      .toLowerCase();
    if (q.length < 2) return res.status(400).json({ error: 'q must be at least 2 characters' });
    const limit = Math.min(25, Math.max(1, parseInt(req.query.limit, 10) || 12));
    const stops = await getRailStops();
    const items = stops
      .filter(
        (s) =>
          (s.stop_name || '').toLowerCase().includes(q) ||
          (s.stop_id || '').toLowerCase().includes(q)
      )
      .slice(0, limit)
      .map((s) => mapStopRow(s));
    res.json({ q, count: items.length, items, fetchedAt: new Date().toISOString() });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get('/api/stops/nearby', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return res.status(400).json({ error: 'lat and lon required' });
    }
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 8));
    const stops = await getRailStops();
    const items = nearestStops(stops, lat, lon, limit).map((s) =>
      mapStopRow(s, { distKm: Math.round(s.dist * 100) / 100, distM: Math.round(s.dist * 1000) })
    );
    res.json({ lat, lon, count: items.length, items, fetchedAt: new Date().toISOString() });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get('/api/geocode', async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.status(400).json({ error: 'q required' });
    const loc = await geocodeNominatim(q);
    if (!loc) return res.status(404).json({ error: 'Not found' });
    res.json(loc);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get('/api/fare', async (req, res) => {
  try {
    const { from, to, category = 'rapid-rail-kl' } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to stop_id required' });
    const gtfs = await loadGtfs(category);
    const a = gtfs.stops.find((s) => s.stop_id === from);
    const b = gtfs.stops.find((s) => s.stop_id === to);
    if (!a || !b) return res.status(404).json({ error: 'Stop not found' });
    const km = haversineKm(+a.stop_lat, +a.stop_lon, +b.stop_lat, +b.stop_lon);
    const fare = fareFromDistanceKm(km);
    const stopsBetween = Math.max(1, Math.round(km * 1.2));
    res.json({
      from: { id: a.stop_id, name: a.stop_name },
      to: { id: b.stop_id, name: b.stop_name },
      distanceKm: Math.round(km * 10) / 10,
      stopsBetween,
      durationMin: Math.max(5, Math.round(km * 3.5 + 5)),
      fare,
      source: 'Jarak GTFS (data.gov.my) · anggaran kadar MyRapid',
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get('/api/journey', async (req, res) => {
  try {
    const { from, to, from_lat, from_lon, to_lat, to_lon, from_stop, to_stop } = req.query;
    const stops = await getRailStops();

    let fromLoc;
    let toLoc;
    let nearFrom;
    let nearTo;

    if (from_stop && to_stop) {
      nearFrom = stops.find((s) => s.stop_id === from_stop);
      nearTo = stops.find((s) => s.stop_id === to_stop);
      if (!nearFrom || !nearTo) return res.status(404).json({ error: 'Stop not found' });
      fromLoc = {
        lat: parseFloat(nearFrom.stop_lat),
        lon: parseFloat(nearFrom.stop_lon),
        label: nearFrom.stop_name,
      };
      toLoc = {
        lat: parseFloat(nearTo.stop_lat),
        lon: parseFloat(nearTo.stop_lon),
        label: nearTo.stop_name,
      };
      nearFrom = { ...nearFrom, lat: fromLoc.lat, lon: fromLoc.lon, dist: 0 };
      nearTo = { ...nearTo, lat: toLoc.lat, lon: toLoc.lon, dist: 0 };
    } else if (from && to) {
      fromLoc = await geocodeNominatim(from);
      toLoc = await geocodeNominatim(to);
      if (!fromLoc || !toLoc) return res.status(404).json({ error: 'Could not geocode' });
      nearFrom = nearestStops(stops, fromLoc.lat, fromLoc.lon, 1)[0];
      nearTo = nearestStops(stops, toLoc.lat, toLoc.lon, 1)[0];
    } else if (from_lat && from_lon && to_lat && to_lon) {
      fromLoc = { lat: +from_lat, lon: +from_lon, label: 'Origin' };
      toLoc = { lat: +to_lat, lon: +to_lon, label: 'Destination' };
      nearFrom = nearestStops(stops, fromLoc.lat, fromLoc.lon, 1)[0];
      nearTo = nearestStops(stops, toLoc.lat, toLoc.lon, 1)[0];
    } else {
      return res.status(400).json({ error: 'from/to names, stop ids, or coordinates required' });
    }

    if (!nearFrom || !nearTo) return res.status(404).json({ error: 'No nearby stations' });

    const routes = planJourneyOptions(nearFrom, nearTo);
    const feederData = await loadVehicles('rapid-bus-mrtfeeder').catch(() => ({
      count: 0,
      vehicles: [],
    }));
    const vehicles = feederData.vehicles || [];
    const originLat = parseFloat(nearFrom.stop_lat ?? nearFrom.lat);
    const originLon = parseFloat(nearFrom.stop_lon ?? nearFrom.lon);
    const destLat = parseFloat(nearTo.stop_lat ?? nearTo.lat);
    const destLon = parseFloat(nearTo.stop_lon ?? nearTo.lon);

    res.json({
      from: {
        query: from,
        geocoded: fromLoc,
        station: {
          id: nearFrom.stop_id,
          name: nearFrom.stop_name,
          walkKm: Math.round((nearFrom.dist || 0) * 10) / 10,
        },
      },
      to: {
        query: to,
        geocoded: toLoc,
        station: {
          id: nearTo.stop_id,
          name: nearTo.stop_name,
          walkKm: Math.round((nearTo.dist || 0) * 10) / 10,
        },
      },
      routes,
      liveFeederBuses: feederData.count,
      feeder: {
        activeCount: feederData.count,
        nearOrigin: nearestFeederBuses(originLat, originLon, vehicles, 5),
        nearDestination: nearestFeederBuses(destLat, destLon, vehicles, 5),
      },
      source: 'GTFS Prasarana + OSM Geocoding',
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get('/api/dashboard', async (_req, res) => {
  try {
    const [rail, busGtfs, feeder, klBus, alerts] = await Promise.all([
      loadGtfs('rapid-rail-kl'),
      loadGtfs('rapid-bus-kl'),
      loadVehicles('rapid-bus-mrtfeeder'),
      loadVehicles('rapid-bus-kl').catch(() => ({ count: 0, vehicles: [] })),
      loadAllAlerts({ source: 'all' }),
    ]);

    const railRoutes = rail.routes.filter((r) => r.status === 'valid' || !r.status);
    const disruptionItems = (alerts.items || []).filter((it) =>
      /gangguan|disruption|delay|lambat|tergelincir|rosak|outage|mrt|lrt|rapid/i.test(
        `${it.title || ''} ${it.snippet || ''}`
      )
    );

    res.json({
      rail: {
        routeCount: railRoutes.length,
        stopCount: rail.stops.length,
        routes: railRoutes.map((r) => ({
          id: r.route_id,
          short: r.route_short_name,
          name: r.route_long_name,
          category: r.category,
          color: r.route_color ? `#${r.route_color}` : '#e8394d',
        })),
      },
      bus: {
        routeCount: busGtfs.routes.length,
        stopCount: busGtfs.stops.length,
      },
      live: {
        feederBuses: feeder.count,
        rapidklBuses: klBus.count,
      },
      alerts: disruptionItems,
      allNews: alerts.items,
      threads: alerts.threads,
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`MyMobility → http://localhost:${PORT}`);
  const th = process.env.THREADS_ACCESS_TOKEN ? ' · Threads API' : ' · Threads (token belum diset)';
  console.log('Data: api.data.gov.my · Google News RSS · OpenStreetMap' + th);
});
