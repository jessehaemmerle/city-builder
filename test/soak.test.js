/* ============================================================
 * Soak-Test: 10 Spieljahre auf einer Referenzstadt.
 * Prüft: stabiles Wachstum bis zur Großstadt, keine NaN,
 * Meilensteine, Save/Load-Treue, Katastrophen treten auf.
 * ============================================================ */
'use strict';
const M = require('./load-sim.js');
const { Sim } = M;
const { S_ROAD, S_WIRE, S_RZONE, S_CZONE, S_IZONE, S_PARK, S_POLICE, S_FIREDEP,
  S_SCHOOL, S_HOSPITAL, S_COAL, S_WIND, S_WTOWER, S_STADIUM, S_NONE } = M;

let fail = 0;
const check = (name, cond) => {
  console.log((cond ? '✅ ' : '❌ ') + name);
  if (!cond) fail++;
};

const sim = new Sim(64, 64, 12345);
sim.money = 150000;

// Stadtraster
for (let y = 16; y <= 48; y += 4) for (let x = 14; x <= 50; x++) sim.place(S_ROAD, x, y);
for (let y = 16; y <= 48; y++) sim.place(S_ROAD, 32, y);
for (let y = 17; y <= 47; y++) {
  if (y % 4 === 0) continue;
  for (let x = 15; x <= 49; x++) {
    if (Math.abs(x - 32) < 2) continue;
    const band = Math.floor((y - 16) / 4);
    const s = band % 3 === 0 ? S_RZONE : band % 3 === 1 ? (x < 32 ? S_CZONE : S_RZONE) : (x > 40 ? S_IZONE : S_RZONE);
    sim.place(s, x, y);
  }
}
// Energie
let coals = 0;
for (let x = 14; x <= 48 && coals < 2; x++) {
  if (sim.place(S_COAL, x, 14).ok) { coals++; x += 2; }
}
check('2 Kohlekraftwerke platziert', coals === 2);
let wind = 0;
for (let x = 14; x <= 50 && wind < 3; x++) if (sim.place(S_WIND, x, 13).ok) wind++;
// Dienste
function placeService(s, fromX, y) {
  for (let x = fromX; x <= 49; x++) {
    const i = sim.idx(x, y);
    if (sim.st[i] >= S_RZONE && sim.st[i] <= S_IZONE) sim.bulldoze(x, y);
    if (sim.place(s, x, y).ok) return x;
  }
  return -1;
}
placeService(S_POLICE, 28, 17); placeService(S_FIREDEP, 34, 17);
placeService(S_SCHOOL, 28, 21); placeService(S_HOSPITAL, 34, 21);
placeService(S_PARK, 28, 25); placeService(S_PARK, 34, 25);
// Wasser
let wt = 0;
for (let y = 18; y <= 46; y += 9) for (let x = 16; x <= 48; x += 9) {
  if (sim.st[sim.idx(x, y)] >= S_RZONE && sim.st[sim.idx(x, y)] <= S_IZONE) sim.bulldoze(x, y);
  if (sim.place(S_WTOWER, x, y).ok) wt++;
}
check('Wassertürme verteilt (' + wt + ')', wt >= 6);

let maxPop = 0, disasters = 0, milestones = 0;
for (let t = 0; t < 3600; t++) {
  sim.tick();
  maxPop = Math.max(maxPop, sim.pop);
  while (sim.events.length) {
    const e = sim.events.shift();
    if (e.type === 'bad' && e.key && e.key.startsWith('ev.') && e.key !== 'ev.broke' && !e.key.startsWith('ev.scen')) disasters++;
    if (e.type === 'milestone' && e.key && e.key.startsWith('ev.ms')) milestones++;
  }
  if (!isFinite(sim.money) || !isFinite(sim.pop)) { check('Kein NaN im Zustand', false); process.exit(1); }
  if (t % 720 === 0) {
    console.log(`   Jahr ${sim.year}: Pop=${sim.pop} Jobs=${sim.jobs} Geld=${Math.round(sim.money)} Glück=${sim.happiness}% Strom=${sim.powerNeed}/${sim.powerSupply}`);
  }
}
console.log(`   Ende: Pop=${sim.pop} (max ${maxPop}) Geld=${Math.round(sim.money)} Glück=${sim.happiness}%`);
check('Großstadt erreicht (max ' + maxPop + ' ≥ 1500)', maxPop >= 1500);
check('Meilensteine ausgelöst (' + milestones + ' ≥ 3)', milestones >= 3);
check('Katastrophen treten auf (' + disasters + ')', disasters > 0);
check('Stadt bleibt solvent', sim.money > 0);

// Save/Load-Treue
const s2 = Sim.load(sim.serialize());
check('Save/Load: Bevölkerung identisch', s2.pop === sim.pop);

console.log('\n' + (fail === 0 ? '🎉 Soak-Test bestanden' : '💥 ' + fail + ' Soak-Checks fehlgeschlagen'));
process.exit(fail === 0 ? 0 : 1);
