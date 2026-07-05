/* ============================================================
 * E2E-Test im echten Browser (Playwright + Chromium).
 * Startet einen eingebauten Static-Server für web/ und spielt
 * die wichtigsten Abläufe durch. Aufruf: npm run test:e2e
 *
 * Umgebungsvariablen:
 *   PLAYWRIGHT_PATH  Modulpfad zu playwright (Default: 'playwright')
 *   CHROMIUM_PATH    Chromium-Binary (Default: Playwright-Download)
 * ============================================================ */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const WEB = path.join(__dirname, '..', 'web');
const PORT = 8123;
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  const url = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const file = path.join(WEB, path.normalize(url).replace(/^(\.\.[/\\])+/, ''));
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

let fails = 0;
function check(name, cond) {
  console.log((cond ? '✅' : '❌') + ' ' + name);
  if (!cond) fails++;
}

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
  const launchOpts = {};
  if (process.env.CHROMIUM_PATH) launchOpts.executablePath = process.env.CHROMIUM_PATH;
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('dialog', d => d.accept());

  await page.goto('http://localhost:' + PORT + '/index.html');
  await page.waitForTimeout(800);

  check('Titelbildschirm sichtbar', await page.isVisible('#titleScreen'));

  // Neues Spiel (fester Seed)
  await page.click('#btnNew');
  await page.waitForTimeout(300);
  check('Szenario-Liste hat 5 Einträge', await page.locator('.scenOpt').count() === 5);
  await page.fill('#seedInput', '93');
  await page.waitForTimeout(200);
  await page.click('#btnNgStart');
  await page.waitForTimeout(500);
  check('Spiel gestartet', !(await page.isVisible('#titleScreen')));

  const px = await page.evaluate(() => {
    const c = document.getElementById('game');
    const x = c.getContext('2d');
    const d = x.getImageData(c.width / 2 - 50, c.height / 2 - 50, 100, 100).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
    return sum;
  });
  check('Canvas rendert (Chunk-Renderer)', px > 100000);

  const cx = 640, cy = 400;
  // Straße, Windräder, Leitung, Wasserturm, Zonen, Schiene
  await page.keyboard.press('3');
  await page.mouse.move(cx - 200, cy); await page.mouse.down();
  await page.mouse.move(cx + 200, cy, { steps: 10 }); await page.mouse.up();
  await page.keyboard.press('8');
  await page.mouse.click(cx - 160, cy - 96);
  await page.mouse.click(cx - 120, cy - 96);
  await page.keyboard.press('4');
  await page.mouse.move(cx - 120, cy - 64); await page.mouse.down();
  await page.mouse.move(cx + 180, cy - 64, { steps: 10 }); await page.mouse.up();
  await page.click('#tool_wtower');
  await page.mouse.click(cx - 60, cy - 96);
  await page.keyboard.press('5');
  await page.mouse.move(cx - 80, cy - 32); await page.mouse.down();
  await page.mouse.move(cx + 100, cy - 32, { steps: 8 }); await page.mouse.up();
  await page.keyboard.press('6');
  await page.mouse.move(cx - 80, cy + 40); await page.mouse.down();
  await page.mouse.move(cx + 20, cy + 40, { steps: 6 }); await page.mouse.up();
  await page.keyboard.press('7');
  await page.mouse.move(cx + 60, cy + 40); await page.mouse.down();
  await page.mouse.move(cx + 140, cy + 40, { steps: 6 }); await page.mouse.up();
  await page.click('#tool_rail');
  await page.mouse.move(cx - 200, cy + 90); await page.mouse.down();
  await page.mouse.move(cx + 100, cy + 90, { steps: 8 }); await page.mouse.up();
  await page.waitForTimeout(200);

  const built = await page.evaluate(() => {
    const s = window.RETRO.sim;
    const counts = {};
    for (let i = 0; i < s.w * s.h; i++) counts[s.st[i]] = (counts[s.st[i]] || 0) + 1;
    return { road: counts[1] || 0, rail: counts[15] || 0, wtower: counts[16] || 0 };
  });
  check('Straßen + Schienen + Wasserturm gebaut', built.road > 10 && built.rail > 5 && built.wtower === 1);

  // Undo/Redo
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  const railGone = await page.evaluate(() => {
    const s = window.RETRO.sim;
    for (let i = 0; i < s.w * s.h; i++) if (s.st[i] === 15) return false;
    return true;
  });
  check('Undo entfernt Schienen', railGone);
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(200);

  // Simulation laufen lassen
  await page.click('#spd3');
  await page.waitForTimeout(10000);
  const stats = await page.evaluate(() => ({
    pop: window.RETRO.sim.pop,
    hist: window.RETRO.sim.history.length,
    traffic: (() => { const s = window.RETRO.sim; let m = 0; for (let i = 0; i < s.w * s.h; i++) if (s.traffic[i] > m) m = s.traffic[i]; return m; })(),
  }));
  console.log('   Sim:', JSON.stringify(stats));
  check('Bevölkerung wächst (' + stats.pop + ')', stats.pop > 0);
  check('Pendlerverkehr entsteht (max ' + stats.traffic + ')', stats.traffic > 0);

  // Wachstums-Diagnose im Info-Panel
  await page.keyboard.press('Escape');
  await page.mouse.click(cx, cy - 32);
  await page.waitForTimeout(300);
  const hasDiag = await page.evaluate(() => document.getElementById('infoPanel').innerText.includes('Wachstums-Check') || document.getElementById('infoPanel').innerText.includes('Growth check'));
  check('Diagnose-Einträge vorhanden', hasDiag);

  // Sprachumschaltung
  await page.click('#btnBudget');
  await page.waitForTimeout(200);
  await page.selectOption('#langSel', 'en');
  await page.waitForTimeout(300);
  const enLabel = await page.evaluate(() => document.querySelector('#tool_rz .tName').textContent);
  check('Sprachumschaltung DE→EN (Wohnen→' + enLabel + ')', enLabel === 'Homes');
  await page.selectOption('#langSel', 'de');
  await page.waitForTimeout(200);
  await page.click('#btnBudgetClose');

  // Kredit + Statistik + Overlay
  await page.click('#btnBudget');
  await page.click('#btnLoan');
  await page.waitForTimeout(200);
  const debt = await page.evaluate(() => window.RETRO.sim.debt);
  check('Kredit aufgenommen', debt === 5000);
  await page.click('#btnRepay');
  await page.click('#btnBudgetClose');
  await page.click('#btnStats');
  await page.waitForTimeout(200);
  check('Statistik-Panel offen', await page.isVisible('#statsPanel'));
  await page.click('#btnStatsClose');
  for (const ov of ['power', 'water', 'traffic', 'landv']) {
    await page.selectOption('#overlaySel', ov);
    await page.waitForTimeout(150);
  }
  await page.selectOption('#overlaySel', '');

  // --- Bürger: Info-Klick auf ein bewohntes Haus ---
  const citizen = await page.evaluate(() => {
    const s = window.RETRO.sim;
    for (let i = 0; i < s.w * s.h; i++)
      if (s.st[i] === 3 && s.lvl[i] > 0) return window.RETRO.citizenOf(i);
    return null;
  });
  check('Bürger:in pro Haus generiert (' + (citizen && citizen.name) + ')', !!(citizen && citizen.name));
  const citStable = await page.evaluate(() => {
    const s = window.RETRO.sim;
    for (let i = 0; i < s.w * s.h; i++)
      if (s.st[i] === 3 && s.lvl[i] > 0)
        return window.RETRO.citizenOf(i).name === window.RETRO.citizenOf(i).name;
    return false;
  });
  check('Bürgername deterministisch', citStable);

  // --- Cheat-Code: "geld" (pausiert, damit die Kasse stillsteht) ---
  await page.click('#spd0');
  await page.waitForTimeout(200);
  const moneyBefore = await page.evaluate(() => window.RETRO.sim.money);
  await page.keyboard.type('geld');
  await page.waitForTimeout(300);
  const afterCheat = await page.evaluate(() => ({ m: window.RETRO.sim.money, c: window.RETRO.sim.cheated }));
  check('Cheat „geld“ wirkt (+5000, markiert)', afterCheat.m === moneyBefore + 5000 && afterCheat.c === true);
  await page.click('#spd3');

  // --- Solar: 1990 gesperrt ---
  const solarLocked = await page.evaluate(() =>
    document.getElementById('tool_solar').classList.contains('locked'));
  check('Solar 1990 gesperrt (Era-Lock)', solarLocked);

  // --- Stadt-Link: Roundtrip ---
  const shareOk = await page.evaluate(() => {
    const link = window.RETRO.shareLink();
    const loaded = window.RETRO.tryImportCode(link);
    return loaded.pop === window.RETRO.sim.pop && link.includes('#city=');
  });
  check('Stadt-Link Roundtrip (Serialisieren → Link → Laden)', shareOk);

  // --- BBS-Terminal ---
  await page.click('#btnBbs');
  await page.waitForTimeout(400);
  check('BBS-Terminal offen', await page.isVisible('#bbsPanel'));
  await page.locator('.bbsItem').first().click(); // [1] Veröffentlichen
  await page.waitForTimeout(300);
  const linkLen = await page.evaluate(() => {
    const ta = document.querySelector('#bbsBody textarea');
    return ta ? ta.value.length : 0;
  });
  check('BBS erzeugt Stadt-Link (' + (linkLen / 1024).toFixed(1) + ' KB)', linkLen > 500);
  await page.screenshot({ path: require('path').join(__dirname, '..', 'docs', 'screenshot-bbs.png') });
  // Zurück → Zeitung
  await page.locator('.bbsItem', { hasText: '←' }).click();
  await page.waitForTimeout(200);
  await page.locator('.bbsItem').nth(3).click(); // [4] Zeitung
  await page.waitForTimeout(200);
  const newsOpen = await page.evaluate(() => document.getElementById('bbsBody').innerText.length > 10);
  check('Zeitung im BBS lesbar', newsOpen);
  await page.locator('.bbsItem', { hasText: '←' }).click();
  await page.locator('.bbsItem', { hasText: /AUFLEGEN|HANG UP/ }).click();
  await page.waitForTimeout(200);

  // --- Postkarte ---
  await page.click('#btnCamera');
  await page.waitForTimeout(600);
  check('Postkarten-Dialog offen', await page.isVisible('#postcardPanel'));
  const pcSrc = await page.evaluate(() => document.getElementById('postcardImg').src.length);
  check('Postkarte gerendert (' + Math.round(pcSrc / 1024) + ' KB PNG)', pcSrc > 10000);
  await page.click('#btnPcClose');

  // Speichern/Laden über Slots
  await page.click('#btnSave');
  await page.waitForTimeout(200);
  await page.click('#btnMenu');
  await page.waitForTimeout(300);
  await page.click('#btnContinue');
  await page.waitForTimeout(600);
  const pop2 = await page.evaluate(() => window.RETRO.sim.pop);
  check('Slot-Laden liefert Bevölkerung (' + pop2 + ')', pop2 > 0);

  if (errors.length) {
    console.log('\n❌ JS-FEHLER:');
    errors.slice(0, 20).forEach(e => console.log('  ' + e));
    fails++;
  } else {
    console.log('\n✅ Keine JS-Fehler.');
  }
  console.log(fails === 0 ? '\n🎉 E2E-Tests bestanden' : '\n💥 ' + fails + ' E2E-Checks fehlgeschlagen');
  await browser.close();
  server.close();
  process.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error('TESTFEHLER:', e); process.exit(1); });
