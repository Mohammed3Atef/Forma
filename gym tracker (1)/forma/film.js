/* ============================================================
   FORMA — film: poses, chapter manifest, resolver.
   Scroll is the only clock. Everything here is a pure function
   of (chapter, t) so scrubbing backwards is frame-identical.
   ============================================================ */
import * as THREE from "three";
import { setCable } from "./parts.js";

const HID = 0.0001;
const CP = 5; // control points per cable, fixed so lerp is well-defined

/* ---------- target scaffold ---------- */
function blank(ids) {
  const t = { parts: {}, cables: [] };
  ids.forEach((id) => {
    t.parts[id] = { p: [0, 0, 0], r: [0, 0, 0], s: [HID, HID, HID], vis: 0 };
  });
  for (let i = 0; i < 4; i++) {
    t.cables.push({ pts: Array.from({ length: CP }, () => [0, 0, 0]), vis: 0, r: 0.011 });
  }
  return t;
}
const set = (T, id, p, r, s, vis = 1) => {
  const o = T.parts[id];
  if (!o) return;
  o.p = p; o.r = r || [0, 0, 0];
  o.s = typeof s === "number" ? [s, s, s] : (s || [1, 1, 1]);
  o.vis = vis;
};
const plateSide = (i) => (i < 4 ? -1 : 1);
const plateK = (i) => i % 4;

/* ============================================================
   POSES — the same parts, in every configuration the film needs
   ============================================================ */
export const POSES = {};

/* 1 · dumbbell */
POSES.DUMBBELL = (ids) => {
  const T = blank(ids);
  set(T, "shaft", [0, 0, 0], [0, 0, 0], [0.4, 1, 1]);
  set(T, "sleeve0", [-0.14, 0, 0], [0, 0, 0], [0.5, 1, 1]);
  set(T, "sleeve1", [0.14, 0, 0], [0, 0, 0], [0.5, 1, 1]);
  for (let i = 0; i < 8; i++) {
    const s = plateSide(i), k = plateK(i);
    set(T, "plate" + i, [s * (0.15 + k * 0.049), 0, 0], [0, 0, 0], 1);
  }
  set(T, "collar0", [-0.345, 0, 0]);
  set(T, "collar1", [0.345, 0, 0]);
  return T;
};

/* 2 · exploded — plates released, held in space */
POSES.EXPLODED = (ids) => {
  const T = POSES.DUMBBELL(ids);
  for (let i = 0; i < 8; i++) {
    const s = plateSide(i), k = plateK(i);
    set(T, "plate" + i, [s * (0.34 + k * 0.17), 0, 0], [0, 0, 0], 1);
  }
  set(T, "collar0", [-1.02, 0, 0], [0.9, 0, 0]);
  set(T, "collar1", [1.02, 0, 0], [-0.9, 0, 0]);
  set(T, "shaft", [0, 0, 0], [0, 0, 0], [1.1, 1, 1]);
  set(T, "sleeve0", [-0.48, 0, 0], [0, 0, 0], [0.6, 1, 1]);
  set(T, "sleeve1", [0.48, 0, 0], [0, 0, 0], [0.6, 1, 1]);
  return T;
};

/* 3 · barbell — handle telescoped, plates re-seated outboard */
POSES.BARBELL = (ids) => {
  const T = blank(ids);
  set(T, "shaft", [0, 0, 0], [0, 0, 0], [2.3, 1, 1]);
  set(T, "sleeve0", [-1.0, 0, 0], [0, 0, 0], [0.95, 1, 1]);
  set(T, "sleeve1", [1.0, 0, 0], [0, 0, 0], [0.95, 1, 1]);
  for (let i = 0; i < 8; i++) {
    const s = plateSide(i), k = plateK(i);
    set(T, "plate" + i, [s * (0.74 + k * 0.057), 0, 0], [0, 0, 0], 1);
  }
  set(T, "collar0", [-1.0, 0, 0]);
  set(T, "collar1", [1.0, 0, 0]);
  return T;
};

