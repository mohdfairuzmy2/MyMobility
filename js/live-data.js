/**
 * Live data layer — updates UI from /api/* (run: npm start)
 */
// Bila di GitHub Pages (*.github.io), panggil backend Render. Bila di Render sendiri, guna laluan relatif.
const RENDER_BACKEND = 'https://mymobility.onrender.com'; // tukar jika URL Render anda berbeza
const API = /\.github\.io$/i.test(location.hostname) ? RENDER_BACKEND : '';
const lang = () => window.lang || 'ms';
const t = (ms, en) => (lang() === 'ms' ? ms : en);

async function api(path) {
  const r = await fetch(API + path);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
  return r.json();
}

function fmtTime(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleTimeString(lang() === 'ms' ? 'ms-MY' : 'en-MY', { hour: 'numeric', minute: '2-digit' });
}

function fmtDateTime(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  const loc = lang() === 'ms' ? 'ms-MY' : 'en-MY';
  const dateStr = dt.toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' });
  const timeStr = dt.toLocaleTimeString(loc, { hour: 'numeric', minute: '2-digit' });
  return `${dateStr} · ${timeStr}`;
}

function fmtAgo(d) {
  const m = Math.round((Date.now() - new Date(d)) / 60000);
  if (m < 1) return t('Baru sahaja', 'Just now');
  if (m < 60) return t(`${m} min lalu`, `${m} min ago`);
  return fmtDateTime(d);
}

function setStatus(ok, msg) {
  const el = document.getElementById('liveStatus');
  if (!el) return;
  el.className = 'live-status ' + (ok ? 'ok' : 'err');
  el.innerHTML = ok
    ? `<i class="ti ti-live-photo"></i> <span>${msg}</span>`
    : `<i class="ti ti-plug-connected-x"></i> <span>${msg}</span>`;
}

// ——— Dashboard (Utama) ———
async function renderDashboard(data) {
  const alertEl = document.getElementById('liveHomeAlert');
  const nowEl = document.getElementById('liveNowStatus');
  const todayEl = document.getElementById('liveTodayTrip');
  const etaEl = document.getElementById('liveNearbyEta');

  if (alertEl) {
    const alerts = data.alerts || [];
    if (!alerts.length) {
      alertEl.innerHTML = `<div class="ab" style="border-left-color:var(--ok)"><i class="ti ti-circle-check"></i><div><div class="abt">${t('Tiada gangguan dilaporkan', 'No disruptions reported')}</div><div class="abd">${t('Sumber: berita semasa', 'Source: latest news')}</div></div></div>`;
    } else {
      const top = alerts.slice(0, 2);
      alertEl.innerHTML = top
        .map((a) => {
          const icon = a.platform === 'threads' ? 'ti-brand-threads' : 'ti-alert-triangle';
          return `<div class="ab"><i class="ti ${icon}"></i><div><div class="abt">${esc(a.title)}</div><div class="abd">${esc(a.source || '')} · ${fmtDateTime(a.pubDate)}</div><div class="abt2"><a href="${esc(a.link)}" target="_blank" rel="noopener">${t('Baca sumber', 'Read source')} →</a></div></div></div>`;
        })
        .join('');
    }
  }

  if (nowEl) {
    const dis = (data.alerts || []).length;
    nowEl.innerHTML = `
      <div class="sc2"><div class="sv">${dis ? t('Gangguan', 'Disruption') : t('Normal', 'Normal')}</div><div class="sl">${t('Status rel utama', 'Main rail status')}</div><div class="ss ${dis ? 'er' : 'ok'}"><i class="ti ti-${dis ? 'alert-triangle' : 'circle-check'}" style="font-size:12px"></i><span>${dis ? t('Ada gangguan, semak amaran', 'Disruption detected, check alerts') : t('Semua berjalan lancar', 'Everything running smoothly')}</span></div></div>
      <div class="sc2"><div class="sv">${data.bus.routeCount}</div><div class="sl">${t('Laluan bas RapidKL', 'RapidKL bus routes')}</div><div class="ss ok"><i class="ti ti-bus" style="font-size:12px"></i><span>${data.bus.stopCount} ${t('hentian', 'stops')}</span></div></div>
      <div class="sc2"><div class="sv">${data.live.feederBuses}</div><div class="sl">${t('Bas feeder MRT (masa nyata)', 'MRT feeder buses (live)')}</div><div class="ss ok"><i class="ti ti-live-photo" style="font-size:12px"></i><span>data.gov.my</span></div></div>
      <div class="sc2"><div class="sv">${dis}</div><div class="sl">${t('Amaran utama hari ini', 'Main alerts today')}</div><div class="ss ${dis ? 'er' : 'ok'}"><i class="ti ti-${dis ? 'bell' : 'circle-check'}" style="font-size:12px"></i><span>${dis ? t('Tekan tab Amaran', 'Open Alerts tab') : t('Tiada amaran besar', 'No major alerts')}</span></div></div>`;
  }

  if (todayEl) {
    try {
      const trip = await api('/api/journey?from=Puchong%20Prima&to=KLCC');
      const best = (trip.routes || [])[0];
      if (best) {
        const fare = best.fare?.cashless != null ? `RM ${best.fare.cashless.toFixed(2)}` : '—';
        todayEl.innerHTML = `<div class="ro best"><span class="bt2">${t('Cadangan cepat', 'Quick suggestion')}</span><div class="roh"><div class="roi" style="background:#DBEAFE"><i class="ti ti-route" style="font-size:16px;color:#1E40AF"></i></div><div><div class="rot">${t('Puchong Prima ke KLCC', 'Puchong Prima to KLCC')}</div><div class="rom">${best.transfers || 0} ${t('kali tukar', 'transfer(s)')}</div></div></div><div class="rtm"><div><div class="rd">${t('Tambang anggaran', 'Estimated fare')}</div><div class="rc">${fare}</div></div><div style="text-align:right"><div class="rdu">${best.durationMin || '-'} min</div><div class="rc">${t('Masa perjalanan sekarang', 'Current travel time')}</div></div></div></div>`;
      }
    } catch (_) {
      todayEl.innerHTML = `<div class="ro"><div class="rot">${t('Info perjalanan belum tersedia', 'Trip info unavailable')}</div></div>`;
    }
  }

  if (etaEl) {
    const routes = (data.rail.routes || []).slice(0, 3);
    etaEl.innerHTML = routes
      .map((r, idx) => {
        const cat = (r.category || 'MRT').toUpperCase();
        const cls = cat === 'MRT' ? 'm' : cat === 'LRT' ? 'l' : cat === 'BRT' ? 'bt' : 'k';
        const eta = 4 + idx * 3;
        return `<div class="scc"><div class="scb ${cls}">${cat}<br>${esc(r.short || r.id)}</div><div class="sci"><div class="scn">${esc(r.name)}</div><div class="scr">${t('Data rasmi semasa', 'Current official data')}</div><div class="scs ok"><i class="ti ti-database" style="font-size:11px"></i><span>${t('Lihat tab Rel untuk maklumat penuh', 'See Rail tab for full info')}</span></div></div><div class="sct"><div class="scnx">${eta} min</div><div class="sclb">${t('lagi', 'left')}</div></div></div>`;
      })
      .join('');
  }
}

