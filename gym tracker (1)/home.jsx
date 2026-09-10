/* ============================================================
   Gym Tracker — Home + Profile
   ============================================================ */

function greeting(h) { return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; }

/* progress ring */
function Ring({ value, max, size = 56, sw = 6, color = "var(--gt-accent)", children }) {
  const r = (size - sw) / 2, c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(value / max, 1));
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--gt-ring-track)" strokeWidth={sw} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>{children}</div>
    </div>
  );
}

function HomeScreen({ go, onStartRoutine, onStartEmpty, streak }) {
  const recent = HISTORY.slice(0, 3);
  const weekSessions = HISTORY.filter((s) => s.date > new Date(TODAY.getTime() - 7 * DAY));
  const weekVol = weekSessions.reduce((t, s) => t + s.volume, 0);
  const weekSets = weekSessions.reduce((t, s) => t + setCount(s.items), 0);
  const goalWorkouts = 4;
  const next = routineById("push");

  return (
    <div className="gt-screen gt-in">
      <div className="gt-top">
        <div>
          <div className="gt-eye" style={{ marginBottom: 8 }}>{TODAY.toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" })}</div>
          <h1>{greeting(9)},<br /><span style={{ color: "var(--gt-muted)" }}>Alex.</span></h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ThemeToggle />
          <button className="gt-icon-btn" onClick={() => go("profile")} aria-label="Profile">
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--gt-accent)" }}>AT</span>
          </button>
        </div>
      </div>

      {/* streak + weekly goal */}
      <div className="gt-card" style={{ display: "flex", alignItems: "center", gap: 18, padding: 18, marginBottom: 14 }}>
        <Ring value={weekSessions.length} max={goalWorkouts}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 17, fontWeight: 500, lineHeight: 1 }}>{weekSessions.length}<span style={{ color: "var(--gt-subtle)", fontSize: 11 }}>/{goalWorkouts}</span></div>
          </div>
        </Ring>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>Weekly goal</div>
          <div className="gt-muted" style={{ fontSize: 12.5, marginTop: 3 }}>{goalWorkouts - weekSessions.length > 0 ? `${goalWorkouts - weekSessions.length} workouts to go this week` : "Goal smashed — nice work"}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--gt-accent)" }}>
          <Icons.flame size={20} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 500 }}>{streak}</span>
        </div>
      </div>

      {/* Today hero */}
      <div className="gt-ondark" style={{ borderRadius: 20, padding: 22, position: "relative", overflow: "hidden",
        background: "var(--gt-hero-grad)", border: "1px solid var(--gt-hero-border)", boxShadow: "var(--gt-card-shadow)" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 90% 0%, rgba(174,126,86,0.28), transparent 60%)" }} />
        <div style={{ position: "relative" }}>
          <div className="gt-eye" style={{ marginBottom: 14 }}>Up next · Recommended</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.02 }}>{next.name}</div>
          <div className="gt-muted" style={{ fontSize: 13.5, marginTop: 8 }}>{next.focus}</div>
          <div style={{ display: "flex", gap: 18, margin: "18px 0 20px", fontFamily: "var(--font-mono)", fontSize: 12, color: "rgba(230,226,220,0.85)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Icons.list size={15} />{next.items.length} exercises</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Icons.bolt size={15} />{setCount(next.items)} sets</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Icons.clock size={15} />~55 min</span>
          </div>
          <button className="gt-btn light" onClick={() => onStartRoutine(next.id)}>
            <Icons.play size={14} /> Start workout
          </button>
        </div>
      </div>

      {/* this week stats */}
      <div className="gt-sec-head"><h2>This week</h2></div>
      <div className="gt-stat-grid">
        <Stat I={Icons.dumbbell} n={weekSessions.length} label="Workouts" />
        <Stat I={Icons.bolt} n={weekSets} label="Sets logged" />
        <Stat I={Icons.arrowUp} n={(weekVol / 1000).toFixed(1)} unit="t" label="Volume" />
        <Stat I={Icons.clock} n={weekSessions.reduce((t, s) => t + s.durationMin, 0)} unit="m" label="Time" />
      </div>

      {/* volume chart */}
      <div className="gt-sec-head"><h2>Volume trend</h2><button className="link" onClick={() => go("progress")}>Progress</button></div>
      <div className="gt-card" style={{ padding: 18 }}>
        <BarChart data={WEEKLY_VOL} fmt={(v) => (v / 1000).toFixed(0) + "t"} />
      </div>

      {/* recent */}
      <div className="gt-sec-head"><h2>Recent</h2><button className="link" onClick={() => go("history")}>View all</button></div>
      <div>
        {recent.map((s) => (
          <div className="gt-row" key={s.id} onClick={() => go("session", s.id)}>
            <div className="av"><Icons.dumbbell size={20} /></div>
            <div className="meta">
              <div className="t">{s.name}</div>
              <div className="s">{fmtDate(s.date)} · {s.durationMin} min · {(s.volume / 1000).toFixed(1)}t</div>
            </div>
            <div className="end"><Icons.chevR size={18} /></div>
          </div>
        ))}
      </div>

      <button className="gt-btn ghost" style={{ marginTop: 18 }} onClick={onStartEmpty}>
        <Icons.plus size={16} /> Start empty workout
      </button>
    </div>
  );
}

