/* ============================================================
   Gym Tracker — Library · Routines · Detail screens · Picker
   ============================================================ */

/* ---------- Exercise picker (sheet) ---------- */
function ExercisePicker({ open, onClose, onAdd }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const cats = ["All", "Push", "Pull", "Legs", "Core"];
  const list = EX.filter((e) =>
    (cat === "All" || e.cat === cat) &&
    (e.name.toLowerCase().includes(q.toLowerCase()) || e.muscle.toLowerCase().includes(q.toLowerCase())));
  return (
    <Sheet open={open} onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>Add exercise</h3>
        <button className="gt-icon-btn" style={{ width: 36, height: 36 }} onClick={onClose}><Icons.x size={18} /></button>
      </div>
      <div style={{ position: "relative", marginBottom: 14 }}>
        <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--gt-subtle)" }}><Icons.search size={18} /></span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exercises"
          style={{ width: "100%", height: 46, paddingLeft: 44, borderRadius: 12, background: "var(--gt-panel-2)", border: "1px solid var(--gt-line)", color: "var(--gt-text)", fontFamily: "var(--font-sans)", fontSize: 15, outline: "none" }} />
      </div>
      <div className="gt-chips" style={{ marginBottom: 6 }}>
        {cats.map((c) => <button key={c} className={"gt-chip" + (cat === c ? " on" : "")} onClick={() => setCat(c)}>{c}</button>)}
      </div>
      <div>
        {list.map((e) => (
          <div className="gt-row" key={e.id} onClick={() => { onAdd(e.id); onClose(); }}>
            <span style={{ width: 8, height: 8, borderRadius: 100, background: muscleColor(e.muscle), flexShrink: 0, marginLeft: 6 }} />
            <div className="meta"><div className="t">{e.name}</div><div className="s">{e.muscle} · {e.equip}</div></div>
            <div className="end" style={{ color: "var(--gt-accent)" }}><Icons.plus size={20} /></div>
          </div>
        ))}
        {list.length === 0 && <div className="gt-muted" style={{ textAlign: "center", padding: "24px 0", fontSize: 14 }}>No matches.</div>}
      </div>
    </Sheet>
  );
}

