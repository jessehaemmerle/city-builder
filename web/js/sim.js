/* ============================================================
 * RETROPOLIS — Simulation
 * Terrain, Stromnetz, Wasser, Straßen/Schienen, RCI-Wachstum,
 * Landwert, Verkehr, Budget & Kredite, Zufriedenheit, Dienste,
 * Katastrophen (Feuer, Tornado, Hochwasser, UFO), Szenarien.
 * ============================================================ */
'use strict';

// Terrain-Typen
const T_GRASS = 0, T_WATER = 1, T_SAND = 2, T_TREE = 3;

// Strukturen
const S_NONE = 0, S_ROAD = 1, S_WIRE = 2, S_RZONE = 3, S_CZONE = 4, S_IZONE = 5,
  S_PARK = 6, S_POLICE = 7, S_FIREDEP = 8, S_SCHOOL = 9, S_HOSPITAL = 10,
  S_WIND = 11, S_COAL = 12, S_STADIUM = 13, S_RUBBLE = 14,
  S_RAIL = 15, S_WTOWER = 16, S_PUMP = 17, S_TOWNHALL = 18, S_MONUMENT = 19, S_CASINO = 20;

// Katalog. Flags: bld = Gebäude (leitet Strom, braucht Anbindung),
// flam = brennbar, drain = Strombedarf, power = Stromerzeugung,
// waterRange = Wasserversorgungs-Radius, needsWaterAdj = muss am Wasser stehen
const DEFS = {
  [S_ROAD]:     { name: 'Straße',          cost: 10,   upkeep: 0.2,  size: 1 },
  [S_WIRE]:     { name: 'Stromleitung',    cost: 5,    upkeep: 0.1,  size: 1 },
  [S_RAIL]:     { name: 'Schiene',         cost: 25,   upkeep: 0.4,  size: 1 },
  [S_RZONE]:    { name: 'Wohngebiet',      cost: 40,   upkeep: 0,    size: 1, bld: 1, flam: 1 },
  [S_CZONE]:    { name: 'Gewerbegebiet',   cost: 40,   upkeep: 0,    size: 1, bld: 1, flam: 1 },
  [S_IZONE]:    { name: 'Industriegebiet', cost: 60,   upkeep: 0,    size: 1, bld: 1, flam: 1 },
  [S_PARK]:     { name: 'Park',            cost: 150,  upkeep: 3,    size: 1, bld: 1, flam: 1 },
  [S_POLICE]:   { name: 'Polizeiwache',    cost: 500,  upkeep: 30,   size: 1, bld: 1, flam: 1, drain: 2 },
  [S_FIREDEP]:  { name: 'Feuerwache',      cost: 500,  upkeep: 25,   size: 1, bld: 1, flam: 1, drain: 2 },
  [S_SCHOOL]:   { name: 'Schule',          cost: 400,  upkeep: 20,   size: 1, bld: 1, flam: 1, drain: 2 },
  [S_HOSPITAL]: { name: 'Krankenhaus',     cost: 600,  upkeep: 35,   size: 1, bld: 1, flam: 1, drain: 3 },
  [S_WIND]:     { name: 'Windrad',         cost: 600,  upkeep: 5,    size: 1, bld: 1, power: 30 },
  [S_COAL]:     { name: 'Kohlekraftwerk',  cost: 3000, upkeep: 100,  size: 2, bld: 1, power: 180 },
  [S_STADIUM]:  { name: 'Stadion',         cost: 3000, upkeep: 60,   size: 2, bld: 1, drain: 5, minPop: 1500 },
  [S_RUBBLE]:   { name: 'Trümmer',         cost: 0,    upkeep: 0,    size: 1 },
  [S_WTOWER]:   { name: 'Wasserturm',      cost: 400,  upkeep: 10,   size: 1, bld: 1, drain: 1, waterRange: 7 },
  [S_PUMP]:     { name: 'Pumpwerk',        cost: 700,  upkeep: 18,   size: 1, bld: 1, drain: 2, waterRange: 12, needsWaterAdj: 1 },
  [S_TOWNHALL]: { name: 'Rathaus',         cost: 1500, upkeep: 20,   size: 1, bld: 1, flam: 1, drain: 3, minPop: 500 },
  [S_MONUMENT]: { name: 'Denkmal',         cost: 1000, upkeep: 5,    size: 1, bld: 1, minPop: 2500 },
  [S_CASINO]:   { name: 'Casino',          cost: 2000, upkeep: 0,    size: 1, bld: 1, flam: 1, drain: 4, minPop: 4000, income: 150 },
};

