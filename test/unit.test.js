/* ============================================================
 * Unit-Tests: RLE, Save v4 + Migration, Footprint-Abriss,
 * Kredite, Determinismus, Pendler-Konnektivität, Pumpwerk-Regel.
 * Aufruf: npm test
 * ============================================================ */
'use strict';
const M = require('./load-sim.js');
const { Sim, rleEncode, rleDecode } = M;
const { S_ROAD, S_RAIL, S_WIRE, S_RZONE, S_CZONE, S_IZONE, S_COAL, S_WIND, S_WTOWER, S_PUMP, S_SOLAR,
  S_BUSSTOP, S_SUBWAY, S_PORT, S_PIPE, S_HOTEL, S_AMUSE, S_PARK, S_POLICE, S_SCHOOL,
  S_HIGHWAY, S_LANDFILL, S_INCINER, S_RECYCLE, S_AIRPORT, S_NUCLEAR,
  S_TREATMENT, S_UNIVERSITY, S_FIREDEP, S_HOSPITAL, S_NONE, T_WATER,
  S_RUNWAY, S_PIER } = M;

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
  s.disasters = false; // struktureller Test (Anker) — keine Katastrophen, die das KW zerstören
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

section('Epochen (Solar, CO₂-Abgabe, E-Autos)');
{
  const s = new Sim(64, 64, 777);
  s.money = 100000;
  const c = 32;
  for (let x = c - 4; x <= c + 4; x++) { s.terr[s.idx(x, c)] = 0; }
  // Solar 1990: noch nicht erfunden
  const early = s.canPlace(S_SOLAR, c, c);
  check('Solar 1990 abgelehnt (err.minYear)', !early.ok && early.reason === 'err.minYear');
  s.year = 1995;
  const later = s.canPlace(S_SOLAR, c, c);
  check('Solar 1995 erlaubt', later.ok === true);
  s.place(S_SOLAR, c, c);
  s.computePower();
  check('Solar speist ' + BAL.ERA.SOLAR_POWER + ' ein', s.powerSupply === BAL.ERA.SOLAR_POWER);
  s.year = 2003;
  s.computePower();
  check('Solar-Upgrade 2002: ' + BAL.ERA.SOLAR_POWER2, s.powerSupply === BAL.ERA.SOLAR_POWER2);
  // CO₂-Abgabe auf Kohle
  const s2 = new Sim(64, 64, 777);
  s2.money = 100000;
  for (let y = 30; y <= 33; y++) for (let x = 30; x <= 33; x++) s2.terr[s2.idx(x, y)] = 0;
  s2.place(S_COAL, 30, 30);
  s2.computeStats();
  s2.monthlyBudget();
  const upkeep1990 = s2.lastBudget.upkeep;
  s2.year = 1999;
  s2.monthlyBudget();
  const upkeep1999 = s2.lastBudget.upkeep;
  check('CO₂-Abgabe erhöht Kohle-Unterhalt (' + upkeep1990 + ' → ' + upkeep1999 + ')',
    upkeep1999 > upkeep1990);
  // Era-Event beim Jahreswechsel
  const s3 = new Sim(48, 48, 1);
  s3.year = 1994;
  s3.monthlyBudget();
  check('Era-Event 1994 gefeuert', s3.events.some(e => e.key === 'ev.era94'));
}

section('ÖPNV: U-Bahn verbindet getrennte Netze');
{
  const s = new Sim(64, 64, 5150);
  s.money = 200000;
  s.pop = 1500; // über minPop der U-Bahn und über der Dorf-Schonfrist
  const c = 32;
  for (let x = 8; x <= 52; x++) { s.terr[s.idx(x, c)] = 0; s.terr[s.idx(x, c - 1)] = 0; }
  // Zwei getrennte Straßennetze (Lücke x=21..39 bleibt leer!)
  for (let x = 10; x <= 20; x++) s.place(S_ROAD, x, c);
  for (let x = 40; x <= 50; x++) s.place(S_ROAD, x, c);
  s.place(S_RZONE, 12, c - 1); s.lvl[s.idx(12, c - 1)] = 2;
  s.place(S_IZONE, 42, c - 1); s.lvl[s.idx(42, c - 1)] = 2;
  s.computeRoadAccess(); s.computeCommute();
  const rz = s.idx(12, c - 1), iz = s.idx(42, c - 1);
  check('Ohne Linie: getrennt', !s.connectedOk(rz, S_RZONE) && !s.connectedOk(iz, S_IZONE));
  check('Ohne Linie: kein Arbeitsweg', s.commuteDist[rz] === -1);
  // U-Bahn-Stationen an beiden Enden + Linie
  s.place(S_SUBWAY, 14, c - 1);
  s.place(S_SUBWAY, 44, c - 1);
  const L = s.createLine('sub');
  check('Linie angelegt', !!L && L.type === 'sub');
  check('Stopp 1 hinzugefügt', s.addStop(L.id, s.idx(14, c - 1)).ok);
  check('Stopp 2 hinzugefügt', s.addStop(L.id, s.idx(44, c - 1)).ok);
  check('Falscher Stopp-Typ abgelehnt', s.addStop(L.id, s.idx(10, c)).ok === false);
  s.computeRoadAccess(); s.computeCommute();
  check('Linie aktiv', s.lines[0].active === true);
  check('U-Bahn verbindet: Wohnzone erreicht Jobs', s.connectedOk(rz, S_RZONE) === true);
  check('U-Bahn verbindet: Industrie erreicht Einwohner', s.connectedOk(iz, S_IZONE) === true);
  const distViaSub = s.commuteDist[rz];
  check('Arbeitsweg über U-Bahn endlich (' + distViaSub + ')', distViaSub > 0);
  check('Fahrgäste gezählt (' + s.lines[0].riders + ')', s.lines[0].riders > 0);
  // Serialisierung
  const s2 = Sim.load(s.serialize());
  check('Linie überlebt Save/Load', s2.lines.length === 1 && s2.lines[0].stops.length === 2);
  check('Linie nach Laden aktiv', s2.lines[0].active === true);
  // Station abreißen → Linie heilt sich / wird inaktiv
  s.bulldoze(44, c - 1);
  s.computeCommute();
  check('Abriss entfernt Stopp aus Linie', s.lines[0].stops.length === 1);
  check('Linie mit 1 Stopp inaktiv', s.lines[0].active === false);
}