async function renderHubs() {
  const hubsEl = document.getElementById('liveHubs');
  if (!hubsEl) return;
  const rail = await api('/api/gtfs/rapid-rail-kl');
  const names = ['KL SENTRAL', 'MASJID JAMEK', 'TITIWANGSA', 'SUBANG JAYA', 'KLANG', 'PUTRAJAYA'];
  const found = names.map((n) => rail.stops.find((s) => (s.stop_name || '').includes(n.split(' ')[0]))).filter(Boolean);
  const extra = rail.stops.filter((s) => /KLCC|PUCHONG|BANDAR UTAMA/i.test(s.stop_name)).slice(0, 2);
  const list = [...found, ...extra].slice(0, 6);
  hubsEl.innerHTML = list
    .map((s) => {
      const tags = [s.category || 'Rail'].map(
        (c) => `<span class="tg ${c === 'MRT' ? 'm' : c === 'LRT' ? 'lt' : 'bs'}">${esc(c)}</span>`
      );
      return `<div class="hb"><div class="hbn">${titleCase(s.stop_name)}</div><div class="hbt">${tags.join('')}</div></div>`;
    })
    .join('');
}

function titleCase(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s ?? '';
  return d.innerHTML;
}

// ——— Plan tab ———
function journeyQueryParams() {
  const fromEl = document.getElementById('planFrom');
  const toEl = document.getElementById('planTo');
  const fromStop = fromEl?.dataset?.stopId || '';
  const toStop = toEl?.dataset?.stopId || '';
  if (fromStop && toStop) {
    return `from_stop=${encodeURIComponent(fromStop)}&to_stop=${encodeURIComponent(toStop)}`;
  }
  const from = fromEl?.dataset?.value || 'Puchong Prima, Selangor';
  const to = toEl?.dataset?.value || 'KLCC, Kuala Lumpur';
  return `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
}

function renderFarePills(fare) {
  if (!fare) return '';
  return `<div class="fare-pills">
    <span class="fare-pill on">MyRapid RM ${fare.cashless.toFixed(2)}</span>
    <span class="fare-pill">${t('Tunai', 'Cash')} RM ${fare.cash.toFixed(2)}</span>
    <span class="fare-pill">Token RM ${fare.token.toFixed(2)}</span>
  </div>`;
}

function renderRouteLegs(legs) {
  return legs
    .map((l) => {
      const cls = l.mode === 'Walk' ? 'walk' : l.mode === 'Transit' ? 'mrt' : 'bus';
      const label = l.mode === 'Walk' ? `${t('Berjalan', 'Walk')} ${l.name}` : esc(l.name);
      return `<span class="rb ${cls}">${label}</span>`;
    })
    .join('<span class="ra"><i class="ti ti-arrow-right" style="font-size:11px"></i></span>');
}

function routeBadge(idx, route) {
  if (idx === 0) return t('Paling pantas', 'Fastest');
  if (route.type === 'direct') return t('Terus', 'Direct');
  return route.hub ? `${t('Via', 'Via')} ${esc(route.hub)}` : t('Alternatif', 'Alternative');
}

function renderFeederSection(feeder) {
  if (!feeder || !feeder.activeCount) return '';
  let html = `<div class="slbl" style="margin-top:4px">${t('Bas feeder MRT (masa nyata)', 'MRT feeder buses (live)')} · ${feeder.activeCount} ${t('aktif', 'active')}</div>`;
  const blocks = [
    { key: 'nearOrigin', title: t('Dekat stesen asal', 'Near origin station') },
    { key: 'nearDestination', title: t('Dekat stesen destinasi', 'Near destination station') },
  ];
  for (const { key, title } of blocks) {
    const list = feeder[key] || [];
    if (!list.length) continue;
    html += `<div class="feeder-mini"><div style="font-size:11px;font-weight:600;color:var(--text);margin-bottom:6px">${title}</div>`;
    html += list
      .map(
        (b) =>
          `<div class="fmr"><span><i class="ti ti-bus" style="font-size:12px"></i> ${b.routeId ? esc(String(b.routeId)) : t('Feeder', 'Feeder')}</span><b>~${b.distM} m</b></div>`
      )
      .join('');
    html += '</div>';
  }
  if (html.indexOf('feeder-mini') < 0) {
    html += `<div class="feeder-mini"><div class="fmr">${t('Tiada feeder berhampiran stesen dipilih', 'No feeder near selected stations')}</div></div>`;
  }
  return html;
}

async function loadJourney() {
  const box = document.getElementById('livePlanRoutes');
  if (!box) return;
  box.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text2)"><i class="ti ti-loader"></i> ${t('Mencari laluan…', 'Finding routes…')}</div>`;
  try {
    const j = await api(`/api/journey?${journeyQueryParams()}`);
    const dep = new Date();
    const routes = j.routes || [];
    if (!routes.length) throw new Error(t('Tiada laluan', 'No routes'));

    let html = `<div style="font-size:11px;color:var(--text2);margin-bottom:10px">${esc(j.from.station.name)} (${j.from.station.id}) → ${esc(j.to.station.name)} (${j.to.station.id})</div>`;

    routes.forEach((r, idx) => {
      const arr = new Date(dep.getTime() + r.durationMin * 60000);
      const hubNote =
        r.hub != null
          ? `${r.transfers} ${t('pertukaran di', 'transfer at')} ${esc(r.hub)}`
          : r.transfers === 0
            ? t('Tanpa pertukaran', 'No transfers')
            : `${r.transfers} ${t('pertukaran', 'transfer(s)')}`;
      const walkNote = `${t('Berjalan', 'Walk')} ~${j.from.station.walkKm}km + ~${j.to.station.walkKm}km`;

      html += `<div class="ro${idx === 0 ? ' best' : ''}">
        <span class="bt2">${routeBadge(idx, r)}</span>
        <div class="roh"><div class="roi" style="background:#DBEAFE"><i class="ti ti-route" style="font-size:16px;color:#1E40AF"></i></div>
        <div><div class="rot">${hubNote}</div><div class="rom">${walkNote}</div></div></div>
        <div class="ros">${renderRouteLegs(r.legs)}</div>
        ${renderFarePills(r.fare)}
        <div class="rtm"><div><div class="rd">${t('Bertolak', 'Depart')} ${fmtTime(dep)}</div></div>
        <div style="text-align:right"><div class="rdu">${r.durationMin} min</div><div class="rc">${t('Tiba', 'Arrive')} ${fmtTime(arr)}</div></div></div>
      </div>`;
    });

    html += renderFeederSection(j.feeder);
    box.innerHTML = html;
  } catch (e) {
    box.innerHTML = `<div class="ab"><i class="ti ti-alert-circle"></i><div><div class="abt">${t('Gagal memuatkan laluan', 'Failed to load routes')}</div><div class="abd">${esc(e.message)}. ${t('Jalankan', 'Run')} npm start</div></div></div>`;
  }
}