/* ---------- Exercise library screen ---------- */
function LibraryScreen({ go, onBack }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const cats = ["All", "Push", "Pull", "Legs", "Core"];
  const list = EX.filter((e) =>
    (cat === "All" || e.cat === cat) &&
    (e.name.toLowerCase().includes(q.toLowerCase()) || e.muscle.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="gt-screen gt-in">
      <TopBar title="Exercises" eyebrow={EX.length + " movements"} onBack={onBack} />
      <div style={{ position: "relative", marginBottom: 14 }}>
        <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--gt-subtle)" }}><Icons.search size={18} /></span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exercises"
          style={{ width: "100%", height: 46, paddingLeft: 44, borderRadius: 12, background: "var(--gt-panel-2)", border: "1px solid var(--gt-line)", color: "var(--gt-text)", fontFamily: "var(--font-sans)", fontSize: 15, outline: "none" }} />
      </div>
      <div className="gt-chips" style={{ marginBottom: 8 }}>
        {cats.map((c) => <button key={c} className={"gt-chip" + (cat === c ? " on" : "")} onClick={() => setCat(c)}>{c}</button>)}
      </div>
      <div>
        {list.map((e) => {
          const pr = PRS.find((p) => p.exId === e.id);
          return (
            <div className="gt-row" key={e.id} onClick={() => go("exercise", e.id)}>
              <span style={{ width: 8, height: 8, borderRadius: 100, background: muscleColor(e.muscle), flexShrink: 0, marginLeft: 6 }} />
              <div className="meta"><div className="t">{e.name}</div><div className="s">{e.muscle} · {e.equip}</div></div>
              <div className="end" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {pr && <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--gt-accent)" }}>{pr.e1rm}kg</span>}
                <Icons.chevR size={18} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Exercise detail ---------- */
function ExerciseDetail({ exId, onBack }) {
  const ex = exById(exId);
  const pr = PRS.find((p) => p.exId === exId);
  // gather history of this exercise (top set e1rm per session)
  const trend = HISTORY.filter((s) => s.items.some((it) => it.exId === exId))
    .slice(0, 8).reverse().map((s) => {
      const it = s.items.find((i) => i.exId === exId);
      return Math.max(...it.sets.map((st) => e1rm(st.kg, st.reps)));
    });
  return (
    <div className="gt-screen gt-in">
      <TopBar title={ex.name} eyebrow={ex.cat} onBack={onBack} />
      <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
        <span className="gt-chip" style={{ pointerEvents: "none" }}><span style={{ width: 7, height: 7, borderRadius: 100, background: muscleColor(ex.muscle), display: "inline-block", marginRight: 7, verticalAlign: "1px" }} />{ex.muscle}</span>
        <span className="gt-chip" style={{ pointerEvents: "none" }}>{ex.equip}</span>
      </div>

      {pr && (
        <div className="gt-card gt-ondark" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, background: "linear-gradient(135deg,#3a3d2e,#15150d)", borderColor: "rgba(174,126,86,0.25)" }}>
          <div>
            <div className="gt-eye" style={{ marginBottom: 8 }}><Icons.trophy size={13} style={{ verticalAlign: "-2px", marginRight: 5 }} />Personal record</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 15 }}>{pr.kg}kg × {pr.reps} reps</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 30, fontWeight: 500, letterSpacing: "-0.02em" }}>{pr.e1rm}<span style={{ fontSize: 14, color: "var(--gt-muted)" }}>kg</span></div>
            <div className="gt-mono gt-subtle" style={{ fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase" }}>est 1RM</div>
          </div>
        </div>
      )}

      {trend.length > 1 && (
        <>
          <div className="gt-sec-head"><h2>1RM trend</h2></div>
          <div className="gt-card" style={{ padding: 18 }}>
            <BarChart data={trend.map((v, i) => ({ label: i === trend.length - 1 ? "Now" : "", vol: v }))} fmt={(v) => v + ""} height={120} />
          </div>
        </>
      )}

      <div className="gt-sec-head"><h2>How to perform</h2></div>
      <div className="gt-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        {ex.cues.map((c, i) => (
          <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--gt-accent)", width: 18, flexShrink: 0 }}>{String(i + 1).padStart(2, "0")}</span>
            <span style={{ fontSize: 14.5, lineHeight: 1.5, color: "var(--gt-text)" }}>{c}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Routines list ---------- */
function RoutinesScreen({ go, onBack, onStartRoutine }) {
  return (
    <div className="gt-screen gt-in">
      <TopBar title="Routines" eyebrow="Templates" onBack={onBack}
        right={<button className="gt-icon-btn" aria-label="New"><Icons.plus size={20} /></button>} />
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {ROUTINES.map((r) => (
          <div className="gt-card tap" key={r.id} onClick={() => go("routine", r.id)}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span style={{ width: 10, height: 10, borderRadius: 100, background: r.color }} />
                <div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 600, letterSpacing: "-0.02em" }}>{r.name}</div>
                  <div className="gt-muted" style={{ fontSize: 12.5, marginTop: 3 }}>{r.focus}</div>
                </div>
              </div>
              <Icons.chevR size={18} style={{ color: "var(--gt-subtle)" }} />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
              {r.items.slice(0, 4).map((it) => (
                <span key={it.exId} style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--gt-muted)", background: "var(--gt-panel-2)", border: "1px solid var(--gt-line)", borderRadius: 100, padding: "5px 11px" }}>{exById(it.exId).name}</span>
              ))}
              {r.items.length > 4 && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--gt-subtle)", padding: "5px 4px" }}>+{r.items.length - 4}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Routine detail ---------- */
function RoutineDetail({ routineId, onBack, onStartRoutine }) {
  const r = routineById(routineId);
  return (
    <div className="gt-screen gt-in">
      <TopBar title={r.name} eyebrow="Routine" sub={r.focus} onBack={onBack} />
      <div className="gt-stat-grid" style={{ marginBottom: 8 }}>
        <Stat I={Icons.list} n={r.items.length} label="Exercises" />
        <Stat I={Icons.bolt} n={setCount(r.items)} label="Sets" />
      </div>
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {r.items.map((it) => {
          const ex = exById(it.exId);
          return (
            <div className="gt-card" key={it.exId} style={{ padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 100, background: muscleColor(ex.muscle) }} />
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{ex.name}</div>
                    <div className="gt-mono gt-muted" style={{ fontSize: 11, marginTop: 2 }}>{ex.muscle}</div>
                  </div>
                </div>
                <div className="gt-mono" style={{ fontSize: 12, color: "var(--gt-muted)" }}>{it.sets.length} × {it.sets[0].reps}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "20px 20px 28px", background: "linear-gradient(to top,var(--gt-bg) 70%,transparent)" }}>
        <button className="gt-btn accent" onClick={() => onStartRoutine(r.id)}><Icons.play size={14} /> Start this workout</button>
      </div>
      <div style={{ height: 40 }} />
    </div>
  );
}

/* ---------- Session detail (past workout) ---------- */
function SessionDetail({ sessionId, onBack, go }) {
  const s = HISTORY.find((x) => x.id === sessionId);
  if (!s) return null;
  return (
    <div className="gt-screen gt-in">
      <TopBar title={s.name} eyebrow={fmtDay(s.date) + " · " + fmtDate(s.date)} onBack={onBack} />
      <div className="gt-stat-grid">
        <Stat I={Icons.clock} n={s.durationMin} unit="m" label="Duration" />
        <Stat I={Icons.arrowUp} n={(s.volume / 1000).toFixed(1)} unit="t" label="Volume" />
        <Stat I={Icons.bolt} n={setCount(s.items)} label="Sets" />
        <Stat I={Icons.list} n={s.items.length} label="Exercises" />
      </div>
      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 12 }}>
        {s.items.map((it) => {
          const ex = exById(it.exId);
          const top = it.sets.reduce((b, st) => e1rm(st.kg, st.reps) > e1rm(b.kg, b.reps) ? st : b, it.sets[0]);
          return (
            <div className="gt-card" key={it.exId} style={{ padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 12, cursor: "pointer" }} onClick={() => go("exercise", it.exId)}>
                <span style={{ width: 8, height: 8, borderRadius: 100, background: muscleColor(ex.muscle) }} />
                <div style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>{ex.name}</div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--gt-muted)" }}>{it.sets.length} sets</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {it.sets.map((st, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "5px 0", borderTop: i ? "1px solid var(--gt-line-soft)" : "none" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--gt-subtle)", width: 18 }}>{i + 1}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, flex: 1 }}>{st.kg} kg × {st.reps}</span>
                    {st === top && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--gt-accent)", letterSpacing: "0.06em", textTransform: "uppercase" }}>top set</span>}
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--gt-muted)" }}>{(st.kg * st.reps).toLocaleString()} kg</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { ExercisePicker, LibraryScreen, ExerciseDetail, RoutinesScreen, RoutineDetail, SessionDetail });