const BRIDGE_FACTOR = 3;     // Baukosten-Faktor auf Wasser
const LOAN_STEP = 5000;      // Kredit-Stückelung
const LOAN_RATE = 0.015;     // Zins pro Monat

// Einwohner/Jobs pro Zonen-Level
const R_POP  = [0, 8, 20, 45, 90];
const C_JOBS = [0, 5, 12, 28, 60];
const I_JOBS = [0, 7, 16, 34, 70];

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

class Sim {
  constructor(w, h, seed) {
    this.w = w; this.h = h;
    this.seed = seed >>> 0;
    const n = w * h;
    this.terr = new Uint8Array(n);
    this.st = new Uint8Array(n);       // Struktur-Typ
    this.lvl = new Uint8Array(n);      // Zonen-Level 0..4
    this.anchor = new Int32Array(n).fill(-1); // Anker-Index für 2x2-Gebäude
    this.powered = new Uint8Array(n);
    this.roadOk = new Uint8Array(n);
    this.poll = new Float32Array(n);   // Verschmutzung 0..100
    this.landv = new Uint8Array(n);    // Landwert 0..100
    this.traffic = new Uint8Array(n);  // Verkehr auf Straßen 0..100
    this.covPolice = new Uint8Array(n);
    this.covFire = new Uint8Array(n);
    this.covSchool = new Uint8Array(n);
    this.covHealth = new Uint8Array(n);
    this.covPark = new Uint8Array(n);
    this.covWater = new Uint8Array(n); // Wasserversorgung
    this.burn = new Uint8Array(n);     // Brand-Timer
    this.floodT = new Uint8Array(n);   // Hochwasser-Timer
    this.waterNear = new Uint8Array(n);// statisch: Wasser im Umkreis 3

    this.money = 25000;
    this.debt = 0;                     // aufgenommene Kredite
    this.taxRate = 9;
    this.day = 1; this.month = 0; this.year = 1990;
    this.pop = 0; this.jobs = 0;
    this.happiness = 50;
    this.demandR = 0.5; this.demandC = 0.2; this.demandI = 0.4;
    this.powerSupply = 0; this.powerNeed = 0;
    this.disasters = true;
    this.sandbox = false;
    this.milestones = {};
    this.events = [];                  // Meldungen für die UI
    this.actors = [];                  // Tornado / UFO
    this.history = [];                 // Monatsstatistik für Graphen
    this.advCd = {};                   // Berater-Cooldowns (Monate)
    this.scenario = null;              // {id,name,minPop,minHappy,noCoal,deadlineYear,done}
    this.dirtyPower = true;
    this.dirtyCov = true;
    this.rand = mulberry(this.seed ^ 0x9e3779b9);
    this.lastBudget = null;

    this.genTerrain();
  }