/* ---------- Profile ---------- */
function Row({ I, label, value, onClick, danger }) {
  return (
    <div className="gt-row" onClick={onClick} style={{ cursor: onClick ? "pointer" : "default" }}>
      <div className="av" style={danger ? { color: "#E08B6F" } : {}}>{I && <I size={19} />}</div>
      <div className="meta"><div className="t" style={danger ? { color: "#E08B6F" } : {}}>{label}</div></div>
      <div className="end" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {value && <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--gt-muted)" }}>{value}</span>}
        {onClick && <Icons.chevR size={18} />}
      </div>
    </div>
  );
}

function ProfileScreen({ go, units, rest, setRest, streak }) {
  const totalVol = HISTORY.reduce((t, s) => t + s.volume, 0);
  return (
    <div className="gt-screen gt-in">
      <TopBar eyebrow="Athlete" title="Profile" />
      <div className="gt-card" style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
        <div style={{ width: 60, height: 60, borderRadius: 100, background: "var(--gt-accent)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22, fontStyle: "italic", color: "var(--gt-on-accent)", flexShrink: 0 }}>AT</div>
        <div>
          <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.02em" }}>Alex Tremblay</div>
          <div className="gt-mono gt-muted" style={{ fontSize: 12, marginTop: 3 }}>Member since Jan 2026 · {units}</div>
        </div>
      </div>

      <div className="gt-stat-grid" style={{ marginTop: 14 }}>
        <Stat I={Icons.dumbbell} n={HISTORY.length} label="Total workouts" />
        <Stat I={Icons.flame} n={streak} label="Day streak" />
        <Stat I={Icons.arrowUp} n={(totalVol / 1000).toFixed(0)} unit="t" label="Lifetime volume" />
        <Stat I={Icons.trophy} n={PRS.length} label="Personal records" />
      </div>

      <div className="gt-sec-head"><h2>Training</h2></div>
      <div className="gt-card" style={{ padding: "4px 18px" }}>
        <Row I={Icons.list} label="Routines" value={ROUTINES.length + ""} onClick={() => go("routines")} />
        <Row I={Icons.search} label="Exercise library" value={EX.length + ""} onClick={() => go("library")} />
        <Row I={Icons.ruler} label="Measurements" onClick={() => go("progress", "body")} />
      </div>

      <div className="gt-sec-head"><h2>Settings</h2></div>
      <div className="gt-card" style={{ padding: "18px" }}>
        <ThemeRow />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 0", borderBottom: "1px solid var(--gt-line-soft)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div className="av" style={{ width: 44, height: 44, borderRadius: 12, background: "var(--gt-panel-2)", border: "1px solid var(--gt-line)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--gt-accent)" }}><Icons.target size={19} /></div>
            <div className="t" style={{ fontSize: 15, fontWeight: 500 }}>Units</div>
          </div>
          <div className="gt-seg" style={{ width: 130 }}>
            <button className={units === "kg" ? "on" : ""}>kg</button>
            <button className={units === "lb" ? "on" : ""} style={{ color: "var(--gt-subtle)" }}>lb</button>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div className="av" style={{ width: 44, height: 44, borderRadius: 12, background: "var(--gt-panel-2)", border: "1px solid var(--gt-line)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--gt-accent)" }}><Icons.timer size={19} /></div>
            <div>
              <div className="t" style={{ fontSize: 15, fontWeight: 500 }}>Default rest</div>
              <div className="gt-mono gt-muted" style={{ fontSize: 11, marginTop: 2 }}>Between sets</div>
            </div>
          </div>
          <div className="gt-step">
            <button onClick={() => setRest(Math.max(30, rest - 15))}><Icons.minus size={16} /></button>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, width: 56, textAlign: "center" }}>{Math.floor(rest / 60)}:{String(rest % 60).padStart(2, "0")}</span>
            <button onClick={() => setRest(rest + 15)}><Icons.plus size={16} /></button>
          </div>
        </div>
      </div>
      <div style={{ height: 8 }} />
    </div>
  );
}

/* ---------- Appearance (theme) settings row ---------- */
function ThemeRow() {
  const [t, setT] = useState(getTheme());
  useEffect(() => {
    const h = (e) => setT(e.detail);
    window.addEventListener("gt-theme", h);
    return () => window.removeEventListener("gt-theme", h);
  }, []);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 16, borderBottom: "1px solid var(--gt-line-soft)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div className="av" style={{ width: 44, height: 44, borderRadius: 12, background: "var(--gt-panel-2)", border: "1px solid var(--gt-line)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--gt-accent)" }}>{t === "dark" ? <Icons.moon size={19} /> : <Icons.sun size={19} />}</div>
        <div className="t" style={{ fontSize: 15, fontWeight: 500 }}>Appearance</div>
      </div>
      <div className="gt-seg" style={{ width: 140 }}>
        <button className={t === "dark" ? "on" : ""} onClick={() => setTheme("dark")}>Dark</button>
        <button className={t === "light" ? "on" : ""} onClick={() => setTheme("light")}>Light</button>
      </div>
    </div>
  );
}

Object.assign(window, { HomeScreen, ProfileScreen, Ring, Row, ThemeRow });
