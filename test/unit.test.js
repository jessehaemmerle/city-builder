/* ============================================================
 * Unit-Tests: RLE, Save v4 + Migration, Footprint-Abriss,
 * Kredite, Determinismus, Pendler-Konnektivität, Pumpwerk-Regel.
 * Aufruf: npm test
 * ============================================================ */
'use strict';
const M = require('./load-sim.js');
const { Sim, rleEncode, rleDecode } = M;
const { S_ROAD, S_WIRE, S_RZONE, S_CZONE, S_IZONE, S_COAL, S_WIND, S_WTOWER, S_PUMP, S_NONE, T_WATER } = M;

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name); }
}
function section(s) { console.log('\n— ' + s); }

// FNV-1a-Hash über den Spielzustand (für Determinismus-Vergleiche)
function hashSim(s) {
  let h = 0x811c9dc5;
  const mix = (v) => { h ^= v & 0xff; h = Math.imul(h, 0x01000193); h ^= (v >> 8) & 0xff; h = Math.imul(h, 0x01000193); };
  for (let i = 0; i < s.w * s.h; i++) { mix(s.st[i]); mix(s.lvl[i]); mix(s.terr[i]); }
  mix(Math.round(s.money)); mix(s.pop); mix(s.jobs); mix(s.happiness);
  return h >>> 0;
}

// Referenzstadt bauen (deterministisch)
function buildCity(s) {
  s.money = 100000;
  const c = s.w >> 1;
  for (let y = c - 6; y <= c + 6; y += 4) for (let x = c - 10; x <= c + 10; x++) s.place(S_ROAD, x, y);
  for (let y = c - 6; y <= c + 6; y++) s.place(S_ROAD, c, y);
  for (let y = c - 6; y <= c + 6; y++) for (let x = c - 10; x <= c + 10; x++) {
    if (s.st[s.idx(x, y)] !== S_NONE) continue;
    const r = (x * 3 + y) % 7;
    s.place(r < 3 ? S_RZONE : r < 5 ? S_CZONE : S_IZONE, x, y);
  }
  for (let x = c - 10; x <= c + 10; x++) if (s.place(S_COAL, x, c - 9).ok) break;
  for (let x = c - 10; x <= c + 10; x++) s.place(S_WIRE, x, c - 7);
  for (let y = c - 5; y <= c + 5; y += 5) for (let x = c - 8; x <= c + 8; x += 8) {
    if (s.st[s.idx(x, y)] >= S_RZONE && s.st[s.idx(x, y)] <= S_IZONE) s.bulldoze(x, y);
    s.place(S_WTOWER, x, y);
  }
  return s;
}

section('RLE-Kodierung');
{
  const arr = new Uint8Array([0, 0, 0, 5, 5, 1, 0, 0, 0, 0, 7]);
  const enc = rleEncode(arr);
  const dec = rleDecode(enc, new Uint8Array(arr.length));
  check('Roundtrip identisch', dec.join(',') === arr.join(','));
  check('Kompression greift bei Wiederholungen', enc.length < arr.length);
  const big = new Uint8Array(4096).fill(3);
  check('4096 gleiche Werte → 2 Einträge', rleEncode(big).length === 2);
}

section('Speichern/Laden v4 (RLE) + Anker-Rekonstruktion');
{
  const s = buildCity(new Sim(64, 64, 4242));
  for (let t = 0; t < 400; t++) { s.tick(); s.events.length = 0; }
  const json = s.serialize();
  const plainSize = JSON.stringify(Array.from(s.st)).length * 5; // grobe Referenz
  const s2 = Sim.load(json);
  check('Bevölkerung identisch nach Laden (' + s.pop + ')', s2.pop === s.pop);
  check('Kasse identisch', Math.round(s2.money) === Math.round(s.money));
  check('Zustands-Hash identisch', hashSim(s2) === hashSim(s));
  check('v4-Spielstand deutlich kleiner als Roharrays (' + json.length + ' B)', json.length < plainSize);
  // 2x2-Anker: Kraftwerk als Ganzes abreißen (über Nicht-Anker-Kachel)
  let coalTile = -1;
  for (let i = 0; i < 64 * 64; i++) if (s2.st[i] === S_COAL && s2.anchor[i] !== i) { coalTile = i; break; }
  check('Nicht-Anker-Kachel des Kraftwerks gefunden', coalTile >= 0);
  const a = s2.anchor[coalTile];
  s2.bulldoze(coalTile % 64, (coalTile / 64) | 0);
  check('2x2-Abriss entfernt den Anker mit', s2.st[a] === S_NONE);
}

section('Migration von v3-Spielständen');
{
  const s = buildCity(new Sim(48, 48, 99));
  for (let t = 0; t < 120; t++) { s.tick(); s.events.length = 0; }
  // v3-Format nachbauen (unkomprimierte Arrays)
  const v3 = JSON.stringify({
    v: 3, w: s.w, h: s.h, seed: s.seed,
    terr: Array.from(s.terr), st: Array.from(s.st), lvl: Array.from(s.lvl),
    anchor: Array.from(s.anchor), burn: Array.from(s.burn), floodT: Array.from(s.floodT),
    money: s.money, debt: s.debt, taxRate: s.taxRate,
    day: s.day, month: s.month, year: s.year,
    disasters: s.disasters, sandbox: s.sandbox,
    milestones: s.milestones, lastBudget: s.lastBudget,
    actors: s.actors, history: s.history, advCd: s.advCd, scenario: s.scenario,
  });
  const s3 = Sim.load(v3);
  check('v3-Spielstand lädt mit gleicher Bevölkerung', s3.pop === s.pop);
}

