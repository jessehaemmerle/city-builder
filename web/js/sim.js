/* ============================================================
 * RETROPOLIS — Simulation (DOM-frei, deterministisch pro Seed)
 * Terrain, Strom, Wasser, Pendler-Wegfindung mit Verkehr,
 * RCI-Wachstum, Landwert, Budget & Kredite, Katastrophen,
 * Szenarien. Tuning-Konstanten: balance.js (globales BAL).
 * Meldungen/Fehler sind i18n-Keys — Übersetzung macht die UI.
 * ============================================================ */
'use strict';

// Terrain-Typen
const T_GRASS = 0, T_WATER = 1, T_SAND = 2, T_TREE = 3;

// Strukturen
const S_NONE = 0, S_ROAD = 1, S_WIRE = 2, S_RZONE = 3, S_CZONE = 4, S_IZONE = 5,
  S_PARK = 6, S_POLICE = 7, S_FIREDEP = 8, S_SCHOOL = 9, S_HOSPITAL = 10,
  S_WIND = 11, S_COAL = 12, S_STADIUM = 13, S_RUBBLE = 14,
  S_RAIL = 15, S_WTOWER = 16, S_PUMP = 17, S_TOWNHALL = 18, S_MONUMENT = 19, S_CASINO = 20,
  S_SOLAR = 21, S_BUSSTOP = 22, S_TRAINSTATION = 23, S_SUBWAY = 24, S_PORT = 25, S_PIPE = 26;

// Katalog. name = i18n-Key. Flags: bld, flam, drain, power, waterSupply, needsWaterAdj
const DEFS = {
  [S_ROAD]:     { name: 'b.road',     cost: 10,   upkeep: 0.2,  size: 1 },
  [S_WIRE]:     { name: 'b.wire',     cost: 5,    upkeep: 0.1,  size: 1 },
  [S_RAIL]:     { name: 'b.rail',     cost: 25,   upkeep: 0.4,  size: 1 },
  [S_RZONE]:    { name: 'b.rzone',    cost: 40,   upkeep: 0,    size: 1, bld: 1, flam: 1 },
  [S_CZONE]:    { name: 'b.czone',    cost: 40,   upkeep: 0,    size: 1, bld: 1, flam: 1 },
  [S_IZONE]:    { name: 'b.izone',    cost: 60,   upkeep: 0,    size: 1, bld: 1, flam: 1 },
  [S_PARK]:     { name: 'b.park',     cost: 150,  upkeep: 3,    size: 1, bld: 1, flam: 1 },
  [S_POLICE]:   { name: 'b.police',   cost: 500,  upkeep: 30,   size: 1, bld: 1, flam: 1, drain: 2 },
  [S_FIREDEP]:  { name: 'b.firedep',  cost: 500,  upkeep: 25,   size: 1, bld: 1, flam: 1, drain: 2 },
  [S_SCHOOL]:   { name: 'b.school',   cost: 400,  upkeep: 20,   size: 1, bld: 1, flam: 1, drain: 2 },
  [S_HOSPITAL]: { name: 'b.hospital', cost: 600,  upkeep: 35,   size: 1, bld: 1, flam: 1, drain: 3 },
  [S_WIND]:     { name: 'b.wind',     cost: 600,  upkeep: 5,    size: 1, bld: 1, power: 30 },
  [S_COAL]:     { name: 'b.coal',     cost: 3000, upkeep: 100,  size: 2, bld: 1, power: 180 },
  [S_STADIUM]:  { name: 'b.stadium',  cost: 3000, upkeep: 60,   size: 2, bld: 1, drain: 5, minPop: 1500 },
  [S_RUBBLE]:   { name: 'b.rubble',   cost: 0,    upkeep: 0,    size: 1 },
  [S_WTOWER]:   { name: 'b.wtower',   cost: 400,  upkeep: 10,   size: 1, bld: 1, drain: 1 },
  [S_PUMP]:     { name: 'b.pump',     cost: 700,  upkeep: 18,   size: 1, bld: 1, drain: 2, needsWaterAdj: 1 },
  [S_TOWNHALL]: { name: 'b.townhall', cost: 1500, upkeep: 20,   size: 1, bld: 1, flam: 1, drain: 3, minPop: 500 },
  [S_MONUMENT]: { name: 'b.monument', cost: 1000, upkeep: 5,    size: 1, bld: 1, minPop: 2500 },
  [S_CASINO]:   { name: 'b.casino',   cost: 2000, upkeep: 0,    size: 1, bld: 1, flam: 1, drain: 4, minPop: 4000, income: 150 },
  [S_SOLAR]:    { name: 'b.solar',    cost: 900,  upkeep: 8,    size: 1, bld: 1, power: 45, minYear: 1994 },
  [S_BUSSTOP]:      { name: 'b.busstop',      cost: 150,  upkeep: 0, size: 1, bld: 1 },
  [S_TRAINSTATION]: { name: 'b.trainstation', cost: 800,  upkeep: 0, size: 1, bld: 1, drain: 1 },
  [S_SUBWAY]:       { name: 'b.subway',       cost: 1200, upkeep: 0, size: 1, bld: 1, drain: 2, minPop: 1000 },
  [S_PORT]:         { name: 'b.port',         cost: 2500, upkeep: 40, size: 2, bld: 1, drain: 3, minPop: 500, needsWaterAdj: 1 },
  [S_PIPE]:         { name: 'b.pipe',         cost: 4,    upkeep: 0.05, size: 1 },
};

const LINE_COLORS = ['#e5484f', '#4f8fdc', '#41c46a', '#f0d95c', '#b06ce0', '#e08438', '#33c3c1', '#e39ac2'];

const MONTH_KEYS = ['m.jan', 'm.feb', 'm.mar', 'm.apr', 'm.mai', 'm.jun', 'm.jul', 'm.aug', 'm.sep', 'm.okt', 'm.nov', 'm.dez'];

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Lauflängen-Kodierung für kompakte Spielstände
function rleEncode(arr) {
  const out = [];
  let v = arr[0], c = 1;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] === v && c < 0xffff) c++;
    else { out.push(v, c); v = arr[i]; c = 1; }
  }
  out.push(v, c);
  return out;
}
function rleDecode(data, arr) {
  let k = 0;
  for (let j = 0; j < data.length; j += 2) {
    const v = data[j], c = data[j + 1];
    for (let m = 0; m < c; m++) arr[k++] = v;
  }
  return arr;
}

class Sim {
  constructor(w, h, seed) {
    this.w = w; this.h = h;
    this.seed = seed >>> 0;
    const n = w * h;
    this.terr = new Uint8Array(n);
    this.st = new Uint8Array(n);
    this.lvl = new Uint8Array(n);
    this.anchor = new Int32Array(n).fill(-1);
    this.powered = new Uint8Array(n);
    this.roadOk = new Uint8Array(n);
    this.accessPt = new Int32Array(n).fill(-1); // nächstes Straßen-/Schienenfeld
    this.compId = new Int32Array(n).fill(-1);   // Netz-Komponente je Verkehrsfeld
    this.compPop = []; this.compJobs = [];
    this.poll = new Float32Array(n);
    this.landv = new Uint8Array(n);
    this.traffic = new Uint8Array(n);
    this.jamNear = new Uint8Array(n);           // Stau im Umkreis (vorberechnet)
    this.covPolice = new Uint8Array(n);
    this.covFire = new Uint8Array(n);
    this.covSchool = new Uint8Array(n);
    this.covHealth = new Uint8Array(n);
    this.covPark = new Uint8Array(n);
    this.covWater = new Uint8Array(n);
    this.watered = new Uint8Array(n);  // Wassernetz-Anschluss (analog powered)
    this.waterSupply = 0; this.waterNeed = 0; this.waterShort = false;
    this.burn = new Uint8Array(n);
    this.floodT = new Uint8Array(n);
    this.waterNear = new Uint8Array(n);

    this.workOf = new Int32Array(n).fill(-1);      // Arbeitsweg-Ziel je Wohnhaus
    this.commuteDist = new Int32Array(n).fill(-1); // Pendeldistanz je Wohnhaus

    this.lines = [];          // ÖPNV-Linien {id,type,name,color,stops[]}
    this.nextLineId = 1;

    this.cityName = 'Retropolis';
    this.cheated = false;
    this.money = BAL.START_MONEY;
    this.debt = 0;
    this.taxRate = BAL.DEMAND.TAX_NEUTRAL;
    this.day = 1; this.month = 0; this.year = 1990;
    this.startYear = 1990;
    this.pop = 0; this.jobs = 0;
    this.happiness = 50;
    this.demandR = 0.5; this.demandC = 0.2; this.demandI = 0.4;
    this.powerSupply = 0; this.powerNeed = 0;
    this.disasters = true;
    this.sandbox = false;
    this.milestones = {};
    this.events = [];
    this.actors = [];
    this.history = [];
    this.advCd = {};
    this.scenario = null;
    this.dirtyPower = true;
    this.dirtyCov = true;
    this.dirtyCommute = true;
    this.dirtyAccess = true;
    this.rand = mulberry(this.seed ^ 0x9e3779b9);
    this.lastBudget = null;
    this.changed = [];        // geänderte Kacheln (für Chunk-Invalidierung der UI)
    this.allChanged = true;

    // Performance (Riesenkarten bis 1024²): wiederverwendete Scratch-Arrays,
    // aktive Listen statt Vollscans, gedrosselte Statistik
    this._q = new Int32Array(n);
    this._d = new Int32Array(n);
    this._p = new Int32Array(n);
    this._v = new Int32Array(n);
    this.burnList = [];
    this.floodList = [];
    this.zoneList = null;
    this.statsEvery = n > 65536 ? 5 : 1;
    this.compExt = [];        // Außenanbindung je Netz-Komponente
    this.exportBase = 0;
    this.extRoadTotal = 0; this.extRailTotal = 0; this.portTotal = 0;

    this.genTerrain();
  }

