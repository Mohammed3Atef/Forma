/* ============================================================
   FORMA — parts: geometry factories + THE persistent registry.
   Parts are created once and only ever retargeted. Nothing is
   added or removed after load; that is what makes the whole
   film read as one evolving system.
   ============================================================ */
import * as THREE from "three";
import { knurlNormal, grainNormal, strandNormal } from "./stage.js";

/* ---------- shared material library ---------- */
export function materials() {
  const knurl = knurlNormal(28);
  const grain = grainNormal(6);
  const strand = strandNormal();

  const M = {
    steel: new THREE.MeshStandardMaterial({
      name: "steel", color: 0x8a8a8e, metalness: 1, roughness: 0.34,
      normalMap: knurl, normalScale: new THREE.Vector2(0.35, 0.35),
    }),
    knurled: new THREE.MeshStandardMaterial({
      name: "knurled_steel", color: 0x7e7e83, metalness: 1, roughness: 0.44,
      normalMap: knurl, normalScale: new THREE.Vector2(1.15, 1.15),
    }),
    rubber: new THREE.MeshStandardMaterial({
      name: "rubber", color: 0x1e1e22, metalness: 0.05, roughness: 0.66,
      normalMap: grain, normalScale: new THREE.Vector2(0.5, 0.5),
    }),
    iron: new THREE.MeshStandardMaterial({
      name: "cast_iron", color: 0x2a2a2c, metalness: 0.85, roughness: 0.55,
      normalMap: grain, normalScale: new THREE.Vector2(0.3, 0.3),
    }),
    coat: new THREE.MeshStandardMaterial({
      name: "powder_coat", color: 0x1c1c1e, metalness: 0.15, roughness: 0.62,
      normalMap: grain, normalScale: new THREE.Vector2(0.22, 0.22),
    }),
    alu: new THREE.MeshStandardMaterial({
      name: "machined_alu", color: 0xb4b4b8, metalness: 1, roughness: 0.22,
    }),
    chrome: new THREE.MeshStandardMaterial({
      name: "chrome", color: 0xe8e8ea, metalness: 1, roughness: 0.06,
    }),
    vinyl: new THREE.MeshStandardMaterial({
      name: "pad_vinyl", color: 0x16161a, metalness: 0, roughness: 0.68,
      normalMap: grain, normalScale: new THREE.Vector2(0.6, 0.6),
    }),
    cable: new THREE.MeshStandardMaterial({
      name: "steel_cable", color: 0x6e6e72, metalness: 0.9, roughness: 0.42,
      normalMap: strand, normalScale: new THREE.Vector2(0.8, 0.8),
      emissive: new THREE.Color(0xff8b02), emissiveIntensity: 0,
    }),
    accent: new THREE.MeshStandardMaterial({
      name: "anodized_accent", color: 0xff8b02, metalness: 0.8, roughness: 0.3,
      emissive: new THREE.Color(0xff6a02), emissiveIntensity: 0,
    }),
  };
  Object.values(M).forEach((m) => { m.envMapIntensity = 1.0; });
  M.rubber.envMapIntensity = 1.35;
  M.vinyl.envMapIntensity = 1.25;
  M.coat.envMapIntensity = 1.2;
  return M;
}

/* ---------- geometry helpers ---------- */
function latheFrom(pts, seg = 64) {
  return new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), seg);
}