section('Determinismus (gleicher Seed + gleiche Aktionen ⇒ gleicher Zustand)');
{
  const a = buildCity(new Sim(64, 64, 777));
  const b = buildCity(new Sim(64, 64, 777));
  for (let t = 0; t < 600; t++) { a.tick(); a.events.length = 0; b.tick(); b.events.length = 0; }
  check('Hash nach 600 Ticks identisch', hashSim(a) === hashSim(b));
  check('Es ist etwas gewachsen (Pop ' + a.pop + ')', a.pop > 0);
}

section('Kredite');
{
  const s = new Sim(48, 48, 1);
  const m0 = s.money;
  s.takeLoan();
  check('Kredit erhöht Kasse und Schulden', s.money === m0 + BAL.MONEY.LOAN_STEP && s.debt === BAL.MONEY.LOAN_STEP);
  const r = s.repayLoan();
  check('Tilgung tilgt', r.ok && s.debt === 0 && s.money === m0);
  check('Tilgen ohne Schulden abgelehnt', s.repayLoan().ok === false);
}

section('Pendler-Konnektivität (getrennte Netze wachsen nicht)');
{
  const s = new Sim(64, 64, 5150);
  s.money = 100000;
  s.pop = BAL.GROWTH.SMALL_TOWN_POP + 1; // Schonfrist überspringen
  const c = 32;
  // Baugrund sicherstellen (Karte kann dort Wasser haben)
  for (let x = 8; x <= 52; x++) { s.terr[s.idx(x, c)] = 0; s.terr[s.idx(x, c - 1)] = 0; }
  // Netz A (links): nur Wohnzonen; Netz B (rechts, getrennt): nur Industrie
  for (let x = 10; x <= 20; x++) s.place(S_ROAD, x, c);
  for (let x = 40; x <= 50; x++) s.place(S_ROAD, x, c);
  s.place(S_RZONE, 12, c - 1); s.lvl[s.idx(12, c - 1)] = 2;
  s.place(S_IZONE, 42, c - 1); s.lvl[s.idx(42, c - 1)] = 2;
  s.computeRoadAccess();
  s.computeCommute();
  const rz = s.idx(12, c - 1), iz = s.idx(42, c - 1);
  check('Wohnzone ohne Jobs im eigenen Netz: keine Verbindung', s.connectedOk(rz, S_RZONE) === false);
  check('Industrie ohne Einwohner im eigenen Netz: keine Verbindung', s.connectedOk(iz, S_IZONE) === false);
  // Netze verbinden
  for (let x = 21; x <= 39; x++) s.place(S_ROAD, x, c);
  s.computeRoadAccess();
  s.computeCommute();
  check('Nach Lückenschluss: Wohnzone verbunden', s.connectedOk(rz, S_RZONE) === true);
  check('Nach Lückenschluss: Industrie verbunden', s.connectedOk(iz, S_IZONE) === true);
  // Pendlerfluss erzeugt Verkehr auf der Verbindungsstraße
  let onConnector = 0;
  for (let x = 21; x <= 39; x++) onConnector += s.traffic[s.idx(x, c)];
  check('Verkehr fließt über die Verbindungsstraße (' + onConnector + ')', onConnector > 0);
}

section('Bau-Regeln');
{
  const s = new Sim(64, 64, 12345);
  s.money = 100000;
  // Pumpwerk braucht Wasser-Nachbarschaft
  let landSpot = -1, shoreSpot = -1;
  for (let y = 1; y < 63; y++) for (let x = 1; x < 63; x++) {
    const i = s.idx(x, y);
    if (s.terr[i] === T_WATER) continue;
    const adjWater = [s.idx(x, y - 1), s.idx(x + 1, y), s.idx(x, y + 1), s.idx(x - 1, y)]
      .some(j => s.terr[j] === T_WATER);
    if (adjWater && shoreSpot < 0) shoreSpot = i;
    if (!adjWater && !s.waterNear[i] && landSpot < 0) landSpot = i;
  }
  check('Pumpwerk im Landesinneren abgelehnt',
    s.canPlace(S_PUMP, landSpot % 64, (landSpot / 64) | 0).ok === false);
  check('Pumpwerk am Ufer erlaubt',
    s.canPlace(S_PUMP, shoreSpot % 64, (shoreSpot / 64) | 0).ok === true);
  // Brücke: Straße auf Wasser kostet das Dreifache
  let waterSpot = -1;
  for (let i = 0; i < 64 * 64; i++) if (s.terr[i] === T_WATER) { waterSpot = i; break; }
  const bridgeCost = s.costAt(S_ROAD, waterSpot % 64, (waterSpot / 64) | 0);
  check('Brückenkosten = ' + BAL.MONEY.BRIDGE_FACTOR + '× Straße',
    bridgeCost === M.DEFS[S_ROAD].cost * BAL.MONEY.BRIDGE_FACTOR);
  // Fehler sind i18n-Keys
  const err = s.canPlace(S_WIND, waterSpot % 64, (waterSpot / 64) | 0);
  check('Fehlermeldungen sind i18n-Keys', err.reason === 'err.water');
}

console.log('\n' + (fail === 0 ? '🎉' : '💥') + ' Unit-Tests: ' + pass + ' bestanden, ' + fail + ' fehlgeschlagen');
process.exit(fail === 0 ? 0 : 1);
