// Finance Flows Dashboard Nauru — live edition.
// Loads project rows from a CSV (Google Sheet publish-to-web link, then local
// data/projects.csv, then the embedded data/fallback-data.js snapshot), computes
// every aggregate in the browser, and renders five tabs plus a rule-based chatbot.
// No build step, no external dependencies.
(function(){
  'use strict';

  // ================= CSV parsing =================
  // Minimal RFC4180-ish parser: handles quoted fields containing commas/newlines
  // and doubled "" escapes. No external library.
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

  function normalizeRow(o){
    const partners = String(o['Partners'] || '').split(';').map(s => s.trim()).filter(Boolean);
    const startYear = toYear(o['Start Year']);
    const endYear = toYear(o['End Year']);
    let yearLabel = '';
    if (startYear != null && endYear != null && endYear !== startYear) yearLabel = startYear + '\u2013' + endYear;
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
      partners: partners,
      capitalM: toNum(o['Capital (AUD m)']),
      startYear: startYear,
      endYear: endYear,
      yearLabel: yearLabel,
      phase: String(o['Phase'] || '').trim() || null,
      status: String(o['Status'] || '').trim(),
      fundingOutcome: String(o['Funding Outcome'] || '').trim() || 'Unspecified',
      hazard: String(o['Hazard (recorded)'] || '').trim(),
      hazardGroup: String(o['Hazard Group'] || '').trim(),
      hazardSource: String(o['Hazard Source'] || '').trim(),
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
    const cfgUrl = (window.NAURU_SHEET_CSV_URL || '').trim();
    if (cfgUrl){
      try {
        const res = await fetchWithTimeout(cfgUrl, 8000);
        if (res.ok){
          const t = await res.text();
          if (t && t.trim().length > 20) return {text: t, source: 'Google Sheet (live)'};
        }
      } catch (e){ console.warn('[nauru-dashboard] Sheet CSV fetch failed, falling back:', e); }
    }
    try {
      const res = await fetchWithTimeout('data/projects.csv', 8000);
      if (res.ok){
        const t = await res.text();
        if (t && t.trim().length > 20) return {text: t, source: 'local file (data/projects.csv)'};
      }
    } catch (e){ console.warn('[nauru-dashboard] Local CSV fetch failed, falling back:', e); }
    if (window.NAURU_FALLBACK_CSV && window.NAURU_FALLBACK_CSV.trim().length > 20){
      return {text: window.NAURU_FALLBACK_CSV, source: 'embedded fallback (data/fallback-data.js)'};
    }
    throw new Error('No data source could be loaded: the configured sheet, the local CSV, and the embedded fallback all failed.');
  }

  // ================= Aggregation =================
  const PHASE_DEFS = [
    {key: 'Phase 1 (Near-term)', order: 1, label: 'Near-term'},
    {key: 'Phase 2 (Medium-term)', order: 2, label: 'Medium-term'},
    {key: 'Phase 3 (Long-term)', order: 3, label: 'Long-term'},
  ];
  const OUTCOME_KEYS = ['Funded', 'Seeking funding', 'Unsuccessful', 'Unspecified'];

  function median(sortedAsc){
    const n = sortedAsc.length;
    if (!n) return 0;
    const mid = Math.floor(n / 2);
    return n % 2 ? sortedAsc[mid] : (sortedAsc[mid - 1] + sortedAsc[mid]) / 2;
  }

  function computeAll(rows){
    const trackSet = Array.from(new Set(rows.map(r => r.track).filter(Boolean)));
    const TRACK_PIPELINE = trackSet.find(t => /pipeline/i.test(t)) || trackSet[1] || trackSet[0] || 'Pipeline';
    const TRACK_EXISTING = trackSet.find(t => t !== TRACK_PIPELINE) || trackSet[0] || 'Existing';
    const tracks = [TRACK_EXISTING, TRACK_PIPELINE];

    // ---- bySector ----
    const sectorMap = new Map();
    function ensureSector(name){
      if (!sectorMap.has(name)){
        const o = {sector: name, totalCapital: 0, totalCount: 0, hazardGroups: new Set(), partners: new Set()};
        o[TRACK_EXISTING] = {capital: 0, count: 0};
        o[TRACK_PIPELINE] = {capital: 0, count: 0};
        sectorMap.set(name, o);
      }
      return sectorMap.get(name);
    }
    rows.forEach(r => {
      if (!r.sector) return;
      const s = ensureSector(r.sector);
      const bucket = r.track === TRACK_EXISTING ? s[TRACK_EXISTING] : s[TRACK_PIPELINE];
      bucket.count++;
      if (r.capitalM != null) bucket.capital += r.capitalM;
      if (r.hazardGroup) s.hazardGroups.add(r.hazardGroup);
      r.partners.forEach(p => s.partners.add(p));
    });
    sectorMap.forEach(s => {
      s.totalCapital = s[TRACK_EXISTING].capital + s[TRACK_PIPELINE].capital;
      s.totalCount = s[TRACK_EXISTING].count + s[TRACK_PIPELINE].count;
    });
    const bySector = Array.from(sectorMap.values()).sort((a, b) => b.totalCapital - a.totalCapital);

    // ---- byPartner ----
    const partnerMap = new Map();
    rows.forEach(r => {
      r.partners.forEach(p => {
        if (!partnerMap.has(p)){
          const o = {partner: p, mentions: 0, capital: 0, tracks: {}, capitalByTrack: {}, sectors: new Set()};
          o.tracks[TRACK_EXISTING] = 0; o.tracks[TRACK_PIPELINE] = 0;
          o.capitalByTrack[TRACK_EXISTING] = 0; o.capitalByTrack[TRACK_PIPELINE] = 0;
          partnerMap.set(p, o);
        }
        const o = partnerMap.get(p);
        o.mentions++;
        if (r.capitalM != null) o.capital += r.capitalM;
        o.tracks[r.track] = (o.tracks[r.track] || 0) + 1;
        if (r.capitalM != null) o.capitalByTrack[r.track] = (o.capitalByTrack[r.track] || 0) + r.capitalM;
        if (r.sector) o.sectors.add(r.sector);
      });
    });
    const byPartner = Array.from(partnerMap.values()).sort((a, b) => b.capital - a.capital);

    // ---- yearSeries (existing track only) ----
    const yearMap = new Map();
    rows.filter(r => r.track === TRACK_EXISTING && r.startYear != null && r.capitalM != null).forEach(r => {
      yearMap.set(r.startYear, (yearMap.get(r.startYear) || 0) + r.capitalM);
    });
    const yearSeries = Array.from(yearMap.entries()).map(([year, capital]) => ({year, capital})).sort((a, b) => a.year - b.year);

    // ---- phaseSeries (pipeline track only) ----
    const phaseSeries = PHASE_DEFS.map(pd => {
      const rs = rows.filter(r => r.track === TRACK_PIPELINE && r.phase === pd.key);
      const capital = rs.reduce((a, r) => a + (r.capitalM || 0), 0);
      const years = [];
      rs.forEach(r => { if (r.startYear != null) years.push(r.startYear); if (r.endYear != null) years.push(r.endYear); });
      const sub = years.length ? (Math.min(...years) + '\u2013' + Math.max(...years)) : '';
      return {order: pd.order, label: pd.label, sub: sub, capital: capital, count: rs.length};
    });

    // ---- sectorByPhase (pipeline track only) ----
    const sbpMap = new Map();
    rows.filter(r => r.track === TRACK_PIPELINE && r.sector).forEach(r => {
      if (!sbpMap.has(r.sector)) sbpMap.set(r.sector, {sector: r.sector, phase1: 0, phase2: 0, phase3: 0, total: 0});
      const o = sbpMap.get(r.sector);
      const v = r.capitalM || 0;
      if (r.phase === PHASE_DEFS[0].key) o.phase1 += v;
      else if (r.phase === PHASE_DEFS[1].key) o.phase2 += v;
      else if (r.phase === PHASE_DEFS[2].key) o.phase3 += v;
      o.total += v;
    });
    const sectorByPhase = Array.from(sbpMap.values()).filter(s => s.total > 0).sort((a, b) => b.total - a.total);

    // ---- byProgram (pipeline track only) ----
    const progMap = new Map();
    rows.filter(r => r.track === TRACK_PIPELINE && r.program).forEach(r => {
      if (!progMap.has(r.program)) progMap.set(r.program, {program: r.program, sector: r.sector, capital: 0, count: 0});
      const o = progMap.get(r.program);
      o.capital += (r.capitalM || 0);
      o.count++;
    });
    const byProgram = Array.from(progMap.values()).sort((a, b) => b.capital - a.capital);

    // ---- byLocation (existing track only) ----
    const locMap = new Map();
    rows.filter(r => r.track === TRACK_EXISTING && r.location).forEach(r => {
      if (!locMap.has(r.location)) locMap.set(r.location, {location: r.location, capital: 0, count: 0});
      const o = locMap.get(r.location);
      if (r.capitalM != null) o.capital += r.capitalM;
      o.count++;
    });
    const byLocation = Array.from(locMap.values()).sort((a, b) => b.capital - a.capital);

    // ---- byStatus (existing track only) ----
    const statusMap = new Map();
    rows.filter(r => r.track === TRACK_EXISTING).forEach(r => {
      const s = r.status || 'Unspecified';
      if (!statusMap.has(s)) statusMap.set(s, {status: s, capital: 0, count: 0});
      const o = statusMap.get(s);
      if (r.capitalM != null) o.capital += r.capitalM;
      o.count++;
    });
    const byStatus = Array.from(statusMap.values()).sort((a, b) => b.capital - a.capital);

    // ---- kpis ----
    const existingRows = rows.filter(r => r.track === TRACK_EXISTING);
    const pipelineRows = rows.filter(r => r.track === TRACK_PIPELINE);
    const existingCapital = existingRows.reduce((a, r) => a + (r.capitalM || 0), 0);
    const pipelineCapital = pipelineRows.reduce((a, r) => a + (r.capitalM || 0), 0);
    const kpis = {
      existingCapital, existingCount: existingRows.length,
      pipelineCapital, pipelineCount: pipelineRows.length,
      pipelinePrograms: byProgram.length,
      partnersCount: partnerMap.size,
      sectorsCount: bySector.length,
    };

    // ---- insights ----
    const top3Sectors = bySector.slice(0, 3).map(s => ({sector: s.sector, capital: s.totalCapital}));
    const totalAllSectorCap = bySector.reduce((a, s) => a + s.totalCapital, 0);
    const top3Share = totalAllSectorCap ? top3Sectors.reduce((a, s) => a + s.capital, 0) / totalAllSectorCap * 100 : 0;
    const bottom3Sectors = bySector.slice().sort((a, b) => a.totalCapital - b.totalCapital).slice(0, 3).map(s => ({sector: s.sector, capital: s.totalCapital}));
    const topPartner = byPartner[0] ? {name: byPartner[0].partner, capital: byPartner[0].capital, mentions: byPartner[0].mentions} : {name: '\u2013', capital: 0, mentions: 0};
    const totalPartnerCap = byPartner.reduce((a, p) => a + p.capital, 0);
    const top3PartnerShare = totalPartnerCap ? byPartner.slice(0, 3).reduce((a, p) => a + p.capital, 0) / totalPartnerCap * 100 : 0;
    const existingHeavyLowPipeline = bySector
      .filter(s => s[TRACK_EXISTING].capital > 0 && s[TRACK_PIPELINE].capital < s[TRACK_EXISTING].capital * 0.2)
      .sort((a, b) => b[TRACK_EXISTING].capital - a[TRACK_EXISTING].capital)
      .slice(0, 3)
      .map(s => ({sector: s.sector, existing: s[TRACK_EXISTING].capital, pipeline: s[TRACK_PIPELINE].capital}));
    const pipelineHeavyLowExisting = bySector
      .filter(s => s[TRACK_PIPELINE].capital > 0 && (s[TRACK_EXISTING].capital === 0 || s[TRACK_PIPELINE].capital > s[TRACK_EXISTING].capital * 3))
      .sort((a, b) => b[TRACK_PIPELINE].capital - a[TRACK_PIPELINE].capital)
      .slice(0, 5)
      .map(s => ({sector: s.sector, existing: s[TRACK_EXISTING].capital, pipeline: s[TRACK_PIPELINE].capital}));
    const phase3 = phaseSeries.find(p => p.order === 3);
    const phase3Share = pipelineCapital && phase3 ? phase3.capital / pipelineCapital * 100 : 0;
    const insights = {
      totalExisting: existingCapital, totalPipeline: pipelineCapital,
      top3Sectors, top3Share, bottom3Sectors,
      topPartner, top3PartnerShare,
      existingHeavyLowPipeline, pipelineHeavyLowExisting,
      phase3Share,
    };

    // ---- duplicates ----
    const confirmedRows = rows.filter(r => /confirmed overlap/i.test(r.duplicateStatus));
    const possibleRows = rows.filter(r => /possible overlap/i.test(r.duplicateStatus));
    const excludedCapital = confirmedRows.reduce((a, r) => a + (r.capitalM || 0), 0);
    const reviewCapital = possibleRows.reduce((a, r) => a + (r.capitalM || 0), 0);
    const combinedRawTotal = existingCapital + pipelineCapital;
    const adjustedCombinedTotal = combinedRawTotal - excludedCapital;
    const duplicates = {confirmedRows, possibleRows, excludedCapital, reviewCapital, combinedRawTotal, adjustedCombinedTotal};

    // ---- deepInsights ----
    const REALIZED_STATUSES = new Set(['Completed', 'Near completion', 'Ongoing', 'Under implementation', 'Funded']);
    let realizedCap = 0, unrealizedCap = 0;
    existingRows.forEach(r => {
      const v = r.capitalM || 0;
      if (REALIZED_STATUSES.has(r.status)) realizedCap += v; else unrealizedCap += v;
    });
    const unrealizedShare = (realizedCap + unrealizedCap) ? unrealizedCap / (realizedCap + unrealizedCap) * 100 : 0;

    const contingencyRows = pipelineRows.filter(r => /conting/i.test((r.name || '') + ' ' + (r.description || '')));
    const contingencyCapital = contingencyRows.reduce((a, r) => a + (r.capitalM || 0), 0);
    const contingencyShare = pipelineCapital ? contingencyCapital / pipelineCapital * 100 : 0;

    const pipelineCapsAsc = pipelineRows.filter(r => r.capitalM != null).map(r => r.capitalM).sort((a, b) => a - b);
    const medianTicket = median(pipelineCapsAsc);
    const meanTicket = pipelineCapsAsc.length ? pipelineCapsAsc.reduce((a, b) => a + b, 0) / pipelineCapsAsc.length : 0;
    const under100k = pipelineCapsAsc.filter(v => v < 0.1).length;
    const under100kShare = pipelineCapsAsc.length ? under100k / pipelineCapsAsc.length * 100 : 0;
    const over1m = pipelineCapsAsc.filter(v => v >= 1).length;
    const over1mShare = pipelineCapsAsc.length ? over1m / pipelineCapsAsc.length * 100 : 0;
    const sortedDesc = pipelineCapsAsc.slice().sort((a, b) => b - a);
    const top10n = sortedDesc.length ? Math.max(1, Math.round(sortedDesc.length * 0.10)) : 0;
    const top10Sum = sortedDesc.slice(0, top10n).reduce((a, b) => a + b, 0);
    const totalPipelineCapSum = sortedDesc.reduce((a, b) => a + b, 0);
    const top10pctShare = totalPipelineCapSum ? top10Sum / totalPipelineCapSum * 100 : 0;

    const noPartnerRows = pipelineRows.filter(r => r.partners.length === 0);
    const noPartnerCount = noPartnerRows.length;
    const noPartnerCapital = noPartnerRows.reduce((a, r) => a + (r.capitalM || 0), 0);

    const govSelfRows = rows.filter(r => r.partners.some(p => p.toLowerCase() === 'government of nauru'));
    const govSelfCount = govSelfRows.length;
    const govSelfCapital = govSelfRows.reduce((a, r) => a + (r.capitalM || 0), 0);

    const sectorConcentration = bySector.map(s => {
      const sectorRows = rows.filter(r => r.sector === s.sector && r.partners.length > 0 && r.capitalM != null);
      const denom = sectorRows.reduce((a, r) => a + r.capitalM, 0);
      const partnerSums = new Map();
      sectorRows.forEach(r => r.partners.forEach(p => partnerSums.set(p, (partnerSums.get(p) || 0) + r.capitalM)));
      let topPartnerName = null, topSum = 0;
      partnerSums.forEach((v, p) => { if (v > topSum){ topSum = v; topPartnerName = p; } });
      return {sector: s.sector, total: denom, topPartner: topPartnerName, topShare: denom ? topSum / denom * 100 : 0, partnerCount: partnerSums.size};
    }).filter(s => s.partnerCount > 0).sort((a, b) => b.topShare - a.topShare);

    const funderSpan = byPartner.slice(0, 10).map(p => ({partner: p.partner, capital: p.capital, sectorsSpanned: p.sectors.size}));

    const backloadRatios = byProgram.map(p => {
      const subs = pipelineRows.filter(r => r.program === p.program);
      const p1 = subs.filter(r => r.phase === PHASE_DEFS[0].key).reduce((a, r) => a + (r.capitalM || 0), 0);
      const p3 = subs.filter(r => r.phase === PHASE_DEFS[2].key).reduce((a, r) => a + (r.capitalM || 0), 0);
      return {program: p.program, phase1: p1, phase3: p3, ratio: p1 > 0 ? p3 / p1 : (p3 > 0 ? Infinity : 0)};
    }).filter(p => p.phase1 > 0 || p.phase3 > 0).sort((a, b) => b.ratio - a.ratio);

    const pipelineOnlySectors = bySector.filter(s => s[TRACK_EXISTING].capital === 0 && s[TRACK_PIPELINE].capital > 0).map(s => s.sector);
    const existingOnlySectors = bySector.filter(s => s[TRACK_PIPELINE].capital === 0 && s[TRACK_EXISTING].capital > 0).map(s => s.sector);

    const population = 12000;
    const deepInsights = {
      realizedCap, unrealizedCap, unrealizedShare,
      contingencyCapital, contingencyShare,
      medianTicket, meanTicket,
      under100k, under100kShare, over1m, over1mShare, top10pctShare,
      noPartnerCount, noPartnerCapital,
      govSelfCount, govSelfCapital,
      sectorConcentration, funderSpan, backloadRatios,
      pipelineOnlySectors, existingOnlySectors,
      adjustedCombinedTotal: duplicates.adjustedCombinedTotal,
      perCapita: {population, combinedTotal: combinedRawTotal, pipelineTotal: pipelineCapital},
    };

    // ---- hazardOutcome (hazard group x funding outcome) ----
    const hazMap = new Map();
    rows.forEach(r => {
      const hg = r.hazardGroup || 'Unclassified';
      let fo = r.fundingOutcome || 'Unspecified';
      if (OUTCOME_KEYS.indexOf(fo) === -1) fo = 'Unspecified';
      if (!hazMap.has(hg)){
        const byOutcome = {}, countByOutcome = {};
        OUTCOME_KEYS.forEach(k => { byOutcome[k] = 0; countByOutcome[k] = 0; });
        hazMap.set(hg, {hazardGroup: hg, capital: 0, count: 0, byOutcome, countByOutcome});
      }
      const o = hazMap.get(hg);
      o.count++;
      o.countByOutcome[fo]++;
      if (r.capitalM != null){ o.capital += r.capitalM; o.byOutcome[fo] += r.capitalM; }
    });
    const hazardOutcome = Array.from(hazMap.values()).sort((a, b) => b.capital - a.capital);

    return {
      tracks, TRACK_EXISTING, TRACK_PIPELINE,
      rows, bySector, byPartner, yearSeries, phaseSeries, sectorByPhase, byProgram, byLocation, byStatus,
      kpis, insights, deepInsights, duplicates, hazardOutcome,
    };
  }

  function computeSectorBuckets(bySector, TRACK_EXISTING, TRACK_PIPELINE){
    const sorted = bySector.slice().sort((a, b) => b.totalCapital - a.totalCapital);
    const topHalfCount = Math.ceil(sorted.length / 2);
    const topHalfSet = new Set(sorted.slice(0, topHalfCount).map(s => s.sector));
    return bySector.map(s => {
      const hazardCount = s.hazardGroups ? s.hazardGroups.size : 0;
      const partnerCount = s.partners ? s.partners.size : 0;
      const ex = s[TRACK_EXISTING].capital, pi = s[TRACK_PIPELINE].capital;
      let bucket, rationale;
      if (ex === 0 && pi > 0){
        bucket = 'gap';
        rationale = 'Proposed in the RONAdapt\u00a0II pipeline (' + fmtM(pi) + ' across ' + s[TRACK_PIPELINE].count + ' lines) but has zero existing/committed capital on record \u2014 a genuine ask with no track record yet.';
      } else if (pi === 0 && ex > 0){
        bucket = 'self-sustaining';
        rationale = fmtM(ex) + ' already existing/committed across ' + s[TRACK_EXISTING].count + ' lines, with no RONAdapt\u00a0II pipeline ask \u2014 may not need further donor attention right now.';
      } else if (topHalfSet.has(s.sector) && hazardCount >= 2 && partnerCount >= 2){
        bucket = 'important';
        rationale = fmtM(s.totalCapital) + ' combined, spans ' + hazardCount + ' hazard groups and ' + partnerCount + ' funding partners \u2014 concentration risk worth watching regardless of how resourced it looks.';
      } else {
        bucket = 'mixed';
        rationale = fmtM(s.totalCapital) + ' combined across ' + s.totalCount + ' lines; both existing and pipeline capital present, but doesn\u2019t cleanly fit the other buckets.';
      }
      return Object.assign({}, s, {bucket, rationale, hazardCount, partnerCount});
    });
  }

  // ================= Formatting helpers =================
  function fmtM(v){
    if (v == null || isNaN(v)) return '\u2013';
    const abs = Math.abs(v);
    if (abs >= 1000) return '$' + (v / 1000).toFixed(2) + 'B';
    if (abs >= 10) return '$' + v.toFixed(0) + 'M';
    if (abs >= 1) return '$' + v.toFixed(1) + 'M';
    return '$' + v.toFixed(2) + 'M';
  }
  function fmtCompact(v){ return v >= 1000 ? (v / 1000).toFixed(1) + 'B' : v.toFixed(0) + 'M'; }
  function money(v){ return '$' + Math.round(v * 1000).toLocaleString() + 'k'; }
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

  function renderSectorButterfly(containerId, data, TRACK_EXISTING, TRACK_PIPELINE, onSectorClick){
    const container = document.getElementById(containerId);
    const rows = data;
    if (!rows.length){ container.innerHTML = '<div class="empty-state">No sectors in the current data.</div>'; return; }
    const rowH = 30, gap = 6, leftPad = 190, rightPad = 70, topPad = 8;
    const width = 980, plotW = (width - leftPad - rightPad) / 2;
    const height = topPad + rows.length * (rowH + gap);
    const maxVal = Math.max(1, ...rows.map(r => Math.max(r[TRACK_EXISTING].capital, r[TRACK_PIPELINE].capital)));
    const scale = v => (v / maxVal) * (plotW - 8);
    const cx = leftPad + plotW;

    const svg = svgEl('svg', {viewBox: `0 0 ${width} ${height}`, class: 'chart-svg', role: 'img', 'aria-label': 'Sector investment, existing vs pipeline'});
    svg.appendChild(svgEl('line', {x1: cx, x2: cx, y1: 0, y2: height, class: 'baseline'}));

    rows.forEach((r, i) => {
      const y = topPad + i * (rowH + gap);
      const midY = y + rowH / 2;
      const exVal = r[TRACK_EXISTING].capital, exCount = r[TRACK_EXISTING].count;
      const piVal = r[TRACK_PIPELINE].capital, piCount = r[TRACK_PIPELINE].count;
      const exW = scale(exVal), piW = scale(piVal);

      const label = svgEl('text', {x: leftPad - 14, y: midY + 4, class: 'row-label', 'text-anchor': 'end'});
      label.textContent = r.sector;
      if (onSectorClick){ label.style.cursor = 'pointer'; label.addEventListener('click', () => onSectorClick(r.sector)); }
      svg.appendChild(label);

      function tipHtml(sector, track, val, count){
        return `<div class="tt-title">${escHtml(sector)}</div><div class="tt-row"><span>${escHtml(track)}</span><b>${fmtM(val)}</b></div><div class="tt-row"><span>Line items</span><b>${count}</b></div>`;
      }

      if (exVal > 0){
        const bar = svgEl('rect', {x: cx - exW, y, width: exW, height: rowH, rx: 4, fill: 'var(--track-existing)', class: 'bar'});
        if (onSectorClick) bar.style.cursor = 'pointer';
        bar.addEventListener('mousemove', e => { showTip(e, tipHtml(r.sector, TRACK_EXISTING, exVal, exCount)); moveTip(e); });
        bar.addEventListener('mouseleave', hideTip);
        if (onSectorClick) bar.addEventListener('click', () => onSectorClick(r.sector));
        svg.appendChild(bar);
        if (exW > 34){
          const t = svgEl('text', {x: cx - exW + 8, y: midY + 4, class: 'val-label', fill: '#fff'});
          t.textContent = fmtCompact(exVal); svg.appendChild(t);
        } else {
          const t = svgEl('text', {x: cx - exW - 8, y: midY + 4, class: 'val-label', 'text-anchor': 'end'});
          t.textContent = fmtCompact(exVal); svg.appendChild(t);
        }
      }
      if (piVal > 0){
        const bar = svgEl('rect', {x: cx, y, width: piW, height: rowH, rx: 4, fill: 'var(--track-pipeline)', class: 'bar'});
        if (onSectorClick) bar.style.cursor = 'pointer';
        bar.addEventListener('mousemove', e => { showTip(e, tipHtml(r.sector, TRACK_PIPELINE, piVal, piCount)); moveTip(e); });
        bar.addEventListener('mouseleave', hideTip);
        if (onSectorClick) bar.addEventListener('click', () => onSectorClick(r.sector));
        svg.appendChild(bar);
        if (piW > 34){
          const t = svgEl('text', {x: cx + piW - 8, y: midY + 4, class: 'val-label', fill: '#fff', 'text-anchor': 'end'});
          t.textContent = fmtCompact(piVal); svg.appendChild(t);
        } else {
          const t = svgEl('text', {x: cx + piW + 8, y: midY + 4, class: 'val-label'});
          t.textContent = fmtCompact(piVal); svg.appendChild(t);
        }
      }
    });
    container.innerHTML = '';
    container.appendChild(svg);
  }

  function renderHBar(containerId, items, opts){
    opts = opts || {};
    const container = document.getElementById(containerId);
    if (!items.length){ container.innerHTML = '<div class="empty-state">No data</div>'; return; }
    const rowH = opts.rowH || 22, gap = opts.gap || 8, leftPad = opts.leftPad || 130, rightPad = 56, topPad = 6;
    const width = opts.width || 560;
    const plotW = width - leftPad - rightPad;
    const height = topPad * 2 + items.length * (rowH + gap);
    const maxVal = Math.max(1, ...items.map(d => d.value));
    const color = opts.color || 'var(--track-existing)';

    const svg = svgEl('svg', {viewBox: `0 0 ${width} ${height}`, class: 'chart-svg'});
    items.forEach((d, i) => {
      const y = topPad + i * (rowH + gap);
      const w = Math.max((d.value / maxVal) * plotW, 2);
      const label = svgEl('text', {x: leftPad - 10, y: y + rowH / 2 + 4, class: 'row-label', 'text-anchor': 'end'});
      label.textContent = d.label;
      svg.appendChild(label);
      const bar = svgEl('rect', {x: leftPad, y, width: w, height: rowH, rx: 4, fill: d.color || color, class: 'bar'});
      if (opts.onClick) bar.style.cursor = 'pointer';
      bar.addEventListener('mousemove', e => { showTip(e, opts.tip ? opts.tip(d) : `<div class="tt-title">${escHtml(d.label)}</div><div class="tt-row"><span>Value</span><b>${fmtM(d.value)}</b></div>`); moveTip(e); });
      bar.addEventListener('mouseleave', hideTip);
      if (opts.onClick) bar.addEventListener('click', () => opts.onClick(d));
      svg.appendChild(bar);
      if (opts.onClick){ label.style.cursor = 'pointer'; label.addEventListener('click', () => opts.onClick(d)); }
      const vt = svgEl('text', {x: leftPad + w + 8, y: y + rowH / 2 + 4, class: 'val-label'});
      vt.textContent = opts.valueFmt ? opts.valueFmt(d) : fmtCompact(d.value);
      svg.appendChild(vt);
    });
    container.innerHTML = '';
    container.appendChild(svg);
  }

  function renderVBar(containerId, items, opts){
    opts = opts || {};
    const container = document.getElementById(containerId);
    if (!items.length){ container.innerHTML = '<div class="empty-state">No data</div>'; return; }
    const width = opts.width || 460, height = opts.height || 220;
    const leftPad = 42, rightPad = 10, topPad = 14, botPad = 40;
    const plotW = width - leftPad - rightPad, plotH = height - topPad - botPad;
    const maxVal = Math.max(...items.map(d => d.value), 1);
    const barGap = 10;
    const barW = (plotW - barGap * (items.length - 1)) / items.length;
    const color = opts.color || 'var(--track-existing)';

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
      const bar = svgEl('rect', {x, y, width: barW, height: Math.max(h, 1), rx: 4, fill: d.color || color, class: 'bar'});
      bar.addEventListener('mousemove', e => { showTip(e, `<div class="tt-title">${escHtml(d.label)}</div><div class="tt-row"><span>Capital</span><b>${fmtM(d.value)}</b></div>${d.sub ? `<div class="tt-row"><span>${escHtml(d.sub)}</span></div>` : ''}`); moveTip(e); });
      bar.addEventListener('mouseleave', hideTip);
      svg.appendChild(bar);
      const lbl = svgEl('text', {x: x + barW / 2, y: height - botPad + 18, class: 'axis-label', 'text-anchor': 'middle'});
      lbl.textContent = d.label; svg.appendChild(lbl);
      if (d.sub){
        const sub = svgEl('text', {x: x + barW / 2, y: height - botPad + 30, class: 'row-sub', 'text-anchor': 'middle'});
        sub.textContent = d.sub; svg.appendChild(sub);
      }
    });
    container.innerHTML = '';
    container.appendChild(svg);
  }

  // Generalized stacked horizontal bar (used for sector x phase, and hazard x funding outcome)
  function renderStackedH(containerId, rows, keys, colors, opts){
    opts = opts || {};
    const labelKey = opts.labelKey || 'sector';
    const labels = opts.labels || keys;
    const container = document.getElementById(containerId);
    if (!rows.length){ container.innerHTML = '<div class="empty-state">No data</div>'; return; }
    const rowH = 26, gap = 10, leftPad = opts.leftPad || 220, rightPad = 60, topPad = 8;
    const width = opts.width || 1000;
    const plotW = width - leftPad - rightPad;
    const height = topPad * 2 + rows.length * (rowH + gap);
    const maxVal = Math.max(1, ...rows.map(r => keys.reduce((a, k) => a + r[k], 0)));
    const svg = svgEl('svg', {viewBox: `0 0 ${width} ${height}`, class: 'chart-svg'});
    rows.forEach((r, i) => {
      const y = topPad + i * (rowH + gap);
      const label = svgEl('text', {x: leftPad - 12, y: y + rowH / 2 + 4, class: 'row-label', 'text-anchor': 'end'});
      label.textContent = r[labelKey]; svg.appendChild(label);
      let x = leftPad;
      const total = keys.reduce((a, k) => a + r[k], 0);
      keys.forEach((k, ki) => {
        const v = r[k];
        const w = (v / maxVal) * plotW;
        if (w > 0.3){
          const bar = svgEl('rect', {x, y, width: Math.max(w - 1.5, 0), height: rowH, rx: 3, fill: colors[ki], class: 'bar'});
          bar.addEventListener('mousemove', e => { showTip(e, `<div class="tt-title">${escHtml(r[labelKey])}</div><div class="tt-row"><span>${escHtml(labels[ki])}</span><b>${fmtM(v)}</b></div>`); moveTip(e); });
          bar.addEventListener('mouseleave', hideTip);
          svg.appendChild(bar);
        }
        x += w;
      });
      const vt = svgEl('text', {x: leftPad + plotW + 10, y: y + rowH / 2 + 4, class: 'val-label'});
      vt.textContent = fmtCompact(total); svg.appendChild(vt);
    });
    container.innerHTML = '';
    container.appendChild(svg);
  }

  function renderBackloadChart(containerId, items){
    const container = document.getElementById(containerId);
    if (!items.length){ container.innerHTML = '<div class="empty-state">No data</div>'; return; }
    const rowH = 26, gap = 10, leftPad = 210, rightPad = 46, topPad = 8;
    const width = 620, plotW = width - leftPad - rightPad;
    const height = topPad * 2 + items.length * (rowH + gap);
    const maxVal = Math.max(1, ...items.map(d => Math.max(d.phase1, d.phase3)));
    const svg = svgEl('svg', {viewBox: `0 0 ${width} ${height}`, class: 'chart-svg'});
    items.forEach((d, i) => {
      const y = topPad + i * (rowH + gap);
      const label = svgEl('text', {x: leftPad - 10, y: y + rowH / 2 + 4, class: 'row-label', 'text-anchor': 'end'});
      label.textContent = d.program.length > 30 ? d.program.slice(0, 28) + '\u2026' : d.program;
      svg.appendChild(label);
      const w1 = (d.phase1 / maxVal) * plotW, w3 = (d.phase3 / maxVal) * plotW;
      const bh = (rowH - 4) / 2;
      const b1 = svgEl('rect', {x: leftPad, y, width: Math.max(w1, 2), height: bh, rx: 3, fill: 'var(--seq-100)', class: 'bar'});
      b1.addEventListener('mousemove', e => { showTip(e, `<div class="tt-title">${escHtml(d.program)}</div><div class="tt-row"><span>Phase 1 (near-term)</span><b>${fmtM(d.phase1)}</b></div>`); moveTip(e); });
      b1.addEventListener('mouseleave', hideTip);
      svg.appendChild(b1);
      const b3 = svgEl('rect', {x: leftPad, y: y + bh + 4, width: Math.max(w3, 2), height: bh, rx: 3, fill: 'var(--seq-700)', class: 'bar'});
      b3.addEventListener('mousemove', e => { showTip(e, `<div class="tt-title">${escHtml(d.program)}</div><div class="tt-row"><span>Phase 3 (long-term)</span><b>${fmtM(d.phase3)}</b></div><div class="tt-row"><span>Ratio</span><b>${isFinite(d.ratio) ? d.ratio.toFixed(1) + '\u00d7' : '\u2014'}</b></div>`); moveTip(e); });
      b3.addEventListener('mouseleave', hideTip);
      svg.appendChild(b3);
      const rt = svgEl('text', {x: leftPad + Math.max(w1, w3) + 8, y: y + rowH / 2 + 4, class: 'val-label'});
      rt.textContent = isFinite(d.ratio) ? d.ratio.toFixed(1) + '\u00d7' : '\u2014'; svg.appendChild(rt);
    });
    container.innerHTML = '';
    container.appendChild(svg);
  }

  // ================= Application state =================
  let DATA = null;
  let ROWS = null;

  // ================= Data status banner =================
  function showBannerLoading(){
    const b = document.getElementById('data-banner');
    b.classList.remove('is-error'); b.classList.add('is-loading');
    document.getElementById('data-banner-text').textContent = 'Loading project data\u2026';
  }
  function showBannerLoaded(source, count){
    const b = document.getElementById('data-banner');
    b.classList.remove('is-loading', 'is-error');
    document.getElementById('data-banner-text').textContent = `Data loaded from ${source} \u2014 ${count} rows. Edits to the source sheet appear here on reload.`;
  }
  function showBannerError(err){
    const b = document.getElementById('data-banner');
    b.classList.remove('is-loading'); b.classList.add('is-error');
    document.getElementById('data-banner-text').textContent = 'Could not load data: ' + (err && err.message ? err.message : String(err));
  }

  // ================= Tab routing =================
  const TABS = ['overview', 'projects', 'sectors', 'duplicates', 'hazards'];
  function applyHashRoute(){
    let tab = (location.hash || '').replace('#', '');
    if (TABS.indexOf(tab) === -1) tab = 'overview';
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === tab));
    document.querySelectorAll('.tab-page').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tab));
  }
  window.addEventListener('hashchange', applyHashRoute);
  document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => { location.hash = b.getAttribute('data-tab'); }));
  applyHashRoute();

  // ================= Overview tab =================
  let filterSector = null, filterPartner = null;
  let globalSearchEl, chipsEl;
  let sectorSortKey = 'totalCapital', sectorSortDir = -1;
  let partnerSortKey = 'capital', partnerSortDir = -1;
  let progSortKey = 'capital', progSortDir = -1;
  let expandedProgram = null;
  let activeKpi = null;

  function partnerHasProgram(partnerName, program){
    return ROWS.some(r => r.track === DATA.TRACK_PIPELINE && r.program === program &&
      (r.partners.includes(partnerName) || (r.fundingSourceRaw || '').toLowerCase().includes(partnerName.toLowerCase())));
  }
  function setSectorFilter(sector){ filterSector = (filterSector === sector) ? null : sector; refreshOverviewFilters(); }
  function setPartnerFilter(partner){ filterPartner = (filterPartner === partner) ? null : partner; refreshOverviewFilters(); }

  function renderChips(){
    const chips = [];
    if (filterSector) chips.push(`<span class="filter-chip">Sector: ${escHtml(filterSector)}<button data-clear="sector" aria-label="Clear sector filter">&times;</button></span>`);
    if (filterPartner) chips.push(`<span class="filter-chip partner">Partner: ${escHtml(filterPartner)}<button data-clear="partner" aria-label="Clear partner filter">&times;</button></span>`);
    chipsEl.innerHTML = chips.join('') || (globalSearchEl.value.trim() ? '' : '<span class="chips-hint">Click a sector or partner below to filter the activities table</span>');
    chipsEl.querySelectorAll('button[data-clear]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.getAttribute('data-clear') === 'sector') filterSector = null; else filterPartner = null;
        refreshOverviewFilters();
      });
    });
  }

  function renderKpiRow(){
    const k = DATA.kpis;
    const combined = k.existingCapital + k.pipelineCapital;
    document.getElementById('m-total').textContent = fmtM(combined);
    document.getElementById('m-projects').textContent = (k.existingCount + k.pipelinePrograms) + '';
    document.getElementById('m-partners').textContent = k.partnersCount + '';

    const kpiRow = document.getElementById('kpi-row');
    const kpiDefs = [
      {key: 'existing', v: fmtM(k.existingCapital), l: 'Existing / committed capital', dot: 'var(--track-existing)', hint: 'Click to see the rows'},
      {key: 'pipeline', v: fmtM(k.pipelineCapital), l: 'RONAdapt II pipeline (proposed)', dot: 'var(--track-pipeline)', hint: 'Click to see the rows'},
      {key: 'existingCount', v: k.existingCount + '', l: 'Committed projects tracked', hint: 'Click to see the rows'},
      {key: 'programs', v: k.pipelinePrograms + ' <small>(' + k.pipelineCount + ' sub-projects)</small>', l: 'RONAdapt II activities', hint: 'Click to see the list'},
      {key: 'sectors', v: k.sectorsCount + '', l: 'Sectors represented', hint: 'Click to see the split'},
    ];
    kpiRow.innerHTML = kpiDefs.map((d, i) => `
      <div class="kpi clickable" data-kpi="${d.key}" data-idx="${i}" tabindex="0" role="button">
        <div class="v">${d.dot ? `<span class="dot" style="background:${d.dot}"></span>` : ''}${d.v}</div>
        <div class="l">${d.l}</div>
        <div class="hint">${d.hint}</div>
      </div>`).join('');

    function kpiDrillRows(key){
      const TE = DATA.TRACK_EXISTING, TP = DATA.TRACK_PIPELINE;
      if (key === 'existing') return {title: 'Existing / committed rows (' + k.existingCount + ')', cols: ['Project', 'Sector', 'Location', 'Capital'],
        rows: ROWS.filter(r => r.track === TE).slice().sort((a, b) => (b.capitalM || 0) - (a.capitalM || 0)).map(r => [r.name, r.sector || '\u2013', r.location || '\u2013', fmtM(r.capitalM)])};
      if (key === 'pipeline') return {title: 'RONAdapt II pipeline rows (' + k.pipelineCount + ')', cols: ['Sub-project', 'Activity', 'Sector', 'Capital'],
        rows: ROWS.filter(r => r.track === TP).slice().sort((a, b) => (b.capitalM || 0) - (a.capitalM || 0)).map(r => [r.name, r.program || '\u2013', r.sector || '\u2013', fmtM(r.capitalM)])};
      if (key === 'existingCount') return kpiDrillRows('existing');
      if (key === 'programs') return {title: 'RONAdapt II activities (' + k.pipelinePrograms + ')', cols: ['Activity', 'Sector', 'Proposed capital', 'Sub-projects'],
        rows: DATA.byProgram.slice().sort((a, b) => b.capital - a.capital).map(p => [p.program, p.sector, fmtM(p.capital), p.count])};
      if (key === 'sectors') return {title: 'All sectors (' + k.sectorsCount + ')', cols: ['Sector', 'Existing', 'Pipeline', 'Total'],
        rows: DATA.bySector.slice().sort((a, b) => b.totalCapital - a.totalCapital).map(s => [s.sector, fmtM(s[TE].capital), fmtM(s[TP].capital), fmtM(s.totalCapital)])};
      return null;
    }
    function renderKpiDrill(){
      const kpiDrill = document.getElementById('kpi-drilldown');
      if (activeKpi == null){ kpiDrill.innerHTML = ''; return; }
      const d = kpiDrillRows(activeKpi);
      if (!d){ kpiDrill.innerHTML = ''; return; }
      kpiDrill.innerHTML = `<div class="drill-panel">
        <div class="drill-head"><h3>${escHtml(d.title)}</h3><button class="drill-close" id="drill-close" aria-label="Close">&times;</button></div>
        <table class="data-table"><thead><tr>${d.cols.map((c, i) => `<th${i > 0 && i === d.cols.length - 1 ? ' style="text-align:right"' : ''}>${escHtml(c)}</th>`).join('')}</tr></thead>
        <tbody>${d.rows.map(r => `<tr>${r.map((v, i) => `<td${i === r.length - 1 ? ' class="num"' : ''}>${escHtml(String(v))}</td>`).join('')}</tr>`).join('')}</tbody></table>
      </div>`;
      document.getElementById('drill-close').addEventListener('click', () => { activeKpi = null; syncKpiActive(); renderKpiDrill(); });
    }
    function syncKpiActive(){
      kpiRow.querySelectorAll('.kpi').forEach(el => el.classList.toggle('active', activeKpi != null && el.getAttribute('data-kpi') === activeKpi));
    }
    kpiRow.querySelectorAll('.kpi[data-kpi]').forEach(el => {
      const activate = () => {
        const key = el.getAttribute('data-kpi');
        activeKpi = activeKpi === key ? null : key;
        syncKpiActive(); renderKpiDrill();
        if (activeKpi) document.getElementById('kpi-drilldown').scrollIntoView({behavior: 'smooth', block: 'nearest'});
      };
      el.addEventListener('click', activate);
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); activate(); } });
    });
  }

  function renderInsightCards(){
    const ins = DATA.insights, TE = DATA.TRACK_EXISTING, TP = DATA.TRACK_PIPELINE;
    const cards = [];
    if (ins.top3Sectors.length){
      cards.push({badge: 'concentration', badgeLabel: 'Concentration',
        text: `<b>${ins.top3Sectors.map(s => s.sector).join(', ')}</b> account for <b>${ins.top3Share.toFixed(0)}%</b> of all tracked capital (existing + pipeline combined).`});
    }
    cards.push({badge: 'concentration', badgeLabel: 'Funder concentration',
      text: `<b>${ins.topPartner.name}</b> is the single largest named partner at <b>${fmtM(ins.topPartner.capital)}</b> across ${ins.topPartner.mentions} lines; the top 3 partners together touch <b>${ins.top3PartnerShare.toFixed(0)}%</b> of associated capital.`});
    if (ins.existingHeavyLowPipeline.length){
      const s = ins.existingHeavyLowPipeline[0];
      cards.push({badge: 'gap', badgeLabel: 'Resourced, pipeline light',
        text: `<b>${s.sector}</b> carries ${fmtM(s.existing)} in existing/committed capital but only <b>${fmtM(s.pipeline)}</b> in the RONAdapt&nbsp;II pipeline, worth checking whether it's genuinely done, or falling out of view.`});
    }
    if (ins.pipelineHeavyLowExisting.length){
      const s = ins.pipelineHeavyLowExisting[0];
      cards.push({badge: 'emerging', badgeLabel: 'Emerging priority',
        text: `<b>${s.sector}</b> has almost no existing footprint (${fmtM(s.existing)}) but RONAdapt&nbsp;II proposes <b>${fmtM(s.pipeline)}</b>, a genuinely new investment thrust.`});
    }
    const zeroPipeline = DATA.bySector.filter(s => s[TP].capital === 0 && s[TE].capital > 0);
    if (zeroPipeline.length){
      cards.push({badge: 'gap', badgeLabel: 'Absent from the pipeline',
        text: `<b>${zeroPipeline.map(s => s.sector).join(', ')}</b> ${zeroPipeline.length > 1 ? 'have' : 'has'} existing capital on record but <b>zero</b> line items in RONAdapt&nbsp;II's priority activities.`});
    }
    cards.push({badge: 'info', badgeLabel: 'Backloaded',
      text: `<b>${ins.phase3Share.toFixed(0)}%</b> of RONAdapt&nbsp;II's proposed capital sits in the long-term horizon (Phase 3), a reminder that most of the pipeline is not yet funded, only planned.`});
    document.getElementById('insight-cards').innerHTML = cards.map(c => `
      <div class="insight-card"><span class="badge ${c.badge}">${c.badgeLabel}</span><p>${c.text}</p></div>`).join('');
  }

  function renderSectorTable(){
    const el = document.getElementById('sector-table');
    const TE = DATA.TRACK_EXISTING, TP = DATA.TRACK_PIPELINE;
    const q = globalSearchEl.value.trim().toLowerCase();
    let rows = DATA.bySector.filter(s => !q || s.sector.toLowerCase().includes(q));
    rows = rows.slice().sort((a, b) => {
      const pick = s => sectorSortKey === 'sector' ? s.sector
        : sectorSortKey === 'existing' ? s[TE].capital
        : sectorSortKey === 'pipeline' ? s[TP].capital
        : sectorSortKey === 'count' ? s.totalCount
        : s.totalCapital;
      const av = pick(a), bv = pick(b);
      return sectorSortDir * (av > bv ? 1 : av < bv ? -1 : 0);
    });
    if (!rows.length){ el.innerHTML = '<div class="empty-state">No sectors match.</div>'; return; }
    const cols = [
      {key: 'sector', label: 'Sector'}, {key: 'existing', label: 'Existing', num: true},
      {key: 'pipeline', label: 'Pipeline', num: true}, {key: 'count', label: 'Line items', num: true},
      {key: 'totalCapital', label: 'Total', num: true},
    ];
    el.innerHTML = `<table class="data-table"><thead><tr>${cols.map(c => `<th data-key="${c.key}"${c.num ? ' style="text-align:right"' : ''} class="${sectorSortKey === c.key ? 'sorted' : ''}">${c.label}${sectorSortKey === c.key ? `<span class="sort-arrow">${sectorSortDir === 1 ? '\u25b2' : '\u25bc'}</span>` : ''}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(s => `<tr class="${filterSector === s.sector ? 'row-active' : ''}" data-sector="${escAttr(s.sector)}">
        <td>${escHtml(s.sector)}</td><td class="num">${fmtM(s[TE].capital)}</td><td class="num">${fmtM(s[TP].capital)}</td>
        <td class="num">${s.totalCount}</td><td class="num">${fmtM(s.totalCapital)}</td></tr>`).join('')}</tbody></table>`;
    el.querySelectorAll('th[data-key]').forEach(th => th.addEventListener('click', () => {
      const key = th.getAttribute('data-key');
      if (sectorSortKey === key) sectorSortDir *= -1; else { sectorSortKey = key; sectorSortDir = key === 'sector' ? 1 : -1; }
      renderSectorTable();
    }));
    el.querySelectorAll('tr[data-sector]').forEach(tr => tr.addEventListener('click', () => setSectorFilter(tr.getAttribute('data-sector'))));
  }

  function renderPartnerTable(){
    const el = document.getElementById('partner-table');
    const TE = DATA.TRACK_EXISTING, TP = DATA.TRACK_PIPELINE;
    const q = globalSearchEl.value.trim().toLowerCase();
    let rows = DATA.byPartner.filter(p => !q || p.partner.toLowerCase().includes(q));
    rows = rows.slice().sort((a, b) => {
      const pick = p => partnerSortKey === 'partner' ? p.partner
        : partnerSortKey === 'mentions' ? p.mentions
        : partnerSortKey === 'existing' ? (p.capitalByTrack[TE] || 0)
        : partnerSortKey === 'pipeline' ? (p.capitalByTrack[TP] || 0)
        : p.capital;
      const av = pick(a), bv = pick(b);
      return partnerSortDir * (av > bv ? 1 : av < bv ? -1 : 0);
    });
    if (!rows.length){ el.innerHTML = '<div class="empty-state">No partners match.</div>'; return; }
    const cols = [
      {key: 'partner', label: 'Partner'}, {key: 'existing', label: 'Existing', num: true},
      {key: 'pipeline', label: 'Pipeline', num: true}, {key: 'mentions', label: 'Lines', num: true},
      {key: 'capital', label: 'Total', num: true},
    ];
    el.innerHTML = `<table class="data-table"><thead><tr>${cols.map(c => `<th data-key="${c.key}"${c.num ? ' style="text-align:right"' : ''} class="${partnerSortKey === c.key ? 'sorted' : ''}">${c.label}${partnerSortKey === c.key ? `<span class="sort-arrow">${partnerSortDir === 1 ? '\u25b2' : '\u25bc'}</span>` : ''}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(p => `<tr class="${filterPartner === p.partner ? 'row-active' : ''}" data-partner="${escAttr(p.partner)}">
        <td>${escHtml(p.partner)}</td><td class="num">${fmtM(p.capitalByTrack[TE] || 0)}</td><td class="num">${fmtM(p.capitalByTrack[TP] || 0)}</td>
        <td class="num">${p.mentions}</td><td class="num">${fmtM(p.capital)}</td></tr>`).join('')}</tbody></table>`;
    el.querySelectorAll('th[data-key]').forEach(th => th.addEventListener('click', () => {
      const key = th.getAttribute('data-key');
      if (partnerSortKey === key) partnerSortDir *= -1; else { partnerSortKey = key; partnerSortDir = key === 'partner' ? 1 : -1; }
      renderPartnerTable();
    }));
    el.querySelectorAll('tr[data-partner]').forEach(tr => tr.addEventListener('click', () => setPartnerFilter(tr.getAttribute('data-partner'))));
  }

  function programSubItems(program){
    return ROWS.filter(r => r.track === DATA.TRACK_PIPELINE && r.program === program);
  }

  function renderProgramTable(){
    const tableEl = document.getElementById('program-table');
    const q = globalSearchEl.value.trim().toLowerCase();
    let programs = DATA.byProgram.slice();
    let matchedSubByProgram = {};
    if (filterSector) programs = programs.filter(p => p.sector === filterSector);
    if (filterPartner) programs = programs.filter(p => partnerHasProgram(filterPartner, p.program));
    if (q){
      programs = programs.filter(p => {
        if (p.program.toLowerCase().includes(q) || (p.sector || '').toLowerCase().includes(q)) return true;
        const subs = programSubItems(p.program).filter(s => s.name.toLowerCase().includes(q) || (s.fundingSourceRaw || '').toLowerCase().includes(q));
        if (subs.length){ matchedSubByProgram[p.program] = subs; return true; }
        return false;
      });
    }
    programs.sort((a, b) => progSortDir * (a[progSortKey] > b[progSortKey] ? 1 : a[progSortKey] < b[progSortKey] ? -1 : 0));

    if (!programs.length){
      tableEl.innerHTML = q ? '<div class="empty-state">No activities match &ldquo;' + escHtml(q) + '&rdquo;</div>' : '<div class="empty-state">No activities match the current sector/partner filter.</div>';
      return;
    }
    const maxCap = Math.max(1, ...DATA.byProgram.map(p => p.capital));
    let html = `<table class="data-table"><thead><tr>
      <th data-key="program">Activity</th><th data-key="sector">Sector</th>
      <th data-key="capital" style="text-align:right">Proposed capital</th><th style="width:120px"></th>
      <th data-key="count" style="text-align:right">Sub-projects</th></tr></thead><tbody>`;
    programs.forEach(p => {
      const isOpen = expandedProgram === p.program;
      html += `<tr class="prog-row ${isOpen ? 'expanded' : ''}" data-program="${escAttr(p.program)}">
        <td><span class="expand-icon">&#9656;</span>${escHtml(p.program)}</td>
        <td><span class="sector-chip">${escHtml(p.sector || '\u2013')}</span></td>
        <td class="num">${fmtM(p.capital)}</td>
        <td><div class="cap-bar-track"><div class="cap-bar-fill" style="width:${(p.capital / maxCap * 100).toFixed(1)}%"></div></div></td>
        <td class="num">${p.count}</td></tr>
      <tr class="subrow" data-for="${escAttr(p.program)}"><td colspan="5"><div class="subrow-inner"></div></td></tr>`;
    });
    html += '</tbody></table>';
    tableEl.innerHTML = html;

    tableEl.querySelectorAll('thead th[data-key]').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.getAttribute('data-key');
        if (progSortKey === key) progSortDir *= -1; else { progSortKey = key; progSortDir = (key === 'program' || key === 'sector') ? 1 : -1; }
        renderProgramTable();
      });
    });
    tableEl.querySelectorAll('tr.prog-row').forEach(tr => {
      tr.addEventListener('click', () => {
        const program = tr.getAttribute('data-program');
        expandedProgram = expandedProgram === program ? null : program;
        renderProgramTable();
        if (expandedProgram){
          const subInner = tableEl.querySelector(`.subrow[data-for="${cssEsc(expandedProgram)}"] .subrow-inner`);
          const subs = (matchedSubByProgram[expandedProgram] || programSubItems(expandedProgram)).slice().sort((a, b) => (b.capitalM || 0) - (a.capitalM || 0));
          subInner.innerHTML = subs.map(s => `
            <div class="sub-item">
              <div class="si-name">${escHtml(s.name)}</div>
              <div class="si-phase">${escHtml(s.yearLabel || '')}</div>
              <div class="si-partners">${escHtml(s.fundingSourceRaw || '\u2013')}</div>
              <div class="si-cap">${fmtM(s.capitalM)}</div>
            </div>`).join('');
        }
      });
    });
  }

  function refreshOverviewFilters(){
    renderChips();
    renderSectorTable();
    renderPartnerTable();
    renderProgramTable();
  }

  function renderDeepAnalysis(){
    const di = DATA.deepInsights, k = DATA.kpis, dup = DATA.duplicates;
    const dc = [];
    dc.push({badge: 'gap', badgeLabel: 'Aspirational, not committed',
      text: `<b>${di.unrealizedShare.toFixed(0)}%</b> of the existing track's capital (${fmtM(di.unrealizedCap)}) is not yet Completed, Funded, Ongoing, Near completion, or Under implementation. RONAdapt&nbsp;II's own pipeline is effectively all &ldquo;Seeking funding,&rdquo; so almost none of its ${fmtM(k.pipelineCapital)} is secured either.`});
    if (dup.confirmedRows.length || dup.possibleRows.length){
      let s = '';
      if (dup.confirmedRows.length) s += `<b>${dup.confirmedRows.length}</b> row${dup.confirmedRows.length === 1 ? '' : 's'} totalling <b>${fmtM(dup.excludedCapital)}</b> ${dup.confirmedRows.length === 1 ? 'is' : 'are'} flagged as a confirmed overlap and excluded from the adjusted total (see the Duplicates tab).`;
      if (dup.possibleRows.length) s += ` A further <b>${dup.possibleRows.length}</b> row${dup.possibleRows.length === 1 ? '' : 's'} totalling ${fmtM(dup.reviewCapital)} ${dup.possibleRows.length === 1 ? 'is' : 'are'} flagged for review but not excluded.`;
      s += ` Adjusted combined total: <b>${fmtM(di.adjustedCombinedTotal)}</b> vs. raw ${fmtM(k.existingCapital + k.pipelineCapital)}.`;
      dc.push({badge: 'gap', badgeLabel: 'Possible double-counting', text: s});
    } else {
      dc.push({badge: 'info', badgeLabel: 'No flagged overlaps', text: `No rows are currently flagged with a Duplicate Status, so the adjusted and raw combined totals match: <b>${fmtM(di.adjustedCombinedTotal)}</b>.`});
    }
    if (di.sectorConcentration.length){
      const topConc = di.sectorConcentration[0], secondConc = di.sectorConcentration[1];
      let s = `<b>${topConc.topPartner}</b> alone supplies <b>${topConc.topShare.toFixed(0)}%</b> of ${topConc.sector}'s tracked capital`;
      if (secondConc) s += `; <b>${secondConc.topPartner}</b> supplies <b>${secondConc.topShare.toFixed(0)}%</b> of ${secondConc.sector}'s`;
      s += `. High shares mean a sector leans on one institution's continued appetite.`;
      dc.push({badge: 'concentration', badgeLabel: 'Single-funder dependency', text: s});
    }
    document.getElementById('deep-cards').innerHTML = dc.map(c => `<div class="insight-card"><span class="badge ${c.badge}">${c.badgeLabel}</span><p>${c.text}</p></div>`).join('');

    const rowsHtml = di.sectorConcentration.map(s => `
      <tr><td>${escHtml(s.sector)}</td><td><span class="sector-chip">${escHtml(s.topPartner || '\u2013')}</span></td>
      <td class="num">${s.topShare.toFixed(0)}%</td><td class="num">${fmtM(s.total)}</td><td class="num">${s.partnerCount}</td></tr>`).join('');
    document.getElementById('concentration-table').innerHTML = `
      <table class="data-table"><thead><tr><th>Sector</th><th>Top partner</th><th style="text-align:right">Share</th>
      <th style="text-align:right">Total assoc. capital</th><th style="text-align:right"># partners</th></tr></thead><tbody>${rowsHtml}</tbody></table>`;

    renderBackloadChart('backload-chart', di.backloadRatios.slice(0, 8));

    const stats = [
      {v: `$${(di.medianTicket * 1000).toFixed(0)}k`, l: 'Median pipeline line-item size'},
      {v: `${di.top10pctShare.toFixed(0)}%`, l: 'Of pipeline capital held by the top 10% of line items'},
      {v: `${di.contingencyShare.toFixed(1)}%`, l: 'Of the pipeline is explicit contingency'},
      {v: `${di.noPartnerCount}`, l: `Pipeline lines naming no partner (${fmtM(di.noPartnerCapital)})`},
      {v: `${fmtM(di.govSelfCapital)}`, l: `Nauru Govt named as self-financier (${di.govSelfCount} lines)`},
      {v: `$${Math.round(di.perCapita.combinedTotal * 1e6 / di.perCapita.population).toLocaleString()}`, l: `Per person tracked (pop. ~${di.perCapita.population.toLocaleString()})`},
    ];
    document.getElementById('deep-stats').innerHTML = stats.map(s => `<div class="kpi"><div class="v">${s.v}</div><div class="l">${s.l}</div></div>`).join('');
  }

  function renderOverview(){
    globalSearchEl = document.getElementById('global-search');
    chipsEl = document.getElementById('filter-chips');
    filterSector = null; filterPartner = null; expandedProgram = null; activeKpi = null;

    renderKpiRow();
    renderInsightCards();

    renderSectorButterfly('sector-chart', DATA.bySector, DATA.TRACK_EXISTING, DATA.TRACK_PIPELINE, setSectorFilter);

    renderHBar('partner-chart', DATA.byPartner.slice(0, 12).map(p => ({label: p.partner, value: p.capital})), {
      width: 520, color: 'var(--track-existing)',
      onClick: d => setPartnerFilter(d.label),
      tip: d => {
        const p = DATA.byPartner.find(x => x.partner === d.label);
        const ex = p.capitalByTrack[DATA.TRACK_EXISTING] || 0, pi = p.capitalByTrack[DATA.TRACK_PIPELINE] || 0;
        return `<div class="tt-title">${escHtml(p.partner)}</div><div class="tt-row"><span>Associated capital</span><b>${fmtM(p.capital)}</b></div>
          <div class="tt-row"><span>Existing track</span><b>${fmtM(ex)}</b></div><div class="tt-row"><span>Pipeline track</span><b>${fmtM(pi)}</b></div>
          <div class="tt-row"><span>Lines mentioning</span><b>${p.mentions}</b></div>`;
      },
    });

    renderHBar('location-chart', DATA.byLocation.slice(0, 9).map(l => ({label: l.location, value: l.capital})), {
      width: 520, color: 'var(--track-existing)',
      tip: d => {
        const l = DATA.byLocation.find(x => x.location === d.label);
        return `<div class="tt-title">${escHtml(l.location)}</div><div class="tt-row"><span>Capital</span><b>${fmtM(l.capital)}</b></div><div class="tt-row"><span>Projects</span><b>${l.count}</b></div>`;
      },
    });

    renderVBar('year-chart', DATA.yearSeries.map(y => ({label: String(y.year), value: y.capital})), {width: 460, color: 'var(--track-existing)'});
    renderVBar('phase-chart', DATA.phaseSeries.map(p => ({label: p.label, sub: p.sub, value: p.capital})), {width: 460, color: 'var(--track-pipeline)'});
    renderStackedH('sector-phase-chart', DATA.sectorByPhase, ['phase1', 'phase2', 'phase3'], ['var(--seq-100)', 'var(--seq-300)', 'var(--seq-700)'], {labels: ['Near-term', 'Medium-term', 'Long-term']});

    renderDeepAnalysis();
    refreshOverviewFilters();

    globalSearchEl.addEventListener('input', () => { expandedProgram = null; refreshOverviewFilters(); });
  }

  // ================= Project Master List tab =================
  function renderProjectsTab(){
    const trackSel = document.getElementById('pl-track');
    const sectorSel = document.getElementById('pl-sector');
    const phaseSel = document.getElementById('pl-phase');
    const outcomeSel = document.getElementById('pl-outcome');
    const statusSel = document.getElementById('pl-status');
    const searchEl = document.getElementById('pl-search');

    trackSel.innerHTML = '<option value="">All tracks</option>' + DATA.tracks.map(t => `<option value="${escAttr(t)}">${escHtml(t)}</option>`).join('');
    const sectors = Array.from(new Set(ROWS.map(r => r.sector).filter(Boolean))).sort();
    sectorSel.innerHTML = '<option value="">All sectors</option>' + sectors.map(s => `<option value="${escAttr(s)}">${escHtml(s)}</option>`).join('');
    phaseSel.innerHTML = '<option value="">All phases</option>' + PHASE_DEFS.map(p => `<option value="${escAttr(p.key)}">${escHtml(p.key)}</option>`).join('');
    const outcomes = Array.from(new Set(ROWS.map(r => r.fundingOutcome).filter(Boolean))).sort();
    outcomeSel.innerHTML = '<option value="">All funding outcomes</option>' + outcomes.map(o => `<option value="${escAttr(o)}">${escHtml(o)}</option>`).join('');
    const statuses = Array.from(new Set(ROWS.map(r => r.status).filter(Boolean))).sort();
    statusSel.innerHTML = '<option value="">All statuses</option>' + statuses.map(s => `<option value="${escAttr(s)}">${escHtml(s)}</option>`).join('');

    let sortKey = 'capitalM', sortDir = -1, view = 'table';

    function filteredRows(){
      const q = searchEl.value.trim().toLowerCase();
      return ROWS.filter(r => {
        if (trackSel.value && r.track !== trackSel.value) return false;
        if (sectorSel.value && r.sector !== sectorSel.value) return false;
        if (phaseSel.value && r.phase !== phaseSel.value) return false;
        if (outcomeSel.value && r.fundingOutcome !== outcomeSel.value) return false;
        if (statusSel.value && r.status !== statusSel.value) return false;
        if (q && !(`${r.name} ${r.description} ${r.program || ''}`.toLowerCase().includes(q))) return false;
        return true;
      });
    }

    function renderTable(){
      let rows = filteredRows();
      rows = rows.slice().sort((a, b) => {
        const pick = r => sortKey === 'capitalM' ? (r.capitalM == null ? -Infinity : r.capitalM) : (r[sortKey] || '');
        const av = pick(a), bv = pick(b);
        return sortDir * (av > bv ? 1 : av < bv ? -1 : 0);
      });
      document.getElementById('pl-count').textContent = `${rows.length} of ${ROWS.length} rows`;
      const cols = [
        {key: 'id', label: 'ID'}, {key: 'track', label: 'Track'}, {key: 'name', label: 'Project / sub-project'},
        {key: 'sector', label: 'Sector'}, {key: 'location', label: 'Location'}, {key: 'capitalM', label: 'Capital', num: true},
        {key: 'yearLabel', label: 'Years'}, {key: 'phase', label: 'Phase'}, {key: 'status', label: 'Status'}, {key: 'fundingOutcome', label: 'Funding outcome'},
      ];
      let html = `<table class="data-table"><thead><tr>${cols.map(c => `<th data-key="${c.key}"${c.num ? ' style="text-align:right"' : ''} class="${sortKey === c.key ? 'sorted' : ''}">${c.label}${sortKey === c.key ? `<span class="sort-arrow">${sortDir === 1 ? '\u25b2' : '\u25bc'}</span>` : ''}</th>`).join('')}</tr></thead><tbody>`;
      if (!rows.length){
        html += `<tr><td colspan="${cols.length}"><div class="empty-state">No rows match the current filters.</div></td></tr>`;
      } else {
        rows.slice(0, 600).forEach(r => {
          const isPipeline = r.track === DATA.TRACK_PIPELINE;
          html += `<tr>
            <td>${escHtml(r.id)}</td>
            <td><span class="sector-chip" style="background:${isPipeline ? 'var(--track-pipeline-soft)' : 'var(--track-existing-soft)'}">${isPipeline ? 'Pipeline' : 'Existing'}</span></td>
            <td>${escHtml(r.name)}${r.program ? `<div style="color:var(--text-muted);font-size:10.5px;margin-top:2px;">${escHtml(r.program)}</div>` : ''}</td>
            <td>${escHtml(r.sector || '\u2013')}</td>
            <td>${escHtml(r.location || '\u2013')}</td>
            <td class="num">${fmtM(r.capitalM)}</td>
            <td>${escHtml(r.yearLabel || '\u2013')}</td>
            <td>${escHtml((r.phase || '\u2013').replace(/\s*\(.*\)/, ''))}</td>
            <td>${escHtml(r.status || '\u2013')}</td>
            <td>${escHtml(r.fundingOutcome || '\u2013')}</td>
          </tr>`;
        });
      }
      html += '</tbody></table>';
      document.getElementById('pl-table').innerHTML = html;
      document.querySelectorAll('#pl-table th[data-key]').forEach(th => th.addEventListener('click', () => {
        const key = th.getAttribute('data-key');
        if (sortKey === key) sortDir *= -1; else { sortKey = key; sortDir = key === 'capitalM' ? -1 : 1; }
        renderTable();
      }));
    }

    function tlRow(labelHtml, subText, items, chipClass){
      const maxCap = Math.max(0.01, ...items.map(r => r.capitalM || 0));
      return `<div class="tl-row"><div class="tl-label">${labelHtml}<div class="tl-sub">${subText}</div></div>
        <div class="tl-track">${items.slice(0, 80).map(r => `<span class="tl-chip ${chipClass}" style="width:${Math.max((r.capitalM || 0) / maxCap * 90, 5)}px" title="${escAttr(r.name + ' \u2014 ' + fmtM(r.capitalM))}"></span>`).join('') || '<span style="font-size:11px;color:var(--text-muted);">No line items</span>'}</div></div>`;
    }
    function renderTimeline(){
      const rows = filteredRows();
      const wrap = document.getElementById('pl-timeline');
      const pipeline = rows.filter(r => r.track === DATA.TRACK_PIPELINE && r.phase);
      const existing = rows.filter(r => r.track === DATA.TRACK_EXISTING && r.startYear != null);
      let html = '<p class="tl-section-title">RONAdapt II pipeline, by phase</p>';
      PHASE_DEFS.forEach(pd => {
        const items = pipeline.filter(r => r.phase === pd.key).sort((a, b) => (b.capitalM || 0) - (a.capitalM || 0));
        const cap = items.reduce((a, r) => a + (r.capitalM || 0), 0);
        html += tlRow(escHtml(pd.key), `${items.length} lines \u00b7 ${fmtM(cap)}`, items, '');
      });
      html += '<p class="tl-section-title">Existing / committed, by start year</p>';
      const years = Array.from(new Set(existing.map(r => r.startYear))).sort((a, b) => a - b);
      if (!years.length){
        html += '<div class="empty-state">No existing/committed rows with a start year match the current filters.</div>';
      }
      years.forEach(y => {
        const items = existing.filter(r => r.startYear === y).sort((a, b) => (b.capitalM || 0) - (a.capitalM || 0));
        const cap = items.reduce((a, r) => a + (r.capitalM || 0), 0);
        html += tlRow(String(y), `${items.length} projects \u00b7 ${fmtM(cap)}`, items, 'existing');
      });
      wrap.innerHTML = html;
    }

    function refresh(){ if (view === 'table') renderTable(); else renderTimeline(); }
    [trackSel, sectorSel, phaseSel, outcomeSel, statusSel].forEach(el => el.addEventListener('change', refresh));
    searchEl.addEventListener('input', refresh);
    document.querySelectorAll('#pl-view-toggle button').forEach(btn => btn.addEventListener('click', () => {
      view = btn.getAttribute('data-view');
      document.querySelectorAll('#pl-view-toggle button').forEach(b => b.classList.toggle('active', b === btn));
      document.getElementById('pl-table-wrap').style.display = view === 'table' ? '' : 'none';
      document.getElementById('pl-timeline-wrap').style.display = view === 'timeline' ? '' : 'none';
      refresh();
    }));
    refresh();
  }

  // ================= Sectors tab =================
  function renderSectorsTab(){
    const buckets = {
      important: {label: 'Important \u2014 concentration risk worth watching', caption: 'Rule: sits in the top half of sectors by combined capital, AND spans 2+ recorded hazard groups, AND names 2+ distinct funding partners. High capital riding on multiple problems and multiple funders at once.', badge: 'concentration', items: []},
      gap: {label: 'Gap / neglected \u2014 proposed, not yet resourced', caption: 'Rule: existing/committed capital is exactly zero, but the RONAdapt\u00a0II pipeline proposes capital for it. A genuine ask with no track record yet.', badge: 'gap', items: []},
      'self-sustaining': {label: 'Self-sustaining \u2014 already resourced, no pipeline ask', caption: 'Rule: has existing/committed capital, but zero RONAdapt\u00a0II pipeline ask. May not need further donor attention right now.', badge: 'emerging', items: []},
      mixed: {label: 'Steady / mixed', caption: 'Rule: everything that doesn\u2019t cleanly satisfy one of the three rules above \u2014 has both existing and pipeline capital, but isn\u2019t large/diverse enough to flag as a concentration risk.', badge: 'info', items: []},
    };
    const categorized = computeSectorBuckets(DATA.bySector, DATA.TRACK_EXISTING, DATA.TRACK_PIPELINE);
    categorized.forEach(s => { if (buckets[s.bucket]) buckets[s.bucket].items.push(s); });

    const order = ['important', 'gap', 'self-sustaining', 'mixed'];
    let html = '';
    order.forEach(key => {
      const b = buckets[key];
      if (!b.items.length) return;
      html += `<div class="bucket-group">
        <div class="bucket-group-head"><span class="badge ${b.badge}">${b.items.length}</span><p class="panel-title" style="font-size:13px; margin:0;">${b.label}</p></div>
        <p class="bucket-caption">${b.caption}</p>
        <div class="grid-3">${b.items.sort((a, c) => c.totalCapital - a.totalCapital).map(s => `
          <div class="insight-card"><div class="sec-name">${escHtml(s.sector)}</div>
            <div class="sec-meta">${fmtM(s.totalCapital)} \u00b7 ${s.totalCount} projects</div>
            <p>${s.rationale}</p></div>`).join('')}</div>
      </div>`;
    });
    document.getElementById('sectors-buckets').innerHTML = html || '<div class="empty-state">No sectors in the current data.</div>';
  }

  // ================= Duplicates tab =================
  function renderDuplicatesTab(){
    const dup = DATA.duplicates, k = DATA.kpis;
    document.getElementById('dup-summary').innerHTML = `
      <div class="kpi"><div class="v">${fmtM(dup.excludedCapital)}</div><div class="l">Excluded from adjusted totals (${dup.confirmedRows.length} row${dup.confirmedRows.length === 1 ? '' : 's'}, confirmed overlap)</div></div>
      <div class="kpi"><div class="v">${fmtM(dup.reviewCapital)}</div><div class="l">Flagged for review, not excluded (${dup.possibleRows.length} row${dup.possibleRows.length === 1 ? '' : 's'}, possible overlap)</div></div>
      <div class="kpi"><div class="v">${fmtM(dup.adjustedCombinedTotal)}</div><div class="l">Adjusted combined total (raw ${fmtM(k.existingCapital + k.pipelineCapital)})</div></div>`;

    function group(title, rows, badge){
      if (!rows.length) return '';
      return `<div class="bucket-group">
        <div class="bucket-group-head"><span class="badge ${badge}">${rows.length}</span><p class="panel-title" style="font-size:13px;margin:0;">${escHtml(title)}</p></div>
        <table class="data-table"><thead><tr><th>Project</th><th>Track</th><th style="text-align:right">Capital</th><th>Duplicate of</th><th>Notes</th></tr></thead>
        <tbody>${rows.map(r => `<tr><td>${escHtml(r.name)}</td><td>${r.track === DATA.TRACK_PIPELINE ? 'Pipeline' : 'Existing'}</td>
          <td class="num">${fmtM(r.capitalM)}</td><td>${escHtml(r.duplicateOf || '\u2013')}</td>
          <td style="max-width:320px;">${escHtml(r.notes || '\u2013')}</td></tr>`).join('')}</tbody></table>
      </div>`;
    }
    const html = group('Confirmed overlap \u2014 excluded from adjusted totals', dup.confirmedRows, 'gap') +
      group('Possible overlap \u2014 review', dup.possibleRows, 'concentration');
    document.getElementById('dup-groups').innerHTML = html || '<div class="empty-state">No rows are currently flagged with a Duplicate Status.</div>';
  }

  // ================= Hazards & Funding Outcomes tab =================
  const OUTCOME_COLORS = {'Funded': 'var(--status-good)', 'Seeking funding': 'var(--status-warning)', 'Unsuccessful': 'var(--status-critical)', 'Unspecified': 'var(--baseline)'};
  function renderHazardsTab(){
    document.getElementById('hazard-legend').innerHTML = OUTCOME_KEYS.map(k => `<span class="legend-item"><span class="legend-swatch" style="background:${OUTCOME_COLORS[k]}"></span>${escHtml(k)}</span>`).join('');
    const rows = DATA.hazardOutcome.map(h => {
      const o = Object.assign({label: h.hazardGroup, total: h.capital, count: h.count}, h.byOutcome);
      return o;
    });
    renderStackedH('hazard-chart', rows, OUTCOME_KEYS, OUTCOME_KEYS.map(k => OUTCOME_COLORS[k]), {labelKey: 'label', labels: OUTCOME_KEYS, width: 1000, leftPad: 250});

    let sortKey = 'capital', sortDir = -1;
    function renderMatrix(){
      const el = document.getElementById('hazard-table');
      let items = DATA.hazardOutcome.slice();
      items.sort((a, b) => {
        const pick = h => sortKey === 'hazardGroup' ? h.hazardGroup : sortKey === 'count' ? h.count : sortKey === 'capital' ? h.capital : h.byOutcome[sortKey];
        const av = pick(a), bv = pick(b);
        return sortDir * (av > bv ? 1 : av < bv ? -1 : 0);
      });
      const cols = [{key: 'hazardGroup', label: 'Hazard group'}].concat(OUTCOME_KEYS.map(k => ({key: k, label: k, num: true}))).concat([{key: 'capital', label: 'Total capital', num: true}, {key: 'count', label: 'Projects', num: true}]);
      let html = `<table class="data-table"><thead><tr>${cols.map(c => `<th data-key="${c.key}"${c.num ? ' style="text-align:right"' : ''} class="${sortKey === c.key ? 'sorted' : ''}">${escHtml(c.label)}${sortKey === c.key ? `<span class="sort-arrow">${sortDir === 1 ? '\u25b2' : '\u25bc'}</span>` : ''}</th>`).join('')}</tr></thead><tbody>`;
      items.forEach(h => {
        html += `<tr><td>${escHtml(h.hazardGroup)}</td>${OUTCOME_KEYS.map(k => `<td class="num">${fmtM(h.byOutcome[k])} <span style="color:var(--text-muted);">(${h.countByOutcome[k]})</span></td>`).join('')}
          <td class="num">${fmtM(h.capital)}</td><td class="num">${h.count}</td></tr>`;
      });
      html += '</tbody></table>';
      el.innerHTML = html;
      el.querySelectorAll('th[data-key]').forEach(th => th.addEventListener('click', () => {
        const key = th.getAttribute('data-key');
        if (sortKey === key) sortDir *= -1; else { sortKey = key; sortDir = key === 'hazardGroup' ? 1 : -1; }
        renderMatrix();
      }));
    }
    renderMatrix();
  }

  // ================= Rule-based Q&A chatbot =================
  const SECTOR_KEYWORDS = {
    'Water & Sanitation': ['water', 'sanitation', 'sewage', 'wash'],
    'Housing & Community': ['housing', 'community', 'urban development', 'topside', 'relocation'],
    'Coastal & Marine': ['coastal', 'marine', 'seawall', 'sea wall', 'port', 'shoreline', 'erosion', 'mooring'],
    'Health': ['health', 'medical', 'hospital', 'epidemiolog'],
    'Agriculture & Food': ['agricultur', 'food security', 'farm', 'crop'],
    'Energy': ['energy', 'power', 'solar', 'diesel', 'electricity', 'generator', 'grid'],
    'Multi-Sector (HGI)': ['hgi', 'higher ground initiative', 'multi-sector', 'multi sector'],
    'Governance & Finance': ['governance', 'institutional', 'public finance'],
    'Disaster Risk Reduction': ['disaster', 'drr', 'risk reduction', 'early warning', 'emergency'],
    'Education': ['education', 'school', 'training', 'knowledge brokerage'],
    'Fisheries & Aquaculture': ['fisheries', 'fishery', 'aquaculture', 'milkfish', 'fish'],
    'Environment & Biodiversity': ['environment', 'biodiversity', 'ecosystem', 'invasive species', 'habitat'],
    'Waste Management': ['waste'],
    'Social & Human Development': ['social development', 'human development'],
  };
  const PARTNER_ALIASES = {
    'green climate fund': 'GCF', 'asian development bank': 'ADB', 'foreign affairs and trade': 'DFAT',
    'european union': 'EU', 'japan international cooperation': 'JICA', 'ministry of foreign affairs': 'MFAT',
    'pacific community': 'SPC', 'infrastructure facility': 'PRIF', 'united nations development': 'UNDP',
    'regional environment programme': 'SPREP', 'food and agriculture organi': 'FAO', 'world health organi': 'WHO',
    'disaster risk reduction office': 'UNDRR', 'meteorological organi': 'WMO', 'global environment facility': 'GEF',
    'agricultural development': 'IFAD', 'investment bank': 'EIB',
  };
  function findSector(q){
    for (const s of DATA.bySector) if (q.includes(s.sector.toLowerCase())) return s;
    for (const sectorName in SECTOR_KEYWORDS){
      for (const kw of SECTOR_KEYWORDS[sectorName]){
        if (q.includes(kw)){
          const s = DATA.bySector.find(x => x.sector === sectorName);
          if (s) return s;
        }
      }
    }
    return null;
  }
  function findPartner(q){
    const candidates = DATA.byPartner.slice().sort((a, b) => b.partner.length - a.partner.length);
    for (const p of candidates){
      const name = p.partner.toLowerCase();
      if (name.length <= 4){
        const re = new RegExp('\\b' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
        if (re.test(q)) return p;
      } else if (q.includes(name)){
        return p;
      }
    }
    for (const alias in PARTNER_ALIASES){
      if (q.includes(alias)){
        const p = DATA.byPartner.find(x => x.partner === PARTNER_ALIASES[alias]);
        if (p) return p;
      }
    }
    return null;
  }

  function buildQARules(){
    const di = DATA.deepInsights, k = DATA.kpis, ins = DATA.insights, dup = DATA.duplicates;
    return [
      {
        test: q => /^(hi|hello|hey)\b/.test(q) || /help|what can (you|i) (ask|do)|how does this work/.test(q),
        answer: () => `I can answer questions about the numbers already on this page &mdash; sector totals, funding partners, pipeline stats, hazard groups, duplicates, methodology. Try things like:<ul>
          <li>"How much is committed to Water &amp; Sanitation?"</li>
          <li>"Who is the largest funding partner?"</li>
          <li>"What's the median pipeline line-item size?"</li>
          <li>"Is anything double-counted?"</li>
          <li>"Which hazard groups are still seeking funding?"</li>
        </ul>I only know what's currently loaded into this dashboard, nothing else.`,
      },
      {
        test: q => /(largest|biggest|top|main|number one)\D*(fund(er|ing)?( partner)?|donor|financier)/.test(q),
        answer: () => `<b>${ins.topPartner.name}</b> is the single largest named funding partner, associated with <b>${fmtM(ins.topPartner.capital)}</b> across ${ins.topPartner.mentions} line items. The top 3 partners together touch <b>${ins.top3PartnerShare.toFixed(0)}%</b> of associated capital &mdash; note partners sharing a line are each credited the full line, so this is a reach measure, not an exclusive split.`,
      },
      {
        test: q => /(committ|invest|spend|spent|\bfund|capital|allocat|going (in)?to|how much)/.test(q) && !!findSector(q),
        answer: q => {
          const s = findSector(q), TE = DATA.TRACK_EXISTING, TP = DATA.TRACK_PIPELINE;
          return `<b>${s.sector}</b>: <b>${fmtM(s[TE].capital)}</b> existing/committed (${s[TE].count} line items) and <b>${fmtM(s[TP].capital)}</b> proposed in the RONAdapt&nbsp;II pipeline (${s[TP].count} line items) &mdash; <b>${fmtM(s.totalCapital)}</b> combined.`;
        },
      },
      {
        test: q => /(committ|invest|spend|spent|\bfund|capital|allocat|how much|involve|contribut)/.test(q) && !!findPartner(q),
        answer: q => {
          const p = findPartner(q), TE = DATA.TRACK_EXISTING, TP = DATA.TRACK_PIPELINE;
          const ex = p.capitalByTrack[TE] || 0, pi = p.capitalByTrack[TP] || 0;
          return `<b>${p.partner}</b> is associated with <b>${fmtM(p.capital)}</b> total across ${p.mentions} line items (${fmtM(ex)} existing/committed, ${fmtM(pi)} RONAdapt&nbsp;II pipeline).`;
        },
      },
      {
        test: q => /median.*(pipeline|line.?item|ticket|sub.?project)|(pipeline|line.?item|ticket|sub.?project).*median/.test(q),
        answer: () => `The median RONAdapt&nbsp;II pipeline line-item is <b>${money(di.medianTicket)}</b> (the mean is ${money(di.meanTicket)} &mdash; well above the median, because a small number of large line items pull it up).`,
      },
      {
        test: q => /(mean|average).*(pipeline|line.?item|ticket|sub.?project)/.test(q),
        answer: () => `The mean RONAdapt&nbsp;II pipeline line-item is <b>${money(di.meanTicket)}</b> (median is ${money(di.medianTicket)}).`,
      },
      {
        test: q => /(total|overall|combined|altogether).*(track|capital|invest|fund)|how much.*(total|altogether|combined|everything)/.test(q),
        answer: () => `Total tracked capital across both tracks is <b>${fmtM(k.existingCapital + k.pipelineCapital)}</b>: ${fmtM(k.existingCapital)} existing/committed plus ${fmtM(k.pipelineCapital)} proposed in the RONAdapt&nbsp;II pipeline.${(dup.confirmedRows.length ? ` ${dup.confirmedRows.length} row(s) are flagged as a confirmed overlap though, so the adjusted combined total is closer to <b>${fmtM(di.adjustedCombinedTotal)}</b>.` : '')}`,
      },
      {
        test: q => /(existing|committed)\D*(capital|total|amount)/.test(q),
        answer: () => `Existing/committed capital tracked is <b>${fmtM(k.existingCapital)}</b> across ${k.existingCount} projects.`,
      },
      {
        test: q => /(pipeline|ronadapt)\D*(capital|total|amount|propose)/.test(q),
        answer: () => `The RONAdapt&nbsp;II pipeline proposes <b>${fmtM(k.pipelineCapital)}</b> across ${k.pipelinePrograms} priority activities (${k.pipelineCount} costed sub-projects).`,
      },
      {
        test: q => /(largest|biggest|top)\D*(sector)/.test(q),
        answer: () => ins.top3Sectors.length ? `<b>${ins.top3Sectors[0].sector}</b> is the largest sector by combined capital, at <b>${fmtM(ins.top3Sectors[0].capital)}</b>. The top 3 sectors (${ins.top3Sectors.map(s => s.sector).join(', ')}) account for ${ins.top3Share.toFixed(0)}% of all tracked capital.` : `No sector data is currently loaded.`,
      },
      {
        test: q => /how many sectors|list.*sector|what sectors/.test(q),
        answer: () => `There are <b>${k.sectorsCount}</b> sectors: ${DATA.bySector.map(s => s.sector).join(', ')}.`,
      },
      {
        test: q => /how many (funding )?partners|how many donors/.test(q),
        answer: () => `There are <b>${k.partnersCount}</b> named funding partners across both tracks.`,
      },
      {
        test: q => /(list|which|who are|who is)\D*(partner|donor)/.test(q),
        answer: () => `The largest named partners by associated capital: ${DATA.byPartner.slice(0, 10).map(p => `${p.partner} (${fmtM(p.capital)})`).join(', ')}.`,
      },
      {
        test: q => /how many (projects|activities|line items|sub.?projects|rows)/.test(q),
        answer: () => `There are ${k.existingCount} existing/committed projects and ${k.pipelinePrograms} RONAdapt&nbsp;II priority activities, broken into ${k.pipelineCount} costed sub-projects (${k.existingCount + k.pipelineCount} rows total).`,
      },
      {
        test: q => /back.?load|phase ?3|long.?term.*(share|percent|how much)/.test(q),
        answer: () => di.backloadRatios.length ? `<b>${ins.phase3Share.toFixed(0)}%</b> of RONAdapt&nbsp;II's proposed capital sits in the long-term horizon (Phase 3). The most back-loaded activity is &ldquo;${di.backloadRatios[0].program}&rdquo; at ${isFinite(di.backloadRatios[0].ratio) ? di.backloadRatios[0].ratio.toFixed(1) + '\u00d7' : 'an undefined ratio (no Phase 1 ask)'} more capital in Phase 3 than Phase 1.` : `<b>${ins.phase3Share.toFixed(0)}%</b> of RONAdapt&nbsp;II's proposed capital sits in the long-term horizon (Phase 3).`,
      },
      {
        test: q => /per (capita|person|head)/.test(q),
        answer: () => `Combined tracked capital works out to roughly <b>$${Math.round(di.perCapita.combinedTotal * 1e6 / di.perCapita.population).toLocaleString()}</b> per person, based on an assumed population of ~${di.perCapita.population.toLocaleString()}.`,
      },
      {
        test: q => /double.?count|overlap|duplicat/.test(q),
        answer: () => {
          if (!dup.confirmedRows.length && !dup.possibleRows.length) return `No rows are currently flagged with a Duplicate Status, so there's no known overlap in the loaded data.`;
          let s = '';
          if (dup.confirmedRows.length){
            const names = dup.confirmedRows.map(r => `&ldquo;${r.name}&rdquo; (${fmtM(r.capitalM)})`).join(', ');
            s += `Yes &mdash; ${names} ${dup.confirmedRows.length === 1 ? 'is' : 'are'} flagged as a confirmed overlap${dup.confirmedRows.length === 1 ? '' : 's'} and excluded from the adjusted total. `;
          }
          if (dup.possibleRows.length) s += `${dup.possibleRows.length} more row(s) totalling ${fmtM(dup.reviewCapital)} are flagged as a possible overlap for review, but are not excluded. `;
          s += `Adjusted combined total: <b>${fmtM(di.adjustedCombinedTotal)}</b> (raw ${fmtM(k.existingCapital + k.pipelineCapital)}). See the Duplicates tab for the full list.`;
          return s;
        },
      },
      {
        test: q => /concentrat|single.?funder|depend(s|ence|ent)? on/.test(q),
        answer: () => {
          if (!di.sectorConcentration.length) return `No sector/partner concentration data is available in the current data.`;
          const top = di.sectorConcentration[0];
          return `<b>${top.topPartner}</b> alone supplies <b>${top.topShare.toFixed(0)}%</b> of ${top.sector}'s tracked capital, the most concentrated sector on the dashboard. See the &ldquo;Funder concentration by sector&rdquo; table for the full ranking.`;
        },
      },
      {
        test: q => /unrealiz|aspiration|not (yet )?(funded|secured|committed)|how much.*(secured|realized)/.test(q),
        answer: () => `<b>${di.unrealizedShare.toFixed(0)}%</b> of the existing track (${fmtM(di.unrealizedCap)}) is not yet Completed, Funded, Ongoing, Near completion, or Under implementation. RONAdapt&nbsp;II's pipeline is effectively all &ldquo;Seeking funding,&rdquo; so almost none of its ${fmtM(k.pipelineCapital)} is secured either.`,
      },
      {
        test: q => /continge/.test(q),
        answer: () => `Explicit contingency makes up <b>${di.contingencyShare.toFixed(1)}%</b> of the pipeline, ${fmtM(di.contingencyCapital)}.`,
      },
      {
        test: q => /no partner|unnamed partner|without a partner|tbd partner/.test(q),
        answer: () => `${di.noPartnerCount} pipeline line items (${fmtM(di.noPartnerCapital)}) name no funding partner at all.`,
      },
      {
        test: q => /self.?financ|govern.*(itself|self.?fund)/.test(q),
        answer: () => `The Government of Nauru is named as a partner on ${di.govSelfCount} line items, totalling ${fmtM(di.govSelfCapital)}.`,
      },
      {
        test: q => /where.*(most|invest|money|capital)|which (location|district|area|place)/.test(q),
        answer: () => DATA.byLocation.length ? `<b>${DATA.byLocation[0].location}</b> has the most existing/committed capital on record, <b>${fmtM(DATA.byLocation[0].capital)}</b> across ${DATA.byLocation[0].count} projects. RONAdapt&nbsp;II pipeline sub-projects are costed nationally, not by site.` : `No location data is available.`,
      },
      {
        test: q => /which year|what year|when.*(most|invest|spend)/.test(q),
        answer: () => {
          if (!DATA.yearSeries.length) return `No yearly spend data is available.`;
          const top = DATA.yearSeries.slice().sort((a, b) => b.capital - a.capital)[0];
          return `<b>${top.year}</b> recorded the most existing/committed spend, at <b>${fmtM(top.capital)}</b>.`;
        },
      },
      {
        test: q => /\bstatus(es)?\b/.test(q),
        answer: () => `By status: ${DATA.byStatus.map(s => `${s.status} (${fmtM(s.capital)}, ${s.count} lines)`).join('; ')}.`,
      },
      {
        test: q => /hazard/.test(q),
        answer: () => {
          if (!DATA.hazardOutcome.length) return `No hazard group data is available.`;
          const top = DATA.hazardOutcome[0];
          const funded = top.byOutcome['Funded'] || 0, seeking = top.byOutcome['Seeking funding'] || 0;
          return `<b>${top.hazardGroup}</b> is the largest hazard group by tracked capital, at <b>${fmtM(top.capital)}</b> across ${top.count} projects (${fmtM(funded)} funded, ${fmtM(seeking)} still seeking funding). See the Hazards &amp; Funding Outcomes tab for the full breakdown.`;
        },
      },
      {
        test: q => /gap sector|neglected sector|which sectors.*(gap|neglect)/.test(q),
        answer: () => {
          const gaps = di.pipelineOnlySectors;
          return gaps.length ? `Sectors proposed in the RONAdapt&nbsp;II pipeline with zero existing/committed capital: <b>${gaps.join(', ')}</b>. See the Sectors tab for the full categorisation.` : `No sector is currently pipeline-only.`;
        },
      },
      {
        test: q => /important sector|priority sector|concentration risk/.test(q),
        answer: () => {
          const buckets = computeSectorBuckets(DATA.bySector, DATA.TRACK_EXISTING, DATA.TRACK_PIPELINE).filter(s => s.bucket === 'important');
          return buckets.length ? `Sectors flagged &ldquo;Important&rdquo; on the Sectors tab (high capital, span multiple hazard groups and funders): <b>${buckets.map(s => s.sector).join(', ')}</b>.` : `No sector currently meets the &ldquo;Important&rdquo; bucket criteria.`;
        },
      },
      {
        test: q => /source|methodolog|where.*(data|numbers|figures).*(from|come)/.test(q),
        answer: () => `Built from two tabs of <i>Nauru Project Master List.xlsx</i>: the &ldquo;Project Master List&rdquo; (existing/committed projects, 2017&ndash;2026) and the &ldquo;RONADAPT Project List&rdquo; (RONAdapt&nbsp;II's priority activities broken into costed, phased sub-projects), published to a Google Sheet and read live as CSV. See README.md and the page footer for full methodology notes.`,
      },
    ];
  }

  function answerQuestion(raw){
    const q = raw.trim().toLowerCase();
    if (!q) return null;
    const rules = buildQARules();
    for (const rule of rules){
      if (rule.test(q)) return rule.answer(q);
    }
    return null;
  }

  function initChatbot(){
    const chatFab = document.getElementById('chat-fab');
    const chatPanel = document.getElementById('chat-panel');
    const chatCloseBtn = document.getElementById('chat-close');
    const chatBody = document.getElementById('chat-body');
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');

    const STARTER_QUESTIONS = [
      'How much is committed to Water & Sanitation?',
      'Who is the largest funding partner?',
      "What's the median pipeline line-item size?",
      'Is anything double-counted?',
      'Which hazard group has the most capital?',
    ];

    function addChatMsg(role, html){
      const div = document.createElement('div');
      div.className = 'chat-msg ' + role;
      div.innerHTML = html;
      chatBody.appendChild(div);
      chatBody.scrollTop = chatBody.scrollHeight;
    }
    function addChatSuggestions(){
      const wrap = document.createElement('div');
      wrap.className = 'chat-suggestions';
      wrap.innerHTML = STARTER_QUESTIONS.map(qq => `<button type="button" class="chat-chip">${escHtml(qq)}</button>`).join('');
      chatBody.appendChild(wrap);
      wrap.querySelectorAll('.chat-chip').forEach(btn => btn.addEventListener('click', () => askAndAnswer(btn.textContent)));
      chatBody.scrollTop = chatBody.scrollHeight;
    }
    let chatStarted = false;
    function openChat(){
      chatPanel.classList.add('open');
      chatFab.setAttribute('aria-expanded', 'true');
      if (!chatStarted){
        chatStarted = true;
        addChatMsg('bot', `Hi &mdash; ask me about the figures on this dashboard: sector totals, funding partners, pipeline stats, hazards, duplicates, or methodology. I only answer from what's currently loaded on this page.`);
        addChatSuggestions();
      }
      chatInput.focus();
    }
    function closeChat(){ chatPanel.classList.remove('open'); chatFab.setAttribute('aria-expanded', 'false'); }
    chatFab.addEventListener('click', () => { chatPanel.classList.contains('open') ? closeChat() : openChat(); });
    chatCloseBtn.addEventListener('click', closeChat);

    function askAndAnswer(text){
      const clean = String(text).trim();
      if (!clean) return;
      addChatMsg('user', escHtml(clean));
      const answer = DATA ? answerQuestion(clean) : null;
      if (answer){
        addChatMsg('bot', answer);
      } else if (!DATA){
        addChatMsg('bot', `Data is still loading &mdash; try again in a moment.`);
      } else {
        addChatMsg('bot', `I don't have an answer for that from this dashboard's data. I can only answer questions about what's shown here &mdash; sector and partner totals, pipeline stats, phasing, hazards, and methodology. Try one of these:`);
        addChatSuggestions();
      }
    }
    chatForm.addEventListener('submit', e => {
      e.preventDefault();
      const v = chatInput.value;
      chatInput.value = '';
      askAndAnswer(v);
    });
  }

  // ================= Boot =================
  async function boot(){
    showBannerLoading();
    try {
      const {text, source} = await loadCSVText();
      const objs = csvToObjects(text);
      ROWS = objs.map(normalizeRow).filter(r => r.track);
      DATA = computeAll(ROWS);
      showBannerLoaded(source, ROWS.length);
      renderOverview();
      renderProjectsTab();
      renderSectorsTab();
      renderDuplicatesTab();
      renderHazardsTab();
    } catch (err){
      console.error('[nauru-dashboard] boot failed:', err);
      showBannerError(err);
    }
  }
  document.getElementById('data-reload-btn').addEventListener('click', () => { boot(); });
  initChatbot();
  boot();

})();
