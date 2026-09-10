// @ts-nocheck
/* ============================================================
   FORMA — director: scroll → progress → chapter + t → poses ·
   camera · materials · UI.

   Adapted from the Forma.html design's main.js (claude.ai/design).
   The only structural change from the original is that everything
   is wrapped in `initExperience(els)`, which returns a `dispose()`
   cleanup — the original ran straight off `document.getElementById`
   at module-load time, which doesn't fit a route that mounts/unmounts
   repeatedly (React StrictMode double-invokes effects in dev, and a
   real route change must free the WebGL context). Element lookups,
   the `stack` class target, and animation-frame/interval teardown are
   the only things that changed; the film/pose/camera/material logic
   below is otherwise verbatim.
   ============================================================ */
import * as THREE from 'three';
import { createStage, CameraRig } from './stage';
import { buildParts } from './parts';
import { CHAPTERS, Film, applyTargets } from './film';
import { mountUI } from './ui';

export interface ExperienceElements {
  canvas: HTMLCanvasElement;
  uiRoot: HTMLElement;
  railRoot: HTMLElement;
  chlabelEl: HTMLElement;
  spacerEl: HTMLElement;
  copyRoot: HTMLElement;
  stackTarget: HTMLElement;
  preEl: HTMLElement;
  pctEl: HTMLElement;
}

