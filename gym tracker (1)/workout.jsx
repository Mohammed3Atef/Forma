/* ============================================================
   Gym Tracker — Active Workout + Rest Timer (core flow)
   ============================================================ */

/* ---------- Rest Timer (sticky bar) ---------- */
function RestTimer({ seconds, onDone, onAdjust, onSkip }) {
  const [left, setLeft] = useState(seconds);
  const ref = useRef(seconds);
  useEffect(() => { ref.current = seconds; setLeft(seconds); }, [seconds]);
  useEffect(() => {
    const t = setInterval(() => {
      setLeft((l) => {
        if (l <= 1) { clearInterval(t); onDone(); return 0; }
        return l - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [seconds]);
  const mm = String(Math.floor(left / 60)).padStart(1, "0");
  const ss = String(left % 60).padStart(2, "0");
  const pct = (1 - left / Math.max(seconds, 1)) * 100;
  const barRef = useSlideUp(18, 360);
  return (
    <div ref={barRef} style={{ position: "absolute", left: 16, right: 16, bottom: 18, zIndex: 30,
      background: "var(--gt-elevated)", border: "1px solid var(--gt-line)", borderRadius: 18,
      padding: "14px 16px", boxShadow: "0 12px 40px rgba(0,0,0,0.4)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "var(--gt-accent)" }}><Icons.timer size={20} /></span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--gt-muted)" }}>Rest</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 500, letterSpacing: "-0.02em" }}>{mm}:{ss}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="gt-step" onClick={() => onAdjust(-15)} style={stepBtn}>−15</button>
          <button className="gt-step" onClick={() => onAdjust(15)} style={stepBtn}>+15</button>
          <button onClick={onSkip} style={{ ...stepBtn, color: "var(--gt-accent)", borderColor: "color-mix(in srgb, var(--gt-accent) 40%, transparent)" }}>Skip</button>
        </div>
      </div>
      <div className="gt-prog"><span style={{ width: pct + "%" }} /></div>
    </div>
  );
}
const stepBtn = { height: 32, padding: "0 11px", borderRadius: 9, border: "1px solid var(--gt-line)", background: "var(--gt-panel-2)", color: "var(--gt-text)", fontFamily: "var(--font-mono)", fontSize: 11, cursor: "pointer" };

/* ---------- editable numeric cell ---------- */
function NumCell({ value, onChange, suffix }) {
  return (
    <div style={{ position: "relative", flex: 1 }}>
      <input
        type="text" inputMode="decimal" value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
        onFocus={(e) => e.target.select()}
        style={{
          width: "100%", textAlign: "center", background: "var(--gt-panel-2)",
          border: "1px solid var(--gt-line)", borderRadius: 10, height: 40, color: "var(--gt-text)",
          fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 500, outline: "none",
        }}
      />
    </div>
  );
}

/* ---------- One exercise block ---------- */
function ExBlock({ item, idx, prev, onUpdate, onAddSet, onRemove, onToggleSet, onRemoveSet }) {
  const ex = exById(item.exId);
  return (
    <div className="gt-card gt-in" style={{ padding: 18, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: 100, background: muscleColor(ex.muscle), flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em" }}>{ex.name}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--gt-muted)", marginTop: 2 }}>{ex.muscle} · {ex.equip}</div>
          </div>
        </div>
        <button className="gt-icon-btn" style={{ width: 34, height: 34, borderColor: "var(--gt-line)" }} onClick={onRemove} aria-label="Remove exercise"><Icons.x size={16} /></button>
      </div>

      {/* header row */}
      <div style={{ display: "grid", gridTemplateColumns: "34px 1fr 1.1fr 1.1fr 44px", gap: 8, alignItems: "center", marginBottom: 6, padding: "0 2px" }}>
        {["Set", "Prev", "Kg", "Reps", ""].map((h, i) => (
          <div key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--gt-subtle)", textAlign: i === 0 || i === 4 ? "center" : "center" }}>{h}</div>
        ))}
      </div>

      {item.sets.map((s, si) => {
        const pv = prev && prev.sets[si];
        return (
          <div key={si} style={{
            display: "grid", gridTemplateColumns: "34px 1fr 1.1fr 1.1fr 44px", gap: 8, alignItems: "center",
            padding: "5px 2px", borderRadius: 10,
            background: s.done ? "var(--gt-done-bg)" : "transparent",
            transition: "background .3s var(--ease-card)",
          }}>
            <div style={{ textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 13, color: s.done ? "var(--gt-accent)" : "var(--gt-muted)" }}>{si + 1}</div>
            <div style={{ textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--gt-subtle)" }}>{pv ? `${pv.kg}×${pv.reps}` : "—"}</div>
            <NumCell value={s.kg} onChange={(v) => onUpdate(si, "kg", v)} />
            <NumCell value={s.reps} onChange={(v) => onUpdate(si, "reps", v)} />
            <button
              onClick={(e) => { onToggleSet(si); const b = e.currentTarget; b.classList.remove("gt-popped"); void b.offsetWidth; b.classList.add("gt-popped"); }}
              style={{
                width: 40, height: 40, borderRadius: 11, cursor: "pointer", margin: "0 auto",
                display: "flex", alignItems: "center", justifyContent: "center",
                border: "1.5px solid " + (s.done ? "var(--gt-success)" : "var(--gt-line)"),
                background: s.done ? "var(--gt-success)" : "var(--gt-panel-2)", color: "#fff",
                transition: "background .2s var(--ease-card), border-color .2s",
              }}
              aria-label="Complete set"
            ><Icons.check size={18} sw={2.4} /></button>
          </div>
        );
      })}

      <button className="gt-btn ghost sm" style={{ marginTop: 12, borderStyle: "dashed", borderColor: "var(--gt-line)" }} onClick={onAddSet}>
        <Icons.plus size={14} /> Add set
      </button>
    </div>
  );
}

/* ---------- Active Workout overlay ---------- */
function ActiveWorkout({ draft, setDraft, restDefault, onFinish, onCancel, onPickExercise }) {
  const [elapsed, setElapsed] = useState(0);
  const [rest, setRest] = useState(null); // {seconds}
  const [confirmEnd, setConfirmEnd] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const update = (ii, si, key, val) => {
    setDraft((d) => {
      const items = d.items.map((it, i) => i !== ii ? it : {
        ...it, sets: it.sets.map((s, j) => j !== si ? s : { ...s, [key]: val }),
      });
      return { ...d, items };
    });
  };
  const toggleSet = (ii, si) => {
    setDraft((d) => {
      let nowDone = false;
      const items = d.items.map((it, i) => i !== ii ? it : {
        ...it, sets: it.sets.map((s, j) => { if (j !== si) return s; nowDone = !s.done; return { ...s, done: !s.done }; }),
      });
      return { ...d, items, _justDone: nowDone };
    });
  };
  // start rest when a set is freshly completed
  useEffect(() => {
    if (draft._justDone) { setRest({ seconds: restDefault }); setDraft((d) => ({ ...d, _justDone: false })); }
  }, [draft._justDone]);

  const addSet = (ii) => setDraft((d) => {
    const items = d.items.map((it, i) => {
      if (i !== ii) return it;
      const last = it.sets[it.sets.length - 1] || { kg: 0, reps: 8 };
      return { ...it, sets: [...it.sets, { kg: last.kg, reps: last.reps, done: false }] };
    });
    return { ...d, items };
  });
  const removeSet = () => {};
  const removeEx = (ii) => setDraft((d) => ({ ...d, items: d.items.filter((_, i) => i !== ii) }));

  const totalSets = setCount(draft.items);
  const doneSets = draft.items.reduce((t, it) => t + it.sets.filter((s) => s.done).length, 0);
  const vol = draft.items.reduce((t, it) => t + it.sets.filter((s) => s.done).reduce((a, s) => a + (+s.kg || 0) * (+s.reps || 0), 0), 0);
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const pct = totalSets ? (doneSets / totalSets) * 100 : 0;

  const overlayRef = useSlideUp(34, 460);
  return (
    <div className="gt-full" ref={overlayRef}>
      {/* header */}
      <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid var(--gt-line)", background: "var(--gt-bg)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <button className="gt-icon-btn" style={{ width: 38, height: 38 }} onClick={onCancel} aria-label="Minimize"><Icons.chevD size={20} /></button>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--gt-accent)" }}>{draft.name}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 500, letterSpacing: "-0.02em", marginTop: 2 }}>{mm}:{ss}</div>
          </div>
          <button className="gt-btn accent sm" style={{ width: "auto", padding: "0 18px" }} onClick={() => setConfirmEnd(true)}>Finish</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div className="gt-prog" style={{ flex: 1 }}><span style={{ width: pct + "%" }} /></div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--gt-muted)", whiteSpace: "nowrap" }}>{doneSets}/{totalSets} sets</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--gt-muted)", whiteSpace: "nowrap" }}>{(vol / 1000).toFixed(1)}t</div>
        </div>
      </div>

      {/* exercise list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 120px", WebkitOverflowScrolling: "touch" }} className="gt-noscroll">
        {draft.items.map((it, i) => (
          <ExBlock key={i + it.exId} item={it} idx={i} prev={draft.prev && draft.prev[it.exId]}
            onUpdate={(si, k, v) => update(i, si, k, v)}
            onToggleSet={(si) => toggleSet(i, si)}
            onAddSet={() => addSet(i)} onRemove={() => removeEx(i)} />
        ))}
        <button className="gt-btn ghost" onClick={onPickExercise} style={{ marginTop: 4 }}>
          <Icons.plus size={16} /> Add exercise
        </button>
      </div>

      {rest && <RestTimer seconds={rest.seconds} onDone={() => setRest(null)} onSkip={() => setRest(null)}
        onAdjust={(d) => setRest((r) => ({ seconds: Math.max(15, r.seconds + d) }))} />}

      {/* finish confirm */}
      {confirmEnd && (
        <div className="gt-sheet-scrim" onClick={() => setConfirmEnd(false)}>
          <div className="gt-sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "auto" }}>
            <div className="gt-sheet-grab" />
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 6 }}>Finish workout?</h3>
            <p className="gt-muted" style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 20 }}>
              {doneSets} of {totalSets} sets logged · {(vol / 1000).toFixed(1)}t volume · {mm}:{ss}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button className="gt-btn accent" onClick={() => onFinish({ ...draft, durationSec: elapsed, volume: vol })}>
                <Icons.check size={16} /> Save workout
              </button>
              <button className="gt-btn ghost" onClick={() => setConfirmEnd(false)}>Keep going</button>
              <button className="gt-btn danger" onClick={onCancel}>Discard</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { ActiveWorkout, RestTimer });