section('ÖPNV: Bus-Linie nimmt Autos von der Straße');
{
  const build = (withBus) => {
    const s = new Sim(64, 64, 4242);
    s.money = 200000;
    s.pop = BAL.GROWTH.SMALL_TOWN_POP + 1;
    const c = 32;
    for (let x = 8; x <= 56; x++) { s.terr[s.idx(x, c)] = 0; s.terr[s.idx(x, c - 1)] = 0; }
    for (let x = 10; x <= 54; x++) s.place(S_ROAD, x, c);
    for (let x = 11; x <= 15; x++) { s.place(S_RZONE, x, c - 1); s.lvl[s.idx(x, c - 1)] = 3; }
    for (let x = 49; x <= 53; x++) { s.place(S_IZONE, x, c - 1); s.lvl[s.idx(x, c - 1)] = 3; }
    if (withBus) {
      s.place(S_BUSSTOP, 13, c - 2);
      s.place(S_BUSSTOP, 51, c - 2);
      const L = s.createLine('bus');
      s.addStop(L.id, s.idx(13, c - 2));
      s.addStop(L.id, s.idx(51, c - 2));
    }
    s.computeRoadAccess(); s.computeCommute();
    let mid = 0;
    for (let x = 25; x <= 40; x++) mid += s.traffic[s.idx(x, c)];
    return { s, mid };
  };
  const noBus = build(false);
  const withBus = build(true);
  check('Bus-Linie aktiv', withBus.s.lines[0].active === true);
  check('Bus-Pfad folgt der Straße (' + (withBus.s.lines[0].paths[0] || []).length + ' Felder)',
    (withBus.s.lines[0].paths[0] || []).length > 30);
  check('Verkehr auf der Strecke sinkt (' + noBus.mid + ' → ' + withBus.mid + ')',
    withBus.mid < noBus.mid);
  check('Fahrgäste im Bus (' + withBus.s.lines[0].riders + ')', withBus.s.lines[0].riders > 0);
  // Budget: ÖPNV taucht auf
  withBus.s.computeStats();
  withBus.s.monthlyBudget();
  check('Budget weist ÖPNV-Betrieb aus', withBus.s.lastBudget.transit > 0);
}

section('Außenwelt & Export-Wirtschaft');
{
  const s = new Sim(64, 64, 4242);
  s.money = 300000;
  s.pop = 1000; // über der Export-Schonfrist
  const c = 32;
  for (let x = 0; x <= 40; x++) { s.terr[s.idx(x, c)] = 0; s.terr[s.idx(x, c - 1)] = 0; }
  // Straße NICHT bis zum Rand
  for (let x = 5; x <= 20; x++) s.place(S_ROAD, x, c);
  s.place(S_IZONE, 10, c - 1); s.lvl[s.idx(10, c - 1)] = 3;
  s.place(S_RZONE, 15, c - 1); s.lvl[s.idx(15, c - 1)] = 3;
  s.computeRoadAccess(); s.computeCommute();
  const iz = s.idx(10, c - 1);
  check('Ohne Randanschluss: kein Export möglich', s.extOk(iz) === false);
  check('Exportbasis = 0', s.exportBase === 0);
  const diag = s.explainZone(iz);
  check('Diagnose zeigt fehlende Außenanbindung', diag.some(d => d.k === 'diag.export' && !d.ok));
  // Straße zum Kartenrand ziehen
  for (let x = 0; x <= 4; x++) s.place(S_ROAD, x, c);
  s.computeRoadAccess(); s.computeCommute();
  check('Randstraße wird erkannt (extRoadTotal=' + s.extRoadTotal + ')', s.extRoadTotal >= 1);
  check('Industrie hat jetzt Außenanbindung', s.extOk(iz) === true);
  check('Exportbasis > 0 (' + s.exportBase.toFixed(1) + ')', s.exportBase > 0);
  // Monatsbudget enthält Export + Erst-Anschluss-Event
  s.computeStats();
  s.monthlyBudget();
  check('Budget weist Exporterlöse aus', s.lastBudget.export !== undefined && s.lastBudget.export >= 0);
  check('Fernstraßen-Event gefeuert', s.events.some(e => e.key === 'ev.extRoad'));
  // Schiene zum Rand = mehr Kapazität
  for (let x = 0; x <= 20; x++) { s.terr[s.idx(x, c + 2)] = 0; s.place(S_RAIL, x, c + 2); }
  s.computeRoadAccess(); s.computeCommute();
  check('Bahnanschluss erkannt', s.extRailTotal >= 1);
}

section('Hafen');
{
  const s = new Sim(64, 64, 12345);
  s.money = 300000;
  s.pop = 1000;
  // Küstenpunkt suchen: Land mit Wasser-Nachbar und Platz für 2x2
  let spot = null;
  for (let y = 1; y < 61 && !spot; y++) for (let x = 1; x < 61 && !spot; x++) {
    if (s.canPlace(S_PORT, x, y).ok) spot = [x, y];
  }
  check('Hafen-Bauplatz an der Küste gefunden', !!spot);
  if (spot) {
    const r = s.place(S_PORT, spot[0], spot[1]);
    check('Hafen gebaut (2x2)', r.ok && s.st[s.idx(spot[0] + 1, spot[1] + 1)] === S_PORT);
    // Straße vom Hafen weg (Anbindung), damit er als Anschluss zählt
    for (let dx = -3; dx <= 5; dx++) {
      const px = spot[0] + dx, py = spot[1] + 2;
      if (s.inMap(px, py) && s.terr[s.idx(px, py)] !== T_WATER) s.place(S_ROAD, px, py);
    }
    s.computeRoadAccess(); s.computeCommute();
    check('Hafen zählt als Außenanschluss', s.portTotal >= 1);
  }
  // Landesinneres: Hafen abgelehnt
  let inland = -1;
  for (let i = 0; i < 64 * 64; i++)
    if (s.terr[i] === 0 && !s.waterNear[i] && s.st[i] === S_NONE) { inland = i; break; }
  const rej = s.canPlace(S_PORT, inland % 64, (inland / 64) | 0);
  check('Hafen im Landesinneren abgelehnt', rej.ok === false && rej.reason === 'err.portWater');
}

section('Konjunkturzyklus');
{
  const s = new Sim(48, 48, 999);
  const e1 = s.econAt(10), e2 = s.econAt(10);
  check('Deterministisch (gleicher Monat → gleicher Wert)', e1 === e2);
  let hi = -2, lo = 2;
  for (let m = 0; m < 96; m++) { const e = s.econAt(m); hi = Math.max(hi, e); lo = Math.min(lo, e); }
  check('Zyklus erreicht Boom-Bereich (' + hi.toFixed(2) + ')', hi > BAL.ECONOMY.PHASE_HI);
  check('Zyklus erreicht Rezession (' + lo.toFixed(2) + ')', lo < BAL.ECONOMY.PHASE_LO);
  check('Werte in [-1, 1]', hi <= 1 && lo >= -1);
}

