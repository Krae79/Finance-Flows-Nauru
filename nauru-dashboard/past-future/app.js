// Nauru Past & Future Climate Finance Dashboard.
// Loads project rows from data/projects.csv (falling back to the embedded
// data/fallback-data.js snapshot for file:// use), computes every aggregate
// in the browser, and renders eight tabs. No build step, no dependencies.
(function(){
  'use strict';

  const TRACK_PAST = 'Commonwealth Tracker (Past)';
  const TRACK_FUTURE = 'RONAdapt II Pipeline (Future)';

  // ================= CSV parsing =================
  function parseCSV(text){
    const rows = [];
    let row = [], field = '', i = 0, inQuotes = false;
    const n = text.length;
    while (i < n){
      const c = text[i];
      if (inQuotes){
        if (c === '"'){
          if (text[i+1] === '"'){ field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += c; i++; continue;
      } else {
        if (c === '"'){ inQuotes = true; i++; continue; }
        if (c === ','){ row.push(field); field = ''; i++; continue; }
        if (c === '\r'){ i++; continue; }
        if (c === '\n'){ row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
        field += c; i++; continue;
      }
    }
    if (field.length > 0 || row.length > 0){ row.push(field); rows.push(row); }
    return rows;
  }

  function csvToObjects(text){
    const rows = parseCSV(text).filter(r => !(r.length === 1 && r[0].trim() === ''));
    if (!rows.length) return [];
    const header = rows[0].map(h => h.trim());
    return rows.slice(1).map(r => {
      const o = {};
      header.forEach((h, idx) => { o[h] = r[idx] !== undefined ? r[idx] : ''; });
      return o;
    });
  }

  function toNum(s){
    if (s == null) return null;
    const t = String(s).trim();
    if (t === '') return null;
    const v = parseFloat(t.replace(/,/g, ''));
    return isNaN(v) ? null : v;
  }
  function toYear(s){
    const v = toNum(s);
    return v == null ? null : Math.round(v);
  }

  // Generic, non-institution values found in the Partners field. Excluded from
  // partner-ranking charts and tables so "who is funding it" only shows named
  // institutions. Matched case-insensitively against each comma-split token.
  const GENERIC_PARTNER_TERMS = new Set([
    '', 'mixed', 'mixed donors', 'mixed donors & gon', 'mixed donors & government',
    'ron gov', 'ron gov co-finance', 'ron government co-finance', 'ron government and mixed donors',
    'donor overheads', 'donor overhead allowances', 'donors', 'bilateral', 'bilateral donors',
    'multilateral', 'private sector', 'ngos', 'universities', 'unallocated contingency buffer',
    'bilateral & gon', 'bilateral & gon support', 'government', 'government co-finance',
    'government recurrent budget',
  ]);
  function splitPartners(raw){
    return String(raw || '').split(',').map(s => s.trim()).filter(Boolean);
  }
  function namedPartnersOnly(list){
    return list.filter(p => !GENERIC_PARTNER_TERMS.has(p.toLowerCase()));
  }

  function normalizeRow(o){
    const partnersRaw = String(o['Partners'] || '').trim();
    const partnersList = splitPartners(partnersRaw);
    const namedPartners = namedPartnersOnly(partnersList);
    const startYear = toYear(o['Start Year']);
    const endYear = toYear(o['End Year']);
    let yearLabel = '';
    if (startYear != null && endYear != null && endYear !== startYear) yearLabel = startYear + ' to ' + endYear;
    else if (startYear != null) yearLabel = String(startYear);
    else if (endYear != null) yearLabel = String(endYear);
    return {
      id: String(o['ID'] || '').trim(),
      track: String(o['Track'] || '').trim(),
      program: String(o['Program'] || '').trim() || null,
      name: String(o['Project Name'] || '').trim(),
      description: String(o['Description'] || '').trim(),
      sector: String(o['Sector'] || '').trim(),
      location: String(o['Location'] || '').trim(),
      org: String(o['Lead Organisation'] || '').trim(),
      financeInstrument: String(o['Financial Instrument'] || '').trim(),
      fundingSourceRaw: String(o['Funding Source (raw)'] || '').trim(),
      partnersRaw: partnersRaw,
      partnersList: partnersList,
      namedPartners: namedPartners,
      capitalM: toNum(o['Capital (AUD m)']),
      startYear: startYear,
      endYear: endYear,
      yearLabel: yearLabel,
      phase: String(o['Phase'] || '').trim() || null,
      status: String(o['Status'] || '').trim(),
      fundingOutcome: String(o['Funding Outcome'] || '').trim() || 'Unspecified',
      hazardGroup: String(o['Hazard Group'] || '').trim(),
      duplicateStatus: String(o['Duplicate Status'] || '').trim(),
      duplicateOf: String(o['Duplicate Of'] || '').trim(),
      notes: String(o['Notes'] || '').trim(),
    };
  }

  // ================= Data loading (Sheet CSV -> local CSV -> embedded fallback) =================
  function fetchWithTimeout(url, ms){
    const ctrl = ('AbortController' in window) ? new AbortController() : null;
    const opts = {cache: 'no-store'};
    if (ctrl) opts.signal = ctrl.signal;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), ms) : null;
    return fetch(url, opts).finally(() => { if (timer) clearTimeout(timer); });
  }

  async function loadCSVText(){
    const cfgUrl = (window.NAURU_PF_SHEET_CSV_URL || '').trim();
    if (cfgUrl){
      try {
        const res = await fetchWithTimeout(cfgUrl, 8000);
        if (res.ok){
          const t = await res.text();
          if (t && t.trim().length > 20) return {text: t, source: 'Google Sheet (live)'};
        }
      } catch (e){ console.warn('[nauru-past-future] Sheet CSV fetch failed, falling back:', e); }
    }
    try {
      const res = await fetchWithTimeout('data/projects.csv', 8000);
      if (res.ok){
        const t = await res.text();
        if (t && t.trim().length > 20) return {text: t, source: 'local file (data/projects.csv)'};
      }
    } catch (e){ console.warn('[nauru-past-future] Local CSV fetch failed, falling back:', e); }
    if (window.NAURU_PF_FALLBACK_CSV && window.NAURU_PF_FALLBACK_CSV.trim().length > 20){
      return {text: window.NAURU_PF_FALLBACK_CSV, source: 'embedded fallback (data/fallback-data.js)'};
    }
    throw new Error('No data source could be loaded: the configured sheet, the local CSV, and the embedded fallback all failed.');
  }

  // ================= Formatting helpers =================
  function fmtM(v){
    if (v == null || isNaN(v)) return 'N/A';
    return '$' + v.toFixed(2) + 'M';
  }
  function fmtCompact(v){
    if (v == null || isNaN(v)) return 'N/A';
    return v >= 1000 ? (v / 1000).toFixed(1) + 'B' : v.toFixed(0) + 'M';
  }
  function escHtml(s){ return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
  function escAttr(s){ return escHtml(s).replace(/"/g, '&quot;'); }
  function cssEsc(s){ return String(s).replace(/["\\]/g, '\\$&'); }

  // ================= Tooltip =================
  const tooltip = document.getElementById('tooltip');
  function showTip(evt, html){ tooltip.innerHTML = html; tooltip.classList.add('show'); moveTip(evt); }
  function moveTip(evt){ tooltip.style.left = evt.clientX + 'px'; tooltip.style.top = (evt.clientY - 12) + 'px'; }
  function hideTip(){ tooltip.classList.remove('show'); }

  // ================= SVG chart helpers =================
  const NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs){
    const el = document.createElementNS(NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  function renderHBar(containerId, items, opts){
    opts = opts || {};
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!items.length){ container.innerHTML = '<div class="empty-state">No data.</div>'; return; }
    const rowH = opts.rowH || 22, gap = opts.gap || 8, leftPad = opts.leftPad || 190, rightPad = 62, topPad = 6;
    const width = opts.width || 900;
    const plotW = width - leftPad - rightPad;
    const height = topPad * 2 + items.length * (rowH + gap);
    const maxVal = Math.max(1, ...items.map(d => d.value));
    const color = opts.color || 'var(--track-past)';

    const maxLabelChars = opts.maxLabelChars || Math.max(12, Math.round((leftPad - 14) / 7));
    function truncateLabel(s){
      return s.length > maxLabelChars ? s.slice(0, maxLabelChars - 1).trimEnd() + '…' : s;
    }

    const svg = svgEl('svg', {viewBox: `0 0 ${width} ${height}`, class: 'chart-svg'});
    items.forEach((d, i) => {
      const y = topPad + i * (rowH + gap);
      const w = Math.max((d.value / maxVal) * plotW, 2);
      const label = svgEl('text', {x: leftPad - 10, y: y + rowH / 2 + 4, class: 'row-label', 'text-anchor': 'end'});
      label.textContent = truncateLabel(d.label);
      const labelTitle = svgEl('title', {});
      labelTitle.textContent = d.label;
      label.appendChild(labelTitle);
      svg.appendChild(label);
      const bar = svgEl('rect', {x: leftPad, y, width: w, height: rowH, rx: 4, fill: d.color || color, class: 'bar'});
      bar.addEventListener('mousemove', e => { showTip(e, opts.tip ? opts.tip(d) : `<div class="tt-title">${escHtml(d.label)}</div><div class="tt-row"><span>Value</span><b>${fmtM(d.value)}</b></div>`); moveTip(e); });
      bar.addEventListener('mouseleave', hideTip);
      svg.appendChild(bar);
      const vt = svgEl('text', {x: leftPad + w + 8, y: y + rowH / 2 + 4, class: 'val-label'});
      vt.textContent = opts.valueFmt ? opts.valueFmt(d) : fmtM(d.value);
      svg.appendChild(vt);
    });
    container.innerHTML = '';
    container.appendChild(svg);
  }

  function renderVBar(containerId, items, opts){
    opts = opts || {};
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!items.length){ container.innerHTML = '<div class="empty-state">No data.</div>'; return; }
    const width = opts.width || 780, height = opts.height || 230;
    const leftPad = 46, rightPad = 10, topPad = 14, botPad = 40;
    const plotW = width - leftPad - rightPad, plotH = height - topPad - botPad;
    const maxVal = Math.max(...items.map(d => d.value), 1);
    const barGap = Math.max(3, Math.min(10, plotW / items.length * 0.25));
    const barW = (plotW - barGap * (items.length - 1)) / items.length;
    const color = opts.color || 'var(--track-past)';

    const svg = svgEl('svg', {viewBox: `0 0 ${width} ${height}`, class: 'chart-svg'});
    [0, 0.5, 1].forEach(f => {
      const y = topPad + plotH * (1 - f);
      svg.appendChild(svgEl('line', {x1: leftPad, x2: width - rightPad, y1: y, y2: y, class: 'gridline'}));
      const t = svgEl('text', {x: leftPad - 6, y: y + 3, class: 'axis-label', 'text-anchor': 'end'});
      t.textContent = fmtCompact(maxVal * f); svg.appendChild(t);
    });
    items.forEach((d, i) => {
      const h = (d.value / maxVal) * plotH;
      const x = leftPad + i * (barW + barGap);
      const y = topPad + plotH - h;
      const bar = svgEl('rect', {x, y, width: Math.max(barW,1), height: Math.max(h, 1), rx: 3, fill: d.color || color, class: 'bar'});
      bar.addEventListener('mousemove', e => { showTip(e, `<div class="tt-title">${escHtml(d.label)}</div><div class="tt-row"><span>Capital</span><b>${fmtM(d.value)}</b></div>${d.sub ? `<div class="tt-row"><span>${escHtml(d.sub)}</span></div>` : ''}`); moveTip(e); });
      bar.addEventListener('mouseleave', hideTip);
      svg.appendChild(bar);
      if (items.length <= 40 || i % Math.ceil(items.length/40) === 0){
        const lbl = svgEl('text', {x: x + barW / 2, y: height - botPad + 18, class: 'axis-label', 'text-anchor': 'middle'});
        lbl.textContent = d.label; svg.appendChild(lbl);
      }
    });
    container.innerHTML = '';
    container.appendChild(svg);
  }

  // Mirrored (population-pyramid style) comparison: past capital extends left,
  // future capital extends right, from a shared centre label column. A shared
  // scale (not two independent per-side scales) so bar lengths are directly
  // comparable across the whole chart, not just within one side.
  function renderMirrorBar(containerId, rows, opts){
    opts = opts || {};
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!rows.length){ container.innerHTML = '<div class="empty-state">No data.</div>'; return; }
    const width = 1040, rowH = 24, gap = 9, topPad = 8;
    const centerW = 210, sidePad = 92;
    const sideW = (width - centerW) / 2 - sidePad;
    const height = topPad * 2 + rows.length * (rowH + gap);
    const maxVal = Math.max(1, ...rows.map(r => Math.max(r.past, r.future)));
    const cx = width / 2;
    const leftEdge = cx - centerW / 2;
    const rightEdge = cx + centerW / 2;

    const svg = svgEl('svg', {viewBox: `0 0 ${width} ${height}`, class: 'chart-svg'});
    rows.forEach((r, i) => {
      const y = topPad + i * (rowH + gap);
      const label = svgEl('text', {x: cx, y: y + rowH / 2 + 4, class: 'row-label', 'text-anchor': 'middle'});
      label.textContent = r.sector;
      svg.appendChild(label);

      if (r.past > 0){
        const w = Math.max((r.past / maxVal) * sideW, 2);
        const bar = svgEl('rect', {x: leftEdge - w, y, width: w, height: rowH, rx: 3, fill: 'var(--track-past)', class: 'bar'});
        bar.addEventListener('mousemove', e => { showTip(e, `<div class="tt-title">${escHtml(r.sector)}</div><div class="tt-row"><span>Past</span><b>${fmtM(r.past)}</b></div><div class="tt-row"><span>Future</span><b>${fmtM(r.future)}</b></div>`); moveTip(e); });
        bar.addEventListener('mouseleave', hideTip);
        svg.appendChild(bar);
        const vt = svgEl('text', {x: leftEdge - w - 8, y: y + rowH / 2 + 4, class: 'val-label', 'text-anchor': 'end'});
        vt.textContent = fmtM(r.past); svg.appendChild(vt);
      }
      if (r.future > 0){
        const w = Math.max((r.future / maxVal) * sideW, 2);
        const bar = svgEl('rect', {x: rightEdge, y, width: w, height: rowH, rx: 3, fill: 'var(--track-future)', class: 'bar'});
        bar.addEventListener('mousemove', e => { showTip(e, `<div class="tt-title">${escHtml(r.sector)}</div><div class="tt-row"><span>Past</span><b>${fmtM(r.past)}</b></div><div class="tt-row"><span>Future</span><b>${fmtM(r.future)}</b></div>`); moveTip(e); });
        bar.addEventListener('mouseleave', hideTip);
        svg.appendChild(bar);
        const vt = svgEl('text', {x: rightEdge + w + 8, y: y + rowH / 2 + 4, class: 'val-label'});
        vt.textContent = fmtM(r.future); svg.appendChild(vt);
      }
    });
    container.innerHTML = '';
    container.appendChild(svg);
  }

  // ================= Aggregation =================
  const PHASE_DEFS = [
    {key: 'Phase 1 (Near-term)', order: 1, label: 'Near-term'},
    {key: 'Phase 2 (Medium-term)', order: 2, label: 'Medium-term'},
    {key: 'Phase 3 (Long-term)', order: 3, label: 'Long-term'},
  ];

  function aggBySector(rows){
    const m = new Map();
    rows.forEach(r => {
      if (!r.sector) return;
      if (!m.has(r.sector)) m.set(r.sector, {sector: r.sector, capital: 0, count: 0});
      const o = m.get(r.sector);
      if (r.capitalM != null) o.capital += r.capitalM;
      o.count++;
    });
    return Array.from(m.values()).sort((a, b) => b.capital - a.capital);
  }

  function aggByPartner(rows){
    const m = new Map();
    rows.forEach(r => {
      r.namedPartners.forEach(p => {
        if (!m.has(p)) m.set(p, {partner: p, capital: 0, mentions: 0});
        const o = m.get(p);
        if (r.capitalM != null) o.capital += r.capitalM;
        o.mentions++;
      });
    });
    return Array.from(m.values()).sort((a, b) => b.capital - a.capital);
  }

  function aggByStatus(rows){
    const m = new Map();
    rows.forEach(r => {
      const s = r.status || 'Unspecified';
      if (!m.has(s)) m.set(s, {status: s, capital: 0, count: 0});
      const o = m.get(s);
      if (r.capitalM != null) o.capital += r.capitalM;
      o.count++;
    });
    return Array.from(m.values()).sort((a, b) => b.capital - a.capital);
  }

  function aggByPhase(rows){
    return PHASE_DEFS.map(pd => {
      const rs = rows.filter(r => r.phase === pd.key);
      const capital = rs.reduce((a, r) => a + (r.capitalM || 0), 0);
      return {order: pd.order, label: pd.label, capital: capital, count: rs.length};
    });
  }

  function aggByYear(rows){
    const m = new Map();
    rows.filter(r => r.startYear != null && r.capitalM != null).forEach(r => {
      m.set(r.startYear, (m.get(r.startYear) || 0) + r.capitalM);
    });
    return Array.from(m.entries()).map(([year, capital]) => ({year, capital})).sort((a, b) => a.year - b.year);
  }

  function aggByProgram(rows){
    const m = new Map();
    rows.filter(r => r.program).forEach(r => {
      if (!m.has(r.program)) m.set(r.program, {program: r.program, sector: r.sector, capital: 0, count: 0});
      const o = m.get(r.program);
      o.capital += (r.capitalM || 0);
      o.count++;
    });
    return Array.from(m.values()).sort((a, b) => b.capital - a.capital);
  }

  function aggByHazard(rows){
    const m = new Map();
    rows.forEach(r => {
      const h = r.hazardGroup || 'Unclassified';
      if (!m.has(h)) m.set(h, {hazardGroup: h, capital: 0, count: 0});
      const o = m.get(h);
      if (r.capitalM != null) o.capital += r.capitalM;
      o.count++;
    });
    return Array.from(m.values()).sort((a, b) => b.capital - a.capital);
  }

  function yearRange(rows){
    const starts = rows.map(r => r.startYear).filter(y => y != null);
    const ends = rows.map(r => r.endYear).filter(y => y != null);
    if (!starts.length && !ends.length) return null;
    const all = starts.concat(ends);
    return {min: Math.min(...all), max: Math.max(...all)};
  }

  // Sector gap classification for the Money Flow and Gaps tab. Four labels
  // only, computed from the two capital figures, ratio = future / past.
  function classifyGap(past, future){
    if (past > 0 && future === 0) return {label: 'No RONAdapt II proposal', cls: 'gap'};
    if (future > 0 && past === 0) return {label: 'New priority', cls: 'emerging'};
    if (past === 0 && future === 0) return {label: 'None', cls: ''};
    const ratio = future / past;
    if (ratio < 0.4) return {label: 'Largely wound down', cls: 'concentration'};
    return {label: 'Broadly continued', cls: 'info'};
  }

  // ================= Application state =================
  let ROWS = null;
  let PAST_ROWS = null;
  let FUTURE_ROWS = null;

  // ================= Data status banner =================
  function showBannerLoading(){
    const b = document.getElementById('data-banner');
    b.classList.remove('is-error'); b.classList.add('is-loading');
    document.getElementById('data-banner-text').textContent = 'Loading project data\u2026';
  }
  function showBannerLoaded(source, count){
    const b = document.getElementById('data-banner');
    b.classList.remove('is-loading', 'is-error');
    document.getElementById('data-banner-text').textContent = `Data loaded from ${source}, ${count} rows.`;
  }
  function showBannerError(err){
    const b = document.getElementById('data-banner');
    b.classList.remove('is-loading'); b.classList.add('is-error');
    document.getElementById('data-banner-text').textContent = 'Could not load data: ' + (err && err.message ? err.message : String(err));
  }

  // ================= Tab routing =================
  const TABS = ['summary-past', 'past', 'summary-future', 'future', 'flows', 'sectors-past', 'sectors-future', 'duplicates', 'hazards', 'insights'];
  function applyHashRoute(){
    let tab = (location.hash || '').replace('#', '');
    if (TABS.indexOf(tab) === -1) tab = 'summary-past';
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === tab));
    document.querySelectorAll('.tab-page').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tab));
  }
  window.addEventListener('hashchange', applyHashRoute);
  document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => { location.hash = b.getAttribute('data-tab'); }));

  // ================= Simple sortable table =================
  function renderSimpleSortTable(elId, items, cols, defaultKey){
    const el = document.getElementById(elId);
    if (!el) return;
    if (!items.length){ el.innerHTML = '<div class="empty-state">No data.</div>'; return; }
    let sortKey = defaultKey, sortDir = -1;
    function draw(){
      const rows = items.slice().sort((a, b) => {
        const av = a[sortKey], bv = b[sortKey];
        return sortDir * (av > bv ? 1 : av < bv ? -1 : 0);
      });
      el.innerHTML = `<table class="data-table"><thead><tr>${cols.map(c => `<th data-key="${c.key}"${c.num ? ' style="text-align:right"' : ''} class="${sortKey === c.key ? 'sorted' : ''}">${c.label}${sortKey === c.key ? `<span class="sort-arrow">${sortDir === 1 ? '\u25b2' : '\u25bc'}</span>` : ''}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(r => `<tr>${cols.map(c => `<td${c.num ? ' class="num"' : ''}>${c.fmt ? c.fmt(r[c.key]) : escHtml(String(r[c.key]))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      el.querySelectorAll('th[data-key]').forEach(th => th.addEventListener('click', () => {
        const key = th.getAttribute('data-key');
        if (sortKey === key) sortDir *= -1; else { sortKey = key; sortDir = (key === 'sector' || key === 'partner' || key === 'status') ? 1 : -1; }
        draw();
      }));
    }
    draw();
  }

  function renderKpis(elId, defs){
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = defs.map(d => `
      <div class="kpi">
        <div class="v">${d.dot ? `<span class="dot" style="background:${d.dot}"></span>` : ''}${d.v}</div>
        <div class="l">${d.l}</div>
      </div>`).join('');
  }

  function renderCardsInto(elId, cards){
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = cards.map(c => `<div class="insight-card"><span class="badge ${c.badge}">${c.badgeLabel}</span><p>${c.text}</p></div>`).join('');
  }

  // ================= Executive Summary, Past tab =================
  function renderSummaryPastTab(){
    const pastCap = PAST_ROWS.reduce((a, r) => a + (r.capitalM || 0), 0);
    const pastYears = yearRange(PAST_ROWS);

    document.getElementById('es-past-opener').innerHTML =
      `Nauru's historical climate finance record, the Commonwealth Tracker: 85 projects and activities, <b>${fmtM(pastCap)}</b>, approved ${pastYears.min} to ${pastYears.max}.`;

    renderKpis('es-past-kpi-row', [
      {v: fmtM(pastCap), l: 'Total tracked capital'},
      {v: String(PAST_ROWS.length), l: 'Projects and activities'},
      {v: `${pastYears.min} to ${pastYears.max}`, l: 'Years covered'},
      {v: '$649.39M, 96.2%', l: 'Completed capital'},
      {v: 'Energy, $253.21M', l: 'Leading sector'},
      {v: 'ADB, $271.85M', l: 'Leading funder'},
    ]);

    const cards = [
      {badge: 'info', badgeLabel: 'Energy leads sector investment', text: `Energy accounts for <b>$253.21M</b>, 37.5 percent of tracked capital. Multi-Sector programming follows at <b>$241.05M</b> and Climate Change programming at <b>$120.78M</b>. These three sectors account for 91.1 percent of tracked capital.`},
      {badge: 'concentration', badgeLabel: 'Four institutions provide most of the funding', text: `The Asian Development Bank, Green Climate Fund, Government of Australia and Global Environment Facility contributed <b>$619.51M</b>, 91.8 percent of tracked capital, across 45 projects.`},
      {badge: 'emerging', badgeLabel: 'Nearly all approved funding is delivered', text: `<b>$649.39M</b>, 96.2 percent of tracked capital across 79 projects, is completed. <b>$25.69M</b> across 6 projects remains under implementation.`},
      {badge: 'gap', badgeLabel: 'Disaster risk reduction and coastal protection are a small share', text: `Disaster Risk Reduction and Coastal &amp; Marine investment together account for <b>$1.28M</b>, 0.2 percent of tracked capital.`},
      {badge: 'info', badgeLabel: 'Investment is concentrated in three years', text: `2005, 2012 and 2017 account for <b>$424.81M</b>, 62.9 percent of tracked capital.`},
    ];
    renderCardsInto('es-past-finding-cards', cards);
  }

  // ================= Executive Summary, Future tab =================
  function renderSummaryFutureTab(){
    const futureCap = FUTURE_ROWS.reduce((a, r) => a + (r.capitalM || 0), 0);
    const futureYears = yearRange(FUTURE_ROWS);

    document.getElementById('es-future-opener').innerHTML =
      `Nauru's proposed climate finance pipeline, RONAdapt&nbsp;II: 397 costed line items across 21 programs, <b>${fmtM(futureCap)}</b>, phased ${futureYears.min} to ${futureYears.max}. None of this capital is yet confirmed as funded.`;

    renderKpis('es-future-kpi-row', [
      {v: fmtM(futureCap), l: 'Total proposed capital'},
      {v: '397 lines, 21 programs', l: 'Line items and programs'},
      {v: `${futureYears.min} to ${futureYears.max}`, l: 'Years covered'},
      {v: 'Unspecified', l: 'Funding status, all lines'},
      {v: 'Housing & Community, $85.06M', l: 'Leading sector'},
      {v: 'ADB, $109.07M associated', l: 'Leading partner'},
    ]);

    const cards = [
      {badge: 'info', badgeLabel: 'The Higher Ground Initiative leads the pipeline', text: `The Nauru Higher Ground Initiative for Enhanced Climate Resilience accounts for <b>$85.06M</b>, 33.6 percent of proposed capital.`},
      {badge: 'concentration', badgeLabel: 'Coastal and water security lead the sector mix', text: `Housing &amp; Community, Water &amp; Sanitation and Coastal &amp; Marine investment together account for <b>$149.04M</b>, 58.9 percent of proposed capital. Coastal erosion and sea level rise is the leading hazard category at <b>$114.25M</b>, 45.2 percent.`},
      {badge: 'emerging', badgeLabel: 'Eleven partners are each associated with over $10 million', text: `The Asian Development Bank leads at <b>$109.07M</b>, followed by DFAT at <b>$85.86M</b>, JICA at <b>$51.91M</b>, the World Bank at <b>$48.60M</b> and the Green Climate Fund at <b>$48.45M</b>.`},
      {badge: 'gap', badgeLabel: 'Investment is phased across three time horizons', text: `Near term investment to 2030 totals <b>$76.20M</b>, medium term to 2035 totals <b>$75.57M</b>, long term to 2040 totals <b>$101.10M</b>.`},
      {badge: 'info', badgeLabel: 'Health is a proposed investment area', text: `RONAdapt&nbsp;II proposes <b>$10.46M</b> for health sector climate resilience, across epidemiological research, health information systems and climate proofing of health infrastructure.`},
    ];
    renderCardsInto('es-future-finding-cards', cards);
  }

  // ================= Commonwealth Tracker (Past) tab =================
  function renderPastTab(){
    const totalCap = PAST_ROWS.reduce((a, r) => a + (r.capitalM || 0), 0);
    const bySector = aggBySector(PAST_ROWS);
    const byPartner = aggByPartner(PAST_ROWS);
    const byStatus = aggByStatus(PAST_ROWS);
    const byYear = aggByYear(PAST_ROWS);
    const yr = yearRange(PAST_ROWS);

    renderKpis('pa-kpi-row', [
      {v: fmtM(totalCap), l: 'Total tracked capital', dot: 'var(--track-past)'},
      {v: String(PAST_ROWS.length), l: 'Projects and activities'},
      {v: String(byPartner.length), l: 'Funding partners named'},
      {v: `${byStatus.find(s=>s.status==='Completed') ? fmtM(byStatus.find(s=>s.status==='Completed').capital) : '$0.00M'}`, l: 'Completed capital'},
      {v: `${yr.min} to ${yr.max}`, l: 'Years spanned'},
    ]);

    renderHBar('pa-sector-chart', bySector.map(s => ({label: s.sector, value: s.capital})), {
      width: 900, leftPad: 200, color: 'var(--track-past)',
      tip: d => { const s = bySector.find(x => x.sector === d.label); return `<div class="tt-title">${escHtml(s.sector)}</div><div class="tt-row"><span>Capital</span><b>${fmtM(s.capital)}</b></div><div class="tt-row"><span>Projects</span><b>${s.count}</b></div>`; },
    });
    renderSimpleSortTable('pa-sector-table', bySector, [
      {key: 'sector', label: 'Sector'}, {key: 'count', label: 'Projects', num: true}, {key: 'capital', label: 'Capital', num: true, fmt: fmtM},
    ], 'capital');

    renderHBar('pa-partner-chart', byPartner.slice(0, 12).map(p => ({label: p.partner, value: p.capital})), {
      width: 900, leftPad: 210, color: 'var(--track-past)',
      tip: d => { const p = byPartner.find(x => x.partner === d.label); return `<div class="tt-title">${escHtml(p.partner)}</div><div class="tt-row"><span>Associated capital</span><b>${fmtM(p.capital)}</b></div><div class="tt-row"><span>Projects mentioning</span><b>${p.mentions}</b></div>`; },
    });
    renderSimpleSortTable('pa-partner-table', byPartner, [
      {key: 'partner', label: 'Funding source'}, {key: 'mentions', label: 'Projects', num: true}, {key: 'capital', label: 'Capital', num: true, fmt: fmtM},
    ], 'capital');

    renderHBar('pa-status-chart', byStatus.map(s => ({label: s.status, value: s.capital})), {
      width: 560, leftPad: 200, color: 'var(--track-past)',
      tip: d => { const s = byStatus.find(x => x.status === d.label); return `<div class="tt-title">${escHtml(s.status)}</div><div class="tt-row"><span>Capital</span><b>${fmtM(s.capital)}</b></div><div class="tt-row"><span>Projects</span><b>${s.count}</b></div>`; },
    });

    renderVBar('pa-year-chart', byYear.map(y => ({label: String(y.year), value: y.capital})), {width: 780, color: 'var(--track-past)'});

    // Full project table
    const sectorSel = document.getElementById('pa-sector-filter');
    const statusSel = document.getElementById('pa-status-filter');
    const searchEl = document.getElementById('pa-search');
    const sectors = Array.from(new Set(PAST_ROWS.map(r => r.sector).filter(Boolean))).sort();
    sectorSel.innerHTML = '<option value="">All sectors</option>' + sectors.map(s => `<option value="${escAttr(s)}">${escHtml(s)}</option>`).join('');
    const statuses = Array.from(new Set(PAST_ROWS.map(r => r.status).filter(Boolean))).sort();
    statusSel.innerHTML = '<option value="">All statuses</option>' + statuses.map(s => `<option value="${escAttr(s)}">${escHtml(s)}</option>`).join('');

    let sortKey = 'capitalM', sortDir = -1;
    function filtered(){
      const q = searchEl.value.trim().toLowerCase();
      return PAST_ROWS.filter(r => {
        if (sectorSel.value && r.sector !== sectorSel.value) return false;
        if (statusSel.value && r.status !== statusSel.value) return false;
        if (q && !r.name.toLowerCase().includes(q)) return false;
        return true;
      });
    }
    function draw(){
      let rows = filtered();
      rows = rows.slice().sort((a, b) => {
        const pick = r => sortKey === 'capitalM' ? (r.capitalM == null ? -Infinity : r.capitalM) : (r[sortKey] || '');
        const av = pick(a), bv = pick(b);
        return sortDir * (av > bv ? 1 : av < bv ? -1 : 0);
      });
      document.getElementById('pa-count').textContent = `${rows.length} of ${PAST_ROWS.length} rows`;
      const cols = [
        {key: 'name', label: 'Project name'}, {key: 'sector', label: 'Sector'}, {key: 'financeInstrument', label: 'Financial instrument'},
        {key: 'fundingSourceRaw', label: 'Funding source'}, {key: 'capitalM', label: 'Capital', num: true},
        {key: 'startYear', label: 'Start year', num: true}, {key: 'endYear', label: 'End year', num: true}, {key: 'status', label: 'Status'},
      ];
      let html = `<table class="data-table"><thead><tr>${cols.map(c => `<th data-key="${c.key}"${c.num ? ' style="text-align:right"' : ''} class="${sortKey === c.key ? 'sorted' : ''}">${c.label}${sortKey === c.key ? `<span class="sort-arrow">${sortDir === 1 ? '\u25b2' : '\u25bc'}</span>` : ''}</th>`).join('')}</tr></thead><tbody>`;
      if (!rows.length){
        html += `<tr><td colspan="${cols.length}"><div class="empty-state">No rows match the current filters.</div></td></tr>`;
      } else {
        rows.forEach(r => {
          const themeNote = r.notes ? escAttr(r.notes) : '';
          html += `<tr>
            <td><abbr class="note-flag" title="${themeNote}">${escHtml(r.name)}</abbr></td>
            <td><span class="sector-chip">${escHtml(r.sector || 'Unspecified')}</span></td>
            <td>${escHtml(r.financeInstrument || 'Unspecified')}</td>
            <td>${escHtml(r.fundingSourceRaw || 'Unspecified')}</td>
            <td class="num">${fmtM(r.capitalM)}</td>
            <td class="num">${r.startYear != null ? r.startYear : 'Unspecified'}</td>
            <td class="num">${r.endYear != null ? r.endYear : 'Unspecified'}</td>
            <td>${escHtml(r.status || 'Unspecified')}</td>
          </tr>`;
        });
      }
      html += '</tbody></table>';
      document.getElementById('pa-table').innerHTML = html;
      document.querySelectorAll('#pa-table th[data-key]').forEach(th => th.addEventListener('click', () => {
        const key = th.getAttribute('data-key');
        if (sortKey === key) sortDir *= -1; else { sortKey = key; sortDir = key === 'capitalM' ? -1 : 1; }
        draw();
      }));
    }
    [sectorSel, statusSel].forEach(el => el.addEventListener('change', draw));
    searchEl.addEventListener('input', draw);
    draw();
  }

  // ================= RONAdapt II Priorities (Future) tab =================
  let futureExpandedProgram = null;
  function renderProgramTable(byProgram, subItemsFn){
    const tableEl = document.getElementById('fu-program-table');
    let sortKey = 'capital', sortDir = -1;
    function draw(){
      if (!byProgram.length){ tableEl.innerHTML = '<div class="empty-state">No activities in the current data.</div>'; return; }
      const programs = byProgram.slice().sort((a, b) => sortDir * (a[sortKey] > b[sortKey] ? 1 : a[sortKey] < b[sortKey] ? -1 : 0));
      const maxCap = Math.max(1, ...byProgram.map(p => p.capital));
      let html = `<table class="data-table"><thead><tr>
        <th data-key="program">Priority activity</th><th data-key="sector">Sector</th>
        <th data-key="capital" style="text-align:right">Proposed capital</th><th style="width:120px"></th>
        <th data-key="count" style="text-align:right">Sub-projects</th></tr></thead><tbody>`;
      programs.forEach(p => {
        const isOpen = futureExpandedProgram === p.program;
        html += `<tr class="prog-row ${isOpen ? 'expanded' : ''}" data-program="${escAttr(p.program)}">
          <td><span class="expand-icon">&#9656;</span>${escHtml(p.program)}</td>
          <td><span class="sector-chip">${escHtml(p.sector || 'Unspecified')}</span></td>
          <td class="num">${fmtM(p.capital)}</td>
          <td><div class="cap-bar-track"><div class="cap-bar-fill" style="width:${(p.capital / maxCap * 100).toFixed(1)}%"></div></div></td>
          <td class="num">${p.count}</td></tr>
        <tr class="subrow" data-for="${escAttr(p.program)}"><td colspan="5"><div class="subrow-inner"></div></td></tr>`;
      });
      html += '</tbody></table>';
      tableEl.innerHTML = html;
      tableEl.querySelectorAll('thead th[data-key]').forEach(th => th.addEventListener('click', () => {
        const key = th.getAttribute('data-key');
        if (sortKey === key) sortDir *= -1; else { sortKey = key; sortDir = (key === 'program' || key === 'sector') ? 1 : -1; }
        draw();
      }));
      tableEl.querySelectorAll('tr.prog-row').forEach(tr => {
        tr.addEventListener('click', () => {
          const program = tr.getAttribute('data-program');
          futureExpandedProgram = futureExpandedProgram === program ? null : program;
          draw();
          if (futureExpandedProgram){
            const subInner = tableEl.querySelector(`.subrow[data-for="${cssEsc(futureExpandedProgram)}"] .subrow-inner`);
            const subs = subItemsFn(futureExpandedProgram).slice().sort((a, b) => (b.capitalM || 0) - (a.capitalM || 0));
            subInner.innerHTML = subs.map(s => `
              <div class="sub-item">
                <div class="si-name">${escHtml(s.name)}</div>
                <div class="si-phase">${escHtml((s.phase || 'Not phased').replace(/\s*\(.*\)/, ''))}</div>
                <div class="si-partners">${escHtml(s.fundingSourceRaw || 'Unspecified')}</div>
                <div class="si-cap">${fmtM(s.capitalM)}</div>
              </div>`).join('');
          }
        });
      });
    }
    draw();
  }

  function renderFutureTab(){
    const totalCap = FUTURE_ROWS.reduce((a, r) => a + (r.capitalM || 0), 0);
    const bySector = aggBySector(FUTURE_ROWS);
    const byPartner = aggByPartner(FUTURE_ROWS);
    const byProgram = aggByProgram(FUTURE_ROWS);
    const byPhase = aggByPhase(FUTURE_ROWS);

    renderKpis('fu-kpi-row', [
      {v: fmtM(totalCap), l: 'Total proposed capital', dot: 'var(--track-future)'},
      {v: String(byProgram.length), l: 'Priority activities (programs)'},
      {v: String(FUTURE_ROWS.length), l: 'Costed line items'},
      {v: String(byPartner.length), l: 'Funding partners named'},
      {v: `${byPhase[2].capital ? (byPhase[2].capital/totalCap*100).toFixed(0) : '0'}%`, l: 'In long-term horizon'},
    ]);

    renderHBar('fu-sector-chart', bySector.map(s => ({label: s.sector, value: s.capital})), {
      width: 900, leftPad: 200, color: 'var(--track-future)',
      tip: d => { const s = bySector.find(x => x.sector === d.label); return `<div class="tt-title">${escHtml(s.sector)}</div><div class="tt-row"><span>Capital</span><b>${fmtM(s.capital)}</b></div><div class="tt-row"><span>Line items</span><b>${s.count}</b></div>`; },
    });
    renderSimpleSortTable('fu-sector-table', bySector, [
      {key: 'sector', label: 'Sector'}, {key: 'count', label: 'Line items', num: true}, {key: 'capital', label: 'Capital', num: true, fmt: fmtM},
    ], 'capital');

    renderHBar('fu-partner-chart', byPartner.slice(0, 12).map(p => ({label: p.partner, value: p.capital})), {
      width: 900, leftPad: 210, color: 'var(--track-future)',
      tip: d => { const p = byPartner.find(x => x.partner === d.label); return `<div class="tt-title">${escHtml(p.partner)}</div><div class="tt-row"><span>Associated capital</span><b>${fmtM(p.capital)}</b></div><div class="tt-row"><span>Lines mentioning</span><b>${p.mentions}</b></div>`; },
    });
    renderSimpleSortTable('fu-partner-table', byPartner, [
      {key: 'partner', label: 'Partner'}, {key: 'mentions', label: 'Lines', num: true}, {key: 'capital', label: 'Capital', num: true, fmt: fmtM},
    ], 'capital');

    renderVBar('fu-phase-chart', byPhase.map(p => ({label: p.label, value: p.capital, sub: p.count + ' lines'})), {width: 460, color: 'var(--track-future)'});

    futureExpandedProgram = null;
    renderProgramTable(byProgram, program => FUTURE_ROWS.filter(r => r.program === program));
  }

  // ================= Money Flow and Gaps tab =================
  function combinedSectorRows(){
    const pastMap = new Map(aggBySector(PAST_ROWS).map(s => [s.sector, s.capital]));
    const futMap = new Map(aggBySector(FUTURE_ROWS).map(s => [s.sector, s.capital]));
    const allSectors = Array.from(new Set([...pastMap.keys(), ...futMap.keys()]));
    return allSectors.map(sector => ({
      sector, past: pastMap.get(sector) || 0, future: futMap.get(sector) || 0,
    })).sort((a, b) => (b.past + b.future) - (a.past + a.future));
  }

  function renderFlowsTab(){
    const rows = combinedSectorRows();
    renderMirrorBar('flow-mirror', rows, {});

    let html = `<table class="data-table"><thead><tr><th>Sector</th><th style="text-align:right">Past capital</th><th style="text-align:right">Future capital</th><th>Gap</th></tr></thead><tbody>`;
    rows.forEach(r => {
      const g = classifyGap(r.past, r.future);
      const cell = g.cls ? `<span class="gap-chip ${g.cls}">${escHtml(g.label)}</span>` : `<span class="row-sub">${escHtml(g.label)}</span>`;
      html += `<tr><td>${escHtml(r.sector)}</td><td class="num">${fmtM(r.past)}</td><td class="num">${fmtM(r.future)}</td><td>${cell}</td></tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('gaps-table').innerHTML = html;
  }

  // ================= Sectors, Past tab =================
  function renderSectorsPastTab(){
    const bySector = aggBySector(PAST_ROWS);
    renderHBar('sec-past-chart', bySector.map(s => ({label: s.sector, value: s.capital})), {
      width: 900, leftPad: 200, color: 'var(--track-past)',
      tip: d => { const s = bySector.find(x => x.sector === d.label); return `<div class="tt-title">${escHtml(s.sector)}</div><div class="tt-row"><span>Capital</span><b>${fmtM(s.capital)}</b></div><div class="tt-row"><span>Projects</span><b>${s.count}</b></div>`; },
    });
    renderSimpleSortTable('sec-past-table', bySector, [
      {key: 'sector', label: 'Sector'}, {key: 'count', label: 'Projects', num: true}, {key: 'capital', label: 'Capital', num: true, fmt: fmtM},
    ], 'capital');
  }

  // ================= Sectors, Future tab =================
  function renderSectorsFutureTab(){
    const bySector = aggBySector(FUTURE_ROWS);
    renderHBar('sec-future-chart', bySector.map(s => ({label: s.sector, value: s.capital})), {
      width: 900, leftPad: 200, color: 'var(--track-future)',
      tip: d => { const s = bySector.find(x => x.sector === d.label); return `<div class="tt-title">${escHtml(s.sector)}</div><div class="tt-row"><span>Capital</span><b>${fmtM(s.capital)}</b></div><div class="tt-row"><span>Line items</span><b>${s.count}</b></div>`; },
    });
    renderSimpleSortTable('sec-future-table', bySector, [
      {key: 'sector', label: 'Sector'}, {key: 'count', label: 'Line items', num: true}, {key: 'capital', label: 'Capital', num: true, fmt: fmtM},
    ], 'capital');
  }

  // ================= Duplicates tab =================
  function renderDuplicatesTab(){
    const pastCap = PAST_ROWS.reduce((a, r) => a + (r.capitalM || 0), 0);
    const futureCap = FUTURE_ROWS.reduce((a, r) => a + (r.capitalM || 0), 0);
    const flaggedRows = ROWS.filter(r => r.duplicateStatus);

    document.getElementById('dup-summary').innerHTML = `
      <div class="kpi"><div class="v">${ROWS.length}</div><div class="l">Rows checked by name (${PAST_ROWS.length} past &middot; ${FUTURE_ROWS.length} future)</div></div>
      <div class="kpi"><div class="v">${flaggedRows.length}</div><div class="l">Rows flagged with a Duplicate Status</div></div>
      <div class="kpi"><div class="v">${fmtM(pastCap + futureCap)}</div><div class="l">Combined total, both tracks, no exclusions</div></div>`;

    document.getElementById('dup-body').innerHTML = `
      <div class="insight-card" style="margin-bottom:14px;">
        <span class="badge emerging">No confirmed duplicate</span>
        <p>No project name in the Commonwealth Tracker (85 rows) matches any RONAdapt&nbsp;II program or sub-project name (397 rows). Every row's <code>Duplicate Status</code> field is blank, so no row is flagged as a confirmed or possible overlap. The combined total across both tracks, <b>${fmtM(pastCap + futureCap)}</b>, is therefore not adjusted for any exclusion.</p>
      </div>
      <div class="insight-card">
        <span class="badge gap">Limitation, disclosed not papered over</span>
        <p>This check compares project names only, not amounts or themes. It cannot detect a past project and a future proposal that describe the same underlying work under different names or at a different level of granularity, for example a flagship programme costed as a rough placeholder in one track and again, in detail, under a different name in the other. Anyone using this analysis to plan new commitments should treat the absence of a name match as reassuring but not conclusive.</p>
      </div>`;
  }

  // ================= Hazards & Funding Outcomes tab =================
  function renderHazardsTab(){
    const pastHaz = aggByHazard(PAST_ROWS);
    const futHaz = aggByHazard(FUTURE_ROWS);
    renderHBar('ha-past-chart', pastHaz.map(h => ({label: h.hazardGroup, value: h.capital})), {
      width: 480, leftPad: 210, color: 'var(--track-past)',
      tip: d => { const h = pastHaz.find(x => x.hazardGroup === d.label); return `<div class="tt-title">${escHtml(h.hazardGroup)}</div><div class="tt-row"><span>Capital</span><b>${fmtM(h.capital)}</b></div><div class="tt-row"><span>Projects</span><b>${h.count}</b></div>`; },
    });
    renderHBar('ha-future-chart', futHaz.map(h => ({label: h.hazardGroup, value: h.capital})), {
      width: 480, leftPad: 210, color: 'var(--track-future)',
      tip: d => { const h = futHaz.find(x => x.hazardGroup === d.label); return `<div class="tt-title">${escHtml(h.hazardGroup)}</div><div class="tt-row"><span>Capital</span><b>${fmtM(h.capital)}</b></div><div class="tt-row"><span>Line items</span><b>${h.count}</b></div>`; },
    });

    const byStatus = aggByStatus(PAST_ROWS);
    renderHBar('ha-past-status-chart', byStatus.map(s => ({label: s.status, value: s.capital})), {
      width: 480, leftPad: 210, color: 'var(--track-past)',
      tip: d => { const s = byStatus.find(x => x.status === d.label); return `<div class="tt-title">${escHtml(s.status)}</div><div class="tt-row"><span>Capital</span><b>${fmtM(s.capital)}</b></div><div class="tt-row"><span>Projects</span><b>${s.count}</b></div>`; },
    });

    const futureOutcomes = new Set(FUTURE_ROWS.map(r => r.fundingOutcome));
    const futureCap = FUTURE_ROWS.reduce((a, r) => a + (r.capitalM || 0), 0);
    const allUnspecified = futureOutcomes.size === 1 && futureOutcomes.has('Unspecified');
    document.getElementById('ha-future-outcome').innerHTML = `
      <span class="na-title">All 397 line items are Unspecified</span>
      <p>${allUnspecified ? `Every RONAdapt&nbsp;II line item, covering all ${fmtM(futureCap)} of proposed capital, carries a Funding Outcome of &ldquo;Unspecified&rdquo;. The source data does not record funded or unfunded status for the pipeline, so this is stated plainly rather than shown as a chart with a single category.` : 'Funding Outcome values are mixed in the current data.'}</p>`;
  }

  // ================= Past vs Future Insights tab =================
  function renderInsightsTab(){
    const findings = [
      {
        n: 1, title: 'Funder continuity and diversification',
        html: `<p>ADB and GCF are the two institutions bridging both eras. ADB alone accounts for <b>$271.85M</b>, 40.3 percent of tracked past capital, and is also the single largest named partner in the RONAdapt&nbsp;II pipeline at <b>$109.07M</b> of associated capital. The future pipeline broadens the funder base considerably. DFAT, JICA, MFAT, SPC, UNDP and SPREP all appear prominently as named future partners despite barely featuring in the historical record, a sign the pipeline is built around a wider circle of bilateral and Pacific regional institutions rather than the three or four multilateral funders that carried most of the past three decades.</p>`,
      },
      {
        n: 2, title: 'A shift from energy to coastal and shelter',
        html: `<p>Energy was the largest single sector in the historical record at <b>$253.21M</b>, 37.5 percent of tracked past capital, but falls to fifth place in the pipeline at <b>$22.89M</b>, 9.1 percent of proposed future capital. In its place, Housing &amp; Community, led overwhelmingly by the Nauru Higher Ground Initiative, and Coastal &amp; Marine together account for <b>$114.25M</b>, 45.2 percent of proposed future capital. The hazard data tells the same story from a different angle. Coastal erosion and sea level rise barely register in the historical hazard framing at <b>$0.50M</b>, 0.1 percent, then become the single largest hazard category in the pipeline at <b>$114.25M</b>, 45.2 percent.</p>`,
      },
      {
        n: 3, title: 'Nearly all historical funding is already realised',
        html: `<p>79 of the 85 Commonwealth Tracker projects, 92.9 percent of the count and 96.2 percent of the tracked capital at <b>$649.39M</b> of <b>$675.08M</b>, are recorded as completed. Only six projects, worth <b>$25.69M</b> combined, remain under implementation or open ended. Nauru's past climate finance relationship is, on the record, largely a closed book, most of what was committed at scale has already been delivered.</p>`,
      },
      {
        n: 4, title: 'The pipeline is far more granular but a fraction of the historical value',
        html: `<p>397 proposed line items sit against 85 historical projects, yet total proposed capital of <b>$252.87M</b> is well under half the <b>$675.08M</b> already tracked historically. The two datasets are not directly comparable line for line, the pipeline breaks large ambitions into costed sub-components while the historical tracker records completed grant agreements at their full committed value, but the combined figure across both eras, <b>$927.95M</b>, gives a sense of the total scale of climate finance now associated with Nauru.</p>`,
      },
      {
        n: 5, title: 'Health is an entirely new priority with no historical precedent',
        html: `<p>No project in the Commonwealth Tracker is recorded against a health-specific theme. The RONAdapt&nbsp;II pipeline introduces Health as an explicit sector for the first time at <b>$10.46M</b>, built around two dedicated programs, climate-health epidemiological resilience and health sector climate proofing. This is a genuinely new area of proposed investment rather than a continuation of past work.</p>`,
      },
      {
        n: 6, title: 'Disaster risk reduction grows sharply in dollar terms but stays a modest share',
        html: `<p>Past DRR capital was <b>$0.78M</b>, 0.1 percent of tracked capital. Future DRR capital is <b>$26.68M</b>, 10.6 percent of proposed capital, a thirty four fold increase in absolute terms. Even so, DRR remains outside the top three sectors in the pipeline, behind Housing &amp; Community, Water &amp; Sanitation and Coastal &amp; Marine, suggesting multi-hazard early warning and preparedness work is being scaled up substantially without yet becoming the dominant investment theme.</p>`,
      },
      {
        n: 7, title: 'A limitation worth stating plainly',
        html: `<p>This comparison checks project names only. No name in the Commonwealth Tracker matches a RONAdapt&nbsp;II program or sub-project name, so no confirmed duplicate exists between the two tracks on that basis. This check cannot detect a past project and a future proposal that describe the same underlying work under different names or different levels of granularity. Anyone using this analysis to plan new commitments should treat the absence of a name match as reassuring but not conclusive.</p>`,
      },
    ];
    const html = findings.map(f => `
      <section class="panel finding-panel">
        <div class="finding-head"><span class="finding-num">Finding ${f.n}</span><h3 class="finding-title">${escHtml(f.title)}</h3></div>
        ${f.html}
      </section>`).join('');
    document.getElementById('insights-body').innerHTML = html;
  }

  // ================= Boot =================
  async function boot(){
    showBannerLoading();
    try {
      const {text, source} = await loadCSVText();
      const objs = csvToObjects(text);
      ROWS = objs.map(normalizeRow).filter(r => r.id);
      PAST_ROWS = ROWS.filter(r => r.track === TRACK_PAST);
      FUTURE_ROWS = ROWS.filter(r => r.track === TRACK_FUTURE);
      showBannerLoaded(source, ROWS.length);

      renderSummaryPastTab();
      renderPastTab();
      renderSummaryFutureTab();
      renderFutureTab();
      renderFlowsTab();
      renderSectorsPastTab();
      renderSectorsFutureTab();
      renderDuplicatesTab();
      renderHazardsTab();
      renderInsightsTab();

      applyHashRoute();
    } catch (err){
      console.error(err);
      showBannerError(err);
    }
  }

  document.getElementById('data-reload-btn').addEventListener('click', () => { boot(); });
  boot();

})();