/* 4 · bench — frame assembles under the bar */
POSES.BENCH = (ids) => {
  const T = POSES.BARBELL(ids);
  const lift = (id, y) => { const o = T.parts[id]; o.p = [o.p[0], y, o.p[2]]; };
  ["shaft", "sleeve0", "sleeve1", "collar0", "collar1"].forEach((id) => lift(id, 0.98));
  for (let i = 0; i < 8; i++) lift("plate" + i, 0.98);
  set(T, "pad", [0, 0.5, 0], [0, 0, 0], [1, 1, 1]);
  // legs
  set(T, "frame0", [0, 0, 0.48], [0, 0, 0], [1, 0.47, 1]);
  set(T, "frame1", [0, 0, -0.48], [0, 0, 0], [1, 0.47, 1]);
  // rails along Z
  set(T, "frame2", [0, 0.44, -0.55], [-Math.PI / 2, 0, 0], [1, 1.1, 1]);
  set(T, "frame3", [0, 0.03, -0.55], [-Math.PI / 2, 0, 0], [1, 1.1, 1]);
  // bolts at the joints
  const bp = [
    [0.05, 0.44, 0.46], [-0.05, 0.44, 0.46], [0.05, 0.44, -0.46], [-0.05, 0.44, -0.46],
    [0.05, 0.06, 0.46], [-0.05, 0.06, 0.46], [0.05, 0.06, -0.46], [-0.05, 0.06, -0.46],
  ];
  bp.forEach((p, i) => set(T, "bolt" + i, p, [0, 0, Math.PI / 2], 1));
  return T;
};

/* 5 · rack — uprights telescope up, bar seats in the hooks */
POSES.RACK = (ids) => {
  const T = POSES.BENCH(ids);
  const lift = (id) => { const o = T.parts[id]; o.p = [o.p[0], 1.2, o.p[2]]; };
  ["shaft", "sleeve0", "sleeve1", "collar0", "collar1"].forEach(lift);
  for (let i = 0; i < 8; i++) lift("plate" + i);
  set(T, "upright0", [-0.66, 0, -0.2], [0, 0, 0], [1.4, 1.5, 1.4]);
  set(T, "upright1", [0.66, 0, -0.2], [0, 0, 0], [1.4, 1.5, 1.4]);
  for (let i = 8; i < 16; i++) {
    const s = i < 12 ? -1 : 1, k = i % 4;
    set(T, "bolt" + i, [s * 0.66, 0.25 + k * 0.36, -0.14], [Math.PI / 2, 0, 0], 1);
  }
  return T;
};