section('Riesenkarten (Performance-Smoke)');
{
  let t0 = Date.now();
  const big = new Sim(1024, 1024, 7);
  const genMs = Date.now() - t0;
  check('1024×1024 generiert in <30s (' + genMs + ' ms)', genMs < 30000);
  big.money = 500000;
  const c = 512;
  for (let x = c - 10; x <= c + 10; x++) { big.terr[big.idx(x, c)] = 0; big.place(S_ROAD, x, c); }
  for (let x = c - 8; x <= c + 8; x++) { big.terr[big.idx(x, c - 1)] = 0; big.place(S_RZONE, x, c - 1); }
  big.place(S_WIND, c, c + 2);
  t0 = Date.now();
  for (let t = 0; t < 35; t++) { big.tick(); big.events.length = 0; }
  const tickMs = (Date.now() - t0) / 35;
  check('Tick-Zeit auf 1024er-Karte < 150 ms (' + tickMs.toFixed(1) + ' ms)', tickMs < 150);
  check('Simulation bleibt konsistent', isFinite(big.money) && big.pop >= 0);
  // 256er-Karte: Wachstum funktioniert normal
  const mid = new Sim(256, 256, 11);
  mid.money = 300000;
  const m = 128;
  for (let x = m - 10; x <= m + 10; x++) { mid.terr[mid.idx(x, m)] = 0; mid.place(S_ROAD, x, m); }
  for (let x = m - 8; x <= m + 8; x++) {
    mid.terr[mid.idx(x, m - 1)] = 0; mid.place(S_RZONE, x, m - 1);
    mid.terr[mid.idx(x, m + 1)] = 0; mid.place(x % 2 ? S_CZONE : S_IZONE, x, m + 1);
  }
  mid.terr[mid.idx(m - 11, m)] = 0; mid.terr[mid.idx(m + 11, m)] = 0;
  const w1 = mid.place(S_WIND, m - 11, m), w2 = mid.place(S_WIND, m + 11, m);
  check('256er-Karte: Windräder stehen', w1.ok || w2.ok);
  for (let t = 0; t < 360; t++) { mid.tick(); mid.events.length = 0; }
  check('256er-Karte: Stadt wächst (' + mid.pop + ')', mid.pop > 0);
}

section('Wassernetz (Leitungen, Kapazität, Save/Load)');
{
  const s = new Sim(64, 64, 5150);
  s.money = 200000;
  s.month = 3; // Frühling: keine Jahreszeit-Faktoren auf Strom/Wasser (isolierter Test)
  const c = 32;
  for (let y = c - 3; y <= c + 3; y++) for (let x = 8; x <= 56; x++) s.terr[s.idx(x, y)] = 0;
  for (let x = 10; x <= 30; x++) s.place(S_ROAD, x, c);
  s.place(S_WIND, 10, c - 1);                       // Strom für Turm & Zonen
  s.place(S_COAL, 9, c + 1);                        // genug Strom auch für viele Stufe-4-Zonen
  s.place(S_RZONE, 12, c - 1); s.lvl[s.idx(12, c - 1)] = 2;
  // Turm abseits der Straße, nur per STROMKABEL verbunden
  s.place(S_WIRE, 20, c - 1); s.place(S_WIRE, 20, c - 2);
  s.place(S_WTOWER, 20, c - 3);
  s.computePower(); s.computeWater();
  const rz = s.idx(12, c - 1);
  check('Turm hat Strom (über Kabel)', s.powered[s.idx(20, c - 3)] === 1);
  check('Turm speist ein (Supply=' + s.waterSupply + ')', s.waterSupply === BAL.WATER.TOWER_SUPPLY);
  check('Stromkabel leitet KEIN Wasser: Zone trocken', s.watered[rz] === 0 && s.covWater[rz] === 0);
  // Wasserleitung vom Turm zur Straße → Netz versorgt
  s.place(S_PIPE, 21, c - 3); s.place(S_PIPE, 21, c - 2); s.place(S_PIPE, 21, c - 1);
  s.computePower(); s.computeWater();
  check('Rohre verbinden Turm mit Straßennetz: Zone versorgt', s.watered[rz] === 1 && s.covWater[rz] === 100);
  check('Kein Wassermangel bei 1 Zone', s.waterShort === false);
  // Kapazität: viele Stufe-4-Zonen überlasten den einen Turm
  for (let x = 13; x <= 30; x++) { s.place(S_RZONE, x, c - 1); s.lvl[s.idx(x, c - 1)] = 4; }
  for (let x = 11; x <= 30; x++) { s.place(S_RZONE, x, c + 1); s.lvl[s.idx(x, c + 1)] = 4; }
  s.computePower(); s.computeWater();
  check('Bedarf übersteigt Angebot (' + s.waterNeed + '/' + s.waterSupply + ')',
    s.waterNeed > s.waterSupply && s.waterShort === true);
  let dryZones = 0, zoneCnt = 0;
  for (let i = 0; i < 64 * 64; i++) if (s.st[i] === S_RZONE) { zoneCnt++; if (!s.watered[i]) dryZones++; }
  check('Wassermangel lässt Zonen trockenfallen (' + dryZones + '/' + zoneCnt + ')', dryZones > 0);
  // Zufriedenheits-Malus bei Wassermangel
  s.computeStats();
  const hShort = s.happiness;
  s.place(S_WTOWER, 31, c - 1); // zweiter Turm am Ende der Zonenreihe
  s.computePower(); s.computeWater(); s.computeStats();
  check('Zweiter Turm behebt den Mangel', s.waterShort === false);
  check('Zufriedenheit steigt ohne Wassermangel (' + hShort + ' → ' + s.happiness + ')',
    s.happiness > hShort);
  // Rohr als "Brücke" (Unterwasserleitung) kostet das Dreifache
  let waterSpot = -1;
  for (let i = 0; i < 64 * 64; i++) if (s.terr[i] === T_WATER) { waterSpot = i; break; }
  if (waterSpot >= 0) {
    check('Unterwasser-Rohr kostet ' + BAL.MONEY.BRIDGE_FACTOR + '×',
      s.costAt(S_PIPE, waterSpot % 64, (waterSpot / 64) | 0) === M.DEFS[S_PIPE].cost * BAL.MONEY.BRIDGE_FACTOR);
  }
  // Save/Load: Wasserzustand bitgenau
  const s2 = Sim.load(s.serialize());
  let same = s2.waterShort === s.waterShort && s2.waterNeed === s.waterNeed && s2.waterSupply === s.waterSupply;
  for (let i = 0; i < 64 * 64 && same; i++)
    if (s2.watered[i] !== s.watered[i] || s2.covWater[i] !== s.covWater[i]) same = false;
  check('Wassernetz überlebt Save/Load bitgenau', same);
}

