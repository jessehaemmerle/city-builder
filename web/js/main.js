/* ============================================================
 * RETROPOLIS — Hauptspiel: Rendering, Eingabe, UI, Spielschleife
 * Autos & Züge, Tag/Nacht, Undo/Redo, Berater, Statistik,
 * Szenarien, Save-Slots, Import/Export, Kartenvorschau.
 * ============================================================ */
'use strict';

(() => {

  const SLOT_KEYS = ['retropolis.slot1', 'retropolis.slot2', 'retropolis.slot3'];
  const LEGACY_KEY = 'retropolis.save';
  const LAST_SLOT_KEY = 'retropolis.lastSlot';

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

  // Undo/Redo
  const undoStack = [], redoStack = [];
  const UNDO_MAX = 60;

  // Fahrzeuge (rein visuell)
  let cars = [];
  let trains = [];
  let lastCarSpawn = 0;

  // Berater-Warteschlange
  const advisorQueue = [];
  let advisorTimer = null;
  const ADVISORS = {
    finance: 'Kämmerer Konrad',
    power: 'Ing. Elke Watt',
    env: 'Dr. Flora Grün',
    fire: 'Brandmeister Falk',
    water: 'Wassermeisterin Wilma',
  };

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const mini = document.getElementById('minimap');
  const mctx = mini.getContext('2d');

  const $ = (id) => document.getElementById(id);

  // ---------- Szenarien ----------
  const SCENARIOS = [
    {
      id: 'free', name: 'Freies Spiel',
      desc: 'Klassischer Modus: 25.000 € Startkapital, baue in deinem Tempo.',
    },
    {
      id: 'sandbox', name: 'Sandbox',
      desc: 'Unbegrenztes Geld, Katastrophen aus — einfach drauflos bauen.',
    },
    {
      id: 'sprint', name: 'Szenario: Wachstums-Sprint',
      desc: 'Ziel: 1.000 Einwohner in 5 Jahren. Leere Karte, normale Kasse.',
      goal: { minPop: 1000, years: 5 },
    },
    {
      id: 'green', name: 'Szenario: Grüne Metropole',
      desc: 'Ziel: 2.000 Einwohner und Zufriedenheit ≥ 55% in 10 Jahren — Kohlekraft ist verboten!',
      goal: { minPop: 2000, minHappy: 55, years: 10, noCoal: true },
    },
    {
      id: 'broke', name: 'Szenario: Die Pleite-Stadt',
      desc: 'Übernimm eine verschuldete Stadt (20.000 € Schulden, hohe Steuern). Ziel: 1.500 Einwohner und Zufriedenheit ≥ 50% in 8 Jahren.',
      goal: { minPop: 1500, minHappy: 50, years: 8 },
      fixedSeed: 777, fixedSize: 64,
    },
  ];
  let ngScenario = 'free';

  // ---------- Werkzeuge ----------
  const TOOLS = [
    { id: 'point',    name: 'Info',      key: '1', mode: 'point' },
    { id: 'dozer',    name: 'Abriss',    key: '2', mode: 'paint', cost: 1 },
    { id: 'road',     name: 'Straße',    key: '3', mode: 'line', s: S_ROAD },
    { id: 'rail',     name: 'Schiene',   mode: 'line', s: S_RAIL },
    { id: 'wire',     name: 'Leitung',   key: '4', mode: 'line', s: S_WIRE },
    { id: 'rz',       name: 'Wohnen',    key: '5', mode: 'rect', s: S_RZONE },
    { id: 'cz',       name: 'Gewerbe',   key: '6', mode: 'rect', s: S_CZONE },
    { id: 'iz',       name: 'Industrie', key: '7', mode: 'rect', s: S_IZONE },
    { id: 'wind',     name: 'Windrad',   key: '8', mode: 'single', s: S_WIND },
    { id: 'coal',     name: 'Kohle-KW',  key: '9', mode: 'single', s: S_COAL },
    { id: 'wtower',   name: 'W-Turm',    mode: 'single', s: S_WTOWER },
    { id: 'pump',     name: 'Pumpwerk',  mode: 'single', s: S_PUMP },
    { id: 'park',     name: 'Park',      key: '0', mode: 'single', s: S_PARK },
    { id: 'police',   name: 'Polizei',   mode: 'single', s: S_POLICE },
    { id: 'firedep',  name: 'Feuerwehr', mode: 'single', s: S_FIREDEP },
    { id: 'school',   name: 'Schule',    mode: 'single', s: S_SCHOOL },
    { id: 'hospital', name: 'Klinik',    mode: 'single', s: S_HOSPITAL },
    { id: 'stadium',  name: 'Stadion',   mode: 'single', s: S_STADIUM },
    { id: 'townhall', name: 'Rathaus',   mode: 'single', s: S_TOWNHALL },
    { id: 'monument', name: 'Denkmal',   mode: 'single', s: S_MONUMENT },
    { id: 'casino',   name: 'Casino',    mode: 'single', s: S_CASINO },
  ];
  const toolById = {};
  TOOLS.forEach(t => toolById[t.id] = t);

  function toolSprite(t, frame) {
    switch (t.id) {
      case 'road': return Sprites.get('road', 10);
      case 'rail': return Sprites.get('rail', 10);
      case 'wire': return Sprites.get('wire', 10);
      case 'rz': return Sprites.store.zoneR;
      case 'cz': return Sprites.store.zoneC;
      case 'iz': return Sprites.store.zoneI;
      case 'wind': return Sprites.get('wind', frame || 0);
      case 'coal': return Sprites.store.coal;
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
    }
    return null;
  }

  let BOLT = null, DROP = null;
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
  }

  function iconFor(t) {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 16;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    if (t.id === 'point') {
      x.fillStyle = '#f2f2ef';
      for (let j = 0; j < 9; j++) x.fillRect(3, 2 + j, Math.min(j + 1, 6), 1);
      x.fillRect(6, 10, 2, 3);
      x.fillStyle = '#1a1a29';
      x.fillRect(3, 1, 1, 10);
    } else if (t.id === 'dozer') {
      x.strokeStyle = '#ff6b6b'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(3, 3); x.lineTo(13, 13); x.moveTo(13, 3); x.lineTo(3, 13); x.stroke();
    } else {
      const s = toolSprite(t, 0);
      x.drawImage(s, 0, 0, s.width, s.height, 0, 0, 16, 16);
    }
    return c.toDataURL();
  }

  // ---------- Toolbar ----------
  function buildToolbar() {
    const bar = $('toolbar');
    bar.innerHTML = '';
    TOOLS.forEach(t => {
      const d = document.createElement('div');
      d.className = 'tool';
      d.id = 'tool_' + t.id;
      const cost = t.s ? DEFS[t.s].cost : (t.cost || 0);
      d.innerHTML =
        (t.key ? '<span class="tKey">' + t.key + '</span>' : '') +
        '<img src="' + iconFor(t) + '" alt="">' +
        '<span class="tName">' + t.name + '</span>' +
        '<span class="tCost">' + (cost ? cost + '€' : '&nbsp;') + '</span>';
      d.title = t.s ? DEFS[t.s].name : (t.id === 'dozer' ? 'Abreißen / Bäume fällen' : 'Kachel-Info abfragen (ESC)');
      d.addEventListener('click', () => { selectTool(t.id); Sound.sfx.click(); });
      bar.appendChild(d);
    });
  }

  function selectTool(id) {
    const t = toolById[id];
    if (t.s && DEFS[t.s].minPop && sim && sim.pop < DEFS[t.s].minPop) {
      toast('🔒 ' + DEFS[t.s].name + ' erst ab ' + DEFS[t.s].minPop + ' Einwohnern!', 'bad');
      Sound.sfx.error();
      return;
    }
    tool = id;
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
  function showAdvisor(key, msg) {
    advisorQueue.push({ key, msg });
    if (!advisorTimer) nextAdvisor();
  }
  function nextAdvisor() {
    const box = $('advisorBox');
    if (advisorQueue.length === 0) { box.classList.add('hidden'); advisorTimer = null; return; }
    const { key, msg } = advisorQueue.shift();
    const face = $('advisorFace');
    const fx = face.getContext('2d');
    fx.clearRect(0, 0, 16, 16);
    const spr = Sprites.store.advisors[key];
    if (spr) fx.drawImage(spr, 0, 0);
    $('advisorName').textContent = ADVISORS[key] || 'Berater';
    $('advisorText').textContent = msg;
    box.classList.remove('hidden');
    Sound.sfx.click();
    advisorTimer = setTimeout(nextAdvisor, 14000);
  }
  $('btnAdvisorOk').addEventListener('click', () => {
    clearTimeout(advisorTimer); advisorTimer = null;
    $('advisorBox').classList.add('hidden');
    if (advisorQueue.length) nextAdvisor();
  });

  // ---------- Kamera / Koordinaten ----------
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
      if (hover.x < 0) return null;
      const t = toolById[tool];
      if (t.mode === 'single' || t.mode === 'line' || t.mode === 'rect' || t.mode === 'paint')
        return [[hover.x, hover.y]];
      return null;
    }
    const t = toolById[tool];
    if (t.mode === 'line') return linePath(drag.x0, drag.y0, drag.x1, drag.y1);
    if (t.mode === 'rect') return rectTiles(drag.x0, drag.y0, drag.x1, drag.y1);
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
    }
  }
  function recomputeAfterSnap() {
    sim.dirtyPower = true; sim.dirtyCov = true;
    sim.computePower(); sim.computeCoverage(); sim.computeRoadAccess(); sim.computeStats();
  }
  function affectedIndices(tool_, x, y) {
    // Footprint bzw. bei Abriss die ganze Gebäudegruppe
    const t = toolById[tool_];
    const idxs = [];
    if (t.id === 'dozer') {
      const i = sim.idx(x, y);
      if (sim.st[i] === S_NONE) { idxs.push(i); return idxs; }
      const a = sim.anchor[i] >= 0 ? sim.anchor[i] : i;
      for (let j = 0; j < sim.w * sim.h; j++) if (sim.anchor[j] === a || j === a) idxs.push(j);
      return idxs;
    }
    const size = (t.s && DEFS[t.s].size === 2) ? 2 : 1;
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
    toast('↶ Rückgängig (+' + a.money + ' €)');
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
    toast('↷ Wiederholt (−' + a.money + ' €)');
  }
  function updateUndoButtons() {
    $('btnUndo').style.opacity = undoStack.length ? 1 : 0.4;
    $('btnRedo').style.opacity = redoStack.length ? 1 : 0.4;
  }

  function commitBuild() {
    const t = toolById[tool];
    const tiles = previewTiles() || [];
    let built = 0, spent = 0, lastReason = '';
    const parts = [];
    for (const [x, y] of tiles) {
      if (!sim.inMap(x, y)) continue;
      const idxs = affectedIndices(tool, x, y);
      const before = snapTiles(idxs);
      let r;
      if (t.id === 'dozer') r = sim.bulldoze(x, y);
      else if (t.s) r = sim.place(t.s, x, y);
      else continue;
      if (r.ok) {
        built++; spent += r.cost;
        parts.push({ before, after: snapTiles(idxs) });
      } else if (r.reason !== 'schon vorhanden') lastReason = r.reason;
    }
    if (built > 0) {
      pushUndo({ parts, money: spent });
      if (t.id === 'dozer') Sound.sfx.dozer();
      else if (t.id === 'road' || t.id === 'rail') Sound.sfx.road();
      else if (t.id === 'wire') Sound.sfx.wire();
      else if (t.mode === 'rect') Sound.sfx.zone();
      else Sound.sfx.place();
      maybeTutorial(t);
    } else if (lastReason) {
      toast('❌ ' + lastReason, 'bad');
      Sound.sfx.error();
    }
  }

  const tutSeen = {};
  function maybeTutorial(t) {
    if (!tutorialShown) return;
    if ((t.id === 'wind' || t.id === 'coal') && !tutSeen.power) {
      tutSeen.power = true;
      toast('💡 Straßen leiten Strom — verbinde das Kraftwerk mit dem Netz!');
    } else if (t.mode === 'rect' && !tutSeen.zone) {
      tutSeen.zone = true;
      toast('💡 Zonen brauchen Strom + Straße/Schiene im Umkreis von 3 Feldern.');
    } else if ((t.id === 'wtower' || t.id === 'pump') && !tutSeen.water) {
      tutSeen.water = true;
      toast('💡 Mit Wasser wachsen Zonen über Stufe 2 hinaus!');
    }
  }

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
    const t = toolById[tool];
    if (t.mode === 'point') { selectTile(p.x, p.y); return; }
    drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    if (t.mode === 'paint' || t.mode === 'single') {
      commitBuild();
      if (t.mode === 'single') drag = null;
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
      const t = toolById[tool];
      if ((p.x !== drag.x1 || p.y !== drag.y1)) {
        drag.x1 = p.x; drag.y1 = p.y;
        if (t.mode === 'paint') commitBuild();
      }
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (e.button === 2 || e.button === 1) { panning = null; return; }
    if (e.button !== 0 || !drag || !sim) return;
    const t = toolById[tool];
    if (t.mode === 'line' || t.mode === 'rect') commitBuild();
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
      const t = e.touches[0];
      touch = { mode: 'tap', sx: t.clientX, sy: t.clientY, cx: cam.x, cy: cam.y };
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
      const t = e.touches[0];
      if (Math.hypot(t.clientX - touch.sx, t.clientY - touch.sy) > 12) touch.mode = 'pan';
      if (touch.mode === 'pan') {
        cam.x = touch.cx - (t.clientX - touch.sx) / cam.zoom;
        cam.y = touch.cy - (t.clientY - touch.sy) / cam.zoom;
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
      const t = toolById[tool];
      if (t.mode === 'point') selectTile(p.x, p.y);
      else {
        hover = p;
        drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
        commitBuild();
        drag = null;
      }
    }
    touch = null;
  }, { passive: false });

  // ---------- Eingabe: Tastatur ----------
  window.addEventListener('keydown', (e) => {
    if (!sim || !running) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); doRedo(); return; }
    if (e.key === ' ') {
      e.preventDefault();
      if (speed === 0) setSpeed(prevSpeed || 1); else { prevSpeed = speed; setSpeed(0); }
      return;
    }
    if (e.key === 'Escape') { selectTool('point'); return; }
    if (e.key === '+') { cam.zoom = Math.min(4, cam.zoom + 1); clampCam(); return; }
    if (e.key === '-') { cam.zoom = Math.max(1, cam.zoom - 1); clampCam(); return; }
    const pan = 24 / cam.zoom * 4;
    if (e.key === 'ArrowUp' || e.key === 'w') { cam.y -= pan; clampCam(); }
    if (e.key === 'ArrowDown' || e.key === 's') { cam.y += pan; clampCam(); }
    if (e.key === 'ArrowLeft' || e.key === 'a') { cam.x -= pan; clampCam(); }
    if (e.key === 'ArrowRight' || e.key === 'd') { cam.x += pan; clampCam(); }
    const t = TOOLS.find(t => t.key === e.key);
    if (t) selectTool(t.id);
  });

  // ---------- Info-Panel ----------
  function selectTile(x, y) {
    if (!sim.inMap(x, y)) return;
    selected = { x, y };
    updateInfoPanel();
    $('infoPanel').classList.remove('hidden');
  }

  function updateInfoPanel() {
    if (!selected) return;
    const { x, y } = selected;
    const i = sim.idx(x, y);
    const s = sim.st[i];
    const tn = ['Wiese', 'Wasser', 'Strand', 'Wald'][sim.terr[i]];
    let name = tn, extra = '';
    if (s !== S_NONE) {
      name = DEFS[s].name;
      if ((s === S_ROAD || s === S_RAIL || s === S_WIRE) && sim.terr[i] === T_WATER) name += ' (Brücke)';
      if (s >= S_RZONE && s <= S_IZONE) {
        const lv = sim.lvl[i];
        name += ' (Stufe ' + lv + '/4)';
        const val = s === S_RZONE ? R_POP[lv] + ' Einwohner'
          : s === S_CZONE ? C_JOBS[lv] + ' Jobs' : I_JOBS[lv] + ' Jobs';
        extra += '<div>' + val + '</div>';
      }
      if (s === S_ROAD) extra += '<div>Verkehr: ' + sim.traffic[i] + '%</div>';
    }
    const isBuild = sim.isBld(s);
    const chk = (b) => b ? '<span class="ok">✓</span>' : '<span class="no">✗</span>';
    let html = '<h3>' + name + '</h3>' +
      '<div>Position: ' + x + ', ' + y + '</div>' + extra;
    if (isBuild) {
      html += '<div>Strom: ' + chk(sim.powered[i]) + ' &nbsp; Anbindung: ' + chk(sim.roadOk[i]) +
        ' &nbsp; Wasser: ' + chk(sim.covWater[i] >= 20) + '</div>';
    }
    if (sim.burn[i] > 0) html += '<div class="no">🔥 BRENNT!</div>';
    if (sim.floodT[i] > 0) html += '<div class="no">🌊 ÜBERFLUTET!</div>';
    html += '<div>Landwert: ' + sim.landv[i] + '% &nbsp;·&nbsp; Umwelt: ' +
      (sim.poll[i] < 15 ? '<span class="ok">sauber</span>' : sim.poll[i] < 45 ? '⚠ belastet' : '<span class="no">verschmutzt</span>') + '</div>';
    html += '<div style="font-size:11px;color:#9aa3d6">🚓 ' + sim.covPolice[i] + '% · 🚒 ' + sim.covFire[i] + '% · 🎓 ' + sim.covSchool[i] + '% · 🏥 ' + sim.covHealth[i] + '% · 🌳 ' + sim.covPark[i] + '% · 🚰 ' + sim.covWater[i] + '%</div>';
    $('infoPanel').innerHTML = html;
  }

  // ---------- Geschwindigkeit / Spielschleife ----------
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
        if (sim.month !== prevMonth) autosave();
        drainEvents();
        if (selected) updateInfoPanel();
      }, iv);
    }
  }

  function drainEvents() {
    while (sim.events.length) {
      const ev = sim.events.shift();
      if (ev.type === 'advisor') { showAdvisor(ev.adv, ev.msg); continue; }
      toast(ev.msg, ev.type === 'milestone' ? 'milestone' : ev.type === 'bad' ? 'bad' : '');
      if (ev.type === 'milestone') Sound.sfx.milestone();
      else if (ev.type === 'bad' && (ev.msg.includes('Feuer') || ev.msg.includes('Tornado') || ev.msg.includes('Hochwasser'))) Sound.sfx.fire();
      else if (ev.type === 'bad') Sound.sfx.error();
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
    $('uiDate').textContent = sim.dateStr();
    $('rciR').style.height = Math.max(0, sim.demandR) * 100 + '%';
    $('rciC').style.height = Math.max(0, sim.demandC) * 100 + '%';
    $('rciI').style.height = Math.max(0, sim.demandI) * 100 + '%';
    // Meilenstein-Sperren visualisieren
    for (const id of ['stadium', 'townhall', 'monument', 'casino']) {
      const el = $('tool_' + id);
      const def = DEFS[toolById[id].s];
      if (el) el.classList.toggle('locked', sim.pop < def.minPop);
    }
  }

  // ---------- Fahrzeuge (visuell) ----------
  const CAR_COLORS = ['#c9484f', '#4f8fdc', '#f0d95c', '#f2f2ef', '#7a5cb8', '#e08438'];
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N E S W

  function tileHas(x, y, s) {
    return sim.inMap(x, y) && sim.st[sim.idx(x, y)] === s;
  }

  function stepVehicle(v, kind) {
    // nächstes verbundenes Feld wählen (nicht rückwärts, außer Sackgasse)
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

  function updateVehicles(dt) {
    if (!sim || speed === 0) return;
    const spdF = [0, 1, 1.6, 2.4][speed];
    // Autos nachspawnen
    const now = performance.now();
    if (now - lastCarSpawn > 600) {
      lastCarSpawn = now;
      const roads = [];
      for (let i = 0; i < sim.w * sim.h; i++)
        if (sim.st[i] === S_ROAD && sim.traffic[i] > 5) roads.push(i);
      const target = Math.min(40, Math.round(roads.length / 5));
      if (cars.length < target && roads.length > 0) {
        const i = roads[(Math.random() * roads.length) | 0];
        const car = {
          tx: i % sim.w, ty: (i / sim.w) | 0, fx: i % sim.w, fy: (i / sim.w) | 0,
          dir: (Math.random() * 4) | 0, prog: 1,
          color: CAR_COLORS[(Math.random() * CAR_COLORS.length) | 0],
        };
        cars.push(car);
      }
      // Zug nachspawnen
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
    // Bewegung
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
  }

  function drawVehicles(ox, oy, ts, z, isNight) {
    // Autos
    for (const v of cars) {
      const wx = (v.fx + (v.tx - v.fx) * v.prog) * ts, wy = (v.fy + (v.ty - v.fy) * v.prog) * ts;
      const horiz = v.dir === 1 || v.dir === 3;
      // Rechtsverkehr: seitlicher Versatz
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
    }
    // Züge
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

  // ---------- Tag/Nacht ----------
  function nightAlpha() {
    if (!nightEnabled || !sim) return 0;
    const t = (Date.now() / 1000) % 180 / 180; // 3-Minuten-Zyklus
    if (t < 0.55) return 0;
    if (t < 0.65) return (t - 0.55) / 0.10;
    if (t < 0.90) return 1;
    if (t < 1.00) return 1 - (t - 0.90) / 0.10;
    return 0;
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

    ctx.imageSmoothingEnabled = false;
    const z = cam.zoom, ts = TILE * z;
    const ox = -Math.round(cam.x * z), oy = -Math.round(cam.y * z);
    const W = sim.w, H = sim.h;
    const nAlpha = nightAlpha();
    const isNight = nAlpha > 0.5;
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

    // --- Terrain ---
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = sim.idx(x, y);
        const sx = ox + x * ts, sy = oy + y * ts;
        const t = sim.terr[i];
        let spr;
        if (t === T_WATER) spr = S('water', waterF);
        else if (t === T_SAND) spr = S('sand', (x + y) % 2);
        else spr = S('grass', (x * 7 + y * 13) % 4);
        ctx.drawImage(spr, sx, sy, ts, ts);
        if (t === T_TREE) ctx.drawImage(S('tree'), sx, sy, ts, ts);
      }
    }

    // --- Strukturen ---
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = sim.idx(x, y);
        const s = sim.st[i];
        if (s === S_NONE) {
          if (sim.floodT[i] > 0) { ctx.globalAlpha = 0.75; ctx.drawImage(S('water', waterF), ox + x * ts, oy + y * ts, ts, ts); ctx.globalAlpha = 1; }
          continue;
        }
        const sx = ox + x * ts, sy = oy + y * ts;
        if (s === S_ROAD || s === S_RAIL) {
          let m = 0;
          if (y > 0 && sim.st[i - W] === s) m |= 1;
          if (x < W - 1 && sim.st[i + 1] === s) m |= 2;
          if (y < H - 1 && sim.st[i + W] === s) m |= 4;
          if (x > 0 && sim.st[i - 1] === s) m |= 8;
          const bridge = sim.terr[i] === T_WATER;
          const name = bridge ? (s === S_ROAD ? 'bridgeRoad' : 'bridgeRail') : (s === S_ROAD ? 'road' : 'rail');
          ctx.drawImage(S(name, m), sx, sy, ts, ts);
        } else if (s === S_WIRE) {
          const cond = (j) => { const q = sim.st[j]; return q === S_ROAD || q === S_RAIL || q === S_WIRE || sim.isBld(q); };
          let m = 0;
          if (y > 0 && cond(i - W)) m |= 1;
          if (x < W - 1 && cond(i + 1)) m |= 2;
          if (y < H - 1 && cond(i + W)) m |= 4;
          if (x > 0 && cond(i - 1)) m |= 8;
          ctx.drawImage(S('wire', m), sx, sy, ts, ts);
        } else if (s === S_RUBBLE) {
          ctx.drawImage(S('rubble'), sx, sy, ts, ts);
        } else if (s === S_COAL || s === S_STADIUM) {
          if (sim.anchor[i] === i) {
            ctx.drawImage(S(s === S_COAL ? 'coal' : 'stadium'), sx, sy, ts * 2, ts * 2);
            if (s === S_COAL) {
              const sm = S('smoke', smokeF);
              ctx.drawImage(sm, sx + 2 * z, sy - 4 * z + (smokeF ? -2 * z : 0), 8 * z, 8 * z);
              ctx.drawImage(sm, sx + 12 * z, sy - 3 * z - (smokeF ? 2 * z : 0), 8 * z, 8 * z);
            }
          }
        } else if (s === S_WIND) {
          ctx.drawImage(S('wind', windF), sx, sy, ts, ts);
        } else if (s >= S_RZONE && s <= S_IZONE) {
          const lv = sim.lvl[i];
          if (lv === 0) {
            const zs = s === S_RZONE ? S('zoneR') : s === S_CZONE ? S('zoneC') : S('zoneI');
            ctx.drawImage(zs, sx, sy, ts, ts);
          } else {
            // Luxus-Varianten bei hohem Landwert
            let spr;
            if (lv === 4 && s === S_RZONE && sim.landv[i] > 62) spr = S('rLux');
            else if (lv === 4 && s === S_CZONE && sim.landv[i] > 62) spr = S('cLux');
            else {
              const key = s === S_RZONE ? 'r' : s === S_CZONE ? 'c' : 'i';
              spr = (isNight ? Sprites.night[key] : Sprites.store[key])[lv];
            }
            ctx.drawImage(spr, sx, sy, ts, ts);
            if (s === S_IZONE && lv >= 2) {
              ctx.drawImage(S('smoke', smokeF), sx + 1 * z, sy - 3 * z, 6 * z, 6 * z);
            }
          }
        } else {
          const map = {
            [S_PARK]: 'park', [S_POLICE]: 'police', [S_FIREDEP]: 'firedep',
            [S_SCHOOL]: 'school', [S_HOSPITAL]: 'hospital',
            [S_WTOWER]: 'wtower', [S_PUMP]: 'pump', [S_TOWNHALL]: 'townhall',
            [S_MONUMENT]: 'monument', [S_CASINO]: 'casino',
          };
          if (map[s]) ctx.drawImage(S(map[s]), sx, sy, ts, ts);
        }
        // Kein Strom → blinkender Blitz
        if (blink && !sim.powered[i] && sim.anchor[i] === i &&
          ((s >= S_RZONE && s <= S_IZONE && sim.lvl[i] > 0) ||
            (DEFS[s] && DEFS[s].drain))) {
          ctx.drawImage(BOLT, sx + ts - 7 * z, sy + z, 6 * z, 6 * z);
        }
        // Kein Wasser (bremst ab Stufe 2) → blinkender Tropfen
        if (!blink && s >= S_RZONE && s <= S_IZONE && sim.lvl[i] >= 2 &&
          sim.covWater[i] < 20 && sim.powered[i]) {
          ctx.drawImage(DROP, sx + ts - 6 * z, sy + z, 5 * z, 5 * z);
        }
        // Feuer / Flut
        if (sim.burn[i] > 0) ctx.drawImage(S('fire', fireF), sx, sy, ts, ts);
        if (sim.floodT[i] > 0) {
          ctx.globalAlpha = 0.75;
          ctx.drawImage(S('water', waterF), sx, sy, ts, ts);
          ctx.globalAlpha = 1;
        }
      }
    }

    // --- Fahrzeuge ---
    drawVehicles(ox, oy, ts, z, isNight);

    // --- Katastrophen-Akteure ---
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

    // --- Overlay ---
    if (overlay) {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = sim.idx(x, y);
          const sx = ox + x * ts, sy = oy + y * ts;
          let col = null;
          if (overlay === 'power') {
            const s = sim.st[i];
            if (s === S_WIRE || s === S_ROAD || s === S_RAIL || sim.isBld(s))
              col = sim.powered[i] ? 'rgba(60,255,120,0.40)' : 'rgba(255,60,60,0.50)';
          } else if (overlay === 'poll') {
            const p = sim.poll[i];
            if (p > 4) col = 'rgba(255,' + (Math.max(0, 160 - p * 2.2) | 0) + ',40,' + Math.min(0.6, p / 130 + 0.12) + ')';
          } else if (overlay === 'traffic') {
            if (sim.st[i] === S_ROAD) {
              const t = sim.traffic[i];
              col = t < 35 ? 'rgba(80,230,110,0.5)' : t < 70 ? 'rgba(240,217,92,0.55)' : 'rgba(255,70,60,0.6)';
            }
          } else if (overlay === 'landv') {
            const v = sim.landv[i];
            if (sim.terr[i] !== T_WATER)
              col = v > 55 ? 'rgba(240,217,92,' + ((v - 55) / 45 * 0.55 + 0.08) + ')'
                : 'rgba(90,110,220,' + ((55 - v) / 55 * 0.4 + 0.05) + ')';
          } else if (overlay === 'water') {
            if (sim.covWater[i] > 0 && sim.terr[i] !== T_WATER)
              col = 'rgba(60,170,255,' + (sim.covWater[i] / 100 * 0.5) + ')';
          } else {
            const m = { police: sim.covPolice, fire: sim.covFire, school: sim.covSchool, health: sim.covHealth, park: sim.covPark }[overlay];
            if (m && m[i] > 0) col = 'rgba(60,180,255,' + (m[i] / 100 * 0.5) + ')';
          }
          if (col) { ctx.fillStyle = col; ctx.fillRect(sx, sy, ts, ts); }
        }
      }
    }

    // --- Bau-Vorschau ---
    const t = toolById[tool];
    if (t.mode !== 'point' && hover.x >= 0 && !panning) {
      const tiles = previewTiles();
      if (tiles) {
        let total = 0;
        for (const [x, y] of tiles) {
          if (!sim.inMap(x, y)) continue;
          const sx = ox + x * ts, sy = oy + y * ts;
          let ok, cost = 0;
          if (t.id === 'dozer') {
            const i = sim.idx(x, y);
            ok = sim.st[i] !== S_NONE || sim.terr[i] === T_TREE;
            cost = 1;
          } else {
            const r = sim.canPlace(t.s, x, y);
            ok = r.ok; cost = r.ok ? r.cost : sim.costAt(t.s, x, y);
          }
          if (ok) total += cost;
          const size = (t.s && DEFS[t.s].size === 2) ? 2 : 1;
          if (ok && t.s && t.mode === 'single') {
            ctx.globalAlpha = 0.65;
            ctx.drawImage(toolSprite(t, windF), sx, sy, ts * size, ts * size);
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

    // --- Auswahl-Rahmen ---
    if (selected && tool === 'point') {
      ctx.strokeStyle = blink ? '#fff' : '#f0d95c';
      ctx.lineWidth = 2;
      ctx.strokeRect(ox + selected.x * ts + 1, oy + selected.y * ts + 1, ts - 2, ts - 2);
    }

    // --- Nacht-Tönung (weicher Übergang) ---
    if (nAlpha > 0 && !isNight) {
      ctx.fillStyle = 'rgba(10,12,50,' + (nAlpha * 0.45) + ')';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (isNight && nAlpha < 1) {
      ctx.fillStyle = 'rgba(10,12,50,' + ((1 - nAlpha) * 0.2) + ')';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    updateHUD();
  }

  // ---------- Minimap ----------
  const MINI_TERR = ['#3a7a38', '#2f6fc4', '#d8b56a', '#2c6e31'];
  function renderMini() {
    if (!sim) return;
    const W = sim.w, H = sim.h;
    const img = mctx.createImageData(W, H);
    const put = (i, hex) => {
      const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
    };
    for (let i = 0; i < W * H; i++) {
      let col = MINI_TERR[sim.terr[i]];
      const s = sim.st[i];
      if (s === S_ROAD) col = '#8a8a95';
      else if (s === S_RAIL) col = '#6b6a5a';
      else if (s === S_WIRE) col = '#6b5636';
      else if (s === S_RZONE) col = sim.lvl[i] ? '#6fe06f' : '#3f9f4f';
      else if (s === S_CZONE) col = sim.lvl[i] ? '#6fb8ff' : '#3f6fbf';
      else if (s === S_IZONE) col = sim.lvl[i] ? '#f0d95c' : '#af9f3c';
      else if (s === S_COAL || s === S_WIND) col = '#ff9e2c';
      else if (s === S_RUBBLE) col = '#6b6257';
      else if (s !== S_NONE) col = '#f2f2ef';
      if (sim.burn[i] > 0 || sim.floodT[i] > 0) col = sim.burn[i] ? '#ff3030' : '#40a0ff';
      put(i, col);
    }
    const tmp = document.createElement('canvas');
    tmp.width = W; tmp.height = H;
    tmp.getContext('2d').putImageData(img, 0, 0);
    mctx.imageSmoothingEnabled = false;
    mctx.clearRect(0, 0, 128, 128);
    mctx.drawImage(tmp, 0, 0, 128, 128);
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

  // ---------- Statistik-Panel ----------
  function drawStats() {
    const c = $('statsCanvas'), x = c.getContext('2d');
    x.fillStyle = '#14141f'; x.fillRect(0, 0, c.width, c.height);
    const hist = sim.history;
    const pad = 30, w = c.width - pad - 8, h = (c.height - 40) / 3;
    const series = [
      { key: 'p', label: 'Einwohner', color: '#6fe06f' },
      { key: 'm', label: 'Kasse €', color: '#f0d95c' },
      { key: 'h', label: 'Zufriedenheit %', color: '#e39ac2', max: 100 },
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
      // Nulllinie bei Geld
      if (min < 0) {
        const py = top + h - (0 - min) / (max - min) * (h - 4) - 2;
        x.strokeStyle = 'rgba(255,107,107,0.5)';
        x.beginPath(); x.moveTo(pad, py); x.lineTo(pad + w, py); x.stroke();
      }
    });
    // Szenario-Status
    const sc = sim.scenario;
    const el = $('scenarioStatus');
    if (sc) {
      const state = sc.done ? (sc.won ? '🏆 GESCHAFFT!' : '❌ Frist verpasst') : '⏳ läuft bis Ende ' + sc.deadlineYear;
      el.textContent = sc.name + ' — Ziel: ' + (sc.minPop || 0) + ' EW' +
        (sc.minHappy ? ', ' + sc.minHappy + '% Zufriedenheit' : '') +
        (sc.noCoal ? ', ohne Kohle' : '') + ' · ' + state;
    } else {
      el.textContent = sim.sandbox ? 'Sandbox-Modus — unbegrenztes Geld.' : 'Freies Spiel ohne Zeitlimit.';
    }
  }

  // ---------- Speichern / Laden / Slots ----------
  function slotKey(n) { return SLOT_KEYS[n] || SLOT_KEYS[0]; }
  function autosave() {
    if (!sim) return;
    try {
      localStorage.setItem(slotKey(currentSlot), sim.serialize());
      localStorage.setItem(slotKey(currentSlot) + '.meta', JSON.stringify({
        pop: sim.pop, date: sim.dateStr(), size: sim.w,
        scen: sim.scenario ? sim.scenario.name : (sim.sandbox ? 'Sandbox' : 'Freies Spiel'),
        ts: Date.now(),
      }));
      localStorage.setItem(LAST_SLOT_KEY, String(currentSlot));
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
    // ältesten überschreiben
    let oldest = 0, oldestTs = Infinity;
    for (let n = 0; n < 3; n++) {
      const m = slotMeta(n);
      if (m && (m.ts || 0) < oldestTs) { oldestTs = m.ts || 0; oldest = n; }
    }
    return oldest;
  }

  $('btnSave').addEventListener('click', () => {
    autosave();
    toast('💾 Gespeichert in Slot ' + (currentSlot + 1) + '!');
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
        ? '<b>Slot ' + (n + 1) + '</b> — ' + m.scen + '<br>👤 ' + m.pop + ' · ' + m.date + ' · ' + m.size + '×' + m.size
        : '<b>Slot ' + (n + 1) + '</b> — leer';
      row.innerHTML = '<div class="slotInfo">' + info + '</div>';
      const btns = document.createElement('div');
      btns.className = 'slotBtns';
      if (m) {
        const load = document.createElement('button');
        load.className = 'btn'; load.textContent = '▶ Laden';
        load.addEventListener('click', () => { loadSlot(n); });
        const exp = document.createElement('button');
        exp.className = 'btn'; exp.textContent = '⬇';
        exp.title = 'Als Datei exportieren';
        exp.addEventListener('click', () => exportSlot(n));
        const del = document.createElement('button');
        del.className = 'btn'; del.textContent = '🗑';
        del.title = 'Löschen';
        del.addEventListener('click', () => {
          if (!confirm('Slot ' + (n + 1) + ' wirklich löschen?')) return;
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
    toast('⬇ Slot ' + (n + 1) + ' exportiert.');
  }

  $('btnImport').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const d = JSON.parse(reader.result);
        if (!d.w || !d.h || !d.st) throw new Error('Kein Retropolis-Spielstand');
        const test = Sim.load(reader.result); // validieren
        const n = pickFreeSlot();
        localStorage.setItem(slotKey(n), reader.result);
        localStorage.setItem(slotKey(n) + '.meta', JSON.stringify({
          pop: test.pop, date: test.dateStr(), size: test.w,
          scen: test.scenario ? test.scenario.name : (test.sandbox ? 'Sandbox' : 'Import'),
          ts: Date.now(),
        }));
        renderSlots();
        toast('📂 Import in Slot ' + (n + 1) + ' gelungen!');
        Sound.sfx.cash();
      } catch (err) {
        toast('❌ Import fehlgeschlagen: ' + err.message, 'bad');
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
      toast('⚠ Spielstand in Slot ' + (n + 1) + ' ist defekt.', 'bad');
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
    if (!r.ok) { toast('❌ ' + r.reason, 'bad'); Sound.sfx.error(); }
    else Sound.sfx.cash();
    drainEvents();
    updateBudgetPanel();
  });

  $('taxSlider').addEventListener('input', (e) => {
    if (!sim) return;
    sim.taxRate = +e.target.value;
    $('taxVal').textContent = sim.taxRate + '%';
  });
  $('chkDisaster').addEventListener('change', (e) => { if (sim) sim.disasters = e.target.checked; });
  $('chkNight').addEventListener('change', (e) => { nightEnabled = e.target.checked; });
  $('chkCrt').addEventListener('change', (e) => {
    $('scanlines').classList.toggle('off', !e.target.checked);
  });

  function updateBudgetPanel() {
    if (!sim) return;
    const b = sim.lastBudget;
    const rows = $('budgetRows');
    if (b) {
      rows.innerHTML =
        '<div><span>Steuereinnahmen (letzter Monat)</span><span class="plus">+' + b.income + ' €</span></div>' +
        (b.casino ? '<div><span>Casino-Einnahmen</span><span class="plus">+' + b.casino + ' €</span></div>' : '') +
        '<div><span>Unterhalt (Straßen, Gebäude, Strom)</span><span class="minus">−' + b.upkeep + ' €</span></div>' +
        (b.interest ? '<div><span>Kreditzinsen</span><span class="minus">−' + b.interest + ' €</span></div>' : '') +
        '<div><span><b>Bilanz</b></span><span class="' + (b.net >= 0 ? 'plus' : 'minus') + '"><b>' + (b.net >= 0 ? '+' : '') + b.net + ' €</b></span></div>';
    } else {
      rows.innerHTML = '<div><span>Noch keine Monatsabrechnung.</span><span></span></div>';
    }
    $('debtVal').textContent = fmtMoney(sim.debt).replace('€ ', '') + ' €';
    $('btnRepay').disabled = sim.debt <= 0;
    $('taxSlider').value = sim.taxRate;
    $('taxVal').textContent = sim.taxRate + '%';
    $('chkDisaster').checked = sim.disasters;
    $('chkNight').checked = nightEnabled;
  }

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
      d.innerHTML = '<b>' + sc.name + '</b><small>' + sc.desc + '</small>';
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
    const tmp = new Sim(size, size, seed);
    const c = $('mapPreview'), x = c.getContext('2d');
    const img = x.createImageData(size, size);
    const cols = [[62, 122, 56], [47, 111, 196], [216, 181, 106], [44, 110, 49]];
    for (let i = 0; i < size * size; i++) {
      const col = cols[tmp.terr[i]];
      img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = 255;
    }
    const t2 = document.createElement('canvas');
    t2.width = size; t2.height = size;
    t2.getContext('2d').putImageData(img, 0, 0);
    x.imageSmoothingEnabled = false;
    x.clearRect(0, 0, 192, 192);
    x.drawImage(t2, 0, 0, 192, 192);
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
    currentSlot = pickFreeSlot();
    $('newGamePanel').classList.add('hidden');
    startGame(fresh, false);
    toast('💾 Autospeichern in Slot ' + (currentSlot + 1) + '.');
  });

  function buildScenario(sc, size, seed) {
    const s = new Sim(size, size, seed);
    if (sc.goal) {
      s.scenario = {
        id: sc.id, name: sc.name,
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
      // vorgebaute, marode Stadt
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
      // Stadt „entwickeln“, dann Kasse ruinieren
      for (let t = 0; t < 400; t++) { s.tick(); s.events.length = 0; }
      s.money = 800;
      s.debt = 20000;
      s.taxRate = 14;
      s.history = [];
      s.milestones = {};
    }
    return s;
  }

  // ---------- Titelbildschirm ----------
  function showTitle() {
    $('titleScreen').classList.remove('hidden');
    const last = parseInt(localStorage.getItem(LAST_SLOT_KEY) || '0', 10);
    $('btnContinue').classList.toggle('hidden', !slotMeta(last));
  }

  function startGame(simInstance, fromSave) {
    sim = simInstance;
    undoStack.length = 0; redoStack.length = 0;
    cars = []; trains = [];
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
        setTimeout(() => toast('🎯 ' + sim.scenario.name + ' — Ziel: ' + sim.scenario.minPop + ' Einwohner bis Ende ' + sim.scenario.deadlineYear + '!', 'milestone'), 400);
      } else {
        setTimeout(() => toast('👷 Willkommen, Bürgermeister:in! Baue zuerst Straßen (3) und ein Windrad (8).'), 400);
      }
      setTimeout(() => toast('💡 Zonen ziehen: Wohnen (5), Gewerbe (6), Industrie (7) — nahe der Straße!'), 4800);
      setTimeout(() => toast('🚰 Ab Stufe 2 brauchen Zonen Wasser: Wasserturm oder Pumpwerk bauen.'), 9600);
    } else {
      toast('▶ Weiter geht’s, Bürgermeister:in!');
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
    buildToolbar();
    migrateLegacy();
    resize();
    showTitle();
    updateUndoButtons();
    requestAnimationFrame(render);
  }

  // Debug-/Test-Zugang
  window.RETRO = {
    get sim() { return sim; },
    loadSlot, startGame, buildScenario, SCENARIOS,
  };

  boot();
})();
