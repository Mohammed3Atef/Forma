/* ============================================================
   Gym Tracker — shared components
   ============================================================ */
const { useState, useEffect, useRef, useMemo, useLayoutEffect } = React;

/* ---------- Motion helpers (JS-driven so they always play) ---------- */
const EASE = "cubic-bezier(0.16,1,0.3,1)";
const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Stagger the direct children of a screen into view (transform-only so it never hides content).
function playStagger(root, sel = ".gt-screen > *") {
  if (!root || reduceMotion() || !root.querySelectorAll) return;
  const host = root.querySelector(".gt-screen") || root;
  [...host.children].forEach((el, i) => {
    if (!el.animate) return;
    el.animate(
      [{ transform: "translateY(18px)", opacity: 0.6 }, { opacity: 1, offset: 0.5 }, { transform: "none", opacity: 1 }],
      { duration: 480, delay: Math.min(i * 55, 420), easing: EASE, fill: "none" }
    );
  });
}

// Slide an element up on mount (small offset, transform-only — visible even if the clock is frozen).
function useSlideUp(dist = 30, dur = 440) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !el.animate || reduceMotion()) return;
    el.animate(
      [{ transform: `translateY(${dist}px)` }, { transform: "translateY(0)" }],
      { duration: dur, easing: EASE, fill: "none" }
    );
  }, []);
  return ref;
}

// Fade + rise a single element on mount (transform-only).
function useEnter(dur = 440, dy = 16, delay = 0) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !el.animate || reduceMotion()) return;
    el.animate(
      [{ transform: `translateY(${dy}px)`, opacity: 0.6 }, { transform: "none", opacity: 1 }],
      { duration: dur, delay, easing: EASE, fill: "none" }
    );
  }, []);
  return ref;
}