section('Tourismus (Attraktionen + Hotels als Einnahmestrom)');
{
  // Attraktionen erzeugen Nachfrage, Hotels stellen Kapazität, Außenanbindung
  // bringt die Touristen in die Stadt.
  function buildTourismCity(opts) {
    const o = opts || {};
    const border = o.border !== false, hotels = o.hotels === undefined ? 7 : o.hotels;
    const attractions = o.attractions !== false;
    const s = new Sim(64, 64, 2024);
    s.money = 500000; s.pop = 600; // Bau-Freigabe (Freizeitpark minPop 500)
    const c = 32;
    for (let y = c - 4; y <= c + 4; y++) for (let x = 0; x <= 30; x++) s.terr[s.idx(x, y)] = 0;
    const x0 = border ? 0 : 5; // Straße bis zum Kartenrand (Außenanbindung) oder nicht
    for (let x = x0; x <= 27; x++) s.place(S_ROAD, x, c);
    s.place(S_WIND, 10, c + 1); s.place(S_WIND, 11, c + 1); // Strom übers Straßennetz
    if (attractions) {
      s.place(S_AMUSE, 8, c - 2);                            // Freizeitpark (2x2)
      for (let x = 12; x <= 16; x++) s.place(S_PARK, x, c - 1);
    }
    for (let k = 0; k < hotels; k++) s.place(S_HOTEL, 18 + k, c - 1);
    s.computePower(); s.computeRoadAccess(); s.computeCommute(); s.computeStats();
    return s;
  }
  const ext = buildTourismCity({});
  check('Attraktion erkannt (' + ext.attraction + ')', ext.attraction >= 70);
  check('Hotels liefern Bettenkapazität', ext.touristCap === 7 * BAL.TOURISM.HOTEL_BEDS);
  check('Touristen kommen (' + ext.tourists + ')', ext.tourists > 0);
  ext.monthlyBudget();
  check('Tourismus taucht als Einnahme im Budget auf (' + ext.lastBudget.tourism + ' €)',
    ext.lastBudget.tourism > 0 && ext.lastBudget.tourism === Math.round(ext.tourists * BAL.TOURISM.SPEND));

  const noHotels = buildTourismCity({ hotels: 0 });
  check('Ohne Hotels: keine Touristen trotz Attraktion',
    noHotels.attraction > 0 && noHotels.tourists === 0);
  noHotels.monthlyBudget();
  check('Ohne Hotels: keine Tourismus-Einnahmen', noHotels.lastBudget.tourism === 0);

  const noAttraction = buildTourismCity({ attractions: false });
  check('Ohne Attraktionen: keine Touristen trotz Hotels',
    noAttraction.touristCap > 0 && noAttraction.tourists === 0);

  const noExt = buildTourismCity({ border: false });
  check('Außenanbindung steigert den Zustrom (' + noExt.tourists + ' → ' + ext.tourists + ')',
    ext.tourists > noExt.tourists);

  // minPop-Sperre des Freizeitparks
  const y0 = new Sim(48, 48, 1);
  y0.money = 100000; y0.pop = 0;
  for (let yy = 24; yy <= 25; yy++) for (let xx = 22; xx <= 23; xx++) y0.terr[y0.idx(xx, yy)] = 0;
  const rej = y0.canPlace(S_AMUSE, 22, 24);
  check('Freizeitpark unter minPop abgelehnt', !rej.ok && rej.reason === 'err.minPop');
  y0.pop = 600;
  check('Freizeitpark ab 500 Einwohnern erlaubt', y0.canPlace(S_AMUSE, 22, 24).ok === true);

  // Save/Load reproduziert Tourismus bitgenau
  const s2 = Sim.load(ext.serialize());
  check('Tourismus überlebt Save/Load',
    s2.tourists === ext.tourists && s2.touristCap === ext.touristCap &&
    s2.lastBudget.tourism === ext.lastBudget.tourism);
}

section('Autobahn (Export-Kapazität + weniger Stau)');
{
  // Autobahn am Rand liefert Export-Kapazität wie eine Straße, nur größer
  const s = new Sim(64, 64, 321);
  s.money = 300000; s.pop = 1000;
  const c = 32;
  for (let x = 0; x <= 20; x++) { s.terr[s.idx(x, c)] = 0; s.terr[s.idx(x, c - 1)] = 0; }
  for (let x = 0; x <= 15; x++) s.place(S_HIGHWAY, x, c);          // Autobahn bis zum Rand (x=0)
  s.place(S_IZONE, 8, c - 1); s.lvl[s.idx(8, c - 1)] = 3;
  s.place(S_RZONE, 12, c - 1); s.lvl[s.idx(12, c - 1)] = 3;
  s.computeRoadAccess(); s.computeCommute();
  check('Autobahn zählt als Rand-Anschluss', s.extHwyTotal >= 1);
  check('Industrie exportiert über die Autobahn', s.extOk(s.idx(8, c - 1)) && s.exportBase > 0);

  // Weniger Stau: gleiche Pendler auf Autobahn vs. Straße
  const build = (kind) => {
    const q = new Sim(64, 64, 4242);
    q.money = 200000; q.pop = BAL.GROWTH.SMALL_TOWN_POP + 1;
    const cc = 32;
    for (let x = 8; x <= 56; x++) { q.terr[q.idx(x, cc)] = 0; q.terr[q.idx(x, cc - 1)] = 0; }
    for (let x = 10; x <= 54; x++) q.place(kind, x, cc);
    for (let x = 11; x <= 15; x++) { q.place(S_RZONE, x, cc - 1); q.lvl[q.idx(x, cc - 1)] = 3; }
    for (let x = 49; x <= 53; x++) { q.place(S_IZONE, x, cc - 1); q.lvl[q.idx(x, cc - 1)] = 3; }
    q.computeRoadAccess(); q.computeCommute();
    let mid = 0;
    for (let x = 25; x <= 40; x++) mid += q.traffic[q.idx(x, cc)];
    return mid;
  };
  const roadJam = build(S_ROAD), hwyJam = build(S_HIGHWAY);
  check('Autobahn hat weniger Stau als Straße (' + roadJam + ' → ' + hwyJam + ')', hwyJam < roadJam);
}

