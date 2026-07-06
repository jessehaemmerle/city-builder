/* ============================================================
 * RETROPOLIS — Sprite-Engine
 * Alle Texturen werden hier als 16-Bit-Pixel-Art im Code erzeugt
 * (ASCII-Pixelart + prozedurale Kacheln), keine externen Assets.
 * ============================================================ */
'use strict';

const TILE = 16;

const Sprites = (() => {

  // ---------- Basis-Palette (SNES-inspiriert) ----------
  const P = {
    K: '#1a1a29', // Outline dunkel
    W: '#f2f2ef', // Weiß
    w: '#c7cfdd', // Hellgrau
    g: '#93a1b8', // Grau
    d: '#5c6784', // Dunkelgrau
    D: '#3a4258', // sehr dunkel
    r: '#c9484f', // Rot
    R: '#8d3742', // Dunkelrot
    o: '#e08438', // Orange
    O: '#a85a28', // Dunkelorange
    y: '#f0d95c', // Gelb
    Y: '#c2a12e', // Dunkelgelb
    b: '#4f8fdc', // Blau
    B: '#2f5fa8', // Dunkelblau
    c: '#7ad0e0', // Cyan / Glas
    C: '#3f96b8', // Dunkelcyan
    n: '#8a5a33', // Holzbraun
    N: '#5b3a22', // Dunkelbraun
    e: '#4e9b47', // Gras
    E: '#3a7a38', // Gras dunkel
    l: '#6fc25a', // Gras hell
    t: '#2c6e31', // Baum dunkel
    T: '#3f8f3f', // Baum
    s: '#d8b56a', // Sand / Weg
    m: '#9aa0ad', // Metall hell
    M: '#565c6b', // Metall dunkel
    x: '#232735', // Fenster dunkel
    q: '#9ce8ff', // Fenster beleuchtet
    f: '#ff9e2c', // Feuer orange
    F: '#ffd93b', // Feuer gelb
    u: '#e86a17', // Feuer tief
    p: '#e39ac2', // Blüten rosa
    v: '#7a5cb8', // Violett (Casino)
    A: '#54545e', // Asphalt
    a: '#44444d', // Asphalt dunkel
    S: '#a8b0bf', // Gehsteig
  };

  const store = {};   // name -> canvas ODER [frame,frame,...]

  function cv(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  // Deterministischer RNG für prozedurale Kacheln
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // ASCII-Art -> Canvas
  function art(rows, extra) {
    const h = rows.length, w = rows[0].length;
    const c = cv(w, h), x = c.getContext('2d');
    for (let j = 0; j < h; j++) {
      if (rows[j].length !== w) throw new Error('Sprite-Zeile ' + j + ' hat Länge ' + rows[j].length + ' statt ' + w + ': "' + rows[j] + '"');
      for (let i = 0; i < w; i++) {
        const ch = rows[j][i];
        if (ch === '.') continue;
        const col = (extra && extra[ch]) || P[ch];
        if (!col) throw new Error('Unbekannte Farbe "' + ch + '" in Sprite');
        x.fillStyle = col;
        x.fillRect(i, j, 1, 1);
      }
    }
    return c;
  }

  // ---------- Terrain: prozedural ----------
  function grassTile(seed) {
    const c = cv(TILE, TILE), x = c.getContext('2d'), r = rng(seed);
    x.fillStyle = P.e; x.fillRect(0, 0, TILE, TILE);
    for (let i = 0; i < 26; i++) {
      x.fillStyle = r() < 0.5 ? P.E : P.l;
      x.fillRect((r() * TILE) | 0, (r() * TILE) | 0, 1, 1);
    }
    if (seed % 3 === 0) { // vereinzelte Blümchen
      x.fillStyle = r() < 0.5 ? P.y : P.p;
      x.fillRect((r() * 14 + 1) | 0, (r() * 14 + 1) | 0, 1, 1);
    }
    return c;
  }

  function waterTile(frame) {
    const c = cv(TILE, TILE), x = c.getContext('2d'), r = rng(777);
    x.fillStyle = '#2f6fc4'; x.fillRect(0, 0, TILE, TILE);
    x.fillStyle = '#265ba6';
    for (let i = 0; i < 20; i++) x.fillRect((r() * TILE) | 0, (r() * TILE) | 0, 2, 1);
    // wandernde Wellenkämme
    x.fillStyle = '#5a9cf8';
    for (let j = 0; j < 4; j++) {
      const y = (j * 4 + frame) % TILE;
      const off = (j * 5 + frame * 2) % TILE;
      x.fillRect(off, y, 3, 1);
      x.fillRect((off + 9) % TILE, y, 2, 1);
    }
    x.fillStyle = '#bfe3ff';
    x.fillRect((3 + frame * 4) % TILE, (7 + frame) % TILE, 1, 1);
    return c;
  }

  function sandTile(seed) {
    const c = cv(TILE, TILE), x = c.getContext('2d'), r = rng(seed);
    x.fillStyle = P.s; x.fillRect(0, 0, TILE, TILE);
    for (let i = 0; i < 18; i++) {
      x.fillStyle = r() < 0.5 ? '#c39d58' : '#e8cd8a';
      x.fillRect((r() * TILE) | 0, (r() * TILE) | 0, 1, 1);
    }
    return c;
  }

  function rubbleTile() {
    const c = cv(TILE, TILE), x = c.getContext('2d'), r = rng(4242);
    x.fillStyle = '#6b6257'; x.fillRect(0, 0, TILE, TILE);
    for (let i = 0; i < 70; i++) {
      const cols = ['#4d463d', '#8a8072', '#3a352e', '#9c9484', P.N];
      x.fillStyle = cols[(r() * cols.length) | 0];
      x.fillRect((r() * TILE) | 0, (r() * TILE) | 0, (r() * 2 + 1) | 0, 1);
    }
    x.strokeStyle = 'rgba(0,0,0,0.35)'; x.strokeRect(0.5, 0.5, 15, 15);
    return c;
  }

  // ---------- Straße: 16 Autotile-Varianten (Maske N=1 E=2 S=4 W=8) ----------
  function roadTile(mask) {
    const c = cv(TILE, TILE), x = c.getContext('2d'), r = rng(90 + mask);
    x.fillStyle = P.A; x.fillRect(0, 0, TILE, TILE);
    for (let i = 0; i < 12; i++) {
      x.fillStyle = P.a;
      x.fillRect((r() * TILE) | 0, (r() * TILE) | 0, 1, 1);
    }
    const N = mask & 1, E = mask & 2, S = mask & 4, W = mask & 8;
    // Gehsteig-Ränder an nicht verbundenen Seiten
    x.fillStyle = P.S;
    if (!N) x.fillRect(0, 0, 16, 2);
    if (!S) x.fillRect(0, 14, 16, 2);
    if (!W) x.fillRect(0, 0, 2, 16);
    if (!E) x.fillRect(14, 0, 2, 16);
    x.fillStyle = '#7e8697';
    if (!N) x.fillRect(0, 2, 16, 1);
    if (!S) x.fillRect(0, 13, 16, 1);
    if (!W) x.fillRect(2, 0, 1, 16);
    if (!E) x.fillRect(13, 0, 1, 16);
    // Mittellinien (gelb, gestrichelt) Richtung verbundener Seiten
    x.fillStyle = P.y;
    if (N) { x.fillRect(7, 1, 1, 2); x.fillRect(7, 5, 1, 2); }
    if (S) { x.fillRect(7, 9, 1, 2); x.fillRect(7, 13, 1, 2); }
    if (W) { x.fillRect(1, 7, 2, 1); x.fillRect(5, 7, 2, 1); }
    if (E) { x.fillRect(9, 7, 2, 1); x.fillRect(13, 7, 2, 1); }
    if (mask === 0) { x.fillRect(5, 7, 2, 1); x.fillRect(9, 7, 2, 1); }
    return c;
  }

  // ---------- Stromleitung: Autotile, transparent (über Terrain) ----------
  function wireTile(mask) {
    const c = cv(TILE, TILE), x = c.getContext('2d');
    const N = mask & 1, E = mask & 2, S = mask & 4, W = mask & 8;
    x.fillStyle = '#26262e'; // Kabel
    if (N) x.fillRect(7, 0, 1, 8);
    if (S) x.fillRect(7, 8, 1, 8);
    if (W) x.fillRect(0, 4, 8, 1);
    if (E) x.fillRect(8, 4, 8, 1);
    if (!N && !E && !S && !W) { x.fillRect(4, 4, 8, 1); }
    // Mast
    x.fillStyle = P.N; x.fillRect(6, 3, 1, 11);
    x.fillStyle = P.n; x.fillRect(7, 3, 1, 11);
    x.fillStyle = P.N; x.fillRect(4, 4, 7, 1);
    x.fillStyle = P.n; x.fillRect(4, 3, 7, 1);
    // Isolatoren
    x.fillStyle = P.w;
    x.fillRect(4, 2, 1, 1); x.fillRect(10, 2, 1, 1);
    // Schatten
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(5, 14, 5, 1);
    return c;
  }

  // ---------- Zonen-Markierung (Level 0) ----------
  const LETTER = {
    R: ['XX.', 'X.X', 'XX.', 'X.X', 'X.X'],
    C: ['.XX', 'X..', 'X..', 'X..', '.XX'],
    I: ['XXX', '.X.', '.X.', '.X.', 'XXX'],
  };
  function zoneTile(letter, color, dark) {
    const c = cv(TILE, TILE), x = c.getContext('2d');
    x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(1, 1, 14, 14);
    x.fillStyle = color;
    for (let i = 1; i < 15; i += 3) { // gestrichelter Rahmen
      x.fillRect(i, 1, 2, 1); x.fillRect(i, 14, 2, 1);
      x.fillRect(1, i, 1, 2); x.fillRect(14, i, 1, 2);
    }
    const rows = LETTER[letter];
    x.fillStyle = dark;
    for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++)
      if (rows[j][i] === 'X') x.fillRect(7 + i, 6 + j, 1, 1);
    x.fillStyle = color;
    for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++)
      if (rows[j][i] === 'X') x.fillRect(6 + i, 5 + j, 1, 1);
    return c;
  }

  // ---------- Feuer (3 Frames, prozedural) ----------
  function fireTile(frame) {
    const c = cv(TILE, TILE), x = c.getContext('2d'), r = rng(1000 + frame * 31);
    for (let i = 0; i < 60; i++) {
      const fx = (r() * 12 + 2) | 0;
      const fy = (r() * r() * 13 + 2) | 0; // dichter unten
      const yy = 15 - fy;
      const d = Math.abs(fx - 7.5) / 7.5 + fy / 14;
      x.fillStyle = d < 0.55 ? P.F : (d < 0.95 ? P.f : P.u);
      x.fillRect(fx, yy, r() < 0.4 ? 2 : 1, r() < 0.5 ? 2 : 1);
    }
    x.fillStyle = P.F; x.fillRect(6 + frame % 2, 10, 3, 4);
    return c;
  }

  // Rauch-Puff (für Industrie/Kohle, 2 Frames)
  function smokeTile(frame) {
    const c = cv(8, 8), x = c.getContext('2d'), r = rng(555 + frame);
    for (let i = 0; i < 14; i++) {
      x.fillStyle = r() < 0.5 ? 'rgba(200,204,214,0.8)' : 'rgba(150,155,168,0.8)';
      x.fillRect((r() * 6 + 1) | 0, (r() * 6 + 1) | 0, 2, 1);
    }
    return c;
  }

  // ---------- Hafen 32x32 prozedural (Kran, Halle, Container, Kai) ----------
  function portSprite() {
    const c = cv(32, 32), x = c.getContext('2d');
    // Kai-Fläche
    x.fillStyle = P.m; x.fillRect(0, 14, 32, 15);
    x.fillStyle = P.M;
    for (let i = 0; i < 40; i++) x.fillRect((i * 7) % 32, 14 + (i * 5) % 15, 1, 1);
    // Kaimauer unten
    x.fillStyle = P.K; x.fillRect(0, 28, 32, 2);
    x.fillStyle = P.N; x.fillRect(0, 27, 32, 1);
    for (let px = 2; px < 32; px += 7) { // Poller
      x.fillStyle = P.K; x.fillRect(px, 25, 2, 3);
    }
    // Lagerhalle links
    x.fillStyle = P.K; x.fillRect(1, 5, 14, 12);
    x.fillStyle = P.d; x.fillRect(2, 6, 12, 4);   // Dach
    x.fillStyle = P.D; for (let px = 2; px < 14; px += 2) x.fillRect(px, 6, 1, 4);
    x.fillStyle = P.n; x.fillRect(2, 10, 12, 6);  // Wand
    x.fillStyle = P.M; x.fillRect(5, 12, 6, 4);   // Tor
    x.fillStyle = P.K; x.fillRect(4, 12, 1, 4); x.fillRect(11, 12, 1, 4);
    // Containerstapel (bunt, versetzt)
    const cols = [P.r, P.b, P.y, P.T, P.o, P.v];
    let k = 0;
    for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
      const bx = 17 + col * 5, by = 17 + row * 4;
      x.fillStyle = P.K; x.fillRect(bx - 1, by - 1, 6, 5);
      x.fillStyle = cols[k++ % cols.length]; x.fillRect(bx, by, 4, 3);
    }
    // Kran rechts oben
    x.fillStyle = P.K;
    x.fillRect(21, 0, 3, 14);            // Turm
    x.fillRect(21, 1, 11, 2);            // Ausleger
    x.fillStyle = P.o; x.fillRect(22, 2, 1, 11);
    x.fillStyle = P.K; x.fillRect(29, 3, 1, 5); // Seil
    x.fillStyle = P.y; x.fillRect(28, 8, 3, 2); // Container am Haken
    // Schatten
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, 30, 32, 1);
    return c;
  }

  // ---------- Stadion 32x32 prozedural (Ellipsen-Ringe) ----------
  function stadiumSprite() {
    const c = cv(32, 32), x = c.getContext('2d');
    for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) {
      const dx = (i - 15.5) / 15.5, dy = (j - 15.5) / 14.5;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 1) continue;
      let col;
      if (d > 0.92) col = P.K;
      else if (d > 0.78) col = (j % 2 === 0) ? P.w : P.g;              // Außenwand
      else if (d > 0.72) col = P.K;
      else if (d > 0.5) col = ((i + j) % 4 < 2) ? P.b : P.r;           // Sitzreihen
      else if (d > 0.44) col = P.K;
      else col = ((i ^ j) & 1) ? P.e : P.l;                            // Rasen
      x.fillStyle = col; x.fillRect(i, j, 1, 1);
    }
    // Spielfeld-Linien
    x.fillStyle = P.W;
    x.fillRect(15, 10, 1, 12); x.fillRect(13, 14, 5, 1); x.fillRect(13, 17, 5, 1);
    x.fillRect(13, 14, 1, 4); x.fillRect(17, 14, 1, 4);
    // Flutlichter
    x.fillStyle = P.F;
    x.fillRect(3, 3, 2, 2); x.fillRect(27, 3, 2, 2); x.fillRect(3, 27, 2, 2); x.fillRect(27, 27, 2, 2);
    return c;
  }

  // ---------- Schiene: Autotile (Maske N=1 E=2 S=4 W=8) ----------
  function railTile(mask) {
    const c = cv(TILE, TILE), x = c.getContext('2d');
    let N = mask & 1, E = mask & 2, S = mask & 4, W = mask & 8;
    if (!N && !E && !S && !W) { E = 2; W = 8; } // Stummel
    const tie = '#6b4a2d', rail = '#c0c6d4', railD = '#3a4258', ballast = '#7d7f86';
    if (N || S) {
      const y0 = N ? 0 : 4, y1 = S ? 15 : 11;
      x.fillStyle = ballast; x.fillRect(4, y0, 8, y1 - y0 + 1);
      x.fillStyle = tie;
      for (let yy = y0 + 1; yy <= y1; yy += 3) x.fillRect(3, yy, 10, 1);
      x.fillStyle = rail; x.fillRect(5, y0, 1, y1 - y0 + 1); x.fillRect(10, y0, 1, y1 - y0 + 1);
      x.fillStyle = railD; x.fillRect(6, y0, 1, y1 - y0 + 1); x.fillRect(11, y0, 1, y1 - y0 + 1);
    }
    if (E || W) {
      const x0 = W ? 0 : 4, x1 = E ? 15 : 11;
      x.fillStyle = ballast; x.fillRect(x0, 4, x1 - x0 + 1, 8);
      x.fillStyle = tie;
      for (let xx = x0 + 1; xx <= x1; xx += 3) x.fillRect(xx, 3, 1, 10);
      x.fillStyle = rail; x.fillRect(x0, 5, x1 - x0 + 1, 1); x.fillRect(x0, 10, x1 - x0 + 1, 1);
      x.fillStyle = railD; x.fillRect(x0, 6, x1 - x0 + 1, 1); x.fillRect(x0, 11, x1 - x0 + 1, 1);
    }
    return c;
  }

  // ---------- Brücke (Straße/Schiene über Wasser) ----------
  function bridgeTile(mask, kind) {
    const c = cv(TILE, TILE), x = c.getContext('2d');
    const N = mask & 1, E = mask & 2, S = mask & 4, W = mask & 8;
    const vert = (N || S) && !(E || W);
    const deck = '#9b7442', deckD = '#7a5a32', rail = '#4a3018';
    // Deck
    if (vert) {
      x.fillStyle = deck; x.fillRect(2, 0, 12, 16);
      x.fillStyle = deckD; for (let yy = 0; yy < 16; yy += 3) x.fillRect(2, yy, 12, 1);
      x.fillStyle = rail; x.fillRect(2, 0, 1, 16); x.fillRect(13, 0, 1, 16);
      x.fillStyle = P.K; x.fillRect(1, 0, 1, 16); x.fillRect(14, 0, 1, 16);
    } else if ((E || W) && !(N || S)) {
      x.fillStyle = deck; x.fillRect(0, 2, 16, 12);
      x.fillStyle = deckD; for (let xx = 0; xx < 16; xx += 3) x.fillRect(xx, 2, 1, 12);
      x.fillStyle = rail; x.fillRect(0, 2, 16, 1); x.fillRect(0, 13, 16, 1);
      x.fillStyle = P.K; x.fillRect(0, 1, 16, 1); x.fillRect(0, 14, 16, 1);
    } else {
      x.fillStyle = deck; x.fillRect(0, 0, 16, 16);
      x.fillStyle = deckD;
      for (let yy = 0; yy < 16; yy += 3) x.fillRect(0, yy, 16, 1);
      x.fillStyle = P.K; x.strokeStyle = P.K;
    }
    // Fahrbahn / Gleis obendrauf
    const g = c.getContext('2d');
    if (kind === 'road') {
      if (vert) {
        g.fillStyle = P.A; g.fillRect(4, 0, 8, 16);
        g.fillStyle = P.y; g.fillRect(7, 1, 1, 2); g.fillRect(7, 6, 1, 2); g.fillRect(7, 11, 1, 2);
      } else {
        g.fillStyle = P.A; g.fillRect(0, 4, 16, 8);
        g.fillStyle = P.y; g.fillRect(1, 7, 2, 1); g.fillRect(6, 7, 2, 1); g.fillRect(11, 7, 2, 1);
      }
    } else if (kind === 'rail') {
      g.drawImage(railTile(mask), 0, 0);
    }
    return c;
  }

  // ---------- Tornado (2 Frames) ----------
  const TORNADO0 = art([
    '..ggwggwggwgg...',
    '.gwggwggwggwgg..',
    '..gggwggwggg....',
    '...ggwggwggg....',
    '...gwggwggg.....',
    '....ggwggg......',
    '....gwggg.......',
    '.....gggg.......',
    '.....ggg........',
    '......gg........',
    '......gg........',
    '.....ggg........',
    '......gg........',
    '......g.........',
    '.....gg.........',
    '................',
  ]);
  const TORNADO1 = art([
    '.gwggwggwggwgg..',
    '..ggwggwggwgg...',
    '...gwggwgggg....',
    '...gggwggwgg....',
    '....ggwgggg.....',
    '....gwggwg......',
    '.....ggwgg......',
    '.....gggg.......',
    '......ggg.......',
    '......gg........',
    '.....gg.........',
    '......gg........',
    '.....gg.........',
    '......g.........',
    '......gg........',
    '................',
  ]);

  // ---------- UFO ----------
  const UFO = art([
    '................',
    '......KKKK......',
    '.....KccqcK.....',
    '....KccqqccK....',
    '..KKKKKKKKKKKK..',
    '.KmmgmmgmmgmmgK.',
    '..KKKKKKKKKKKK..',
    '...KqK.KqK.KqK..',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ]);

  // ---------- Nacht-Varianten: dunkler, Fenster (q) leuchten ----------
  function nightify(src) {
    const n = cv(src.width, src.height), x = n.getContext('2d');
    x.drawImage(src, 0, 0);
    const id = x.getImageData(0, 0, n.width, n.height), d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      if (r === 156 && g === 232 && b === 255) { // q → warmes Fensterlicht
        d[i] = 255; d[i + 1] = 224; d[i + 2] = 102;
      } else {
        d[i] = r * 0.38 | 0;
        d[i + 1] = g * 0.44 | 0;
        d[i + 2] = Math.min(255, b * 0.72 + 22) | 0;
      }
    }
    x.putImageData(id, 0, 0);
    return n;
  }

  // ============================================================
  // ASCII-PIXELART: GEBÄUDE (16x16)
  // ============================================================

  const TREE = art([
    '................',
    '......KKK.......',
    '.....KTTTKK.....',
    '....KTlTTTTK....',
    '...KTTTTlTTTK...',
    '...KtTTTTTTtK...',
    '..KTTlTTTTTTTK..',
    '..KtTTTTTlTTtK..',
    '...KtTTTTTTtK...',
    '....KttTTttK....',
    '.....KKttKK.....',
    '.......KNK......',
    '.......KNK......',
    '......KNNNK.....',
    '....EEKKKKKEE...',
    '................',
  ]);

  const R1 = art([
    '................',
    '................',
    '......KKKK......',
    '....KKrrrrKK....',
    '...KrrrrrrrrK...',
    '..KrrRrrrrRrrK..',
    '.KrrrrrrrrrrrrK.',
    '.KKKKKKKKKKKKKK.',
    '.KWWWWWWWWWWWWK.',
    '.KWxxWWWWWWxxWK.',
    '.KWxxWWKKWWxxWK.',
    '.KWWWWWKNWWWWWK.',
    '.KWWWWWKNWWWWWK.',
    '.KKKKKKKKKKKKKK.',
    '.EEEEEEEEEEEEEE.',
    '................',
  ]);

  const R2 = art([
    '................',
    '.....KKKKKK.....',
    '...KKooooooKK...',
    '..KooooOoooooK..',
    '.KooooooooooooK.',
    '.KKKKKKKKKKKKKK.',
    '.KwwwwwwwwwwwwK.',
    '.KwxxwwxxwwxxwK.',
    '.KwxxwwxxwwxxwK.',
    '.KwwwwwwwwwwwwK.',
    '.KwxxwwKKwwxxwK.',
    '.KwxxwwKNwwxxwK.',
    '.KwwwwwKNwwwwwK.',
    '.KKKKKKKKKKKKKK.',
    '.EEEEEEEEEEEEEE.',
    '................',
  ]);

  const R3 = art([
    '................',
    '.KKKKKKKKKKKKKK.',
    '.KddddddddddddK.',
    '.KKKKKKKKKKKKKK.',
    '.KrxxrrxxrrxxrK.',
    '.KrxxrrxxrrxxrK.',
    '.KrrrrrrRrrrrrK.',
    '.KrxxrrxxrrxxrK.',
    '.KrxxrrxxrrxxrK.',
    '.KrrRrrrrrrRrrK.',
    '.KrxxrrKKrrxxrK.',
    '.KrxxrrKNrrxxrK.',
    '.KrrrrrKNrrrrrK.',
    '.KKKKKKKKKKKKKK.',
    '.EEEEEEEEEEEEEE.',
    '................',
  ]);

  const R4 = art([
    '.KKKKKKKKKKKKKK.',
    '.KggggggggggggK.',
    '.KgxqgxqgxqgxqK.',
    '.KgxqgxqgxqgxqK.',
    '.KggggggggggggK.',
    '.KgqxgqxgqxgqxK.',
    '.KgqxgqxgqxgqxK.',
    '.KggggggggggggK.',
    '.KgxqgxqgxqgxqK.',
    '.KgxqgxqgxqgxqK.',
    '.KggggggggggggK.',
    '.KgxqggKKggxqgK.',
    '.KgxqggKNggxqgK.',
    '.KKKKKKKKKKKKKK.',
    '.EEEEEEEEEEEEEE.',
    '................',
  ]);

  const C1 = art([
    '................',
    '................',
    '................',
    '..KKKKKKKKKKKK..',
    '.KwwwwwwwwwwwwK.',
    '.KrWrWrWrWrWrWK.',
    '.KrWrWrWrWrWrWK.',
    '.KwwwwwwwwwwwwK.',
    '.KwqqqqwwqqqqwK.',
    '.KwqqqqwwqqqqwK.',
    '.KwqqqqwwKNNKwK.',
    '.KwqqqqwwKNNKwK.',
    '.KwwwwwwwwwwwwK.',
    '.KKKKKKKKKKKKKK.',
    '.EEEEEEEEEEEEEE.',
    '................',
  ]);

  const C2 = art([
    '................',
    '.KKKKKKKKKKKKKK.',
    '.KyyyyyyyyyyyyK.',
    '.KyKKyyKKyyKKyK.',
    '.KKKKKKKKKKKKKK.',
    '.KwwwwwwwwwwwwK.',
    '.KwqxwwqxwwqxwK.',
    '.KwqxwwqxwwqxwK.',
    '.KwwwwwwwwwwwwK.',
    '.KwqqqqqqwwKNwK.',
    '.KwqqqqqqwwKNwK.',
    '.KwqqqqqqwwKNwK.',
    '.KwwwwwwwwwwwwK.',
    '.KKKKKKKKKKKKKK.',
    '.EEEEEEEEEEEEEE.',
    '................',
  ]);

  const C3 = art([
    '................',
    '.KKKKKKKKKKKKKK.',
    '.KmmmmmmmmmmmmK.',
    '.KcccCcccCcccCK.',
    '.KcqcCcccCcqcCK.',
    '.KcccCcccCcccCK.',
    '.KCCCCCCCCCCCCK.',
    '.KcccCcqcCcccCK.',
    '.KcqcCcccCcqcCK.',
    '.KCCCCCCCCCCCCK.',
    '.KcccCcccCcccCK.',
    '.KcqcCcqcCcqcCK.',
    '.KmmmmmKNmmmmmK.',
    '.KKKKKKKKKKKKKK.',
    '.EEEEEEEEEEEEEE.',
    '................',
  ]);

  const C4 = art([
    '.......K........',
    '.......K........',
    '....KKKKKKKK....',
    '....KccqcccK....',
    '....KccccqcK....',
    '.KKKKKKKKKKKKKK.',
    '.KcqccqccqccqcK.',
    '.KcqccqccqccqcK.',
    '.KCCCCCCCCCCCCK.',
    '.KcqccqccqccqcK.',
    '.KcqccqccqccqcK.',
    '.KCCCCCCCCCCCCK.',
    '.KmmmmmKNmmmmmK.',
    '.KKKKKKKKKKKKKK.',
    '.EEEEEEEEEEEEEE.',
    '................',
  ]);

  const I1 = art([
    '................',
    '................',
    '................',
    '................',
    '.KKKKKKKKKKKKKK.',
    '.KmMmMmMmMmMmMK.',
    '.KmMmMmMmMmMmMK.',
    '.KKKKKKKKKKKKKK.',
    '.KnnnnnnnnnnnnK.',
    '.KnxxnnnnnnxxnK.',
    '.KnxxnKKKKnxxnK.',
    '.KnxxnKMMKnxxnK.',
    '.KnnnnKMMKnnnnK.',
    '.KKKKKKKKKKKKKK.',
    '.EEEEEEEEEEEEEE.',
    '................',
  ]);

  const I2 = art([
    '..KKKK..........',
    '..KmMK..........',
    '..KmMK..........',
    '..KmMK..........',
    '.KKKKKKKKKKKKKK.',
    '.KdDDdDDdDDdDDK.',
    '.KdDDdDDdDDdDDK.',
    '.KKKKKKKKKKKKKK.',
    '.KggggggggggggK.',
    '.KgxxggxxggxxgK.',
    '.KgxxggxxggxxgK.',
    '.KggggKMMKggggK.',
    '.KggggKMMKggggK.',
    '.KKKKKKKKKKKKKK.',
    '.EEEEEEEEEEEEEE.',
    '................',
  ]);

  const I3 = art([
    '..KKKK....KKKK..',
    '..KmMK....KmMK..',
    '..KmMK....KmMK..',
    '.KKKKKKKKKKKKKK.',
    '.KmmmmmmmmmmmmK.',
    '.KmMMmmMMmmMMmK.',
    '.KmmmmmmmmmmmmK.',
    '.KKKKKKKKKKKKKK.',
    '.KddddddddddddK.',
    '.KdqxddqxddqxdK.',
    '.KdqxddqxddqxdK.',
    '.KddddKMMKddddK.',
    '.KddddKMMKddddK.',
    '.KKKKKKKKKKKKKK.',
    '.EEEEEEEEEEEEEE.',
    '................',
  ]);

  const I4 = art([
    '..KKKK....KKKK..',
    '..KmMK....KmMK..',
    '..KmMK....KmMK..',
    '.KKKKKKKKKKKKKK.',
    '.KoOoOoOoOoOoOK.',
    '.KoOoOoOoOoOoOK.',
    '.KKKKKKKKKKKKKK.',
    '.KMMMMMMMMMMMMK.',
    '.KMqxMMqxMMqxMK.',
    '.KMqxMMqxMMqxMK.',
    '.KMMMMMMMMMMMMK.',
    '.KyKyKKMMKyKyKK.',
    '.KyKyKKMMKyKyKK.',
    '.KKKKKKKKKKKKKK.',
    '.EEEEEEEEEEEEEE.',
    '................',
  ]);

  const PARK = art([
    'eeTTTeeeeleTTTee',
    'eTTTTTeeeTTTTTee',
    'eTtTlTeeeTlTtTee',
    'eeTTTeeeeeTTTeee',
    'eeeNeeeeeeeNeeee',
    'eeeeeessseeeeeee',
    'eleeesssseeeepee',
    'eeeesssseeeeeeee',
    'eeesssseeebbbeee',
    'eesssseeebbccbee',
    'eessseeebbccccbe',
    'eyssleeebccccbbe',
    'eesseeeebbccbbee',
    'eeesseeeebbbbeee',
    'eeeesseeeeeeelee',
    'eepeeeeeyeeeeeee',
  ]);

  const POLICE = art([
    '................',
    '................',
    '.KKKKKKKKKKKKKK.',
    '.KwwwwwwwwwwwwK.',
    '.KbbbbbbbbbbbbK.',
    '.KbbbbbWWbbbbbK.',
    '.KbbbbbWWbbbbbK.',
    '.KwwwwwwwwwwwwK.',
    '.KwxxwwxxwwxxwK.',
    '.KwxxwwxxwwxxwK.',
    '.KwwwwwKKwwwwwK.',
    '.KwxxwwKNwwxxwK.',
    '.KwxxwwKNwwxxwK.',
    '.KKKKKKKKKKKKKK.',
    '.EEEEEEEEEEEEEE.',
    '................',
  ]);

  const FIREDEP = art([
    '................',
    '................',
    '.KKKKKKKKKKKKKK.',
    '.KwwwwwwwwwwwwK.',
    '.KrrrrrrrrrrrrK.',
    '.KrrrWWWWWWrrrK.',
    '.KrrrrrrrrrrrrK.',
    '.KwwwwwwwwwwwwK.',
    '.KwKKKKwwKKKKwK.',
    '.KwKMMKwwKMMKwK.',
    '.KwKMMKwwKMMKwK.',
    '.KwKMMKwwKMMKwK.',
    '.KwwwwwwwwwwwwK.',
    '.KKKKKKKKKKKKKK.',
    '.EEEEEEEEEEEEEE.',
    '................',
  ]);

  const SCHOOL = art([
    '......K.........',
    '......Krr.......',
    '......Krr.......',
    '......K.........',
    '.KKKKKKKKKKKKKK.',
    '.KooooooooooooK.',
    '.KooooWWWWooooK.',
    '.KooooWKKWooooK.',
    '.KooooooooooooK.',
    '.KoxxooxxooxxoK.',
    '.KoxxooxxooxxoK.',
    '.KooooKNNKooooK.',
    '.KooooKNNKooooK.',
    '.KKKKKKKKKKKKKK.',
    '.EEEEEEEEEEEEEE.',
    '................',
  ]);

  const HOSPITAL = art([
    '................',
    '.KKKKKKKKKKKKKK.',
    '.KWWWWWWWWWWWWK.',
    '.KWWWWWrrWWWWWK.',
    '.KWWWWrrrrWWWWK.',
    '.KWWWWrrrrWWWWK.',
    '.KWWWWWrrWWWWWK.',
    '.KWWWWWWWWWWWWK.',
    '.KWxxWWxxWWxxWK.',
    '.KWxxWWxxWWxxWK.',
    '.KWWWWWWWWWWWWK.',
    '.KWxxWWKKWWxxWK.',
    '.KWxxWWKNWWxxWK.',
    '.KKKKKKKKKKKKKK.',
    '.EEEEEEEEEEEEEE.',
    '................',
  ]);

  // Windrad: 2 Frames (Rotor dreht)
  const WIND0 = art([
    '..W.........W...',
    '...W.......W....',
    '....W.....W.....',
    '.....W...W......',
    '......KKK.......',
    '......KmK.......',
    '......KKK.......',
    '.......w........',
    '.......w........',
    '.......w........',
    '......ww........',
    '......ww........',
    '......ww........',
    '.....KwwK.......',
    '.....KKKK.......',
    '................',
  ]);
  const WIND1 = art([
    '.......W........',
    '.......W........',
    '.......W........',
    '.......W........',
    '..WWWWKKKWWWW...',
    '......KmK.......',
    '......KKK.......',
    '.......w........',
    '.......w........',
    '.......w........',
    '......ww........',
    '......ww........',
    '......ww........',
    '.....KwwK.......',
    '.....KKKK.......',
    '................',
  ]);

  // Kohlekraftwerk 32x32 (2x2 Kacheln)
  const COAL = art([
    '................................',
    '................................',
    '................................',
    '...KKKK.....KKKK................',
    '..KmmMMK...KmmMMK...............',
    '..KmmMMK...KmmMMK...............',
    '..KmmMMK...KmmMMK...............',
    '..KmmMMK...KmmMMK...............',
    '..KmmMMK...KmmMMK...............',
    '..KmmMMK...KmmMMK...............',
    '..KmmMMK...KmmMMK...............',
    '.KKKKKKKKKKKKKKKKKK.............',
    '.KmmmmmmmmmmmmmmmmK.............',
    '.KmMMmmMMmmMMmmMMmK.............',
    '.KmmmmmmmmmmmmmmmmK.............',
    '.KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.',
    '.KddddddddddddddddddddddddddddK.',
    '.KdqxdqxdqxdqxdqxdqxdqxdqxdqxdK.',
    '.KdqxdqxdqxdqxdqxdqxdqxdqxdqxdK.',
    '.KddddddddddddddddddddddddddddK.',
    '.KddddddddddddddddddddddddddddK.',
    '.KdqxdqxdqxdqxdqxdqxdqxdqxdqxdK.',
    '.KdqxdqxdqxdqxdqxdqxdqxdqxdqxdK.',
    '.KddddddddddddddddddddddddddddK.',
    '.KddddddKMMMMKddddddddddddddddK.',
    '.KddddddKMMMMKdddddddxxxxxddddK.',
    '.KddddddKMMMMKddddddxxxxxxxdddK.',
    '.KddddddKMMMMKdddddxxxxxxxxxddK.',
    '.KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.',
    '.EEEEEEEEEEEEEEEEEEEEEEEEEEEEEE.',
    '................................',
    '................................',
  ]);

  // Wasserturm
  const WTOWER = art([
    '................',
    '....KKKKKKKK....',
    '...KbbbbbbbbK...',
    '...KbWbbbbbbK...',
    '...KbWbbbbbbK...',
    '...KbbbbbbbbK...',
    '...KBBBBBBBBK...',
    '....KKKKKKKK....',
    '.....Kn..nK.....',
    '.....Kn..nK.....',
    '....Kn....nK....',
    '....Kn....nK....',
    '...Kn......nK...',
    '...Kn......nK...',
    '..KKKK....KKKK..',
    '................',
  ]);

  // Pumpwerk (muss am Wasser stehen)
  const PUMP = art([
    '................',
    '................',
    '..KKKKKKKKKK....',
    '..KbbbbbbbbK....',
    '..KbWWbbbbbK....',
    '..KbbbbbbbbK....',
    '..KKKKKKKKKKKK..',
    '..KwwwwwwwwKMK..',
    '..KwqqwwqqwKMK..',
    '..KwqqwwqqwKMK..',
    '..KwwwwwwwwKMK..',
    '..KwwwKKwwwKMK..',
    '..KwwwKNwwwKMK..',
    '..KKKKKKKKKKKK..',
    '.EEEEEEEEEEEEEE.',
    '................',
  ]);

  // Rathaus
  const TOWNHALL = art([
    '.......Ky.......',
    '.......Kyy......',
    '.......K........',
    '......KKKK......',
    '.....KwwwwK.....',
    '....KwwwwwwK....',
    '.KKKKKKKKKKKKKK.',
    '.KWWWWWWWWWWWWK.',
    '.KWwWWwWWwWWwWK.',
    '.KWwWWwWWwWWwWK.',
    '.KWWWWWWWWWWWWK.',
    '.KWxxWWKKWWxxWK.',
    '.KWxxWWKNWWxxWK.',
    '.KKKKKKKKKKKKKK.',
    '.EEEEEEEEEEEEEE.',
    '................',
  ]);

  // Denkmal (Obelisk)
  const MONUMENT = art([
    '................',
    '.......KK.......',
    '......KwwK......',
    '......KwwK......',
    '......KwgK......',
    '......KwgK......',
    '......KwgK......',
    '......KwgK......',
    '.....KwwggK.....',
    '.....KwwggK.....',
    '....KKKKKKKK....',
    '....KggggggK....',
    '...KKKKKKKKKK...',
    '.eeyeeeeeeepeee.',
    '.eeeeeeeeeeeeee.',
    '................',
  ]);

  // Casino (Neon leuchtet nachts)
  const CASINO = art([
    '................',
    '.KKKKKKKKKKKKKK.',
    '.KvvvvvvvvvvvvK.',
    '.KvqvqvqvqvqvqK.',
    '.KvvvvvvvvvvvvK.',
    '.KKKKKKKKKKKKKK.',
    '.KppppppppppppK.',
    '.KpqqppqqppqqpK.',
    '.KpqqppqqppqqpK.',
    '.KppppppppppppK.',
    '.KpqqppKKppqqpK.',
    '.KpqqppKNppqqpK.',
    '.KppppppppppppK.',
    '.KKKKKKKKKKKKKK.',
    '.EEEEEEEEEEEEEE.',
    '................',
  ]);

  // Luxus-Wohnturm (hoher Landwert, Stufe 4)
  const R5 = art([
    '....KKKKKKKK....',
    '....KWWccWWK....',
    '....KWWccWWK....',
    '.KKKKKKKKKKKKKK.',
    '.KWcqcWccWcqcWK.',
    '.KWcqcWccWcqcWK.',
    '.KWWWWWWWWWWWWK.',
    '.KWcqcWccWcqcWK.',
    '.KWcqcWccWcqcWK.',
    '.KWWWWWWWWWWWWK.',
    '.KWcqcWccWcqcWK.',
    '.KWcqcWKKWcqcWK.',
    '.KWWWWWKNWWWWWK.',
    '.KKKKKKKKKKKKKK.',
    '.EEEEEEEEEEEEEE.',
    '................',
  ]);

  // Gold-Büroturm (hoher Landwert, Stufe 4)
  const C5 = art([
    '.......KK.......',
    '......KyyK......',
    '....KKKKKKKK....',
    '....KyqyyqyK....',
    '....KyqyyqyK....',
    '.KKKKKKKKKKKKKK.',
    '.KyqyYyqyYyqyYK.',
    '.KyqyYyqyYyqyYK.',
    '.KYYYYYYYYYYYYK.',
    '.KyqyYyqyYyqyYK.',
    '.KyqyYyqyYyqyYK.',
    '.KYYYYYYYYYYYYK.',
    '.KmmmmmKNmmmmmK.',
    '.KKKKKKKKKKKKKK.',
    '.EEEEEEEEEEEEEE.',
    '................',
  ]);

  // Solaranlage (ab 1994)
  const SOLAR = art([
    '................',
    '.KKKKKK..KKKKKK.',
    '.KccbbK..KccbbK.',
    '.KbbbbK..KbbbbK.',
    '.KKKKKK..KKKKKK.',
    '...Km......Km...',
    '.KKKKKK..KKKKKK.',
    '.KccbbK..KccbbK.',
    '.KbbbbK..KbbbbK.',
    '.KKKKKK..KKKKKK.',
    '...Km......Km...',
    '................',
    '.eyeeleeeeepeee.',
    '................',
    '.EEEEEEEEEEEEEE.',
    '................',
  ]);

  // Bus-Haltestelle (H-Schild + Wartehäuschen)
  const BUSSTOP = art([
    '................',
    '.KKK............',
    '.KyyK...........',
    '.KyyK...........',
    '.KKKK.KKKKKKKKK.',
    '..Kn..KmmmmmmmK.',
    '..Kn..KccccccmK.',
    '..Kn..KccccccmK.',
    '..Kn..KccccccmK.',
    '..Kn..Kn....nK..',
    '..Kn..Kn....nK..',
    '..Kn..Kn....nK..',
    '..KK..KK....KK..',
    '.EEEEEEEEEEEEEE.',
    '................',
    '................',
  ]);

  // Bahnhof (Uhr + Bahnsteig)
  const TRAINSTATION = art([
    '................',
    '..KKKKKKKKKKKK..',
    '.KrrrrrrrrrrrrK.',
    '.KrrrrrrrrrrrrK.',
    '.KKKKKKKKKKKKKK.',
    '.KooooWWWWooooK.',
    '.KooooWKKWooooK.',
    '.KooooWWWWooooK.',
    '.KooooooooooooK.',
    '.KoqqooKKooqqoK.',
    '.KoqqooKNooqqoK.',
    '.KKKKKKKKKKKKKK.',
    '.KmmmmmmmmmmmmK.',
    '.KKKKKKKKKKKKKK.',
    '.EEEEEEEEEEEEEE.',
    '................',
  ]);

  // U-Bahn-Eingang (U-Schild + Treppe)
  const SUBWAY = art([
    '................',
    '...KKKKKKK......',
    '...KbbbbbK......',
    '...KbWbWbK......',
    '...KbWbWbK......',
    '...KbWWWbK......',
    '...KbbbbbK......',
    '....KnK.........',
    '....KnK.........',
    '..KKKKKKKKKKK...',
    '..KxxxxxxxxxK...',
    '..KmxxxxxxxmK...',
    '..KmmxxxxxmmK...',
    '..KmmmxxxmmmK...',
    '..KKKKKKKKKKK...',
    '.EEEEEEEEEEEEEE.',
  ]);

  // ---------- Berater-Porträts (16x16) ----------
  const SKIN = { H: '#e8b58a', h2: '#c98f66' };
  const ADV_FINANCE = art([
    '................',
    '....gggggggg....',
    '...gggggggggg...',
    '...ggHHHHHHgg...',
    '...gHHHHHHHHg...',
    '...KHHHHHHHHK...',
    '..HKWWKHHKWWKH..',
    '...HHHHHHHHHH...',
    '...HHHggggHHH...',
    '...HHHHHHHHHH...',
    '....HHHHHHHH....',
    '..KKKdddddKKK...',
    '.KKddddddddddKK.',
    '.KdddddWWdddddK.',
    '.KdddddrrdddddK.',
    '................',
  ], SKIN);
  const ADV_POWER = art([
    '................',
    '....yyyyyyyy....',
    '...yyyyyyyyyy...',
    '..KyyyyyyyyyyK..',
    '..KKKKKKKKKKKK..',
    '...KHHHHHHHHK...',
    '...HHKHHHHKHH...',
    '...HHHHHHHHHH...',
    '...HHHHKKHHHH...',
    '...HHHHHHHHHH...',
    '....HHHHHHHH....',
    '..KKKoooooKKK...',
    '.KKooooooooooKK.',
    '.KoooooyyoooooK.',
    '.KooooooooooooK.',
    '................',
  ], SKIN);
  const ADV_ENV = art([
    '......TT........',
    '....TTTTTTTT....',
    '...TTTTTTTTTT...',
    '...TTHHHHHHTT...',
    '...TTHHHHHHTT...',
    '...KHHHHHHHHK...',
    '...HHKHHHHKHH...',
    '...HHHHHHHHHH...',
    '...HHHHKKHHHH...',
    '...HHHHHHHHHH...',
    '....HHHHHHHH....',
    '..KKKeeeeeKKK...',
    '.KKeeeeeeeeeeKK.',
    '.KeeeeelleeeeeK.',
    '.KeeeeeeeeeeeeK.',
    '................',
  ], SKIN);
  const ADV_FIRE = art([
    '................',
    '....rrrrrrrr....',
    '...rrrrrrrrrr...',
    '..KrrrryyrrrrK..',
    '..KKKKKKKKKKKK..',
    '...KHHHHHHHHK...',
    '...HHKHHHHKHH...',
    '...HHHHHHHHHH...',
    '...HHNNNNNNHH...',
    '...HHHHKKHHHH...',
    '....HHHHHHHH....',
    '..KKKrrrrrKKK...',
    '.KKrrrrrrrrrrKK.',
    '.KrrrrryyrrrrrK.',
    '.KrrrrrrrrrrrrK.',
    '................',
  ], SKIN);
  const ADV_WATER = art([
    '................',
    '....bbbbbbbb....',
    '...bbbbbbbbbb...',
    '..KbbbbWWbbbbK..',
    '..KKKKKKKKKKKK..',
    '...KHHHHHHHHK...',
    '...HHKHHHHKHH...',
    '...HHHHHHHHHH...',
    '...HHHHKKHHHH...',
    '...HHHHHHHHHH...',
    '....HHHHHHHH....',
    '..KKKbbbbbKKK...',
    '.KKbbbbbbbbbbKK.',
    '.KbbbbbWWbbbbbK.',
    '.KbbbbbbbbbbbbK.',
    '................',
  ], SKIN);

  // ---------- Aufbau des Sprite-Stores ----------
  const night = {};   // Nacht-Varianten, gleiche Struktur wie store

  function init() {
    store.grass = [grassTile(1), grassTile(2), grassTile(3), grassTile(4)];
    store.water = [waterTile(0), waterTile(1), waterTile(2), waterTile(3)];
    store.sand = [sandTile(11), sandTile(12)];
    store.tree = TREE;
    store.rubble = rubbleTile();
    store.road = []; store.wire = []; store.rail = [];
    store.bridgeRoad = []; store.bridgeRail = [];
    for (let m = 0; m < 16; m++) {
      store.road[m] = roadTile(m);
      store.wire[m] = wireTile(m);
      store.rail[m] = railTile(m);
      store.bridgeRoad[m] = bridgeTile(m, 'road');
      store.bridgeRail[m] = bridgeTile(m, 'rail');
    }
    store.zoneR = zoneTile('R', '#6fe06f', '#1d5c1d');
    store.zoneC = zoneTile('C', '#6fb8ff', '#173a66');
    store.zoneI = zoneTile('I', '#ffd35c', '#6b520f');
    store.r = [null, R1, R2, R3, R4];
    store.c = [null, C1, C2, C3, C4];
    store.i = [null, I1, I2, I3, I4];
    store.rLux = R5;
    store.cLux = C5;
    store.park = PARK;
    store.police = POLICE;
    store.firedep = FIREDEP;
    store.school = SCHOOL;
    store.hospital = HOSPITAL;
    store.wind = [WIND0, WIND1];
    store.coal = COAL;
    store.solar = SOLAR;
    store.busstop = BUSSTOP;
    store.trainstation = TRAINSTATION;
    store.subway = SUBWAY;
    store.port = portSprite();
    store.stadium = stadiumSprite();
    store.wtower = WTOWER;
    store.pump = PUMP;
    store.townhall = TOWNHALL;
    store.monument = MONUMENT;
    store.casino = CASINO;
    store.fire = [fireTile(0), fireTile(1), fireTile(2)];
    store.smoke = [smokeTile(0), smokeTile(1)];
    store.tornado = [TORNADO0, TORNADO1];
    store.ufo = UFO;
    store.advisors = {
      finance: ADV_FINANCE, power: ADV_POWER, env: ADV_ENV,
      fire: ADV_FIRE, water: ADV_WATER,
    };
    // Nacht-Atlas erzeugen (Fenster leuchten, Rest abgedunkelt)
    for (const key in store) {
      const v = store[key];
      if (key === 'advisors') continue;
      if (Array.isArray(v)) night[key] = v.map(c => c ? nightify(c) : null);
      else night[key] = nightify(v);
    }
  }

  function get(name, frame, isNight) {
    const src = isNight && night[name] ? night : store;
    const s = src[name];
    if (Array.isArray(s)) return s[frame % s.length];
    return s;
  }

  return { init, get, store, night, art, P };
})();