/* 6 · functional trainer — towers, pulleys, threaded cables, stacks */
POSES.TRAINER = (ids) => {
  const T = blank(ids);
  set(T, "upright0", [-0.82, 0, -0.25], [0, 0, 0], [1.5, 2.35, 1.5]);
  set(T, "upright1", [0.82, 0, -0.25], [0, 0, 0], [1.5, 2.35, 1.5]);
  // base + top cross members
  set(T, "frame0", [0, 0.07, -0.25], [0, 0, Math.PI / 2], [1.5, 1.64, 1.5]);
  set(T, "frame1", [0, 2.28, -0.25], [0, 0, Math.PI / 2], [1.5, 1.64, 1.5]);
  set(T, "frame2", [-0.82, 0.07, 0.18], [-Math.PI / 2, 0, 0], [1.5, 0.46, 1.5]);
  set(T, "frame3", [0.82, 0.07, 0.18], [-Math.PI / 2, 0, 0], [1.5, 0.46, 1.5]);
  // pad as the bench inside the trainer
  set(T, "pad", [0, 0.42, 0.02], [0, 0, 0], [0.92, 1, 0.86]);
  // bar still racked at the front
  set(T, "shaft", [0, 1.12, 0.34], [0, 0, 0], [1.9, 1, 1]);
  set(T, "sleeve0", [-0.8, 1.12, 0.34], [0, 0, 0], [0.85, 1, 1]);
  set(T, "sleeve1", [0.8, 1.12, 0.34], [0, 0, 0], [0.85, 1, 1]);
  set(T, "collar0", [-0.52, 1.12, 0.34]);
  set(T, "collar1", [0.52, 1.12, 0.34]);
  // the same 8 plates, now two weight stacks
  for (let i = 0; i < 8; i++) {
    const s = plateSide(i), k = plateK(i);
    set(T, "plate" + i, [s * 0.82, 0.22 + k * 0.082, -0.25], [0, 0, Math.PI / 2], 1);
  }
  // pulleys: two at the tops, two at mid-height
  set(T, "pulley0", [-0.82, 2.16, -0.05], [0, 0, 0], 1);
  set(T, "pulley1", [0.82, 2.16, -0.05], [0, 0, 0], 1);
  set(T, "pulley2", [-0.82, 1.05, -0.05], [0, 0, 0], 1);
  set(T, "pulley3", [0.82, 1.05, -0.05], [0, 0, 0], 1);
  // bolts across the towers
  for (let i = 0; i < 16; i++) {
    const s = i < 8 ? -1 : 1, k = i % 8;
    set(T, "bolt" + i, [s * 0.82, 0.2 + k * 0.28, 0.05], [Math.PI / 2, 0, 0], 1);
  }
  for (let i = 16; i < 24; i++) {
    const k = i - 16;
    set(T, "bolt" + i, [-0.7 + k * 0.2, 2.28, -0.17], [Math.PI / 2, 0, 0], 1);
  }
  // cables: top pulley → down the tower → into the stack
  const cab = (sign) => [
    [sign * 0.82, 2.16, 0.0], [sign * 0.82, 1.9, -0.06],
    [sign * 0.82, 1.4, -0.14], [sign * 0.82, 0.9, -0.22], [sign * 0.82, 0.56, -0.25],
  ];
  T.cables[0] = { pts: cab(-1), vis: 1, r: 0.014 };
  T.cables[1] = { pts: cab(1), vis: 1, r: 0.014 };
  T.cables[2] = {
    pts: [[-0.82, 1.05, 0.0], [-0.55, 1.02, 0.12], [-0.24, 0.98, 0.18], [0.16, 0.98, 0.18], [0.48, 1.0, 0.14]], vis: 1, r: 0.014,
  };
  T.cables[3] = {
    pts: [[0.82, 1.05, 0.0], [0.55, 1.02, 0.12], [0.24, 0.98, 0.18], [-0.16, 0.98, 0.18], [-0.48, 1.0, 0.14]], vis: 1, r: 0.014,
  };
  return T;
};

/* 7 · grid — the machine re-indexed as interface structure */
POSES.GRID = (ids) => {
  const T = blank(ids);
  // uprights → vertical layout rails
  set(T, "upright0", [-1.55, -1.0, -0.35], [0, 0, 0], [0.14, 2.0, 0.14]);
  set(T, "upright1", [1.55, -1.0, -0.35], [0, 0, 0], [0.14, 2.0, 0.14]);
  // frames → horizontal grid lines
  set(T, "frame0", [0, 0.92, -0.35], [0, 0, Math.PI / 2], [0.14, 3.1, 0.14]);
  set(T, "frame1", [0, 0.2, -0.35], [0, 0, Math.PI / 2], [0.14, 3.1, 0.14]);
  set(T, "frame2", [0, -0.52, -0.35], [0, 0, Math.PI / 2], [0.14, 3.1, 0.14]);
  set(T, "frame3", [0, -1.0, -0.35], [0, 0, Math.PI / 2], [0.14, 3.1, 0.14]);
  // plates → information modules, flattened along their own axis, squared to camera
  for (let i = 0; i < 8; i++) {
    const col = i % 4, row = i < 4 ? 0 : 1;
    set(T, "plate" + i, [-1.1 + col * 0.73, 0.55 - row * 0.72, -0.3],
      [0, Math.PI / 2, 0], [0.1, 1.0, 1.0]);
  }
  // bolts → graph nodes on the intersections
  for (let i = 0; i < 24; i++) {
    const col = i % 6, row = (i / 6) | 0;
    set(T, "bolt" + i, [-1.55 + col * 0.62, 0.92 - row * 0.64, -0.34], [Math.PI / 2, 0, 0], 1);
  }
  // cables → orthogonal routes
  T.cables[0] = { pts: [[-1.55, 0.92, -0.33], [-0.9, 0.92, -0.33], [-0.9, 0.2, -0.33], [0.2, 0.2, -0.33], [0.85, 0.2, -0.33]], vis: 1 };
  T.cables[1] = { pts: [[1.55, 0.28, -0.33], [0.9, 0.28, -0.33], [0.9, -0.52, -0.33], [-0.3, -0.52, -0.33], [-1.0, -0.52, -0.33]], vis: 1 };
  T.cables[2] = { pts: [[-1.55, -0.2, -0.33], [-1.0, -0.2, -0.33], [-1.0, 0.6, -0.33], [0.6, 0.6, -0.33], [1.2, 0.6, -0.33]], vis: 1 };
  T.cables[3] = { pts: [[1.55, 0.92, -0.33], [1.2, 0.92, -0.33], [1.2, -0.9, -0.33], [-0.6, -0.9, -0.33], [-1.3, -0.9, -0.33]], vis: 1 };
  set(T, "pad", [0, -1.35, -0.4], [0, 0, 0], [3.6, 0.06, 0.5], 1);
  return T;
};

