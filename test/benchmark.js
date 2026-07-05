/* ============================================================
 * Balancing-Benchmark: Wachstumskurven für Referenzstädte.
 * Nach Änderungen an balance.js ausführen (npm run benchmark)
 * und die Kurven mit dem letzten Stand vergleichen.
 * ============================================================ */
'use strict';
const M = require('./load-sim.js');
const { Sim } = M;
const { S_ROAD, S_WIRE, S_RZONE, S_CZONE, S_IZONE, S_COAL, S_WTOWER, S_NONE } = M;

function buildRefCity(size, seed, opts) {
  const s = new Sim(size, size, seed);
  s.money = 200000;
  s.disasters = opts.disasters !== false;
  const c = size >> 1, r = opts.radius || 10;
  for (let y = c - r; y <= c + r; y += 4) for (let x = c - r; x <= c + r; x++) s.place(S_ROAD, x, y);
  for (let y = c - r; y <= c + r; y++) s.place(S_ROAD, c, y);
  for (let y = c - r; y <= c + r; y++) for (let x = c - r; x <= c + r; x++) {
    if (s.st[s.idx(x, y)] !== S_NONE) continue;
    const q = (x * 3 + y) % 7;
    s.place(q < 3 ? S_RZONE : q < 5 ? S_CZONE : S_IZONE, x, y);
  }
  for (let x = c - r; x <= c + r; x++) if (s.place(S_COAL, x, c - r - 3).ok) break;
  // redundante Windräder: ein einzelner Kraftwerks-Verlust ist nicht fatal
  let wind = 0;
  for (let x = c - r; x <= c + r && wind < 5; x++) if (s.place(M.S_WIND, x, c + r + 2).ok) wind++;
  for (let x = c - r; x <= c + r; x++) s.place(S_WIRE, x, c - r - 1);
  if (opts.water !== false) {
    for (let y = c - r + 2; y <= c + r; y += 7) for (let x = c - r + 2; x <= c + r; x += 7) {
      if (s.st[s.idx(x, y)] >= S_RZONE && s.st[s.idx(x, y)] <= S_IZONE) s.bulldoze(x, y);
      s.place(S_WTOWER, x, y);
    }
  }
  return s;
}

function run(label, s, years) {
  const rows = [];
  for (let y = 0; y < years; y++) {
    for (let t = 0; t < 360; t++) { s.tick(); s.events.length = 0; }
    rows.push({ Jahr: s.year, Pop: s.pop, Jobs: s.jobs, Geld: Math.round(s.money), Glück: s.happiness + '%' });
  }
  console.log('\n=== ' + label + ' ===');
  console.table(rows);
  return s;
}

console.log('RETROPOLIS Balancing-Benchmark');
console.log('BAL.DEMAND:', JSON.stringify(BAL.DEMAND));

run('Kleinstadt 48×48 (mit Wasser, ohne Katastrophen)', buildRefCity(48, 1001, { radius: 8, disasters: false }), 5);
run('Standardstadt 64×64 (mit Wasser + Katastrophen)', buildRefCity(64, 12345, { radius: 10 }), 6);
run('Ohne Wasserversorgung (sollte bei Stufe 2 stagnieren)', buildRefCity(64, 12345, { radius: 10, water: false, disasters: false }), 4);