function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/* chamfered tube: rounded-rect profile extruded along +Y, centered */
function tubeBar(w, d, len, r = 0.012) {
  const g = new THREE.ExtrudeGeometry(roundedRectShape(w, d, r), {
    depth: len, bevelEnabled: true, bevelThickness: 0.004,
    bevelSize: 0.004, bevelSegments: 2, steps: 1,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, len / 2, 0);
  return g;
}

/* weight plate: real chamfered rim + raised hub, bore through */
function plateGeo(R, T) {
  const h = T / 2, c = Math.min(0.016, T * 0.34), bore = 0.028, hubR = R * 0.3, hubH = h * 1.45;
  const pts = [
    [bore, -hubH], [hubR - 0.008, -hubH], [hubR, -h],
    [R - c, -h], [R, -h + c],
    [R, h - c], [R - c, h],
    [hubR, h], [hubR - 0.008, hubH], [bore, hubH],
  ];
  const g = latheFrom(pts, 72);
  g.rotateZ(Math.PI / 2);           // axis → X
  g.computeVertexNormals();
  return g;
}

function collarGeo() {
  const pts = [
    [0.017, -0.032], [0.030, -0.032], [0.034, -0.026],
    [0.034, 0.020], [0.029, 0.032], [0.017, 0.032],
  ];
  const g = latheFrom(pts, 48);
  g.rotateZ(Math.PI / 2);
  return g;
}

/* hex-head bolt — reads as hardware close up, one draw at distance */
function boltGeo() {
  const g = new THREE.CylinderGeometry(0.0115, 0.0115, 0.014, 6);
  g.rotateX(Math.PI / 2);
  return g;
}

function sheaveGeo() {
  const pts = [
    [0.012, -0.016], [0.055, -0.016], [0.062, -0.010],
    [0.052, 0], [0.062, 0.010], [0.055, 0.016], [0.012, 0.016],
  ];
  const g = latheFrom(pts, 40);
  return g; // axis Y; rotated per-instance
}

function housingGeo() {
  const g = new THREE.ExtrudeGeometry(roundedRectShape(0.15, 0.19, 0.03), {
    depth: 0.05, bevelEnabled: true, bevelThickness: 0.005,
    bevelSize: 0.005, bevelSegments: 2, steps: 1,
  });
  g.translate(0, 0, -0.025);
  return g;
}

/* ---------- edge overlay, added as a child so it inherits pose ---------- */
function addEdges(mesh, mat) {
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 24), mat);
  e.name = "edges";
  mesh.add(e);
  return e;
}

/* ============================================================
   The registry
   ============================================================ */