/* 8 · stream — the two-node coach/client stage */
POSES.STREAM = (ids) => {
  const T = blank(ids);
  const arc = (dir, yOff) => {
    const a = [], x0 = -1.75 * dir, x1 = 1.75 * dir;
    for (let i = 0; i < CP; i++) {
      const u = i / (CP - 1);
      a.push([x0 + (x1 - x0) * u, yOff + Math.sin(u * Math.PI) * 0.52, -0.5 + Math.sin(u * Math.PI) * 0.3]);
    }
    return a;
  };
  T.cables[0] = { pts: arc(1, 0.35), vis: 1, r: 0.024 };
  T.cables[1] = { pts: arc(-1, -0.05), vis: 1, r: 0.024 };
  T.cables[2] = { pts: arc(1, -0.45), vis: 1, r: 0.024 };
  T.cables[3] = { pts: arc(-1, 0.75), vis: 1, r: 0.024 };
  for (let i = 0; i < 24; i++) {
    const u = (i % 8) / 7, lane = (i / 8) | 0;
    set(T, "bolt" + i, [-1.75 + u * 3.5, 0.35 - lane * 0.4 + Math.sin(u * Math.PI) * 0.4, -0.5], [Math.PI / 2, 0, 0], 1);
  }
  return T;
};

/* 9 · charts — the connection curves become the graph */
POSES.CHARTS = (ids) => {
  const T = blank(ids);
  const series = (vals, y0, z) => vals.map((v, i) => [-1.5 + (i / (CP - 1)) * 3.0, y0 + v, z]);
  T.cables[0] = { pts: series([0.62, 0.44, 0.3, 0.16, 0.04], -0.15, -0.3), vis: 1, r: 0.026 };
  T.cables[1] = { pts: series([0.1, 0.2, 0.26, 0.4, 0.52], -0.85, -0.3), vis: 1, r: 0.026 };
  T.cables[2] = { pts: series([0, 0, 0, 0, 0], -0.15, -0.3), vis: 0.25, r: 0.014 };
  T.cables[3] = { pts: series([0, 0, 0, 0, 0], -0.85, -0.3), vis: 0.25, r: 0.014 };
  // bolts → data points on the two series
  for (let i = 0; i < 24; i++) {
    const k = i % 5, lane = i < 10 ? 0 : 1;
    const v0 = [0.62, 0.44, 0.3, 0.16, 0.04], v1 = [0.1, 0.2, 0.26, 0.4, 0.52];
    if (i < 10) set(T, "bolt" + i, [-1.5 + (k / 4) * 3.0, -0.15 + v0[k], -0.28], [Math.PI / 2, 0, 0], i < 5 ? 1 : 0);
    else if (i < 20) set(T, "bolt" + i, [-1.5 + (k / 4) * 3.0, -0.85 + v1[k], -0.28], [Math.PI / 2, 0, 0], i < 15 ? 1 : 0);
  }
  // pulleys → ring gauges
  set(T, "pulley0", [-1.05, 0.95, -0.3], [0, 0, 0], [2.4, 2.4, 0.5], 1);
  set(T, "pulley1", [0, 0.95, -0.3], [0, 0, 0], [2.4, 2.4, 0.5], 1);
  set(T, "pulley2", [1.05, 0.95, -0.3], [0, 0, 0], [2.4, 2.4, 0.5], 1);
  // axes
  set(T, "upright0", [-1.62, -1.3, -0.34], [0, 0, 0], [0.1, 2.4, 0.1], 1);
  set(T, "frame0", [0, -1.32, -0.34], [0, 0, Math.PI / 2], [0.1, 3.3, 0.1], 1);
  return T;
};