section('Flughafen (Export + Tourismus-Anreise)');
{
  const s = new Sim(64, 64, 1995);
  s.money = 300000; s.pop = 1200; s.year = 1996;
  const c = 32;
  for (let y = c - 2; y <= c + 3; y++) for (let x = 4; x <= 20; x++) s.terr[s.idx(x, y)] = 0;
  for (let x = 4; x <= 18; x++) s.place(S_ROAD, x, c);              // Straße (KEINE Randverbindung)
  s.place(S_WIND, 5, c + 1); s.place(S_WIND, 6, c + 1);            // Strom
  s.place(S_IZONE, 10, c - 1); s.lvl[s.idx(10, c - 1)] = 3;
  const ap = s.place(S_AIRPORT, 12, c + 1);                        // Flughafen 2x2 an der Straße
  check('Flughafen gebaut (2x2)', ap.ok && s.st[s.idx(13, c + 2)] === S_AIRPORT);
  s.computePower(); s.computeRoadAccess(); s.computeCommute();
  check('Flughafen zählt als Außenanschluss', s.airportTotal >= 1);
  check('Industrie exportiert über den Flughafen', s.extOk(s.idx(10, c - 1)) && s.exportBase > 0);
  // minYear-Sperre
  const y0 = new Sim(48, 48, 1); y0.money = 100000; y0.pop = 1200; y0.year = 1994;
  for (let yy = 20; yy <= 21; yy++) for (let xx = 20; xx <= 21; xx++) y0.terr[y0.idx(xx, yy)] = 0;
  const rej = y0.canPlace(S_AIRPORT, 20, 20);
  check('Flughafen vor 1995 gesperrt', !rej.ok && rej.reason === 'err.minYear');
}

section('Dynamische Erweiterungen: Landebahn & Pier');
{
  const s = new Sim(64, 64, 3);
  s.money = 800000; s.pop = 3000; s.year = 1996; s.disasters = false; s.month = 3;
  const c = 30;
  // Gras-Fläche + Wassersee links
  for (let y = 24; y <= 36; y++) for (let x = 2; x <= 46; x++) s.terr[s.idx(x, y)] = 0;
  for (let y = 24; y <= 36; y++) { s.terr[s.idx(2, y)] = T_WATER; s.terr[s.idx(3, y)] = T_WATER; }
  // Straße (keine Randverbindung) + Strom
  for (let x = 4; x <= 44; x++) s.place(S_ROAD, x, c);
  for (let x = 5; x <= 12; x++) s.place(S_WIND, x, c + 1);
  // viel Industrie an der Straße → saturiert die Flughafen-Basiskapazität
  let ij = 0;
  for (let x = 8; x <= 38; x++) if (s.place(S_IZONE, x, c - 1).ok) { s.lvl[s.idx(x, c - 1)] = 4; ij++; }
  // Flughafen 2x2 an der Straße (rechts)
  const ap = s.place(S_AIRPORT, 40, c + 1);
  check('Flughafen (2x2) gebaut', ap.ok);
  s.computePower(); s.computeRoadAccess(); s.computeCommute();
  const exp0 = s.exportBase;
  check('Basis saturiert Flughafen-Kapazität (' + exp0.toFixed(0) + ')', exp0 > 0 && s.airportTotal >= 1);

  // Landebahn ohne Anschluss wird abgelehnt
  const noLink = s.canPlace(S_RUNWAY, 6, 34);
  check('Landebahn ohne Anschluss abgelehnt', !noLink.ok && noLink.reason === 'err.runwayLink');
  // Landebahnen kettenweise an den Flughafen (freie Grasreihe c+1)
  check('Landebahn 1 an Flughafen platziert', s.place(S_RUNWAY, 39, c + 1).ok);
  check('Landebahn 2 an Landebahn platziert', s.place(S_RUNWAY, 38, c + 1).ok);
  check('Landebahn 3 an Landebahn platziert', s.place(S_RUNWAY, 37, c + 1).ok);
  s.computeRoadAccess(); s.computeCommute();
  check('3 Landebahnen gezählt', s.runwayTotal === 3);
  check('Landebahnen erhöhen die Export-Kapazität (' + exp0.toFixed(0) + ' → ' + s.exportBase.toFixed(0) + ')', s.exportBase > exp0);

  // Hafen am See + Pier auf Wasser
  const pr = s.place(S_PORT, 4, 25);
  check('Hafen (2x2) am Wasser gebaut', pr.ok);
  // Pier muss auf Wasser stehen
  const pierLand = s.canPlace(S_PIER, 6, 34);
  check('Pier auf Land abgelehnt', !pierLand.ok && pierLand.reason === 'err.pierWater');
  // Pier muss an Hafen/Pier anschließen (Wasser bei x=2/3)
  const pierFar = s.canPlace(S_PIER, 2, 33);
  check('Pier ohne Hafen-Anschluss abgelehnt', !pierFar.ok && pierFar.reason === 'err.pierLink');
  // Pier neben dem Hafen (Hafen belegt 4..5 × 25..26; Wasser bei x=3)
  check('Pier 1 an Hafen platziert', s.place(S_PIER, 3, 25).ok);
  check('Pier 2 an Pier platziert', s.place(S_PIER, 3, 26).ok);
  s.computeRoadAccess(); s.computeCommute();
  check('2 Piers gezählt', s.pierTotal === 2);

  // Erweiterungen überstehen Save/Load bitgenau
  const blob = s.serialize();
  const s2 = Sim.load(blob);
  check('Landebahnen/Piers überleben Save/Load', s2.runwayTotal === s.runwayTotal && s2.pierTotal === s.pierTotal);
}

section('Kernkraftwerk (viel Strom)');
{
  const s = new Sim(64, 64, 7); s.money = 300000;
  const c = 32;
  for (let y = c - 1; y <= c + 3; y++) for (let x = c - 1; x <= c + 3; x++) s.terr[s.idx(x, y)] = 0;
  for (let x = c - 1; x <= c + 3; x++) s.place(S_ROAD, x, c);
  const r = s.place(S_NUCLEAR, c, c + 1);                          // 2x2 an der Straße
  check('Kernkraftwerk gebaut', r.ok);
  s.place(S_RZONE, c, c - 1); s.lvl[s.idx(c, c - 1)] = 1;
  s.computePower();
  check('Reaktor speist viel Strom ein (' + s.powerSupply + ')', s.powerSupply >= 500);
  check('Umliegende Zone hat Strom', s.powered[s.idx(c, c - 1)] === 1);
}