  idx(x, y) { return y * this.w + x; }
  inMap(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  isAnchor(i) { return this.st[i] !== S_NONE && (this.anchor[i] === i || this.anchor[i] === -1); }
  isBld(s) { return !!(DEFS[s] && DEFS[s].bld); }
  isNet(s) { return s === S_ROAD || s === S_RAIL; }
  isPlant(s) { return s === S_WIND || s === S_COAL || s === S_SOLAR; }
  solarPower() { return this.year >= BAL.ERA.SOLAR_UP_YEAR ? BAL.ERA.SOLAR_POWER2 : BAL.ERA.SOLAR_POWER; }

  markChanged(i) {
    if (!this.allChanged) {
      this.changed.push(i);
      if (this.changed.length > 4000) { this.allChanged = true; this.changed.length = 0; }
    }
  }

  // Footprint eines Gebäudes über seinen Anker (kein Karten-Scan nötig)
  footprint(i) {
    const a = this.anchor[i] >= 0 ? this.anchor[i] : i;
    const size = (DEFS[this.st[a]] && DEFS[this.st[a]].size) || 1;
    const out = [];
    const ax = a % this.w, ay = (a / this.w) | 0;
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++)
      if (this.inMap(ax + dx, ay + dy)) out.push(this.idx(ax + dx, ay + dy));
    return out;
  }

  // ---------- Kartengenerierung ----------
  genTerrain() {
    const { w, h } = this;
    const r = mulberry(this.seed);
    const G = 9;
    const grid = [];
    for (let j = 0; j <= G; j++) { grid[j] = []; for (let i = 0; i <= G; i++) grid[j][i] = r(); }
    const lerp = (a, b, t) => a + (b - a) * (t * t * (3 - 2 * t));
    const noise = (fx, fy) => {
      const gx = Math.min(fx * G, G - 1e-6), gy = Math.min(fy * G, G - 1e-6);
      const x0 = gx | 0, y0 = gy | 0, tx = gx - x0, ty = gy - y0;
      return lerp(lerp(grid[y0][x0], grid[y0][x0 + 1], tx), lerp(grid[y0 + 1][x0], grid[y0 + 1][x0 + 1], tx), ty);
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const nx = x / w, ny = y / h;
      let v = noise(nx, ny) * 0.75 + noise(nx * 2.7 % 1, ny * 2.7 % 1) * 0.25;
      const river = Math.abs(ny - (0.28 + 0.16 * Math.sin(nx * 5.1 + this.seed % 7)));
      if (river < 0.035) v = 0.1;
      const i = this.idx(x, y);
      if (v < 0.30) this.terr[i] = T_WATER;
      else if (v < 0.345) this.terr[i] = T_SAND;
      else if (v > 0.72 && r() < 0.75) this.terr[i] = T_TREE;
      else { this.terr[i] = T_GRASS; if (r() < 0.045) this.terr[i] = T_TREE; }
    }
    const cx = w >> 1, cy = h >> 1;
    for (let y = cy - 5; y <= cy + 5; y++) for (let x = cx - 5; x <= cx + 5; x++) {
      const i = this.idx(x, y);
      if (this.terr[i] === T_WATER || this.terr[i] === T_SAND) this.terr[i] = T_GRASS;
    }
    this.computeWaterNear();
  }

