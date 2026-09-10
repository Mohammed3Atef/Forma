/* ============================================================
   Gym Tracker — History (calendar) + Progress (charts/PRs/body)
   ============================================================ */

/* ---------- History + calendar ---------- */
function HistoryScreen({ go }) {
  const [month, setMonth] = useState(new Date(TODAY.getFullYear(), TODAY.getMonth(), 1));
  const y = month.getFullYear(), m = month.getMonth();
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const workoutDays = useMemo(() => {
    const map = {};
    HISTORY.forEach((s) => { if (s.date.getFullYear() === y && s.date.getMonth() === m) map[s.date.getDate()] = s; });
    return map;
  }, [y, m]);
  const monthSessions = HISTORY.filter((s) => s.date.getFullYear() === y && s.date.getMonth() === m);
  const cells = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);

  return (
    <div className="gt-screen gt-in">
      <TopBar eyebrow="Your log" title="History" />

      {/* calendar */}
      <div className="gt-card" style={{ padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <button className="gt-icon-btn" style={{ width: 36, height: 36 }} onClick={() => setMonth(new Date(y, m - 1, 1))}><Icons.chevL size={18} /></button>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 600, letterSpacing: "-0.02em" }}>{month.toLocaleDateString("en-CA", { month: "long", year: "numeric" })}</div>
          <button className="gt-icon-btn" style={{ width: 36, height: 36 }} onClick={() => setMonth(new Date(y, m + 1, 1))} disabled={y === TODAY.getFullYear() && m >= TODAY.getMonth()} ><Icons.chevR size={18} /></button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 6 }}>
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <div key={i} style={{ textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--gt-subtle)" }}>{d}</div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
          {cells.map((d, i) => {
            const sess = d && workoutDays[d];
            const isToday = d === TODAY.getDate() && m === TODAY.getMonth() && y === TODAY.getFullYear();
            return (
              <div key={i} onClick={() => sess && go("session", sess.id)}
                style={{ aspectRatio: "1", borderRadius: 11, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3,
                  cursor: sess ? "pointer" : "default",
                  background: sess ? "rgba(174,126,86,0.16)" : "transparent",
                  border: isToday ? "1.5px solid var(--gt-accent)" : "1px solid transparent" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, color: d ? (sess ? "var(--gt-text)" : "var(--gt-muted)") : "transparent" }}>{d}</span>
                {sess && <span style={{ width: 5, height: 5, borderRadius: 100, background: "var(--gt-accent)" }} />}
              </div>
            );
          })}
        </div>
      </div>

      <div className="gt-sec-head"><h2>{monthSessions.length} workout{monthSessions.length !== 1 ? "s" : ""}</h2><span className="link" style={{ cursor: "default" }}>{(monthSessions.reduce((t, s) => t + s.volume, 0) / 1000).toFixed(1)}t</span></div>
      <div>
        {monthSessions.length === 0 && <div className="gt-muted" style={{ fontSize: 14, padding: "20px 0", textAlign: "center" }}>No workouts logged this month.</div>}
        {monthSessions.map((s) => (
          <div className="gt-row" key={s.id} onClick={() => go("session", s.id)}>
            <div className="av" style={{ flexDirection: "column", gap: 0 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 16, lineHeight: 1, color: "var(--gt-text)" }}>{s.date.getDate()}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--gt-subtle)", textTransform: "uppercase" }}>{s.date.toLocaleDateString("en-CA", { weekday: "short" })}</span>
            </div>
            <div className="meta">
              <div className="t">{s.name}</div>
              <div className="s">{s.items.length} exercises · {setCount(s.items)} sets · {s.durationMin} min</div>
            </div>
            <div className="end" style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--gt-accent)" }}>{(s.volume / 1000).toFixed(1)}t</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Progress ---------- */
function ProgressScreen({ go, initialTab }) {
  const [tab, setTab] = useState(initialTab || "overview");
  useEffect(() => { if (initialTab) setTab(initialTab); }, [initialTab]);
  const totalVol = HISTORY.reduce((t, s) => t + s.volume, 0);
  const avgDur = Math.round(HISTORY.reduce((t, s) => t + s.durationMin, 0) / HISTORY.length);

  return (
    <div className="gt-screen gt-in">
      <TopBar eyebrow="Your numbers" title="Progress" />
      <div className="gt-seg" style={{ marginBottom: 20 }}>
        <button className={tab === "overview" ? "on" : ""} onClick={() => setTab("overview")}>Overview</button>
        <button className={tab === "records" ? "on" : ""} onClick={() => setTab("records")}>Records</button>
        <button className={tab === "body" ? "on" : ""} onClick={() => setTab("body")}>Body</button>
      </div>

      {tab === "overview" && (
        <div className="gt-in">
          <div className="gt-card" style={{ padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
              <div className="gt-mono gt-muted" style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}>Weekly volume</div>
              <div className="gt-mono" style={{ fontSize: 11, color: "var(--gt-accent)" }}>last 8 weeks</div>
            </div>
            <BarChart data={WEEKLY_VOL} fmt={(v) => (v / 1000).toFixed(0) + "t"} />
          </div>
          <div className="gt-stat-grid" style={{ marginTop: 14 }}>
            <Stat I={Icons.arrowUp} n={(totalVol / 1000).toFixed(0)} unit="t" label="Total volume" />
            <Stat I={Icons.dumbbell} n={HISTORY.length} label="Workouts" />
            <Stat I={Icons.clock} n={avgDur} unit="m" label="Avg duration" />
            <Stat I={Icons.bolt} n={HISTORY.reduce((t, s) => t + setCount(s.items), 0)} label="Total sets" />
          </div>

          <div className="gt-sec-head"><h2>Muscle split</h2></div>
          <MuscleSplit />
        </div>
      )}

      {tab === "records" && (
        <div className="gt-in">
          <div className="gt-card gt-ondark" style={{ padding: 18, marginBottom: 16, display: "flex", alignItems: "center", gap: 14, background: "linear-gradient(135deg,#3a3d2e,#15150d)", borderColor: "rgba(174,126,86,0.25)" }}>
            <span style={{ color: "var(--gt-accent)" }}><Icons.trophy size={30} /></span>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 600, letterSpacing: "-0.02em" }}>{PRS.length} personal records</div>
              <div className="gt-muted" style={{ fontSize: 12.5, marginTop: 2 }}>Estimated 1-rep max per lift</div>
            </div>
          </div>
          {PRS.map((pr) => {
            const ex = exById(pr.exId);
            return (
              <div className="gt-row" key={pr.exId} onClick={() => go("exercise", pr.exId)}>
                <div className="av" style={{ color: muscleColor(ex.muscle) }}><Icons.trophy size={19} /></div>
                <div className="meta">
                  <div className="t">{ex.name}</div>
                  <div className="s">{pr.kg}kg × {pr.reps} · {fmtDate(pr.date)}</div>
                </div>
                <div className="end" style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 500, color: "var(--gt-text)" }}>{pr.e1rm}<span style={{ fontSize: 11, color: "var(--gt-muted)" }}>kg</span></div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--gt-subtle)", letterSpacing: "0.06em", textTransform: "uppercase" }}>est 1RM</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "body" && (
        <div className="gt-in">
          <div className="gt-card" style={{ padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
              <div className="gt-mono gt-muted" style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}>Bodyweight</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 500 }}>{WEIGHT[WEIGHT.length - 1].kg}<span style={{ fontSize: 12, color: "var(--gt-muted)" }}>kg</span></div>
            </div>
            <LineChart data={WEIGHT} />
          </div>
          <div className="gt-sec-head"><h2>Measurements</h2><button className="link"><Icons.plus size={13} style={{ verticalAlign: "-2px" }} /> Log</button></div>
          <div className="gt-card" style={{ padding: "4px 18px" }}>
            {MEASURES.map((mm) => {
              const delta = +(mm.val - mm.prev).toFixed(1);
              const good = mm.key === "waist" ? delta < 0 : delta > 0;
              return (
                <div className="gt-row" key={mm.key} style={{ cursor: "default" }}>
                  <div className="meta"><div className="t" style={{ fontSize: 15 }}>{mm.label}</div></div>
                  <div className="end" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {delta !== 0 && <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: good ? "#6FB07E" : "var(--gt-muted)" }}>{delta > 0 ? "+" : ""}{delta}</span>}
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 17, fontWeight: 500 }}>{mm.val}<span style={{ fontSize: 11, color: "var(--gt-muted)", marginLeft: 2 }}>{mm.unit}</span></span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* muscle split bars */
function MuscleSplit() {
  const counts = {};
  HISTORY.forEach((s) => s.items.forEach((it) => {
    const m = exById(it.exId).muscle;
    counts[m] = (counts[m] || 0) + it.sets.length;
  }));
  const arr = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const max = Math.max(...arr.map((a) => a[1]));
  return (
    <div className="gt-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 13 }}>
      {arr.map(([m, c]) => (
        <div key={m} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 88, fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--gt-muted)" }}>{m}</div>
          <div style={{ flex: 1, height: 8, borderRadius: 100, background: "rgba(230,226,220,0.1)", overflow: "hidden" }}>
            <div style={{ width: (c / max * 100) + "%", height: "100%", borderRadius: 100, background: muscleColor(m), transition: "width .5s var(--ease-card)" }} />
          </div>
          <div style={{ width: 28, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12 }}>{c}</div>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { HistoryScreen, ProgressScreen, MuscleSplit });