/* 10 · hierarchy — Forma as infrastructure */
POSES.HIER = (ids) => {
  const T = blank(ids);
  const tiers = [
    { y: 1.5, n: 1, w: 0 }, { y: 0.7, n: 3, w: 1.5 },
    { y: -0.15, n: 6, w: 2.7 }, { y: -1.0, n: 8, w: 3.3 },
  ];
  let bi = 0;
  tiers.forEach((tr) => {
    for (let i = 0; i < tr.n && bi < 24; i++, bi++) {
      const x = tr.n === 1 ? 0 : -tr.w / 2 + (i / (tr.n - 1)) * tr.w;
      set(T, "bolt" + bi, [x, tr.y, -0.7], [Math.PI / 2, 0, 0], 1);
    }
  });
  const conn = (y0, y1, x0, x1) => {
    const a = [];
    for (let i = 0; i < CP; i++) {
      const u = i / (CP - 1);
      a.push([x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, -0.7]);
    }
    return a;
  };
  T.cables[0] = { pts: conn(1.5, 0.7, 0, -0.75), vis: 1, r: 0.02 };
  T.cables[1] = { pts: conn(1.5, 0.7, 0, 0.75), vis: 1, r: 0.02 };
  T.cables[2] = { pts: conn(0.7, -0.15, -0.75, -1.35), vis: 1, r: 0.02 };
  T.cables[3] = { pts: conn(0.7, -0.15, 0.75, 1.35), vis: 1, r: 0.02 };
  return T;
};

/* 11 · converge — quiet grid while the DOM fragments do the work */
POSES.CONVERGE = (ids) => {
  const T = POSES.GRID(ids);
  for (let i = 0; i < 8; i++) T.parts["plate" + i].vis = 0.2;
  return T;
};

/* 12 · collapse — everything to centre, ahead of the mark */
POSES.COLLAPSE = (ids) => {
  const T = blank(ids);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    set(T, "bolt" + i, [Math.cos(a) * 0.16, Math.sin(a) * 0.16, -0.2], [Math.PI / 2, 0, 0], 1);
  }
  for (let i = 0; i < 4; i++) {
    T.cables[i] = {
      pts: Array.from({ length: CP }, (_, j) => {
        const a = (i / 4) * Math.PI * 2 + (j / (CP - 1)) * 0.5;
        const r = 0.5 - (j / (CP - 1)) * 0.42;
        return [Math.cos(a) * r, Math.sin(a) * r, -0.2];
      }), vis: 1, r: 0.022,
    };
  }
  return T;
};

/* ============================================================
   CHAPTERS — the manifest. Pacing lives here, nowhere else.
   ============================================================ */
export const PACING = 1.0;

const cam = (pos, tgt, fov, roll = 0) => ({ pos, tgt, fov, roll });