/* ---------- Count-up number ---------- */
function Count({ to, dur = 900, decimals = 0, prefix = "", suffix = "" }) {
  const [v, setV] = useState(to);
  useEffect(() => {
    if (reduceMotion()) { setV(to); return; }
    let raf, start;
    const tick = (t) => {
      if (!start) start = t;
      const p = Math.min((t - start) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setV(to * e);
      if (p < 1) raf = requestAnimationFrame(tick);
      else setV(to);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{prefix}{v.toFixed(decimals)}{suffix}</>;
}

/* ---------- Theme toggle ---------- */
function getTheme() { return document.documentElement.getAttribute("data-theme") || "dark"; }
function setTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem("gt-theme", t); } catch (e) {}
  window.dispatchEvent(new CustomEvent("gt-theme", { detail: t }));
}
function ThemeToggle() {
  const [t, setT] = useState(getTheme());
  useEffect(() => {
    const h = (e) => setT(e.detail);
    window.addEventListener("gt-theme", h);
    return () => window.removeEventListener("gt-theme", h);
  }, []);
  const flip = () => setTheme(t === "dark" ? "light" : "dark");
  return (
    <button className="gt-icon-btn" onClick={flip} aria-label="Toggle theme"
      style={{ overflow: "hidden" }}>
      {t === "dark" ? <Icons.moon size={19} /> : <Icons.sun size={19} />}
    </button>
  );
}

/* ---------- Bottom Tab Bar ---------- */
function TabBar({ active, onTab, onStart }) {
  const tabs = [
    { id: "home", label: "Home", I: Icons.home },
    { id: "history", label: "History", I: Icons.calendar },
    { id: "progress", label: "Progress", I: Icons.chart },
    { id: "profile", label: "Profile", I: Icons.user },
  ];
  return (
    <div className="gt-tabs">
      <button className={"gt-tab" + (active === "home" ? " on" : "")} onClick={() => onTab("home")}>
        <Icons.home size={23} /><span className="lbl">Home</span>
      </button>
      <button className={"gt-tab" + (active === "history" ? " on" : "")} onClick={() => onTab("history")}>
        <Icons.calendar size={23} /><span className="lbl">History</span>
      </button>
      <div className="gt-tab-start">
        <div className="gt-start-btn" onClick={onStart} role="button" aria-label="Start workout">
          <Icons.dumbbell size={26} sw={2} />
        </div>
      </div>
      <button className={"gt-tab" + (active === "progress" ? " on" : "")} onClick={() => onTab("progress")}>
        <Icons.chart size={23} /><span className="lbl">Progress</span>
      </button>
      <button className={"gt-tab" + (active === "profile" ? " on" : "")} onClick={() => onTab("profile")}>
        <Icons.user size={23} /><span className="lbl">Profile</span>
      </button>
    </div>
  );
}

/* ---------- Screen top bar ---------- */
function TopBar({ title, sub, eyebrow, right, onBack }) {
  return (
    <div className="gt-top">
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        {onBack && <button className="gt-icon-btn" onClick={onBack} aria-label="Back"><Icons.chevL size={20} /></button>}
        <div style={{ minWidth: 0 }}>
          {eyebrow && <div className="gt-eye" style={{ marginBottom: 7 }}>{eyebrow}</div>}
          <h1>{title}</h1>
          {sub && <div className="sub">{sub}</div>}
        </div>
      </div>
      {right}
    </div>
  );
}

/* ---------- Stat tile ---------- */
function Stat({ I, n, unit, label }) {
  return (
    <div className="gt-stat">
      <div className="ico">{I && <I size={20} />}</div>
      <div className="n">{n}{unit && <span className="u">{unit}</span>}</div>
      <div className="lbl">{label}</div>
    </div>
  );
}

/* ---------- Bottom Sheet ---------- */
function Sheet({ open, onClose, children }) {
  const scrimRef = useRef(null);
  const sheetRef = useRef(null);
  useLayoutEffect(() => {
    if (!open || reduceMotion()) return;
    if (sheetRef.current && sheetRef.current.animate)
      sheetRef.current.animate([{ transform: "translateY(44px)" }, { transform: "translateY(0)" }], { duration: 380, easing: EASE, fill: "none" });
  }, [open]);
  if (!open) return null;
  return (
    <div className="gt-sheet-scrim" ref={scrimRef} onClick={onClose}>
      <div className="gt-sheet" ref={sheetRef} onClick={(e) => e.stopPropagation()}>
        <div className="gt-sheet-grab" />
        {children}
      </div>
    </div>
  );
}

/* ---------- Bar chart (weekly volume) ---------- */
function BarChart({ data, height = 150, fmt = (v) => v }) {
  const max = Math.max(...data.map((d) => d.vol), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height, paddingTop: 8 }}>
      {data.map((d, i) => {
        const h = max ? Math.max(4, (d.vol / max) * (height - 30)) : 4;
        const isNow = i === data.length - 1;
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, height: "100%", justifyContent: "flex-end" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--gt-subtle)" }}>{d.vol ? fmt(d.vol) : ""}</div>
            <div style={{
              width: "100%", maxWidth: 26, height: h, borderRadius: 7,
              background: isNow ? "var(--gt-accent)" : "var(--gt-line-strong)",
            }} />
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: isNow ? "var(--gt-accent)" : "var(--gt-subtle)", letterSpacing: "0.04em" }}>{d.label}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Line chart (bodyweight) ---------- */
function LineChart({ data, height = 160, unit = "kg" }) {
  const W = 360, H = height, pad = 24;
  const vals = data.map((d) => d.kg);
  const min = Math.min(...vals) - 0.6, max = Math.max(...vals) + 0.6;
  const x = (i) => pad + (i / (data.length - 1)) * (W - pad * 2);
  const y = (v) => H - pad - ((v - min) / (max - min)) * (H - pad * 2);
  const pts = data.map((d, i) => [x(i), y(d.kg)]);
  const path = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = path + ` L ${x(data.length - 1)} ${H - pad} L ${x(0)} ${H - pad} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
      <defs>
        <linearGradient id="lcg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--gt-accent)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--gt-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map((t, i) => (
        <line key={i} x1={pad} x2={W - pad} y1={pad + t * (H - pad * 2)} y2={pad + t * (H - pad * 2)} stroke="var(--gt-line)" strokeWidth="1" />
      ))}
      <path d={area} fill="url(#lcg)" />
      <path d={path} fill="none" stroke="var(--gt-accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => i === pts.length - 1 && (
        <g key={i}><circle cx={p[0]} cy={p[1]} r="5.5" fill="var(--gt-accent)" /><circle cx={p[0]} cy={p[1]} r="10" fill="var(--gt-accent)" opacity="0.18" /></g>
      ))}
      <text x={pad} y={14} fill="var(--gt-subtle)" style={{ fontFamily: "var(--font-mono)", fontSize: 9 }}>{max.toFixed(0)} {unit}</text>
      <text x={pad} y={H - 6} fill="var(--gt-subtle)" style={{ fontFamily: "var(--font-mono)", fontSize: 9 }}>{min.toFixed(0)} {unit}</text>
    </svg>
  );
}

/* ---------- Small sparkline (per-exercise trend) ---------- */
function Spark({ data, w = 70, h = 26 }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const rng = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 3 - ((v - min) / rng) * (h - 6)]);
  const path = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <path d={path} fill="none" stroke="var(--gt-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------- muscle dot ---------- */
const muscleColor = (m) => ({
  Chest: "#AE7E56", Shoulders: "#D4A46A", Triceps: "#C69975", Quads: "#BF6E4E",
  Hamstrings: "#8B6914", Calves: "#5C3A2A", Back: "#2E5D3C", Biceps: "#C2CCAE",
  "Rear Delts": "#E8C8B4", Core: "#E6E2DC",
}[m] || "#AE7E56");

Object.assign(window, { TabBar, TopBar, Stat, Sheet, BarChart, LineChart, Spark, muscleColor,
  EASE, reduceMotion, playStagger, useSlideUp, useEnter, Count, ThemeToggle, getTheme, setTheme });