export function initExperience(els: ExperienceElements): () => void {
  const { canvas, uiRoot, railRoot, chlabelEl, spacerEl, copyRoot, stackTarget, preEl, pctEl } = els;

  const stage = createStage(canvas);
  const kit = buildParts(stage.scene);
  const rig = new CameraRig(stage.camera);
  const film = new Film(rig);
  const ui = mountUI(uiRoot);

  const IDS = kit.list.filter((p) => p.kind !== 'cable').map((p) => p.id);
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* make every material fadeable */
  Object.values(kit.M).forEach((m: any) => {
    m.transparent = true;
    m.opacity = 1;
  });

  /* ---------- scroll spine ---------- */
  spacerEl.style.height = film.total + 'vh';
  let target = 0,
    progress = 0;
  const readScroll = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    target = max > 0 ? window.scrollY / max : 0;
  };
  window.addEventListener('scroll', readScroll, { passive: true });
  window.addEventListener('resize', readScroll);
  readScroll();
  progress = target;

  /* ---------- copy deck ---------- */
  const beats = [...copyRoot.querySelectorAll('[data-ch]')].map((el: any) => ({
    el,
    ch: el.dataset.ch,
    a: parseFloat(el.dataset.a ?? '0.06'),
    b: parseFloat(el.dataset.b ?? '0.94'),
  }));

  /* ---------- chapter rail ---------- */
  CHAPTERS.forEach((c, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tick';
    b.setAttribute('aria-label', 'Chapter ' + (i + 1) + ': ' + c.label);
    b.innerHTML = `<span class="tl">${String(i + 1).padStart(2, '0')} ${c.label}</span>`;
    b.onclick = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo({ top: (film.marks[i].start / film.total) * max + 4, behavior: 'smooth' });
    };
    railRoot.appendChild(b);
  });
  const ticks = [...railRoot.children] as HTMLElement[];

  /* ---------- helpers ---------- */
  const cl = (v) => Math.min(1, Math.max(0, v));
  const win = (t, a, b) => cl((t - a) / Math.max(0.0001, b - a));
  const band = (t, a, b, f = 0.18) => {
    const u = win(t, a, b);
    return Math.min(u / f, 1, (1 - u) / f);
  };
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeMech = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const easeDigi = (x) => 1 - Math.pow(1 - x, 3);

  function pairOf(list, t) {
    const n = list.length - 1;
    const f = cl(t) * n * 0.999999;
    const i = Math.floor(f);
    return { a: list[i], b: list[Math.min(i + 1, list.length - 1)], k: f - i };
  }

  /* how present the 3D lattice should be — DOM UI always composites above
     the canvas, so wherever a large product panel carries the frame the
     structure must drop back to a backdrop */
  function structLevel(id, t) {
    switch (id) {
      case 'hero':
      case 'problem':
      case 'assembly':
        return 1;
      case 'hinge':
        return 1 - win(t, 0.68, 1) * 0.82;
      case 'realtime':
        return 1;
      case 'handoff':
        return 0.3 + win(t, 0.4, 1) * 0.6;
      case 'progress':
        return 1 - win(t, 0.34, 0.8) * 0.7;
      case 'final':
      case 'close':
        return 1;
      case 'scale':
        return 0.55;
      default:
        return 0.16;
    }
  }

  /* ---------- material state per chapter ---------- */
  function matState(id, t) {
    const s = { mesh: 1, edge: 0, node: 0, accent: 0.0, fmark: 0, light: 1, contact: 1, stream: 1, streamGlow: 0 };
    switch (id) {
      case 'hero':
        s.accent = win(t, 0.55, 1) * 0.6;
        break;
      case 'problem':
        s.accent = 0.6;
        break;
      case 'assembly':
        s.accent = 0.4;
        break;
      case 'hinge': {
        const ig = win(t, 0.02, 0.3),
          di = win(t, 0.3, 0.56),
          re = win(t, 0.56, 1);
        s.edge = Math.max(ig, 1 - re * 0.5);
        s.accent = 0.4 + ig * 1.6;
        s.mesh = 1 - di * 0.94;
        s.node = re;
        s.light = 1 - di * 0.7;
        s.contact = 1 - di;
        s.stream = Math.max(0.35, 1 - di * 0.5);
        s.streamGlow = re * 1.2;
        break;
      }
      case 'close':
        s.mesh = 0;
        s.edge = 0;
        s.node = 0;
        s.fmark = 0;
        s.accent = 0;
        s.light = 0.3;
        s.contact = 0;
        s.stream = 0;
        break;
      case 'final': {
        const up = win(t, 0, 0.34),
          out = win(t, 0.5, 0.86),
          fm = win(t, 0.36, 0.54);
        s.mesh = 0.06;
        s.edge = Math.max(0.32 + up * 0.68 - out, 0);
        s.node = 1 - out;
        s.fmark = fm;
        s.accent = 1 + fm * 1.4;
        s.light = 0.3 + fm * 0.5;
        s.contact = 0;
        s.stream = Math.max(0, 0.85 - out);
        s.streamGlow = 1.6;
        break;
      }
      default:
        s.mesh = 0.06;
        s.edge = 0.52;
        s.node = 0.95;
        s.accent = 1.1;
        s.light = 0.3;
        s.contact = 0;
        s.stream = 0.92;
        s.streamGlow = 1.35;
    }
    return s;
  }

  /* ---------- contact shadow footprint per chapter ---------- */
  function contactFor(id, t) {
    switch (id) {
      case 'hero':
        return { y: -0.3, s: 1.5 };
      case 'problem':
        return { y: -0.3, s: lerp(1.5, 2.9, t) };
      case 'assembly':
        return { y: 0.005, s: lerp(2.9, 4.6, t) };
      case 'hinge':
        return { y: 0.005, s: 4.6 };
      default:
        return { y: 0.005, s: 4.6 };
    }
  }

  /* ---------- UI choreography ---------- */
  let uiShiftPx = 0;

  /* Design-space width of the panel that must clear the type column, per
     chapter. 0 = no left-column conflict (centered copy, or the 3D carries
     the frame on its own). */
  const PANEL_W = {
    hinge: 960,
    clients: 960,
    builder: 880,
    library: 600,
    handoff: 960,
    progress: 880,
    business: 880,
    scale: 820,
    beforeafter: 960,
  };
  const GUTTER = 44;
  /* Right edge of the copy column, derived from the CSS rather than measured
     (measuring is circular once the stacked layout changes the column's width). */
  function copyRightPx(vw) {
    if (vw >= 1280) return 40 + vw * 0.04 + 8 + Math.min(vw * 0.34, 430);
    return 40 + vw * 0.05 + Math.min(vw * 0.46, 420);
  }
  /* Below this render scale the product UI stops being legible, so we stop
     trying to fit copy and panel side by side and stack them instead. */
  const SIDE_BY_SIDE_MIN_FIT = 0.65;
  const HEADER_H = 92; // fixed site header the panel must stay clear of
  const COMPACT_COPY_H = 150; // eyebrow + headline (stacked mode hides .sub/.fields)

  /* fractional viewport coords, biased right so the type column stays clear,
     clamped so a fragment can never leave the frame */
  const FRAGS: [string, number, number, number, number, number][] = [
    ['fchat', 0.13, -0.34, -240, 8, 14],
    ['fsheet', 0.4, -0.06, -430, 6, -16],
    ['fpdf', 0.09, 0.31, -560, -5, 12],
    ['fphotos', 0.42, 0.3, -300, -7, -12],
    ['fnotes', -0.06, -0.02, -700, 4, 3],
  ];
  function fragXY(fx, fy, spread) {
    const vw = window.innerWidth,
      vh = window.innerHeight;
    const k = Math.min(1, vw / 1500) * spread;
    const maxX = Math.max(50, vw / 2 - 165 - Math.abs(uiShiftPx));
    const maxY = Math.max(50, vh / 2 - 140);
    const cl2 = (v, m) => Math.max(-m, Math.min(m, v));
    return [cl2(fx * vw * k, maxX), cl2(fy * vh * k, maxY)];
  }
  const vx = (f) => f * window.innerWidth;

  function placeUI(id, t) {
    ui.hideAll();
    switch (id) {
      case 'problem': {
        const o = band(t, 0.18, 1.6, 0.18);
        const pull = win(t, 0.55, 1);
        FRAGS.forEach(([k, fx, fy, z, rx, ry], i) => {
          const [x, y] = fragXY(fx, fy, 1 - pull * 0.34);
          ui.set(k, { o: o * (0.85 + i * 0.03), x, y, z: z + pull * 130, rx, ry, s: 1 - pull * 0.08 });
        });
        break;
      }
      case 'hinge':
        ui.set('dash', { o: win(t, 0.66, 0.95), y: 26, z: lerp(-520, 0, win(t, 0.62, 1)), s: lerp(0.86, 1, win(t, 0.62, 1)) });
        break;
      case 'clients': {
        const c = win(t, 0.18, 0.7);
        ui.set('dash', { o: 1 - c * 0.62, y: 26, z: -c * 150, s: 1 - c * 0.08 });
        ui.set('cc2', { o: c * 0.4, x: vx(0.15), y: -210, z: 80, ry: -11, s: 0.84 });
        ui.set('cc1', { o: c * 0.6, x: vx(0.12), y: 185, z: 140, ry: -8, s: 0.88 });
        ui.set('cc0', { o: c, x: vx(0.0), y: -12, z: 255, ry: -4, s: 1.02 });
        break;
      }
      case 'builder': {
        const p1 = band(t, 0, 0.37, 0.16),
          p2 = band(t, 0.35, 0.7, 0.16),
          p3 = band(t, 0.68, 1, 0.16);
        ui.set('bWork', { o: band(t, -0.12, 0.37, 0.16), ry: lerp(-14, 8, win(t, 0, 0.37)) });
        ui.set('bNut', { o: p2, ry: lerp(-14, 8, win(t, 0.35, 0.7)) });
        ui.set('bCar', { o: p3, ry: lerp(-14, 8, win(t, 0.68, 1)) });
        break;
      }
      case 'library': {
        const a = band(t, -0.15, 0.54, 0.16),
          b = band(t, 0.5, 1.35, 0.16);
        ui.set('libEx', { o: a, x: lerp(180, -180, win(t, 0, 0.54)), z: 40, ry: lerp(9, -9, win(t, 0, 0.54)) });
        ui.set('libFood', { o: b, x: lerp(180, -180, win(t, 0.5, 1)), z: 40, ry: lerp(9, -9, win(t, 0.5, 1)) });
        break;
      }
      case 'handoff': {
        const out = win(t, 0, 0.26);
        ui.set('dash', { o: 1 - out, y: 26, s: 1 - out * 0.12, z: -out * 200 });
        const c = win(t, 0.14, 0.5);
        ui.set('cc0', {
          o: band(t, 0.1, 0.54, 0.18),
          x: lerp(vx(0.0), vx(0.06), c),
          y: lerp(-12, 0, c),
          z: lerp(150, 200, c),
          ry: lerp(-4, 88, c),
          s: lerp(1.02, 1.14, c),
        });
        const ph = win(t, 0.5, 0.88);
        ui.set('phone', {
          o: band(t, 0.48, 1.7, 0.14),
          x: lerp(vx(0.06), vx(0.05), ph),
          y: -18,
          z: lerp(200, 120, ph),
          ry: lerp(-86, 0, ph),
          s: lerp(0.98, 0.9, ph),
        });
        break;
      }
      case 'realtime': {
        ui.set('dashMini', { o: 0.94, x: vx(-0.27), y: -40, z: -180, ry: 16, s: 0.56 });
        ui.set('phone', { o: 1, x: vx(0.29), y: -40, z: 10, ry: -14, s: 0.72 });
        break;
      }
      case 'progress': {
        const out = win(t, 0, 0.34);
        ui.set('dashMini', { o: (1 - out) * 0.9, x: vx(-0.27) - out * 140, y: -40, z: -180, ry: 16, s: 0.56 });
        ui.set('phone', { o: 1 - out, x: vx(0.29) + out * 170, y: -40, z: 10, ry: -14, s: 0.72 });
        ui.set('prog', { o: band(t, 0.3, 1.8, 0.14), z: lerp(-160, 30, win(t, 0.3, 1)), s: lerp(0.92, 1, win(t, 0.3, 1)) });
        break;
      }
      case 'business': {
        ui.set('prog', { o: band(t, -0.2, 0.42, 0.3), z: 30, s: 1 - win(t, 0, 0.42) * 0.06 });
        ui.set('biz', { o: band(t, 0.3, 1.2, 0.16), z: lerp(-120, 20, win(t, 0.3, 0.8)), s: lerp(0.94, 1, win(t, 0.3, 0.8)) });
        break;
      }
      case 'scale': {
        ui.set('biz', { o: band(t, -0.2, 0.4, 0.3), z: 20, s: 1 - win(t, 0, 0.4) * 0.12 });
        ui.set('hier', { o: band(t, 0.28, 1.2, 0.16), z: lerp(-260, -40, win(t, 0.28, 1)), s: lerp(0.86, 1, win(t, 0.28, 1)) });
        break;
      }
      case 'beforeafter': {
        const scatter = band(t, -0.12, 0.62, 0.16);
        const conv = win(t, 0.16, 0.72);
        FRAGS.forEach(([k, fx, fy, z, rx, ry], i) => {
          const [sx, sy] = fragXY(fx * 1.25, fy * 1.05, 1);
          const d = 1 - conv;
          ui.set(k, {
            o: scatter,
            x: lerp(sx, -20 + i * 10, conv),
            y: lerp(sy, -10 + i * 6, conv),
            z: lerp(z, -60, conv),
            rx: rx * d,
            ry: ry * d,
            s: lerp(1, 0.72, conv),
          });
        });
        ui.set('dash', { o: band(t, 0.66, 1.3, 0.14), y: 26, z: lerp(-220, 0, win(t, 0.66, 1)), s: lerp(0.9, 1, win(t, 0.66, 1)) });
        break;
      }
      case 'final':
        ui.set('dash', { o: Math.max(0, 1 - win(t, 0, 0.28) * 1.2), z: -win(t, 0, 0.28) * 200, s: 1 - win(t, 0, 0.28) * 0.14 });
        break;
      default:
        break;
    }
  }

  /* ---------- node instances follow the bolts ---------- */
  const _m = new THREE.Matrix4(),
    _s = new THREE.Vector3(1, 1, 1),
    _qq = new THREE.Quaternion();
  function syncNodes(op) {
    kit.nodes.material.opacity = op;
    kit.nodes.visible = op > 0.02;
    if (!kit.nodes.visible) return;
    for (let i = 0; i < 24; i++) {
      const b = kit.parts['bolt' + i];
      const on = b.mesh.visible ? 1 : 0.0001;
      _m.compose(b.mesh.position, _qq.identity(), _s.set(on, on, on));
      kit.nodes.setMatrixAt(i, _m);
    }
    kit.nodes.instanceMatrix.needsUpdate = true;
  }

  /* ---------- frame ---------- */
  let last = 0,
    envRot = 0;
  let disposed = false;
  let rafId = 0;

  function step(dt, forceProgress?) {
    if (forceProgress != null) {
      target = forceProgress;
      progress = forceProgress;
    } else progress += (target - progress) * (REDUCED ? 1 : Math.min(1, dt * 6.2));

    const { mark, index, t: raw } = film.locate(progress);
    const ch = mark.c;
    const ease = ch.ease === 'mech' ? easeMech : easeDigi;
    const t = ch.static ? raw : ease(raw);

    // poses
    const pp = pairOf(ch.poses, t);
    const A = film.poseFor(pp.a, IDS),
      B = film.poseFor(pp.b, IDS);
    const ms = matState(ch.id, t);
    const sL = structLevel(ch.id, raw);
    ms.edge *= sL;
    ms.node *= sL;
    ms.streamGlow *= Math.max(0.35, sL);
    if (ch.id !== 'hero' && ch.id !== 'problem' && ch.id !== 'assembly' && ch.id !== 'hinge') ms.stream *= sL;
    applyTargets(kit, A, B, pp.k, ms);

    // materials
    Object.values(kit.M).forEach((m: any) => {
      if (m !== kit.M.cable) m.opacity = ms.mesh;
    });
    kit.M.cable.opacity = ms.stream;
    kit.M.cable.emissiveIntensity = ms.streamGlow;
    kit.M.accent.emissiveIntensity = ms.accent;
    kit.edgeMat.opacity = ms.edge;
    syncNodes(ms.node);
    kit.fMark.visible = ms.fmark > 0.02;
    kit.fPlane.material.opacity = ms.fmark;
    kit.fGlow.material.opacity = ms.fmark * 0.9;
    if (kit.fMark.visible) {
      const e = win(raw, 0.38, 0.88);
      const em = 1 - Math.pow(1 - e, 3);
      const spin = 1 - Math.pow(1 - e, 2);
      kit.fMark.rotation.y = (1 - spin) * -1.7;
      kit.fMark.scale.setScalar(lerp(0.03, 0.6, em));
      kit.fMark.position.set(0, lerp(0, 0.64, em) + Math.sin(envRot * 1.4) * 0.006 * em, lerp(-0.2, 0, em));
      kit.fGlow.scale.setScalar(lerp(0.1, 1, em));
    }
    stage.key.intensity = 2.6 * ms.light;
    stage.rim.intensity = 1.5 * ms.light;
    const cf = contactFor(ch.id, t);
    stage.contact.position.y = cf.y;
    stage.contact.scale.setScalar(cf.s);
    stage.contact.material.opacity = 0.9 * ms.contact;
    stage.contact.visible = ms.contact > 0.02;

    // camera
    const cp = pairOf(ch.cam, t);
    rig.set(cp.a, cp.b, cp.k);
    rig.apply(1);

    // composition: subject off-centre; the DOM UI shifted + fitted to match.
    const vw = window.innerWidth,
      vh = window.innerHeight;
    const pw = PANEL_W[ch.id] || 0;
    const wide = vw >= 900;
    let fit = null,
      uiShift = 0,
      uiLift = 0,
      stack = false;

    if (wide && pw > 0) {
      const need = copyRightPx(vw) + GUTTER;
      const fitCap = (vw - 14 - need) / pw;
      if (fitCap >= SIDE_BY_SIDE_MIN_FIT) {
        fit = Math.min(1, (vw - 120) / 1010, (vh - 96) / 700, fitCap);
        const half = (pw * fit) / 2;
        const minShift = need + half - vw / 2;
        const maxShift = vw / 2 - half - 14;
        uiShift = Math.min(Math.max((ch.shift || 0) * vw, minShift), maxShift);
      } else {
        stack = true;
      }
    }

    if (stack) {
      const bandTop = HEADER_H;
      const bandBottom = vh - vh * 0.08 - COMPACT_COPY_H - 14;
      const bandH = Math.max(170, bandBottom - bandTop);
      fit = Math.min(1, (vw - 48) / 1010, bandH / 640);
      uiLift = (bandTop + bandBottom) / 2 - vh / 2;
    } else if (fit === null) {
      fit = Math.min(1, (vw - (wide ? 120 : 32)) / 1010, (vh - 96) / 700);
      if (wide) {
        const half = (1010 * fit) / 2;
        uiShift = Math.min((ch.shift || 0) * vw, Math.max(0, vw / 2 - half - 14));
      }
    }
    fit = Math.max(0.3, fit);

    stackTarget.classList.toggle('stack', stack);
    uiShiftPx = uiShift;
    stage.setShift(uiShift / vw);
    uiRoot.style.transform = `translate(${uiShift.toFixed(1)}px,${uiLift.toFixed(1)}px) scale(${fit.toFixed(3)})`;

    // idle life: slow environment rotation so a still frame still breathes
    envRot += dt * 0.02;
    (stage.scene as any).environmentRotation && (stage.scene as any).environmentRotation.set(0, envRot, 0);

    // hero object drift
    if (ch.id === 'hero') kit.root.rotation.y = Math.sin(envRot * 0.6) * 0.03 + t * 2.4;
    else if (ch.id === 'problem') kit.root.rotation.y = 2.4 + t * 0.5;
    else kit.root.rotation.y += (0 - kit.root.rotation.y) * 0.06;

    // sheaves turn while cables are under tension
    if (ch.id === 'assembly' || ch.id === 'hinge') {
      for (let i = 0; i < 4; i++) kit.parts['pulley' + i].sheave.rotation.y += dt * 0.9;
    }

    // pulley rings face camera in the chart chapters
    if (ch.id === 'progress' || ch.id === 'business' || ch.id === 'scale') {
      for (let i = 0; i < 4; i++) kit.parts['pulley' + i].mesh.rotation.set(0, 0, 0);
    }

    placeUI(ch.id, raw);

    // copy — linear timing so sequential beats get equal time
    beats.forEach((bt) => {
      const on = bt.ch === ch.id ? band(raw, bt.a, bt.b, 0.16) : 0;
      bt.el.style.opacity = on.toFixed(3);
      bt.el.style.visibility = on > 0.01 ? 'visible' : 'hidden';
      bt.el.style.transform = `translateY(${(1 - on) * 14}px)`;
    });

    // rail
    ticks.forEach((el, i) => el.classList.toggle('on', i === index));
    const want = `<b>${String(index + 1).padStart(2, '0')}</b> ${ch.label}`;
    if (chlabelEl.innerHTML !== want) chlabelEl.innerHTML = want;
    document.documentElement.style.setProperty('--film', (progress * 100).toFixed(2) + '%');

    stage.renderer.render(stage.scene, stage.camera);
  }

  function frame(now) {
    if (disposed) return;
    rafId = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    step(dt);
  }

  /* deterministic hook — lets any film position be reviewed exactly */
  (window as any).__forma = {
    step,
    seek(p) {
      step(0.016, Math.min(1, Math.max(0, p)));
    },
    at(i, t = 0.5) {
      const m = film.marks[Math.min(i, film.marks.length - 1)];
      step(0.016, (m.start + m.len * t) / film.total);
    },
    info() {
      const l = film.locate(progress);
      return { chapter: l.index, id: l.mark.c.id, t: +l.t.toFixed(3), progress: +progress.toFixed(4) };
    },
  };

  /* ---------- preloader ---------- */
  let pct = 0;
  const tick = setInterval(() => {
    pct = Math.min(100, pct + 6 + Math.random() * 10);
    pctEl.textContent = String(Math.floor(pct)).padStart(3, '0');
    if (pct >= 100) {
      clearInterval(tick);
      preEl.classList.add('done');
      preloaderHideTimer = window.setTimeout(() => {
        preEl.style.display = 'none';
      }, 900);
    }
  }, 70);
  let preloaderHideTimer = 0;

  /* watchdog: if this environment somehow never boots (e.g. a bundler/CSP
     issue blocking the module), say so instead of sitting on the preloader
     forever — ported from Forma.html's inline fallback script. */
  const blockedTimer = window.setTimeout(() => {
    if (!(window as any).__forma) preEl.classList.add('blocked');
  }, 4000);

  rafId = requestAnimationFrame(frame);

  return function dispose() {
    disposed = true;
    cancelAnimationFrame(rafId);
    clearInterval(tick);
    clearTimeout(preloaderHideTimer);
    clearTimeout(blockedTimer);
    window.removeEventListener('scroll', readScroll);
    window.removeEventListener('resize', readScroll);
    ui.dispose();
    railRoot.innerHTML = '';
    stage.dispose();
    delete (window as any).__forma;
  };
}