export const CHAPTERS = [
  {
    id: "hero", label: "Hero", vh: 160, poses: ["DUMBBELL", "DUMBBELL"], ease: "mech", shift: 0.17,
    cam: [
      cam([0.28, 0.3, 1.72], [0, 0, 0], 42),
      cam([-0.95, 0.34, 1.18], [0, 0, 0], 46, 0.02),
      cam([0.6, 0.09, 0.54], [0.33, 0, 0], 58),
    ],
  },
  {
    id: "problem", label: "The problem", vh: 200, poses: ["DUMBBELL", "EXPLODED", "BARBELL"], ease: "mech", shift: 0.14,
    cam: [
      cam([0.6, 0.09, 0.54], [0.33, 0, 0], 58),
      cam([0.3, 0.26, 1.95], [0, 0, 0], 50, -0.03),
      cam([0, 0.2, 3.35], [0, 0, 0], 40, -0.05),
    ],
  },
  {
    id: "assembly", label: "Assembly", vh: 280, poses: ["BARBELL", "BENCH", "RACK", "TRAINER"], ease: "mech", shift: 0.04,
    cam: [
      cam([0, 0.2, 3.35], [0, 0, 0], 40, -0.05),
      cam([-1.35, 0.55, 2.4], [0, 0.6, 0], 40, -0.02),
      cam([-1.95, 1.15, 3.4], [0, 1.0, 0], 38, 0.02),
      cam([2.9, 1.9, 4.0], [0, 1.1, 0], 34, 0.04),
      cam([0.55, 1.25, 4.7], [0, 1.05, -0.1], 38, 0),
    ],
  },
  {
    id: "hinge", label: "Materialization", vh: 220, poses: ["TRAINER", "TRAINER", "GRID"], ease: "digi", shift: 0.06,
    cam: [
      cam([0.55, 1.25, 4.7], [0, 1.05, -0.1], 38, 0),
      cam([0.05, 1.15, 1.1], [0, 1.1, -0.3], 44, 0),
      cam([0, 0.05, 3.15], [0, 0.02, -0.3], 45, 0),
    ],
  },
  {
    id: "clients", label: "Client workspace", vh: 140, poses: ["GRID", "GRID"], ease: "digi", shift: 0.16,
    cam: [cam([0, 0.05, 3.15], [0, 0.02, -0.3], 45), cam([0.22, 0.06, 2.72], [0, 0.02, -0.3], 50)],
  },
  {
    id: "builder", label: "Plan builder", vh: 200, poses: ["GRID", "GRID", "GRID"], ease: "digi", shift: 0.16,
    cam: [
      cam([0.22, 0.06, 2.72], [0, 0.02, -0.3], 50),
      cam([-0.5, 0.06, 2.9], [0, 0.02, -0.3], 48, 0.02),
      cam([0.45, 0.06, 2.85], [0, 0.02, -0.3], 48, -0.02),
    ],
  },
  {
    id: "library", label: "Library", vh: 160, poses: ["GRID", "GRID"], ease: "digi", shift: 0.13,
    cam: [cam([-0.9, 0.06, 2.6], [0, 0.02, -0.3], 42, -0.03), cam([0.9, 0.06, 2.6], [0, 0.02, -0.3], 42, 0.03)],
  },
  {
    id: "handoff", label: "Coach → client", vh: 180, poses: ["GRID", "STREAM"], ease: "digi", shift: 0.17,
    cam: [cam([0.9, 0.06, 2.6], [0, 0.02, -0.3], 42, 0.03), cam([0, 0.1, 4.3], [0, 0.05, -0.4], 46)],
  },
  {
    id: "realtime", label: "Real-time coaching", vh: 150, poses: ["STREAM", "STREAM"], ease: "digi",
    cam: [cam([0, 0.1, 4.3], [0, 0.05, -0.4], 46), cam([0, 0.1, 4.35], [0, 0.05, -0.4], 45)],
  },
  {
    id: "progress", label: "Progress", vh: 140, poses: ["STREAM", "CHARTS"], ease: "digi", shift: 0.15,
    cam: [cam([0, 0.1, 4.35], [0, 0.05, -0.4], 45), cam([0, 0.05, 3.5], [0, -0.1, -0.3], 44)],
  },
  {
    id: "business", label: "The business", vh: 120, poses: ["CHARTS", "CHARTS"], ease: "digi", shift: 0.15,
    cam: [cam([0, 0.05, 3.5], [0, -0.1, -0.3], 44), cam([0, 0.2, 5.0], [0, -0.05, -0.35], 38)],
  },
  {
    id: "scale", label: "Scale", vh: 130, poses: ["CHARTS", "HIER"], ease: "digi",
    cam: [cam([0, 0.2, 5.0], [0, -0.05, -0.35], 38), cam([0, 0.35, 6.6], [0, 0.15, -0.7], 32)],
  },
  {
    id: "beforeafter", label: "Before / after", vh: 180, poses: ["HIER", "CONVERGE"], ease: "digi",
    cam: [cam([0, 0.35, 6.6], [0, 0.15, -0.7], 32), cam([0, 0.03, 3.4], [0, 0, -0.32], 44)],
  },
  {
    id: "final", label: "The mark", vh: 160, poses: ["CONVERGE", "COLLAPSE", "COLLAPSE"], ease: "digi",
    cam: [
      cam([0, 0.03, 3.4], [0, 0, -0.32], 44),
      cam([0, 0, 2.6], [0, 0, -0.2], 46),
      cam([0, 0, 2.35], [0, 0, 0], 48),
    ],
  },
  { id: "close", label: "Close", vh: 100, poses: ["COLLAPSE", "COLLAPSE"], ease: "digi", cam: [cam([0, 0, 2.35], [0, 0, 0], 48), cam([0, 0, 2.35], [0, 0, 0], 48)], static: true },
];