section('Müllentsorgung (Aufkommen vs. Kapazität)');
{
  const mk = (opts) => {
    const o = opts || {};
    const s = new Sim(64, 64, 909); s.money = 300000; s.year = 1997; // Recyclinghof ab 1996
    const c = 32;
    for (let y = c - 2; y <= c + 3; y++) for (let x = 8; x <= 40; x++) s.terr[s.idx(x, y)] = 0;
    for (let x = 8; x <= 38; x++) s.place(S_ROAD, x, c);
    s.place(S_COAL, 9, c + 1);                                     // Strom
    for (let x = 12; x <= 30; x++) { s.place(S_RZONE, x, c - 1); s.lvl[s.idx(x, c - 1)] = 3; }
    if (o.landfill) s.place(S_LANDFILL, 33, c + 1);
    if (o.recycle) s.place(S_RECYCLE, 36, c + 1);
    s.computePower(); s.computeRoadAccess(); s.computeCommute(); s.computeStats();
    return s;
  };
  const none = mk({});
  check('Zonen produzieren Müll', none.garbageProduced > 0);
  check('Ohne Entsorgung: Überlauf', none.garbageOverflow > 0 && none.garbageCap === 0);
  const withLf = mk({ landfill: true });
  check('Deponie schafft Kapazität', withLf.garbageCap >= BAL.GARBAGE.LANDFILL_CAP);
  check('Deponie reduziert den Überlauf', withLf.garbageOverflow < none.garbageOverflow);
  check('Weniger Müll = zufriedener (' + none.happiness + ' → ' + withLf.happiness + ')',
    withLf.happiness > none.happiness);
  const withRe = mk({ landfill: true, recycle: true });
  check('Recyclinghof senkt das Aufkommen', withRe.garbageProduced < withLf.garbageProduced);
}

section('Kriminalität (Polizei senkt sie, Landwert/Glück leiden)');
{
  const s = new Sim(64, 64, 5150); s.money = 300000; s.pop = 400;
  const c = 32;
  for (let y = c - 2; y <= c + 2; y++) for (let x = 10; x <= 30; x++) s.terr[s.idx(x, y)] = 0;
  for (let x = 10; x <= 30; x++) s.place(S_ROAD, x, c);
  s.place(S_COAL, 11, c + 1);
  for (let x = 13; x <= 20; x++) { s.place(S_RZONE, x, c - 1); s.lvl[s.idx(x, c - 1)] = 3; }
  s.computePower(); s.computeCoverage(); s.computeCrime();
  const crimeNoPolice = s.crime[s.idx(15, c - 1)];
  check('Ohne Polizei: hohe Kriminalität (' + crimeNoPolice + ')', crimeNoPolice > 40);
  s.computeLandValue();
  const lvHigh = s.landv[s.idx(15, c - 1)];
  // Polizeiwache in die Nähe setzen
  s.place(S_POLICE, 15, c + 1);
  s.computePower(); s.computeCoverage(); s.computeCrime(); s.computeLandValue();
  const crimeWithPolice = s.crime[s.idx(15, c - 1)];
  check('Polizei senkt die Kriminalität (' + crimeNoPolice + ' → ' + crimeWithPolice + ')', crimeWithPolice < crimeNoPolice);
  check('Niedrigere Kriminalität hebt den Landwert', s.landv[s.idx(15, c - 1)] > lvHigh);
}

section('Bildung macht Industrie sauberer & produktiver');
{
  const mk = (edu) => {
    const s = new Sim(48, 48, 202); s.money = 200000;
    const c = 24;
    for (let x = c - 6; x <= c + 6; x++) { s.terr[s.idx(x, c)] = 0; s.terr[s.idx(x, c - 1)] = 0; }
    for (let x = c - 6; x <= c + 6; x++) s.place(S_ROAD, x, c);
    for (let x = c - 4; x <= c + 4; x++) { s.place(S_IZONE, x, c - 1); s.lvl[s.idx(x, c - 1)] = 3; }
    s.eduLevel = edu;
    s.computePollution(); s.computeStats();
    let poll = 0;
    for (let x = c - 4; x <= c + 4; x++) poll += s.poll[s.idx(x, c - 1)];
    return { poll, jobs: s.iJobs };
  };
  const dumb = mk(0), smart = mk(1);
  check('Bildung senkt die Industrie-Verschmutzung (' + dumb.poll + ' → ' + smart.poll + ')', smart.poll < dumb.poll);
  check('Bildung erhöht die Industrie-Jobs (' + dumb.jobs + ' → ' + smart.jobs + ')', smart.jobs > dumb.jobs);
  // Bildungsniveau steigt bei Schul-Abdeckung über die Zeit
  const s = new Sim(48, 48, 5); s.money = 200000;
  const c = 24;
  for (let x = c - 6; x <= c + 6; x++) { s.terr[s.idx(x, c)] = 0; s.terr[s.idx(x, c - 1)] = 0; }
  for (let x = c - 6; x <= c + 6; x++) s.place(S_ROAD, x, c);
  s.place(S_COAL, c - 6, c + 1);
  for (let x = c - 4; x <= c + 4; x++) { s.place(S_RZONE, x, c - 1); s.lvl[s.idx(x, c - 1)] = 2; }
  s.place(S_SCHOOL, c, c + 1);
  const edu0 = s.eduLevel;
  for (let t = 0; t < 200; t++) { s.tick(); s.events.length = 0; }
  check('Bildungsniveau steigt mit Schulen (' + edu0.toFixed(2) + ' → ' + s.eduLevel.toFixed(2) + ')', s.eduLevel > edu0 + 0.05);
}