function setPlanEndpoint(which, stop) {
  const el = document.getElementById(which === 'from' ? 'planFrom' : 'planTo');
  if (!el || !stop) return;
  el.textContent = stop.stop_name || stop.stop_id;
  el.dataset.stopId = stop.stop_id || '';
  el.dataset.value = stop.stop_name ? `${stop.stop_name}, Malaysia` : '';
  loadJourney();
}

let searchTarget = null;
let searchTimer = null;

function closeSearchDd() {
  const dd = document.getElementById('searchResults');
  if (dd) dd.classList.remove('on');
}

async function runStationSearch(q) {
  const dd = document.getElementById('searchResults');
  if (!dd) return;
  if (q.length < 2) {
    dd.innerHTML = '';
    dd.classList.remove('on');
    return;
  }
  try {
    const data = await api(`/api/stops/search?q=${encodeURIComponent(q)}&limit=12`);
    if (!data.items.length) {
      dd.innerHTML = `<div class="search-item"><div class="search-item-n">${t('Tiada hasil', 'No results')}</div></div>`;
    } else {
      dd.innerHTML = data.items
        .map(
          (s, i) =>
            `<div class="search-item" role="option" data-idx="${i}">
              <div class="search-item-n">${esc(s.stop_name)}</div>
              <div class="search-item-m">${esc(s.stop_id)} · ${esc(s.category || 'Rail')}</div>
            </div>`
        )
        .join('');
      dd.querySelectorAll('.search-item[data-idx]').forEach((node) => {
        node.addEventListener('click', () => {
          const stop = data.items[Number(node.getAttribute('data-idx'))];
          if (searchTarget === 'from' || searchTarget === 'to') {
            setPlanEndpoint(searchTarget, stop);
          } else {
            switchTab('pp');
            setPlanEndpoint('to', stop);
          }
          const inp = document.getElementById('searchInput');
          if (inp) inp.value = stop.stop_name;
          closeSearchDd();
          searchTarget = null;
        });
      });
    }
    dd.classList.add('on');
  } catch (e) {
    dd.innerHTML = `<div class="search-item"><div class="search-item-n">${esc(e.message)}</div></div>`;
    dd.classList.add('on');
  }
}

function initStationSearch() {
  const inp = document.getElementById('searchInput');
  const dd = document.getElementById('searchResults');
  if (!inp) return;
  inp.placeholder = t('Cari stesen (min. 2 aksara)...', 'Search station (min. 2 chars)...');

  inp.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = inp.value.trim();
    searchTimer = setTimeout(() => runStationSearch(q), 280);
  });

  inp.addEventListener('focus', () => {
    const q = inp.value.trim();
    if (q.length >= 2) runStationSearch(q);
  });

  document.addEventListener('click', (e) => {
    const bar = document.getElementById('searchBar');
    if (bar && !bar.contains(e.target)) closeSearchDd();
  });

  const fromRow = document.getElementById('planFromRow');
  const toRow = document.getElementById('planToRow');
  const focusPlan = (target) => {
    searchTarget = target;
    switchTab('pp');
    inp.focus();
    const cur = document.getElementById(target === 'from' ? 'planFrom' : 'planTo');
    if (cur) inp.value = cur.textContent.trim();
    runStationSearch(inp.value.trim());
  };
  if (fromRow) {
    fromRow.addEventListener('click', () => focusPlan('from'));
    fromRow.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') focusPlan('from');
    });
  }
  if (toRow) {
    toRow.addEventListener('click', () => focusPlan('to'));
    toRow.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') focusPlan('to');
    });
  }

  const swap = document.getElementById('planSwap');
  if (swap) {
    swap.addEventListener('click', () => {
      const a = document.getElementById('planFrom');
      const b = document.getElementById('planTo');
      if (!a || !b) return;
      const tmp = { t: a.textContent, v: a.dataset.value, s: a.dataset.stopId };
      a.textContent = b.textContent;
      a.dataset.value = b.dataset.value;
      a.dataset.stopId = b.dataset.stopId || '';
      b.textContent = tmp.t;
      b.dataset.value = tmp.v;
      b.dataset.stopId = tmp.s || '';
      loadJourney();
    });
  }

  if (navigator.geolocation) {
    inp.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const q = inp.value.trim();
      if (q.length >= 2) return;
      e.preventDefault();
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const data = await api(
              `/api/stops/nearby?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&limit=8`
            );
            if (!dd) return;
            dd.innerHTML = `<div class="search-item" style="pointer-events:none"><div class="search-item-n">${t('Stesen berdekatan anda', 'Stations near you')}</div></div>`;
            dd.innerHTML += data.items
              .map(
                (s, i) =>
                  `<div class="search-item" role="option" data-near-idx="${i}">
                    <div class="search-item-n">${esc(s.stop_name)}</div>
                    <div class="search-item-m">${s.distM} m · ${esc(s.stop_id)}</div>
                  </div>`
              )
              .join('');
            dd.querySelectorAll('.search-item[data-near-idx]').forEach((node) => {
              node.addEventListener('click', () => {
                const stop = data.items[Number(node.getAttribute('data-near-idx'))];
                setPlanEndpoint(searchTarget || 'from', stop);
                inp.value = stop.stop_name;
                closeSearchDd();
              });
            });
            dd.classList.add('on');
          } catch (err) {
            console.warn(err);
          }
        },
        () => {}
      );
    });
  }
}

// ——— Rail ———
let railCache = null;

function getActiveRailFilters() {
  const active = [];
  document.querySelectorAll('#railFilters .rf, .rf2 .rf').forEach((el) => {
    if (el.classList.contains('on') && el.dataset.filter) active.push(el.dataset.filter);
  });
  return active;
}

function routeFilterKey(route) {
  const c = (route.category || '').toUpperCase();
  if (c === 'MRT') return 'mrt';
  if (c === 'LRT') return 'lrt';
  if (c === 'MRL' || /monorail/i.test(route.route_long_name || '')) return 'monorel';
  return null;
}

function routeCardClass(filterKey) {
  if (filterKey === 'mrt') return 'm';
  if (filterKey === 'lrt') return 'l';
  if (filterKey === 'monorel') return 'mo';
  if (filterKey === 'erl') return 'e';
  if (filterKey === 'ktm') return 'k';
  return 'k';
}

function filterGtfsRoutes(routes, active) {
  if (!active.length) return [];
  return routes.filter((r) => {
    const key = routeFilterKey(r);
    return key && active.includes(key);
  });
}

function railEmptyHtml() {
  return `<div style="text-align:center;padding:24px 12px;color:var(--text2);font-size:13px"><i class="ti ti-filter-off" style="font-size:22px;display:block;margin-bottom:8px;opacity:.5"></i>${t('Tiada laluan dipilih. Tap sekurang-kurangnya satu penapis.', 'No lines selected. Tap at least one filter.')}</div>`;
}