  computeWaterNear() {
    const { w, h } = this;
    this.waterNear.fill(0);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      outer:
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > 3) continue;
        const nx = x + dx, ny = y + dy;
        if (this.inMap(nx, ny) && this.terr[this.idx(nx, ny)] === T_WATER) {
          this.waterNear[this.idx(x, y)] = 1; break outer;
        }
      }
    }
  }

  // ---------- Bauen ----------
  costAt(tool, x, y) {
    const def = DEFS[tool];
    if (!def) return 0;
    let c = def.cost;
    if ((tool === S_ROAD || tool === S_RAIL || tool === S_WIRE || tool === S_PIPE) &&
      this.inMap(x, y) && this.terr[this.idx(x, y)] === T_WATER) c *= BAL.MONEY.BRIDGE_FACTOR;
    return c;
  }

  canPlace(tool, x, y) {
    const def = DEFS[tool];
    if (!def) return { ok: false, reason: 'err.unknown' };
    const size = def.size || 1;
    if (def.minPop && this.pop < def.minPop) return { ok: false, reason: 'err.minPop', params: { n: def.minPop } };
    if (def.minYear && this.year < def.minYear) return { ok: false, reason: 'err.minYear', params: { y: def.minYear } };
    if (tool === S_COAL && this.scenario && this.scenario.noCoal)
      return { ok: false, reason: 'err.noCoal' };
    const overWater = tool === S_ROAD || tool === S_RAIL || tool === S_WIRE || tool === S_PIPE;
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) {
      const px = x + dx, py = y + dy;
      if (!this.inMap(px, py)) return { ok: false, reason: 'err.outside' };
      const i = this.idx(px, py);
      if (this.terr[i] === T_WATER && !overWater) return { ok: false, reason: 'err.water' };
      if (this.st[i] !== S_NONE) {
        if (this.st[i] === tool) return { ok: false, reason: 'err.exists' };
        return { ok: false, reason: 'err.occupied' };
      }
    }
    if (def.needsWaterAdj) {
      // mindestens ein Nachbarfeld des gesamten Footprints muss Wasser sein
      let adj = false;
      for (let dy = 0; dy < size && !adj; dy++) for (let dx = 0; dx < size && !adj; dx++) {
        const px = x + dx, py = y + dy;
        for (const [nx, ny] of [[px, py - 1], [px + 1, py], [px, py + 1], [px - 1, py]])
          if (this.inMap(nx, ny) && this.terr[this.idx(nx, ny)] === T_WATER) { adj = true; break; }
      }
      if (!adj) return { ok: false, reason: tool === S_PORT ? 'err.portWater' : 'err.pumpWater' };
    }
    const cost = this.costAt(tool, x, y);
    if (this.money < cost) return { ok: false, reason: 'err.money' };
    return { ok: true, cost };
  }

  place(tool, x, y) {
    const chk = this.canPlace(tool, x, y);
    if (!chk.ok) return chk;
    const def = DEFS[tool];
    const size = def.size || 1;
    const a = this.idx(x, y);
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) {
      const i = this.idx(x + dx, y + dy);
      if (this.terr[i] === T_TREE) this.terr[i] = T_GRASS;
      this.st[i] = tool;
      this.lvl[i] = 0;
      this.anchor[i] = a;
      this.burn[i] = 0;
      this.markChanged(i);
    }
    this.money -= chk.cost;
    this.dirtyPower = true; this.dirtyCov = true; this.dirtyCommute = true; this.dirtyAccess = true; this.zoneList = null;
    return { ok: true, cost: chk.cost };
  }

  bulldoze(x, y) {
    if (!this.inMap(x, y)) return { ok: false, reason: 'err.outside' };
    const i = this.idx(x, y);
    if (this.st[i] === S_NONE) {
      if (this.terr[i] === T_TREE) {
        if (this.money < 1) return { ok: false, reason: 'err.money' };
        this.terr[i] = T_GRASS; this.money -= 1;
        this.markChanged(i);
        return { ok: true, cost: 1 };
      }
      return { ok: false, reason: 'err.nothing' };
    }
    if (this.money < 1) return { ok: false, reason: 'err.money' };
    for (const j of this.footprint(i)) {
      this.st[j] = S_NONE; this.lvl[j] = 0; this.anchor[j] = -1;
      this.burn[j] = 0; this.powered[j] = 0;
      this.markChanged(j);
    }
    this.money -= 1;
    this.dirtyPower = true; this.dirtyCov = true; this.dirtyCommute = true; this.dirtyAccess = true; this.zoneList = null;
    return { ok: true, cost: 1 };
  }

  destroyTile(i) {
    if (this.st[i] === S_NONE) return;
    for (const j of this.footprint(i)) {
      this.st[j] = S_RUBBLE; this.lvl[j] = 0; this.anchor[j] = j; this.burn[j] = 0;
      this.markChanged(j);
    }
    this.dirtyPower = true; this.dirtyCov = true; this.dirtyCommute = true; this.dirtyAccess = true; this.zoneList = null;
  }

  // Brände/Fluten über aktive Listen pflegen (kein Vollscan pro Tick)
  setBurn(i, v) {
    if (v > 0 && this.burn[i] === 0) this.burnList.push(i);
    this.burn[i] = v;
  }
  setFlood(i, v) {
    if (v > 0 && this.floodT[i] === 0) this.floodList.push(i);
    this.floodT[i] = v;
  }

  // ---------- Konjunktur (deterministisch aus Seed + Monat) ----------
  get monthsTotal() { return (this.year - this.startYear) * 12 + this.month; }
  econAt(m) {
    const E = BAL.ECONOMY;
    const r = mulberry(this.seed ^ Math.imul(m + 7, 2654435761))();
    const wave = Math.sin(m / E.CYCLE_MONTHS * Math.PI * 2 + (this.seed % 628) / 100);
    return Math.max(-1, Math.min(1, wave * (1 - E.NOISE) + (r * 2 - 1) * E.NOISE));
  }
  get econ() { return this.econAt(this.monthsTotal); }

  // Hat diese Zone über ihr Netz eine Außenanbindung (Kartenrand/Hafen)?
  extOk(i) {
    const ap = this.accessPt[i];
    if (ap < 0) return false;
    const c = this.compId[ap];
    return c >= 0 && (this.compExt[c] || 0) > 0;
  }

  // ---------- ÖPNV-Linien ----------
  static stopTypeFor(type) {
    return type === 'bus' ? S_BUSSTOP : type === 'train' ? S_TRAINSTATION : S_SUBWAY;
  }

  createLine(type) {
    if (!BAL.TRANSIT[type]) return null;
    const line = {
      id: this.nextLineId++, type, name: null,
      color: LINE_COLORS[(this.nextLineId - 2) % LINE_COLORS.length],
      stops: [],
    };
    this.lines.push(line);
    this.dirtyCommute = true;
    return line;
  }

  addStop(lineId, i) {
    const line = this.lines.find(l => l.id === lineId);
    if (!line) return { ok: false, reason: 'err.unknown' };
    if (this.st[i] !== Sim.stopTypeFor(line.type)) return { ok: false, reason: 'err.wrongStop' };
    if (line.stops.includes(i)) return { ok: false, reason: 'err.dupStop' };
    line.stops.push(i);
    this.dirtyCommute = true;
    return { ok: true };
  }

  removeLastStop(lineId) {
    const line = this.lines.find(l => l.id === lineId);
    if (line && line.stops.length) { line.stops.pop(); this.dirtyCommute = true; }
  }

  deleteLine(lineId) {
    this.lines = this.lines.filter(l => l.id !== lineId);
    this.dirtyCommute = true;
  }

  // Nächstgelegene Netz-Kachel (Straße/Schiene) im Umkreis — als "Tor" eines Stopps
  nearestNet(i, kind) {
    const x = i % this.w, y = (i / this.w) | 0;
    const R = BAL.TRANSIT.GATE_RADIUS;
    let best = -1, bestD = 99;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const d = Math.abs(dx) + Math.abs(dy);
      if (d >= bestD) continue;
      const nx = x + dx, ny = y + dy;
      if (!this.inMap(nx, ny)) continue;
      const j = this.idx(nx, ny);
      const s = this.st[j];
      const okKind = kind === 0 ? this.isNet(s) : s === kind;
      if (okKind) { best = j; bestD = d; }
    }
    return best;
  }

  // Kürzester Pfad zwischen zwei Netz-Kacheln über einen Kacheltyp (Bus: Straße, Zug: Schiene)
  netPath(a, b, kind) {
    if (a < 0 || b < 0) return null;
    if (a === b) return [a];
    const { w, h } = this;
    const prev = this._p; prev.fill(-2);
    const queue = this._q;
    let head = 0, tail = 0;
    queue[tail++] = a; prev[a] = -1;
    while (head < tail) {
      const cur = queue[head++];
      if (cur === b) break;
      const x = cur % w, y = (cur / w) | 0;
      for (const [nx, ny] of [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]]) {
        if (!this.inMap(nx, ny)) continue;
        const j = this.idx(nx, ny);
        if (prev[j] === -2 && this.st[j] === kind) { prev[j] = cur; queue[tail++] = j; }
      }
    }
    if (prev[b] === -2) return null;
    const path = [];
    for (let cur = b; cur !== -1; cur = prev[cur]) path.push(cur);
    return path.reverse();
  }

  // ---------- Kredite ----------
  takeLoan() {
    this.debt += BAL.MONEY.LOAN_STEP;
    this.money += BAL.MONEY.LOAN_STEP;
    this.events.push({ type: 'info', key: 'ev.loanTaken', params: { amount: BAL.MONEY.LOAN_STEP, rate: (BAL.MONEY.LOAN_RATE * 100).toFixed(1) } });
    return true;
  }
  repayLoan() {
    if (this.debt <= 0) return { ok: false, reason: 'err.noDebt' };
    const amount = Math.min(BAL.MONEY.LOAN_STEP, this.debt);
    if (this.money < amount) return { ok: false, reason: 'err.repayMoney' };
    this.debt -= amount; this.money -= amount;
    this.events.push({ type: 'info', key: 'ev.loanRepaid', params: { amount, rest: this.debt } });
    return { ok: true };
  }

  // ---------- Stromnetz ----------
  computePower() {
    const { w, h } = this;
    this.powered.fill(0);
    let supply = 0, need = 0;
    const queue = this._q;
    let tail = 0;
    for (let i = 0; i < w * h; i++) {
      const s = this.st[i];
      if (this.isPlant(s) && this.isAnchor(i))
        supply += s === S_SOLAR ? this.solarPower() : DEFS[s].power;
      if (this.isPlant(s)) { queue[tail++] = i; this.powered[i] = 1; }
      if (s >= S_RZONE && s <= S_IZONE && this.lvl[i] > 0) need += 1 + this.lvl[i];
      if (DEFS[s] && DEFS[s].drain && this.isAnchor(i)) need += DEFS[s].drain;
    }
    this.powerSupply = supply; this.powerNeed = need;
    const conducts = (i) => {
      const s = this.st[i];
      return s === S_ROAD || s === S_RAIL || s === S_WIRE || this.isBld(s);
    };
    let head = 0;
    while (head < tail) {
      const i = queue[head++];
      const x = i % w, y = (i / w) | 0;
      const nb = [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]];
      for (const [nx, ny] of nb) {
        if (!this.inMap(nx, ny)) continue;
        const j = this.idx(nx, ny);
        if (!this.powered[j] && conducts(j)) { this.powered[j] = 1; queue[tail++] = j; }
      }
    }
    this.brownout = need > supply;
    if (this.brownout && supply > 0) {
      const ratio = supply / need;
      const rr = mulberry(this.seed + this.day + this.month * 31);
      for (let i = 0; i < w * h; i++) {
        if (this.powered[i] && !this.isPlant(this.st[i]) && rr() > ratio) this.powered[i] = 0;
      }
    } else if (supply === 0) {
      for (let i = 0; i < w * h; i++) {
        if (!this.isPlant(this.st[i])) this.powered[i] = 0;
      }
    }
    this.dirtyPower = false;
  }

  // ---------- Wassernetz ----------
  // Analog zum Stromnetz: Wassertürme/Pumpwerke (mit Strom!) speisen das
  // Netz, Rohre/Straßen/Schienen/Gebäude leiten Wasser weiter. Stromkabel
  // leiten KEIN Wasser — dafür gibt es die Wasserleitung (S_PIPE).
  computeWater() {
    const { w, h } = this;
    const WB = BAL.WATER;
    this.watered.fill(0);
    let supply = 0, need = 0;
    const queue = this._q;
    let tail = 0;
    for (let i = 0; i < w * h; i++) {
      const s = this.st[i];
      const isSource = (s === S_WTOWER || s === S_PUMP) && this.powered[i];
      if (isSource && this.isAnchor(i))
        supply += s === S_PUMP ? WB.PUMP_SUPPLY : WB.TOWER_SUPPLY;
      if (isSource) { queue[tail++] = i; this.watered[i] = 1; }
      if (s >= S_RZONE && s <= S_IZONE && this.lvl[i] > 0) need += Math.ceil((1 + this.lvl[i]) / 2);
    }
    this.waterSupply = supply; this.waterNeed = need;
    const conducts = (i) => {
      const s = this.st[i];
      return s === S_PIPE || s === S_ROAD || s === S_RAIL || this.isBld(s);
    };
    let head = 0;
    while (head < tail) {
      const i = queue[head++];
      const x = i % w, y = (i / w) | 0;
      const nb = [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]];
      for (const [nx, ny] of nb) {
        if (!this.inMap(nx, ny)) continue;
        const j = this.idx(nx, ny);
        if (!this.watered[j] && conducts(j)) { this.watered[j] = 1; queue[tail++] = j; }
      }
    }
    const isSrc = (i) => {
      const s = this.st[i];
      return s === S_WTOWER || s === S_PUMP;
    };
    this.waterShort = need > supply;
    if (this.waterShort && supply > 0) {
      const ratio = supply / need;
      const rr = mulberry(this.seed + 7 + this.day + this.month * 31);
      for (let i = 0; i < w * h; i++) {
        if (this.watered[i] && !isSrc(i) && rr() > ratio) this.watered[i] = 0;
      }
    } else if (supply === 0) {
      for (let i = 0; i < w * h; i++) {
        if (!isSrc(i)) this.watered[i] = 0;
      }
    }
    // covWater bleibt als abgeleitetes 0/100-Feld erhalten, damit alle
    // bestehenden Verbraucher (Wachstum, Zufriedenheit, Berater, Infofeld)
    // unverändert funktionieren.
    for (let i = 0; i < w * h; i++) this.covWater[i] = this.watered[i] ? 100 : 0;
  }

  // ---------- Anbindung: nächstes Verkehrsfeld im Umkreis 3 ----------
  // Multi-Source-BFS von allen Netz-Kacheln (O(n) statt O(n·49) —
  // entscheidend für 1024er-Karten). Läuft nur bei Strukturänderung.
  computeRoadAccess() {
    const { w, h } = this;
    const n = w * h;
    this.roadOk.fill(0);
    this.accessPt.fill(-1);
    const q = this._q, depth = this._d;
    depth.fill(-1);
    let tail = 0;
    for (let i = 0; i < n; i++) {
      if (this.isNet(this.st[i])) { depth[i] = 0; this.accessPt[i] = i; q[tail++] = i; }
    }
    let head = 0;
    while (head < tail) {
      const u = q[head++];
      const d = depth[u];
      if (d >= 3) continue;
      const x = u % w, y = (u / w) | 0;
      for (const [nx, ny] of [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]]) {
        if (!this.inMap(nx, ny)) continue;
        const j = this.idx(nx, ny);
        if (depth[j] < 0) { depth[j] = d + 1; this.accessPt[j] = this.accessPt[u]; q[tail++] = j; }
      }
    }
    for (let i = 0; i < n; i++)
      if (this.accessPt[i] >= 0 && this.isBld(this.st[i])) this.roadOk[i] = 1;
    this.dirtyAccess = false;
  }

  // ---------- Pendler-Netz: Komponenten + Verkehrsflüsse ----------
  // Ersetzt den alten Radius-Verkehr: Wohnzonen pendeln über das
  // Straßen-/Schienennetz zum nächsten Arbeitsplatz. Der Fluss erzeugt
  // Verkehr auf Straßen (Schienen schlucken ihn), getrennte Netze
  // ohne Jobs/Kunden wachsen nicht (Ursache statt Näherung).
  computeCommute() {
    const { w, h } = this;
    const n = w * h;
    // 1) Komponenten des Verkehrsnetzes
    this.compId.fill(-1);
    let nc = 0;
    const queue = this._q;
    for (let i = 0; i < n; i++) {
      if (!this.isNet(this.st[i]) || this.compId[i] >= 0) continue;
      let head = 0, tail = 0;
      queue[tail++] = i; this.compId[i] = nc;
      while (head < tail) {
        const cur = queue[head++];
        const x = cur % w, y = (cur / w) | 0;
        for (const [nx, ny] of [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]]) {
          if (!this.inMap(nx, ny)) continue;
          const j = this.idx(nx, ny);
          if (this.isNet(this.st[j]) && this.compId[j] < 0) { this.compId[j] = nc; queue[tail++] = j; }
        }
      }
      nc++;
    }
    // 2) ÖPNV-Linien vorbereiten: Selbstheilung, Tore, Segmentpfade, Fahrkosten
    const T = BAL.TRANSIT;
    for (const L of this.lines)
      L.stops = L.stops.filter(si => this.st[si] === Sim.stopTypeFor(L.type));
    this.lines = this.lines.filter(L => L.stops.length > 0);
    for (const L of this.lines) {
      const cfg = T[L.type];
      const gateKind = L.type === 'bus' ? S_ROAD : L.type === 'train' ? S_RAIL : 0;
      L.gates = L.stops.map(si => this.nearestNet(si, gateKind));
      L.paths = [];   // Fahrweg je Segment (U-Bahn: null = Tunnel)
      L.cum = [0];    // kumulierte Fahrkosten bis Stopp k
      L.riders = 0;
      L.active = L.stops.length >= 2 && L.gates.every(g => g >= 0);
      for (let k = 0; k + 1 < L.stops.length && L.active; k++) {
        let segLen, path = null;
        if (L.type === 'sub') {
          const a = L.stops[k], b = L.stops[k + 1];
          segLen = Math.abs(a % w - b % w) + Math.abs(((a / w) | 0) - ((b / w) | 0));
        } else {
          path = this.netPath(L.gates[k], L.gates[k + 1], L.type === 'bus' ? S_ROAD : S_RAIL);
          if (!path) { L.active = false; break; }
          segLen = path.length;
        }
        L.paths.push(path);
        L.cum.push(L.cum[k] + Math.ceil(segLen / cfg.segDiv) + 1);
      }
    }
    // Tor → Linienstopps (für die Umsteige-Kanten im Dijkstra)
    const gateMap = new Map();
    for (const L of this.lines) {
      if (!L.active) continue;
      L.gates.forEach((g, k) => {
        if (!gateMap.has(g)) gateMap.set(g, []);
        gateMap.get(g).push({ L, k });
      });
    }

    // 3) Union-Find: Linien (v. a. U-Bahn) verbinden getrennte Netze
    const root = new Int32Array(nc);
    for (let c = 0; c < nc; c++) root[c] = c;
    const find = (x) => { while (root[x] !== x) { root[x] = root[root[x]]; x = root[x]; } return x; };
    for (const L of this.lines) {
      if (!L.active) continue;
      for (let k = 0; k + 1 < L.gates.length; k++) {
        const a = find(this.compId[L.gates[k]]), b = find(this.compId[L.gates[k + 1]]);
        if (a !== b) root[a] = b;
      }
    }
    // Bevölkerung/Jobs je (verschmolzener) Komponente
    const rootPop = new Array(nc).fill(0), rootJobs = new Array(nc).fill(0);
    const rootIJobs = new Array(nc).fill(0);
    const jobSources = [];
    for (let i = 0; i < n; i++) {
      const s = this.st[i];
      if (s < S_RZONE || s > S_IZONE || this.lvl[i] === 0) continue;
      const ap = this.accessPt[i];
      if (ap < 0) continue;
      const c = this.compId[ap];
      if (c < 0) continue;
      if (s === S_RZONE) rootPop[find(c)] += BAL.R_POP[this.lvl[i]];
      else {
        rootJobs[find(c)] += (s === S_CZONE ? BAL.C_JOBS : BAL.I_JOBS)[this.lvl[i]];
        if (s === S_IZONE) rootIJobs[find(c)] += BAL.I_JOBS[this.lvl[i]];
        jobSources.push(ap);
      }
    }
    this.compPop = new Array(nc);
    this.compJobs = new Array(nc);
    for (let c = 0; c < nc; c++) { this.compPop[c] = rootPop[find(c)]; this.compJobs[c] = rootJobs[find(c)]; }

    // 3b) Außenwelt: Straßen/Schienen am Kartenrand + Häfen = Handelsanschlüsse.
    //     Export je verschmolzener Komponente: begrenzte Kapazität, die
    //     Industrie-Jobs in Erlöse verwandelt (Abrechnung im Monatsbudget).
    const E = BAL.ECONOMY;
    const extRoadC = new Array(nc).fill(0), extRailC = new Array(nc).fill(0), portC = new Array(nc).fill(0);
    const border = (i) => {
      const s = this.st[i];
      const c = this.compId[i];
      if (c < 0) return;
      if (s === S_ROAD) extRoadC[find(c)]++;
      else if (s === S_RAIL) extRailC[find(c)]++;
    };
    for (let x = 0; x < w; x++) { border(this.idx(x, 0)); border(this.idx(x, h - 1)); }
    for (let y = 1; y < h - 1; y++) { border(this.idx(0, y)); border(this.idx(w - 1, y)); }
    for (let i = 0; i < n; i++) {
      if (this.st[i] === S_PORT && this.isAnchor(i)) {
        const ap = this.accessPt[i];
        if (ap >= 0 && this.compId[ap] >= 0) portC[find(this.compId[ap])]++;
      }
    }
    this.compExt = new Array(nc);
    this.extRoadTotal = 0; this.extRailTotal = 0; this.portTotal = 0;
    let exportBase = 0;
    for (let c = 0; c < nc; c++) {
      if (find(c) === c) {
        this.extRoadTotal += extRoadC[c];
        this.extRailTotal += extRailC[c];
        this.portTotal += portC[c];
        const cap = extRoadC[c] * E.CAP_ROAD + extRailC[c] * E.CAP_RAIL + portC[c] * E.CAP_PORT;
        exportBase += Math.min(rootIJobs[c] * E.EXPORT_PER_IJOB, cap);
      }
    }
    this.exportBase = exportBase;
    for (let c = 0; c < nc; c++) {
      const r2 = find(c);
      this.compExt[c] = extRoadC[r2] + extRailC[r2] + portC[r2];
    }

    // 4) Bucket-Dijkstra von allen Arbeitsplätzen: Netz-Schritt kostet 1,
    //    Linien-Hop kostet Einstieg + Fahrzeit (macht ÖPNV kausal attraktiv)
    const MAXD = T.MAX_DIST;
    const dist = this._d; dist.fill(-1);
    const parent = this._p; parent.fill(-1);
    const viaLine = this._v; viaLine.fill(-1);
    const buckets = new Array(MAXD);
    const push = (v, d2, p, lid) => {
      if (d2 >= MAXD) return;
      if (dist[v] >= 0 && dist[v] <= d2) return;
      dist[v] = d2; parent[v] = p; viaLine[v] = lid;
      (buckets[d2] || (buckets[d2] = [])).push(v);
    };
    for (const src of jobSources) push(src, 0, -1, -1);
    for (let d = 0; d < MAXD; d++) {
      const bucket = buckets[d];
      if (!bucket) continue;
      for (const u of bucket) {
        if (dist[u] !== d) continue; // veralteter Eintrag
        const x = u % w, y = (u / w) | 0;
        for (const [nx, ny] of [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]]) {
          if (!this.inMap(nx, ny)) continue;
          const j = this.idx(nx, ny);
          if (this.isNet(this.st[j])) push(j, d + 1, u, -1);
        }
        const gl = gateMap.get(u);
        if (gl) for (const { L, k } of gl) {
          const cfg = T[L.type];
          for (let j2 = 0; j2 < L.gates.length; j2++) {
            if (j2 === k) continue;
            push(L.gates[j2], d + cfg.board + Math.abs(L.cum[j2] - L.cum[k]), u, L.id);
          }
        }
      }
      buckets[d] = null;
    }

    // 5) Pendlerfluss: Weg ablaufen; ÖPNV-Hops erzeugen KEINEN Straßenverkehr
    const flow = new Float32Array(n);
    const ridersByLine = new Map();
    this.workOf.fill(-1);
    this.commuteDist.fill(-1);
    for (let i = 0; i < n; i++) {
      if (this.st[i] !== S_RZONE || this.lvl[i] === 0) continue;
      let cur = this.accessPt[i];
      if (cur < 0 || dist[cur] < 0) continue;
      this.commuteDist[i] = dist[cur];
      const load = this.lvl[i] * BAL.TRAFFIC.FLOW_PER_LVL;
      const people = BAL.R_POP[this.lvl[i]];
      let steps = 0;
      while (cur >= 0 && dist[cur] > 0 && steps++ < BAL.TRAFFIC.MAX_PATH) {
        const p = parent[cur];
        if (viaLine[cur] >= 0) {
          // Fahrt mit der Linie: Fahrgäste zählen, keine Autos
          ridersByLine.set(viaLine[cur], (ridersByLine.get(viaLine[cur]) || 0) + people);
        } else if (this.st[cur] === S_ROAD) {
          flow[cur] += load; // Schienen schlucken Verkehr
        }
        cur = p;
      }
      if (cur >= 0) {
        this.workOf[i] = cur;
        if (this.st[cur] === S_ROAD && viaLine[cur] < 0) flow[cur] += load;
      }
    }
    for (const L of this.lines) L.riders = ridersByLine.get(L.id) || 0;
    for (let i = 0; i < n; i++) this.traffic[i] = Math.min(100, Math.round(flow[i]));
    // 5) Stau-Umfeld vorberechnen (statt teurem trafficNear pro Zone)
    this.jamNear.fill(0);
    const R = BAL.TRAFFIC.JAM_RADIUS;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = this.idx(x, y);
      const t = this.traffic[i];
      if (t === 0) continue;
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const nx = x + dx, ny = y + dy;
        if (!this.inMap(nx, ny)) continue;
        const j = this.idx(nx, ny);
        if (t > this.jamNear[j]) this.jamNear[j] = t;
      }
    }
    this.dirtyCommute = false;
  }

  // Hat die Zone über ihr Netz Zugang zu Jobs (Wohnen) bzw. Menschen (G/I)?
  connectedOk(i, s) {
    if (this.pop < BAL.GROWTH.SMALL_TOWN_POP) return true; // Dorf-Schonfrist
    const ap = this.accessPt[i];
    if (ap < 0) return false;
    const c = this.compId[ap];
    if (c < 0) return false;
    if (s === S_RZONE) return this.compJobs[c] > 0;
    return this.compPop[c] > 0;
  }

  // ---------- Abdeckung der Dienste ----------
  spread(map, x, y, radius) {
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx, ny = y + dy;
      if (!this.inMap(nx, ny)) continue;
      const d = Math.abs(dx) + Math.abs(dy);
      if (d > radius) continue;
      const j = this.idx(nx, ny);
      const v = Math.round(100 * (1 - d / (radius + 1)));
      if (v > map[j]) map[j] = v;
    }
  }

  computeCoverage() {
    this.covPolice.fill(0); this.covFire.fill(0); this.covSchool.fill(0);
    this.covHealth.fill(0); this.covPark.fill(0);
    const { w, h } = this;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = this.idx(x, y);
      if (!this.isAnchor(i)) continue;
      switch (this.st[i]) {
        case S_POLICE:   if (this.powered[i]) this.spread(this.covPolice, x, y, 10); break;
        case S_FIREDEP:  if (this.powered[i]) this.spread(this.covFire, x, y, 9); break;
        case S_SCHOOL:   if (this.powered[i]) this.spread(this.covSchool, x, y, 8); break;
        case S_HOSPITAL: if (this.powered[i]) this.spread(this.covHealth, x, y, 10); break;
        case S_PARK:     this.spread(this.covPark, x, y, 5); break;
        case S_STADIUM:  if (this.powered[i]) this.spread(this.covPark, x, y, 12); break;
        case S_TOWNHALL: if (this.powered[i]) this.spread(this.covPark, x, y, 8); break;
        case S_MONUMENT: this.spread(this.covPark, x, y, 10); break;
      }
    }
    this.dirtyCov = false;
  }

  // ---------- Verschmutzung ----------
  computePollution() {
    const { w, h } = this;
    const B = BAL.POLLUTION;
    const src = new Float32Array(w * h);
    // E-Autos ab 2000: Straßenverschmutzung sinkt Jahr für Jahr
    const E = BAL.ERA;
    const eCarF = this.year >= E.ECAR_YEAR
      ? Math.max(E.ECAR_POLL_MIN, 1 - (this.year - E.ECAR_YEAR) * E.ECAR_POLL_DECAY) : 1;
    for (let i = 0; i < w * h; i++) {
      if (this.st[i] === S_IZONE) src[i] = B.IZONE_PER_LVL * this.lvl[i];
      else if (this.st[i] === S_COAL) src[i] = B.COAL;
      else if (this.st[i] === S_ROAD) src[i] = (B.ROAD_BASE + this.traffic[i] * B.ROAD_TRAFFIC_F) * eCarF;
      if (this.st[i] === S_PARK || this.terr[i] === T_TREE) src[i] = B.GREEN;
    }
    let cur = src;
    for (let pass = 0; pass < B.PASSES; pass++) {
      const next = new Float32Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let sum = 0, cnt = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (!this.inMap(nx, ny)) continue;
          sum += cur[this.idx(nx, ny)]; cnt++;
        }
        next[this.idx(x, y)] = sum / cnt * B.DIFFUSE_GAIN;
      }
      cur = next;
    }
    // ganzzahlig quantisiert, damit Spielstände bitgenau reproduzierbar sind
    for (let i = 0; i < w * h; i++) this.poll[i] = Math.round(Math.max(0, Math.min(100, cur[i])));
  }

  // ---------- Landwert ----------
  computeLandValue() {
    const { w, h } = this;
    const B = BAL.LANDV;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = this.idx(x, y);
      let v = B.BASE;
      if (this.waterNear[i]) v += B.WATER;
      v += this.covPark[i] * B.PARK_F;
      v += this.covPolice[i] * B.POLICE_F;
      v -= this.poll[i] * B.POLL_F;
      v -= this.jamNear[i] * B.JAM_F;
      v = Math.max(0, Math.min(100, Math.round(v)));
      // Luxus-Schwelle überschritten? → Sprite ändert sich, Chunk neu zeichnen
      if (this.lvl[i] === 4 && (this.st[i] === S_RZONE || this.st[i] === S_CZONE) &&
        ((this.landv[i] > B.LUX_MIN) !== (v > B.LUX_MIN))) this.markChanged(i);
      this.landv[i] = v;
    }
  }

  // ---------- Statistik ----------
  computeStats() {
    const B = BAL.HAPPY, D = BAL.DEMAND;
    let pop = 0, cJobs = 0, iJobs = 0, casinos = 0, townhall = false;
    const n = this.w * this.h;
    for (let i = 0; i < n; i++) {
      if (this.st[i] === S_RZONE) pop += BAL.R_POP[this.lvl[i]];
      else if (this.st[i] === S_CZONE) cJobs += BAL.C_JOBS[this.lvl[i]];
      else if (this.st[i] === S_IZONE) iJobs += BAL.I_JOBS[this.lvl[i]];
      else if (this.st[i] === S_CASINO && this.powered[i]) casinos++;
      else if (this.st[i] === S_TOWNHALL && this.powered[i]) townhall = true;
    }
    this.pop = pop; this.cJobs = cJobs; this.iJobs = iJobs;
    this.jobs = cJobs + iJobs;
    this.casinos = casinos;

    const workers = pop * D.WORKER_SHARE;
    const taxF = Math.max(D.TAX_F_MIN, D.TAX_F_MAX - this.taxRate / D.TAX_F_DIV);
    // Konjunktur schlägt auf die Nachfrage durch (Boom hebt, Rezession drückt)
    const ec = this.econ, EF = BAL.ECONOMY;
    this.demandR = Math.max(-1, Math.min(1, (this.jobs * D.R_JOBS_F + D.R_BASE - pop) / D.R_DIV * (1 + ec * EF.DEMAND_F_R))) * taxF;
    this.demandC = Math.max(-1, Math.min(1, (workers * D.C_WORK_F - cJobs) / D.C_DIV * (1 + ec * EF.DEMAND_F_CI))) * taxF;
    this.demandI = Math.max(-1, Math.min(1, (workers * D.I_WORK_F + D.I_BASE - iJobs) / D.I_DIV * (1 + ec * EF.DEMAND_F_CI))) * taxF;

    let happy = B.BASE;
    happy -= Math.max(0, this.taxRate - D.TAX_NEUTRAL) * B.TAX_PENALTY;
    happy += Math.min(B.TAX_BONUS_MAX, Math.max(0, D.TAX_NEUTRAL - this.taxRate));
    if (townhall) happy += B.TOWNHALL;
    if (casinos > 0) happy -= B.CASINO;
    if (pop > 0) {
      let covP = 0, covS = 0, covH = 0, covG = 0, covW = 0, pol = 0, jam = 0, fire = 0, cnt = 0;
      for (let i = 0; i < n; i++) {
        if (this.st[i] === S_RZONE && this.lvl[i] > 0) {
          covP += this.covPolice[i]; covS += this.covSchool[i];
          covH += this.covHealth[i]; covG += this.covPark[i];
          covW += this.covWater[i]; fire += this.covFire[i];
          pol += this.poll[i]; jam += this.jamNear[i]; cnt++;
        }
      }
      if (cnt > 0) {
        happy += (covP / cnt) * B.COV_POLICE + (covS / cnt) * B.COV_SCHOOL +
          (covH / cnt) * B.COV_HEALTH + (covG / cnt) * B.COV_PARK + (covW / cnt) * B.COV_WATER;
        happy -= (pol / cnt) * B.POLL_F;
        happy -= Math.max(0, jam / cnt - B.JAM_FREE) * B.JAM_F;
        this.avgPollR = pol / cnt;
        this.avgFireCovR = fire / cnt;
      }
      const unemployment = Math.max(0, (workers - this.jobs) / Math.max(1, workers));
      happy -= unemployment * B.UNEMPLOYED_F;
      if (this.brownout) happy -= B.BROWNOUT;
      if (this.waterShort) happy -= BAL.WATER.SHORT_HAPPY;
    }
    this.happiness = Math.max(0, Math.min(100, Math.round(happy)));
  }

  // ---------- Wachstum ----------
  growthTick() {
    const G = BAL.GROWTH;
    const E = BAL.ECONOMY;
    const n = this.w * this.h;
    if (!this.zoneList) { // Zonen-Cache: nur bei Strukturänderung neu aufbauen
      this.zoneList = [];
      for (let i = 0; i < n; i++) if (this.st[i] >= S_RZONE && this.st[i] <= S_IZONE) this.zoneList.push(i);
    }
    const zones = this.zoneList;
    if (zones.length === 0) return;
    const tries = Math.max(G.TRIES_MIN, Math.round(zones.length * G.TRIES_F));
    const happyF = 0.4 + this.happiness / 100 * 0.9;
    for (let k = 0; k < tries; k++) {
      const i = zones[(this.rand() * zones.length) | 0];
      const s = this.st[i];
      const demand = s === S_RZONE ? this.demandR : s === S_CZONE ? this.demandC : this.demandI;
      const okInfra = this.powered[i] && this.roadOk[i] && this.connectedOk(i, s);
      if (okInfra && demand > 0) {
        let p = demand * G.BASE_P * happyF;
        if (s === S_RZONE && this.poll[i] > G.POLL_LIMIT) p *= G.POLL_PENALTY;
        if (s === S_RZONE) p *= G.LANDV_MIN_F + this.landv[i] / 100 * G.LANDV_SPAN_F;
        if (s === S_RZONE) p *= 1 + this.covPark[i] / G.PARK_BONUS_DIV;
        if (this.jamNear[i] > G.JAM_LIMIT) p *= G.JAM_PENALTY;
        // Industrie braucht eine Außenanbindung für den Export
        if (s === S_IZONE && this.pop >= E.NO_EXPORT_MIN_POP && !this.extOk(i)) p *= E.NO_EXPORT_PENALTY;
        if (this.lvl[i] >= 3) p *= G.HIGH_LVL_SLOW;
        const maxLvl = this.covWater[i] >= G.WATER_MIN_COV ? 4 : G.WATER_FREE_LVL;
        if (this.rand() < p && this.lvl[i] < maxLvl) { this.lvl[i]++; this.markChanged(i); }
      } else if ((!okInfra && this.lvl[i] > 0 && this.rand() < G.DECAY_NO_INFRA) ||
                 (demand < G.DEMAND_DECAY_AT && this.lvl[i] > 0 && this.rand() < G.DECAY_DEMAND)) {
        this.lvl[i]--; this.markChanged(i);
      }
    }
  }

  // Diagnose für das Info-Panel: warum wächst diese Zone (nicht)?
  explainZone(i) {
    const s = this.st[i];
    if (s < S_RZONE || s > S_IZONE) return null;
    const G = BAL.GROWTH;
    const demand = s === S_RZONE ? this.demandR : s === S_CZONE ? this.demandC : this.demandI;
    const out = [];
    out.push({ k: 'diag.power', ok: !!this.powered[i] });
    out.push({ k: 'diag.road', ok: !!this.roadOk[i] });
    if (this.pop >= G.SMALL_TOWN_POP)
      out.push({ k: s === S_RZONE ? 'diag.jobsConn' : 'diag.custConn', ok: this.connectedOk(i, s) });
    if (s === S_IZONE && this.pop >= BAL.ECONOMY.NO_EXPORT_MIN_POP)
      out.push({ k: 'diag.export', ok: this.extOk(i) });
    out.push({ k: 'diag.demand', ok: demand > 0, val: Math.round(demand * 100) + '%' });
    const waterOk = this.covWater[i] >= G.WATER_MIN_COV;
    out.push({ k: 'diag.water', ok: waterOk, soft: this.lvl[i] < G.WATER_FREE_LVL, val: this.covWater[i] + '%' });
    if (s === S_RZONE)
      out.push({ k: 'diag.poll', ok: this.poll[i] <= G.POLL_LIMIT, val: Math.round(this.poll[i]) + '%' });
    out.push({ k: 'diag.jam', ok: this.jamNear[i] <= G.JAM_LIMIT, val: this.jamNear[i] + '%' });
    if (s === S_RZONE)
      out.push({ k: 'diag.landv', ok: this.landv[i] >= 35, val: this.landv[i] + '%' });
    out.push({ k: 'diag.tax', ok: this.taxRate <= BAL.DEMAND.TAX_NEUTRAL + 3, val: this.taxRate + '%' });
    return out;
  }

  // ---------- Brände ----------
  igniteRandom() {
    const n = this.w * this.h;
    const targets = [];
    for (let i = 0; i < n; i++) {
      const s = this.st[i];
      if ((s >= S_RZONE && s <= S_IZONE && this.lvl[i] > 0) || s === S_PARK) {
        if (this.covFire[i] < BAL.DISASTER.FIRE_COV_SAFE) targets.push(i);
      }
    }
    if (targets.length === 0) return false;
    const i = targets[(this.rand() * targets.length) | 0];
    this.setBurn(i, BAL.DISASTER.FIRE_BURN);
    this.events.push({ type: 'bad', key: 'ev.fire', x: i % this.w, y: (i / this.w) | 0 });
    return true;
  }

  fireTick() {
    if (this.burnList.length === 0) return;
    const { w, h } = this;
    const D = BAL.DISASTER;
    const cur = this.burnList;
    this.burnList = [];
    for (const i of cur) {
      if (this.burn[i] === 0) continue; // gelöscht/abgerissen
      if (this.covFire[i] > D.FIRE_COV_FAST && this.rand() < 0.45) { this.burn[i] = 0; continue; }
      this.burn[i]--;
      if (this.burn[i] === 0) { this.destroyTile(i); continue; }
      this.burnList.push(i);
      if (this.rand() < 0.2) {
        const x = i % w, y = (i / w) | 0;
        const nb = [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]];
        const [nx, ny] = nb[(this.rand() * 4) | 0];
        if (this.inMap(nx, ny)) {
          const j = this.idx(nx, ny);
          const s = this.st[j];
          const flammable = (DEFS[s] && DEFS[s].flam) || this.terr[j] === T_TREE;
          if (flammable && this.burn[j] === 0 && this.covFire[j] < D.FIRE_COV_STOP) {
            if (this.terr[j] === T_TREE && s === S_NONE) { this.terr[j] = T_GRASS; this.markChanged(j); }
            else this.setBurn(j, D.FIRE_SPREAD_BURN);
          }
        }
      }
    }
  }

  // ---------- Katastrophen ----------
  spawnTornado() {
    const edge = (this.rand() * 4) | 0;
    const t = { type: 'tornado', ttl: 40 + (this.rand() * 30 | 0) };
    if (edge === 0) { t.x = this.rand() * this.w; t.y = 0; t.vx = this.rand() - 0.5; t.vy = 0.4; }
    else if (edge === 1) { t.x = this.w - 1; t.y = this.rand() * this.h; t.vx = -0.4; t.vy = this.rand() - 0.5; }
    else if (edge === 2) { t.x = this.rand() * this.w; t.y = this.h - 1; t.vx = this.rand() - 0.5; t.vy = -0.4; }
    else { t.x = 0; t.y = this.rand() * this.h; t.vx = 0.4; t.vy = this.rand() - 0.5; }
    this.actors.push(t);
    this.events.push({ type: 'bad', key: 'ev.tornado', x: t.x | 0, y: t.y | 0 });
  }

  spawnFlood() {
    const { w, h } = this;
    const shore = [];
    for (let i = 0; i < w * h; i++)
      if (this.terr[i] !== T_WATER && this.waterNear[i]) shore.push(i);
    if (shore.length === 0) return;
    const c = shore[(this.rand() * shore.length) | 0];
    const cx = c % w, cy = (c / w) | 0;
    let hit = 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > 4) continue;
      const nx = cx + dx, ny = cy + dy;
      if (!this.inMap(nx, ny)) continue;
      const i = this.idx(nx, ny);
      if (this.terr[i] === T_WATER || !this.waterNear[i]) continue;
      if (this.rand() < 0.75) {
        this.setFlood(i, 10 + (this.rand() * 10 | 0));
        if (this.st[i] !== S_NONE && this.st[i] !== S_RUBBLE && this.rand() < 0.4) { this.destroyTile(i); hit++; }
      }
    }
    this.events.push({ type: 'bad', key: 'ev.flood', params: { hit }, x: cx, y: cy });
  }

  spawnUfo() {
    this.actors.push({
      type: 'ufo', x: -2, y: this.rand() * this.h * 0.6 + this.h * 0.2,
      tx: this.w / 2, ty: this.h / 2, ttl: 120, beam: 0,
    });
    this.events.push({ type: 'bad', key: 'ev.ufo' });
  }

  actorTick() {
    const { w, h } = this;
    for (const a of this.actors) {
      if (a.type === 'tornado') {
        a.x += a.vx + (this.rand() - 0.5) * 0.5;
        a.y += a.vy + (this.rand() - 0.5) * 0.5;
        a.ttl--;
        const tx = a.x | 0, ty = a.y | 0;
        if (this.inMap(tx, ty)) {
          const i = this.idx(tx, ty);
          if (this.terr[i] === T_TREE) { this.terr[i] = T_GRASS; this.markChanged(i); }
          if (this.st[i] !== S_NONE && this.st[i] !== S_RUBBLE && this.rand() < 0.6) this.destroyTile(i);
        }
      } else if (a.type === 'ufo') {
        a.ttl--;
        if (a.beam > 0) {
          a.beam--;
          if (a.beam === 5) {
            const tx = Math.round(a.x), ty = Math.round(a.y) + 1;
            if (this.inMap(tx, ty)) {
              const i = this.idx(tx, ty);
              if (DEFS[this.st[i]] && DEFS[this.st[i]].flam) this.setBurn(i, BAL.DISASTER.FIRE_SPREAD_BURN);
            }
          }
        } else {
          const dx = a.tx - a.x, dy = a.ty - a.y;
          const d = Math.hypot(dx, dy);
          if (d < 1) {
            if (this.rand() < 0.5) a.beam = 10;
            a.tx = this.rand() * w; a.ty = this.rand() * h * 0.8;
          } else { a.x += dx / d * 0.8; a.y += dy / d * 0.8; }
        }
      }
    }
    this.actors = this.actors.filter(a => a.ttl > 0 &&
      a.x > -4 && a.y > -4 && a.x < w + 4 && a.y < h + 4);
    // Hochwasser über aktive Liste abklingen lassen (kein Vollscan)
    if (this.floodList.length) {
      const keep = [];
      for (const i of this.floodList) {
        if (this.floodT[i] > 0) { this.floodT[i]--; if (this.floodT[i] > 0) keep.push(i); }
      }
      this.floodList = keep;
    }
  }

  // ---------- Berater (Texte kommen aus der i18n der UI) ----------
  checkAdvisors() {
    for (const k in this.advCd) if (this.advCd[k] > 0) this.advCd[k]--;
    const say = (k) => {
      if (!this.advCd[k]) {
        this.advCd[k] = 8;
        this.events.push({ type: 'advisor', adv: k });
      }
    };
    if (this.lastBudget && this.lastBudget.net < 0 && this.money < 3000) say('finance');
    if (this.brownout) say('power');
    if (this.waterShort && this.pop > 150) say('watershort');
    if (this.avgPollR > 32) say('env');
    if (this.pop > 250 && this.avgFireCovR !== undefined && this.avgFireCovR < 22) say('fire');
    if (this.pop > 150) {
      let dry = 0;
      for (let i = 0; i < this.w * this.h; i++)
        if (this.st[i] >= S_RZONE && this.st[i] <= S_IZONE && this.lvl[i] >= 2 &&
          this.covWater[i] < BAL.GROWTH.WATER_MIN_COV) dry++;
      if (dry > 12) say('water');
    }
  }

  // ---------- Szenario ----------
  checkScenario() {
    const sc = this.scenario;
    if (!sc || sc.done) return;
    const won = this.pop >= (sc.minPop || 0) && this.happiness >= (sc.minHappy || 0);
    if (won) {
      sc.done = true; sc.won = true;
      this.events.push({ type: 'milestone', key: 'ev.scenWon', params: { name: sc.id } });
    } else if (this.year > sc.deadlineYear || (this.year === sc.deadlineYear && this.month >= 11)) {
      sc.done = true; sc.won = false;
      this.events.push({ type: 'bad', key: 'ev.scenLost', params: { name: sc.id } });
    }
  }

  // ---------- Monatsabschluss ----------
  monthlyBudget() {
    const n = this.w * this.h;
    let upkeep = 0;
    const coalF = this.year >= BAL.ERA.COAL_TAX_YEAR ? BAL.ERA.COAL_UPKEEP_F : 1; // CO₂-Abgabe
    for (let i = 0; i < n; i++) {
      const s = this.st[i];
      if (s !== S_NONE && DEFS[s] && this.isAnchor(i))
        upkeep += DEFS[s].upkeep * (s === S_COAL ? coalF : 1);
    }
    const income = Math.round((this.pop * BAL.MONEY.TAX_POP + this.jobs * BAL.MONEY.TAX_JOBS) * this.taxRate / BAL.DEMAND.TAX_NEUTRAL);
    const casinoIncome = (this.casinos || 0) * DEFS[S_CASINO].income;
    const interest = Math.round(this.debt * BAL.MONEY.LOAN_RATE);
    // ÖPNV: Linien-Unterhalt vs. Fahrgeld
    let transit = 0, fares = 0;
    for (const L of this.lines) {
      const cfg = BAL.TRANSIT[L.type];
      transit += cfg.lineUpkeep + cfg.stopUpkeep * L.stops.length;
      fares += (L.riders || 0) * BAL.TRANSIT.FARE;
    }
    transit = Math.round(transit); fares = Math.round(fares);
    upkeep = Math.round(upkeep);
    // Außenhandel: Exporterlöse hängen an Kapazität UND Konjunktur
    const ec = this.econ;
    const exportIncome = Math.round((this.exportBase || 0) * (1 + ec * 0.5));
    const net = income + casinoIncome + fares + exportIncome - upkeep - interest - transit;
    this.money += net;
    this.lastBudget = { income, casino: casinoIncome, fares, export: exportIncome, upkeep, interest, transit, net };
    // Konjunktur-Phasenwechsel melden (deterministisch aus dem Monat)
    const E2 = BAL.ECONOMY;
    const prevEc = this.econAt(this.monthsTotal - 1);
    if (ec >= E2.PHASE_HI && prevEc < E2.PHASE_HI) this.events.push({ type: 'milestone', key: 'ev.boom' });
    if (ec <= E2.PHASE_LO && prevEc > E2.PHASE_LO) this.events.push({ type: 'bad', key: 'ev.bust' });
    // Erste Außenwelt-Verbindungen feiern
    if (this.extRoadTotal > 0 && !this.milestones.extRoad) {
      this.milestones.extRoad = true;
      this.events.push({ type: 'milestone', key: 'ev.extRoad' });
    }
    if (this.extRailTotal > 0 && !this.milestones.extRail) {
      this.milestones.extRail = true;
      this.events.push({ type: 'milestone', key: 'ev.extRail' });
    }
    if (this.portTotal > 0 && !this.milestones.port) {
      this.milestones.port = true;
      this.events.push({ type: 'milestone', key: 'ev.port' });
    }
    if (this.money < 0 && this.lastBudget.net < 0) {
      this.events.push({ type: 'bad', key: 'ev.broke' });
    }
    this.history.push({ p: this.pop, m: Math.round(this.money), h: this.happiness, j: this.jobs });
    if (this.history.length > 480) this.history.shift();
    BAL.MILESTONES.forEach(([lim, bonus, key]) => {
      if (this.pop >= lim && !this.milestones[lim]) {
        this.milestones[lim] = true;
        this.money += bonus;
        this.events.push({ type: 'milestone', key, params: { pop: lim, bonus } });
      }
    });
    // Epochen-Ereignisse (je einmal, beim Erreichen des Jahres)
    const eras = [
      [BAL.ERA.SOLAR_YEAR, 'era94', 'ev.era94'],
      [BAL.ERA.COAL_TAX_YEAR, 'era98', 'ev.era98'],
      [BAL.ERA.ECAR_YEAR, 'era00', 'ev.era00'],
      [BAL.ERA.SOLAR_UP_YEAR, 'era02', 'ev.era02'],
    ];
    for (const [yr, flag, key] of eras) {
      if (this.year >= yr && !this.milestones[flag]) {
        this.milestones[flag] = true;
        this.events.push({ type: 'milestone', key });
      }
    }
    const D = BAL.DISASTER;
    if (this.disasters && this.pop > D.MIN_POP) {
      if (this.rand() < D.FIRE_P) this.igniteRandom();
      if (this.rand() < D.TORNADO_P) this.spawnTornado();
      if (this.rand() < D.FLOOD_P) this.spawnFlood();
      if (this.year >= this.startYear + D.UFO_FROM_YEAR && this.rand() < D.UFO_P) this.spawnUfo();
    }
    this.checkAdvisors();
    this.checkScenario();
  }

  // ---------- Ein Simulationstag ----------
  tick() {
    this.day++;
    if (this.day > 30) {
      this.day = 1; this.month++;
      if (this.month > 11) { this.month = 0; this.year++; }
      this.monthlyBudget();
    }
    if (this.dirtyPower || this.day % 5 === 0) { this.computePower(); this.computeWater(); }
    if (this.dirtyCov) this.computeCoverage();
    if (this.dirtyAccess) this.computeRoadAccess(); // nur bei Strukturänderung
    if (this.dirtyCommute || this.day % 7 === 5) this.computeCommute();
    if (this.day % 7 === 0) this.computePollution();
    if (this.day % 7 === 3) this.computeLandValue();
    this.growthTick();
    this.fireTick();
    this.actorTick();
    // Statistik auf Riesenkarten drosseln (O(n)-Scan)
    if (this.statsEvery === 1 || this.day % this.statsEvery === 0) this.computeStats();
    if (this.sandbox) this.money = 999999999;
  }

  dateStr() {
    const t = (typeof I18N !== 'undefined') ? I18N.t : (k) => k;
    return this.day + '. ' + t(MONTH_KEYS[this.month]) + ' ' + this.year;
  }

  // ---------- Speichern / Laden (v4: RLE-komprimiert) ----------
  serialize() {
    // Abgeleitete Zustände auffrischen, damit Laden bitgenau denselben
    // Zustand rekonstruiert (Abdeckung/Verkehr werden sonst nur
    // wöchentlich berechnet und wären „veraltet“ relativ zum Ladepfad).
    this.computeRoadAccess();
    this.computeCoverage();
    this.computeCommute();
    this.computeLandValue();
    this.computeStats();
    const anchors2 = [];
    for (let i = 0; i < this.w * this.h; i++)
      if (this.isAnchor(i) && DEFS[this.st[i]] && DEFS[this.st[i]].size === 2) anchors2.push(i);
    return JSON.stringify({
      v: 4, w: this.w, h: this.h, seed: this.seed,
      rle: {
        terr: rleEncode(this.terr), st: rleEncode(this.st), lvl: rleEncode(this.lvl),
        burn: rleEncode(this.burn), flood: rleEncode(this.floodT),
        pow: rleEncode(this.powered), // sonst ändert der Brownout-Zufall beim Laden die Zufriedenheit
        wat: rleEncode(this.watered), // dito für das Wassernetz (Mangel-Sampling)
        poll: rleEncode(this.poll),   // sonst verschiebt frischer Verkehr die Umweltwerte
      },
      anchors2,
      brownout: !!this.brownout, powerNeed: this.powerNeed, powerSupply: this.powerSupply,
      waterShort: !!this.waterShort, waterNeed: this.waterNeed, waterSupply: this.waterSupply,
      money: this.money, debt: this.debt, taxRate: this.taxRate,
      day: this.day, month: this.month, year: this.year, startYear: this.startYear,
      cityName: this.cityName, cheated: this.cheated,
      lines: this.lines.map(L => ({ id: L.id, type: L.type, name: L.name, color: L.color, stops: L.stops })),
      nextLineId: this.nextLineId,
      disasters: this.disasters, sandbox: this.sandbox,
      milestones: this.milestones, lastBudget: this.lastBudget,
      actors: this.actors, history: this.history, advCd: this.advCd,
      scenario: this.scenario,
    });
  }

  static load(json) {
    const d = JSON.parse(json);
    const s = new Sim(d.w, d.h, d.seed);
    if (d.v >= 4) {
      rleDecode(d.rle.terr, s.terr); rleDecode(d.rle.st, s.st); rleDecode(d.rle.lvl, s.lvl);
      rleDecode(d.rle.burn, s.burn); rleDecode(d.rle.flood, s.floodT);
      // Anker rekonstruieren: 1x1 = eigenes Feld, 2x2 aus der Liste
      for (let i = 0; i < s.w * s.h; i++) s.anchor[i] = s.st[i] !== S_NONE ? i : -1;
      for (const a of d.anchors2 || []) {
        const ax = a % s.w, ay = (a / s.w) | 0;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++)
          if (s.inMap(ax + dx, ay + dy)) s.anchor[s.idx(ax + dx, ay + dy)] = a;
      }
    } else {
      // Migration von v2/v3 (unkomprimierte Arrays)
      s.terr.set(d.terr); s.st.set(d.st); s.lvl.set(d.lvl);
      s.anchor.set(d.anchor); s.burn.set(d.burn);
      if (d.floodT) s.floodT.set(d.floodT);
    }
    s.money = d.money; s.taxRate = d.taxRate;
    s.debt = d.debt || 0;
    s.day = d.day; s.month = d.month; s.year = d.year;
    s.startYear = d.startYear || 1990;
    s.cityName = d.cityName || 'Retropolis';
    s.cheated = !!d.cheated;
    s.lines = d.lines || [];
    s.nextLineId = d.nextLineId || 1;
    s.disasters = d.disasters !== false;
    s.sandbox = !!d.sandbox;
    s.milestones = d.milestones || {};
    s.lastBudget = d.lastBudget || null;
    s.actors = d.actors || [];
    s.history = d.history || [];
    s.advCd = d.advCd || {};
    s.scenario = d.scenario || null;
    s.computeWaterNear();
    // Aktive Brand-/Flutlisten aus den Arrays rekonstruieren
    for (let i = 0; i < s.w * s.h; i++) {
      if (s.burn[i] > 0) s.burnList.push(i);
      if (s.floodT[i] > 0) s.floodList.push(i);
    }
    s.allChanged = true;
    if (d.v >= 4 && d.rle.pow) {
      // Stromzustand exakt wiederherstellen (Brownout-Sampling nicht wiederholen)
      rleDecode(d.rle.pow, s.powered);
      s.brownout = !!d.brownout;
      s.powerNeed = d.powerNeed || 0;
      s.powerSupply = d.powerSupply || 0;
      s.dirtyPower = false;
    } else {
      s.computePower();
    }
    if (d.v >= 4 && d.rle.wat) {
      rleDecode(d.rle.wat, s.watered);
      s.waterShort = !!d.waterShort;
      s.waterNeed = d.waterNeed || 0;
      s.waterSupply = d.waterSupply || 0;
      for (let i = 0; i < s.w * s.h; i++) s.covWater[i] = s.watered[i] ? 100 : 0;
    } else {
      s.computeWater();
    }
    s.dirtyCov = true; s.dirtyCommute = true;
    s.computeCoverage(); s.computeRoadAccess();
    s.computeCommute();
    if (d.v >= 4 && d.rle.poll) rleDecode(d.rle.poll, s.poll);
    else s.computePollution();
    s.computeLandValue(); s.computeStats();
    return s;
  }
}

// Node-Export für Tests (im Browser wirkungslos)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    Sim, DEFS, MONTH_KEYS, rleEncode, rleDecode,
    T_GRASS, T_WATER, T_SAND, T_TREE,
    S_NONE, S_ROAD, S_WIRE, S_RZONE, S_CZONE, S_IZONE, S_PARK, S_POLICE,
    S_FIREDEP, S_SCHOOL, S_HOSPITAL, S_WIND, S_COAL, S_STADIUM, S_RUBBLE,
    S_RAIL, S_WTOWER, S_PUMP, S_TOWNHALL, S_MONUMENT, S_CASINO, S_SOLAR,
    S_BUSSTOP, S_TRAINSTATION, S_SUBWAY, S_PORT, S_PIPE,
  };
}
