/* ============================================================
 * RETROPOLIS — Hauptspiel v3
 * Chunk-Renderer (nur Geändertes wird neu gebacken),
 * i18n (DE/EN), Wachstums-Diagnose, Overlay-Muster (A11y),
 * Touch-Bestätigung, Autos & Züge, Tag/Nacht, Undo/Redo,
 * Berater, Statistik, Szenarien, Save-Slots, Import/Export.
 * ============================================================ */
'use strict';

(() => {

  const SLOT_KEYS = ['retropolis.slot1', 'retropolis.slot2', 'retropolis.slot3'];
  const LEGACY_KEY = 'retropolis.save';
  const LAST_SLOT_KEY = 'retropolis.lastSlot';
  const t = (k, p) => I18N.t(k, p);

  // ---------- Zustand ----------
  let sim = null;
  let cam = { x: 0, y: 0, zoom: 2 };
  let speed = 1;
  let prevSpeed = 1;
  let tool = 'point';
  let overlay = '';
  let hover = { x: -1, y: -1 };
  let drag = null;
  let panning = null;
  let selected = null;
  let tickTimer = null;
  let running = false;
  let tutorialShown = false;
  let currentSlot = 0;
  let nightEnabled = true;
  let lastFrame = 0;
  let touchConfirmMode = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  let pendingTap = null;

  // Undo/Redo
  const undoStack = [], redoStack = [];
  const UNDO_MAX = 60;

  // Fahrzeuge (rein visuell)
  let cars = [];
  let trains = [];
  let ships = [];   // fahren auf dem Wasser (bei Häfen)
  let planes = [];  // fliegen über die Karte (bei Flughäfen)
  let lastCarSpawn = 0;
  let lastAirSpawn = 0;

  // Berater
  const advisorQueue = [];
  let advisorTimer = null;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const mini = document.getElementById('minimap');
  const mctx = mini.getContext('2d');

  const $ = (id) => document.getElementById(id);

  // ---------- Szenarien ----------
  const SCENARIOS = [
    { id: 'free' },
    { id: 'sandbox' },
    { id: 'sprint', goal: { minPop: 1000, years: 5 } },
    { id: 'green', goal: { minPop: 2000, minHappy: 55, years: 10, noCoal: true } },
    { id: 'broke', goal: { minPop: 1500, minHappy: 50, years: 8 }, fixedSeed: 777, fixedSize: 64 },
  ];
  let ngScenario = 'free';

  // ---------- Werkzeuge ----------
  const TOOLS = [
    { id: 'point',    key: '1', mode: 'point' },
    { id: 'dozer',    key: '2', mode: 'paint', cost: 1 },
    { id: 'road',     key: '3', mode: 'line', s: S_ROAD },
    { id: 'rail',     mode: 'line', s: S_RAIL },
    { id: 'highway',  mode: 'line', s: S_HIGHWAY },
    { id: 'wire',     key: '4', mode: 'line', s: S_WIRE },
    { id: 'pipe',     mode: 'line', s: S_PIPE },
    { id: 'busstop',  mode: 'single', s: S_BUSSTOP },
    { id: 'trainstation', mode: 'single', s: S_TRAINSTATION },
    { id: 'subway',   mode: 'single', s: S_SUBWAY },
    { id: 'rz',       key: '5', mode: 'rect', s: S_RZONE },
    { id: 'cz',       key: '6', mode: 'rect', s: S_CZONE },
    { id: 'iz',       key: '7', mode: 'rect', s: S_IZONE },
    { id: 'wind',     key: '8', mode: 'single', s: S_WIND },
    { id: 'coal',     key: '9', mode: 'single', s: S_COAL },
    { id: 'solar',    mode: 'single', s: S_SOLAR },
    { id: 'nuclear',  mode: 'single', s: S_NUCLEAR },
    { id: 'wtower',   mode: 'single', s: S_WTOWER },
    { id: 'pump',     mode: 'single', s: S_PUMP },
    { id: 'landfill', mode: 'single', s: S_LANDFILL },
    { id: 'inciner',  mode: 'single', s: S_INCINER },
    { id: 'recycle',  mode: 'single', s: S_RECYCLE },
    { id: 'port',     mode: 'single', s: S_PORT },
    { id: 'airport',  mode: 'single', s: S_AIRPORT },
    { id: 'park',     key: '0', mode: 'single', s: S_PARK },
    { id: 'police',   mode: 'single', s: S_POLICE },
    { id: 'firedep',  mode: 'single', s: S_FIREDEP },
    { id: 'school',   mode: 'single', s: S_SCHOOL },
    { id: 'hospital', mode: 'single', s: S_HOSPITAL },
    { id: 'stadium',  mode: 'single', s: S_STADIUM },
    { id: 'townhall', mode: 'single', s: S_TOWNHALL },
    { id: 'monument', mode: 'single', s: S_MONUMENT },
    { id: 'casino',   mode: 'single', s: S_CASINO },
    { id: 'hotel',    mode: 'single', s: S_HOTEL },
    { id: 'amuse',    mode: 'single', s: S_AMUSE },
  ];
  const toolById = {};
  TOOLS.forEach(tl => toolById[tl.id] = tl);

  function toolSprite(tl, frame) {
    switch (tl.id) {
      case 'road': return Sprites.get('road', 10);
      case 'rail': return Sprites.get('rail', 10);
      case 'highway': return Sprites.get('highway', 10);
      case 'wire': return Sprites.get('wire', 10);
      case 'pipe': return Sprites.get('pipe', 10);
      case 'rz': return Sprites.store.zoneR;
      case 'cz': return Sprites.store.zoneC;
      case 'iz': return Sprites.store.zoneI;
      case 'wind': return Sprites.get('wind', frame || 0);
      case 'coal': return Sprites.store.coal;
      case 'solar': return Sprites.store.solar;
      case 'port': return Sprites.store.port;
      case 'busstop': return Sprites.store.busstop;
      case 'trainstation': return Sprites.store.trainstation;
      case 'subway': return Sprites.store.subway;
      case 'wtower': return Sprites.store.wtower;
      case 'pump': return Sprites.store.pump;
      case 'park': return Sprites.store.park;
      case 'police': return Sprites.store.police;
      case 'firedep': return Sprites.store.firedep;
      case 'school': return Sprites.store.school;
      case 'hospital': return Sprites.store.hospital;
      case 'stadium': return Sprites.store.stadium;
      case 'townhall': return Sprites.store.townhall;
      case 'monument': return Sprites.store.monument;
      case 'casino': return Sprites.store.casino;
      case 'hotel': return Sprites.store.hotel;
      case 'amuse': return Sprites.store.amuse;
      case 'landfill': return Sprites.store.landfill;
      case 'inciner': return Sprites.store.inciner;
      case 'recycle': return Sprites.store.recycle;
      case 'airport': return Sprites.store.airport;
      case 'nuclear': return Sprites.store.nuclear;
    }
    return null;
  }

  let BOLT = null, DROP = null, HATCH = null;
  function makeIcons() {
    BOLT = Sprites.art([
      '..Kyy.',
      '.Kyyy.',
      'Kyyyy.',
      '.KKyy.',
      '..Ky..',
      '..K...',
    ]);
    DROP = Sprites.art([
      '..b..',
      '.bbb.',
      'bbcbb',
      'bbbbb',
      '.bbb.',
    ]);
    // Schraffur-Muster für „Problem“-Overlays (Farbenblind-tauglich)
    HATCH = document.createElement('canvas');
    HATCH.width = 8; HATCH.height = 8;
    const hx = HATCH.getContext('2d');
    hx.strokeStyle = 'rgba(0,0,0,0.8)';
    hx.lineWidth = 1.4;
    hx.beginPath();
    hx.moveTo(-2, 6); hx.lineTo(6, -2);
    hx.moveTo(2, 10); hx.lineTo(10, 2);
    hx.stroke();
  }

  function iconFor(tl) {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 16;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    if (tl.id === 'point') {
      x.fillStyle = '#f2f2ef';
      for (let j = 0; j < 9; j++) x.fillRect(3, 2 + j, Math.min(j + 1, 6), 1);
      x.fillRect(6, 10, 2, 3);
      x.fillStyle = '#1a1a29';
      x.fillRect(3, 1, 1, 10);
    } else if (tl.id === 'dozer') {
      x.strokeStyle = '#ff6b6b'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(3, 3); x.lineTo(13, 13); x.moveTo(13, 3); x.lineTo(3, 13); x.stroke();
    } else {
      const s = toolSprite(tl, 0);
      x.drawImage(s, 0, 0, s.width, s.height, 0, 0, 16, 16);
    }
    return c.toDataURL();
  }

  // ---------- i18n auf statisches DOM anwenden ----------
  function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    $('btnLoan').textContent = t('ui.loan');
    $('btnRepay').textContent = t('ui.repay');
    $('btnTcOk').textContent = t('ui.build');
    $('btnTcCancel').textContent = t('ui.abort');
    $('btnCamera').title = t('ui.camera');
    $('langSel').value = I18N.lang;
    buildToolbar();
    if (running) selectTool(tool);
  }

  // ---------- Toolbar ----------
  function buildToolbar() {
    const bar = $('toolbar');
    bar.innerHTML = '';
    TOOLS.forEach(tl => {
      const d = document.createElement('div');
      d.className = 'tool';
      d.id = 'tool_' + tl.id;
      const cost = tl.s ? DEFS[tl.s].cost : (tl.cost || 0);
      d.innerHTML =
        (tl.key ? '<span class="tKey">' + tl.key + '</span>' : '') +
        '<img src="' + iconFor(tl) + '" alt="">' +
        '<span class="tName">' + t('t.' + tl.id) + '</span>' +
        '<span class="tCost">' + (cost ? cost + '€' : '&nbsp;') + '</span>';
      d.title = tl.s ? t(DEFS[tl.s].name) : (tl.id === 'dozer' ? t('t.dozerTip') : t('t.pointTip'));
      d.addEventListener('click', () => { selectTool(tl.id); Sound.sfx.click(); });
      bar.appendChild(d);
    });
  }

  function selectTool(id) {
    const tl = toolById[id];
    if (tl.s && DEFS[tl.s].minPop && sim && sim.pop < DEFS[tl.s].minPop) {
      toast(t('ui.locked', { name: t(DEFS[tl.s].name), n: DEFS[tl.s].minPop }), 'bad');
      Sound.sfx.error();
      return;
    }
    if (tl.s && DEFS[tl.s].minYear && sim && sim.year < DEFS[tl.s].minYear) {
      toast('🔒 ' + t('err.minYear', { y: DEFS[tl.s].minYear }), 'bad');
      Sound.sfx.error();
      return;
    }
    tool = id;
    clearPendingTap();
    document.querySelectorAll('.tool').forEach(el => el.classList.remove('active'));
    const el = $('tool_' + id);
    if (el) el.classList.add('active');
    if (id !== 'point') { selected = null; $('infoPanel').classList.add('hidden'); }
  }

  // ---------- Meldungen ----------
  function toast(msg, type) {
    const box = document.createElement('div');
    box.className = 'toast' + (type ? ' ' + type : '');
    box.textContent = msg;
    $('toasts').appendChild(box);
    setTimeout(() => box.classList.add('fadeout'), 3800);
    setTimeout(() => box.remove(), 4500);
  }

  // ---------- Berater ----------
  function showAdvisor(key) {
    advisorQueue.push(key);
    if (!advisorTimer) nextAdvisor();
  }
  function nextAdvisor() {
    const box = $('advisorBox');
    if (advisorQueue.length === 0) { box.classList.add('hidden'); advisorTimer = null; return; }
    const key = advisorQueue.shift();
    const face = $('advisorFace');
    const fx = face.getContext('2d');
    fx.clearRect(0, 0, 16, 16);
    // Manche Berater teilen ein Porträt (gleiche Person/Ressort)
    const PORTRAIT = { watershort: 'water', tourism: 'finance', garbage: 'env', crime: 'fire' };
    const spr = Sprites.store.advisors[PORTRAIT[key] || key];
    if (spr) fx.drawImage(spr, 0, 0);
    $('advisorName').textContent = t('adv.' + key);
    $('advisorText').textContent = t('advmsg.' + key);
    box.classList.remove('hidden');
    Sound.sfx.click();
    advisorTimer = setTimeout(nextAdvisor, 14000);
  }
  $('btnAdvisorOk').addEventListener('click', () => {
    clearTimeout(advisorTimer); advisorTimer = null;
    $('advisorBox').classList.add('hidden');
    if (advisorQueue.length) nextAdvisor();
  });

  // ============================================================
  // BÜRGER: ein benannter Beispiel-Haushalt pro bewohntem Haus,
  // deterministisch aus Seed + Kachel erzeugt (nichts gespeichert).
  // ============================================================
  const FIRST = ['Herta', 'Klaus', 'Sabine', 'Jürgen', 'Petra', 'Detlef', 'Anke', 'Bernd',
    'Uschi', 'Holger', 'Silke', 'Ralf', 'Gabi', 'Torsten', 'Heike', 'Uwe',
    'Manu', 'Sven', 'Birgit', 'Olaf', 'Tanja', 'Frank', 'Steffi', 'Dirk'];
  const LAST = ['Kowalski', 'Meier', 'Schulze', 'Brandt', 'Neumann', 'Krüger', 'Vogel', 'Böhm',
    'Sauer', 'Pfeiffer', 'Lorenz', 'Haas', 'Winkler', 'Sommer', 'Krause', 'Busch',
    'Otto', 'Ludwig', 'Simon', 'Albrecht'];

  function rng32(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let v = Math.imul(a ^ a >>> 15, 1 | a);
      v = v + Math.imul(v ^ v >>> 7, 61 | v) ^ v;
      return ((v ^ v >>> 14) >>> 0) / 4294967296;
    };
  }

  function citizenOf(i) {
    if (!sim || sim.st[i] !== S_RZONE || sim.lvl[i] === 0) return null;
    const r = rng32(sim.seed ^ Math.imul(i + 1, 2654435761));
    const name = FIRST[(r() * FIRST.length) | 0] + ' ' + LAST[(r() * LAST.length) | 0];
    const age = Math.min(99, 18 + ((r() * 50) | 0) + Math.max(0, sim.year - sim.startYear));
    let jobKey = 'cit.job.none', workXY = null;
    const w = sim.workOf[i];
    if (w >= 0) {
      const wx = w % sim.w, wy = (w / sim.w) | 0;
      for (const [nx, ny] of [[wx, wy - 1], [wx + 1, wy], [wx, wy + 1], [wx - 1, wy]]) {
        if (!sim.inMap(nx, ny)) continue;
        const s2 = sim.st[sim.idx(nx, ny)];
        if (s2 === S_CZONE && sim.lvl[sim.idx(nx, ny)] > 0) { jobKey = 'cit.job.shop'; workXY = [nx, ny]; break; }
        if (s2 === S_IZONE && sim.lvl[sim.idx(nx, ny)] > 0) { jobKey = 'cit.job.factory'; workXY = [nx, ny]; break; }
      }
    }
    let mood = 'cit.mood.happy';
    if (!sim.powered[i]) mood = 'cit.mood.power';
    else if (sim.lvl[i] >= 2 && sim.covWater[i] < 20) mood = 'cit.mood.water';
    else if (sim.crime[i] > 55) mood = 'cit.mood.crime';
    else if (sim.poll[i] > 30) mood = 'cit.mood.poll';
    else if (sim.jamNear[i] > 70) mood = 'cit.mood.jam';
    else if (sim.covPark[i] < 10) mood = 'cit.mood.park';
    // Wohlstand aus Landwert + Wohn-Level
    const wv = sim.landv[i] + sim.lvl[i] * 6;
    const wealthKey = wv > 70 ? 'cit.wealth.rich' : wv > 42 ? 'cit.wealth.mid' : 'cit.wealth.poor';
    return { name, age, jobKey, workXY, mood, wealthKey, home: i, x: i % sim.w, y: (i / sim.w) | 0,
      commute: sim.commuteDist[i] };
  }

  // Stadtweite Kennzahlen (für Einwohner-Panel, Dashboard, Debug-API)
  function citySummary() {
    const s = sim;
    if (!s) return null;
    const workers = Math.round(s.pop * BAL.DEMAND.WORKER_SHARE);
    return {
      pop: s.pop, jobs: s.jobs, cJobs: s.cJobs, iJobs: s.iJobs,
      workers, employed: Math.min(workers, s.jobs), unemployed: Math.max(0, workers - s.jobs),
      happiness: s.happiness, econ: s.econ,
      tourists: s.tourists, touristCap: s.touristCap,
      garbageProduced: s.garbageProduced, garbageCap: s.garbageCap, garbageOverflow: s.garbageOverflow,
      avgCrime: Math.round(s.avgCrime), eduLevel: Math.round(s.eduLevel * 100),
      exportBase: Math.round(s.exportBase),
      power: { need: s.powerNeed, supply: s.powerSupply },
      water: { need: s.waterNeed, supply: s.waterSupply },
      ext: s.extRoadTotal + s.extRailTotal + s.extHwyTotal + s.portTotal + s.airportTotal,
    };
  }

  // Kamera auf eine Kachel zentrieren (für Sprünge aus Panels)
  function centerOnTile(x, y) {
    if (!sim) return;
    cam.x = (x + 0.5) * TILE - canvas.width / cam.zoom / 2;
    cam.y = (y + 0.5) * TILE - canvas.height / cam.zoom / 2;
    clampCam();
  }

  // ---------- Einwohner-Panel: Demografie + Stichprobe echter Bürger:innen ----------
  function renderResidents() {
    if (!sim) return;
    const sum = citySummary();
    const homes = [];
    for (let i = 0; i < sim.w * sim.h; i++) if (sim.st[i] === S_RZONE && sim.lvl[i] > 0) homes.push(i);
    const face = sum.happiness > 66 ? '😀' : sum.happiness > 40 ? '🙂' : sum.happiness > 20 ? '😐' : '😠';
    let html = '<div class="resSummary">' +
      '<div>👤 <b>' + sum.pop + '</b> ' + t('ui.pop') + '</div>' +
      '<div>' + face + ' ' + sum.happiness + '% ' + t('ui.happy') + '</div>' +
      '<div>💼 ' + sum.employed + '/' + sum.workers + ' ' + t('res.employed') + '</div>' +
      '<div>🚧 ' + sum.unemployed + ' ' + t('res.unemployed') + '</div>' +
      '<div>🎓 ' + sum.eduLevel + '% ' + t('ui.eduLbl') + '</div>' +
      '<div>🧳 ' + sum.tourists + ' ' + t('ui.tourists') + '</div>' +
      '</div>';
    if (!homes.length) html += '<div class="resEmpty">' + t('res.none') + '</div>';
    else {
      // Stichprobe ziehen
      const pool = homes.slice(), sample = [];
      for (let k = 0; k < 10 && pool.length; k++) sample.push(pool.splice((Math.random() * pool.length) | 0, 1)[0]);
      html += '<div class="resHint">' + t('res.hint') + '</div><div class="resList">';
      for (const i of sample) {
        const c = citizenOf(i);
        if (!c) continue;
        html += '<div class="resRow" data-x="' + c.x + '" data-y="' + c.y + '">' +
          '<b>' + c.name + '</b> <span class="resMeta">· ' + t('cit.age', { n: c.age }) + ' · ' + t(c.wealthKey) + '</span><br>' +
          '<span class="resMeta">' + t(c.jobKey) +
          (c.commute >= 0 && c.jobKey !== 'cit.job.none' ? ' · ' + t('cit.commute', { n: c.commute }) : '') +
          ' · 🏠 ' + c.x + ',' + c.y + '</span> <span class="resMood">„' + t(c.mood) + '“</span></div>';
      }
      html += '</div>';
    }
    $('residentsList').innerHTML = html;
    $('residentsList').querySelectorAll('.resRow').forEach(row => {
      row.addEventListener('click', () => {
        const x = +row.dataset.x, y = +row.dataset.y;
        selectTool('point'); selectTile(x, y); centerOnTile(x, y); Sound.sfx.click();
      });
    });
  }

  function randomCitizen() {
    if (!sim) return null;
    const homes = [];
    for (let i = 0; i < sim.w * sim.h; i++)
      if (sim.st[i] === S_RZONE && sim.lvl[i] > 0) homes.push(i);
    if (!homes.length) return null;
    const i = homes[(Math.random() * homes.length) | 0];
    return Object.assign({ home: i }, citizenOf(i));
  }

  // ---------- Zeitung: Retropolis Kurier ----------
  const newsFeed = [];
  function pushNews(txt) {
    newsFeed.unshift({ d: sim ? sim.dateStr() : '', txt });
    if (newsFeed.length > 16) newsFeed.pop();
  }
  function monthlyNews() {
    if (!sim || Math.random() < 0.45) return;
    const c = randomCitizen();
    if (!c) return;
    if (sim.brownout) pushNews(t('news.power', { cit: c.name }));
    else if (c.commute > 18) pushNews(t('news.jam', { cit: c.name, n: c.commute }));
    else if ((sim.avgPollR || 0) > 28) pushNews(t('news.poll', { cit: c.name }));
    else if (sim.taxRate > 12) pushNews(t('news.tax', { cit: c.name }));
    else if (sim.happiness > 60) pushNews(t('news.nice', { cit: c.name, name: sim.cityName }));
  }
  const NEWS_BY_EVENT = {
    'ev.fire': 'news.fire', 'ev.tornado': 'news.tornado', 'ev.flood': 'news.flood',
    'ev.ufo': 'news.ufo', 'ev.broke': 'news.broke',
    'ev.era94': 'news.era', 'ev.era98': 'news.era', 'ev.era00': 'news.era', 'ev.era02': 'news.era',
    'ev.scenWon': 'news.scen', 'ev.scenLost': 'news.scen',
    'ev.boom': 'news.boom', 'ev.bust': 'news.bust',
  };

  // ---------- Stadt als Link teilen ----------
  function b64urlEncode(str) {
    return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlDecode(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return decodeURIComponent(escape(atob(s)));
  }
  function shareLink() {
    return location.origin + location.pathname + '#city=' + b64urlEncode(sim.serialize());
  }
  function tryImportCode(code) {
    let s = String(code).trim();
    const m = s.match(/#city=([A-Za-z0-9\-_]+)/);
    if (m) s = m[1]; else s = s.replace(/^city=/, '');
    return Sim.load(b64urlDecode(s)); // wirft bei ungültigem Code
  }

  // ---------- Cheat-Codes (90er!) ----------
  const cheatBuf = [];
  let discoUntil = 0;
  const CHEATS = [
    { seq: ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'],
      fn: () => { sim.money += 10000; sim.cheated = true; cheatToast(t('cheat.money', { n: 10000 })); Sound.sfx.milestone(); } },
    { seq: [...'geld'], fn: () => { sim.money += 5000; sim.cheated = true; cheatToast(t('cheat.money', { n: 5000 })); Sound.sfx.cash(); } },
    { seq: [...'ufo'], fn: () => { sim.cheated = true; sim.spawnUfo(); drainEvents(); cheatToast(t('cheat.ufo')); } },
    { seq: [...'sturm'], fn: () => { sim.cheated = true; sim.spawnTornado(); drainEvents(); cheatToast(t('cheat.storm')); } },
    { seq: [...'disco'], fn: () => { discoUntil = performance.now() + 9000; cheatToast(t('cheat.disco')); Sound.sfx.milestone(); } },
  ];
  function cheatToast(what) { toast(t('cheat.on', { what }), 'milestone'); }
  function checkCheats() {
    for (const c of CHEATS) {
      if (cheatBuf.length < c.seq.length) continue;
      if (cheatBuf.slice(-c.seq.length).join(',') === c.seq.join(',')) {
        cheatBuf.length = 0;
        c.fn();
        return;
      }
    }
  }

  // ---------- Kamera ----------
  function screenToTile(px, py) {
    return {
      x: Math.floor((px / cam.zoom + cam.x) / TILE),
      y: Math.floor((py / cam.zoom + cam.y) / TILE),
    };
  }
  function clampCam() {
    if (!sim) return;
    const vw = canvas.width / cam.zoom, vh = canvas.height / cam.zoom;
    cam.x = Math.max(-TILE * 4, Math.min(sim.w * TILE - vw + TILE * 4, cam.x));
    cam.y = Math.max(-TILE * 4, Math.min(sim.h * TILE - vh + TILE * 4, cam.y));
  }
  function centerCam() {
    cam.x = sim.w * TILE / 2 - canvas.width / cam.zoom / 2;
    cam.y = sim.h * TILE / 2 - canvas.height / cam.zoom / 2;
    clampCam();
  }

  // ---------- Bau-Hilfen ----------
  function linePath(x0, y0, x1, y1) {
    const path = [];
    const dx = Math.sign(x1 - x0), dy = Math.sign(y1 - y0);
    let x = x0, y = y0;
    path.push([x, y]);
    if (Math.abs(x1 - x0) >= Math.abs(y1 - y0)) {
      while (x !== x1) { x += dx; path.push([x, y]); }
      while (y !== y1) { y += dy; path.push([x, y]); }
    } else {
      while (y !== y1) { y += dy; path.push([x, y]); }
      while (x !== x1) { x += dx; path.push([x, y]); }
    }
    return path;
  }
  function rectTiles(x0, y0, x1, y1) {
    const tiles = [];
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) tiles.push([x, y]);
    return tiles;
  }

  function previewTiles() {
    if (!drag) {
      if (pendingTap) return [[pendingTap.x, pendingTap.y]];
      if (hover.x < 0) return null;
      const tl = toolById[tool];
      if (tl.mode === 'single' || tl.mode === 'line' || tl.mode === 'rect' || tl.mode === 'paint')
        return [[hover.x, hover.y]];
      return null;
    }
    const tl = toolById[tool];
    if (tl.mode === 'line') return linePath(drag.x0, drag.y0, drag.x1, drag.y1);
    if (tl.mode === 'rect') return rectTiles(drag.x0, drag.y0, drag.x1, drag.y1);
    return [[drag.x1, drag.y1]];
  }

  // ---------- Undo / Redo ----------
  function snapTiles(indices) {
    return indices.map(i => ({
      i, st: sim.st[i], lvl: sim.lvl[i], anchor: sim.anchor[i],
      burn: sim.burn[i], terr: sim.terr[i],
    }));
  }
  function applySnap(snaps) {
    for (const s of snaps) {
      sim.st[s.i] = s.st; sim.lvl[s.i] = s.lvl; sim.anchor[s.i] = s.anchor;
      sim.burn[s.i] = s.burn; sim.terr[s.i] = s.terr;
      sim.markChanged(s.i);
    }
  }
  function recomputeAfterSnap() {
    sim.dirtyPower = true; sim.dirtyCov = true; sim.dirtyCommute = true;
    sim.computePower(); sim.computeCoverage(); sim.computeRoadAccess();
    sim.computeCommute(); sim.computeStats();
  }
  function affectedIndices(tool_, x, y) {
    const tl = toolById[tool_];
    if (tl.id === 'dozer') {
      const i = sim.idx(x, y);
      if (sim.st[i] === S_NONE) return [i];
      return sim.footprint(i);
    }
    const size = (tl.s && DEFS[tl.s].size === 2) ? 2 : 1;
    const idxs = [];
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++)
      if (sim.inMap(x + dx, y + dy)) idxs.push(sim.idx(x + dx, y + dy));
    return idxs;
  }
  function pushUndo(action) {
    undoStack.push(action);
    if (undoStack.length > UNDO_MAX) undoStack.shift();
    redoStack.length = 0;
    updateUndoButtons();
  }
  function doUndo() {
    const a = undoStack.pop();
    if (!a) { Sound.sfx.error(); return; }
    for (let k = a.parts.length - 1; k >= 0; k--) applySnap(a.parts[k].before);
    recomputeAfterSnap();
    sim.money += a.money;
    redoStack.push(a);
    updateUndoButtons();
    Sound.sfx.dozer();
    toast(t('ui.undo', { v: a.money }));
  }
  function doRedo() {
    const a = redoStack.pop();
    if (!a) { Sound.sfx.error(); return; }
    for (const p of a.parts) applySnap(p.after);
    recomputeAfterSnap();
    sim.money -= a.money;
    undoStack.push(a);
    updateUndoButtons();
    Sound.sfx.place();
    toast(t('ui.redo', { v: a.money }));
  }
  function updateUndoButtons() {
    $('btnUndo').style.opacity = undoStack.length ? 1 : 0.4;
    $('btnRedo').style.opacity = redoStack.length ? 1 : 0.4;
  }

  function commitBuild(tiles) {
    const tl = toolById[tool];
    tiles = tiles || previewTiles() || [];
    let built = 0, spent = 0, lastReason = '', lastParams = null;
    const parts = [];
    for (const [x, y] of tiles) {
      if (!sim.inMap(x, y)) continue;
      const idxs = affectedIndices(tool, x, y);
      const before = snapTiles(idxs);
      let r;
      if (tl.id === 'dozer') r = sim.bulldoze(x, y);
      else if (tl.s) r = sim.place(tl.s, x, y);
      else continue;
      if (r.ok) {
        built++; spent += r.cost;
        parts.push({ before, after: snapTiles(idxs) });
      } else if (r.reason !== 'err.exists') { lastReason = r.reason; lastParams = r.params; }
    }
    if (built > 0) {
      pushUndo({ parts, money: spent });
      if (tl.id === 'dozer') Sound.sfx.dozer();
      else if (tl.id === 'road' || tl.id === 'rail') Sound.sfx.road();
      else if (tl.id === 'wire' || tl.id === 'pipe') Sound.sfx.wire();
      else if (tl.mode === 'rect') Sound.sfx.zone();
      else Sound.sfx.place();
      maybeTutorial(tl);
    } else if (lastReason) {
      toast('❌ ' + t(lastReason, lastParams), 'bad');
      Sound.sfx.error();
    }
  }

  const tutSeen = {};
  function maybeTutorial(tl) {
    if (!tutorialShown) return;
    if ((tl.id === 'wind' || tl.id === 'coal') && !tutSeen.power) {
      tutSeen.power = true; toast(t('ui.tipPower'));
    } else if (tl.mode === 'rect' && !tutSeen.zone) {
      tutSeen.zone = true; toast(t('ui.tipZoneReq'));
    } else if ((tl.id === 'wtower' || tl.id === 'pump') && !tutSeen.water) {
      tutSeen.water = true; toast(t('ui.tipWater2'));
    }
  }

  // ============================================================
  // LINIENVERWALTUNG (Bus / Zug / U-Bahn)
  // ============================================================
  let transitPick = null;          // Linien-ID im Stopp-Klick-Modus
  const TYPE_ICON = { bus: '🚌', train: '🚆', sub: '🚇' };

  function lineName(L) { return L.name || (t('tr.line') + ' ' + L.id); }

  function openTransit() {
    if (!sim) return;
    $('transitPanel').classList.toggle('hidden');
    renderLines();
    Sound.sfx.click();
  }

  function startPicking(lineId) {
    const L = sim.lines.find(l => l.id === lineId);
    if (!L) return;
    transitPick = lineId;
    $('transitPanel').classList.remove('hidden');
    $('transitPickBar').classList.remove('hidden');
    $('transitPickText').textContent = t('tr.picking', { what: t(DEFS[Sim.stopTypeFor(L.type)].name) });
    selectTool('point');
    renderLines();
  }
  function endPicking() {
    transitPick = null;
    $('transitPickBar').classList.add('hidden');
    renderLines();
  }
  $('btnPickDone').addEventListener('click', () => { endPicking(); Sound.sfx.click(); });

  function newLine(type) {
    if (!sim) return;
    const stopType = Sim.stopTypeFor(type);
    let hasStops = false;
    for (let i = 0; i < sim.w * sim.h; i++) if (sim.st[i] === stopType) { hasStops = true; break; }
    if (!hasStops) toast(t('tr.needStops'));
    const L = sim.createLine(type);
    startPicking(L.id);
    Sound.sfx.place();
  }
  $('btnNewBus').addEventListener('click', () => newLine('bus'));
  $('btnNewTrain').addEventListener('click', () => newLine('train'));
  $('btnNewSub').addEventListener('click', () => newLine('sub'));
  $('btnTransit').addEventListener('click', openTransit);

  function renderLines() {
    if (!sim) return;
    const list = $('lineList');
    list.innerHTML = '';
    sim.lines.forEach(L => {
      const row = document.createElement('div');
      row.className = 'lineRow' + (transitPick === L.id ? ' picking' : '');
      const head = document.createElement('div');
      head.className = 'lineHead';
      head.innerHTML = '<span class="chip" style="background:' + L.color + '"></span>' +
        '<span class="lineName">' + TYPE_ICON[L.type] + ' ' + lineName(L) + '</span>';
      head.title = t('tr.rename');
      head.addEventListener('click', () => {
        const nn = prompt(t('tr.rename'), lineName(L));
        if (nn) { L.name = nn.slice(0, 20); renderLines(); }
      });
      row.appendChild(head);
      const meta = document.createElement('div');
      meta.className = 'lineMeta';
      meta.textContent = t('tr.stops', { n: L.stops.length }) + ' · ' + t('tr.riders', { n: L.riders || 0 });
      row.appendChild(meta);
      if (L.active === false) {
        const warn = document.createElement('div');
        warn.className = 'lineWarn';
        warn.textContent = t('tr.inactive');
        row.appendChild(warn);
      }
      const btns = document.createElement('div');
      btns.className = 'lineBtns';
      const add = document.createElement('button');
      add.className = 'btn'; add.textContent = t('tr.addStop');
      add.addEventListener('click', () => startPicking(L.id));
      const undo = document.createElement('button');
      undo.className = 'btn'; undo.textContent = t('tr.undoStop');
      undo.addEventListener('click', () => { sim.removeLastStop(L.id); sim.computeCommute(); renderLines(); });
      const del = document.createElement('button');
      del.className = 'btn'; del.textContent = t('tr.delete');
      del.addEventListener('click', () => {
        if (!confirm(t('tr.delConfirm', { name: lineName(L) }))) return;
        if (transitPick === L.id) endPicking();
        sim.deleteLine(L.id);
        sim.computeCommute();
        renderLines();
        Sound.sfx.dozer();
      });
      btns.append(add, undo, del);
      row.appendChild(btns);
      list.appendChild(row);
    });
  }
  setInterval(() => {
    if (sim && !$('transitPanel').classList.contains('hidden') && !transitPick) renderLines();
  }, 2500);

  // ---------- Touch-Bestätigung ----------
  function clearPendingTap() {
    pendingTap = null;
    $('touchConfirm').classList.add('hidden');
  }
  function showTouchConfirm(px, py) {
    const tc = $('touchConfirm');
    tc.classList.remove('hidden');
    tc.style.left = Math.min(window.innerWidth - 160, Math.max(8, px - 70)) + 'px';
    tc.style.top = Math.min(window.innerHeight - 120, py + 24) + 'px';
  }
  $('btnTcOk').addEventListener('click', () => {
    if (pendingTap) commitBuild([[pendingTap.x, pendingTap.y]]);
    clearPendingTap();
  });
  $('btnTcCancel').addEventListener('click', clearPendingTap);

  // ---------- Eingabe: Maus ----------
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  canvas.addEventListener('mousedown', (e) => {
    Sound.unlock();
    if (e.button === 2 || e.button === 1) {
      panning = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y };
      return;
    }
    if (e.button !== 0 || !sim) return;
    const p = screenToTile(e.clientX, e.clientY);
    // Stopp-Klick-Modus der Linienverwaltung
    if (transitPick !== null && sim.inMap(p.x, p.y)) {
      const L = sim.lines.find(l => l.id === transitPick);
      const r = sim.addStop(transitPick, sim.idx(p.x, p.y));
      if (r.ok) {
        sim.computeCommute();
        toast(t('tr.stopAdded', { n: L.stops.length, name: lineName(L) }));
        Sound.sfx.place();
        renderLines();
      } else if (r.reason !== 'err.dupStop') {
        toast('❌ ' + t(r.reason), 'bad');
        Sound.sfx.error();
      }
      return;
    }
    const tl = toolById[tool];
    if (tl.mode === 'point') {
      // Erst prüfen, ob ein Auto angeklickt wurde (wer fährt da?)
      const car = carAt(e.clientX, e.clientY);
      if (car) {
        if (!car.cit) car.cit = randomCitizen();
        if (car.cit) toast('🚗 ' + car.cit.name + ' — ' + t('cit.driving'));
        Sound.sfx.click();
        return;
      }
      selectTile(p.x, p.y);
      return;
    }
    drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    if (tl.mode === 'paint' || tl.mode === 'single') {
      commitBuild();
      if (tl.mode === 'single') drag = null;
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (panning) {
      cam.x = panning.cx - (e.clientX - panning.sx) / cam.zoom;
      cam.y = panning.cy - (e.clientY - panning.sy) / cam.zoom;
      clampCam();
      return;
    }
    if (!sim) return;
    const p = screenToTile(e.clientX, e.clientY);
    hover = p;
    if (drag) {
      const tl = toolById[tool];
      if ((p.x !== drag.x1 || p.y !== drag.y1)) {
        drag.x1 = p.x; drag.y1 = p.y;
        if (tl.mode === 'paint') commitBuild();
      }
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (e.button === 2 || e.button === 1) { panning = null; return; }
    if (e.button !== 0 || !drag || !sim) return;
    const tl = toolById[tool];
    if (tl.mode === 'line' || tl.mode === 'rect') commitBuild();
    drag = null;
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const before = screenToTile(e.clientX, e.clientY);
    cam.zoom = Math.max(1, Math.min(4, cam.zoom + (e.deltaY < 0 ? 1 : -1)));
    cam.x = before.x * TILE + (TILE / 2) - e.clientX / cam.zoom;
    cam.y = before.y * TILE + (TILE / 2) - e.clientY / cam.zoom;
    clampCam();
  }, { passive: false });

  // ---------- Eingabe: Touch ----------
  let touch = null;
  canvas.addEventListener('touchstart', (e) => {
    Sound.unlock();
    e.preventDefault();
    if (e.touches.length === 1) {
      const tp = e.touches[0];
      touch = { mode: 'tap', sx: tp.clientX, sy: tp.clientY, cx: cam.x, cy: cam.y };
    } else if (e.touches.length === 2) {
      const [a, b] = e.touches;
      touch = {
        mode: 'pinch',
        dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        zoom: cam.zoom,
      };
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!touch) return;
    if (touch.mode !== 'pinch' && e.touches.length === 1) {
      const tp = e.touches[0];
      if (Math.hypot(tp.clientX - touch.sx, tp.clientY - touch.sy) > 12) touch.mode = 'pan';
      if (touch.mode === 'pan') {
        cam.x = touch.cx - (tp.clientX - touch.sx) / cam.zoom;
        cam.y = touch.cy - (tp.clientY - touch.sy) / cam.zoom;
        clampCam();
      }
    } else if (touch.mode === 'pinch' && e.touches.length === 2) {
      const [a, b] = e.touches;
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      cam.zoom = Math.max(1, Math.min(4, Math.round(touch.zoom * d / touch.dist)));
      clampCam();
    }
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (touch && touch.mode === 'tap' && sim) {
      const p = screenToTile(touch.sx, touch.sy);
      const tl = toolById[tool];
      if (tl.mode === 'point') selectTile(p.x, p.y);
      else if (touchConfirmMode) {
        // Erst Vorschau zeigen, dann bestätigen (Anti-Vertipper)
        pendingTap = { x: p.x, y: p.y };
        hover = p;
        showTouchConfirm(touch.sx, touch.sy);
      } else {
        hover = p;
        commitBuild([[p.x, p.y]]);
      }
    }
    touch = null;
  }, { passive: false });

  // ---------- Eingabe: Tastatur ----------
  window.addEventListener('keydown', (e) => {
    const ae = document.activeElement;
    if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return; // Tippen in Feldern
    if (!sim || !running) return;
    // Cheat-Puffer
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      cheatBuf.push(e.key.toLowerCase());
      if (cheatBuf.length > 12) cheatBuf.shift();
      checkCheats();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); doRedo(); return; }
    if (e.key === ' ') {
      e.preventDefault();
      if (speed === 0) setSpeed(prevSpeed || 1); else { prevSpeed = speed; setSpeed(0); }
      return;
    }
    if (e.key === 'Escape') {
      if (transitPick !== null) { endPicking(); return; }
      selectTool('point');
      return;
    }
    if (e.key === '+') { cam.zoom = Math.min(4, cam.zoom + 1); clampCam(); return; }
    if (e.key === '-') { cam.zoom = Math.max(1, cam.zoom - 1); clampCam(); return; }
    const pan = 24 / cam.zoom * 4;
    if (e.key === 'ArrowUp' || e.key === 'w') { cam.y -= pan; clampCam(); }
    if (e.key === 'ArrowDown' || e.key === 's') { cam.y += pan; clampCam(); }
    if (e.key === 'ArrowLeft' || e.key === 'a') { cam.x -= pan; clampCam(); }
    if (e.key === 'ArrowRight' || e.key === 'd') { cam.x += pan; clampCam(); }
    const tl = TOOLS.find(tl => tl.key === e.key);
    if (tl) selectTool(tl.id);
  });

  // ---------- Info-Panel mit Wachstums-Diagnose ----------
  function selectTile(x, y) {
    if (!sim.inMap(x, y)) return;
    selected = { x, y };
    updateInfoPanel();
    $('infoPanel').classList.remove('hidden');
  }

  // Abdeckungsradien (nur zur Anzeige — Werte aus computeCoverage)
  const COV_RADIUS = {
    [S_POLICE]: 10, [S_FIREDEP]: 9, [S_SCHOOL]: 8, [S_HOSPITAL]: 10,
    [S_PARK]: 5, [S_STADIUM]: 12, [S_AMUSE]: 11, [S_TOWNHALL]: 8, [S_MONUMENT]: 10,
  };
  // Erklärtext + Live-Beiträge eines Gebäudes (Transparenz im Info-Panel)
  function buildingDetails(s, i) {
    const def = DEFS[s];
    if (!def) return '';
    let out = '';
    const dk = 'desc.' + def.name.slice(2), dtxt = t(dk);
    if (dtxt !== dk) out += '<div class="infoDesc">' + dtxt + '</div>';
    const L = [], anchor = sim.isAnchor(i);
    if (sim.isPlant(s) && anchor) L.push('⚡ ' + t('info.powerOut') + ' +' + (s === S_SOLAR ? sim.solarPower() : def.power));
    if ((s === S_WTOWER || s === S_PUMP) && anchor) L.push('🚰 ' + t('info.waterOut') + ' +' + (s === S_PUMP ? BAL.WATER.PUMP_SUPPLY : BAL.WATER.TOWER_SUPPLY));
    if (COV_RADIUS[s] && anchor) L.push('📡 ' + t('info.radius') + ' ' + COV_RADIUS[s]);
    if (s === S_LANDFILL && anchor) L.push('🗑 +' + BAL.GARBAGE.LANDFILL_CAP + ' ' + t('info.garbCap'));
    if (s === S_INCINER) L.push('🗑 +' + BAL.GARBAGE.INCINER_CAP + ' ' + t('info.garbCap'));
    if (s === S_RECYCLE) L.push('♻ −' + BAL.GARBAGE.RECYCLE_CUT + ' ' + t('info.garbCut'));
    if (s === S_PORT && anchor) L.push('⚓ ' + t('info.exportCap') + ' +' + BAL.ECONOMY.CAP_PORT);
    if (s === S_AIRPORT && anchor) L.push('✈ ' + t('info.exportCap') + ' +' + BAL.ECONOMY.CAP_AIR);
    if (s === S_HIGHWAY) L.push('🛣 ' + t('info.exportCap') + ' +' + BAL.ECONOMY.CAP_HIGHWAY);
    if (s === S_CASINO && sim.powered[i]) L.push('€ +' + DEFS[S_CASINO].income + '/Mon');
    if (def.drain && anchor) L.push('⚡ −' + def.drain + ' ' + t('info.powerUse'));
    if (def.upkeep && anchor) L.push('🔧 −' + def.upkeep + ' €/Mon');
    if (L.length) out += '<div class="infoStats">' + L.join(' · ') + '</div>';
    return out;
  }

  function updateInfoPanel() {
    if (!selected) return;
    const { x, y } = selected;
    const i = sim.idx(x, y);
    const s = sim.st[i];
    let name = t('terr.' + sim.terr[i]), extra = '';
    if (s !== S_NONE) {
      name = t(DEFS[s].name);
      if ((s === S_ROAD || s === S_RAIL || s === S_WIRE || s === S_PIPE || s === S_HIGHWAY) && sim.terr[i] === T_WATER)
        name += ' (' + t('ui.bridge') + ')';
      if (s >= S_RZONE && s <= S_IZONE) {
        const lv = sim.lvl[i];
        name += ' (' + t('ui.level') + ' ' + lv + '/4)';
        const val = s === S_RZONE ? BAL.R_POP[lv] + ' ' + t('ui.pop')
          : (s === S_CZONE ? BAL.C_JOBS : BAL.I_JOBS)[lv] + ' ' + t('ui.jobs');
        extra += '<div>' + val + '</div>';
        // Beispiel-Bürger:in dieses Hauses
        const cit = citizenOf(i);
        if (cit) {
          extra += '<div style="margin-top:4px">👤 <b>' + cit.name + '</b> · ' + t('cit.age', { n: cit.age }) + '</div>' +
            '<div>' + t(cit.jobKey) +
            (cit.commute >= 0 && cit.jobKey !== 'cit.job.none' ? ' · ' + t('cit.commute', { n: cit.commute }) : '') + '</div>' +
            '<div style="color:#9aa3d6">„…' + t(cit.mood) + '“</div>';
        }
      }
      if (s === S_ROAD) extra += '<div>' + t('ui.traffic') + ': ' + sim.traffic[i] + '%</div>';
      // Tourismus-Übersicht bei Hotel/Freizeitpark
      if (s === S_HOTEL || s === S_AMUSE) {
        extra += '<div style="margin-top:4px">🧳 ' + t('ui.tourists') + ': <b>' +
          sim.tourists + '</b> / ' + sim.touristCap + ' ' + t('ui.beds') + '</div>' +
          '<div style="color:#9aa3d6">' + t('ui.budgetTourism') + ': +' +
          Math.round(sim.tourists * BAL.TOURISM.SPEND) + ' €/Mon.</div>';
      }
      // Erklärtext + Live-Beiträge des Gebäudes
      extra += buildingDetails(s, i);
    }
    let html = '<h3>' + name + '</h3>' +
      '<div>' + t('ui.pos') + ': ' + x + ', ' + y + '</div>' + extra;
    if (sim.burn[i] > 0) html += '<div class="no">' + t('ui.burning') + '</div>';
    if (sim.floodT[i] > 0) html += '<div class="no">' + t('ui.flooded') + '</div>';
    // Wachstums-Diagnose für Zonen
    const diag = sim.explainZone(i);
    if (diag) {
      html += '<h3 style="margin-top:6px">' + t('diag.title') + '</h3>';
      for (const d of diag) {
        const mark = d.ok ? '<span class="ok">✓</span>'
          : d.soft ? '<span style="color:#9aa3d6">◌</span>' : '<span class="no">✗</span>';
        html += '<div>' + mark + ' ' + t(d.k) + (d.val !== undefined ? ' <span style="color:#9aa3d6">' + d.val + '</span>' : '') + '</div>';
      }
    } else if (sim.isBld(s)) {
      const chk = (b) => b ? '<span class="ok">✓</span>' : '<span class="no">✗</span>';
      html += '<div>' + t('ui.powerLbl') + ': ' + chk(sim.powered[i]) +
        ' &nbsp; ' + t('ui.roadLbl') + ': ' + chk(sim.roadOk[i]) +
        ' &nbsp; ' + t('ui.waterLbl') + ': ' + chk(sim.covWater[i] >= 20) + '</div>';
    }
    html += '<div>' + t('ui.landv') + ': ' + sim.landv[i] + '% · ' +
      (sim.poll[i] < 15 ? '<span class="ok">' + t('ui.env.clean') + '</span>'
        : sim.poll[i] < 45 ? t('ui.env.mid') : '<span class="no">' + t('ui.env.bad') + '</span>') + '</div>';
    html += '<div style="font-size:11px;color:#9aa3d6">🚓 ' + sim.covPolice[i] + '% · 🚒 ' + sim.covFire[i] + '% · 🎓 ' + sim.covSchool[i] + '% · 🏥 ' + sim.covHealth[i] + '% · 🌳 ' + sim.covPark[i] + '% · 🚰 ' + sim.covWater[i] + '%</div>';
    $('infoPanel').innerHTML = html;
  }

  // ---------- Spielschleife ----------
  function setSpeed(s) {
    speed = s;
    [0, 1, 2, 3].forEach(k => $('spd' + k).classList.toggle('active', k === s));
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    const iv = [0, 550, 260, 110][s];
    if (iv > 0) {
      tickTimer = setInterval(() => {
        if (!sim || !running) return;
        const prevMonth = sim.month;
        sim.tick();
        if (sim.month !== prevMonth) { autosave(); monthlyNews(); }
        drainEvents();
        if (selected) updateInfoPanel();
      }, iv);
    }
  }

  function drainEvents() {
    while (sim.events.length) {
      const ev = sim.events.shift();
      if (ev.type === 'advisor') { showAdvisor(ev.adv); continue; }
      const msg = t(ev.key, ev.params);
      toast(msg, ev.type === 'milestone' ? 'milestone' : ev.type === 'bad' ? 'bad' : '');
      if (ev.type === 'milestone') Sound.sfx.milestone();
      else if (ev.type === 'bad' && (ev.key === 'ev.fire' || ev.key === 'ev.tornado' || ev.key === 'ev.flood')) Sound.sfx.fire();
      else if (ev.type === 'bad') Sound.sfx.error();
      // Zeitung füttern
      if (ev.key && ev.key.startsWith('ev.ms'))
        pushNews(t('news.ms', { name: sim.cityName, pop: ev.params ? ev.params.pop : sim.pop }));
      else if (NEWS_BY_EVENT[ev.key])
        pushNews(t(NEWS_BY_EVENT[ev.key], { name: sim.cityName }));
    }
  }

  // ---------- HUD ----------
  function fmtMoney(v) {
    return '€ ' + Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  function updateHUD() {
    if (!sim) return;
    const m = $('uiMoney');
    m.textContent = sim.sandbox ? '€ ∞' : fmtMoney(sim.money);
    m.classList.toggle('neg', sim.money < 0);
    $('uiPop').textContent = '👤 ' + sim.pop;
    $('uiJobs').textContent = '🛠 ' + sim.jobs;
    const face = sim.happiness > 66 ? '😀' : sim.happiness > 40 ? '🙂' : sim.happiness > 20 ? '😐' : '😠';
    $('uiHappy').textContent = face + ' ' + sim.happiness + '%';
    const pw = $('uiPower');
    pw.textContent = '⚡ ' + sim.powerNeed + '/' + sim.powerSupply;
    pw.style.color = sim.powerNeed > sim.powerSupply ? '#ff6b6b' : '';
    const wt = $('uiWater');
    wt.textContent = '🚰 ' + sim.waterNeed + '/' + sim.waterSupply;
    wt.style.color = sim.waterShort ? '#ff6b6b' : '';
    // Konjunktur-Anzeige
    const ec = sim.econ;
    const eco = $('uiEcon');
    eco.textContent = ec > BAL.ECONOMY.PHASE_HI ? t('ui.econ.boom')
      : ec < BAL.ECONOMY.PHASE_LO ? t('ui.econ.bust') : t('ui.econ.normal');
    eco.title = t('ui.econLbl') + ': ' + Math.round(ec * 100) + '%';
    eco.style.color = ec > BAL.ECONOMY.PHASE_HI ? '#6fe06f' : ec < BAL.ECONOMY.PHASE_LO ? '#ff6b6b' : '';
    $('uiDate').textContent = sim.dateStr();
    $('rciR').style.height = Math.max(0, sim.demandR) * 100 + '%';
    $('rciC').style.height = Math.max(0, sim.demandC) * 100 + '%';
    $('rciI').style.height = Math.max(0, sim.demandI) * 100 + '%';
    for (const id of ['stadium', 'townhall', 'monument', 'casino', 'subway', 'port']) {
      const el = $('tool_' + id);
      const def = DEFS[toolById[id].s];
      if (el) el.classList.toggle('locked', sim.pop < def.minPop);
    }
    const sol = $('tool_solar');
    if (sol) sol.classList.toggle('locked', sim.year < DEFS[S_SOLAR].minYear);
  }

  // ---------- Fahrzeuge (visuell) ----------
  const CAR_COLORS = ['#c9484f', '#4f8fdc', '#f0d95c', '#f2f2ef', '#7a5cb8', '#e08438'];
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

  function tileHas(x, y, s) {
    return sim.inMap(x, y) && sim.st[sim.idx(x, y)] === s;
  }

  function stepVehicle(v, kind) {
    const opts = [];
    for (let d = 0; d < 4; d++) {
      if (d === (v.dir + 2) % 4) continue;
      if (tileHas(v.tx + DIRS[d][0], v.ty + DIRS[d][1], kind)) opts.push(d);
    }
    let nd;
    if (opts.length === 0) {
      const back = (v.dir + 2) % 4;
      if (tileHas(v.tx + DIRS[back][0], v.ty + DIRS[back][1], kind)) nd = back;
      else return false;
    } else if (opts.includes(v.dir) && Math.random() < 0.65) nd = v.dir;
    else nd = opts[(Math.random() * opts.length) | 0];
    v.dir = nd;
    v.fx = v.tx; v.fy = v.ty;
    v.tx += DIRS[nd][0]; v.ty += DIRS[nd][1];
    v.prog = 0;
    return true;
  }

  // ---------- Schiffe (Wasser) & Flugzeuge (Luft): rein visuell ----------
  function isWater(x, y) {
    const xi = x | 0, yi = y | 0;
    return sim.inMap(xi, yi) && sim.terr[sim.idx(xi, yi)] === T_WATER;
  }
  function countAnchors(kind) {
    let n = 0;
    for (let i = 0; i < sim.w * sim.h; i++) if (sim.st[i] === kind && sim.anchor[i] === i) n++;
    return n;
  }
  function trySpawnShip() {
    const ports = [];
    for (let i = 0; i < sim.w * sim.h; i++) if (sim.st[i] === S_PORT && sim.anchor[i] === i) ports.push(i);
    if (!ports.length) return false;
    const p = ports[(Math.random() * ports.length) | 0];
    const px = p % sim.w, py = (p / sim.w) | 0;
    const spots = [];
    for (let dy = -2; dy <= 3; dy++) for (let dx = -2; dx <= 3; dx++)
      if (isWater(px + dx, py + dy)) spots.push([px + dx, py + dy]);
    if (!spots.length) return false;
    const [sx, sy] = spots[(Math.random() * spots.length) | 0];
    ships.push({ x: sx + 0.5, y: sy + 0.5, ang: Math.random() * Math.PI * 2, ttl: 500 + Math.random() * 400 });
    return true;
  }
  function trySpawnPlane() {
    if (countAnchors(S_AIRPORT) === 0) return false;
    const W = sim.w, H = sim.h, edge = (Math.random() * 4) | 0;
    const spd = 1.6 + Math.random() * 1.0, drift = (Math.random() - 0.5) * 0.5;
    let x, y, vx, vy;
    if (edge === 0) { x = Math.random() * W; y = -1.5; vx = drift; vy = spd; }
    else if (edge === 1) { x = W + 1.5; y = Math.random() * H; vx = -spd; vy = drift; }
    else if (edge === 2) { x = Math.random() * W; y = H + 1.5; vx = drift; vy = -spd; }
    else { x = -1.5; y = Math.random() * H; vx = spd; vy = drift; }
    planes.push({ x, y, vx, vy });
    return true;
  }
  function updateShips(dt, spdF) {
    const step = dt * 0.9 * spdF;
    ships = ships.filter(s => {
      s.ttl -= dt * spdF;
      if (s.ttl <= 0) return false;
      const nx = s.x + Math.cos(s.ang) * step, ny = s.y + Math.sin(s.ang) * step;
      if (isWater(nx + Math.cos(s.ang) * 0.6, ny + Math.sin(s.ang) * 0.6)) { s.x = nx; s.y = ny; return true; }
      // Kurs ändern, bis wieder Wasser vor dem Bug liegt
      for (let k = 0; k < 10; k++) {
        const a = Math.random() * Math.PI * 2;
        if (isWater(s.x + Math.cos(a) * 1.3, s.y + Math.sin(a) * 1.3)) { s.ang = a; return true; }
      }
      return false; // eingekesselt
    });
  }
  function updatePlanes(dt, spdF) {
    const step = dt * spdF, W = sim.w, H = sim.h;
    planes = planes.filter(p => {
      p.x += p.vx * step; p.y += p.vy * step;
      return p.x > -4 && p.y > -4 && p.x < W + 4 && p.y < H + 4;
    });
  }

  function updateVehicles(dt) {
    if (!sim || speed === 0) return;
    const spdF = [0, 1, 1.6, 2.4][speed];
    const now = performance.now();
    if (now - lastCarSpawn > 600) {
      lastCarSpawn = now;
      const roads = [];
      for (let i = 0; i < sim.w * sim.h; i++)
        if (sim.st[i] === S_ROAD && sim.traffic[i] > 5) roads.push(i);
      const target = Math.min(40, Math.round(roads.length / 5));
      if (cars.length < target && roads.length > 0) {
        const i = roads[(Math.random() * roads.length) | 0];
        // E-Autos ab 2000, Anteil wächst jährlich
        const E = BAL.ERA;
        const eProb = sim.year >= E.ECAR_YEAR ? Math.min(0.8, 0.1 + (sim.year - E.ECAR_YEAR) * 0.08) : 0;
        cars.push({
          tx: i % sim.w, ty: (i / sim.w) | 0, fx: i % sim.w, fy: (i / sim.w) | 0,
          dir: (Math.random() * 4) | 0, prog: 1,
          e: Math.random() < eProb,
          color: Math.random() < eProb ? '#7ae0d0' : CAR_COLORS[(Math.random() * CAR_COLORS.length) | 0],
        });
      }
      let railCount = 0, railStart = -1;
      for (let i = 0; i < sim.w * sim.h; i++)
        if (sim.st[i] === S_RAIL) { railCount++; if (railStart < 0) railStart = i; }
      const wantTrains = railCount >= 60 ? 2 : railCount >= 10 ? 1 : 0;
      if (trains.length < wantTrains && railStart >= 0) {
        trains.push({
          tx: railStart % sim.w, ty: (railStart / sim.w) | 0,
          fx: railStart % sim.w, fy: (railStart / sim.w) | 0,
          dir: (Math.random() * 4) | 0, prog: 1, trail: [],
        });
      }
    }
    cars = cars.filter(v => {
      if (!tileHas(v.tx, v.ty, S_ROAD)) return false;
      v.prog += dt * 1.7 * spdF;
      while (v.prog >= 1) { if (!stepVehicle(v, S_ROAD)) return false; }
      return true;
    });
    trains = trains.filter(v => {
      if (!tileHas(v.tx, v.ty, S_RAIL)) return false;
      v.prog += dt * 2.6 * spdF;
      while (v.prog >= 1) {
        v.trail.unshift([v.fx, v.fy]);
        if (v.trail.length > 4) v.trail.pop();
        if (!stepVehicle(v, S_RAIL)) return false;
      }
      return true;
    });
    // Sobald echte Zug-Linien fahren, verschwindet der Zufalls-Zug
    if (sim.lines.some(l => l.type === 'train' && l.active)) trains = [];
    updateLineVehicles(dt, spdF);

    // Schiffe & Flugzeuge nach Bedarf einsetzen (gedrosselt)
    const now2 = performance.now();
    if (now2 - lastAirSpawn > 1400) {
      lastAirSpawn = now2;
      const portTarget = Math.min(8, countAnchors(S_PORT) * 2);
      if (ships.length < portTarget) trySpawnShip();
      const airTarget = Math.min(5, countAnchors(S_AIRPORT) * 2);
      if (planes.length < airTarget) trySpawnPlane();
    }
    updateShips(dt, spdF);
    updatePlanes(dt, spdF);
  }

  // ---------- Linienfahrzeuge: Busse & Züge pendeln auf ihrer Route ----------
  const lineVeh = new Map(); // lineId -> {fp:[tiles], vs:[{pos,dir}]}
  function lineFullPath(L) {
    if (!L.active || !L.paths || L.type === 'sub') return null;
    const out = [];
    for (const p of L.paths) {
      if (!p) return null;
      for (const t2 of p) if (!out.length || out[out.length - 1] !== t2) out.push(t2);
    }
    return out.length > 1 ? out : null;
  }
  function updateLineVehicles(dt, spdF) {
    const seen = new Set();
    for (const L of sim.lines) {
      const fp = lineFullPath(L);
      if (!fp) continue;
      seen.add(L.id);
      let entry = lineVeh.get(L.id);
      const want = Math.max(1, Math.floor(fp.length / (L.type === 'bus' ? 14 : 24)));
      if (!entry || entry.fp.length !== fp.length || entry.vs.length !== want) {
        entry = { fp, vs: Array.from({ length: want }, (_, k) => ({ pos: k * fp.length / want, dir: 1 })) };
        lineVeh.set(L.id, entry);
      } else entry.fp = fp;
      const sp = (L.type === 'bus' ? 2.4 : 3.4) * spdF * dt;
      for (const v of entry.vs) {
        v.pos += sp * v.dir;
        if (v.pos >= fp.length - 1) { v.pos = fp.length - 1; v.dir = -1; }
        if (v.pos <= 0) { v.pos = 0; v.dir = 1; }
      }
    }
    for (const id of [...lineVeh.keys()]) if (!seen.has(id)) lineVeh.delete(id);
  }

  function drawLineVehicles(ox, oy, ts, z, isNight) {
    for (const L of sim.lines) {
      const entry = lineVeh.get(L.id);
      if (!entry) continue;
      for (const v of entry.vs) {
        const k = Math.min(entry.fp.length - 2, Math.floor(v.pos));
        const f = v.pos - k;
        const a = entry.fp[k], b = entry.fp[k + 1];
        const ax = a % sim.w, ay = (a / sim.w) | 0, bx = b % sim.w, by = (b / sim.w) | 0;
        const cx = ox + (ax + (bx - ax) * f) * ts + ts / 2;
        const cy = oy + (ay + (by - ay) * f) * ts + ts / 2;
        const horiz = ay === by;
        if (L.type === 'bus') {
          ctx.fillStyle = '#1a1a29';
          if (horiz) ctx.fillRect(cx - 4 * z, cy - 2.5 * z, 8 * z, 5 * z);
          else ctx.fillRect(cx - 2.5 * z, cy - 4 * z, 5 * z, 8 * z);
          ctx.fillStyle = L.color;
          if (horiz) ctx.fillRect(cx - 3 * z, cy - 1.5 * z, 6 * z, 3 * z);
          else ctx.fillRect(cx - 1.5 * z, cy - 3 * z, 3 * z, 6 * z);
          ctx.fillStyle = isNight ? '#ffe066' : '#c7e8f0';
          if (horiz) ctx.fillRect(cx - 2 * z, cy - z, 4 * z, z);
          else ctx.fillRect(cx - z, cy - 2 * z, z, 4 * z);
        } else {
          for (let seg = 0; seg < 2; seg++) {
            const p2 = Math.max(0, v.pos - seg * 1.1);
            const k2 = Math.min(entry.fp.length - 2, Math.floor(p2));
            const f2 = p2 - k2;
            const a2 = entry.fp[k2], b2 = entry.fp[k2 + 1];
            const sx = ox + ((a2 % sim.w) + ((b2 % sim.w) - (a2 % sim.w)) * f2) * ts + ts / 2;
            const sy = oy + (((a2 / sim.w) | 0) + (((b2 / sim.w) | 0) - ((a2 / sim.w) | 0)) * f2) * ts + ts / 2;
            ctx.fillStyle = '#1a1a29';
            ctx.fillRect(sx - 4 * z, sy - 3 * z, 8 * z, 6 * z);
            ctx.fillStyle = seg === 0 ? L.color : '#565c6b';
            ctx.fillRect(sx - 3 * z, sy - 2 * z, 6 * z, 4 * z);
            if (seg === 0 && isNight) { ctx.fillStyle = '#ffe066'; ctx.fillRect(sx - z, sy - z, 2 * z, 2 * z); }
          }
        }
      }
    }
  }

  // ---------- Routen-Overlay (Linien + Stopps, U-Bahn gestrichelt) ----------
  function drawLineRoutes(ox, oy, ts, z, now) {
    for (const L of sim.lines) {
      ctx.globalAlpha = L.active ? 0.85 : 0.35;
      ctx.strokeStyle = L.color;
      ctx.lineWidth = Math.max(2, z * 1.5);
      if (L.type === 'sub') {
        ctx.setLineDash([4 * z, 3 * z]);
        for (let k = 0; k + 1 < L.stops.length; k++) {
          const a = L.stops[k], b = L.stops[k + 1];
          const ax = ox + (a % sim.w) * ts + ts / 2, ay = oy + ((a / sim.w) | 0) * ts + ts / 2;
          const bx = ox + (b % sim.w) * ts + ts / 2, by = oy + ((b / sim.w) | 0) * ts + ts / 2;
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
          if (L.active) { // fahrender U-Bahn-Punkt
            const f = (now / 1400 + k * 0.37) % 1;
            ctx.fillStyle = L.color;
            ctx.beginPath();
            ctx.arc(ax + (bx - ax) * f, ay + (by - ay) * f, Math.max(2, z * 1.6), 0, 7);
            ctx.fill();
          }
        }
        ctx.setLineDash([]);
      } else if (L.paths) {
        for (const p of L.paths) {
          if (!p || p.length < 2) continue;
          ctx.beginPath();
          p.forEach((t2, k) => {
            const px = ox + (t2 % sim.w) * ts + ts / 2, py = oy + ((t2 / sim.w) | 0) * ts + ts / 2;
            if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          });
          ctx.stroke();
        }
      }
      // Stopps als Kreise mit Nummer
      L.stops.forEach((si, k) => {
        const px = ox + (si % sim.w) * ts + ts / 2, py = oy + ((si / sim.w) | 0) * ts + ts / 2;
        ctx.fillStyle = L.color;
        ctx.beginPath(); ctx.arc(px, py, Math.max(3, z * 2.4), 0, 7); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(px, py, Math.max(3, z * 2.4), 0, 7); ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold ' + Math.max(8, 4 * z) + 'px monospace';
        ctx.fillText(String(k + 1), px - 2 * z * 0.6, py + 2 * z * 0.6);
      });
      ctx.globalAlpha = 1;
    }
    // Beim Stopp-Klicken: passende Haltestellen pulsierend markieren
    if (transitPick !== null) {
      const L = sim.lines.find(l => l.id === transitPick);
      if (L) {
        const want = Sim.stopTypeFor(L.type);
        const pulse = 2 + Math.sin(now / 180) * 1.5;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        for (let i = 0; i < sim.w * sim.h; i++) {
          if (sim.st[i] !== want || L.stops.includes(i)) continue;
          const px = ox + (i % sim.w) * ts, py = oy + ((i / sim.w) | 0) * ts;
          ctx.strokeRect(px - pulse, py - pulse, ts + pulse * 2, ts + pulse * 2);
        }
      }
    }
  }

  // Bildschirmposition eines Autos (für Klick-Treffertest)
  function carScreenPos(v) {
    const z = cam.zoom, ts = TILE * z;
    const ox = -Math.round(cam.x * z), oy = -Math.round(cam.y * z);
    const wx = (v.fx + (v.tx - v.fx) * v.prog) * ts, wy = (v.fy + (v.ty - v.fy) * v.prog) * ts;
    const side = (v.dir === 0 ? 3 : v.dir === 2 ? -3 : 0) * z;
    const sideY = (v.dir === 1 ? 3 : v.dir === 3 ? -3 : 0) * z;
    return [ox + wx + ts / 2 + side, oy + wy + ts / 2 + sideY];
  }
  function carAt(px, py) {
    const r = Math.max(10, 5 * cam.zoom);
    for (const v of cars) {
      const [cx, cy] = carScreenPos(v);
      if (Math.hypot(px - cx, py - cy) <= r) return v;
    }
    return null;
  }

  function drawVehicles(ox, oy, ts, z, isNight) {
    for (const v of cars) {
      const wx = (v.fx + (v.tx - v.fx) * v.prog) * ts, wy = (v.fy + (v.ty - v.fy) * v.prog) * ts;
      const horiz = v.dir === 1 || v.dir === 3;
      const side = (v.dir === 0 ? 3 : v.dir === 2 ? -3 : 0) * z;
      const sideY = (v.dir === 1 ? 3 : v.dir === 3 ? -3 : 0) * z;
      const cx = ox + wx + ts / 2 + side, cy = oy + wy + ts / 2 + sideY;
      ctx.fillStyle = '#1a1a29';
      if (horiz) ctx.fillRect(cx - 3 * z, cy - 2 * z, 6 * z, 4 * z);
      else ctx.fillRect(cx - 2 * z, cy - 3 * z, 4 * z, 6 * z);
      ctx.fillStyle = v.color;
      if (horiz) ctx.fillRect(cx - 2 * z, cy - 1 * z, 4 * z, 2 * z);
      else ctx.fillRect(cx - 1 * z, cy - 2 * z, 2 * z, 4 * z);
      if (isNight) {
        ctx.fillStyle = '#fff8c0';
        const hd = DIRS[v.dir];
        ctx.fillRect(cx + hd[0] * 3 * z - z / 2, cy + hd[1] * 3 * z - z / 2, z, z);
      }
      if (v.e) { // E-Auto: grünes Lämpchen
        ctx.fillStyle = '#4dff88';
        ctx.fillRect(cx - z / 2, cy - z / 2, z, z);
      }
    }
    for (const v of trains) {
      const pts = [[v.fx + (v.tx - v.fx) * v.prog, v.fy + (v.ty - v.fy) * v.prog], ...v.trail];
      pts.forEach(([px, py], k) => {
        if (k > 3) return;
        const cx = ox + px * ts + ts / 2, cy = oy + py * ts + ts / 2;
        ctx.fillStyle = '#1a1a29';
        ctx.fillRect(cx - 4 * z, cy - 3 * z, 8 * z, 6 * z);
        ctx.fillStyle = k === 0 ? '#8d3742' : '#c9484f';
        ctx.fillRect(cx - 3 * z, cy - 2 * z, 6 * z, 4 * z);
        if (k === 0) { ctx.fillStyle = '#f0d95c'; ctx.fillRect(cx - z, cy - z, 2 * z, 2 * z); }
      });
    }
  }

  // Schiffe: Sprite in Fahrtrichtung gedreht, mit heller Bugwelle
  function drawShips(ox, oy, ts, z) {
    const spr = Sprites.store.ship;
    if (!spr) return;
    for (const s of ships) {
      const cx = ox + s.x * ts, cy = oy + s.y * ts, sz = ts * 0.95;
      // Bugwelle
      ctx.fillStyle = 'rgba(220,240,255,0.5)';
      ctx.fillRect(cx - Math.cos(s.ang) * ts * 0.4 - z, cy - Math.sin(s.ang) * ts * 0.4 - z, 2 * z, 2 * z);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(s.ang + Math.PI / 2); // Sprite zeigt nach Norden
      ctx.drawImage(spr, -sz / 2, -sz / 2, sz, sz);
      ctx.restore();
    }
  }

  // Flugzeuge: Bodenschatten + Flieger in Höhe, in Flugrichtung gedreht
  function drawPlanes(ox, oy, ts, z) {
    const spr = Sprites.store.plane;
    if (!spr) return;
    for (const p of planes) {
      const ang = Math.atan2(p.vy, p.vx) + Math.PI / 2;
      const gx = ox + p.x * ts, gy = oy + p.y * ts, sz = ts * 1.1, alt = ts * 0.7;
      // Schatten am Boden (dunkler Fleck)
      ctx.fillStyle = 'rgba(0,0,0,0.20)';
      ctx.beginPath();
      ctx.ellipse(gx, gy, ts * 0.4, ts * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      // Flieger darüber, in Flugrichtung gedreht
      ctx.save(); ctx.translate(gx, gy - alt); ctx.rotate(ang);
      ctx.drawImage(spr, -sz / 2, -sz / 2, sz, sz);
      ctx.restore();
    }
  }

  // ---------- Tag/Nacht ----------
  function nightAlpha() {
    if (!nightEnabled || !sim) return 0;
    const tt = (Date.now() / 1000) % 180 / 180;
    if (tt < 0.55) return 0;
    if (tt < 0.65) return (tt - 0.55) / 0.10;
    if (tt < 0.90) return 1;
    if (tt < 1.00) return 1 - (tt - 0.90) / 0.10;
    return 0;
  }

  // ============================================================
  // CHUNK-RENDERER
  // Statisches (Terrain ohne Wasser, Gebäude, Straßen) wird in
  // 16×16-Kachel-Chunks vorgebacken und nur bei Änderung neu
  // gezeichnet. Live pro Frame: Wasser, Feuer, Flut, Windräder,
  // Rauch, Symbole, Fahrzeuge, Akteure, Overlays, Vorschau.
  // ============================================================
  const CHUNK = 16;
  const MAX_CHUNKS = 320; // LRU-Deckel: bei 1024²-Karten wären alle Chunks ~1 GB
  let chunkMap = new Map();
  let chunksX = 0, chunksY = 0;

  function initChunks() {
    chunksX = Math.ceil(sim.w / CHUNK);
    chunksY = Math.ceil(sim.h / CHUNK);
    chunkMap = new Map();
  }

  function getChunk(cx, cy) {
    const key = cy * chunksX + cx;
    let ch = chunkMap.get(key);
    if (!ch) { ch = { cv: null, dirty: true, night: false, used: 0 }; chunkMap.set(key, ch); }
    return ch;
  }

  function evictChunks() {
    if (chunkMap.size <= MAX_CHUNKS) return;
    const entries = [...chunkMap.entries()].sort((a, b) => a[1].used - b[1].used);
    const drop = chunkMap.size - MAX_CHUNKS;
    for (let k = 0; k < drop; k++) chunkMap.delete(entries[k][0]);
  }

  function invalidateTile(i) {
    const x = i % sim.w, y = (i / sim.w) | 0;
    const ch = chunkMap.get(((y / CHUNK) | 0) * chunksX + ((x / CHUNK) | 0));
    if (ch) ch.dirty = true;
  }

  function drainChanged() {
    if (sim.allChanged) {
      for (const ch of chunkMap.values()) ch.dirty = true;
      sim.allChanged = false;
      sim.changed.length = 0;
      return;
    }
    for (const i of sim.changed) invalidateTile(i);
    sim.changed.length = 0;
  }

  function bakeChunk(cx, cy, isNight) {
    const ch = getChunk(cx, cy);
    if (!ch.cv) {
      ch.cv = document.createElement('canvas');
      ch.cv.width = CHUNK * TILE; ch.cv.height = CHUNK * TILE;
    }
    const g = ch.cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, ch.cv.width, ch.cv.height);
    const X0 = cx * CHUNK, Y0 = cy * CHUNK;
    const X1 = Math.min(sim.w - 1, X0 + CHUNK - 1), Y1 = Math.min(sim.h - 1, Y0 + CHUNK - 1);
    const S = (name, frame) => Sprites.get(name, frame || 0, isNight);
    // Terrain (Wasser bleibt transparent — wird live animiert)
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
      const i = sim.idx(x, y);
      const lx = (x - X0) * TILE, ly = (y - Y0) * TILE;
      const tr = sim.terr[i];
      if (tr === T_WATER) continue;
      if (tr === T_SAND) g.drawImage(S('sand', (x + y) % 2), lx, ly);
      else g.drawImage(S('grass', (x * 7 + y * 13) % 4), lx, ly);
      if (tr === T_TREE) g.drawImage(S('tree'), lx, ly);
    }
    // Strukturen (inkl. 1 Kachel Rand für 2x2-Überhänge)
    for (let y = Math.max(0, Y0 - 1); y <= Y1; y++) {
      for (let x = Math.max(0, X0 - 1); x <= X1; x++) {
        const i = sim.idx(x, y);
        const s = sim.st[i];
        if (s === S_NONE || s === S_WIND) continue; // Windrad dreht sich → live
        const lx = (x - X0) * TILE, ly = (y - Y0) * TILE;
        const inChunk = x >= X0 && y >= Y0;
        if (s === S_ROAD || s === S_RAIL) {
          if (!inChunk) continue;
          let m = 0;
          if (y > 0 && sim.st[i - sim.w] === s) m |= 1;
          if (x < sim.w - 1 && sim.st[i + 1] === s) m |= 2;
          if (y < sim.h - 1 && sim.st[i + sim.w] === s) m |= 4;
          if (x > 0 && sim.st[i - 1] === s) m |= 8;
          const bridge = sim.terr[i] === T_WATER;
          const name = bridge ? (s === S_ROAD ? 'bridgeRoad' : 'bridgeRail') : (s === S_ROAD ? 'road' : 'rail');
          g.drawImage(S(name, m), lx, ly);
        } else if (s === S_HIGHWAY) {
          if (!inChunk) continue;
          // Maske aus Netz-Nachbarn (Autobahn/Straße/Schiene)
          const cond = (j) => { const q = sim.st[j]; return q === S_HIGHWAY || q === S_ROAD || q === S_RAIL; };
          let m = 0;
          if (y > 0 && cond(i - sim.w)) m |= 1;
          if (x < sim.w - 1 && cond(i + 1)) m |= 2;
          if (y < sim.h - 1 && cond(i + sim.w)) m |= 4;
          if (x > 0 && cond(i - 1)) m |= 8;
          g.drawImage(S('highway', m), lx, ly);
        } else if (s === S_WIRE) {
          if (!inChunk) continue;
          const cond = (j) => { const q = sim.st[j]; return q === S_ROAD || q === S_RAIL || q === S_WIRE || sim.isBld(q); };
          let m = 0;
          if (y > 0 && cond(i - sim.w)) m |= 1;
          if (x < sim.w - 1 && cond(i + 1)) m |= 2;
          if (y < sim.h - 1 && cond(i + sim.w)) m |= 4;
          if (x > 0 && cond(i - 1)) m |= 8;
          g.drawImage(S('wire', m), lx, ly);
        } else if (s === S_PIPE) {
          if (!inChunk) continue;
          // Maske aus wasserleitenden Nachbarn (Rohr/Straße/Schiene/Gebäude)
          const cond = (j) => { const q = sim.st[j]; return q === S_PIPE || q === S_ROAD || q === S_RAIL || sim.isBld(q); };
          let m = 0;
          if (y > 0 && cond(i - sim.w)) m |= 1;
          if (x < sim.w - 1 && cond(i + 1)) m |= 2;
          if (y < sim.h - 1 && cond(i + sim.w)) m |= 4;
          if (x > 0 && cond(i - 1)) m |= 8;
          g.drawImage(S('pipe', m), lx, ly);
        } else if (s === S_RUBBLE) {
          if (!inChunk) continue;
          g.drawImage(S('rubble'), lx, ly);
        } else if (s === S_COAL || s === S_STADIUM || s === S_PORT || s === S_AMUSE ||
                   s === S_LANDFILL || s === S_AIRPORT || s === S_NUCLEAR) {
          if (sim.anchor[i] === i) { // Anker kann im Randbereich liegen → Überhang zeichnen
            const nm2 = s === S_COAL ? 'coal' : s === S_STADIUM ? 'stadium' : s === S_PORT ? 'port'
              : s === S_AMUSE ? 'amuse' : s === S_LANDFILL ? 'landfill' : s === S_AIRPORT ? 'airport' : 'nuclear';
            g.drawImage(S(nm2), lx, ly, TILE * 2, TILE * 2);
          }
        } else if (s >= S_RZONE && s <= S_IZONE) {
          if (!inChunk) continue;
          const lv = sim.lvl[i];
          if (lv === 0) {
            g.drawImage(s === S_RZONE ? S('zoneR') : s === S_CZONE ? S('zoneC') : S('zoneI'), lx, ly);
          } else {
            let spr;
            if (lv === 4 && s === S_RZONE && sim.landv[i] > BAL.LANDV.LUX_MIN) spr = S('rLux');
            else if (lv === 4 && s === S_CZONE && sim.landv[i] > BAL.LANDV.LUX_MIN) spr = S('cLux');
            else {
              const key = s === S_RZONE ? 'r' : s === S_CZONE ? 'c' : 'i';
              spr = (isNight ? Sprites.night[key] : Sprites.store[key])[lv];
            }
            g.drawImage(spr, lx, ly);
          }
        } else {
          if (!inChunk) continue;
          const map = {
            [S_PARK]: 'park', [S_POLICE]: 'police', [S_FIREDEP]: 'firedep',
            [S_SCHOOL]: 'school', [S_HOSPITAL]: 'hospital',
            [S_WTOWER]: 'wtower', [S_PUMP]: 'pump', [S_TOWNHALL]: 'townhall',
            [S_MONUMENT]: 'monument', [S_CASINO]: 'casino', [S_SOLAR]: 'solar',
            [S_BUSSTOP]: 'busstop', [S_TRAINSTATION]: 'trainstation', [S_SUBWAY]: 'subway',
            [S_HOTEL]: 'hotel', [S_INCINER]: 'inciner', [S_RECYCLE]: 'recycle',
          };
          if (map[s]) g.drawImage(S(map[s]), lx, ly);
        }
      }
    }
    ch.dirty = false;
    ch.night = isNight;
  }

  // ---------- Rendering ----------
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.imageSmoothingEnabled = false;
    if (sim) clampCam();
  }
  window.addEventListener('resize', resize);

  function render(now) {
    requestAnimationFrame(render);
    const dt = Math.min(0.1, (now - lastFrame) / 1000 || 0.016);
    lastFrame = now;
    if (!sim) return;
    updateVehicles(dt);
    drainChanged();

    ctx.imageSmoothingEnabled = false;
    const z = cam.zoom, ts = TILE * z;
    const ox = -Math.round(cam.x * z), oy = -Math.round(cam.y * z);
    const W = sim.w, H = sim.h;
    const nAlpha = nightAlpha();
    const isNight = nAlpha > 0.5;
    Sound.setNight(isNight);
    ctx.fillStyle = isNight ? '#0a0a14' : '#10101c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const x0 = Math.max(0, Math.floor(-ox / ts));
    const y0 = Math.max(0, Math.floor(-oy / ts));
    const x1 = Math.min(W - 1, Math.ceil((canvas.width - ox) / ts));
    const y1 = Math.min(H - 1, Math.ceil((canvas.height - oy) / ts));

    const waterF = Math.floor(now / 300) % 4;
    const windF = Math.floor(now / 220) % 2;
    const fireF = Math.floor(now / 140) % 3;
    const smokeF = Math.floor(now / 350) % 2;
    const tornF = Math.floor(now / 120) % 2;
    const blink = Math.floor(now / 450) % 2 === 0;
    const S = (name, frame) => Sprites.get(name, frame || 0, isNight);

    // 1) Wasser live (liegt unter den Chunk-Brücken)
    const waterSpr = S('water', waterF);
    let waterTiles = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = sim.idx(x, y);
      if (sim.terr[i] === T_WATER) {
        ctx.drawImage(waterSpr, ox + x * ts, oy + y * ts, ts, ts);
        waterTiles++;
      }
    }

    // 2) Vorgebackene Chunks
    const c0x = Math.max(0, (x0 / CHUNK) | 0), c1x = Math.min(chunksX - 1, (x1 / CHUNK) | 0);
    const c0y = Math.max(0, (y0 / CHUNK) | 0), c1y = Math.min(chunksY - 1, (y1 / CHUNK) | 0);
    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const ch = getChunk(cx, cy);
        ch.used = now;
        if (ch.dirty || ch.night !== isNight || !ch.cv) bakeChunk(cx, cy, isNight);
        ctx.drawImage(ch.cv, ox + cx * CHUNK * ts, oy + cy * CHUNK * ts, CHUNK * ts, CHUNK * ts);
      }
    }
    if ((now | 0) % 1000 < 20) evictChunks();

    // 3) Animiertes & Symbole live
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = sim.idx(x, y);
        const s = sim.st[i];
        const sx = ox + x * ts, sy = oy + y * ts;
        if (s === S_WIND) ctx.drawImage(S('wind', windF), sx, sy, ts, ts);
        else if (s === S_COAL && sim.anchor[i] === i) {
          const sm = S('smoke', smokeF);
          ctx.drawImage(sm, sx + 2 * z, sy - 4 * z + (smokeF ? -2 * z : 0), 8 * z, 8 * z);
          ctx.drawImage(sm, sx + 12 * z, sy - 3 * z - (smokeF ? 2 * z : 0), 8 * z, 8 * z);
        } else if (s === S_IZONE && sim.lvl[i] >= 2) {
          ctx.drawImage(S('smoke', smokeF), sx + 1 * z, sy - 3 * z, 6 * z, 6 * z);
        }
        if (blink && s !== S_NONE && !sim.powered[i] && sim.anchor[i] === i &&
          ((s >= S_RZONE && s <= S_IZONE && sim.lvl[i] > 0) || (DEFS[s] && DEFS[s].drain))) {
          ctx.drawImage(BOLT, sx + ts - 7 * z, sy + z, 6 * z, 6 * z);
        }
        if (!blink && s >= S_RZONE && s <= S_IZONE && sim.lvl[i] >= 2 &&
          sim.covWater[i] < 20 && sim.powered[i]) {
          ctx.drawImage(DROP, sx + ts - 6 * z, sy + z, 5 * z, 5 * z);
        }
        if (sim.burn[i] > 0) ctx.drawImage(S('fire', fireF), sx, sy, ts, ts);
        if (sim.floodT[i] > 0) {
          ctx.globalAlpha = 0.75;
          ctx.drawImage(waterSpr, sx, sy, ts, ts);
          ctx.globalAlpha = 1;
        }
        // Außenwelt-Anschluss: gelber Pfeil an Rand-Straßen/-Schienen
        if ((s === S_ROAD || s === S_RAIL) && (x === 0 || y === 0 || x === W - 1 || y === H - 1)) {
          ctx.fillStyle = blink ? '#f0d95c' : '#ffef9e';
          ctx.beginPath();
          const cxp = sx + ts / 2, cyp = sy + ts / 2, a = 4 * z;
          if (x === 0) { ctx.moveTo(sx + a, cyp - a); ctx.lineTo(sx + a, cyp + a); ctx.lineTo(sx, cyp); }
          else if (x === W - 1) { ctx.moveTo(sx + ts - a, cyp - a); ctx.lineTo(sx + ts - a, cyp + a); ctx.lineTo(sx + ts, cyp); }
          else if (y === 0) { ctx.moveTo(cxp - a, sy + a); ctx.lineTo(cxp + a, sy + a); ctx.lineTo(cxp, sy); }
          else { ctx.moveTo(cxp - a, sy + ts - a); ctx.lineTo(cxp + a, sy + ts - a); ctx.lineTo(cxp, sy + ts); }
          ctx.closePath(); ctx.fill();
        }
      }
    }

    // 4) Fahrzeuge (Schiffe auf dem Wasser zuerst, dann Land)
    drawShips(ox, oy, ts, z);
    drawVehicles(ox, oy, ts, z, isNight);
    drawLineVehicles(ox, oy, ts, z, isNight);

    // 5) Katastrophen-Akteure
    for (const a of sim.actors) {
      const ax = ox + a.x * ts, ay = oy + a.y * ts;
      if (a.type === 'tornado') {
        const wob = Math.sin(now / 90) * 2 * z;
        ctx.drawImage(Sprites.get('tornado', tornF), ax - ts * 0.25 + wob, ay - ts * 0.5, ts * 1.5, ts * 1.5);
      } else if (a.type === 'ufo') {
        if (a.beam > 0) {
          ctx.fillStyle = 'rgba(255,240,120,0.45)';
          ctx.beginPath();
          ctx.moveTo(ax + ts / 2 - 3 * z, ay + ts / 2);
          ctx.lineTo(ax + ts / 2 + 3 * z, ay + ts / 2);
          ctx.lineTo(ax + ts / 2 + 7 * z, ay + ts * 1.8);
          ctx.lineTo(ax + ts / 2 - 7 * z, ay + ts * 1.8);
          ctx.closePath(); ctx.fill();
        }
        const hover2 = Math.sin(now / 200) * 2 * z;
        ctx.drawImage(Sprites.store.ufo, ax, ay + hover2, ts, ts);
      }
    }

    // 6) Overlay (Farbe + Muster für Problemzonen — Farbenblind-tauglich)
    if (overlay) {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = sim.idx(x, y);
          const sx = ox + x * ts, sy = oy + y * ts;
          let col = null, hatch = false;
          if (overlay === 'power') {
            const s = sim.st[i];
            if (s === S_WIRE || s === S_ROAD || s === S_RAIL || sim.isBld(s)) {
              if (sim.powered[i]) col = 'rgba(60,255,120,0.40)';
              else { col = 'rgba(255,60,60,0.50)'; hatch = true; }
            }
          } else if (overlay === 'poll') {
            const p = sim.poll[i];
            if (p > 4) {
              col = 'rgba(255,' + (Math.max(0, 160 - p * 2.2) | 0) + ',40,' + Math.min(0.6, p / 130 + 0.12) + ')';
              if (p > 60) hatch = true;
            }
          } else if (overlay === 'traffic') {
            if (sim.st[i] === S_ROAD) {
              const tv = sim.traffic[i];
              if (tv < 35) col = 'rgba(80,230,110,0.5)';
              else if (tv < 70) col = 'rgba(240,217,92,0.55)';
              else { col = 'rgba(255,70,60,0.6)'; hatch = true; }
            }
          } else if (overlay === 'landv') {
            const v = sim.landv[i];
            if (sim.terr[i] !== T_WATER)
              col = v > 55 ? 'rgba(240,217,92,' + ((v - 55) / 45 * 0.55 + 0.08) + ')'
                : 'rgba(90,110,220,' + ((55 - v) / 55 * 0.4 + 0.05) + ')';
          } else if (overlay === 'water') {
            // Netzansicht wie beim Strom: leitende Kacheln versorgt/trocken
            const s = sim.st[i];
            if (s === S_PIPE || s === S_ROAD || s === S_RAIL || s === S_HIGHWAY || sim.isBld(s)) {
              if (sim.watered[i]) col = 'rgba(60,170,255,0.40)';
              else { col = 'rgba(255,60,60,0.50)'; hatch = true; }
            }
          } else if (overlay === 'crime') {
            const cv = sim.crime[i];
            if (cv > 4) {
              col = 'rgba(120,40,200,' + Math.min(0.6, cv / 130 + 0.12) + ')';
              if (cv > BAL.CRIME.DECAY_AT) hatch = true;
            }
          } else {
            const m = { police: sim.covPolice, fire: sim.covFire, school: sim.covSchool, health: sim.covHealth, park: sim.covPark }[overlay];
            if (m && m[i] > 0) col = 'rgba(60,180,255,' + (m[i] / 100 * 0.5) + ')';
          }
          if (col) {
            ctx.fillStyle = col;
            ctx.fillRect(sx, sy, ts, ts);
            if (hatch) ctx.drawImage(HATCH, sx, sy, ts, ts);
          }
        }
      }
    }
    // Linien-Routen (Overlay „Linien“ oder während des Stopp-Klickens)
    if (overlay === 'lines' || transitPick !== null) drawLineRoutes(ox, oy, ts, z, now);

    // 7) Bau-Vorschau
    const tl = toolById[tool];
    if (tl.mode !== 'point' && (hover.x >= 0 || pendingTap) && !panning) {
      const tiles = previewTiles();
      if (tiles) {
        let total = 0;
        for (const [x, y] of tiles) {
          if (!sim.inMap(x, y)) continue;
          const sx = ox + x * ts, sy = oy + y * ts;
          let ok, cost = 0;
          if (tl.id === 'dozer') {
            const i = sim.idx(x, y);
            ok = sim.st[i] !== S_NONE || sim.terr[i] === T_TREE;
            cost = 1;
          } else {
            const r = sim.canPlace(tl.s, x, y);
            ok = r.ok; cost = r.ok ? r.cost : sim.costAt(tl.s, x, y);
          }
          if (ok) total += cost;
          const size = (tl.s && DEFS[tl.s].size === 2) ? 2 : 1;
          if (ok && tl.s && tl.mode === 'single') {
            ctx.globalAlpha = 0.65;
            ctx.drawImage(toolSprite(tl, windF), sx, sy, ts * size, ts * size);
            ctx.globalAlpha = 1;
          }
          ctx.fillStyle = ok ? 'rgba(120,255,140,0.25)' : 'rgba(255,60,60,0.35)';
          ctx.fillRect(sx, sy, ts * size, ts * size);
          ctx.strokeStyle = ok ? '#6fe06f' : '#ff6b6b';
          ctx.lineWidth = Math.max(1, z / 2);
          ctx.strokeRect(sx + 1, sy + 1, ts * size - 2, ts * size - 2);
        }
        if (total > 0 && tiles.length > 0) {
          const [lx, ly] = tiles[tiles.length - 1];
          ctx.font = 'bold ' + Math.max(11, 6 * z) + 'px monospace';
          const txt = '-' + total + '€';
          const tx = ox + lx * ts, ty = oy + ly * ts - 6;
          ctx.fillStyle = '#000';
          ctx.fillText(txt, tx + 1, ty + 1);
          ctx.fillStyle = sim.money >= total ? '#f0d95c' : '#ff6b6b';
          ctx.fillText(txt, tx, ty);
        }
      }
    }

    // 8) Auswahl-Rahmen + Pendelweg (Haus → Arbeitsplatz)
    if (selected && tool === 'point') {
      const si = sim.idx(selected.x, selected.y);
      if (sim.st[si] === S_RZONE && sim.lvl[si] > 0 && sim.workOf[si] >= 0) {
        const w = sim.workOf[si], wx = w % sim.w, wy = (w / sim.w) | 0;
        ctx.strokeStyle = blink ? '#7ae0ff' : '#4f8fdc';
        ctx.lineWidth = Math.max(1.5, z * 0.9);
        ctx.setLineDash([5 * z, 3 * z]);
        ctx.beginPath();
        ctx.moveTo(ox + (selected.x + 0.5) * ts, oy + (selected.y + 0.5) * ts);
        ctx.lineTo(ox + (wx + 0.5) * ts, oy + (wy + 0.5) * ts);
        ctx.stroke();
        ctx.setLineDash([]);
        // Arbeitsplatz markieren
        ctx.strokeStyle = '#7ae0a0'; ctx.lineWidth = 2;
        ctx.strokeRect(ox + wx * ts + 1, oy + wy * ts + 1, ts - 2, ts - 2);
      }
      ctx.strokeStyle = blink ? '#fff' : '#f0d95c';
      ctx.lineWidth = 2;
      ctx.strokeRect(ox + selected.x * ts + 1, oy + selected.y * ts + 1, ts - 2, ts - 2);
    }

    // 9) Dämmerungs-Tönung
    if (nAlpha > 0 && !isNight) {
      ctx.fillStyle = 'rgba(10,12,50,' + (nAlpha * 0.45) + ')';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (isNight && nAlpha < 1) {
      ctx.fillStyle = 'rgba(10,12,50,' + ((1 - nAlpha) * 0.2) + ')';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    // 🕺 DISCO-Cheat
    if (performance.now() < discoUntil) {
      ctx.fillStyle = 'hsla(' + ((now / 4) % 360) + ',95%,60%,0.16)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // 10) Flugzeuge zuletzt — sie fliegen über allem
    drawPlanes(ox, oy, ts, z);

    // Ambient-Sound: Wasseranteil im Bild + Verkehr
    if ((now | 0) % 1000 < 20) {
      const visTiles = Math.max(1, (x1 - x0 + 1) * (y1 - y0 + 1));
      Sound.ambient(waterTiles / visTiles, cars.length);
    }

    updateHUD();
  }

  // ---------- Minimap ----------
  const MINI_TERR = ['#3a7a38', '#2f6fc4', '#d8b56a', '#2c6e31'];
  function miniColor(i) {
    let col = MINI_TERR[sim.terr[i]];
    const s = sim.st[i];
    if (s === S_ROAD) col = '#8a8a95';
    else if (s === S_RAIL) col = '#6b6a5a';
    else if (s === S_HIGHWAY) col = '#c8ccd8';
    else if (s === S_WIRE) col = '#6b5636';
    else if (s === S_PIPE) col = '#2f7fa8';
    else if (s === S_RZONE) col = sim.lvl[i] ? '#6fe06f' : '#3f9f4f';
    else if (s === S_CZONE) col = sim.lvl[i] ? '#6fb8ff' : '#3f6fbf';
    else if (s === S_IZONE) col = sim.lvl[i] ? '#f0d95c' : '#af9f3c';
    else if (s === S_COAL || s === S_WIND || s === S_SOLAR || s === S_NUCLEAR) col = '#ff9e2c';
    else if (s === S_HOTEL || s === S_AMUSE || s === S_AIRPORT) col = '#e5679f';
    else if (s === S_LANDFILL || s === S_INCINER || s === S_RECYCLE) col = '#7a6a4a';
    else if (s === S_RUBBLE) col = '#6b6257';
    else if (s !== S_NONE) col = '#f2f2ef';
    if (sim.burn[i] > 0 || sim.floodT[i] > 0) col = sim.burn[i] ? '#ff3030' : '#40a0ff';
    return col;
  }
  // Sampling statt Vollscan: konstant 128² Abfragen, egal wie groß die Karte ist
  function renderMini() {
    if (!sim) return;
    const W = sim.w, H = sim.h;
    const img = mctx.createImageData(128, 128);
    for (let my = 0; my < 128; my++) {
      const y = (my * H / 128) | 0;
      for (let mx = 0; mx < 128; mx++) {
        const x = (mx * W / 128) | 0;
        const col = miniColor(sim.idx(x, y));
        const o = (my * 128 + mx) * 4;
        img.data[o] = parseInt(col.slice(1, 3), 16);
        img.data[o + 1] = parseInt(col.slice(3, 5), 16);
        img.data[o + 2] = parseInt(col.slice(5, 7), 16);
        img.data[o + 3] = 255;
      }
    }
    mctx.putImageData(img, 0, 0);
    const sc = 128 / (W * TILE);
    mctx.strokeStyle = '#ffffff';
    mctx.lineWidth = 1;
    mctx.strokeRect(cam.x * sc, cam.y * sc, canvas.width / cam.zoom * sc, canvas.height / cam.zoom * sc);
  }
  setInterval(renderMini, 400);

  mini.addEventListener('mousedown', (e) => {
    if (!sim) return;
    const r = mini.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    cam.x = fx * sim.w * TILE - canvas.width / cam.zoom / 2;
    cam.y = fy * sim.h * TILE - canvas.height / cam.zoom / 2;
    clampCam();
  });

  // ---------- Statistik ----------
  function drawStats() {
    const c = $('statsCanvas'), x = c.getContext('2d');
    x.fillStyle = '#14141f'; x.fillRect(0, 0, c.width, c.height);
    const hist = sim.history;
    const pad = 30, w = c.width - pad - 8, h = (c.height - 40) / 3;
    const series = [
      { key: 'p', label: t('ui.statsPop'), color: '#6fe06f' },
      { key: 'm', label: t('ui.statsMoney'), color: '#f0d95c' },
      { key: 'h', label: t('ui.statsHappy'), color: '#e39ac2', max: 100 },
    ];
    series.forEach((s, k) => {
      const top = 10 + k * (h + 10);
      x.strokeStyle = '#2e3350'; x.strokeRect(pad, top, w, h);
      x.fillStyle = s.color;
      x.font = 'bold 10px monospace';
      const last = hist.length ? hist[hist.length - 1][s.key] : 0;
      x.fillText(s.label + ': ' + last, pad, top - 2);
      if (hist.length < 2) return;
      let max = s.max || 1, min = 0;
      for (const e of hist) { if (e[s.key] > max) max = e[s.key]; if (e[s.key] < min) min = e[s.key]; }
      x.beginPath();
      hist.forEach((e, j) => {
        const px = pad + j / (hist.length - 1) * w;
        const py = top + h - (e[s.key] - min) / (max - min || 1) * (h - 4) - 2;
        if (j === 0) x.moveTo(px, py); else x.lineTo(px, py);
      });
      x.strokeStyle = s.color; x.lineWidth = 1.5; x.stroke(); x.lineWidth = 1;
      if (min < 0) {
        const py = top + h - (0 - min) / (max - min) * (h - 4) - 2;
        x.strokeStyle = 'rgba(255,107,107,0.5)';
        x.beginPath(); x.moveTo(pad, py); x.lineTo(pad + w, py); x.stroke();
      }
    });
    const sc = sim.scenario;
    const el = $('scenarioStatus');
    if (sc) {
      const name = t('scen.' + sc.id);
      const state = sc.done ? (sc.won ? t('ui.scenState.won') : t('ui.scenState.lost'))
        : t('ui.scenState.run', { y: sc.deadlineYear });
      el.textContent = name + ' — ' + t('ui.scenGoal') + ': ' + (sc.minPop || 0) + ' ' + t('ui.scenEW') +
        (sc.minHappy ? ', ' + sc.minHappy + '%' : '') +
        (sc.noCoal ? ', ' + t('ui.scenNoCoal') : '') + ' · ' + state;
    } else {
      el.textContent = sim.sandbox ? t('ui.scenSandbox') : t('ui.scenFree');
    }
    if (sim.cheated) el.textContent += ' · ' + t('cheat.shame');

    // Stadt-Dashboard: alle wichtigen Kennzahlen auf einen Blick
    const d = citySummary();
    if (d) {
      const cell = (icon, label, val, bad) =>
        '<div class="dashCell' + (bad ? ' bad' : '') + '"><span>' + icon + ' ' + label + '</span><b>' + val + '</b></div>';
      $('statsDash').innerHTML =
        cell('💼', t('res.employed'), d.employed + '/' + d.workers) +
        cell('🚧', t('res.unemployed'), d.unemployed, d.unemployed > d.workers * 0.15) +
        cell('⚡', t('ui.powerLbl'), d.power.need + '/' + d.power.supply, d.power.need > d.power.supply) +
        cell('🚰', t('ui.waterLbl'), d.water.need + '/' + d.water.supply, d.water.need > d.water.supply) +
        cell('🗑', t('ui.garbageLbl'), d.garbageProduced + '/' + d.garbageCap, d.garbageOverflow > 0) +
        cell('🚔', t('ui.crimeLbl'), d.avgCrime + '%', d.avgCrime > 45) +
        cell('🎓', t('ui.eduLbl'), d.eduLevel + '%') +
        cell('🧳', t('ui.tourists'), d.tourists + '/' + d.touristCap) +
        cell('📦', t('ui.budgetExport'), '+' + d.exportBase + ' €') +
        cell('🌐', t('diag.export'), d.ext);
    }
  }

  // ---------- Speichern / Slots ----------
  function slotKey(n) { return SLOT_KEYS[n] || SLOT_KEYS[0]; }
  function autosave() {
    if (!sim) return;
    try {
      localStorage.setItem(slotKey(currentSlot), sim.serialize());
      localStorage.setItem(slotKey(currentSlot) + '.meta', JSON.stringify({
        pop: sim.pop, date: sim.dateStr(), size: sim.w, name: sim.cityName,
        scen: sim.scenario ? t('scen.' + sim.scenario.id) : (sim.sandbox ? t('scen.sandbox') : t('scen.free')),
        ts: Date.now(),
      }));
      localStorage.setItem(LAST_SLOT_KEY, String(currentSlot));
      updateRecords();
    } catch (e) { /* voll/blockiert */ }
  }
  function slotMeta(n) {
    try {
      const m = localStorage.getItem(slotKey(n) + '.meta');
      if (m) return JSON.parse(m);
      if (localStorage.getItem(slotKey(n))) return { pop: '?', date: '?', size: '?', scen: '?', ts: 0 };
    } catch (e) {}
    return null;
  }
  function migrateLegacy() {
    try {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy && !localStorage.getItem(SLOT_KEYS[0])) {
        localStorage.setItem(SLOT_KEYS[0], legacy);
        localStorage.removeItem(LEGACY_KEY);
      }
    } catch (e) {}
  }
  function pickFreeSlot() {
    for (let n = 0; n < 3; n++) if (!slotMeta(n)) return n;
    let oldest = 0, oldestTs = Infinity;
    for (let n = 0; n < 3; n++) {
      const m = slotMeta(n);
      if (m && (m.ts || 0) < oldestTs) { oldestTs = m.ts || 0; oldest = n; }
    }
    return oldest;
  }

  $('btnSave').addEventListener('click', () => {
    autosave();
    toast(t('ui.saved', { n: currentSlot + 1 }));
    Sound.sfx.cash();
  });
  window.addEventListener('beforeunload', autosave);

  function renderSlots() {
    const list = $('slotList');
    list.innerHTML = '';
    for (let n = 0; n < 3; n++) {
      const m = slotMeta(n);
      const row = document.createElement('div');
      row.className = 'slotRow' + (m ? '' : ' empty');
      const info = m
        ? '<b>Slot ' + (n + 1) + '</b> — ' + (m.name ? m.name + ' · ' : '') + m.scen + '<br>👤 ' + m.pop + ' · ' + m.date + ' · ' + m.size + '×' + m.size
        : '<b>Slot ' + (n + 1) + '</b> — ' + t('ui.slotEmpty');
      row.innerHTML = '<div class="slotInfo">' + info + '</div>';
      const btns = document.createElement('div');
      btns.className = 'slotBtns';
      if (m) {
        const load = document.createElement('button');
        load.className = 'btn'; load.textContent = t('ui.load');
        load.addEventListener('click', () => { loadSlot(n); });
        const exp = document.createElement('button');
        exp.className = 'btn'; exp.textContent = '⬇';
        exp.addEventListener('click', () => exportSlot(n));
        const del = document.createElement('button');
        del.className = 'btn'; del.textContent = '🗑';
        del.addEventListener('click', () => {
          if (!confirm(t('ui.confirmDelete', { n: n + 1 }))) return;
          localStorage.removeItem(slotKey(n));
          localStorage.removeItem(slotKey(n) + '.meta');
          renderSlots();
        });
        btns.append(load, exp, del);
      }
      row.appendChild(btns);
      list.appendChild(row);
    }
  }

  function exportSlot(n) {
    const data = localStorage.getItem(slotKey(n));
    if (!data) return;
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'retropolis-slot' + (n + 1) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    toast(t('ui.exported', { n: n + 1 }));
  }

  $('btnImport').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const d = JSON.parse(reader.result);
        if (!d.w || !d.h || !(d.st || (d.rle && d.rle.st))) throw new Error('invalid');
        const test = Sim.load(reader.result);
        const n = pickFreeSlot();
        localStorage.setItem(slotKey(n), reader.result);
        localStorage.setItem(slotKey(n) + '.meta', JSON.stringify({
          pop: test.pop, date: test.dateStr(), size: test.w,
          scen: test.scenario ? t('scen.' + test.scenario.id) : (test.sandbox ? t('scen.sandbox') : 'Import'),
          ts: Date.now(),
        }));
        renderSlots();
        toast(t('ui.imported', { n: n + 1 }));
        Sound.sfx.cash();
      } catch (err) {
        toast(t('ui.importFail', { msg: err.message }), 'bad');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  });

  function loadSlot(n) {
    try {
      const data = localStorage.getItem(slotKey(n));
      if (!data) return;
      const loaded = Sim.load(data);
      currentSlot = n;
      $('slotsPanel').classList.add('hidden');
      startGame(loaded, true);
    } catch (err) {
      console.error('Spielstand defekt:', err);
      toast(t('ui.slotBroken', { n: n + 1 }), 'bad');
    }
  }

  // ---------- UI-Verkabelung ----------
  [0, 1, 2, 3].forEach(k => $('spd' + k).addEventListener('click', () => { setSpeed(k); Sound.sfx.click(); }));
  $('overlaySel').addEventListener('change', (e) => { overlay = e.target.value; });
  $('btnUndo').addEventListener('click', doUndo);
  $('btnRedo').addEventListener('click', doRedo);

  $('btnSfx').addEventListener('click', (e) => {
    const on = Sound.toggleSfx();
    e.target.textContent = on ? '🔊' : '🔇';
  });
  $('btnMusic').addEventListener('click', (e) => {
    Sound.unlock();
    const on = Sound.toggleMusic();
    e.target.style.opacity = on ? 1 : 0.4;
  });

  $('btnStats').addEventListener('click', () => {
    drawStats();
    $('statsPanel').classList.toggle('hidden');
    Sound.sfx.click();
  });
  $('btnStatsClose').addEventListener('click', () => $('statsPanel').classList.add('hidden'));

  $('btnResidents').addEventListener('click', () => {
    const panel = $('residentsPanel');
    const show = panel.classList.contains('hidden');
    panel.classList.toggle('hidden');
    if (show) renderResidents();
    Sound.sfx.click();
  });
  $('btnResidentsClose').addEventListener('click', () => $('residentsPanel').classList.add('hidden'));
  $('btnResidentsRefresh').addEventListener('click', () => { renderResidents(); Sound.sfx.click(); });
  setInterval(() => { if (sim && !$('residentsPanel').classList.contains('hidden')) renderResidents(); }, 4000);
  setInterval(() => { if (sim && !$('statsPanel').classList.contains('hidden')) drawStats(); }, 2000);

  $('btnBudget').addEventListener('click', () => {
    updateBudgetPanel();
    $('budgetPanel').classList.toggle('hidden');
    Sound.sfx.click();
  });
  $('btnBudgetClose').addEventListener('click', () => $('budgetPanel').classList.add('hidden'));

  $('btnLoan').addEventListener('click', () => {
    if (!sim) return;
    sim.takeLoan();
    drainEvents();
    updateBudgetPanel();
    Sound.sfx.cash();
  });
  $('btnRepay').addEventListener('click', () => {
    if (!sim) return;
    const r = sim.repayLoan();
    if (!r.ok) { toast('❌ ' + t(r.reason), 'bad'); Sound.sfx.error(); }
    else Sound.sfx.cash();
    drainEvents();
    updateBudgetPanel();
  });

  $('taxSlider').addEventListener('input', (e) => {
    if (!sim) return;
    sim.taxRate = +e.target.value;
    $('taxVal').textContent = sim.taxRate + '%';
  });
  $('musicVol').addEventListener('input', (e) => Sound.setMusicVol(e.target.value / 100));
  $('sfxVol').addEventListener('input', (e) => Sound.setSfxVol(e.target.value / 100));
  $('chkDisaster').addEventListener('change', (e) => { if (sim) sim.disasters = e.target.checked; });
  $('chkNight').addEventListener('change', (e) => { nightEnabled = e.target.checked; });
  $('chkCrt').addEventListener('change', (e) => {
    $('scanlines').classList.toggle('off', !e.target.checked);
  });
  $('chkTouchConfirm').addEventListener('change', (e) => { touchConfirmMode = e.target.checked; });
  $('langSel').addEventListener('change', (e) => {
    I18N.setLang(e.target.value);
    applyI18n();
  });

  function updateBudgetPanel() {
    if (!sim) return;
    const b = sim.lastBudget;
    const rows = $('budgetRows');
    if (b) {
      rows.innerHTML =
        '<div><span>' + t('ui.budgetIncome') + '</span><span class="plus">+' + b.income + ' €</span></div>' +
        (b.casino ? '<div><span>' + t('ui.budgetCasino') + '</span><span class="plus">+' + b.casino + ' €</span></div>' : '') +
        (b.fares ? '<div><span>' + t('ui.budgetFares') + '</span><span class="plus">+' + b.fares + ' €</span></div>' : '') +
        (b.export ? '<div><span>' + t('ui.budgetExport') + '</span><span class="plus">+' + b.export + ' €</span></div>' : '') +
        (b.tourism ? '<div><span>' + t('ui.budgetTourism') + '</span><span class="plus">+' + b.tourism + ' €</span></div>' : '') +
        '<div><span>' + t('ui.budgetUpkeep') + '</span><span class="minus">−' + b.upkeep + ' €</span></div>' +
        (b.transit ? '<div><span>' + t('ui.budgetTransit') + '</span><span class="minus">−' + b.transit + ' €</span></div>' : '') +
        (b.interest ? '<div><span>' + t('ui.budgetInterest') + '</span><span class="minus">−' + b.interest + ' €</span></div>' : '') +
        (b.policy ? '<div><span>' + t('ui.budgetPolicy') + '</span><span class="minus">−' + b.policy + ' €</span></div>' : '') +
        '<div><span><b>' + t('ui.budgetNet') + '</b></span><span class="' + (b.net >= 0 ? 'plus' : 'minus') + '"><b>' + (b.net >= 0 ? '+' : '') + b.net + ' €</b></span></div>';
    } else {
      rows.innerHTML = '<div><span>' + t('ui.budgetNone') + '</span><span></span></div>';
    }
    // Stadt-Status: Müll, Kriminalität, Bildung
    const gcol = sim.garbageOverflow > 0 ? '#ff6b6b' : '#7fe0a0';
    const ccol = sim.avgCrime > 45 ? '#ff6b6b' : sim.avgCrime > 20 ? '#f0d95c' : '#7fe0a0';
    $('budgetStatus').innerHTML =
      '<span>🗑 ' + t('ui.garbageLbl') + ': <b style="color:' + gcol + '">' + sim.garbageProduced + '/' + sim.garbageCap + '</b></span>' +
      '<span>🚔 ' + t('ui.crimeLbl') + ': <b style="color:' + ccol + '">' + Math.round(sim.avgCrime) + '%</b></span>' +
      '<span>🎓 ' + t('ui.eduLbl') + ': <b>' + Math.round(sim.eduLevel * 100) + '%</b></span>';
    $('debtLabel').textContent = t('ui.debt', { v: fmtMoney(sim.debt) });
    $('btnRepay').disabled = sim.debt <= 0;
    $('taxSlider').value = sim.taxRate;
    $('taxVal').textContent = sim.taxRate + '%';
    $('chkDisaster').checked = sim.disasters;
    $('chkNight').checked = nightEnabled;
    $('chkTouchConfirm').checked = touchConfirmMode;
    $('musicVol').value = Math.round(Sound.musicVol * 100);
    $('sfxVol').value = Math.round(Sound.sfxVol * 100);
    // Verordnungs-Schalter spiegeln
    $('polSmokeDetect').checked = sim.policies.smokeDetect;
    $('polRecycle').checked = sim.policies.recycle;
    $('polProBiz').checked = sim.policies.proBiz;
    $('polConserve').checked = sim.policies.conserve;
    $('polCulture').checked = sim.policies.culture;
  }

  // Verordnungs-Checkboxen → sim.policies (Neuberechnung anstoßen)
  [['polSmokeDetect', 'smokeDetect'], ['polRecycle', 'recycle'], ['polProBiz', 'proBiz'],
   ['polConserve', 'conserve'], ['polCulture', 'culture']].forEach(([id, key]) => {
    $(id).addEventListener('change', (e) => {
      if (!sim) return;
      sim.policies[key] = e.target.checked;
      sim.dirtyPower = true; // Sparmaßnahmen ändern den Bedarf sofort
      Sound.sfx.click();
    });
  });

  $('btnMenu').addEventListener('click', () => {
    autosave();
    running = false;
    setSpeed(0);
    showTitle();
  });

  // ---------- Neues Spiel ----------
  function renderScenarioList() {
    const list = $('scenarioList');
    list.innerHTML = '';
    SCENARIOS.forEach(sc => {
      const d = document.createElement('div');
      d.className = 'scenOpt' + (ngScenario === sc.id ? ' sel' : '');
      d.innerHTML = '<b>' + t('scen.' + sc.id) + '</b><small>' + t('scen.' + sc.id + '.d') + '</small>';
      d.addEventListener('click', () => {
        ngScenario = sc.id;
        renderScenarioList();
        const fixed = !!sc.fixedSeed;
        $('seedInput').disabled = fixed;
        $('sizeSel').disabled = fixed;
        if (fixed) { $('seedInput').value = sc.fixedSeed; $('sizeSel').value = String(sc.fixedSize); }
        drawPreview();
        Sound.sfx.click();
      });
      list.appendChild(d);
    });
  }

  function drawPreview() {
    const seed = parseInt($('seedInput').value, 10) || 1;
    const size = parseInt($('sizeSel').value, 10) || 64;
    // Das Rauschen ist auf 0..1 normiert: eine 160er-Generierung zeigt
    // dieselbe Karte wie 1024 — nur gröber. Hält die Vorschau sofortig.
    const gen = Math.min(size, 160);
    const tmp = new Sim(gen, gen, seed);
    const c = $('mapPreview'), x = c.getContext('2d');
    const img = x.createImageData(gen, gen);
    const cols = [[62, 122, 56], [47, 111, 196], [216, 181, 106], [44, 110, 49]];
    for (let i = 0; i < gen * gen; i++) {
      const col = cols[tmp.terr[i]];
      img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = 255;
    }
    const t2 = document.createElement('canvas');
    t2.width = gen; t2.height = gen;
    t2.getContext('2d').putImageData(img, 0, 0);
    x.imageSmoothingEnabled = false;
    x.clearRect(0, 0, 192, 192);
    x.drawImage(t2, 0, 0, 192, 192);
    $('previewNote').textContent = t('ui.preview') + (size >= 256 ? ' · ' + t('ui.sizeWarn') : '');
  }

  function openNewGame() {
    ngScenario = 'free';
    $('seedInput').disabled = false;
    $('sizeSel').disabled = false;
    $('seedInput').value = String((Math.random() * 1e9) | 0);
    renderScenarioList();
    drawPreview();
    $('newGamePanel').classList.remove('hidden');
  }

  $('btnDice').addEventListener('click', () => {
    $('seedInput').value = String((Math.random() * 1e9) | 0);
    drawPreview();
    Sound.sfx.click();
  });
  $('seedInput').addEventListener('input', drawPreview);
  $('sizeSel').addEventListener('change', drawPreview);
  $('btnNgCancel').addEventListener('click', () => $('newGamePanel').classList.add('hidden'));

  $('btnNgStart').addEventListener('click', () => {
    const sc = SCENARIOS.find(s => s.id === ngScenario);
    const seed = sc.fixedSeed || parseInt($('seedInput').value, 10) || ((Math.random() * 1e9) | 0);
    const size = sc.fixedSize || parseInt($('sizeSel').value, 10) || 64;
    const fresh = buildScenario(sc, size, seed);
    fresh.cityName = ($('cityNameInput').value.trim() || 'Retropolis').slice(0, 18);
    currentSlot = pickFreeSlot();
    $('newGamePanel').classList.add('hidden');
    startGame(fresh, false);
    toast(t('ui.autosaveIn', { n: currentSlot + 1 }));
  });

  function buildScenario(sc, size, seed) {
    const s = new Sim(size, size, seed);
    if (sc.goal) {
      s.scenario = {
        id: sc.id,
        minPop: sc.goal.minPop || 0, minHappy: sc.goal.minHappy || 0,
        noCoal: !!sc.goal.noCoal,
        deadlineYear: s.year + sc.goal.years,
        done: false, won: false,
      };
    }
    if (sc.id === 'sandbox') {
      s.sandbox = true;
      s.disasters = false;
      s.money = 999999999;
    }
    if (sc.id === 'broke') {
      s.money = 100000;
      const cx = size >> 1, cy = size >> 1;
      for (let y = cy - 8; y <= cy + 8; y += 4)
        for (let x = cx - 12; x <= cx + 12; x++) s.place(S_ROAD, x, y);
      for (let x = cx - 8; x <= cx + 8; x += 8)
        for (let y = cy - 8; y <= cy + 8; y++) s.place(S_ROAD, x, y);
      for (let y = cy - 8; y <= cy + 8; y++) for (let x = cx - 12; x <= cx + 12; x++) {
        if (s.st[s.idx(x, y)] !== S_NONE) continue;
        const r = (x + y * 3) % 7;
        s.place(r < 3 ? S_RZONE : r < 5 ? S_CZONE : S_IZONE, x, y);
      }
      for (let x = cx - 12; x <= cx + 12; x++) {
        if (s.canPlace(S_COAL, x, cy - 11).ok) { s.place(S_COAL, x, cy - 11); break; }
      }
      for (let x = cx - 12; x <= cx + 12; x++) s.place(S_WIRE, x, cy - 9);
      for (let t2 = 0; t2 < 400; t2++) { s.tick(); s.events.length = 0; }
      s.money = 800;
      s.debt = 20000;
      s.taxRate = 14;
      s.history = [];
      s.milestones = {};
    }
    return s;
  }

  // ============================================================
  // RETRO-NET BBS: Stadt teilen, einwählen, Rekorde, Zeitung
  // ============================================================
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function loadRecords() {
    try { return JSON.parse(localStorage.getItem('retropolis.records') || '[]'); } catch (e) { return []; }
  }
  function updateRecords() {
    if (!sim || sim.sandbox) return;
    try {
      const recs = loadRecords();
      const k = recs.findIndex(r => r.slot === currentSlot);
      const entry = { slot: currentSlot, name: sim.cityName, pop: sim.pop, year: sim.year, cheated: sim.cheated, ts: Date.now() };
      if (k >= 0) {
        if (sim.pop > recs[k].pop) recs[k] = entry;
        else { recs[k].name = sim.cityName; recs[k].cheated = recs[k].cheated || sim.cheated; }
      } else recs.push(entry);
      recs.sort((a, b) => b.pop - a.pop);
      localStorage.setItem('retropolis.records', JSON.stringify(recs.slice(0, 8)));
    } catch (e) {}
  }

  function openBbs() {
    if (!sim) return;
    Sound.unlock();
    Sound.sfx.modem();
    $('bbsPanel').classList.remove('hidden');
    bbsRender('menu');
  }
  function closeBbs() { $('bbsPanel').classList.add('hidden'); }

  function bbsRender(view) {
    $('bbsHeader').textContent =
      t('bbs.header', { name: (sim ? sim.cityName : '—').toUpperCase() }) + '\n' + t('bbs.connecting');
    const b = $('bbsBody');
    b.innerHTML = '';
    const item = (txt, fn) => {
      const d = document.createElement('div');
      d.className = 'bbsItem';
      d.textContent = txt;
      d.addEventListener('click', () => { Sound.sfx.click(); fn(); });
      b.appendChild(d);
    };
    const line = (txt) => { const d = document.createElement('div'); d.textContent = txt; b.appendChild(d); };
    if (view === 'menu') {
      item(t('bbs.m1'), () => bbsRender('pub'));
      item(t('bbs.m2'), () => bbsRender('dial'));
      item(t('bbs.m3'), () => bbsRender('rec'));
      item(t('bbs.m4'), () => bbsRender('news'));
      item(t('bbs.m5'), closeBbs);
    } else if (view === 'pub') {
      const link = shareLink();
      line(t('bbs.pubInfo', { kb: (link.length / 1024).toFixed(1) }));
      const ta = document.createElement('textarea');
      ta.value = link; ta.readOnly = true;
      b.appendChild(ta);
      const copy = document.createElement('button');
      copy.className = 'btn';
      copy.textContent = t('bbs.copyLink');
      copy.addEventListener('click', () => {
        ta.select();
        try { navigator.clipboard.writeText(link); } catch (e) { document.execCommand('copy'); }
        copy.textContent = t('bbs.copied');
        Sound.sfx.cash();
      });
      b.appendChild(copy);
      item(t('bbs.back'), () => bbsRender('menu'));
    } else if (view === 'dial') {
      line(t('bbs.dialInfo'));
      const ta = document.createElement('textarea');
      b.appendChild(ta);
      const go = document.createElement('button');
      go.className = 'btn';
      go.textContent = t('bbs.dialGo');
      go.addEventListener('click', () => {
        try {
          const loaded = tryImportCode(ta.value);
          line(t('bbs.dialOk', { name: loaded.cityName, pop: loaded.pop }));
          Sound.sfx.milestone();
          currentSlot = pickFreeSlot();
          setTimeout(() => { closeBbs(); startGame(loaded, true); }, 900);
        } catch (err) {
          line(t('bbs.dialErr'));
          Sound.sfx.error();
        }
      });
      b.appendChild(go);
      item(t('bbs.back'), () => bbsRender('menu'));
    } else if (view === 'rec') {
      line('== ' + t('bbs.recHead') + ' ==');
      const recs = loadRecords();
      if (!recs.length) line(t('bbs.recEmpty'));
      recs.forEach((r, k) => line((k + 1) + '. ' + r.name + ' — ' + r.pop + ' · ' + r.year + (r.cheated ? ' 😈' : '')));
      item(t('bbs.back'), () => bbsRender('menu'));
    } else if (view === 'news') {
      line(t('news.title') + ' — ' + (sim ? sim.dateStr() : ''));
      if (!newsFeed.length) {
        const d = document.createElement('div');
        d.className = 'newsItem';
        d.textContent = t('news.empty');
        b.appendChild(d);
      }
      newsFeed.forEach(n => {
        const d = document.createElement('div');
        d.className = 'newsItem';
        d.innerHTML = '<small>' + escapeHtml(n.d) + '</small><br>' + escapeHtml(n.txt);
        b.appendChild(d);
      });
      item(t('bbs.back'), () => bbsRender('menu'));
    }
  }
  $('btnBbs').addEventListener('click', openBbs);

  // ---------- Foto-Modus: Postkarte ----------
  function renderPostcard() {
    const W = sim.w, H = sim.h;
    let photo;
    if (W > 160) {
      // Riesenkarten: Pixel-Luftbild (2px/Kachel) statt 16k-Sprite-Render
      photo = document.createElement('canvas');
      photo.width = W * 2; photo.height = H * 2;
      const px = photo.getContext('2d');
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        px.fillStyle = miniColor(sim.idx(x, y));
        px.fillRect(x * 2, y * 2, 2, 2);
      }
    } else {
      // Ganze Stadt bei Tag ablichten
      photo = document.createElement('canvas');
      photo.width = W * TILE; photo.height = H * TILE;
      const px = photo.getContext('2d');
      px.imageSmoothingEnabled = false;
      const waterSpr = Sprites.get('water', 0, false);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
        if (sim.terr[sim.idx(x, y)] === T_WATER) px.drawImage(waterSpr, x * TILE, y * TILE);
      for (let cy = 0; cy < chunksY; cy++) for (let cx = 0; cx < chunksX; cx++) {
        bakeChunk(cx, cy, false);
        const ch = getChunk(cx, cy);
        px.drawImage(ch.cv, cx * CHUNK * TILE, cy * CHUNK * TILE);
        ch.dirty = true; // Anzeige backt danach wieder aktuell
      }
    }
    // Postkarte 640x480
    const pc = document.createElement('canvas');
    pc.width = 640; pc.height = 480;
    const g = pc.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#efe6d0'; g.fillRect(0, 0, 640, 480);
    g.strokeStyle = '#b8a888'; g.lineWidth = 2; g.strokeRect(5, 5, 630, 470);
    const fw = 600, fh = 356;
    const sc = Math.min(fw / photo.width, fh / photo.height);
    const dw = photo.width * sc, dh = photo.height * sc;
    g.fillStyle = '#10101c'; g.fillRect(20, 20, fw, fh);
    g.drawImage(photo, 20 + (fw - dw) / 2, 20 + (fh - dh) / 2, dw, dh);
    g.strokeStyle = '#1a1a29'; g.strokeRect(20, 20, fw, fh);
    // Briefmarke mit Häuschen
    g.fillStyle = '#fff'; g.fillRect(556, 30, 56, 68);
    g.strokeStyle = '#c9484f'; g.strokeRect(559, 33, 50, 62);
    g.drawImage(Sprites.store.r[1], 564, 40, 40, 40);
    g.fillStyle = '#1a1a29'; g.font = 'bold 10px monospace';
    g.fillText(String(sim.year), 572, 92);
    // Poststempel
    g.strokeStyle = 'rgba(40,40,60,0.6)';
    g.beginPath(); g.arc(520, 62, 26, 0, 7); g.stroke();
    g.font = 'bold 8px monospace'; g.fillStyle = 'rgba(40,40,60,0.75)';
    g.fillText(sim.dateStr(), 486, 64);
    // Grußtext
    g.font = 'bold 26px monospace'; g.fillStyle = '#8d3742';
    g.fillText(t('pc.greet', { name: sim.cityName }), 24, 414);
    g.font = 'bold 14px monospace'; g.fillStyle = '#3a4258';
    g.fillText(t('pc.stats', { pop: sim.pop, date: sim.dateStr() }), 24, 438);
    g.font = '10px monospace'; g.fillStyle = '#8a8072';
    g.fillText('RETROPOLIS · 16-BIT CITY BUILDER', 24, 460);
    return pc;
  }

  $('btnCamera').addEventListener('click', () => {
    if (!sim || !running) return;
    Sound.sfx.shutter();
    $('postcardImg').src = renderPostcard().toDataURL('image/png');
    $('postcardPanel').classList.remove('hidden');
  });
  $('btnPcSave').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = $('postcardImg').src;
    a.download = 'postkarte-' + (sim ? sim.cityName.replace(/\W+/g, '_') : 'stadt') + '.png';
    a.click();
    Sound.sfx.cash();
  });
  $('btnPcClose').addEventListener('click', () => $('postcardPanel').classList.add('hidden'));

  // ---------- Titelbildschirm ----------
  function showTitle() {
    $('titleScreen').classList.remove('hidden');
    const last = parseInt(localStorage.getItem(LAST_SLOT_KEY) || '0', 10);
    $('btnContinue').classList.toggle('hidden', !slotMeta(last));
  }

  function startGame(simInstance, fromSave) {
    sim = simInstance;
    undoStack.length = 0; redoStack.length = 0;
    cars = []; trains = []; ships = []; planes = [];
    lineVeh.clear();
    transitPick = null;
    $('transitPanel').classList.add('hidden');
    $('transitPickBar').classList.add('hidden');
    clearPendingTap();
    initChunks();
    sim.allChanged = true;
    updateUndoButtons();
    $('titleScreen').classList.add('hidden');
    running = true;
    tutorialShown = !fromSave;
    selected = null;
    $('infoPanel').classList.add('hidden');
    updateBudgetPanel();
    centerCam();
    selectTool('road');
    setSpeed(1);
    Sound.startMusic();
    autosave();
    if (!fromSave) {
      if (sim.scenario) {
        setTimeout(() => toast(t('ui.scenStart', {
          name: t('scen.' + sim.scenario.id), pop: sim.scenario.minPop, y: sim.scenario.deadlineYear,
        }), 'milestone'), 400);
      } else {
        setTimeout(() => toast(t('ui.welcome')), 400);
      }
      setTimeout(() => toast(t('ui.tipZones')), 4800);
      setTimeout(() => toast(t('ui.tipWater')), 9600);
    } else {
      toast(t('ui.resume'));
    }
  }

  $('btnNew').addEventListener('click', () => { Sound.unlock(); openNewGame(); });
  $('btnContinue').addEventListener('click', () => {
    Sound.unlock();
    loadSlot(parseInt(localStorage.getItem(LAST_SLOT_KEY) || '0', 10));
  });
  $('btnSlots').addEventListener('click', () => {
    Sound.unlock();
    renderSlots();
    $('slotsPanel').classList.remove('hidden');
  });
  $('btnSlotsClose').addEventListener('click', () => $('slotsPanel').classList.add('hidden'));

  // ---------- Boot ----------
  function boot() {
    Sprites.init();
    makeIcons();
    applyI18n();
    migrateLegacy();
    resize();
    showTitle();
    updateUndoButtons();
    // Geteilte Stadt aus dem Link laden (#city=…)
    if (location.hash.startsWith('#city=')) {
      try {
        const loaded = tryImportCode(location.hash);
        history.replaceState(null, '', location.pathname + location.search);
        if (confirm(t('share.confirm', { name: loaded.cityName, pop: loaded.pop, date: loaded.dateStr() }))) {
          currentSlot = pickFreeSlot();
          startGame(loaded, true);
          toast(t('share.loaded', { name: loaded.cityName }), 'milestone');
        }
      } catch (e) {
        console.error('Stadt-Link defekt:', e);
        toast(t('share.invalid'), 'bad');
      }
    }
    requestAnimationFrame(render);
  }

  // Debug-/Test-Zugang
  window.RETRO = {
    get sim() { return sim; },
    loadSlot, startGame, buildScenario, SCENARIOS,
    shareLink, tryImportCode, citizenOf, renderPostcard,
    get newsFeed() { return newsFeed; },
    get shipCount() { return ships.length; },
    get planeCount() { return planes.length; },
    spawnShip: trySpawnShip, spawnPlane: trySpawnPlane,
    citySummary,
  };

  boot();
})();