section('Verordnungen (stadtweite Schalter)');
{
  const s = new Sim(48, 48, 11); s.money = 200000;
  const c = 24;
  for (let x = c - 6; x <= c + 6; x++) { s.terr[s.idx(x, c)] = 0; s.terr[s.idx(x, c - 1)] = 0; }
  for (let x = c - 6; x <= c + 6; x++) s.place(S_ROAD, x, c);
  s.place(S_COAL, c - 6, c + 1);
  for (let x = c - 4; x <= c + 4; x++) { s.place(S_RZONE, x, c - 1); s.lvl[s.idx(x, c - 1)] = 2; }
  s.computePower();
  const needFull = s.powerNeed;
  s.policies.conserve = true; s.computePower();
  check('Sparmaßnahmen senken den Strombedarf (' + needFull + ' → ' + s.powerNeed + ')', s.powerNeed < needFull);
  // Wirtschaftsförderung hebt die C/I-Nachfrage
  s.policies.conserve = false;
  s.computeStats(); const demandC0 = s.demandC;
  s.policies.proBiz = true; s.computeStats();
  check('Wirtschaftsförderung hebt die Gewerbe-Nachfrage', s.demandC > demandC0);
  // Kulturprogramm hebt die Zufriedenheit; Kosten tauchen im Budget auf
  s.computeStats(); const happy0 = s.happiness;
  s.policies.culture = true; s.computeStats();
  check('Kulturprogramm hebt die Zufriedenheit', s.happiness > happy0);
  s.monthlyBudget();
  check('Verordnungen kosten im Budget', s.lastBudget.policy > 0);
}

section('Save/Load: Verordnungen & Bildungsniveau bitgenau');
{
  const s = new Sim(64, 64, 4242);
  s.money = 100000;
  const c = 32;
  for (let x = c - 8; x <= c + 8; x++) { s.terr[s.idx(x, c)] = 0; s.terr[s.idx(x, c - 1)] = 0; }
  for (let x = c - 8; x <= c + 8; x++) s.place(S_ROAD, x, c);
  s.place(S_COAL, c - 8, c + 1);
  for (let x = c - 6; x <= c + 6; x++) { s.place(S_RZONE, x, c - 1); s.lvl[s.idx(x, c - 1)] = 2; }
  s.place(S_SCHOOL, c, c + 1);
  s.policies.recycle = true; s.policies.culture = true;
  for (let t = 0; t < 150; t++) { s.tick(); s.events.length = 0; }
  const s2 = Sim.load(s.serialize());
  check('Verordnungen überleben Save/Load', s2.policies.recycle === true && s2.policies.culture === true);
  check('Bildungsniveau überlebt Save/Load', Math.abs(s2.eduLevel - s.eduLevel) < 1e-9);
  check('Zustands-Hash identisch (bitgenau)', hashSim(s2) === hashSim(s));
}

section('Ressort-Finanzierung (Abdeckung & Kosten skalieren)');
{
  const s = new Sim(64, 64, 111); s.money = 300000; s.month = 3;
  const c = 32;
  for (let y = c - 2; y <= c + 2; y++) for (let x = 20; x <= 40; x++) s.terr[s.idx(x, y)] = 0;
  for (let x = 20; x <= 40; x++) s.place(S_ROAD, x, c);
  s.place(S_COAL, 21, c + 1);
  s.place(S_POLICE, 30, c + 1);
  for (let x = 26; x <= 34; x++) { s.place(S_RZONE, x, c - 1); s.lvl[s.idx(x, c - 1)] = 3; }
  s.computePower(); s.computeCoverage();
  const zi = s.idx(30, c - 1), covFull = s.covPolice[zi];
  check('Volle Finanzierung: Abdeckung vorhanden (' + covFull + ')', covFull > 0);
  s.funding.police = 0.5; s.computeCoverage();
  check('Halbe Finanzierung halbiert die Abdeckung (' + s.covPolice[zi] + ')', s.covPolice[zi] < covFull);
  s.computeCrime(); const crimeLow = s.crime[zi];
  s.funding.police = 1.5; s.computeCoverage(); s.computeCrime();
  check('Bessere Finanzierung senkt die Kriminalität', s.crime[zi] < crimeLow);
  // Unterhalt skaliert mit der Finanzierung
  s.funding.police = 0.5; s.computeStats(); s.monthlyBudget();
  const up1 = s.lastBudget.upkeep;
  s.funding.police = 1.5; s.monthlyBudget();
  check('Höhere Finanzierung kostet mehr Unterhalt (' + up1 + ' → ' + s.lastBudget.upkeep + ')', s.lastBudget.upkeep > up1);
}

section('Jahreszeiten (Winter=Strom, Sommer=Wasser/Tourismus)');
{
  const mk = () => {
    const s = new Sim(48, 48, 7); s.money = 200000;
    const c = 24;
    for (let y = c - 2; y <= c + 2; y++) for (let x = c - 8; x <= c + 8; x++) s.terr[s.idx(x, y)] = 0;
    for (let x = c - 8; x <= c + 8; x++) s.place(S_ROAD, x, c);
    s.place(S_COAL, c - 8, c + 1);
    for (let x = c - 6; x <= c + 6; x++) { s.place(S_RZONE, x, c - 1); s.lvl[s.idx(x, c - 1)] = 3; }
    s.place(S_WTOWER, c, c + 1);
    return s;
  };
  const s = mk();
  s.month = 3; s.computePower(); const pSpring = s.powerNeed;
  s.month = 0; s.computePower(); const pWinter = s.powerNeed;
  check('Winter erhöht den Strombedarf (' + pSpring + ' → ' + pWinter + ')', pWinter > pSpring);
  s.month = 3; s.computeWater(); const wSpring = s.waterNeed;
  s.month = 6; s.computeWater(); const wSummer = s.waterNeed;
  check('Sommer erhöht den Wasserbedarf (' + wSpring + ' → ' + wSummer + ')', wSummer > wSpring);
}