  idx(x, y) { return y * this.w + x; }
  inMap(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  isAnchor(i) { return this.st[i] !== S_NONE && (this.anchor[i] === i || this.anchor[i] === -1); }
  isBld(s) { return !!(DEFS[s] && DEFS[s].bld); }

  // ---------- Kartengenerierung (Value-Noise) ----------
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
    // Zentrum garantiert bebaubar
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
  // Effektive Kosten (Brücken über Wasser kosten mehr)
  costAt(tool, x, y) {
    const def = DEFS[tool];
    if (!def) return 0;
    let c = def.cost;
    if ((tool === S_ROAD || tool === S_RAIL || tool === S_WIRE) &&
      this.inMap(x, y) && this.terr[this.idx(x, y)] === T_WATER) c *= BRIDGE_FACTOR;
    return c;
  }

  canPlace(tool, x, y) {
    const def = DEFS[tool];
    if (!def) return { ok: false, reason: 'Unbekanntes Werkzeug' };
    const size = def.size || 1;
    if (def.minPop && this.pop < def.minPop) return { ok: false, reason: 'Erst ab ' + def.minPop + ' Einwohnern!' };
    if (tool === S_COAL && this.scenario && this.scenario.noCoal)
      return { ok: false, reason: 'Im Szenario verboten: keine Kohlekraft!' };
    const overWater = tool === S_ROAD || tool === S_RAIL || tool === S_WIRE;
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) {
      const px = x + dx, py = y + dy;
      if (!this.inMap(px, py)) return { ok: false, reason: 'Außerhalb der Karte' };
      const i = this.idx(px, py);
      if (this.terr[i] === T_WATER && !overWater) return { ok: false, reason: 'Nicht auf Wasser baubar' };
      if (this.st[i] !== S_NONE) {
        if (this.st[i] === tool) return { ok: false, reason: 'schon vorhanden' };
        return { ok: false, reason: 'Feld ist belegt' };
      }
    }
    if (def.needsWaterAdj) {
      let adj = false;
      for (const [nx, ny] of [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]])
        if (this.inMap(nx, ny) && this.terr[this.idx(nx, ny)] === T_WATER) adj = true;
      if (!adj) return { ok: false, reason: 'Pumpwerk muss am Wasser stehen' };
    }
    const cost = this.costAt(tool, x, y);
    if (this.money < cost) return { ok: false, reason: 'Zu wenig Geld!' };
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
      if (this.terr[i] === T_TREE) this.terr[i] = T_GRASS; // Bäume werden gerodet
      this.st[i] = tool;
      this.lvl[i] = 0;
      this.anchor[i] = a;
      this.burn[i] = 0;
    }
    this.money -= chk.cost;
    this.dirtyPower = true; this.dirtyCov = true;
    return { ok: true, cost: chk.cost };
  }

  bulldoze(x, y) {
    if (!this.inMap(x, y)) return { ok: false, reason: 'Außerhalb der Karte' };
    let i = this.idx(x, y);
    if (this.st[i] === S_NONE) {
      if (this.terr[i] === T_TREE) {
        if (this.money < 1) return { ok: false, reason: 'Zu wenig Geld!' };
        this.terr[i] = T_GRASS; this.money -= 1;
        return { ok: true, cost: 1 };
      }
      return { ok: false, reason: 'Hier ist nichts' };
    }
    if (this.money < 1) return { ok: false, reason: 'Zu wenig Geld!' };
    const a = this.anchor[i] >= 0 ? this.anchor[i] : i;
    for (let j = 0; j < this.w * this.h; j++) {
      if (this.anchor[j] === a || j === a) {
        this.st[j] = S_NONE; this.lvl[j] = 0; this.anchor[j] = -1; this.burn[j] = 0; this.powered[j] = 0;
      }
    }
    this.money -= 1;
    this.dirtyPower = true; this.dirtyCov = true;
    return { ok: true, cost: 1 };
  }

  // Zerstörung durch Katastrophen (Anker-bewusst, ganze Gebäude)
  destroyTile(i) {
    if (this.st[i] === S_NONE) return;
    const a = this.anchor[i] >= 0 ? this.anchor[i] : i;
    for (let j = 0; j < this.w * this.h; j++) {
      if (this.anchor[j] === a || j === a) {
        this.st[j] = S_RUBBLE; this.lvl[j] = 0; this.anchor[j] = j; this.burn[j] = 0;
      }
    }
    this.dirtyPower = true; this.dirtyCov = true;
  }

  // ---------- Kredite ----------
  takeLoan() {
    this.debt += LOAN_STEP;
    this.money += LOAN_STEP;
    this.events.push({ type: 'info', msg: '🏦 Kredit über ' + LOAN_STEP + ' € aufgenommen (' + (LOAN_RATE * 100).toFixed(1) + '% Zins/Monat).' });
    return true;
  }
  repayLoan() {
    if (this.debt <= 0) return { ok: false, reason: 'Keine Schulden' };
    const amount = Math.min(LOAN_STEP, this.debt);
    if (this.money < amount) return { ok: false, reason: 'Zu wenig Geld zum Tilgen' };
    this.debt -= amount; this.money -= amount;
    this.events.push({ type: 'info', msg: '🏦 ' + amount + ' € Kredit getilgt. Restschuld: ' + this.debt + ' €.' });
    return { ok: true };
  }

  // ---------- Stromnetz: BFS von Kraftwerken durch leitende Felder ----------
  computePower() {
    const { w, h } = this;
    this.powered.fill(0);
    let supply = 0, need = 0;
    const queue = [];
    for (let i = 0; i < w * h; i++) {
      const s = this.st[i];
      if ((s === S_WIND || s === S_COAL) && this.isAnchor(i)) supply += DEFS[s].power;
      if (s === S_WIND || s === S_COAL) { queue.push(i); this.powered[i] = 1; }
      if (s >= S_RZONE && s <= S_IZONE && this.lvl[i] > 0) need += 1 + this.lvl[i];
      if (DEFS[s] && DEFS[s].drain && this.isAnchor(i)) need += DEFS[s].drain;
    }
    this.powerSupply = supply; this.powerNeed = need;
    // Straßen und Schienen leiten Strom mit (modern & intuitiv)
    const conducts = (i) => {
      const s = this.st[i];
      return s === S_ROAD || s === S_RAIL || s === S_WIRE || this.isBld(s);
    };
    let head = 0;
    while (head < queue.length) {
      const i = queue[head++];
      const x = i % w, y = (i / w) | 0;
      const nb = [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]];
      for (const [nx, ny] of nb) {
        if (!this.inMap(nx, ny)) continue;
        const j = this.idx(nx, ny);
        if (!this.powered[j] && conducts(j)) { this.powered[j] = 1; queue.push(j); }
      }
    }
    this.brownout = need > supply;
    if (this.brownout && supply > 0) {
      const ratio = supply / need;
      const rr = mulberry(this.seed + this.day + this.month * 31);
      for (let i = 0; i < w * h; i++) {
        if (this.powered[i] && this.st[i] !== S_WIND && this.st[i] !== S_COAL && rr() > ratio) this.powered[i] = 0;
      }
    } else if (supply === 0) {
      for (let i = 0; i < w * h; i++) {
        if (this.st[i] !== S_WIND && this.st[i] !== S_COAL) this.powered[i] = 0;
      }
    }
    this.dirtyPower = false;
  }

  // ---------- Anbindung: Straße ODER Schiene im Umkreis 3 ----------
  computeRoadAccess() {
    const { w, h } = this;
    this.roadOk.fill(0);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = this.idx(x, y);
      if (!this.isBld(this.st[i])) continue;
      let ok = 0;
      outer:
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > 3) continue;
        const nx = x + dx, ny = y + dy;
        if (!this.inMap(nx, ny)) continue;
        const s = this.st[this.idx(nx, ny)];
        if (s === S_ROAD || s === S_RAIL) { ok = 1; break outer; }
      }
      this.roadOk[i] = ok;
    }
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
    this.covHealth.fill(0); this.covPark.fill(0); this.covWater.fill(0);
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
        case S_WTOWER:   if (this.powered[i]) this.spread(this.covWater, x, y, DEFS[S_WTOWER].waterRange); break;
        case S_PUMP:     if (this.powered[i]) this.spread(this.covWater, x, y, DEFS[S_PUMP].waterRange); break;
      }
    }
    this.dirtyCov = false;
  }

  // ---------- Verschmutzung ----------
  computePollution() {
    const { w, h } = this;
    const src = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      if (this.st[i] === S_IZONE) src[i] = 14 * this.lvl[i];
      else if (this.st[i] === S_COAL) src[i] = 55;
      else if (this.st[i] === S_ROAD) src[i] = 2 + this.traffic[i] * 0.04;
      if (this.st[i] === S_PARK || this.terr[i] === T_TREE) src[i] = -6;
    }
    let cur = src;
    for (let pass = 0; pass < 2; pass++) {
      const next = new Float32Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let sum = 0, cnt = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (!this.inMap(nx, ny)) continue;
          sum += cur[this.idx(nx, ny)]; cnt++;
        }
        next[this.idx(x, y)] = sum / cnt * 1.35;
      }
      cur = next;
    }
    for (let i = 0; i < w * h; i++) this.poll[i] = Math.max(0, Math.min(100, cur[i]));
  }

  // ---------- Verkehr: entwickelte Zonen belasten Straßen im Umkreis 2 ----------
  computeTraffic() {
    const { w, h } = this;
    const t = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = this.idx(x, y);
      const s = this.st[i];
      if (s < S_RZONE || s > S_IZONE || this.lvl[i] === 0) continue;
      const load = this.lvl[i] * 7;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx, ny = y + dy;
        if (!this.inMap(nx, ny)) continue;
        const j = this.idx(nx, ny);
        if (this.st[j] === S_ROAD) t[j] += load / (1 + Math.abs(dx) + Math.abs(dy));
      }
    }
    for (let i = 0; i < w * h; i++) this.traffic[i] = Math.min(100, Math.round(t[i]));
  }

  // Stau in der Nachbarschaft einer Zone (0..100)
  trafficNear(x, y) {
    let m = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx, ny = y + dy;
      if (!this.inMap(nx, ny)) continue;
      const j = this.idx(nx, ny);
      if (this.st[j] === S_ROAD && this.traffic[j] > m) m = this.traffic[j];
    }
    return m;
  }

  // ---------- Landwert ----------
  computeLandValue() {
    const { w, h } = this;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = this.idx(x, y);
      let v = 35;
      if (this.waterNear[i]) v += 14;
      v += this.covPark[i] * 0.28;
      v += this.covPolice[i] * 0.06;
      v -= this.poll[i] * 0.5;
      v -= this.trafficNear(x, y) * 0.10;
      this.landv[i] = Math.max(0, Math.min(100, Math.round(v)));
    }
  }

  // ---------- Statistik ----------
  computeStats() {
    let pop = 0, cJobs = 0, iJobs = 0, casinos = 0, townhall = false;
    const n = this.w * this.h;
    for (let i = 0; i < n; i++) {
      if (this.st[i] === S_RZONE) pop += R_POP[this.lvl[i]];
      else if (this.st[i] === S_CZONE) cJobs += C_JOBS[this.lvl[i]];
      else if (this.st[i] === S_IZONE) iJobs += I_JOBS[this.lvl[i]];
      else if (this.st[i] === S_CASINO && this.powered[i]) casinos++;
      else if (this.st[i] === S_TOWNHALL && this.powered[i]) townhall = true;
    }
    this.pop = pop; this.cJobs = cJobs; this.iJobs = iJobs;
    this.jobs = cJobs + iJobs;
    this.casinos = casinos;

    const workers = pop * 0.6;
    const taxF = Math.max(0.2, 1.25 - this.taxRate / 12);
    // Rückkopplung > 1, damit die Stadt bis zur Zonen-Kapazität wachsen kann
    this.demandR = Math.max(-1, Math.min(1, (this.jobs * 1.6 + 60 - pop) / 140)) * taxF;
    this.demandC = Math.max(-1, Math.min(1, (workers * 0.8 - cJobs) / 100)) * taxF;
    this.demandI = Math.max(-1, Math.min(1, (workers * 0.9 + 20 - iJobs) / 100)) * taxF;

    // Zufriedenheit
    let happy = 55;
    happy -= Math.max(0, this.taxRate - 9) * 2.5;
    happy += Math.min(8, Math.max(0, 9 - this.taxRate));
    if (townhall) happy += 3;
    if (casinos > 0) happy -= 2;
    if (pop > 0) {
      let covP = 0, covS = 0, covH = 0, covG = 0, covW = 0, pol = 0, jam = 0, cnt = 0;
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
        const i = this.idx(x, y);
        if (this.st[i] === S_RZONE && this.lvl[i] > 0) {
          covP += this.covPolice[i]; covS += this.covSchool[i];
          covH += this.covHealth[i]; covG += this.covPark[i];
          covW += this.covWater[i];
          pol += this.poll[i]; jam += this.trafficNear(x, y); cnt++;
        }
      }
      if (cnt > 0) {
        happy += (covP / cnt) * 0.08 + (covS / cnt) * 0.08 + (covH / cnt) * 0.07 + (covG / cnt) * 0.10 + (covW / cnt) * 0.04;
        happy -= (pol / cnt) * 0.35;
        happy -= Math.max(0, jam / cnt - 50) * 0.12;
        this.avgPollR = pol / cnt;
        this.avgFireCovR = 0; // wird unten nicht gebraucht, Berater nutzt Stichprobe
      }
      const unemployment = Math.max(0, (workers - this.jobs) / Math.max(1, workers));
      happy -= unemployment * 30;
      if (this.brownout) happy -= 8;
    }
    this.happiness = Math.max(0, Math.min(100, Math.round(happy)));
  }

  // ---------- Wachstum (pro Tag) ----------
  growthTick() {
    const n = this.w * this.h;
    const zones = [];
    for (let i = 0; i < n; i++) if (this.st[i] >= S_RZONE && this.st[i] <= S_IZONE) zones.push(i);
    if (zones.length === 0) return;
    const tries = Math.max(4, Math.round(zones.length * 0.10));
    const happyF = 0.4 + this.happiness / 100 * 0.9;
    for (let k = 0; k < tries; k++) {
      const i = zones[(this.rand() * zones.length) | 0];
      const s = this.st[i];
      const x = i % this.w, y = (i / this.w) | 0;
      const demand = s === S_RZONE ? this.demandR : s === S_CZONE ? this.demandC : this.demandI;
      const okInfra = this.powered[i] && this.roadOk[i];
      if (okInfra && demand > 0) {
        let p = demand * 0.55 * happyF;
        if (s === S_RZONE && this.poll[i] > 30) p *= 0.35;
        if (s === S_RZONE) p *= 0.6 + this.landv[i] / 100 * 0.8;  // Landwert treibt Wohnwachstum
        if (s === S_RZONE) p *= 1 + this.covPark[i] / 250;
        if (this.trafficNear(x, y) > 75) p *= 0.55;                // Stau bremst
        if (this.lvl[i] >= 3) p *= 0.4;
        // Ohne Wasserversorgung wachsen Zonen nur bis Stufe 2
        const maxLvl = this.covWater[i] >= 20 ? 4 : 2;
        if (this.rand() < p && this.lvl[i] < maxLvl) this.lvl[i]++;
      } else if ((!okInfra && this.lvl[i] > 0 && this.rand() < 0.25) ||
                 (demand < -0.35 && this.lvl[i] > 0 && this.rand() < 0.12)) {
        this.lvl[i]--;
      }
    }
  }

  // ---------- Brände ----------
  igniteRandom() {
    const n = this.w * this.h;
    const targets = [];
    for (let i = 0; i < n; i++) {
      const s = this.st[i];
      if ((s >= S_RZONE && s <= S_IZONE && this.lvl[i] > 0) || s === S_PARK) {
        if (this.covFire[i] < 40) targets.push(i);
      }
    }
    if (targets.length === 0) return false;
    const i = targets[(this.rand() * targets.length) | 0];
    this.burn[i] = 14;
    this.events.push({ type: 'bad', msg: '🔥 Feuer ausgebrochen! Feuerwehr-Abdeckung fehlt.', x: i % this.w, y: (i / this.w) | 0 });
    return true;
  }

  fireTick() {
    const { w, h } = this;
    const n = w * h;
    for (let i = 0; i < n; i++) {
      if (this.burn[i] === 0) continue;
      if (this.covFire[i] > 30 && this.rand() < 0.45) { this.burn[i] = 0; continue; }
      this.burn[i]--;
      if (this.burn[i] === 0) { this.destroyTile(i); continue; }
      if (this.rand() < 0.2) {
        const x = i % w, y = (i / w) | 0;
        const nb = [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]];
        const [nx, ny] = nb[(this.rand() * 4) | 0];
        if (this.inMap(nx, ny)) {
          const j = this.idx(nx, ny);
          const s = this.st[j];
          const flammable = (DEFS[s] && DEFS[s].flam) || this.terr[j] === T_TREE;
          if (flammable && this.burn[j] === 0 && this.covFire[j] < 55) {
            if (this.terr[j] === T_TREE && s === S_NONE) { this.terr[j] = T_GRASS; }
            else this.burn[j] = 12;
          }
        }
      }
    }
  }

  // ---------- Katastrophen: Tornado, Hochwasser, UFO ----------
  spawnTornado() {
    const edge = (this.rand() * 4) | 0;
    const t = { type: 'tornado', ttl: 40 + (this.rand() * 30 | 0) };
    if (edge === 0) { t.x = this.rand() * this.w; t.y = 0; t.vx = this.rand() - 0.5; t.vy = 0.4; }
    else if (edge === 1) { t.x = this.w - 1; t.y = this.rand() * this.h; t.vx = -0.4; t.vy = this.rand() - 0.5; }
    else if (edge === 2) { t.x = this.rand() * this.w; t.y = this.h - 1; t.vx = this.rand() - 0.5; t.vy = -0.4; }
    else { t.x = 0; t.y = this.rand() * this.h; t.vx = 0.4; t.vy = this.rand() - 0.5; }
    this.actors.push(t);
    this.events.push({ type: 'bad', msg: '🌪️ Tornado-Warnung! Ein Wirbelsturm zieht über das Land.', x: t.x | 0, y: t.y | 0 });
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
        this.floodT[i] = 10 + (this.rand() * 10 | 0);
        if (this.st[i] !== S_NONE && this.st[i] !== S_RUBBLE && this.rand() < 0.4) { this.destroyTile(i); hit++; }
      }
    }
    this.events.push({ type: 'bad', msg: '🌊 Hochwasser am Ufer!' + (hit ? ' ' + hit + ' Gebäude zerstört.' : ''), x: cx, y: cy });
  }

  spawnUfo() {
    this.actors.push({
      type: 'ufo', x: -2, y: this.rand() * this.h * 0.6 + this.h * 0.2,
      tx: this.w / 2, ty: this.h / 2, ttl: 120, beam: 0,
    });
    this.events.push({ type: 'bad', msg: '👽 Ein UFO wurde über der Stadt gesichtet!?' });
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
          if (this.terr[i] === T_TREE) this.terr[i] = T_GRASS;
          if (this.st[i] !== S_NONE && this.st[i] !== S_RUBBLE && this.rand() < 0.6) this.destroyTile(i);
        }
      } else if (a.type === 'ufo') {
        a.ttl--;
        if (a.beam > 0) {
          a.beam--;
          if (a.beam === 5) { // Strahl zündet
            const tx = Math.round(a.x), ty = Math.round(a.y) + 1;
            if (this.inMap(tx, ty)) {
              const i = this.idx(tx, ty);
              if (DEFS[this.st[i]] && DEFS[this.st[i]].flam) this.burn[i] = 12;
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
    // Hochwasser abklingen lassen
    for (let i = 0; i < w * h; i++) if (this.floodT[i] > 0) this.floodT[i]--;
  }

  // ---------- Berater ----------
  checkAdvisors() {
    for (const k in this.advCd) if (this.advCd[k] > 0) this.advCd[k]--;
    const say = (k, msg) => {
      if (!this.advCd[k]) {
        this.advCd[k] = 8;
        this.events.push({ type: 'advisor', adv: k, msg });
      }
    };
    if (this.lastBudget && this.lastBudget.net < 0 && this.money < 3000)
      say('finance', 'Die Kasse schrumpft! Erhöhe die Steuern, tilge nichts und überdenke teure Gebäude — oder nimm einen Kredit auf (📒 Budget).');
    if (this.brownout)
      say('power', 'Das Stromnetz ist überlastet! Wir brauchen mehr Kraftwerke, sonst fallen Häuser und Betriebe aus.');
    if (this.avgPollR > 32)
      say('env', 'Die Luft in den Wohngebieten ist schlecht! Mehr Parks, Industrie weiter weg von Wohnungen — und Kohlekraft meiden.');
    if (this.pop > 250) {
      let cnt = 0, cov = 0;
      for (let i = 0; i < this.w * this.h; i++)
        if (this.st[i] === S_RZONE && this.lvl[i] > 0) { cov += this.covFire[i]; cnt++; }
      if (cnt > 0 && cov / cnt < 22)
        say('fire', 'Weite Teile der Stadt sind ohne Feuerwehr! Ein Brand könnte sich ungehindert ausbreiten.');
    }
    if (this.pop > 150) {
      let dry = 0;
      for (let i = 0; i < this.w * this.h; i++)
        if (this.st[i] >= S_RZONE && this.st[i] <= S_IZONE && this.lvl[i] >= 2 && this.covWater[i] < 20) dry++;
      if (dry > 12)
        say('water', 'Ohne Wasserversorgung wachsen Zonen nicht über Stufe 2 hinaus! Baue Wassertürme oder ein Pumpwerk am Fluss.');
    }
  }

  // ---------- Szenario ----------
  checkScenario() {
    const sc = this.scenario;
    if (!sc || sc.done) return;
    const won = this.pop >= (sc.minPop || 0) && this.happiness >= (sc.minHappy || 0);
    if (won) {
      sc.done = true; sc.won = true;
      this.events.push({ type: 'milestone', msg: '🏆 SZENARIO GESCHAFFT: ' + sc.name + '! Du kannst frei weiterspielen.' });
    } else if (this.year > sc.deadlineYear || (this.year === sc.deadlineYear && this.month >= 11)) {
      sc.done = true; sc.won = false;
      this.events.push({ type: 'bad', msg: '⌛ Szenario-Frist abgelaufen: „' + sc.name + '“ nicht geschafft. Spiel läuft im freien Modus weiter.' });
    }
  }

  // ---------- Monatsabschluss ----------
  monthlyBudget() {
    const n = this.w * this.h;
    let upkeep = 0;
    for (let i = 0; i < n; i++) {
      const s = this.st[i];
      if (s !== S_NONE && DEFS[s] && this.isAnchor(i)) upkeep += DEFS[s].upkeep;
    }
    const income = Math.round((this.pop * 1.0 + this.jobs * 0.5) * this.taxRate / 9);
    const casinoIncome = (this.casinos || 0) * DEFS[S_CASINO].income;
    const interest = Math.round(this.debt * LOAN_RATE);
    upkeep = Math.round(upkeep);
    this.money += income + casinoIncome - upkeep - interest;
    this.lastBudget = { income, casino: casinoIncome, upkeep, interest, net: income + casinoIncome - upkeep - interest };
    if (this.money < 0 && this.lastBudget.net < 0) {
      this.events.push({ type: 'bad', msg: '💸 Die Stadtkasse ist leer! Steuern erhöhen, Unterhalt senken oder Kredit aufnehmen.' });
    }
    // Verlauf für Statistik-Graphen
    this.history.push({ p: this.pop, m: Math.round(this.money), h: this.happiness, j: this.jobs });
    if (this.history.length > 480) this.history.shift();
    // Meilensteine
    const ms = [
      [100, '🏘️ Meilenstein: Dorf! (100 Einwohner) Bonus: 1.000 €'],
      [500, '🏙️ Meilenstein: Kleinstadt! (500 Einwohner) Bonus: 2.500 € — Rathaus freigeschaltet!'],
      [1500, '🌆 Meilenstein: Großstadt! (1.500 Einwohner) Bonus: 5.000 € — Stadion freigeschaltet!'],
      [2500, '🏛️ 2.500 Einwohner! Bonus: 7.500 € — Denkmal freigeschaltet!'],
      [4000, '🌃 Meilenstein: Metropole! (4.000 Einwohner) Bonus: 10.000 € — Casino freigeschaltet!'],
    ];
    const bonus = [1000, 2500, 5000, 7500, 10000];
    ms.forEach(([lim, msg], k) => {
      if (this.pop >= lim && !this.milestones[lim]) {
        this.milestones[lim] = true;
        this.money += bonus[k];
        this.events.push({ type: 'milestone', msg });
      }
    });
    // Katastrophen
    if (this.disasters && this.pop > 150) {
      if (this.rand() < 0.10) this.igniteRandom();
      if (this.rand() < 0.030) this.spawnTornado();
      if (this.rand() < 0.030) this.spawnFlood();
      if (this.year >= 1993 && this.rand() < 0.012) this.spawnUfo();
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
    if (this.dirtyPower || this.day % 5 === 0) this.computePower();
    if (this.dirtyCov) this.computeCoverage();
    if (this.day % 7 === 0) this.computePollution();
    if (this.day % 7 === 3) this.computeLandValue();
    if (this.day % 7 === 5) this.computeTraffic();
    this.computeRoadAccess();
    this.growthTick(); // nutzt die Nachfrage vom Vortag
    this.fireTick();
    this.actorTick();
    this.computeStats();
    if (this.sandbox) this.money = 999999999;
  }

  dateStr() { return this.day + '. ' + MONTHS[this.month] + ' ' + this.year; }

  // ---------- Speichern / Laden ----------
  serialize() {
    return JSON.stringify({
      v: 3, w: this.w, h: this.h, seed: this.seed,
      terr: Array.from(this.terr), st: Array.from(this.st), lvl: Array.from(this.lvl),
      anchor: Array.from(this.anchor), burn: Array.from(this.burn), floodT: Array.from(this.floodT),
      money: this.money, debt: this.debt, taxRate: this.taxRate,
      day: this.day, month: this.month, year: this.year,
      disasters: this.disasters, sandbox: this.sandbox,
      milestones: this.milestones, lastBudget: this.lastBudget,
      actors: this.actors, history: this.history, advCd: this.advCd,
      scenario: this.scenario,
    });
  }

  static load(json) {
    const d = JSON.parse(json);
    const s = new Sim(d.w, d.h, d.seed);
    s.terr.set(d.terr); s.st.set(d.st); s.lvl.set(d.lvl);
    s.anchor.set(d.anchor); s.burn.set(d.burn);
    if (d.floodT) s.floodT.set(d.floodT);
    s.money = d.money; s.taxRate = d.taxRate;
    s.debt = d.debt || 0;
    s.day = d.day; s.month = d.month; s.year = d.year;
    s.disasters = d.disasters !== false;
    s.sandbox = !!d.sandbox;
    s.milestones = d.milestones || {};
    s.lastBudget = d.lastBudget || null;
    s.actors = d.actors || [];
    s.history = d.history || [];
    s.advCd = d.advCd || {};
    s.scenario = d.scenario || null;
    s.computeWaterNear();
    s.dirtyPower = true; s.dirtyCov = true;
    s.computePower(); s.computeCoverage(); s.computeRoadAccess();
    s.computePollution(); s.computeTraffic(); s.computeLandValue(); s.computeStats();
    return s;
  }
}