function renderFallbackSchedule(active) {
  let html = '';
  if (active.includes('erl')) {
    html += `<div class="scc"><div class="scb e">ERL</div><div class="sci"><div class="scn">KLIA Ekspres</div><div class="scr">KL Sentral → KLIA</div>
      <div class="scs ok"><i class="ti ti-info-circle" style="font-size:11px"></i><span>${t('Tiada data GTFS · gambaran', 'No GTFS data · illustrative')}</span></div></div>
      <div class="sct"><div class="scnx">—</div><div class="sclb">${t('belum ada data masa nyata', 'no live data yet')}</div></div></div>`;
    html += `<div class="scc"><div class="scb e">ERL</div><div class="sci"><div class="scn">KLIA Transit</div><div class="scr">KL Sentral → KLIA2</div>
      <div class="scs ok"><i class="ti ti-info-circle" style="font-size:11px"></i><span>${t('Tiada data GTFS · gambaran', 'No GTFS data · illustrative')}</span></div></div>
      <div class="sct"><div class="scnx">—</div><div class="sclb">${t('belum ada data masa nyata', 'no live data yet')}</div></div></div>`;
  }
  if (active.includes('ktm')) {
    html += `<div class="scc"><div class="scb k">KTM</div><div class="sci"><div class="scn">KTM Komuter</div><div class="scr">Batu Caves ↔ Klang</div>
      <div class="scs ok"><i class="ti ti-info-circle" style="font-size:11px"></i><span>${t('Tiada data GTFS · gambaran', 'No GTFS data · illustrative')}</span></div></div>
      <div class="sct"><div class="scnx">—</div><div class="sclb">${t('belum ada data masa nyata', 'no live data yet')}</div></div></div>`;
  }
  return html;
}

function renderFallbackMap(active) {
  let html = '';
  if (active.includes('erl')) {
    html += `<div class="rml"><div class="rdot e" style="width:9px;height:9px;border:none"></div>ERL — KLIA Ekspres &amp; Transit</div>
      <div class="rrow"><div class="rst"><div class="rdot e"></div><div class="rsn">KL Sentral</div></div><div class="rseg e"></div>
      <div class="rst"><div class="rdot e"></div><div class="rsn">Salak T.</div></div><div class="rseg e"></div>
      <div class="rst"><div class="rdot e"></div><div class="rsn">KLIA2</div></div><div class="rseg e"></div>
      <div class="rst"><div class="rdot e"></div><div class="rsn">KLIA</div></div></div>`;
  }
  if (active.includes('ktm')) {
    html += `<div class="rml" style="margin-top:10px"><div class="rdot k" style="width:9px;height:9px;border:none"></div>KTM Komuter</div>
      <div class="rrow"><div class="rst"><div class="rdot k"></div><div class="rsn">Batu Caves</div></div><div class="rseg k"></div>
      <div class="rst"><div class="rdot k"></div><div class="rsn">KL Sentral</div></div><div class="rseg k"></div>
      <div class="rst"><div class="rdot k"></div><div class="rsn">Subang</div></div><div class="rseg k"></div>
      <div class="rst"><div class="rdot k"></div><div class="rsn">Klang</div></div></div>`;
  }
  return html;
}

function renderRailLegend(active) {
  const items = [];
  if (active.includes('mrt')) items.push(`<div class="rli"><div class="rld" style="background:#e8394d"></div>MRT</div>`);
  if (active.includes('erl')) items.push(`<div class="rli"><div class="rld" style="background:#7c3aed"></div>ERL</div>`);
  if (active.includes('ktm')) items.push(`<div class="rli"><div class="rld" style="background:#0369a1"></div>KTM</div>`);
  if (active.includes('lrt')) items.push(`<div class="rli"><div class="rld" style="background:#ea580c"></div>LRT</div>`);
  if (active.includes('monorel')) items.push(`<div class="rli"><div class="rld" style="background:#16a34a"></div>Monorel</div>`);
  return items.length ? `<div class="rl">${items.join('')}</div>` : '';
}

function paintRailFromCache() {
  const sched = document.getElementById('liveRailSchedule');
  const map = document.getElementById('liveRailMap');
  if (!sched && !map) return;
  if (!railCache) return;

  const active = getActiveRailFilters();
  const rail = railCache;
  const allRoutes = rail.routes.filter((r) => r.status === 'valid' || !r.status);
  const routes = filterGtfsRoutes(allRoutes, active);

  if (!active.length) {
    const empty = railEmptyHtml();
    if (sched) sched.innerHTML = empty;
    if (map) map.innerHTML = empty;
    return;
  }

  if (sched) {
    let html = routes
      .map((r) => {
        const key = routeFilterKey(r);
        const cat = r.category || 'Rail';
        const cls = routeCardClass(key);
        const stopsOnRoute = rail.stops.filter((s) => s.route_id === r.route_id).length;
        return `<div class="scc"><div class="scb ${cls}">${esc(cat)}<br>${esc(r.route_short_name || r.route_id)}</div>
          <div class="sci"><div class="scn">${esc(r.route_long_name)}</div><div class="scr">${stopsOnRoute} ${t('stesen', 'stations')} · ${t('data rasmi', 'official data')}</div>
          <div class="scs ok"><i class="ti ti-database" style="font-size:11px"></i><span>${t('Data rasmi', 'Official data')}</span></div></div>
          <div class="sct"><div class="scnx">—</div><div class="sclb">${t('belum ada data masa nyata', 'no live data yet')}</div></div></div>`;
      })
      .join('');
    html += renderFallbackSchedule(active);
    sched.innerHTML = html || railEmptyHtml();
  }

  if (map) {
    const byRoute = {};
    routes.forEach((r) => {
      byRoute[r.route_id] = rail.stops
        .filter((s) => s.route_id === r.route_id && s.status === 'valid')
        .slice(0, 8);
    });
    let html = '';
    for (const r of routes) {
      const stops = byRoute[r.route_id] || [];
      if (!stops.length) continue;
      const col = r.route_color ? `#${r.route_color}` : '#e8394d';
      const key = routeFilterKey(r);
      const dotCls = key === 'lrt' ? 'l' : key === 'monorel' ? 'mo' : key === 'mrt' ? 'm' : 'm';
      html += `<div class="rml" style="${html ? 'margin-top:10px' : ''}"><div class="rdot ${dotCls}" style="width:9px;height:9px;border:none;background:${col}"></div>${esc(r.route_long_name)}</div><div class="rrow">`;
      stops.forEach((s, i) => {
        if (i) html += `<div class="rseg ${dotCls}" style="background:${col}"></div>`;
        html += `<div class="rst"><div class="rdot ${dotCls}" style="background:${col}"></div><div class="rsn">${esc((s.stop_name || '').split(' ').slice(-2).join(' '))}</div></div>`;
      });
      html += '</div>';
    }
    html += renderFallbackMap(active);
    html += renderRailLegend(active);
    map.innerHTML = html || railEmptyHtml();
  }
}

