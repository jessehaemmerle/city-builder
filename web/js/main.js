/* ============================================================
 * RETROPOLIS — Hauptspiel: Rendering, Eingabe, UI, Spielschleife
 * ============================================================ */
'use strict';

(() => {

  const SAVE_KEY = 'retropolis.save';
  const MAP_W = 64, MAP_H = 64;

  // ---------- Zustand ----------
  let sim = null;
  let cam = { x: 0, y: 0, zoom: 2 };
  let speed = 1;                       // 0=Pause, 1..3
  let prevSpeed = 1;
  let tool = 'point';
  let overlay = '';
  let hover = { x: -1, y: -1 };
  let drag = null;                     // {mode,x0,y0,x1,y1} für Bau-Drag
  let panning = null;
  let selected = null;                 // Info-Kachel
  let tickTimer = null;
  let running = false;
  let tutorialShown = false;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const mini = document.getElementById('minimap');
  const mctx = mini.getContext('2d');

  const $ = (id) => document.getElementById(id);

  // ---------- Werkzeuge ----------
  const TOOLS = [
    { id: 'point',    name: 'Info',      key: '1', mode: 'point' },
    { id: 'dozer',    name: 'Abriss',    key: '2', mode: 'paint', cost: 1 },
    { id: 'road',     name: 'Straße',    key: '3', mode: 'line', s: S_ROAD },
    { id: 'wire',     name: 'Leitung',   key: '4', mode: 'line', s: S_WIRE },
    { id: 'rz',       name: 'Wohnen',    key: '5', mode: 'rect', s: S_RZONE },
    { id: 'cz',       name: 'Gewerbe',   key: '6', mode: 'rect', s: S_CZONE },
    { id: 'iz',       name: 'Industrie', key: '7', mode: 'rect', s: S_IZONE },
    { id: 'wind',     name: 'Windrad',   key: '8', mode: 'single', s: S_WIND },
    { id: 'coal',     name: 'Kohle-KW',  key: '9', mode: 'single', s: S_COAL },
    { id: 'park',     name: 'Park',      key: '0', mode: 'single', s: S_PARK },
    { id: 'police',   name: 'Polizei',   mode: 'single', s: S_POLICE },
    { id: 'firedep',  name: 'Feuerwehr', mode: 'single', s: S_FIREDEP },
    { id: 'school',   name: 'Schule',    mode: 'single', s: S_SCHOOL },
    { id: 'hospital', name: 'Klinik',    mode: 'single', s: S_HOSPITAL },
    { id: 'stadium',  name: 'Stadion',   mode: 'single', s: S_STADIUM },
  ];
  const toolById = {};
  TOOLS.forEach(t => toolById[t.id] = t);

  // Sprite-Zuordnung für Werkzeug-Icons / Ghost-Vorschau
  function toolSprite(t, frame) {
    switch (t.id) {
      case 'road': return Sprites.get('road', 10);
      case 'wire': return Sprites.get('wire', 10);
      case 'rz': return Sprites.store.zoneR;
      case 'cz': return Sprites.store.zoneC;
      case 'iz': return Sprites.store.zoneI;
      case 'wind': return Sprites.get('wind', frame || 0);
      case 'coal': return Sprites.store.coal;
      case 'park': return Sprites.store.park;
      case 'police': return Sprites.store.police;
      case 'firedep': return Sprites.store.firedep;
      case 'school': return Sprites.store.school;
      case 'hospital': return Sprites.store.hospital;
      case 'stadium': return Sprites.store.stadium;
    }
    return null;
  }

  // Blitz-Symbol für „kein Strom“
  let BOLT = null;
  function makeIcons() {
    BOLT = Sprites.art([
      '..Kyy.',
      '.Kyyy.',
      'Kyyyy.',
      '.KKyy.',
      '..Ky..',
      '..K...',
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

  // ---------- Toolbar aufbauen ----------
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

  // ---------- Kamera / Koordinaten ----------
  function screenToTile(px, py) {
    return {
      x: Math.floor((px / cam.zoom + cam.x) / TILE),
      y: Math.floor((py / cam.zoom + cam.y) / TILE),
    };
  }
  function clampCam() {
    const vw = canvas.width / cam.zoom, vh = canvas.height / cam.zoom;
    cam.x = Math.max(-TILE * 4, Math.min(MAP_W * TILE - vw + TILE * 4, cam.x));
    cam.y = Math.max(-TILE * 4, Math.min(MAP_H * TILE - vh + TILE * 4, cam.y));
  }
  function centerCam() {
    cam.x = MAP_W * TILE / 2 - canvas.width / cam.zoom / 2;
    cam.y = MAP_H * TILE / 2 - canvas.height / cam.zoom / 2;
    clampCam();
  }

  // ---------- Bau-Hilfen ----------
  // L-förmiger Pfad für Straßen/Leitungen
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

  function commitBuild() {
    const t = toolById[tool];
    const tiles = previewTiles() || [];
    let built = 0, spent = 0, lastReason = '';
    for (const [x, y] of tiles) {
      if (t.id === 'dozer') {
        const r = sim.bulldoze(x, y);
        if (r.ok) { built++; spent += r.cost; }
        else lastReason = r.reason;
      } else if (t.s) {
        const r = sim.place(t.s, x, y);
        if (r.ok) { built++; spent += r.cost; }
        else if (r.reason !== 'schon vorhanden') lastReason = r.reason;
      }
    }
    if (built > 0) {
      if (t.id === 'dozer') Sound.sfx.dozer();
      else if (t.id === 'road') Sound.sfx.road();
      else if (t.id === 'wire') Sound.sfx.wire();
      else if (t.mode === 'rect') Sound.sfx.zone();
      else Sound.sfx.place();
      maybeTutorial(t);
    } else if (lastReason) {
      toast('❌ ' + lastReason, 'bad');
      Sound.sfx.error();
    }
  }

  // Kleine Einsteiger-Hilfe
  const tutSeen = {};
  function maybeTutorial(t) {
    if (!tutorialShown) return;
    if ((t.id === 'wind' || t.id === 'coal') && !tutSeen.power) {
      tutSeen.power = true;
      toast('💡 Ziehe Stromleitungen vom Kraftwerk zu deinen Zonen!');
    } else if (t.mode === 'rect' && !tutSeen.zone) {
      tutSeen.zone = true;
      toast('💡 Zonen brauchen Strom + eine Straße im Umkreis von 3 Feldern.');
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
    if (t.mode === 'point') {
      selectTile(p.x, p.y);
      return;
    }
    drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    if (t.mode === 'paint' || t.mode === 'single') {
      // sofort bauen (und bei paint beim Ziehen weiter)
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
    // Zoom auf Mausposition
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
      const z = Math.max(1, Math.min(4, Math.round(touch.zoom * d / touch.dist)));
      cam.zoom = z;
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
      if (s >= S_RZONE && s <= S_IZONE) {
        const lv = sim.lvl[i];
        name += ' (Stufe ' + lv + '/4)';
        const val = s === S_RZONE ? R_POP[lv] + ' Einwohner'
          : s === S_CZONE ? C_JOBS[lv] + ' Jobs' : I_JOBS[lv] + ' Jobs';
        extra += '<div>' + val + '</div>';
      }
    }
    const isBuild = s >= S_RZONE && s <= S_STADIUM;
    const chk = (b) => b ? '<span class="ok">✓</span>' : '<span class="no">✗</span>';
    let html = '<h3>' + name + '</h3>' +
      '<div>Position: ' + x + ', ' + y + '</div>' + extra;
    if (isBuild && s !== S_WIRE) {
      html += '<div>Strom: ' + chk(sim.powered[i]) + ' &nbsp; Straße: ' + chk(sim.roadOk[i]) + '</div>';
    }
    if (sim.burn[i] > 0) html += '<div class="no">🔥 BRENNT!</div>';
    html += '<div>Umwelt: ' + (sim.poll[i] < 15 ? '<span class="ok">sauber</span>' : sim.poll[i] < 45 ? '⚠ belastet' : '<span class="no">verschmutzt</span>') + '</div>';
    html += '<div style="font-size:11px;color:#9aa3d6">🚓 ' + sim.covPolice[i] + '% · 🚒 ' + sim.covFire[i] + '% · 🎓 ' + sim.covSchool[i] + '% · 🏥 ' + sim.covHealth[i] + '% · 🌳 ' + sim.covPark[i] + '%</div>';
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
      toast(ev.msg, ev.type === 'milestone' ? 'milestone' : ev.type === 'bad' ? 'bad' : '');
      if (ev.type === 'milestone') Sound.sfx.milestone();
      else if (ev.type === 'bad' && ev.msg.includes('Feuer')) Sound.sfx.fire();
      else if (ev.type === 'bad') Sound.sfx.error();
      if (ev.x !== undefined) {
        // Kamera-Hinweis: nicht springen, nur wenn weit außerhalb
      }
    }
  }

  // ---------- HUD ----------
  function fmtMoney(v) {
    return '€ ' + Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  function updateHUD() {
    if (!sim) return;
    const m = $('uiMoney');
    m.textContent = fmtMoney(sim.money);
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
    // Stadion-Sperre visualisieren
    const st = $('tool_stadium');
    if (st) st.classList.toggle('locked', sim.pop < DEFS[S_STADIUM].minPop);
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
    if (!sim) return;
    ctx.imageSmoothingEnabled = false;
    const z = cam.zoom, ts = TILE * z;
    const ox = -Math.round(cam.x * z), oy = -Math.round(cam.y * z);
    ctx.fillStyle = '#10101c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const x0 = Math.max(0, Math.floor(-ox / ts));
    const y0 = Math.max(0, Math.floor(-oy / ts));
    const x1 = Math.min(MAP_W - 1, Math.ceil((canvas.width - ox) / ts));
    const y1 = Math.min(MAP_H - 1, Math.ceil((canvas.height - oy) / ts));

    const waterF = Math.floor(now / 300) % 4;
    const windF = Math.floor(now / 220) % 2;
    const fireF = Math.floor(now / 140) % 3;
    const smokeF = Math.floor(now / 350) % 2;
    const blink = Math.floor(now / 450) % 2 === 0;

    // --- Terrain ---
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = sim.idx(x, y);
        const sx = ox + x * ts, sy = oy + y * ts;
        const t = sim.terr[i];
        let spr;
        if (t === T_WATER) spr = Sprites.get('water', waterF);
        else if (t === T_SAND) spr = Sprites.get('sand', (x + y) % 2);
        else spr = Sprites.get('grass', (x * 7 + y * 13) % 4);
        ctx.drawImage(spr, sx, sy, ts, ts);
        if (t === T_TREE) ctx.drawImage(Sprites.store.tree, sx, sy, ts, ts);
      }
    }

    // --- Strukturen ---
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = sim.idx(x, y);
        const s = sim.st[i];
        if (s === S_NONE) continue;
        const sx = ox + x * ts, sy = oy + y * ts;
        if (s === S_ROAD) {
          let m = 0;
          if (y > 0 && sim.st[i - MAP_W] === S_ROAD) m |= 1;
          if (x < MAP_W - 1 && sim.st[i + 1] === S_ROAD) m |= 2;
          if (y < MAP_H - 1 && sim.st[i + MAP_W] === S_ROAD) m |= 4;
          if (x > 0 && sim.st[i - 1] === S_ROAD) m |= 8;
          ctx.drawImage(Sprites.get('road', m), sx, sy, ts, ts);
        } else if (s === S_WIRE) {
          const cond = (j) => { const q = sim.st[j]; return q === S_ROAD || q === S_WIRE || (q >= S_RZONE && q <= S_STADIUM); };
          let m = 0;
          if (y > 0 && cond(i - MAP_W)) m |= 1;
          if (x < MAP_W - 1 && cond(i + 1)) m |= 2;
          if (y < MAP_H - 1 && cond(i + MAP_W)) m |= 4;
          if (x > 0 && cond(i - 1)) m |= 8;
          ctx.drawImage(Sprites.get('wire', m), sx, sy, ts, ts);
        } else if (s === S_RUBBLE) {
          ctx.drawImage(Sprites.store.rubble, sx, sy, ts, ts);
        } else if (s === S_COAL || s === S_STADIUM) {
          if (sim.anchor[i] === i) {
            const spr = s === S_COAL ? Sprites.store.coal : Sprites.store.stadium;
            ctx.drawImage(spr, sx, sy, ts * 2, ts * 2);
            if (s === S_COAL) {
              // Rauch aus den Schornsteinen
              const sm = Sprites.get('smoke', smokeF);
              ctx.drawImage(sm, sx + 2 * z, sy - 4 * z + (smokeF ? -2 * z : 0), 8 * z, 8 * z);
              ctx.drawImage(sm, sx + 12 * z, sy - 3 * z - (smokeF ? 2 * z : 0), 8 * z, 8 * z);
            }
          }
        } else if (s === S_WIND) {
          ctx.drawImage(Sprites.get('wind', windF), sx, sy, ts, ts);
        } else if (s >= S_RZONE && s <= S_IZONE) {
          const lv = sim.lvl[i];
          if (lv === 0) {
            const zs = s === S_RZONE ? Sprites.store.zoneR : s === S_CZONE ? Sprites.store.zoneC : Sprites.store.zoneI;
            ctx.drawImage(zs, sx, sy, ts, ts);
          } else {
            const key = s === S_RZONE ? 'r' : s === S_CZONE ? 'c' : 'i';
            ctx.drawImage(Sprites.store[key][lv], sx, sy, ts, ts);
            if (s === S_IZONE && lv >= 2) {
              ctx.drawImage(Sprites.get('smoke', smokeF), sx + 1 * z, sy - 3 * z, 6 * z, 6 * z);
            }
          }
        } else {
          const map = {
            [S_PARK]: 'park', [S_POLICE]: 'police', [S_FIREDEP]: 'firedep',
            [S_SCHOOL]: 'school', [S_HOSPITAL]: 'hospital',
          };
          if (map[s]) ctx.drawImage(Sprites.store[map[s]], sx, sy, ts, ts);
        }
        // Kein Strom → blinkender Blitz
        if (blink && !sim.powered[i] && sim.anchor[i] === i &&
          ((s >= S_RZONE && s <= S_IZONE && sim.lvl[i] > 0) ||
            (DEFS[s] && DEFS[s].drain))) {
          ctx.drawImage(BOLT, ox + x * ts + ts - 7 * z, oy + y * ts + z, 6 * z, 6 * z);
        }
        // Feuer
        if (sim.burn[i] > 0) {
          ctx.drawImage(Sprites.get('fire', fireF), sx, sy, ts, ts);
        }
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
            if (s === S_WIRE || (s >= S_RZONE && s <= S_STADIUM))
              col = sim.powered[i] ? 'rgba(60,255,120,0.40)' : 'rgba(255,60,60,0.50)';
          } else if (overlay === 'poll') {
            const p = sim.poll[i];
            if (p > 4) col = 'rgba(255,' + (Math.max(0, 160 - p * 2.2) | 0) + ',40,' + Math.min(0.6, p / 130 + 0.12) + ')';
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
            ok = r.ok; cost = DEFS[t.s].cost;
          }
          if (ok) total += cost;
          const size = (t.s && DEFS[t.s].size === 2) ? 2 : 1;
          // Ghost-Sprite
          if (ok && t.s && t.mode === 'single') {
            ctx.globalAlpha = 0.65;
            const spr = toolSprite(t, windF);
            ctx.drawImage(spr, sx, sy, ts * size, ts * size);
            ctx.globalAlpha = 1;
          }
          ctx.fillStyle = ok ? 'rgba(120,255,140,0.25)' : 'rgba(255,60,60,0.35)';
          ctx.fillRect(sx, sy, ts * size, ts * size);
          ctx.strokeStyle = ok ? '#6fe06f' : '#ff6b6b';
          ctx.lineWidth = Math.max(1, z / 2);
          ctx.strokeRect(sx + 1, sy + 1, ts * size - 2, ts * size - 2);
        }
        // Kosten am Cursor
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

    // --- Auswahl-Rahmen (Info) ---
    if (selected && tool === 'point') {
      ctx.strokeStyle = blink ? '#fff' : '#f0d95c';
      ctx.lineWidth = 2;
      ctx.strokeRect(ox + selected.x * ts + 1, oy + selected.y * ts + 1, ts - 2, ts - 2);
    }

    updateHUD();
  }

  // ---------- Minimap ----------
  const MINI_COL = {
    terr: ['#3a7a38', '#2f6fc4', '#d8b56a', '#2c6e31'],
  };
  function renderMini() {
    if (!sim) return;
    const img = mctx.createImageData(MAP_W, MAP_H);
    const put = (i, hex) => {
      const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
    };
    for (let i = 0; i < MAP_W * MAP_H; i++) {
      let col = MINI_COL.terr[sim.terr[i]];
      const s = sim.st[i];
      if (s === S_ROAD) col = '#8a8a95';
      else if (s === S_WIRE) col = '#6b5636';
      else if (s === S_RZONE) col = sim.lvl[i] ? '#6fe06f' : '#3f9f4f';
      else if (s === S_CZONE) col = sim.lvl[i] ? '#6fb8ff' : '#3f6fbf';
      else if (s === S_IZONE) col = sim.lvl[i] ? '#f0d95c' : '#af9f3c';
      else if (s === S_COAL || s === S_WIND) col = '#ff9e2c';
      else if (s === S_RUBBLE) col = '#6b6257';
      else if (s !== S_NONE) col = '#f2f2ef';
      if (sim.burn[i] > 0) col = '#ff3030';
      put(i, col);
    }
    // in 128er-Canvas skalieren
    const tmp = document.createElement('canvas');
    tmp.width = MAP_W; tmp.height = MAP_H;
    tmp.getContext('2d').putImageData(img, 0, 0);
    mctx.imageSmoothingEnabled = false;
    mctx.clearRect(0, 0, 128, 128);
    mctx.drawImage(tmp, 0, 0, 128, 128);
    // Viewport-Rechteck
    const sc = 128 / (MAP_W * TILE);
    mctx.strokeStyle = '#ffffff';
    mctx.lineWidth = 1;
    mctx.strokeRect(cam.x * sc, cam.y * sc, canvas.width / cam.zoom * sc, canvas.height / cam.zoom * sc);
  }
  setInterval(renderMini, 400);

  mini.addEventListener('mousedown', (e) => {
    const r = mini.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    cam.x = fx * MAP_W * TILE - canvas.width / cam.zoom / 2;
    cam.y = fy * MAP_H * TILE - canvas.height / cam.zoom / 2;
    clampCam();
  });

  // ---------- Speichern / Laden ----------
  function autosave() {
    if (!sim) return;
    try { localStorage.setItem(SAVE_KEY, sim.serialize()); } catch (e) { /* voll/blockiert */ }
  }
  function hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  }

  $('btnSave').addEventListener('click', () => {
    autosave();
    toast('💾 Spiel gespeichert!');
    Sound.sfx.cash();
  });

  window.addEventListener('beforeunload', autosave);

  // ---------- UI-Verkabelung ----------
  [0, 1, 2, 3].forEach(k => $('spd' + k).addEventListener('click', () => { setSpeed(k); Sound.sfx.click(); }));

  $('overlaySel').addEventListener('change', (e) => { overlay = e.target.value; });

  $('btnSfx').addEventListener('click', (e) => {
    const on = Sound.toggleSfx();
    e.target.textContent = on ? '🔊' : '🔇';
  });
  $('btnMusic').addEventListener('click', (e) => {
    Sound.unlock();
    const on = Sound.toggleMusic();
    e.target.style.opacity = on ? 1 : 0.4;
  });

  $('btnBudget').addEventListener('click', () => {
    updateBudgetPanel();
    $('budgetPanel').classList.toggle('hidden');
    Sound.sfx.click();
  });
  $('btnBudgetClose').addEventListener('click', () => $('budgetPanel').classList.add('hidden'));

  $('taxSlider').addEventListener('input', (e) => {
    if (!sim) return;
    sim.taxRate = +e.target.value;
    $('taxVal').textContent = sim.taxRate + '%';
  });
  $('chkDisaster').addEventListener('change', (e) => { if (sim) sim.disasters = e.target.checked; });
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
        '<div><span>Unterhalt (Straßen, Gebäude, Strom)</span><span class="minus">−' + b.upkeep + ' €</span></div>' +
        '<div><span><b>Bilanz</b></span><span class="' + (b.net >= 0 ? 'plus' : 'minus') + '"><b>' + (b.net >= 0 ? '+' : '') + b.net + ' €</b></span></div>';
    } else {
      rows.innerHTML = '<div><span>Noch keine Monatsabrechnung.</span><span></span></div>';
    }
    $('taxSlider').value = sim.taxRate;
    $('taxVal').textContent = sim.taxRate + '%';
    $('chkDisaster').checked = sim.disasters;
  }

  $('btnMenu').addEventListener('click', () => {
    autosave();
    running = false;
    setSpeed(0);
    showTitle();
  });

  // ---------- Titelbildschirm ----------
  function showTitle() {
    $('titleScreen').classList.remove('hidden');
    $('btnContinue').classList.toggle('hidden', !hasSave());
  }

  function startGame(fromSave) {
    if (fromSave && hasSave()) {
      try {
        sim = Sim.load(localStorage.getItem(SAVE_KEY));
      } catch (err) {
        console.error('Spielstand defekt:', err);
        sim = new Sim(MAP_W, MAP_H, (Math.random() * 1e9) | 0);
        toast('⚠ Spielstand defekt — neue Stadt gestartet.', 'bad');
      }
    } else {
      sim = new Sim(MAP_W, MAP_H, (Math.random() * 1e9) | 0);
    }
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
    if (!fromSave) {
      setTimeout(() => toast('👷 Willkommen, Bürgermeister:in! Baue zuerst Straßen (3) und ein Windrad (8).'), 400);
      setTimeout(() => toast('💡 Dann Zonen ziehen: Wohnen (5), Gewerbe (6), Industrie (7) — nahe der Straße!'), 4800);
      setTimeout(() => toast('⚡ Straßen leiten Strom! Für Fernverbindungen gibt es Stromleitungen (4).'), 9600);
    } else {
      toast('▶ Weiter geht’s, Bürgermeister:in!');
    }
  }

  $('btnNew').addEventListener('click', () => {
    Sound.unlock();
    if (hasSave() && !confirm('Neuen Spielstand beginnen? Der alte wird überschrieben.')) return;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    startGame(false);
  });
  $('btnContinue').addEventListener('click', () => {
    Sound.unlock();
    startGame(true);
  });

  // ---------- Boot ----------
  function boot() {
    Sprites.init();
    makeIcons();
    buildToolbar();
    resize();
    showTitle();
    requestAnimationFrame(render);
  }

  boot();
})();