section('Wasserverschmutzung + Kläranlage');
{
  const s = new Sim(64, 64, 909); s.money = 300000;
  let shore = -1;
  for (let y = 1; y < 63 && shore < 0; y++) for (let x = 1; x < 63 && shore < 0; x++) {
    const i = s.idx(x, y);
    if (s.terr[i] === T_WATER) continue;
    if ([s.idx(x, y - 1), s.idx(x + 1, y), s.idx(x, y + 1), s.idx(x - 1, y)].some(j => s.terr[j] === T_WATER)) shore = i;
  }
  const sx = shore % 64, sy = (shore / 64) | 0;
  s.place(S_PUMP, sx, sy);
  // Strom fürs Pumpwerk (Windrad auf ein Land-Nachbarfeld)
  for (const [nx, ny] of [[sx, sy - 1], [sx + 1, sy], [sx, sy + 1], [sx - 1, sy]]) {
    if (s.inMap(nx, ny) && s.terr[s.idx(nx, ny)] !== T_WATER && s.st[s.idx(nx, ny)] === S_NONE) { s.place(S_WIND, nx, ny); break; }
  }
  s.poll[shore] = 55; // stark belastetes Wasser am Pumpwerk
  s.computePower(); s.computeWater();
  check('Pumpwerk an Dreckwasser → verschmutztes Wasser (versorgt=' + s.watered[shore] + ')', s.dirtyWater === true);
  // Kläranlage an anderer Uferstelle bauen (mit Strom)
  let shore2 = -1;
  for (let y = 1; y < 63 && shore2 < 0; y++) for (let x = 1; x < 63 && shore2 < 0; x++) {
    const i = s.idx(x, y);
    if (i === shore || s.terr[i] === T_WATER || s.st[i] !== S_NONE) continue;
    if (s.canPlace(S_TREATMENT, x, y).ok) shore2 = i;
  }
  if (shore2 >= 0) {
    s.place(S_TREATMENT, shore2 % 64, (shore2 / 64) | 0);
    // Strom hinbringen
    for (let i = 0; i < 64 * 64; i++) if (s.st[i] === S_NONE && Math.abs((i % 64) - (shore2 % 64)) < 2) {}
    s.place(S_WIND, (shore2 % 64), ((shore2 / 64) | 0) - 1 >= 0 ? ((shore2 / 64) | 0) - 1 : 0);
    s.computePower(); s.computeWater();
    check('Kläranlage (mit Strom) reinigt das Wasser', s.dirtyWater === false);
  }
}

section('Universität + Gesundheitsindex');
{
  const mk = (withUni) => {
    const s = new Sim(48, 48, 5); s.money = 300000; s.pop = 2500;
    const c = 24;
    for (let y = c - 2; y <= c + 3; y++) for (let x = c - 8; x <= c + 8; x++) s.terr[s.idx(x, y)] = 0;
    for (let x = c - 8; x <= c + 8; x++) s.place(S_ROAD, x, c);
    s.place(S_COAL, c - 8, c + 1);
    for (let x = c - 6; x <= c + 6; x++) { s.place(S_RZONE, x, c - 1); s.lvl[s.idx(x, c - 1)] = 2; }
    if (withUni) s.place(S_UNIVERSITY, c, c + 1);
    for (let t = 0; t < 120; t++) { s.tick(); s.events.length = 0; }
    return s.eduLevel;
  };
  const noUni = mk(false), uni = mk(true);
  check('Universität hebt das Bildungsniveau (' + noUni.toFixed(2) + ' → ' + uni.toFixed(2) + ')', uni > noUni + 0.1);
  // Gesundheitsindex: Krankenhaus hebt ihn
  const s = new Sim(48, 48, 9); s.money = 300000; s.month = 3;
  const c = 24;
  for (let y = c - 2; y <= c + 2; y++) for (let x = c - 8; x <= c + 8; x++) s.terr[s.idx(x, y)] = 0;
  for (let x = c - 8; x <= c + 8; x++) s.place(S_ROAD, x, c);
  s.place(S_COAL, c - 8, c + 1);
  for (let x = c - 6; x <= c + 6; x++) { s.place(S_RZONE, x, c - 1); s.lvl[s.idx(x, c - 1)] = 2; }
  s.computePower(); s.computeCoverage(); s.computeStats();
  const hNo = s.healthIndex;
  s.place(S_HOSPITAL, c, c + 1);
  s.computePower(); s.dirtyCov = true; s.computeCoverage(); s.computeStats();
  check('Krankenhaus hebt den Gesundheitsindex (' + hNo + ' → ' + s.healthIndex + ')', s.healthIndex > hNo);
}

section('Erfolge (Achievements)');
{
  const s = new Sim(48, 48, 1); s.money = 0; s.pop = 1000;
  s.monthlyBudget();
  check('Erfolg „1.000 Einwohner“ freigeschaltet', s.achievements.pop1k === true);
  const s2 = new Sim(48, 48, 1); s2.money = 300000; s2.pop = 100;
  s2.monthlyBudget();
  check('Erfolg „Volle Kassen“ bei viel Geld', s2.achievements.rich === true);
  check('Nicht erfüllte Erfolge bleiben gesperrt', !s2.achievements.pop5k);
}

section('Save/Load: Finanzierung, Bezirke, Erfolge, Dreckwasser');
{
  const s = new Sim(64, 64, 4242); s.money = 100000; s.month = 3;
  const c = 32;
  for (let x = c - 8; x <= c + 8; x++) { s.terr[s.idx(x, c)] = 0; s.terr[s.idx(x, c - 1)] = 0; }
  for (let x = c - 8; x <= c + 8; x++) s.place(S_ROAD, x, c);
  s.place(S_COAL, c - 8, c + 1);
  for (let x = c - 6; x <= c + 6; x++) { s.place(S_RZONE, x, c - 1); s.lvl[s.idx(x, c - 1)] = 2; }
  s.funding.police = 1.4; s.funding.health = 0.7;
  for (let x = c - 4; x <= c + 4; x++) s.district[s.idx(x, c - 1)] = 3;
  s.districts.push({ id: 3, name: 'Altstadt' });
  s.achievements.rich = true;
  for (let t = 0; t < 60; t++) { s.tick(); s.events.length = 0; }
  const s2 = Sim.load(s.serialize());
  check('Finanzierung überlebt Save/Load', Math.abs(s2.funding.police - 1.4) < 1e-9 && Math.abs(s2.funding.health - 0.7) < 1e-9);
  let distOk = s2.districts.length === 1 && s2.districts[0].name === 'Altstadt';
  for (let i = 0; i < 64 * 64 && distOk; i++) if (s2.district[i] !== s.district[i]) distOk = false;
  check('Bezirke überleben Save/Load', distOk);
  check('Erfolge überleben Save/Load', s2.achievements.rich === true);
  check('Zustands-Hash identisch (bitgenau)', hashSim(s2) === hashSim(s));
}

section('Stadtname & Cheat-Flag im Spielstand');
{
  const s = new Sim(48, 48, 5);
  s.cityName = 'Teststadt';
  s.cheated = true;
  const s2 = Sim.load(s.serialize());
  check('cityName überlebt Save/Load', s2.cityName === 'Teststadt');
  check('cheated-Flag überlebt Save/Load', s2.cheated === true);
}

console.log('\n' + (fail === 0 ? '🎉' : '💥') + ' Unit-Tests: ' + pass + ' bestanden, ' + fail + ' fehlgeschlagen');
process.exit(fail === 0 ? 0 : 1);