async function renderRail() {
  const sched = document.getElementById('liveRailSchedule');
  const map = document.getElementById('liveRailMap');
  if (!sched && !map) return;
  railCache = await api('/api/gtfs/rapid-rail-kl');
  paintRailFromCache();
}

function initRailFilters() {
  const box = document.getElementById('railFilters') || document.querySelector('.rf2');
  if (!box) return;
  box.querySelectorAll('.rf').forEach((el) => {
    el.addEventListener('click', function () {
      this.classList.toggle('on');
      paintRailFromCache();
    });
  });
}

// ——— Bus ———
let busCache = null;
let busViewMode = 'nearby';

function busCategory(r) {
  const id = (r.route_id || '').toUpperCase();
  const sn = (r.route_short_name || '').toUpperCase();
  const ln = (r.route_long_name || '').toUpperCase();
  if (/BRT|SUNWAY/.test(ln) || /^BRT/.test(sn) || id.startsWith('B')) return 'brt';
  if (/MALAM|NIGHT|BET/.test(ln) || /^BET/.test(sn)) return 'malam';
  if (/EKSPRES|EXPRESS/.test(ln) || /^E\d/.test(sn) || id.startsWith('E')) return 'ekspres';
  if (/FEEDER/.test(ln) || /^T\d/.test(sn) || id.startsWith('T')) return 'feeder';
  return 'rapidkl';
}

function busCatLabel(cat) {
  if (cat === 'brt') return ['BRT', 'bt'];
  if (cat === 'feeder') return ['Feeder', 'fd'];
  if (cat === 'ekspres') return [t('Ekspres', 'Express'), 'ex'];
  if (cat === 'malam') return [t('Malam', 'Night'), 'ex'];
  return ['RapidKL', 'r'];
}

function getActiveBusFilters() {
  const box = document.getElementById('busFilters');
  if (!box) return ['semua'];
  const active = [];
  box.querySelectorAll('.pi').forEach((el) => {
    if (el.classList.contains('on') && el.dataset.bfilter) active.push(el.dataset.bfilter);
  });
  return active.length ? active : ['semua'];
}

function paintBusFromCache() {
  const list = document.getElementById('liveBusList');
  if (!list || !busCache) return;
  const { gtfs, feeder, kl } = busCache;
  const active = getActiveBusFilters();
  const showAll = active.includes('semua');

  const matched = gtfs.routes.filter((r) => showAll || active.includes(busCategory(r)));
  const limit = busViewMode === 'all' ? 60 : 10;
  const routes = matched.slice(0, limit);

  if (!routes.length) {
    list.innerHTML = `<div style="text-align:center;padding:24px 12px;color:var(--text2);font-size:13px"><i class="ti ti-bus-off" style="font-size:22px;display:block;margin-bottom:8px;opacity:.5"></i>${t('Tiada laluan untuk penapis ini.', 'No routes for this filter.')}</div>`;
    return;
  }

  list.innerHTML =
    `<div style="font-size:11px;color:var(--text2);margin-bottom:8px">${t('Menunjukkan', 'Showing')} ${routes.length}/${matched.length} ${t('laluan', 'routes')}</div>` +
    routes
      .map((r) => {
        const cat = busCategory(r);
        const [label, badge] = busCatLabel(cat);
        const liveLine =
          cat === 'feeder'
            ? `<div class="bmi"><i class="ti ti-live-photo"></i><span>${feeder.count} ${t('bas feeder masa nyata', 'live feeder buses')}</span></div>`
            : `<div class="bmi"><i class="ti ti-bus"></i><span>${kl.count} ${t('bas KL masa nyata', 'live KL buses')}</span></div>`;
        return `<div class="bc"><div class="bct"><div class="bcb ${badge}">${esc(label)}</div>
        <div><div class="bcn">${esc(r.route_short_name)} — ${esc(r.route_long_name)}</div>
        <div class="bcr">${t('Data rasmi', 'Official data')} · data.gov.my</div></div></div>
        <div class="bcm">${liveLine}</div></div>`;
      })
      .join('');
}

async function renderBus() {
  const list = document.getElementById('liveBusList');
  if (!list) return;
  const [gtfs, feeder, kl] = await Promise.all([
    api('/api/gtfs/rapid-bus-kl'),
    api('/api/vehicles/rapid-bus-mrtfeeder'),
    api('/api/vehicles/rapid-bus-kl').catch(() => ({ count: 0 })),
  ]);
  busCache = { gtfs, feeder, kl };
  paintBusFromCache();
}

function initBusFilters() {
  const box = document.getElementById('busFilters');
  if (!box) return;
  box.querySelectorAll('.pi').forEach((el) => {
    el.addEventListener('click', function () {
      const f = this.dataset.bfilter;
      if (f === 'semua') {
        box.querySelectorAll('.pi').forEach((x) => x.classList.remove('on'));
        this.classList.add('on');
      } else {
        const semua = box.querySelector('.pi[data-bfilter="semua"]');
        if (semua) semua.classList.remove('on');
        this.classList.toggle('on');
        if (!box.querySelector('.pi.on') && semua) semua.classList.add('on');
      }
      paintBusFromCache();
    });
  });
}

// ——— Leaflet (OpenStreetMap) shared helpers ———
const KL_CENTER = [3.139, 101.6869];
const leafletMaps = {};

function railColor(cat) {
  const c = (cat || '').toUpperCase();
  if (c === 'ERL') return '#7c3aed';
  if (c === 'KTM') return '#0369a1';
  if (c === 'LRT') return '#ea580c';
  if (c === 'MRL' || c === 'MR') return '#16a34a';
  if (c === 'BRT') return '#92400e';
  return '#e8394d';
}

function initLeaflet(id, zoom) {
  if (typeof L === 'undefined') return null;
  if (leafletMaps[id]) return leafletMaps[id];
  const el = document.getElementById(id);
  if (!el) return null;
  const map = L.map(el, { zoomControl: true, attributionControl: true }).setView(KL_CENTER, zoom || 11);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }).addTo(map);
  const stationLayer = L.layerGroup().addTo(map);
  const busLayer = L.layerGroup().addTo(map);
  leafletMaps[id] = { map, stationLayer, busLayer };
  return leafletMaps[id];
}

function fixLeafletSize(id) {
  const m = leafletMaps[id];
  if (m) setTimeout(() => m.map.invalidateSize(), 60);
}

function addStationMarkers(layer, stops) {
  stops.forEach((s) => {
    const lat = +s.stop_lat,
      lon = +s.stop_lon;
    if (!lat || !lon) return;
    const col = railColor(s.category);
    L.circleMarker([lat, lon], {
      radius: 5,
      color: '#fff',
      weight: 1.5,
      fillColor: col,
      fillOpacity: 1,
    })
      .bindPopup(
        `<strong>${esc(titleCase(s.stop_name))}</strong><br>${esc(s.category || 'Rel')} · ${t(
          'data rasmi',
          'official data'
        )}`
      )
      .addTo(layer);
  });
}

