/* ============================================================
   Gym Tracker — App shell, navigation, workout lifecycle
   ============================================================ */

/* build a workout draft from a routine (or empty) */
function draftFromRoutine(rid) {
  const prev = {};
  HISTORY.forEach((s) => s.items.forEach((it) => { if (!prev[it.exId]) prev[it.exId] = { sets: it.sets }; }));
  if (!rid) return { name: "Empty Workout", items: [], prev };
  const r = routineById(rid);
  return {
    name: r.name,
    items: r.items.map((it) => ({ exId: it.exId, sets: it.sets.map((s) => ({ kg: s.kg, reps: s.reps, done: false })) })),
    prev,
  };
}

/* ---------- Finish summary ---------- */
function FinishSummary({ result, onDone }) {
  const done = result.items.reduce((t, it) => t + it.sets.filter((s) => s.done).length, 0);
  const mm = Math.round(result.durationSec / 60);
  const discRef = useRef(null);
  const wrapRef = useRef(null);
  useLayoutEffect(() => {
    if (reduceMotion()) return;
    if (discRef.current && discRef.current.animate)
      discRef.current.animate([{ transform: "scale(0.4)" }, { transform: "scale(1.12)", offset: 0.7 }, { transform: "scale(1)" }],
        { duration: 620, easing: EASE, fill: "none" });
    if (wrapRef.current) {
      [...wrapRef.current.children].forEach((el, i) => el.animate && el.animate(
        [{ opacity: 0.5, transform: "translateY(14px)" }, { opacity: 1, transform: "none" }],
        { duration: 480, delay: 200 + i * 80, easing: EASE, fill: "none" }));
    }
  }, []);
  return (
    <div className="gt-full" style={{ overflowY: "auto", display: "block", padding: "0 20px 40px" }}>
      <div style={{ textAlign: "center", paddingTop: 70 }}>
        <div ref={discRef} style={{ width: 84, height: 84, borderRadius: 100, margin: "0 auto 26px", background: "var(--gt-success)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 14px 40px rgba(46,93,60,0.4)", color: "#fff" }}>
          <Icons.check size={42} sw={2.6} />
        </div>
        <div className="gt-eye" style={{ marginBottom: 12 }}>Workout complete</div>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 34, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.05 }}>
          Strong session.<br /><span style={{ color: "var(--gt-accent)", fontStyle: "italic", fontWeight: 500, fontFamily: "var(--font-serif)" }}>Logged.</span>
        </h1>
      </div>
      <div ref={wrapRef} className="gt-stat-grid" style={{ marginTop: 36 }}>
        <Stat I={Icons.clock} n={<Count to={mm} />} unit="m" label="Duration" />
        <Stat I={Icons.arrowUp} n={<Count to={result.volume / 1000} decimals={1} />} unit="t" label="Volume" />
        <Stat I={Icons.bolt} n={<Count to={done} />} label="Sets done" />
        <Stat I={Icons.list} n={<Count to={result.items.length} />} label="Exercises" />
      </div>
      <div style={{ marginTop: 30 }}>
        <button className="gt-btn accent" onClick={onDone}><Icons.check size={16} /> Done</button>
      </div>
    </div>
  );
}

function App({ tweaks }) {
  const [tab, setTab] = useState("home");
  const [stack, setStack] = useState([]); // sub-routes over the tab
  const [draft, setDraft] = useState(null); // active workout
  const [summary, setSummary] = useState(null);
  const [picker, setPicker] = useState(false);
  const [rest, setRest] = useState(90);
  const [streak] = useState(6);
  const scrollRef = useRef(null);

  const restDefault = tweaks.rest != null ? tweaks.rest : rest;

  const go = (name, param) => {
    const tabs = ["home", "history", "progress", "profile"];
    if (tabs.includes(name)) {
      // progress can carry an initial sub-tab via param
      setTab(name); setStack(name === "progress" && param ? [{ name: "__progresstab", param }] : []);
      if (name === "progress" && param) { setStack([]); setProgressTab(param); }
    } else {
      setStack((s) => [...s, { name, param }]);
    }
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };
  const [progressTab, setProgressTab] = useState(null);
  const back = () => setStack((s) => s.slice(0, -1));

  const startRoutine = (rid) => { setDraft(draftFromRoutine(rid)); };
  const startEmpty = () => { setDraft(draftFromRoutine(null)); setTimeout(() => setPicker(true), 350); };
  const finish = (result) => { setDraft(null); setSummary(result); };
  const addExercise = (exId) => setDraft((d) => ({ ...d, items: [...d.items, { exId, sets: [{ kg: 0, reps: 8, done: false }] }] }));

  // scroll to top + staggered entrance on screen change
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    playStagger(scrollRef.current);
  }, [tab, stack.length, progressTab]);

  const cur = stack[stack.length - 1];

  let screen;
  if (cur) {
    if (cur.name === "session") screen = <SessionDetail sessionId={cur.param} onBack={back} go={go} />;
    else if (cur.name === "exercise") screen = <ExerciseDetail exId={cur.param} onBack={back} />;
    else if (cur.name === "routine") screen = <RoutineDetail routineId={cur.param} onBack={back} onStartRoutine={(id) => { setStack([]); startRoutine(id); }} />;
    else if (cur.name === "routines") screen = <RoutinesScreen go={go} onBack={back} onStartRoutine={startRoutine} />;
    else if (cur.name === "library") screen = <LibraryScreen go={go} onBack={back} />;
  } else {
    if (tab === "home") screen = <HomeScreen go={go} onStartRoutine={startRoutine} onStartEmpty={startEmpty} streak={streak} />;
    else if (tab === "history") screen = <HistoryScreen go={go} />;
    else if (tab === "progress") screen = <ProgressScreen go={go} initialTab={progressTab} />;
    else if (tab === "profile") screen = <ProfileScreen go={go} units="kg" rest={rest} setRest={setRest} streak={streak} />;
  }

  return (
    <div className="gt" style={{ height: "100%" }}>
      <div ref={scrollRef} style={{ position: "absolute", inset: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", paddingTop: 6 }} className="gt-scroll">
        {screen}
      </div>

      {!draft && !summary && (
        <TabBar active={tab} onTab={go} onStart={() => { setTab("home"); setStack([]); startRoutine("push"); }} />
      )}

      {draft && (
        <ActiveWorkout draft={draft} setDraft={setDraft} restDefault={restDefault}
          onFinish={finish} onCancel={() => setDraft(null)} onPickExercise={() => setPicker(true)} />
      )}
      <ExercisePicker open={picker} onClose={() => setPicker(false)} onAdd={addExercise} />

      {summary && <FinishSummary result={summary} onDone={() => { setSummary(null); setTab("home"); setStack([]); }} />}
    </div>
  );
}

window.GymApp = App;
