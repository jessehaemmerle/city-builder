/* ============================================================
 * RETROPOLIS — Simulation
 * Terrain, Stromnetz, Straßenanbindung, RCI-Wachstum, Budget,
 * Zufriedenheit, Abdeckung städtischer Dienste, Brände.
 * ============================================================ */
'use strict';

// Terrain-Typen
const T_GRASS = 0, T_WATER = 1, T_SAND = 2, T_TREE = 3;

// Strukturen
const S_NONE = 0, S_ROAD = 1, S_WIRE = 2, S_RZONE = 3, S_CZONE = 4, S_IZONE = 5,
  S_PARK = 6, S_POLICE = 7, S_FIREDEP = 8, S_SCHOOL = 9, S_HOSPITAL = 10,
  S_WIND = 11, S_COAL = 12, S_STADIUM = 13, S_RUBBLE = 14;

// Katalog: Kosten, Unterhalt, Strombedarf/-erzeugung, Größe
const DEFS = {
  [S_ROAD]:     { name: 'Straße',          cost: 10,   upkeep: 0.2,  size: 1 },
  [S_WIRE]:     { name: 'Stromleitung',    cost: 5,    upkeep: 0.1,  size: 1 },
  [S_RZONE]:    { name: 'Wohngebiet',      cost: 40,   upkeep: 0,    size: 1 },
  [S_CZONE]:    { name: 'Gewerbegebiet',   cost: 40,   upkeep: 0,    size: 1 },
  [S_IZONE]:    { name: 'Industriegebiet', cost: 60,   upkeep: 0,    size: 1 },
  [S_PARK]:     { name: 'Park',            cost: 150,  upkeep: 3,    size: 1 },
  [S_POLICE]:   { name: 'Polizeiwache',    cost: 500,  upkeep: 30,   size: 1, drain: 2 },
  [S_FIREDEP]:  { name: 'Feuerwache',      cost: 500,  upkeep: 25,   size: 1, drain: 2 },
  [S_SCHOOL]:   { name: 'Schule',          cost: 400,  upkeep: 20,   size: 1, drain: 2 },
  [S_HOSPITAL]: { name: 'Krankenhaus',     cost: 600,  upkeep: 35,   size: 1, drain: 3 },
  [S_WIND]:     { name: 'Windrad',         cost: 600,  upkeep: 5,    size: 1, power: 30 },
  [S_COAL]:     { name: 'Kohlekraftwerk',  cost: 3000, upkeep: 100,  size: 2, power: 180 },
  [S_STADIUM]:  { name: 'Stadion',         cost: 3000, upkeep: 60,   size: 2, drain: 5, minPop: 1500 },
  [S_RUBBLE]:   { name: 'Trümmer',         cost: 0,    upkeep: 0,    size: 1 },
};

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
    this.covPolice = new Uint8Array(n);
    this.covFire = new Uint8Array(n);
    this.covSchool = new Uint8Array(n);
    this.covHealth = new Uint8Array(n);
    this.covPark = new Uint8Array(n);
    this.burn = new Uint8Array(n);     // Brand-Timer

    this.money = 25000;
    this.taxRate = 9;
    this.day = 1; this.month = 0; this.year = 1990;
    this.pop = 0; this.jobs = 0;
    this.happiness = 50;
    this.demandR = 0.5; this.demandC = 0.2; this.demandI = 0.4;
    this.powerSupply = 0; this.powerNeed = 0;
    this.disasters = true;
    this.milestones = {};
    this.events = [];                  // Meldungen für die UI
    this.dirtyPower = true;
    this.dirtyCov = true;
    this.rand = mulberry(this.seed ^ 0x9e3779b9);
    this.lastBudget = null;

    this.genTerrain();
  }

  idx(x, y) { return y * this.w + x; }
  inMap(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }

  // ---------- Kartengenerierung (Value-Noise) ----------
  genTerrain() {
    const { w, h } = this;
    const r = mulberry(this.seed);
    const G = 9; // Gitter für Noise
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
      // Fluss quer über die Karte
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
  }

  // ---------- Bauen ----------
  // gibt {ok, reason} zurück, ohne zu bauen
  canPlace(tool, x, y) {
    const def = DEFS[tool];
    if (!def) return { ok: false, reason: 'Unbekanntes Werkzeug' };
    const size = def.size || 1;
    if (def.minPop && this.pop < def.minPop) return { ok: false, reason: 'Erst ab ' + def.minPop + ' Einwohnern!' };
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) {
      const px = x + dx, py = y + dy;
      if (!this.inMap(px, py)) return { ok: false, reason: 'Außerhalb der Karte' };
      const i = this.idx(px, py);
      if (this.terr[i] === T_WATER) return { ok: false, reason: 'Nicht auf Wasser baubar' };
      if (this.st[i] !== S_NONE) {
        if (tool === S_ROAD && this.st[i] === S_ROAD) return { ok: false, reason: 'schon vorhanden' };
        return { ok: false, reason: 'Feld ist belegt' };
      }
    }
    if (this.money < def.cost) return { ok: false, reason: 'Zu wenig Geld!' };
    return { ok: true };
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
    this.money -= def.cost;
    this.dirtyPower = true; this.dirtyCov = true;
    return { ok: true, cost: def.cost };
  }

  bulldoze(x, y) {
    if (!this.inMap(x, y)) return { ok: false, reason: 'Außerhalb der Karte' };
    let i = this.idx(x, y);
    if (this.st[i] === S_NONE) {
      if (this.terr[i] === T_TREE) { // Bäume fällen
        if (this.money < 1) return { ok: false, reason: 'Zu wenig Geld!' };
        this.terr[i] = T_GRASS; this.money -= 1;
        return { ok: true, cost: 1 };
      }
      return { ok: false, reason: 'Hier ist nichts' };
    }
    if (this.money < 1) return { ok: false, reason: 'Zu wenig Geld!' };
    // ganzes Gebäude (auch 2x2) entfernen
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

  isAnchor(i) { return this.st[i] !== S_NONE && (this.anchor[i] === i || this.anchor[i] === -1); }

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
    // Straßen leiten Strom mit (modern & intuitiv), ebenso Leitungen und Gebäude
    const conducts = (i) => {
      const s = this.st[i];
      return s === S_ROAD || s === S_WIRE || (s >= S_RZONE && s <= S_STADIUM);
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
    // Unterversorgung: Brownout — Verbraucher fallen anteilig aus
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

  // ---------- Straßenanbindung: Zone braucht Straße im Umkreis 3 ----------
  computeRoadAccess() {
    const { w, h } = this;
    this.roadOk.fill(0);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = this.idx(x, y);
      const s = this.st[i];
      if (s < S_RZONE || s > S_STADIUM || s === S_WIRE) continue;
      let ok = 0;
      outer:
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > 3) continue;
        const nx = x + dx, ny = y + dy;
        if (this.inMap(nx, ny) && this.st[this.idx(nx, ny)] === S_ROAD) { ok = 1; break outer; }
      }
      this.roadOk[i] = ok;
    }
  }

  // ---------- Abdeckung der Dienste (Radius um Gebäude) ----------
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
      else if (this.st[i] === S_ROAD) src[i] = 2;
      if (this.st[i] === S_PARK || this.terr[i] === T_TREE) src[i] = -6;
    }
    // 2 Diffusions-Durchgänge (Box-Blur)
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

  // ---------- Statistik ----------
  computeStats() {
    let pop = 0, cJobs = 0, iJobs = 0;
    const n = this.w * this.h;
    for (let i = 0; i < n; i++) {
      if (this.st[i] === S_RZONE) pop += R_POP[this.lvl[i]];
      else if (this.st[i] === S_CZONE) cJobs += C_JOBS[this.lvl[i]];
      else if (this.st[i] === S_IZONE) iJobs += I_JOBS[this.lvl[i]];
    }
    this.pop = pop; this.cJobs = cJobs; this.iJobs = iJobs;
    this.jobs = cJobs + iJobs;

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
    if (pop > 0) {
      let covP = 0, covS = 0, covH = 0, covG = 0, pol = 0, cnt = 0;
      for (let i = 0; i < n; i++) {
        if (this.st[i] === S_RZONE && this.lvl[i] > 0) {
          covP += this.covPolice[i]; covS += this.covSchool[i];
          covH += this.covHealth[i]; covG += this.covPark[i];
          pol += this.poll[i]; cnt++;
        }
      }
      if (cnt > 0) {
        happy += (covP / cnt) * 0.08 + (covS / cnt) * 0.08 + (covH / cnt) * 0.07 + (covG / cnt) * 0.10;
        happy -= (pol / cnt) * 0.35;
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
      const demand = s === S_RZONE ? this.demandR : s === S_CZONE ? this.demandC : this.demandI;
      const okInfra = this.powered[i] && this.roadOk[i];
      if (okInfra && demand > 0) {
        let p = demand * 0.55 * happyF;
        if (s === S_RZONE && this.poll[i] > 30) p *= 0.35;      // Wohnen mag keine Verschmutzung
        if (s === S_RZONE) p *= 1 + this.covPark[i] / 250;
        if (this.lvl[i] >= 3) p *= 0.4;                         // hohe Stufen wachsen langsamer
        if (this.rand() < p && this.lvl[i] < 4) this.lvl[i]++;
      } else if ((!okInfra && this.lvl[i] > 0 && this.rand() < 0.25) ||
                 (demand < -0.35 && this.lvl[i] > 0 && this.rand() < 0.12)) {
        this.lvl[i]--; // Verfall ohne Strom/Straße oder bei stark negativer Nachfrage
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
      // Feuerwache in der Nähe löscht schnell
      if (this.covFire[i] > 30 && this.rand() < 0.45) { this.burn[i] = 0; continue; }
      this.burn[i]--;
      if (this.burn[i] === 0) {
        // niedergebrannt
        const a = this.anchor[i] >= 0 ? this.anchor[i] : i;
        for (let j = 0; j < n; j++) {
          if (this.anchor[j] === a || j === a) { this.st[j] = S_RUBBLE; this.lvl[j] = 0; this.anchor[j] = j; }
        }
        this.dirtyPower = true; this.dirtyCov = true;
        continue;
      }
      // Ausbreitung
      if (this.rand() < 0.2) {
        const x = i % w, y = (i / w) | 0;
        const nb = [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]];
        const [nx, ny] = nb[(this.rand() * 4) | 0];
        if (this.inMap(nx, ny)) {
          const j = this.idx(nx, ny);
          const s = this.st[j];
          const flammable = (s >= S_RZONE && s <= S_HOSPITAL && s !== S_WIRE) || this.terr[j] === T_TREE;
          if (flammable && this.burn[j] === 0 && this.covFire[j] < 55) {
            if (this.terr[j] === T_TREE && s === S_NONE) { this.terr[j] = T_GRASS; }
            else this.burn[j] = 12;
          }
        }
      }
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
    upkeep = Math.round(upkeep);
    this.money += income - upkeep;
    this.lastBudget = { income, upkeep, net: income - upkeep };
    if (this.money < 0 && income - upkeep < 0) {
      this.events.push({ type: 'bad', msg: '💸 Die Stadtkasse ist leer! Steuern erhöhen oder Unterhalt senken.' });
    }
    // Meilensteine
    const ms = [
      [100, '🏘️ Meilenstein: Dorf! (100 Einwohner) Bonus: 1.000 €'],
      [500, '🏙️ Meilenstein: Kleinstadt! (500 Einwohner) Bonus: 2.500 €'],
      [1500, '🌆 Meilenstein: Großstadt! (1.500 Einwohner) Bonus: 5.000 € — Stadion freigeschaltet!'],
      [4000, '🌃 Meilenstein: Metropole! (4.000 Einwohner) Bonus: 10.000 €'],
    ];
    const bonus = [1000, 2500, 5000, 10000];
    ms.forEach(([lim, msg], k) => {
      if (this.pop >= lim && !this.milestones[lim]) {
        this.milestones[lim] = true;
        this.money += bonus[k];
        this.events.push({ type: 'milestone', msg });
      }
    });
  }

  // ---------- Ein Simulationstag ----------
  tick() {
    this.day++;
    if (this.day > 30) {
      this.day = 1; this.month++;
      if (this.month > 11) { this.month = 0; this.year++; }
      this.monthlyBudget();
      if (this.disasters && this.pop > 150 && this.rand() < 0.10) this.igniteRandom();
    }
    if (this.dirtyPower || this.day % 5 === 0) this.computePower();
    if (this.dirtyCov) this.computeCoverage();
    if (this.day % 7 === 0) this.computePollution();
    this.computeRoadAccess();
    this.growthTick(); // nutzt die Nachfrage vom Vortag
    this.fireTick();
    this.computeStats();
  }

  dateStr() { return this.day + '. ' + MONTHS[this.month] + ' ' + this.year; }

  // ---------- Speichern / Laden ----------
  serialize() {
    return JSON.stringify({
      v: 2, w: this.w, h: this.h, seed: this.seed,
      terr: Array.from(this.terr), st: Array.from(this.st), lvl: Array.from(this.lvl),
      anchor: Array.from(this.anchor), burn: Array.from(this.burn),
      money: this.money, taxRate: this.taxRate,
      day: this.day, month: this.month, year: this.year,
      disasters: this.disasters, milestones: this.milestones,
      lastBudget: this.lastBudget,
    });
  }

  static load(json) {
    const d = JSON.parse(json);
    const s = new Sim(d.w, d.h, d.seed);
    s.terr.set(d.terr); s.st.set(d.st); s.lvl.set(d.lvl);
    s.anchor.set(d.anchor); s.burn.set(d.burn);
    s.money = d.money; s.taxRate = d.taxRate;
    s.day = d.day; s.month = d.month; s.year = d.year;
    s.disasters = d.disasters !== false;
    s.milestones = d.milestones || {};
    s.lastBudget = d.lastBudget || null;
    s.dirtyPower = true; s.dirtyCov = true;
    s.computePower(); s.computeCoverage(); s.computeRoadAccess();
    s.computePollution(); s.computeStats();
    return s;
  }
}