function compassDir(deg) {
  if (deg == null || isNaN(deg)) return null;
  const dirsMs = ['Utara', 'Timur Laut', 'Timur', 'Tenggara', 'Selatan', 'Barat Daya', 'Barat', 'Barat Laut'];
  const dirsEn = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const i = Math.round(deg / 45) % 8;
  return { ms: dirsMs[i], en: dirsEn[i] };
}

function fmtBusTime(ts) {
  if (!ts) return null;
  const ms = ts > 1e12 ? ts : ts * 1000;
  return fmtAgo(ms);
}

function busPopupHtml(v) {
  const dir = compassDir(v.bearing);
  const rows = [];
  rows.push(
    `<div style="font-weight:700;font-size:13px;margin-bottom:4px"><i class="ti ti-bus" style="color:#059669"></i> ${t(
      'Bas feeder',
      'Feeder bus'
    )} #${esc(String(v.id ?? '—'))}</div>`
  );
  if (dir) {
    rows.push(
      `<div style="font-size:12px"><span style="display:inline-block;transform:rotate(${Math.round(
        v.bearing
      )}deg)">↑</span> ${t('Arah', 'Heading')}: ${t(dir.ms, dir.en)} (${Math.round(v.bearing)}°)</div>`
    );
  }
  const tm = fmtBusTime(v.timestamp);
  if (tm) rows.push(`<div style="font-size:12px">${t('Kemas kini', 'Updated')}: ${esc(tm)}</div>`);
  if (v.routeId) rows.push(`<div style="font-size:12px">${t('Laluan', 'Route')}: ${esc(v.routeId)}</div>`);
  rows.push(
    `<div style="font-size:11px;color:#666;margin-top:3px">${(+v.lat).toFixed(5)}, ${(+v.lon).toFixed(5)}</div>`
  );
  rows.push(
    `<div style="font-size:10px;color:#888;margin-top:3px"><i class="ti ti-live-photo" style="font-size:10px;color:#059669"></i> ${t(
      'GTFS Realtime · data.gov.my',
      'GTFS Realtime · data.gov.my'
    )}</div>`
  );
  return rows.join('');
}

function addBusMarkers(layer, vehicles) {
  vehicles.forEach((v) => {
    if (!v.lat || !v.lon) return;
    L.circleMarker([v.lat, v.lon], {
      radius: 5,
      color: '#fff',
      weight: 1.5,
      fillColor: '#059669',
      fillOpacity: 1,
    })
      .bindPopup(busPopupHtml(v))
      .addTo(layer);
  });
}

async function renderBusMap() {
  const countEl = document.getElementById('busMapCount');
  const m = initLeaflet('busMpc', 11);
  if (!m) return;
  fixLeafletSize('busMpc');

  let feeder = { vehicles: [], count: 0 };
  try {
    feeder = await api('/api/vehicles/rapid-bus-mrtfeeder');
  } catch (_) {}

  let rail = railCache;
  if (!rail) {
    try {
      rail = await api('/api/gtfs/rapid-rail-kl');
    } catch (_) {
      rail = { stops: [] };
    }
  }

  if (countEl) {
    countEl.textContent =
      (feeder.count || feeder.vehicles.length) + ' ' + t('bas dikesan', 'buses detected');
  }

  const major = (rail.stops || []).filter(
    (s) =>
      s.status === 'valid' &&
      /SENTRAL|KLCC|KLIA|PUTRAJAYA|TITIWANGSA|MASJID|SUBANG|KLANG|BATU CAVES|KAJANG|KWASA/i.test(
        s.stop_name || ''
      )
  );

  m.stationLayer.clearLayers();
  m.busLayer.clearLayers();
  addStationMarkers(m.stationLayer, major.slice(0, 12));
  addBusMarkers(m.busLayer, feeder.vehicles.slice(0, 80));
}

function setBusView(mode) {
  busViewMode = mode;
  const listView = document.getElementById('busListView');
  const mapView = document.getElementById('busMapView');
  if (mode === 'map') {
    if (listView) listView.style.display = 'none';
    if (mapView) mapView.style.display = 'block';
    renderBusMap();
  } else {
    if (mapView) mapView.style.display = 'none';
    if (listView) listView.style.display = 'block';
    paintBusFromCache();
  }
}

function initBusSeg() {
  const seg = document.getElementById('busSeg');
  if (!seg) return;
  seg.querySelectorAll('.seg').forEach((el) => {
    el.addEventListener('click', function () {
      setBusView(this.dataset.bview || 'nearby');
    });
  });
}

// ——— Alerts ———
let alertsCache = null;

const KW_SYNONYMS = {
  gangguan: /gangguan|disruption|disrupt|tergendala/i,
  delay: /delay|lambat|lewat|kelewatan|tertunda/i,
  kerosakan: /kerosakan|rosak|breakdown|fault|technical|teknikal/i,
  trafik: /trafik|traffic|kesesakan|sesak|jam|congestion/i,
  banjir: /banjir|flood|air naik/i,
  reroute: /reroute|alih laluan|lencong|pesongan|divert/i,
  breakdown: /breakdown|rosak|kerosakan|tersadai|terhenti/i,
};

function getActiveKeywords() {
  const box = document.getElementById('kwFilters');
  if (!box) return [];
  const active = [];
  box.querySelectorAll('.kw').forEach((el) => {
    if (el.classList.contains('on') && el.dataset.kw) active.push(el.dataset.kw);
  });
  return active;
}

function itemMatchesKeywords(it, keywords) {
  const text = `${it.title || ''} ${it.snippet || ''} ${it.source || ''}`;
  return keywords.some((kw) => {
    const re = KW_SYNONYMS[kw];
    return re ? re.test(text) : new RegExp(kw, 'i').test(text);
  });
}

