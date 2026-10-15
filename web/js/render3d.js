/* ============================================================
 * RETROPOLIS — 3D-Comic-Renderer (Three.js, Cel-Shading)
 * Gebackener Boden (Terrain/Netz/Zonen) als Textur-Ebene +
 * cel-schattierte 3D-Gebäude mit schwarzen Comic-Umrissen.
 * Liest den Sim-Zustand, baut die Welt bei Änderungen neu.
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
    S_RUNWAY = 37, S_PIER = 38;
  const T_GRASS = 0, T_WATER = 1, T_SAND = 2, T_TREE = 3;

  // Boden-Farben (kräftige Comic-Töne) je Terrain/Netz
  function groundColor(sim, i, night) {
    const s = sim.st[i], t = sim.terr[i];
    if (s === S_ROAD) return '#6a6a74';
    if (s === S_HIGHWAY) return '#c8ccd8';
    if (s === S_RAIL) return '#7a6a4a';
    if (s === S_WIRE) return '#8a6a3a';
    if (s === S_PIPE) return '#3a8fb0';
    if (s === S_RUNWAY) return '#33333a';
    if (s === S_PIER) return '#8a5a33';
    if (s === S_RUBBLE) return '#6b6257';
    if (s === S_PARK) return '#5fb84f';
    if (t === T_WATER) return night ? '#1b3f7a' : '#2f6fc4';
    if (t === T_SAND) return '#e3cd86';
    // Bauland unter Gebäuden / Gras
    return night ? '#2f5f30' : '#4e9b47';
  }

  // 3D-Gebäude: Höhe + Dachfarbe je Strukturtyp. Zonen skalieren mit Level.
  const BUILD = {
    [S_RZONE]: { h: [0, 0.5, 0.9, 1.4, 2.1], col: ['#6fe06f', '#58c95a', '#49b94c', '#3fae45', '#74e0a0'] },
    [S_CZONE]: { h: [0, 0.6, 1.1, 1.8, 2.8], col: ['#6fb8ff', '#5aa0f0', '#4f8fdc', '#3f78c8', '#8fd0ff'] },
    [S_IZONE]: { h: [0, 0.5, 0.9, 1.3, 1.9], col: ['#f0d95c', '#e0c84a', '#d0b63c', '#c2a12e', '#f5e68a'] },
    [S_POLICE]: { h: 1.0, col: '#4f6fd0' }, [S_FIREDEP]: { h: 1.0, col: '#c9484f' },
    [S_SCHOOL]: { h: 1.1, col: '#e0a030' }, [S_HOSPITAL]: { h: 1.6, col: '#f2f2ef' },
    [S_WIND]: { h: 2.6, col: '#eef2f7', slim: 1 }, [S_COAL]: { h: 1.8, col: '#565c6b' },
    [S_STADIUM]: { h: 1.4, col: '#c9c9d2' }, [S_WTOWER]: { h: 2.2, col: '#9ab0c8', slim: 1 },
    [S_PUMP]: { h: 0.8, col: '#6fa0c0' }, [S_TOWNHALL]: { h: 1.9, col: '#d8c89a' },
    [S_MONUMENT]: { h: 2.4, col: '#d0d0d8', slim: 1 }, [S_CASINO]: { h: 1.6, col: '#b06ce0' },
    [S_SOLAR]: { h: 0.4, col: '#2f3f66' }, [S_BUSSTOP]: { h: 0.5, col: '#e08438' },
    [S_TRAINSTATION]: { h: 1.1, col: '#8a6ad0' }, [S_SUBWAY]: { h: 0.6, col: '#6a4fb0' },
    [S_PORT]: { h: 1.0, col: '#5b7a8a' }, [S_HOTEL]: { h: 2.2, col: '#e5679f' },
    [S_AMUSE]: { h: 1.3, col: '#ff8fb0' }, [S_LANDFILL]: { h: 0.6, col: '#7a6a4a' },
    [S_INCINER]: { h: 2.0, col: '#6a6a72', slim: 1 }, [S_RECYCLE]: { h: 1.0, col: '#41c46a' },
    [S_AIRPORT]: { h: 1.0, col: '#9aa0ad' }, [S_NUCLEAR]: { h: 1.8, col: '#d0d0d8' },
    [S_TREATMENT]: { h: 0.8, col: '#3f96b8' }, [S_UNIVERSITY]: { h: 1.9, col: '#c7cfdd' },
  };

  let renderer, scene, camera, raycaster, groundMesh, groundTex, groundCanvas, gctx;
  let waterMesh, hoverMesh, outlineGroup, buildGroup, treeMesh, treeOutline;
  let sim = null, W = 0, H = 0, dirty = true, inited = false;
  const cam = { az: 0.8, pol: 0.9, dist: 60, tx: 0, ty: 0 };
  const _v = new THREE.Vector2(), _ray = new THREE.Vector3();
  let sun, hemi, ambient;

  // 3-Stufen-Gradient für Cel-Shading
  function toonGradient() {
    const data = new Uint8Array([90, 90, 90, 160, 160, 160, 255, 255, 255, 255]);
    const tex = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
    tex.minFilter = tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    return tex;
  }
  let GRAD = null;

  function init(canvas) {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(50, 1, 0.5, 4000);
    raycaster = new THREE.Raycaster();
    GRAD = toonGradient();
    // Licht: comic-haft kräftig, weicher Himmel
    sun = new THREE.DirectionalLight(0xfff2d0, 1.5);
    sun.position.set(40, 80, 30);
    scene.add(sun);
    hemi = new THREE.HemisphereLight(0xbfe3ff, 0x5a7a4a, 0.75);
    scene.add(hemi);
    ambient = new THREE.AmbientLight(0xffffff, 0.35);
    scene.add(ambient);
    buildGroup = new THREE.Group(); scene.add(buildGroup);
    outlineGroup = new THREE.Group(); scene.add(outlineGroup);
    // Hover-Markierung
    const hg = new THREE.BoxGeometry(1, 0.12, 1);
    hoverMesh = new THREE.Mesh(hg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 }));
    hoverMesh.visible = false; scene.add(hoverMesh);
    inited = true;
  }

  function setSim(s) {
    sim = s; W = s.w; H = s.h; dirty = true;
    buildGround();
    cam.dist = Math.max(28, Math.min(W, H) * 1.1);
    cam.tx = 0; cam.ty = 0;
    scene.background = new THREE.Color(0x8fcfff);
  }

  function buildGround() {
    if (groundMesh) { scene.remove(groundMesh); groundMesh.geometry.dispose(); groundMesh.material.dispose(); }
    if (waterMesh) { scene.remove(waterMesh); }
    groundCanvas = document.createElement('canvas');
    groundCanvas.width = W; groundCanvas.height = H;
    gctx = groundCanvas.getContext('2d');
    groundTex = new THREE.CanvasTexture(groundCanvas);
    groundTex.magFilter = THREE.NearestFilter; groundTex.minFilter = THREE.LinearMipmapLinearFilter;
    const geo = new THREE.PlaneGeometry(W, H, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshToonMaterial({ map: groundTex, gradientMap: GRAD });
    groundMesh = new THREE.Mesh(geo, mat);
    scene.add(groundMesh);
    // leicht abgesenkte, leuchtende Wasserfläche als separater „Comic-Teich“
    const wgeo = new THREE.PlaneGeometry(W, H, 1, 1); wgeo.rotateX(-Math.PI / 2);
    waterMesh = new THREE.Mesh(wgeo, new THREE.MeshBasicMaterial({ visible: false }));
    waterMesh.position.y = -0.04; scene.add(waterMesh);
  }

  // Tile (tx,ty) → Weltmitte des Feldes
  function worldX(tx) { return tx - W / 2 + 0.5; }
  function worldZ(ty) { return ty - H / 2 + 0.5; }

  function repaintGround(night) {
    if (!gctx) return;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      gctx.fillStyle = groundColor(sim, sim.idx(x, y), night);
      gctx.fillRect(x, y, 1, 1);
    }
    groundTex.needsUpdate = true;
  }

  // Baut alle 3D-Gebäude + Umrisse als InstancedMesh je Typ neu auf
  function rebuildBuildings() {
    while (buildGroup.children.length) { const m = buildGroup.children.pop(); m.geometry && m.geometry.dispose(); }
    while (outlineGroup.children.length) { const m = outlineGroup.children.pop(); m.geometry && m.geometry.dispose(); }
    // zähle Anker je Typ
    const counts = {}, treePos = [];
    for (let i = 0; i < W * H; i++) {
      const s = sim.st[i];
      if (s !== S_NONE && BUILD[s] && sim.anchor[i] === i) counts[s] = (counts[s] || 0) + 1;
      if (sim.terr[i] === T_TREE && s === S_NONE) treePos.push(i);
    }
    const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    for (const key in counts) {
      const s = +key, def = BUILD[s], n = counts[s];
      const size = sim.isBld ? (sim.DEFS ? 1 : 1) : 1;
      const mat = new THREE.MeshToonMaterial({ gradientMap: GRAD });
      const im = new THREE.InstancedMesh(box, mat, n);
      const omat = new THREE.MeshBasicMaterial({ color: 0x14141f, side: THREE.BackSide });
      const om = new THREE.InstancedMesh(box, omat, n);
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      let k = 0;
      for (let i = 0; i < W * H; i++) {
        if (sim.st[i] !== s || sim.anchor[i] !== i) continue;
        const fp = footprintSize(i, s);
        const x = i % W, y = (i / W) | 0;
        let h, c;
        if (Array.isArray(def.h)) { const lv = sim.lvl[i] | 0; h = def.h[lv] || 0.4; c = def.col[lv] || def.col[1]; }
        else { h = def.h; c = def.col; }
        if (h < 0.05) h = 0.2;
        const slim = def.slim ? 0.45 : 0.92;
        const wx = worldX(x) + (fp - 1) / 2, wz = worldZ(y) + (fp - 1) / 2;
        dummy.position.set(wx, 0, wz);
        dummy.scale.set(fp * slim, h, fp * slim);
        dummy.updateMatrix();
        im.setMatrixAt(k, dummy.matrix);
        col.set(c); im.setColorAt(k, col);
        // Umriss leicht größer
        dummy.scale.set(fp * slim + 0.12, h + 0.12, fp * slim + 0.12);
        dummy.updateMatrix(); om.setMatrixAt(k, dummy.matrix);
        k++;
      }
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      om.instanceMatrix.needsUpdate = true;
      buildGroup.add(im); outlineGroup.add(om);
    }
    // Bäume: kleine Comic-Kegel
    if (treePos.length) {
      const tgeo = new THREE.ConeGeometry(0.42, 0.9, 6); tgeo.translate(0, 0.65, 0);
      const tmat = new THREE.MeshToonMaterial({ color: 0x3f8f3f, gradientMap: GRAD });
      treeMesh = new THREE.InstancedMesh(tgeo, tmat, treePos.length);
      const tomat = new THREE.MeshBasicMaterial({ color: 0x14341f, side: THREE.BackSide });
      treeOutline = new THREE.InstancedMesh(tgeo, tomat, treePos.length);
      treePos.forEach((i, k) => {
        const x = i % W, y = (i / W) | 0;
        dummy.position.set(worldX(x), 0, worldZ(y)); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
        treeMesh.setMatrixAt(k, dummy.matrix);
        dummy.scale.set(1.15, 1.12, 1.15); dummy.updateMatrix(); treeOutline.setMatrixAt(k, dummy.matrix);
      });
      treeMesh.instanceMatrix.needsUpdate = true; treeOutline.instanceMatrix.needsUpdate = true;
      buildGroup.add(treeMesh); outlineGroup.add(treeOutline);
    }
  }

  // Größe des Footprints (2x2 Großbauten) über DEFS, falls verfügbar
  function footprintSize(i, s) {
    const D = (window.SIM_DEFS || null);
    // 2x2-Typen hart kodiert (size:2 in sim.js)
    const big = (s === S_COAL || s === S_STADIUM || s === S_PORT || s === S_AMUSE ||
      s === S_LANDFILL || s === S_AIRPORT || s === S_NUCLEAR || s === S_TREATMENT || s === S_UNIVERSITY);
    return big ? 2 : 1;
  }

  function updateCamera() {
    const cx = cam.tx, cz = cam.ty;
    const sinPol = Math.sin(cam.pol);
    camera.position.set(
      cx + cam.dist * sinPol * Math.sin(cam.az),
      cam.dist * Math.cos(cam.pol),
      cz + cam.dist * sinPol * Math.cos(cam.az));
    camera.lookAt(cx, 0, cz);
  }

  function frame(now, night) {
    if (!inited || !sim) return;
    if (dirty) { repaintGround(night); rebuildBuildings(); dirty = false; }
    // Tag/Nacht-Stimmung
    const t = night ? 1 : 0;
    scene.background.setHex(night ? 0x14213f : 0x8fcfff);
    sun.intensity = night ? 0.4 : 1.5;
    sun.color.setHex(night ? 0x8fa8ff : 0xfff2d0);
    hemi.intensity = night ? 0.3 : 0.75;
    ambient.intensity = night ? 0.25 : 0.35;
    updateCamera();
    renderer.render(scene, camera);
  }

  function resize(w, h) {
    if (!inited) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  // Bildschirm → Tile über Raycast auf die Bodenebene
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
    hoverMesh.visible = true;
    hoverMesh.position.set(worldX(x), 0.08, worldZ(y));
  }

  // Kamera-Steuerung (vom Haupt-Input geroutet)
  function orbit(dx, dy) {
    cam.az -= dx * 0.008;
    cam.pol = Math.max(0.25, Math.min(1.45, cam.pol - dy * 0.006));
  }
  function panCam(dx, dy) {
    const f = cam.dist * 0.0016;
    cam.tx -= (dx * Math.cos(cam.az) + dy * Math.sin(cam.az)) * f * -1;
    cam.ty -= (-dx * Math.sin(cam.az) + dy * Math.cos(cam.az)) * f * -1;
    cam.tx = Math.max(-W / 2, Math.min(W / 2, cam.tx));
    cam.ty = Math.max(-H / 2, Math.min(H / 2, cam.ty));
  }
  function zoom(delta) {
    cam.dist = Math.max(10, Math.min(Math.max(W, H) * 2.2, cam.dist + delta));
  }
  function centerOn(x, y) { cam.tx = worldX(x); cam.ty = worldZ(y); }

  function markDirty() { dirty = true; }
  function screenshot() { return renderer ? renderer.domElement.toDataURL('image/png') : null; }

  window.Render3D = {
    init, setSim, frame, resize, pick, setHover, orbit, panCam, zoom, centerOn,
    markDirty, screenshot, get ready() { return inited; }, get cam() { return cam; },
  };
})();