export function buildParts(scene) {
  const M = materials();
  const root = new THREE.Group();
  root.name = "forma_system";
  scene.add(root);

  const edgeMat = new THREE.LineBasicMaterial({
    color: 0xff8b02, transparent: true, opacity: 0, depthWrite: false,
  });

  const parts = {};
  const list = [];
  const reg = (id, mesh, kind) => {
    mesh.name = id;
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    root.add(mesh);
    const p = { id, kind, mesh, edges: addEdges(mesh, edgeMat) };
    parts[id] = p; list.push(p);
    return p;
  };

  /* 8 weight plates — dumbbell plates → barbell plates → weight-stack
     plates → information modules → KPI tiles.
     Each carries a machined steel hub insert: the bright detail that
     makes a near-black rubber plate read against a black void. */
  const plateBig = plateGeo(0.225, 0.052);
  const plateMid = plateGeo(0.19, 0.044);
  const hubRing = latheFrom([
    [0.030, -0.034], [0.055, -0.034], [0.058, -0.028],
    [0.058, 0.028], [0.055, 0.034], [0.030, 0.034],
  ], 40);
  hubRing.rotateZ(Math.PI / 2);
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(i % 2 === 0 ? plateBig : plateMid, M.rubber);
    const hub = new THREE.Mesh(hubRing, M.alu);
    hub.name = "hub";
    m.add(hub);
    reg("plate" + i, m, "plate");
  }

  /* handle / shaft — telescopes from dumbbell handle to barbell */
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0145, 0.0145, 1, 40, 1),
    M.knurled
  );
  shaft.geometry.rotateZ(Math.PI / 2);
  reg("shaft", shaft, "shaft");

  /* two sleeves that ride the shaft ends */
  for (let i = 0; i < 2; i++) {
    const s = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.024, 0.3, 32, 1),
      M.chrome
    );
    s.geometry.rotateZ(Math.PI / 2);
    reg("sleeve" + i, s, "sleeve");
  }

  /* collars — with an accent pin child (the first appearance of orange,
     on a real mechanical part) */
  const collarG = collarGeo();
  for (let i = 0; i < 2; i++) {
    const c = new THREE.Mesh(collarG, M.alu);
    const pin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0075, 0.0075, 0.05, 16),
      M.accent
    );
    pin.name = "pin";
    pin.position.set(0, 0.03, 0);
    c.add(pin);
    reg("collar" + i, c, "collar");
  }

  /* 24 bolts — frame bolts → graph nodes → data points */
  const boltG = boltGeo();
  for (let i = 0; i < 24; i++) reg("bolt" + i, new THREE.Mesh(boltG, M.alu), "bolt");

  /* 2 uprights — rack uprights → trainer towers → layout grid → axes */
  const upG = tubeBar(0.1, 0.1, 1);
  for (let i = 0; i < 2; i++) reg("upright" + i, new THREE.Mesh(upG, M.coat), "upright");

  /* 4 frame tubes — bench frame, then structural grid */
  const frG = tubeBar(0.07, 0.07, 1);
  for (let i = 0; i < 4; i++) reg("frame" + i, new THREE.Mesh(frG, M.coat), "frame");

  /* bench pad — pad → client-card surface → photo timeline */
  const padG = new THREE.ExtrudeGeometry(roundedRectShape(0.34, 1.18, 0.06), {
    depth: 0.085, bevelEnabled: true, bevelThickness: 0.014,
    bevelSize: 0.014, bevelSegments: 3, steps: 1,
  });
  padG.rotateX(-Math.PI / 2);
  reg("pad", new THREE.Mesh(padG, M.vinyl), "pad");

  /* 4 pulleys — sheaves → routing joints → ring gauges */
  const shG = sheaveGeo(), hoG = housingGeo();
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    const h = new THREE.Mesh(hoG, M.coat); h.name = "housing";
    const s = new THREE.Mesh(shG, M.chrome); s.name = "sheave";
    s.rotation.x = Math.PI / 2;
    g.add(h, s);
    g.name = "pulley" + i;
    g.castShadow = true;
    root.add(g);
    const p = { id: "pulley" + i, kind: "pulley", mesh: g, edges: addEdges(h, edgeMat), sheave: s };
    parts[p.id] = p; list.push(p);
  }

  /* 4 cables — pulley cables → data connections → chart series.
     Rebuilt from control points only when they actually move. */
  const cables = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.BufferGeometry(), M.cable);
    m.name = "cable" + i;
    m.frustumCulled = false;
    root.add(m);
    const c = { id: "cable" + i, kind: "cable", mesh: m, pts: null, _hash: "" };
    cables.push(c); parts[c.id] = c; list.push(c);
  }

  /* node dots for the wireframe / data stages — reuses bolt positions */
  const nodes = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.02, 12, 10),
    new THREE.MeshStandardMaterial({
      color: 0xffb208, emissive: 0xff8b02, emissiveIntensity: 1.4,
      metalness: 0.4, roughness: 0.3, transparent: true, opacity: 0,
    }),
    24
  );
  nodes.name = "nodes";
  nodes.frustumCulled = false;
  root.add(nodes);

  /* the F mark — the REAL Forma logo, revealed in the final chapter.
     Rendered unlit so the supplied brand gradient reproduces exactly. */
  const markTex = new THREE.TextureLoader().load("assets/forma-mark.png");
  markTex.colorSpace = THREE.SRGBColorSpace;
  markTex.anisotropy = 4;
  const MARK_AR = 734 / 687;

  const glowCv = document.createElement("canvas");
  glowCv.width = glowCv.height = 256;
  {
    const gg = glowCv.getContext("2d");
    const rg = gg.createRadialGradient(128, 128, 0, 128, 128, 128);
    rg.addColorStop(0, "rgba(255,150,20,0.5)");
    rg.addColorStop(0.34, "rgba(255,110,10,0.2)");
    rg.addColorStop(1, "rgba(255,76,1,0)");
    gg.fillStyle = rg; gg.fillRect(0, 0, 256, 256);
  }
  const glowTex = new THREE.CanvasTexture(glowCv);
  glowTex.colorSpace = THREE.SRGBColorSpace;

  const fMark = new THREE.Group();
  fMark.name = "fmark";
  const fGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.7, 2.7),
    new THREE.MeshBasicMaterial({
      map: glowTex, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    })
  );
  fGlow.position.z = -0.04;
  const fPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(MARK_AR, 1),
    new THREE.MeshBasicMaterial({
      map: markTex, transparent: true, opacity: 0,
      depthWrite: false, toneMapped: false,
    })
  );
  fMark.add(fGlow, fPlane);
  root.add(fMark);

  return {
    root, M, parts, list, cables, nodes, fMark, fPlane, fGlow, edgeMat,
    of: (kind) => list.filter((p) => p.kind === kind),
  };
}

/* ---------- cable rebuild (throttled by caller) ---------- */
const _v = new THREE.Vector3();
export function setCable(cable, pts, radius = 0.011) {
  const hash = radius.toFixed(3) + "|" + pts.map((p) => p.map((n) => n.toFixed(2)).join()).join("|");
  if (hash === cable._hash) return;
  cable._hash = hash;
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => _v.clone().set(p[0], p[1], p[2])));
  const g = new THREE.TubeGeometry(curve, 44, radius, 10, false);
  cable.mesh.geometry.dispose();
  cable.mesh.geometry = g;
}