function paintAlertsFromCache() {
  const list = document.getElementById('liveAlertList');
  if (!list || !alertsCache) return;
  const data = alertsCache;
  const items = data.items || [];
  const keywords = getActiveKeywords();

  if (!items.length) {
    list.innerHTML = `<div class="ni ok"><div class="ns">${t('Tiada berita', 'No news')}</div><div class="nt2">${t('Cuba lagi kemudian', 'Try again later')}</div></div>`;
    return;
  }

  const filtered = keywords.length ? items.filter((it) => itemMatchesKeywords(it, keywords)) : items;

  const threadsHint = data.threads && !data.threads.configured ? data.threads.hint : null;

  let html = `<div style="font-size:11px;color:var(--text2);margin-bottom:8px">${
    keywords.length
      ? `${t('Tapis', 'Filter')}: ${esc(keywords.join(', '))} · ${filtered.length}/${items.length} ${t('berita', 'news')}`
      : `${t('Semua berita', 'All news')} · ${items.length}`
  }</div>`;

  if (!filtered.length) {
    html += `<div style="text-align:center;padding:24px 12px;color:var(--text2);font-size:13px"><i class="ti ti-filter-off" style="font-size:22px;display:block;margin-bottom:8px;opacity:.5"></i>${t('Tiada berita sepadan dengan kata kunci dipilih.', 'No news matches the selected keywords.')}</div>`;
    list.innerHTML = html;
    return;
  }

  html += filtered
    .map((it) => {
      const urgent = /gangguan|disruption|delay|lambat|tergelincir/i.test(`${it.title || ''} ${it.snippet || ''}`);
      const cls = urgent ? 'e' : 'i';
      const icon = it.platform === 'threads' ? 'ti-brand-threads' : 'ti-news';
      return `<div class="ni ${cls}"><div class="ns"><i class="ti ${icon}" style="font-size:11px"></i> ${esc(it.source || 'News')}</div>
        <div class="nt2"><a href="${esc(it.link)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">${esc(it.title)}</a></div>
        <div class="ntm">${fmtDateTime(it.pubDate)} · <a href="${esc(it.link)}" target="_blank" rel="noopener" style="color:var(--accent)">${t('sumber', 'source')}</a></div></div>`;
    })
    .join('');

  if (threadsHint) {
    html += `<div class="ni i"><div class="ns"><i class="ti ti-brand-threads" style="font-size:11px"></i> Threads</div><div class="nt2">${esc(threadsHint)}</div></div>`;
  }
  list.innerHTML = html;
}

async function renderAlerts() {
  const list = document.getElementById('liveAlertList');
  if (!list) return;
  alertsCache = await api('/api/alerts');
  paintAlertsFromCache();
}

function initKeywordFilters() {
  const box = document.getElementById('kwFilters');
  if (!box) return;
  box.querySelectorAll('.kw').forEach((el) => {
    el.addEventListener('click', function () {
      this.classList.toggle('on');
      paintAlertsFromCache();
    });
  });
}

// ——— Map ———
const MAP_BOUNDS = { minLat: 2.75, maxLat: 3.35, minLon: 101.45, maxLon: 101.8 };

function project(lat, lon, w, h) {
  const x = ((lon - MAP_BOUNDS.minLon) / (MAP_BOUNDS.maxLon - MAP_BOUNDS.minLon)) * w;
  const y = (1 - (lat - MAP_BOUNDS.minLat) / (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat)) * h;
  return { x: Math.round(x), y: Math.round(y) };
}

function getActiveMapFilters() {
  const box = document.getElementById('mapFilters');
  if (!box) return { cats: ['MRT', 'LRT', 'MR', 'BRT'], bus: true };
  const cats = [];
  let bus = false;
  box.querySelectorAll('.rf').forEach((el) => {
    if (!el.classList.contains('on')) return;
    const f = el.dataset.mfilter;
    if (f === 'BAS') bus = true;
    else if (f) cats.push(f);
  });
  return { cats, bus };
}

let mapFeederCache = { vehicles: [] };

function paintMap() {
  const m = leafletMaps['mpc'];
  if (!m || !railCache) return;
  const { cats, bus } = getActiveMapFilters();

  const stops = (railCache.stops || []).filter(
    (s) => s.status === 'valid' && cats.includes((s.category || '').toUpperCase())
  );

  m.stationLayer.clearLayers();
  m.busLayer.clearLayers();
  addStationMarkers(m.stationLayer, stops);
  if (bus) addBusMarkers(m.busLayer, mapFeederCache.vehicles.slice(0, 120));
}

async function renderMap() {
  const m = initLeaflet('mpc', 11);
  if (!m) return;
  fixLeafletSize('mpc');

  railCache = railCache || (await api('/api/gtfs/rapid-rail-kl'));
  try {
    mapFeederCache = await api('/api/vehicles/rapid-bus-mrtfeeder');
  } catch (_) {
    mapFeederCache = { vehicles: [] };
  }

  paintMap();
}

function initMapFilters() {
  const box = document.getElementById('mapFilters');
  if (!box) return;
  box.querySelectorAll('.rf').forEach((el) => {
    el.addEventListener('click', function () {
      this.classList.toggle('on');
      paintMap();
    });
  });
}

// ——— Fare (populate + live calc) ———
let fareStops = [];

const MODE_CAT = { mrt: 'MRT', lrt: 'LRT', mr: 'MR', brt: 'BRT', ktm: 'KTM', erl: 'ERL', bus: 'BUS' };
const MODE_LABEL = { mrt: 'MRT', lrt: 'LRT', mr: 'Monorel', brt: 'BRT', ktm: 'KTM', erl: 'ERL', bus: 'Bas' };

function fareOpt(s) {
  return `<option value="${s.stop_id}">${titleCase(s.stop_name)} (${s.category})</option>`;
}

let ktmData = null;

async function ensureKtmData() {
  if (ktmData) return ktmData;
  try {
    ktmData = await api('/api/ktm/fares');
  } catch (_) {
    ktmData = null;
  }
  return ktmData;
}

async function applyKtmMode() {
  const fs = document.getElementById('fs');
  const ts = document.getElementById('ts');
  const note = document.getElementById('modeNote');
  const data = await ensureKtmData();
  if (!data) {
    if (note) {
      note.style.display = 'block';
      note.innerHTML = `<i class="ti ti-alert-triangle" style="font-size:11px;color:var(--warn)"></i> ${t(
        'Data tambang KTM tidak dapat dimuat.',
        'KTM fare data could not be loaded.'
      )}`;
    }
    return;
  }
  fs.disabled = ts.disabled = false;
  const opts = data.stations
    .map((name, i) => `<option value="${i}">${esc(name)}</option>`)
    .join('');
  fs.innerHTML = opts;
  ts.innerHTML = opts;
  const klsentral = data.stations.findIndex((s) => /KL Sentral/i.test(s));
  const kajang = data.stations.findIndex((s) => /^Kajang/i.test(s));
  fs.value = klsentral >= 0 ? klsentral : 0;
  ts.value = kajang >= 0 ? kajang : 1;
  if (note) {
    note.style.display = 'block';
    note.innerHTML = `<i class="ti ti-info-circle" style="font-size:11px"></i> ${data.stations.length} ${t(
      'stesen KTM Komuter · kadar rasmi KTMB (tanpa tunai)',
      'KTM Komuter stations · official KTMB cashless rate'
    )}`;
  }
  window.calcFare();
}

