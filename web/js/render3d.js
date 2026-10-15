/* ============================================================
 * RETROPOLIS — 3D-Comic-Renderer (Three.js, Cel-Shading)
 * Detaillierter Boden (OpenTTD-inspiriert: Grasbüschel, Wellen,
 * Küsten, Fahrbahnmarkierungen, Schwellen) + prozedurale, mehrteilige
 * Gebäudemodelle (Dächer, Fenster, Schornsteine, Türme) mit schwarzen
 * Comic-Umrissen und weichen Schatten. Vertex-Farben je Bauteil.
 * Nutzt globales THREE (vendor/three.min.js). Export: window.Render3D
 * ============================================================ */
(function () {
  'use strict';
  if (typeof THREE === 'undefined') { window.Render3D = null; return; }

  // Struktur-Konstanten (müssen zu sim.js passen)
  const S_NONE = 0, S_ROAD = 1, S_WIRE = 2, S_RZONE = 3, S_CZONE = 4, S_IZONE = 5,
    S_PARK = 6, S_POLICE = 7, S_FIREDEP = 8, S_SCHOOL = 9, S_HOSPITAL = 10,
    S_WIND = 11, S_COAL = 12, S_STADIUM = 13, S_RUBBLE = 14,
    S_RAIL = 15, S_WTOWER = 16, S_PUMP = 17, S_TOWNHALL = 18, S_MONUMENT = 19, S_CASINO = 20,
    S_SOLAR = 21, S_BUSSTOP = 22, S_TRAINSTATION = 23, S_SUBWAY = 24, S_PORT = 25, S_PIPE = 26,
    S_HOTEL = 27, S_AMUSE = 28, S_HIGHWAY = 29, S_LANDFILL = 30, S_INCINER = 31,
    S_RECYCLE = 32, S_AIRPORT = 33, S_NUCLEAR = 34, S_TREATMENT = 35, S_UNIVERSITY = 36,
    S_RUNWAY = 37, S_PIER = 38, S_LIBRARY = 39;
  const T_GRASS = 0, T_WATER = 1, T_SAND = 2, T_TREE = 3;

  const BIG = { [S_COAL]: 1, [S_STADIUM]: 1, [S_PORT]: 1, [S_AMUSE]: 1, [S_LANDFILL]: 1, [S_AIRPORT]: 1, [S_NUCLEAR]: 1, [S_TREATMENT]: 1, [S_UNIVERSITY]: 1 };

  // ---- deterministischer Mini-PRNG je Kachel (für Variation) ----
  function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967295; }

  // ============================================================
  //  Prozedurale Geometrie-Bausteine (vertex-gefärbt, zusammengeführt)
  // ============================================================
  const _c = new THREE.Color();
  function colorize(geo, hex) {
    _c.set(hex);
    const n = geo.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return geo;
  }
  // Box mit Basis bei y (unten), Mittelpunkt (x,z)
  function box(w, h, d, x, y, z, c) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y + h / 2, z); return colorize(g.toNonIndexed(), c); }
  function cyl(rt, rb, h, x, y, z, c, seg) { const g = new THREE.CylinderGeometry(rt, rb, h, seg || 10); g.translate(x, y + h / 2, z); return colorize(g.toNonIndexed(), c); }
  function cone(r, h, x, y, z, c, seg) { const g = new THREE.ConeGeometry(r, h, seg || 6); g.translate(x, y + h / 2, z); return colorize(g.toNonIndexed(), c); }
  function pyr(r, h, x, y, z, c, rot) { const g = new THREE.ConeGeometry(r, h, 4); if (rot) g.rotateY(rot); g.translate(x, y + h / 2, z); return colorize(g.toNonIndexed(), c); }
  function ball(r, x, y, z, c) { const g = new THREE.IcosahedronGeometry(r, 0); g.translate(x, y + r, z); return colorize(g.toNonIndexed(), c); }
  // Satteldach (Prisma): Breite w (x), Tiefe d (z), Höhe h, First entlang z
  function gable(w, h, d, x, y, z, c) {
    const hw = w / 2, hd = d / 2;
    const v = [
      -hw, 0, -hd, hw, 0, -hd, 0, h, -hd,   // Giebel vorn
      -hw, 0, hd, 0, h, hd, hw, 0, hd,       // Giebel hinten
      -hw, 0, -hd, 0, h, -hd, -hw, 0, hd, -hw, 0, hd, 0, h, -hd, 0, h, hd, // Dachfläche links
      hw, 0, -hd, hw, 0, hd, 0, h, -hd, hw, 0, hd, 0, h, hd, 0, h, -hd,   // Dachfläche rechts
    ];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3));
    g.translate(x, y, z); g.computeVertexNormals();
    return colorize(g, c);
  }
  function merge(parts) {
    let total = 0; for (const p of parts) total += p.attributes.position.count;
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
    let o = 0;
    for (const p of parts) {
      pos.set(p.attributes.position.array, o * 3);
      nor.set((p.attributes.normal || { array: new Float32Array(p.attributes.position.count * 3) }).array, o * 3);
      col.set(p.attributes.color.array, o * 3);
      o += p.attributes.position.count; p.dispose();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }
  // Umriss: Kopie, deren Vertices entlang der Normalen nach außen geschoben sind
  function outlineGeo(geo, amt) {
    const src = geo.attributes.position.array, nor = geo.attributes.normal.array;
    const n = geo.attributes.position.count, pos = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) pos[i] = src[i] + nor[i] * amt;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }

  // Fensterreihen an einer Box (kleine helle/dunkle Felder)
  let LIGHTS = null; // sammelt Fensterflächen für die Nacht-Lichter des aktuellen Modells
  function windows(parts, w, hBody, d, yBase, wallCol, winCol, floors, cols) {
    const fh = hBody / (floors + 0.5), step = fh;
    for (let f = 0; f < floors; f++) {
      const yy = yBase + fh * 0.6 + f * step;
      for (let c = 0; c < cols; c++) {
        const xx = -w / 2 + (w / (cols + 1)) * (c + 1), ww = w / (cols + 2.5);
        parts.push(box(ww, fh * 0.5, 0.02, xx, yy, d / 2 + 0.005, winCol));
        parts.push(box(ww, fh * 0.5, 0.02, xx, yy, -d / 2 - 0.005, winCol));
        // Nacht: nur ein Teil der Fenster ist erleuchtet (deterministisch)
        if (LIGHTS && ((f * 7 + c * 3) % 5) < 3) {
          LIGHTS.push(box(ww, fh * 0.5, 0.02, xx, yy, d / 2 + 0.014, '#ffffff'));
          LIGHTS.push(box(ww, fh * 0.5, 0.02, xx, yy, -d / 2 - 0.014, '#ffffff'));
        }
      }
    }
  }

  // ============================================================
  //  Gebäudemodelle je Typ (+ Level für Zonen)
  // ============================================================
  const MODELS = {}; // key "type_level" -> {geo, outline}
  function houseModel(level) {
    const p = [];
    if (level <= 1) {
      // Kleines Einfamilienhaus mit Spitzdach, Tür, Schornstein
      p.push(box(0.68, 0.42, 0.6, 0, 0, 0, '#d8c7a8'));
      p.push(pyr(0.58, 0.34, 0, 0.42, 0, '#b0442f', Math.PI / 4));
      p.push(box(0.14, 0.24, 0.02, 0, 0, 0.3, '#5b3a22'));           // Tür
      p.push(box(0.12, 0.12, 0.02, -0.18, 0.22, 0.3, '#9ce8ff'));
      p.push(box(0.12, 0.12, 0.02, 0.18, 0.22, 0.3, '#9ce8ff'));
      p.push(box(0.08, 0.18, 0.08, 0.2, 0.5, -0.12, '#8a4a3a'));     // Schornstein
    } else if (level === 2) {
      p.push(box(0.76, 0.72, 0.68, 0, 0, 0, '#e0d2b0'));
      p.push(gable(0.84, 0.3, 0.76, 0, 0.72, 0, '#9c3f2c'));
      windows(p, 0.76, 0.72, 0.68, 0, '#e0d2b0', '#9ce8ff', 2, 2);
      p.push(box(0.14, 0.26, 0.02, 0, 0, 0.345, '#5b3a22'));
    } else if (level === 3) {
      p.push(box(0.82, 1.3, 0.78, 0, 0, 0, '#cdbf9c'));
      p.push(box(0.9, 0.08, 0.86, 0, 1.3, 0, '#6b5a3a'));            // Dachkante
      windows(p, 0.82, 1.3, 0.78, 0, '#cdbf9c', '#8fd8ff', 4, 3);
      p.push(box(0.2, 0.12, 0.2, 0.2, 1.38, 0, '#8a8a92'));          // Dachaufbau
    } else {
      // Hochhaus
      p.push(box(0.8, 2.1, 0.8, 0, 0, 0, '#b9c3cf'));
      p.push(box(0.86, 0.1, 0.86, 0, 2.1, 0, '#6b7686'));
      windows(p, 0.8, 2.1, 0.8, 0, '#b9c3cf', '#aee6ff', 6, 3);
      p.push(box(0.26, 0.2, 0.26, -0.15, 2.2, -0.12, '#8a94a4'));
      p.push(box(0.06, 0.3, 0.06, 0.22, 2.2, 0.18, '#c9484f'));      // Antenne
    }
    return p;
  }
  function shopModel(level) {
    const p = [];
    if (level <= 1) {
      p.push(box(0.8, 0.5, 0.7, 0, 0, 0, '#5aa0f0'));
      p.push(box(0.86, 0.08, 0.76, 0, 0.5, 0, '#2f5fa8'));
      p.push(box(0.74, 0.22, 0.02, 0, 0.1, 0.36, '#aee6ff'));        // Schaufenster
      p.push(box(0.5, 0.1, 0.02, 0, 0.36, 0.36, '#f0d95c'));         // Markise/Schild
    } else if (level === 2) {
      p.push(box(0.82, 1.0, 0.76, 0, 0, 0, '#4f8fdc'));
      windows(p, 0.82, 1.0, 0.76, 0, '#4f8fdc', '#cdeeff', 3, 3);
      p.push(box(0.88, 0.08, 0.82, 0, 1.0, 0, '#2f5fa8'));
    } else if (level === 3) {
      p.push(box(0.8, 1.7, 0.8, 0, 0, 0, '#3f78c8'));                // Glasturm
      windows(p, 0.8, 1.7, 0.8, 0, '#3f78c8', '#bfe8ff', 6, 3);
      p.push(box(0.84, 0.08, 0.84, 0, 1.7, 0, '#24456f'));
    } else {
      p.push(box(0.74, 2.6, 0.74, 0, 0, 0, '#3a6fbf'));
      windows(p, 0.74, 2.6, 0.74, 0, '#3a6fbf', '#cff0ff', 8, 3);
      p.push(box(0.5, 0.2, 0.5, 0, 2.6, 0, '#24456f'));
      p.push(box(0.05, 0.35, 0.05, 0, 2.8, 0, '#8a94a4'));
    }
    return p;
  }
  function factoryModel(level) {
    const p = [];
    const h = [0, 0.5, 0.7, 0.95, 1.2][level] || 0.6;
    p.push(box(0.86, h, 0.82, 0, 0, 0, '#c2a12e'));
    // Sägezahn-Dach
    for (let i = -1; i <= 1; i++) p.push(gable(0.26, 0.14, 0.82, i * 0.27, h, 0, '#8a7420'));
    p.push(box(0.1, 0.5 + level * 0.12, 0.1, 0.3, h, -0.2, '#6a5a3a'));  // Schornstein
    p.push(box(0.12, 0.06, 0.12, 0.3, h + 0.5 + level * 0.12, -0.2, '#4a3f28'));
    if (level >= 2) p.push(cyl(0.14, 0.14, 0.4, -0.28, 0, 0.24, '#9a8a5a'));  // Tank
    windows(p, 0.86, h, 0.82, 0, '#c2a12e', '#2a2a1a', 1, 3);
    return p;
  }
  function genericModel(h, col, roofCol) {
    const p = [box(0.84, h, 0.84, 0, 0, 0, col)];
    p.push(box(0.9, 0.08, 0.9, 0, h, 0, roofCol || '#3a4258'));
    windows(p, 0.84, h, 0.84, 0, col, '#bfe0ef', Math.max(1, Math.round(h * 2)), 3);
    return p;
  }

  function modelParts(type, level) {
    switch (type) {
      case S_RZONE: return houseModel(level);
      case S_CZONE: return shopModel(level);
      case S_IZONE: return factoryModel(level);
      case S_POLICE: { const p = genericModel(0.9, '#4f6fd0', '#2a3a7a'); p.push(box(0.1, 0.25, 0.1, 0, 0.9, 0, '#2a3a7a')); p.push(ball(0.07, 0, 1.15, 0, '#ff5a5a')); return p; }
      case S_FIREDEP: { const p = []; p.push(box(0.84, 0.7, 0.8, 0, 0, 0, '#c9484f')); p.push(box(0.9, 0.08, 0.86, 0, 0.7, 0, '#8d3742')); p.push(box(0.5, 0.45, 0.02, 0, 0.05, 0.41, '#3a2a2a')); p.push(box(0.14, 1.0, 0.14, 0.3, 0.7, -0.1, '#a83a40')); return p; }
      case S_SCHOOL: { const p = genericModel(0.85, '#e0a030', '#a06a18'); p.push(box(0.03, 0.4, 0.03, 0.36, 0.85, 0.36, '#8a8a92')); p.push(box(0.2, 0.12, 0.02, 0.46, 1.1, 0.36, '#4f8fdc')); return p; }
      case S_HOSPITAL: { const p = genericModel(1.4, '#f2f2ef', '#c7cfdd'); p.push(box(0.26, 0.26, 0.04, 0, 0.7, 0.43, '#c9484f')); p.push(box(0.08, 0.26, 0.04, 0, 0.7, 0.43, '#c9484f')); p.push(box(0.3, 0.04, 0.3, 0, 1.4, 0, '#8a94a4')); p.push(cyl(0.04, 0.04, 0.2, 0, 1.44, 0, '#5c6784')); return p; }
      case S_WIND: { const p = []; p.push(cyl(0.05, 0.08, 1.9, 0, 0, 0, '#eef2f7')); p.push(box(0.14, 0.12, 0.26, 0, 1.86, 0, '#dfe6ef')); return p; }
      case S_LIBRARY: { const p = [box(0.86, 0.12, 0.8, 0, 0, 0, '#c7c0ae')]; p.push(box(0.76, 0.62, 0.62, 0, 0.12, -0.04, '#e8dfc8')); for (let c = -2; c <= 2; c++) p.push(cyl(0.035, 0.035, 0.6, c * 0.16, 0.12, 0.32, '#f2f2ef', 8)); p.push(box(0.84, 0.08, 0.74, 0, 0.74, 0, '#b8ad92')); p.push(gable(0.84, 0.26, 0.74, 0, 0.82, 0, '#8d3742')); p.push(box(0.16, 0.26, 0.02, 0, 0.12, 0.32, '#5b3a22')); windows(p, 0.76, 0.62, 0.62, 0.12, '#e8dfc8', '#fff0c0', 1, 4); return p; }
      case S_COAL: { const p = []; p.push(box(1.5, 0.9, 1.4, 0, 0, 0, '#565c6b')); p.push(box(1.56, 0.1, 1.46, 0, 0.9, 0, '#3a4048')); p.push(cyl(0.16, 0.2, 1.3, -0.4, 0.9, -0.3, '#7a4a3a')); p.push(cyl(0.16, 0.2, 1.3, 0.1, 0.9, -0.3, '#7a4a3a')); p.push(box(0.6, 0.5, 0.5, 0.4, 0, 0.4, '#454a5a')); return p; }
      case S_SOLAR: { const p = [box(0.86, 0.12, 0.84, 0, 0, 0, '#2f3f66')]; for (let r = -1; r <= 1; r++) { const g = box(0.8, 0.03, 0.22, 0, 0.12, r * 0.27, '#1a2a52'); g.rotateX(-0.4); g.translate(0, 0.08, r * 0.27); p.push(g); } return p; }
      case S_NUCLEAR: { const p = [box(1.4, 0.6, 1.3, 0, 0, 0.2, '#c8ccd6')]; p.push(cyl(0.3, 0.42, 1.0, -0.4, 0, -0.4, '#d6dae2', 14)); p.push(cyl(0.3, 0.42, 1.0, 0.4, 0, -0.4, '#d6dae2', 14)); p.push(cyl(0.3, 0.26, 0.2, -0.4, 1.0, -0.4, '#eef2f7', 14)); p.push(cyl(0.3, 0.26, 0.2, 0.4, 1.0, -0.4, '#eef2f7', 14)); p.push(box(0.2, 0.2, 0.2, 0.5, 0.6, 0.4, '#f0d95c')); return p; }
      case S_WTOWER: { const p = []; for (const dx of [-0.12, 0.12]) for (const dz of [-0.12, 0.12]) p.push(box(0.05, 1.2, 0.05, dx, 0, dz, '#8a94a4')); p.push(cyl(0.34, 0.34, 0.5, 0, 1.2, 0, '#9ab0c8', 12)); p.push(cone(0.36, 0.2, 0, 1.7, 0, '#6a7a94', 12)); return p; }
      case S_PUMP: { const p = genericModel(0.6, '#6fa0c0', '#3f6f90'); p.push(cyl(0.12, 0.12, 0.4, 0.28, 0.6, 0.28, '#5a8aa8')); return p; }
      case S_TREATMENT: { const p = [box(1.3, 0.35, 1.2, 0, 0, 0, '#3f96b8')]; p.push(cyl(0.3, 0.3, 0.3, -0.35, 0.05, 0.3, '#2f6fa0', 14)); p.push(cyl(0.3, 0.3, 0.3, 0.35, 0.05, 0.3, '#2f6fa0', 14)); p.push(cyl(0.28, 0.28, 0.08, -0.35, 0.3, 0.3, '#7ad0e0', 14)); p.push(cyl(0.28, 0.28, 0.08, 0.35, 0.3, 0.3, '#7ad0e0', 14)); return p; }
      case S_TOWNHALL: { const p = genericModel(1.3, '#d8c89a', '#a08a5a'); p.push(box(0.3, 0.5, 0.3, 0, 1.3, 0, '#c7b98a')); p.push(cone(0.26, 0.4, 0, 1.8, 0, '#8a7450', 8)); p.push(box(0.12, 0.12, 0.02, 0, 1.5, 0.16, '#f2f2ef')); return p; }
      case S_MONUMENT: { const p = [box(0.5, 0.18, 0.5, 0, 0, 0, '#9aa0ad')]; p.push(cyl(0.12, 0.18, 1.6, 0, 0.18, 0, '#d0d0d8', 4)); p.push(pyr(0.14, 0.3, 0, 1.78, 0, '#e8e8f0', Math.PI / 4)); return p; }
      case S_CASINO: { const p = genericModel(1.4, '#b06ce0', '#7a3fb0'); p.push(cyl(0.3, 0.34, 0.2, 0, 1.4, 0, '#f0d95c', 12)); p.push(ball(0.12, 0, 1.6, 0, '#ffe066')); return p; }
      case S_HOTEL: { const p = []; p.push(box(0.82, 2.1, 0.8, 0, 0, 0, '#e5679f')); windows(p, 0.82, 2.1, 0.8, 0, '#e5679f', '#fff0d0', 7, 3); p.push(box(0.88, 0.1, 0.86, 0, 2.1, 0, '#b03f6f')); p.push(box(0.4, 0.12, 0.04, 0, 1.9, 0.42, '#f0d95c')); return p; }
      case S_AMUSE: { const p = [box(0.8, 0.3, 0.8, -0.4, 0, 0.4, '#ff8fb0')]; const ring = cyl(0.55, 0.55, 0.08, 0.3, 0.6, -0.1, '#f0d95c', 18); ring.rotateX(Math.PI / 2); p.push(ring); for (let a = 0; a < 8; a++) { const x = 0.3 + Math.cos(a / 8 * 6.28) * 0.5, y = 0.6 + Math.sin(a / 8 * 6.28) * 0.5; p.push(ball(0.07, x, y - 0.07, -0.1, a % 2 ? '#c9484f' : '#4f8fdc')); } p.push(box(0.06, 0.6, 0.06, 0.3, 0, -0.1, '#8a94a4')); return p; }
      case S_STADIUM: { const p = [cyl(0.95, 1.05, 0.5, 0, 0, 0, '#c9c9d2', 20)]; p.push(cyl(0.72, 0.72, 0.06, 0, 0.1, 0, '#4e9b47', 20)); for (let a = 0; a < 12; a++) { const x = Math.cos(a / 12 * 6.28) * 0.95, z = Math.sin(a / 12 * 6.28) * 0.95; p.push(box(0.1, 0.6, 0.1, x, 0, z, '#9a9aa6')); } return p; }
      case S_UNIVERSITY: { const p = genericModel(1.4, '#c7cfdd', '#8a94a4'); p.push(box(0.5, 0.2, 0.5, 0, 1.4, 0, '#b0b8c6')); p.push(cone(0.3, 0.4, 0, 1.6, 0, '#5c6784', 10)); for (const dx of [-0.3, 0.3]) p.push(cyl(0.05, 0.05, 0.9, dx, 0, 0.42, '#f2f2ef')); return p; }
      case S_PORT: { const p = [box(1.4, 0.4, 0.9, 0, 0, -0.3, '#5b7a8a')]; p.push(box(0.1, 1.1, 0.1, 0.4, 0.4, 0.3, '#f0d95c')); p.push(box(0.9, 0.08, 0.08, 0.1, 1.4, 0.3, '#d0b63c')); for (let i = 0; i < 3; i++) p.push(box(0.3, 0.26, 0.3, -0.5 + i * 0.35, 0, 0.45, i % 2 ? '#c9484f' : '#4f8fdc')); return p; }
      case S_AIRPORT: { const p = [box(1.5, 0.5, 0.7, 0, 0, -0.5, '#9aa0ad')]; p.push(box(1.56, 0.08, 0.76, 0, 0.5, -0.5, '#6a7080')); p.push(box(0.14, 1.1, 0.14, 0.55, 0.5, -0.3, '#c7cfdd')); p.push(cyl(0.13, 0.13, 0.22, 0.55, 1.6, -0.3, '#7ad0e0', 10)); p.push(ball(0.05, 0.55, 1.82, -0.3, '#c9484f')); return p; }
      case S_LANDFILL: { const p = [box(1.4, 0.3, 1.3, 0, 0, 0, '#7a6a4a')]; p.push(cone(0.5, 0.5, -0.2, 0.3, 0.2, '#6a5a3a', 8)); p.push(cone(0.4, 0.4, 0.4, 0.3, -0.3, '#5f4f30', 8)); return p; }
      case S_INCINER: { const p = genericModel(1.0, '#6a6a72', '#3a3a42'); p.push(cyl(0.12, 0.16, 1.3, 0.28, 1.0, -0.2, '#7a4a3a')); return p; }
      case S_RECYCLE: { const p = genericModel(0.85, '#41c46a', '#2a8a4a'); p.push(box(0.26, 0.26, 0.02, 0, 0.5, 0.43, '#f2f2ef')); return p; }
      case S_TRAINSTATION: { const p = genericModel(0.9, '#8a6ad0', '#5a3fb0'); p.push(box(1.0, 0.06, 0.4, 0, 0.9, 0.3, '#6a5a9a')); return p; }
      case S_SUBWAY: { const p = [box(0.5, 0.4, 0.5, 0, 0, 0, '#6a4fb0')]; p.push(box(0.56, 0.06, 0.56, 0, 0.4, 0, '#4a2f8a')); p.push(box(0.2, 0.3, 0.02, 0, 0, 0.26, '#2a1a4a')); p.push(box(0.12, 0.12, 0.02, 0, 0.52, 0.1, '#f0d95c')); return p; }
      case S_BUSSTOP: { const p = [box(0.5, 0.04, 0.3, 0, 0, 0.1, '#8a8a92')]; p.push(box(0.5, 0.26, 0.02, 0, 0.04, -0.03, '#aee6ff')); p.push(box(0.5, 0.05, 0.3, 0, 0.3, 0.05, '#e08438')); for (const dx of [-0.22, 0.22]) p.push(box(0.04, 0.3, 0.04, dx, 0.04, 0.18, '#6a6a72')); return p; }
      default: return genericModel(0.8, '#9aa0ad', '#5c6784');
    }
  }

  function modelFor(type, level) {
    const key = type + '_' + (level || 0);
    if (MODELS[key]) return MODELS[key];
    LIGHTS = [];
    const parts = modelParts(type, level || 0);
    const lightParts = LIGHTS; LIGHTS = null;
    const geo = merge(parts);
    const out = outlineGeo(geo, 0.035);
    const lights = lightParts.length ? merge(lightParts) : null;
    MODELS[key] = { geo, out, lights };
    return MODELS[key];
  }

  // ============================================================
  //  Renderer / Szene
  // ============================================================
  let renderer, scene, camera, raycaster, groundMesh, groundTex, groundCanvas, gctx;
  let hoverMesh, buildGroup, outlineGroup, treeGroup, waterMesh;
  let sim = null, W = 0, H = 0, dirty = true, inited = false, tileRes = 4, shadows = false;
  const cam = { az: 0.8, pol: 0.92, dist: 60, tx: 0, ty: 0 };
  const _v = new THREE.Vector2(), _ray = new THREE.Vector3();
  let sun, hemi, ambient, GRAD = null, waterPhase = 0;

  function toonGradient() {
    const data = new Uint8Array([70, 70, 70, 150, 150, 150, 210, 210, 210, 255, 255, 255, 255, 255, 255, 255]);
    const tex = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
    tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.needsUpdate = true;
    return tex;
  }

  function init(canvas) {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(48, 1, 0.5, 6000);
    raycaster = new THREE.Raycaster();
    GRAD = toonGradient();
    sun = new THREE.DirectionalLight(0xfff2d0, 1.6);
    sun.position.set(50, 90, 36); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0006;
    scene.add(sun); scene.add(sun.target);
    hemi = new THREE.HemisphereLight(0xbfe3ff, 0x56753f, 0.7); scene.add(hemi);
    ambient = new THREE.AmbientLight(0xffffff, 0.3); scene.add(ambient);
    buildGroup = new THREE.Group(); scene.add(buildGroup);
    outlineGroup = new THREE.Group(); scene.add(outlineGroup);
    treeGroup = new THREE.Group(); scene.add(treeGroup);
    const hg = new THREE.BoxGeometry(1, 0.14, 1);
    hoverMesh = new THREE.Mesh(hg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 }));
    hoverMesh.visible = false; scene.add(hoverMesh);
    initFx();
    inited = true;
  }

  function setSim(s) {
    sim = s; W = s.w; H = s.h; dirty = true;
    tileRes = Math.max(1, Math.min(8, Math.floor(2048 / Math.max(W, H))));
    shadows = (W * H) <= 160 * 160;
    renderer.shadowMap.enabled = shadows;
    buildGround();
    cam.dist = Math.max(26, Math.min(W, H) * 1.05);
    cam.tx = 0; cam.ty = 0;
    scene.background = new THREE.Color(0x8fcfff);
    scene.fog = new THREE.Fog(0x8fcfff, Math.max(W, H) * 1.4, Math.max(W, H) * 3.2);
  }

  function buildGround() {
    if (groundMesh) { scene.remove(groundMesh); groundMesh.geometry.dispose(); groundMesh.material.map.dispose(); groundMesh.material.dispose(); }
    if (waterMesh) { scene.remove(waterMesh); waterMesh.geometry.dispose(); }
    groundCanvas = document.createElement('canvas');
    groundCanvas.width = W * tileRes; groundCanvas.height = H * tileRes;
    gctx = groundCanvas.getContext('2d');
    groundTex = new THREE.CanvasTexture(groundCanvas);
    groundTex.magFilter = THREE.LinearFilter; groundTex.minFilter = THREE.LinearMipmapLinearFilter;
    groundTex.anisotropy = 4;
    const geo = new THREE.PlaneGeometry(W, H, 1, 1); geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshToonMaterial({ map: groundTex, gradientMap: GRAD });
    groundMesh = new THREE.Mesh(geo, mat); groundMesh.receiveShadow = true;
    scene.add(groundMesh);
    // leicht glitzernde Wasser-Ebene knapp über dem Boden
    const wgeo = new THREE.PlaneGeometry(W, H, 1, 1); wgeo.rotateX(-Math.PI / 2);
    waterMesh = new THREE.Mesh(wgeo, new THREE.MeshBasicMaterial({ color: 0x4f9fe0, transparent: true, opacity: 0.0 }));
    waterMesh.position.y = 0.012; scene.add(waterMesh);
  }

  function worldX(tx) { return tx - W / 2 + 0.5; }
  function worldZ(ty) { return ty - H / 2 + 0.5; }

  // Detaillierte Kachel in den Boden-Canvas malen (OpenTTD-inspiriert)
  function paintTile(x, y, night) {
    const i = sim.idx(x, y), s = sim.st[i], terr = sim.terr[i];
    const r = tileRes, px = x * r, py = y * r;
    const rnd = hash(x, y);
    const at = (tx, ty) => sim.inMap(tx, ty) ? sim.st[sim.idx(tx, ty)] : -1;
    const terrAt = (tx, ty) => sim.inMap(tx, ty) ? sim.terr[sim.idx(tx, ty)] : -1;
    // Netz-Kacheln
    if (s === S_ROAD || s === S_HIGHWAY) {
      const hw = s === S_HIGHWAY;
      gctx.fillStyle = hw ? '#b9bdc9' : '#63636d'; gctx.fillRect(px, py, r, r);
      gctx.fillStyle = hw ? '#90949e' : '#4c4c54';
      gctx.fillRect(px, py, r, Math.max(1, r * 0.12)); gctx.fillRect(px, py + r - Math.max(1, r * 0.12), r, Math.max(1, r * 0.12));
      // Mittellinie je nach Nachbarschaft (Autobahn gelb/gestrichelt)
      const nS = (j) => j === S_ROAD || j === S_HIGHWAY;
      const vert = nS(at(x, y - 1)) || nS(at(x, y + 1)), horiz = nS(at(x - 1, y)) || nS(at(x + 1, y));
      gctx.fillStyle = hw ? '#f0d95c' : '#d8d8c0';
      const t = Math.max(1, r * 0.09);
      if (vert || !horiz) gctx.fillRect(px + r / 2 - t / 2, py, t, r);
      if (horiz) gctx.fillRect(px, py + r / 2 - t / 2, r, t);
      return;
    }
    if (s === S_RAIL) {
      gctx.fillStyle = '#6a5a42'; gctx.fillRect(px, py, r, r);
      gctx.fillStyle = '#4a3f2e';
      const vert = at(x, y - 1) === S_RAIL || at(x, y + 1) === S_RAIL;
      for (let k = 0; k < r; k += Math.max(2, r / 4)) { if (vert) gctx.fillRect(px, py + k, r, Math.max(1, r * 0.12)); else gctx.fillRect(px + k, py, Math.max(1, r * 0.12), r); }
      gctx.fillStyle = '#9aa0ad';
      if (vert) { gctx.fillRect(px + r * 0.3, py, Math.max(1, r * 0.08), r); gctx.fillRect(px + r * 0.62, py, Math.max(1, r * 0.08), r); }
      else { gctx.fillRect(px, py + r * 0.3, r, Math.max(1, r * 0.08)); gctx.fillRect(px, py + r * 0.62, r, Math.max(1, r * 0.08)); }
      return;
    }
    if (s === S_WIRE || s === S_PIPE) {
      const base = terr === T_WATER ? (night ? '#1b3f7a' : '#2f6fc4') : (night ? '#2f5f30' : '#4e9b47');
      gctx.fillStyle = base; gctx.fillRect(px, py, r, r);
      gctx.fillStyle = s === S_PIPE ? '#3a8fb0' : '#8a6a3a';
      gctx.fillRect(px + r / 2 - Math.max(1, r * 0.1), py, Math.max(1, r * 0.2), r);
      return;
    }
    if (s === S_RUNWAY) { gctx.fillStyle = '#33333a'; gctx.fillRect(px, py, r, r); gctx.fillStyle = '#e8e8d8'; gctx.fillRect(px + r / 2 - 1, py, Math.max(1, r * 0.08), r); return; }
    if (s === S_PIER) { gctx.fillStyle = '#8a5a33'; gctx.fillRect(px, py, r, r); gctx.fillStyle = '#6a4423'; for (let k = 0; k < r; k += Math.max(2, r / 3)) gctx.fillRect(px, py + k, r, 1); return; }
    if (s === S_RUBBLE) { gctx.fillStyle = '#6b6257'; gctx.fillRect(px, py, r, r); gctx.fillStyle = '#56504a'; for (let d = 0; d < 3; d++) gctx.fillRect(px + hash(x + d, y) * r * 0.7, py + hash(x, y + d) * r * 0.7, Math.max(1, r * 0.2), Math.max(1, r * 0.2)); return; }
    // Boden unter Gebäuden: Pflaster
    if (s !== S_NONE && s !== S_PARK) {
      gctx.fillStyle = night ? '#3a3f36' : '#6a7258'; gctx.fillRect(px, py, r, r);
      return;
    }
    // Wasser mit Wellen + Küstensaum
    if (terr === T_WATER) {
      gctx.fillStyle = night ? '#1b3f7a' : '#2f6fc4'; gctx.fillRect(px, py, r, r);
      gctx.fillStyle = night ? '#2a55a0' : '#4f8fdc';
      const wy = py + ((Math.floor(waterPhase + x + y)) % 2 === 0 ? r * 0.3 : r * 0.6);
      gctx.fillRect(px, wy, r, Math.max(1, r * 0.12));
      // Küste: heller Saum, wenn Land benachbart
      let coast = false;
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) { const tt = terrAt(x + dx, y + dy); if (tt !== -1 && tt !== T_WATER) coast = true; }
      if (coast) { gctx.fillStyle = night ? '#3a6aa8' : '#7fb0e8'; gctx.fillRect(px, py, r, Math.max(1, r * 0.18)); }
      return;
    }
    if (terr === T_SAND) {
      gctx.fillStyle = '#e3cd86'; gctx.fillRect(px, py, r, r);
      gctx.fillStyle = '#d2b86a';
      for (let d = 0; d < 3; d++) { const sx = px + hash(x * 3 + d, y) * (r - 1), sy = py + hash(x, y * 3 + d) * (r - 1); gctx.fillRect(sx, sy, Math.max(1, r * 0.1), Math.max(1, r * 0.1)); }
      return;
    }
    // Gras (mit Büscheln / Farbvariation) + Park
    const park = s === S_PARK;
    const base = park ? '#5fc24f' : (night ? ['#2e5a30', '#2f5f30', '#305f34'][Math.floor(rnd * 3)] : ['#4a9644', '#4e9b47', '#55a24d'][Math.floor(rnd * 3)]);
    gctx.fillStyle = base; gctx.fillRect(px, py, r, r);
    gctx.fillStyle = night ? '#255028' : (park ? '#49a83f' : '#3f8a3a');
    for (let d = 0; d < (r >= 6 ? 3 : 1); d++) { const gx = px + hash(x * 5 + d, y * 3) * (r - 1), gy = py + hash(x * 3, y * 5 + d) * (r - 1); gctx.fillRect(gx, gy, Math.max(1, r * 0.12), Math.max(1, r * 0.12)); }
    if (park && r >= 6) { gctx.fillStyle = '#ff7faa'; gctx.fillRect(px + r * 0.5, py + r * 0.5, Math.max(1, r * 0.1), Math.max(1, r * 0.1)); }
  }

  function repaintGround(night) {
    if (!gctx) return;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) paintTile(x, y, night);
    groundTex.needsUpdate = true;
  }

  // ---- Bäume: 3 Comic-Typen ----
  let TREEGEO = null;
  function treeGeos() {
    if (TREEGEO) return TREEGEO;
    const pine = merge([cyl(0.05, 0.07, 0.3, 0, 0, 0, '#6a4a2a'), cone(0.32, 0.5, 0, 0.26, 0, '#2f7a34', 7), cone(0.24, 0.4, 0, 0.5, 0, '#3f8f3f', 7)]);
    const oak = merge([cyl(0.06, 0.08, 0.26, 0, 0, 0, '#6a4a2a'), ball(0.34, 0, 0.26, 0, '#479b45'), ball(0.2, 0.12, 0.5, 0.05, '#55ad4f')]);
    const bush = merge([ball(0.26, -0.08, 0.02, 0, '#3f8f3f'), ball(0.22, 0.12, 0.06, 0.05, '#4ba045')]);
    TREEGEO = [pine, oak, bush].map(g => ({ geo: g, out: outlineGeo(g, 0.03) }));
    return TREEGEO;
  }

  // ============================================================
  //  Lebendige Welt: Nachtlichter, Rotoren, Rauch, Fahrzeuge,
  //  Wetter, Katastrophen, Feuerwerk (alles InstancedMesh/Points)
  // ============================================================
  let lightGroup, rotorMesh = null, rotorOut = null, windList = [], emitters = [];
  let smokeMesh, carMesh, busMesh, trainMesh, flameMesh, floodMesh, tornadoMesh, ufoMesh;
  let weatherPts, weatherPos, fireworkPts, fwPos, fwCol, fwBursts = [];
  const MAX_SMOKE = 480, MAX_CARS = 160, MAX_BUS = 80, MAX_TRAIN = 80, MAX_FLAME = 200, MAX_FLOOD = 400;
  const WEATHER_N = 1400, FW_BURSTS = 5, FW_PER = 36;
  const dmy = new THREE.Object3D();

  function im(geo, mat, n) { const m = new THREE.InstancedMesh(geo, mat, n); m.count = 0; m.frustumCulled = false; scene.add(m); return m; }
  function initFx() {
    lightGroup = new THREE.Group(); scene.add(lightGroup);
    smokeMesh = im(new THREE.IcosahedronGeometry(0.13, 0), new THREE.MeshBasicMaterial({ color: 0xd8d8de, transparent: true, opacity: 0.55, depthWrite: false }), MAX_SMOKE);
    const toon = (c) => new THREE.MeshToonMaterial({ color: c, gradientMap: GRAD });
    const carGeo = new THREE.BoxGeometry(0.34, 0.15, 0.18); carGeo.translate(0, 0.1, 0);
    carMesh = im(carGeo, toon(0xffffff), MAX_CARS);
    carMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_CARS * 3), 3);
    const busGeo = new THREE.BoxGeometry(0.62, 0.24, 0.24); busGeo.translate(0, 0.14, 0);
    busMesh = im(busGeo, toon(0xffffff), MAX_BUS);
    busMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BUS * 3), 3);
    const trGeo = new THREE.BoxGeometry(0.8, 0.26, 0.28); trGeo.translate(0, 0.15, 0);
    trainMesh = im(trGeo, toon(0xffffff), MAX_TRAIN);
    trainMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TRAIN * 3), 3);
    const fl = new THREE.ConeGeometry(0.28, 0.9, 6); fl.translate(0, 0.45, 0);
    flameMesh = im(fl, new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.9 }), MAX_FLAME);
    const fg = new THREE.BoxGeometry(1, 0.06, 1);
    floodMesh = im(fg, new THREE.MeshBasicMaterial({ color: 0x3f8fe0, transparent: true, opacity: 0.55 }), MAX_FLOOD);
    const tg = new THREE.ConeGeometry(1.1, 4.5, 10, 1, true); tg.rotateX(Math.PI); tg.translate(0, 2.25, 0);
    tornadoMesh = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0x8a8f9e, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
    tornadoMesh.visible = false; scene.add(tornadoMesh);
    const ug = merge([cyl(0.7, 0.9, 0.2, 0, 0, 0, '#9aa0ad', 16), ball(0.38, 0, 0.05, 0, '#7ad0e0')]);
    ufoMesh = new THREE.Mesh(ug, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: GRAD }));
    ufoMesh.visible = false; scene.add(ufoMesh);
    // Wetter-Partikel
    const wg = new THREE.BufferGeometry();
    weatherPos = new Float32Array(WEATHER_N * 3);
    for (let i = 0; i < WEATHER_N; i++) { weatherPos[i * 3] = (hash(i, 1) - 0.5) * 60; weatherPos[i * 3 + 1] = hash(i, 2) * 26; weatherPos[i * 3 + 2] = (hash(i, 3) - 0.5) * 60; }
    wg.setAttribute('position', new THREE.BufferAttribute(weatherPos, 3));
    weatherPts = new THREE.Points(wg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, transparent: true, opacity: 0.85, depthWrite: false }));
    weatherPts.frustumCulled = false; weatherPts.visible = false; scene.add(weatherPts);
    // Feuerwerk (Stadtfest)
    const fwg = new THREE.BufferGeometry();
    fwPos = new Float32Array(FW_BURSTS * FW_PER * 3); fwCol = new Float32Array(FW_BURSTS * FW_PER * 3);
    fwg.setAttribute('position', new THREE.BufferAttribute(fwPos, 3));
    fwg.setAttribute('color', new THREE.BufferAttribute(fwCol, 3));
    fireworkPts = new THREE.Points(fwg, new THREE.PointsMaterial({ size: 0.35, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
    fireworkPts.frustumCulled = false; fireworkPts.visible = false; scene.add(fireworkPts);
    for (let b = 0; b < FW_BURSTS; b++) fwBursts.push({ t0: -999, x: 0, y: 0, z: 0, c: new THREE.Color() });
  }

  function rotorGeo() {
    const parts = [ball(0.07, 0, -0.07, 0, '#dfe6ef')];
    for (let a = 0; a < 3; a++) { const g = box(0.06, 0.8, 0.03, 0, 0, 0, '#f2f2ef'); g.translate(0, 0.42, 0); g.rotateZ(a * Math.PI * 2 / 3); parts.push(g); }
    return merge(parts);
  }

  function rebuildBuildings() {
    for (const g of [buildGroup, outlineGroup, treeGroup, lightGroup]) while (g.children.length) g.remove(g.children[0]);
    windList = []; emitters = [];
    // Gruppieren nach (Typ,Level)
    const groups = {}, trees = [[], [], []];
    for (let i = 0; i < W * H; i++) {
      const s = sim.st[i];
      if (sim.terr[i] === T_TREE && s === S_NONE) { const x = i % W, y = (i / W) | 0; trees[Math.floor(hash(x, y) * 3)].push(i); continue; }
      if (s === S_NONE || s === S_ROAD || s === S_RAIL || s === S_WIRE || s === S_PIPE ||
        s === S_HIGHWAY || s === S_RUNWAY || s === S_PIER || s === S_RUBBLE || s === S_PARK) continue;
      if (sim.anchor[i] !== i) continue;
      const lv = (s >= S_RZONE && s <= S_IZONE) ? (sim.lvl[i] | 0) : 0;
      if ((s >= S_RZONE && s <= S_IZONE) && lv === 0) continue; // leere Zone: nur Boden
      const key = s + '_' + lv;
      (groups[key] || (groups[key] = [])).push(i);
    }
    const dummy = new THREE.Object3D(), lightMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
    const addEmitter = (wx, wz, rot, lx, ly, lz, fp) => {
      if (emitters.length >= MAX_SMOKE / 6) return;
      const c = Math.cos(rot), sn = Math.sin(rot);
      emitters.push({ x: wx + (lx * c + lz * sn) * fp, y: ly, z: wz + (-lx * sn + lz * c) * fp });
    };
    for (const key in groups) {
      const [type, lv] = key.split('_').map(Number);
      const list = groups[key], m = modelFor(type, lv);
      const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: GRAD });
      const bm = new THREE.InstancedMesh(m.geo, mat, list.length);
      bm.castShadow = shadows; bm.receiveShadow = shadows;
      const om = new THREE.InstancedMesh(m.out, new THREE.MeshBasicMaterial({ color: 0x14141f, side: THREE.BackSide }), list.length);
      const lm = m.lights ? new THREE.InstancedMesh(m.lights, lightMat, list.length) : null;
      if (lm) lm.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3), 3);
      const tint = (type >= S_RZONE && type <= S_IZONE);
      if (tint) bm.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3), 3);
      list.forEach((i, k) => {
        const x = i % W, y = (i / W) | 0, fp = BIG[type] ? 2 : 1;
        const wx = worldX(x) + (fp - 1) / 2, wz = worldZ(y) + (fp - 1) / 2;
        const rot = tint ? (Math.floor(hash(x, y) * 4) * Math.PI / 2) : 0;
        dummy.position.set(wx, 0, wz); dummy.rotation.set(0, rot, 0); dummy.scale.set(fp, 1, fp); dummy.updateMatrix();
        bm.setMatrixAt(k, dummy.matrix); om.setMatrixAt(k, dummy.matrix);
        if (lm) { lm.setMatrixAt(k, dummy.matrix); const v = 0.45 + hash(x * 3, y * 5) * 0.55; _c.setRGB(v, v * 0.92, v * 0.7); lm.setColorAt(k, _c); }
        if (tint) { const v = 0.86 + hash(x * 7, y * 11) * 0.26; _c.setRGB(v, v, v); bm.setColorAt(k, _c); }
        // Rauch-Emitter an Schornsteinen, Windrad-Naben für Rotoren
        if (type === S_IZONE) addEmitter(wx, wz, rot, 0.3, ([0, 0.5, 0.7, 0.95, 1.2][lv] || 0.6) + 0.56 + lv * 0.12, -0.2, 1);
        else if (type === S_COAL) { addEmitter(wx, wz, 0, -0.4, 2.2, -0.3, 2); addEmitter(wx, wz, 0, 0.1, 2.2, -0.3, 2); }
        else if (type === S_INCINER) addEmitter(wx, wz, 0, 0.28, 2.3, -0.2, 1);
        else if (type === S_NUCLEAR) { addEmitter(wx, wz, 0, -0.4, 1.25, -0.4, 2); addEmitter(wx, wz, 0, 0.4, 1.25, -0.4, 2); }
        else if (type === S_WIND) windList.push({ x: wx, z: wz, ph: hash(x, y) * 6.28 });
      });
      bm.instanceMatrix.needsUpdate = true; om.instanceMatrix.needsUpdate = true;
      if (bm.instanceColor) bm.instanceColor.needsUpdate = true;
      buildGroup.add(bm); outlineGroup.add(om);
      if (lm) { lm.instanceMatrix.needsUpdate = true; lm.instanceColor.needsUpdate = true; lightGroup.add(lm); }
    }
    // Windrad-Rotoren (animiert in frame)
    if (rotorMesh) { scene.remove(rotorMesh); scene.remove(rotorOut); rotorMesh = rotorOut = null; }
    if (windList.length) {
      const rg = rotorGeo();
      rotorMesh = new THREE.InstancedMesh(rg, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: GRAD }), windList.length);
      rotorOut = new THREE.InstancedMesh(outlineGeo(rg, 0.025), new THREE.MeshBasicMaterial({ color: 0x14141f, side: THREE.BackSide }), windList.length);
      rotorMesh.castShadow = shadows;
      scene.add(rotorMesh); scene.add(rotorOut);
    }
    // Bäume
    const tg = treeGeos();
    trees.forEach((list, ti) => {
      if (!list.length) return;
      const g = tg[ti];
      const tm = new THREE.InstancedMesh(g.geo, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: GRAD }), list.length);
      tm.castShadow = shadows;
      const om = new THREE.InstancedMesh(g.out, new THREE.MeshBasicMaterial({ color: 0x14301c, side: THREE.BackSide }), list.length);
      list.forEach((i, k) => {
        const x = i % W, y = (i / W) | 0, sc = 0.8 + hash(x * 2, y * 2) * 0.5;
        dummy.position.set(worldX(x) + (hash(x, y) - 0.5) * 0.2, 0, worldZ(y) + (hash(y, x) - 0.5) * 0.2);
        dummy.rotation.set(0, hash(x, y) * 6.28, 0); dummy.scale.set(sc, sc, sc); dummy.updateMatrix();
        tm.setMatrixAt(k, dummy.matrix); om.setMatrixAt(k, dummy.matrix);
      });
      tm.instanceMatrix.needsUpdate = true; om.instanceMatrix.needsUpdate = true;
      treeGroup.add(tm); treeGroup.add(om);
    });
  }

  // ---- pro Frame: animierte Elemente ----
  function updateFx(now, dt, night, world) {
    const t = now / 1000;
    lightGroup.visible = night;
    // Windrad-Rotoren drehen
    if (rotorMesh) {
      windList.forEach((wd, k) => {
        dmy.position.set(wd.x, 1.86, wd.z + 0.16); dmy.rotation.set(0, 0, t * 2.4 + wd.ph); dmy.scale.set(1, 1, 1); dmy.updateMatrix();
        rotorMesh.setMatrixAt(k, dmy.matrix); rotorOut.setMatrixAt(k, dmy.matrix);
      });
      rotorMesh.instanceMatrix.needsUpdate = true; rotorOut.instanceMatrix.needsUpdate = true;
    }
    // Rauchwolken steigen auf und vergehen
    let n = 0;
    for (let e = 0; e < emitters.length; e++) {
      const em = emitters[e];
      for (let j = 0; j < 6 && n < MAX_SMOKE; j++) {
        const ph = (t * 0.35 + j / 6 + e * 0.137) % 1;
        dmy.position.set(em.x + ph * 0.7, em.y + ph * 1.5, em.z + ph * 0.25);
        const sc = 0.5 + ph * 1.8; dmy.scale.set(sc, sc, sc); dmy.rotation.set(0, 0, 0); dmy.updateMatrix();
        smokeMesh.setMatrixAt(n++, dmy.matrix);
      }
    }
    smokeMesh.count = n; smokeMesh.instanceMatrix.needsUpdate = true;
    smokeMesh.material.color.setHex(night ? 0x6a6a78 : 0xd8d8de);
    // Fahrzeuge
    const veh = (world && world.vehicles) || [];
    let nc = 0, nb = 0, nt = 0;
    for (const v of veh) {
      const mesh = v.kind === 'bus' ? busMesh : v.kind === 'train' ? trainMesh : carMesh;
      const idx = v.kind === 'bus' ? nb : v.kind === 'train' ? nt : nc;
      if (idx >= (v.kind === 'bus' ? MAX_BUS : v.kind === 'train' ? MAX_TRAIN : MAX_CARS)) continue;
      dmy.position.set(worldX(v.x), 0, worldZ(v.y));
      dmy.rotation.set(0, (v.dir === 1 || v.dir === 3) ? 0 : Math.PI / 2, 0); dmy.scale.set(1, 1, 1); dmy.updateMatrix();
      mesh.setMatrixAt(idx, dmy.matrix); _c.set(v.color || '#c9484f'); mesh.setColorAt(idx, _c);
      if (v.kind === 'bus') nb++; else if (v.kind === 'train') nt++; else nc++;
    }
    for (const [m, c] of [[carMesh, nc], [busMesh, nb], [trainMesh, nt]]) {
      m.count = c; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    // Brände (flackernde Flammen) und Hochwasser
    let nf = 0;
    for (const i of sim.burnList || []) {
      if (nf >= MAX_FLAME || !sim.burn[i]) continue;
      const x = i % W, y = (i / W) | 0, fl = 0.75 + Math.sin(t * 14 + i) * 0.25;
      dmy.position.set(worldX(x), 0.1, worldZ(y)); dmy.rotation.set(0, t * 3 + i, 0); dmy.scale.set(fl, 0.8 + fl * 0.6, fl); dmy.updateMatrix();
      flameMesh.setMatrixAt(nf++, dmy.matrix);
    }
    flameMesh.count = nf; flameMesh.instanceMatrix.needsUpdate = true;
    let nw = 0;
    for (const i of sim.floodList || []) {
      if (nw >= MAX_FLOOD || !sim.floodT[i]) continue;
      dmy.position.set(worldX(i % W), 0.05 + Math.sin(t * 2 + i) * 0.02, worldZ((i / W) | 0)); dmy.rotation.set(0, 0, 0); dmy.scale.set(1, 1, 1); dmy.updateMatrix();
      floodMesh.setMatrixAt(nw++, dmy.matrix);
    }
    floodMesh.count = nw; floodMesh.instanceMatrix.needsUpdate = true;
    // Tornado & UFO aus den Sim-Akteuren
    tornadoMesh.visible = false; ufoMesh.visible = false;
    for (const a of (world && world.actors) || []) {
      if (a.type === 'tornado') { tornadoMesh.visible = true; tornadoMesh.position.set(worldX(a.x), 0, worldZ(a.y)); tornadoMesh.rotation.y = t * 6; }
      else if (a.type === 'ufo') { ufoMesh.visible = true; ufoMesh.position.set(worldX(a.x), 5 + Math.sin(t * 2) * 0.4, worldZ(a.y)); ufoMesh.rotation.y = t * 2; }
    }
    // Wetter: Schnee rieselt, Regen prasselt (Partikel folgen der Kamera)
    const wx = world && world.weather;
    weatherPts.visible = !!wx;
    if (wx) {
      const snow = wx === 'snow', sp = snow ? 2.2 : 14;
      weatherPts.material.color.setHex(snow ? 0xffffff : 0x9cc4ff);
      weatherPts.material.size = snow ? 0.2 : 0.09;
      for (let i = 0; i < WEATHER_N; i++) {
        let y = weatherPos[i * 3 + 1] - sp * dt;
        if (y < 0) y += 26;
        weatherPos[i * 3 + 1] = y;
        if (snow) weatherPos[i * 3] += Math.sin(t + i) * 0.01;
      }
      weatherPts.position.set(cam.tx, 0, cam.ty);
      weatherPts.geometry.attributes.position.needsUpdate = true;
    }
    // Feuerwerk während des Stadtfests (bevorzugt nachts sichtbar)
    fireworkPts.visible = !!(world && world.festival);
    if (fireworkPts.visible) {
      for (let b = 0; b < FW_BURSTS; b++) {
        const B = fwBursts[b], age = t - B.t0;
        if (age > 1.8) {
          B.t0 = t + b * 0.37; B.x = cam.tx + (Math.random() - 0.5) * 24; B.z = cam.ty + (Math.random() - 0.5) * 24; B.y = 7 + Math.random() * 4;
          B.c.setHSL(Math.random(), 0.9, 0.6);
        }
        const a2 = Math.max(0, t - B.t0);
        for (let k = 0; k < FW_PER; k++) {
          const o = (b * FW_PER + k) * 3, th = k / FW_PER * Math.PI * 2, phi = (k % 6) / 6 * Math.PI;
          const r = a2 * 3.2;
          fwPos[o] = B.x + Math.cos(th) * Math.sin(phi) * r;
          fwPos[o + 1] = B.y + Math.cos(phi) * r - a2 * a2 * 1.4;
          fwPos[o + 2] = B.z + Math.sin(th) * Math.sin(phi) * r;
          const fade = a2 < 0 ? 0 : Math.max(0, 1 - a2 / 1.8);
          fwCol[o] = B.c.r * fade; fwCol[o + 1] = B.c.g * fade; fwCol[o + 2] = B.c.b * fade;
        }
      }
      fireworkPts.geometry.attributes.position.needsUpdate = true;
      fireworkPts.geometry.attributes.color.needsUpdate = true;
    }
  }

  // ---- Kamera: Kinomodus und weiche Fahrten ----
  let cinematic = false, goal = null, lastNow = 0;
  function updateCamera(dt) {
    if (cinematic) { cam.az += dt * 0.12; cam.pol = 0.9 + Math.sin(lastNow / 9000) * 0.12; }
    if (goal) {
      const k = Math.min(1, dt * 3.5);
      cam.tx += (goal.tx - cam.tx) * k; cam.ty += (goal.ty - cam.ty) * k;
      if (goal.dist) cam.dist += (goal.dist - cam.dist) * k;
      if (Math.abs(goal.tx - cam.tx) < 0.02 && Math.abs(goal.ty - cam.ty) < 0.02 && (!goal.dist || Math.abs(goal.dist - cam.dist) < 0.05)) goal = null;
    }
    const sinPol = Math.sin(cam.pol);
    camera.position.set(cam.tx + cam.dist * sinPol * Math.sin(cam.az), cam.dist * Math.cos(cam.pol), cam.ty + cam.dist * sinPol * Math.cos(cam.az));
    camera.lookAt(cam.tx, 0, cam.ty);
    if (shadows) {
      sun.position.set(cam.tx + 50, 95, cam.ty + 36);
      sun.target.position.set(cam.tx, 0, cam.ty);
      const d = Math.min(Math.max(W, H), 90) * 0.75;
      const sc = sun.shadow.camera;
      sc.left = -d; sc.right = d; sc.top = d; sc.bottom = -d; sc.near = 1; sc.far = 320; sc.updateProjectionMatrix();
    }
  }

  function frame(now, night, world) {
    if (!inited || !sim) return;
    const dt = Math.min(0.1, lastNow ? (now - lastNow) / 1000 : 0.016); lastNow = now;
    waterPhase = now / 600;
    if (dirty) { repaintGround(night); rebuildBuildings(); dirty = false; }
    scene.background.setHex(night ? 0x14213f : 0x8fcfff);
    if (scene.fog) scene.fog.color.setHex(night ? 0x14213f : 0x8fcfff);
    sun.intensity = night ? 0.45 : 1.1; sun.color.setHex(night ? 0x8fa8ff : 0xfff2d0);
    hemi.intensity = night ? 0.3 : 0.5; ambient.intensity = night ? 0.25 : 0.18;
    waterMesh.material.opacity = 0.22 + Math.sin(now / 900) * 0.06;
    updateFx(now, dt, night, world);
    updateCamera(dt);
    renderer.render(scene, camera);
  }

  function resize(w, h) { if (!inited) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }

  function pick(px, py) {
    if (!inited || !sim) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    _v.x = ((px - rect.left) / rect.width) * 2 - 1;
    _v.y = -((py - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(_v, camera);
    const hit = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _ray);
    if (!hit) return null;
    const tx = Math.floor(_ray.x + W / 2), ty = Math.floor(_ray.z + H / 2);
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return { x: -1, y: -1 };
    return { x: tx, y: ty };
  }

  function setHover(x, y) {
    if (!hoverMesh) return;
    if (x < 0 || y < 0 || x >= W || y >= H) { hoverMesh.visible = false; return; }
    hoverMesh.visible = true; hoverMesh.position.set(worldX(x), 0.09, worldZ(y));
  }

  function orbit(dx, dy) { cam.az -= dx * 0.008; cam.pol = Math.max(0.2, Math.min(1.45, cam.pol - dy * 0.006)); }
  function panCam(dx, dy) {
    goal = null;
    const f = cam.dist * 0.0016;
    cam.tx += (-dx * Math.cos(cam.az) + dy * Math.sin(cam.az)) * f;
    cam.ty += (dx * Math.sin(cam.az) + dy * Math.cos(cam.az)) * f;
    cam.tx = Math.max(-W / 2, Math.min(W / 2, cam.tx)); cam.ty = Math.max(-H / 2, Math.min(H / 2, cam.ty));
  }
  function zoom(delta) { cam.dist = Math.max(8, Math.min(Math.max(W, H) * 2.4, cam.dist + delta)); if (goal) goal.dist = 0; }
  function centerOn(x, y) { goal = { tx: worldX(x), ty: worldZ(y), dist: 0 }; }
  function focus(x, y) { goal = { tx: worldX(x), ty: worldZ(y), dist: Math.max(12, Math.min(cam.dist, 18)) }; }
  function resetCam() { cam.az = 0.8; cam.pol = 0.92; goal = { tx: 0, ty: 0, dist: Math.max(26, Math.min(W, H) * 1.05) }; }
  function setCinematic(on) { cinematic = !!on; }
  function markDirty() { dirty = true; }
  function screenshot() { return renderer ? renderer.domElement.toDataURL('image/png') : null; }

  window.Render3D = {
    init, setSim, frame, resize, pick, setHover, orbit, panCam, zoom, centerOn, focus, resetCam, setCinematic,
    markDirty, screenshot, get ready() { return inited; }, get cam() { return cam; },
    get stats() {
      return { smoke: smokeMesh ? smokeMesh.count : 0, cars: carMesh ? carMesh.count + busMesh.count + trainMesh.count : 0,
        rotors: windList.length, flames: flameMesh ? flameMesh.count : 0, weather: !!(weatherPts && weatherPts.visible),
        lights: lightGroup ? lightGroup.children.length : 0, fireworks: !!(fireworkPts && fireworkPts.visible) };
    },
  };
})();