/* ---------- easing ---------- */
const easeMech = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeDigi = (x) => 1 - Math.pow(1 - x, 3);
const EASE = { mech: easeMech, digi: easeDigi };

/* pick the active pair from a keyframe list */
function pair(list, t) {
  const n = list.length - 1;
  const f = Math.min(Math.max(t, 0), 0.999999) * n;
  const i = Math.floor(f);
  return { a: list[i], b: list[i + 1], k: f - i };
}

/* ============================================================
   RESOLVER
   ============================================================ */
export class Film {
  constructor(rig) {
    this.rig = rig;
    this.total = CHAPTERS.reduce((n, c) => n + c.vh * PACING, 0);
    let acc = 0;
    this.marks = CHAPTERS.map((c) => {
      const m = { c, start: acc, len: c.vh * PACING };
      acc += m.len;
      return m;
    });
    this._poseCache = {};
    this.state = { chapter: 0, t: 0, id: "hero" };
  }
  poseFor(name, ids) {
    if (!this._poseCache[name]) this._poseCache[name] = POSES[name](ids);
    return this._poseCache[name];
  }
  /* progress (0..1 across the whole film) → chapter + local t */
  locate(progress) {
    const v = progress * this.total;
    let m = this.marks[0];
    for (let i = 0; i < this.marks.length; i++) {
      if (v >= this.marks[i].start) m = this.marks[i];
    }
    const t = Math.min(1, Math.max(0, (v - m.start) / m.len));
    return { mark: m, index: this.marks.indexOf(m), t };
  }
}

/* ---------- apply a resolved target to the registry ---------- */
const _q = new THREE.Euler();
export function applyTargets(kit, A, B, k, mat) {
  const lerp = (a, b) => a + (b - a) * k;
  kit.list.forEach((p) => {
    if (p.kind === "cable") return;
    const a = A.parts[p.id], b = B.parts[p.id];
    if (!a || !b) return;
    const m = p.mesh;
    m.position.set(lerp(a.p[0], b.p[0]), lerp(a.p[1], b.p[1]), lerp(a.p[2], b.p[2]));
    m.rotation.set(lerp(a.r[0], b.r[0]), lerp(a.r[1], b.r[1]), lerp(a.r[2], b.r[2]));
    m.scale.set(lerp(a.s[0], b.s[0]), lerp(a.s[1], b.s[1]), lerp(a.s[2], b.s[2]));
    const vis = lerp(a.vis, b.vis);
    m.visible = vis > 0.01 && mat.mesh > 0.01;
    if (p.edges) {
      p.edges.visible = vis > 0.01 && mat.edge > 0.01;
      p.edges.material.opacity = mat.edge * vis;
    }
  });
  // cables
  kit.cables.forEach((c, i) => {
    const a = A.cables[i], b = B.cables[i];
    if (!a || !b) return;
    const pts = a.pts.map((pa, j) => {
      const pb = b.pts[j] || pa;
      return [lerp(pa[0], pb[0]), lerp(pa[1], pb[1]), lerp(pa[2], pb[2])];
    });
    const vis = lerp(a.vis, b.vis);
    c.mesh.visible = vis > 0.02;
    if (c.mesh.visible) setCable(c, pts, lerp(a.r ?? 0.011, b.r ?? 0.011, k));
  });
}
