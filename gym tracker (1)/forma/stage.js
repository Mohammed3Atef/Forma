/* ============================================================
   FORMA — stage: renderer, procedural studio IBL, lighting, camera rig
   ============================================================ */
import * as THREE from "three";

/* ---------- procedural canvas maps (no external textures) ---------- */
function canvasTex(w, h, draw, repX = 1, repY = 1) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repX, repY);
  t.anisotropy = 4;
  return t;
}

/* diagonal cross-hatch knurl, encoded as a normal map */
export function knurlNormal(rep = 26) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#8080ff"; g.fillRect(0, 0, w, h);
    const line = (a, col) => {
      g.save(); g.translate(w / 2, h / 2); g.rotate(a); g.translate(-w / 2, -h / 2);
      g.strokeStyle = col; g.lineWidth = 3;
      for (let i = -w; i < w * 2; i += 11) { g.beginPath(); g.moveTo(i, -h); g.lineTo(i, h * 2); g.stroke(); }
      g.restore();
    };
    line(Math.PI / 4, "#b0a0ff"); line(-Math.PI / 4, "#5060ff");
  }, rep, rep);
}

/* fine isotropic grain for rubber / powder-coat */
export function grainNormal(rep = 8) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#8080ff"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const v = 128 + (Math.random() - 0.5) * 46;
      g.fillStyle = `rgb(${v | 0},${v | 0},255)`;
      g.fillRect(Math.random() * w, Math.random() * h, 1.6, 1.6);
    }
  }, rep, rep);
}

/* twisted-strand pattern for steel cable */
export function strandNormal() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = "#8080ff"; g.fillRect(0, 0, w, h);
    g.lineWidth = 5;
    for (let i = -h; i < h * 2; i += 9) {
      g.strokeStyle = "#a898ff"; g.beginPath(); g.moveTo(0, i); g.lineTo(w, i + 26); g.stroke();
      g.strokeStyle = "#6070ff"; g.beginPath(); g.moveTo(0, i + 4); g.lineTo(w, i + 30); g.stroke();
    }
  }, 1, 14);
}

/* ---------- studio environment, PMREM'd from a built scene ---------- */
function studioEnvScene() {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x090909);
  const box = (w, h, d, x, y, z, color, inten) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })
    );
    m.material.color.multiplyScalar(inten);
    m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m);
  };
  // key softbox, high camera-left
  box(9, 6, 0, -7, 7.5, 5.5, 0xfff2e2, 3.2);
  // rim, behind camera-right, slightly cool
  box(7, 9, 0, 8, 3, -7, 0xe8eef6, 2.1);
  // low warm bounce
  box(12, 3, 0, 0, -3.5, 6, 0xd8c3ab, 0.5);
  // top strip
  box(4, 14, 0, 0, 10, 0, 0xffffff, 0.9);
  // dark surround so blacks stay black
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(40, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0x060606, side: THREE.BackSide })
  );
  s.add(shell);
  return s;
}

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: false, powerPreference: "high-performance",
    preserveDrawingBuffer: true,
  });
  renderer.setClearColor(0x000000, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 200);
  camera.position.set(0, 0.35, 5.2);

  // IBL
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envRT = pmrem.fromScene(studioEnvScene(), 0.02);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.95;

  // discrete lights on top of IBL
  const key = new THREE.DirectionalLight(0xfff4e8, 2.6);
  key.position.set(-4.2, 6.4, 4.4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 1; key.shadow.camera.far = 24;
  key.shadow.camera.left = -6; key.shadow.camera.right = 6;
  key.shadow.camera.top = 6; key.shadow.camera.bottom = -6;
  key.shadow.bias = -0.0012;
  key.shadow.radius = 3;
  scene.add(key);

  const rim = new THREE.DirectionalLight(0xdfe8f4, 2.3);
  rim.position.set(5.6, 2.2, -5.2);
  scene.add(rim);

  const fill = new THREE.HemisphereLight(0x2a2622, 0x000000, 0.28);
  scene.add(fill);

  // baked-look contact shadow
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: canvasTex(256, 256, (g, w, h) => {
        const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        r.addColorStop(0, "rgba(0,0,0,0.72)");
        r.addColorStop(0.45, "rgba(0,0,0,0.34)");
        r.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = r; g.fillRect(0, 0, w, h);
      }),
      transparent: true, depthWrite: false, opacity: 0.9,
    })
  );
  contact.rotation.x = -Math.PI / 2;
  contact.renderOrder = -1;
  scene.add(contact);

  const env = { renderer, scene, camera, key, rim, fill, contact, envRT, pmrem };

  env.resize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, w > 1600 ? 1.6 : 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    env.applyShift();
  };

  /* composition offset: pushes the subject off-centre without moving it,
     so the type column on the left stays clear of the object */
  env._shift = 0;
  env.applyShift = () => {
    const w = window.innerWidth, h = window.innerHeight;
    const fx = w < 900 ? 0 : env._shift;
    if (Math.abs(fx) < 0.002) camera.clearViewOffset();
    else camera.setViewOffset(w, h, -fx * w, 0, w, h);
  };
  env.setShift = (fx) => { env._shift = fx; env.applyShift(); };

  env.resize();
  window.addEventListener("resize", env.resize);

  return env;
}

/* ---------- camera rig: lerped keys ---------- */
export class CameraRig {
  constructor(camera) {
    this.cam = camera;
    this.pos = new THREE.Vector3(0, 0.35, 5.2);
    this.tgt = new THREE.Vector3(0, 0, 0);
    this.fov = 42;
    this.roll = 0;
    this._p = new THREE.Vector3();
    this._t = new THREE.Vector3();
  }
  /* a = {pos:[x,y,z], tgt:[x,y,z], fov, roll}, blended by k */
  set(a, b, k) {
    const lerp3 = (out, A, B) => out.set(
      A[0] + (B[0] - A[0]) * k,
      A[1] + (B[1] - A[1]) * k,
      A[2] + (B[2] - A[2]) * k
    );
    lerp3(this._p, a.pos, b.pos);
    lerp3(this._t, a.tgt, b.tgt);
    this.pos.copy(this._p);
    this.tgt.copy(this._t);
    this.fov = a.fov + (b.fov - a.fov) * k;
    this.roll = (a.roll || 0) + ((b.roll || 0) - (a.roll || 0)) * k;
  }
  /* smooth toward target so scrubbing feels weighted */
  apply(smooth = 1) {
    const c = this.cam;
    c.position.lerp(this.pos, smooth);
    c.lookAt(this.tgt);
    c.rotateZ(this.roll);
    if (Math.abs(c.fov - this.fov) > 0.01) {
      c.fov += (this.fov - c.fov) * Math.min(1, smooth * 1.4);
      c.updateProjectionMatrix();
    }
  }
}