function applyFareMode(mode) {
  const fs = document.getElementById('fs');
  const ts = document.getElementById('ts');
  const note = document.getElementById('modeNote');
  if (!fs || !ts) return;

  if (mode === 'ktm') {
    applyKtmMode();
    return;
  }

  const target = MODE_CAT[mode] || 'MRT';
  const list = fareStops.filter((s) => (s.category || '').toUpperCase() === target);

  if (list.length >= 2) {
    fs.disabled = ts.disabled = false;
    fs.innerHTML = list.map(fareOpt).join('');
    ts.innerHTML = list.map(fareOpt).join('');
    fs.value = list[0].stop_id;
    ts.value = list[Math.min(list.length - 1, Math.floor(list.length / 2))].stop_id;
    if (note) {
      note.style.display = 'block';
      note.innerHTML = `<i class="ti ti-info-circle" style="font-size:11px"></i> ${list.length} ${t(
        'stesen',
        'stations'
      )} ${MODE_LABEL[mode]} · ${t('data rasmi', 'official data')}`;
    }
    window.calcFare();
  } else {
    if (note) {
      note.style.display = 'block';
      note.innerHTML = `<i class="ti ti-alert-triangle" style="font-size:11px;color:var(--warn)"></i> ${t(
        `Senarai stesen ${MODE_LABEL[mode]} tiada dalam data terbuka data.gov.my. Guna MRT, LRT, Monorel atau BRT untuk anggaran tambang.`,
        `${MODE_LABEL[mode]} station list is not in the open data.gov.my feed. Use MRT, LRT, Monorail or BRT for fare estimates.`
      )}`;
    }
    fs.disabled = ts.disabled = true;
    document.getElementById('fa').textContent = '—';
    document.getElementById('ftk').textContent = '—';
    document.getElementById('fst').textContent = '—';
    document.getElementById('ftm').textContent = '—';
    document.getElementById('fsv').textContent = '—';
  }
}

async function initFare() {
  const fs = document.getElementById('fs');
  const ts = document.getElementById('ts');
  if (!fs || !ts) return;

  const rail = await api('/api/gtfs/rapid-rail-kl');
  fareStops = rail.stops
    .filter((s) => s.status === 'valid' && /MRT|LRT|MONORAIL|MR|BRT/i.test(s.category || ''))
    .sort((a, b) => (a.stop_name || '').localeCompare(b.stop_name || ''));

  function setFareLabels(a, b, c, d) {
    const ids = ['lb1', 'lb2', 'lb3', 'lb4'];
    const vals = [a, b, c, d];
    ids.forEach((id, k) => {
      const el = document.getElementById(id);
      if (el) el.textContent = vals[k];
    });
  }
  function resetFareLabels() {
    ['lb1', 'lb2', 'lb3', 'lb4'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = el.dataset[lang()] || el.dataset.ms;
    });
  }

  window.calcFare = async function calcFareLive() {
    const from = fs.value,
      to = ts.value;

    if (window.cmode !== 'ktm') resetFareLabels();

    if (window.cmode === 'ktm' && ktmData) {
      const i = parseInt(from, 10),
        j = parseInt(to, 10);
      if (i === j) {
        document.getElementById('fa').textContent = '0.00';
        return;
      }
      const base = ktmData.matrix[i] && ktmData.matrix[i][j];
      if (base == null) {
        document.getElementById('fa').textContent = '—';
        return;
      }
      const disc = Math.round(base * 0.8 * 100) / 100;
      document.getElementById('fa').textContent = base.toFixed(2);
      document.getElementById('fst').textContent = 'RM ' + base.toFixed(2);
      document.getElementById('fsv').textContent = 'RM ' + disc.toFixed(2);
      document.getElementById('ftk').textContent = 'KTM';
      document.getElementById('ftm').textContent = '2 Dis 2015';
      setFareLabels(
        t('Tanpa tunai', 'Cashless'),
        t('Diskaun 20%', '20% discount'),
        t('Operator', 'Operator'),
        t('Berkuat kuasa', 'Effective')
      );
      document.getElementById('fl').textContent = t(
        'Kadar rasmi KTMB · KTM Komuter (tanpa tunai)',
        'Official KTMB rate · KTM Komuter (cashless)'
      );
      return;
    }

    if (from === to) {
      document.getElementById('fa').textContent = '0.00';
      return;
    }
    try {
      const f = await api(`/api/fare?from=${from}&to=${to}`);
      document.getElementById('fa').textContent = f.fare.cashless.toFixed(2);
      document.getElementById('ftk').textContent = 'RM ' + f.fare.token.toFixed(2);
      document.getElementById('fst').textContent = f.stopsBetween;
      document.getElementById('ftm').textContent = f.durationMin + ' min';
      document.getElementById('fsv').textContent = 'RM ' + (f.fare.cash - f.fare.cashless).toFixed(2);
      document.getElementById('fl').textContent =
        lang() === 'ms'
          ? `Tambang anggaran · ${f.distanceKm} km · data.gov.my`
          : `Estimated fare · ${f.distanceKm} km · data.gov.my`;
    } catch (_) {
      if (typeof window._calcFareOrig === 'function') window._calcFareOrig();
    }
  };
  fs.onchange = ts.onchange = () => window.calcFare();

  window.selMode = function (el) {
    document.querySelectorAll('.cmode').forEach((m) => m.classList.remove('on'));
    el.classList.add('on');
    window.cmode = el.dataset.mode;
    applyFareMode(el.dataset.mode);
  };

  const activeMode = document.querySelector('.cmode.on');
  applyFareMode(activeMode ? activeMode.dataset.mode : 'mrt');
}

// ——— Boot ———
async function refreshAll() {
  try {
    await api('/api/health');
    const dash = await api('/api/dashboard');
    setStatus(true, t('Data langsung · ', 'Live data · ') + fmtAgo(dash.fetchedAt));
    await renderDashboard(dash);
    await renderRail();
    await renderBus();
    await renderAlerts();
    await renderMap();
    await loadJourney();
    await initFare();
  } catch (e) {
    setStatus(false, t('Buka dengan npm start untuk data sebenar', 'Run npm start for live data'));
    console.warn('Live data:', e.message);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initStationSearch();
  initRailFilters();
  initBusFilters();
  initBusSeg();
  initKeywordFilters();
  initMapFilters();
  ['nav', 'bbar'].forEach((nid) => {
    const el = document.getElementById(nid);
    if (!el) return;
    el.addEventListener('click', (e) => {
      const tgt = e.target.closest('[data-p]');
      if (!tgt) return;
      if (tgt.dataset.p === 'pm') {
        fixLeafletSize('mpc');
        renderMap();
      }
    });
  });
  refreshAll();
  setInterval(() => {
    api('/api/vehicles/rapid-bus-mrtfeeder')
      .then(() => {
        renderMap();
        if (busViewMode === 'map') renderBusMap();
      })
      .catch(() => {});
  }, 30000);
  setInterval(refreshAll, 5 * 60 * 1000);

  const origSetL = window.setL;
  if (origSetL) {
    window.setL = function (l) {
      origSetL(l);
      refreshAll();
    };
  }

  const origSwitchTab = window.switchTab;
  if (origSwitchTab) {
    window.switchTab = function (id) {
      origSwitchTab(id);
      if (id === 'pm') {
        fixLeafletSize('mpc');
        renderMap();
      } else if (id === 'pb' && busViewMode === 'map') {
        fixLeafletSize('busMpc');
      }
    };
  }
});
