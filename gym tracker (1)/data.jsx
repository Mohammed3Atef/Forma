/* ============================================================
   Gym Tracker — Data layer + icons
   MyRocky design system. All weights in kg.
   ============================================================ */

/* ---------- Icons (Lucide-style, 2px stroke, currentColor) ---------- */
const Icon = ({ d, size = 22, sw = 1.8, fill = "none", children, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" {...p}>
    {d ? <path d={d} /> : children}
  </svg>
);

const Icons = {
  home: (p) => <Icon {...p}><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5"/></Icon>,
  calendar: (p) => <Icon {...p}><rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/></Icon>,
  chart: (p) => <Icon {...p}><path d="M4 19V5M4 19h16"/><path d="M8 16v-4M12.5 16V8M17 16v-6"/></Icon>,
  user: (p) => <Icon {...p}><circle cx="12" cy="8" r="4"/><path d="M4 20c0-3.6 3.6-6 8-6s8 2.4 8 6"/></Icon>,
  dumbbell: (p) => <Icon {...p}><path d="M6.5 6.5 17.5 17.5M3.5 8.5l1-1M19.5 14.5l1 1"/><rect x="3.2" y="9" width="4" height="6" rx="1.2" transform="rotate(-45 5.2 12)"/><rect x="16.8" y="9" width="4" height="6" rx="1.2" transform="rotate(-45 18.8 12)"/></Icon>,
  plus: (p) => <Icon {...p}><path d="M12 5v14M5 12h14"/></Icon>,
  check: (p) => <Icon {...p}><path d="M4 12.5 9.5 18 20 6.5"/></Icon>,
  chevR: (p) => <Icon {...p}><path d="M9 5l7 7-7 7"/></Icon>,
  chevL: (p) => <Icon {...p}><path d="M15 5l-7 7 7 7"/></Icon>,
  chevD: (p) => <Icon {...p}><path d="M5 9l7 7 7-7"/></Icon>,
  x: (p) => <Icon {...p}><path d="M6 6l12 12M18 6 6 18"/></Icon>,
  flame: (p) => <Icon {...p}><path d="M12 3c3 4 5 6 5 9a5 5 0 0 1-10 0c0-1.3.5-2.4 1.4-3.4C9 10 9.5 11 11 11c1-2-1-4 1-8Z"/></Icon>,
  clock: (p) => <Icon {...p}><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></Icon>,
  trophy: (p) => <Icon {...p}><path d="M7 4h10v4a5 5 0 0 1-10 0V4Z"/><path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3M9.5 13.5 9 18h6l-.5-4.5M8 21h8"/></Icon>,
  search: (p) => <Icon {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></Icon>,
  settings: (p) => <Icon {...p}><circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.5M12 19v2.5M21.5 12H19M5 12H2.5M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8M18.7 18.7l-1.8-1.8M7.1 7.1 5.3 5.3"/></Icon>,
  arrowR: (p) => <Icon {...p}><path d="M5 12h14M13 6l6 6-6 6"/></Icon>,
  arrowUp: (p) => <Icon {...p}><path d="M12 19V5M6 11l6-6 6 6"/></Icon>,
  edit: (p) => <Icon {...p}><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="M14 6l4 4"/></Icon>,
  trash: (p) => <Icon {...p}><path d="M4 7h16M9 7V4.5h6V7M6 7l1 13h10l1-13"/></Icon>,
  copy: (p) => <Icon {...p}><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/></Icon>,
  play: (p) => <Icon {...p} fill="currentColor" sw="0"><path d="M7 4.5v15l13-7.5z"/></Icon>,
  pause: (p) => <Icon {...p}><path d="M9 4v16M15 4v16"/></Icon>,
  minus: (p) => <Icon {...p}><path d="M5 12h14"/></Icon>,
  ruler: (p) => <Icon {...p}><rect x="3" y="8" width="18" height="8" rx="1.5"/><path d="M7 8v3M11 8v4M15 8v3M19 8v4"/></Icon>,
  list: (p) => <Icon {...p}><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></Icon>,
  bolt: (p) => <Icon {...p}><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></Icon>,
  target: (p) => <Icon {...p}><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="0.6" fill="currentColor"/></Icon>,
  timer: (p) => <Icon {...p}><circle cx="12" cy="13" r="8"/><path d="M12 13V9M9.5 2.5h5M18.5 6.5 20 5"/></Icon>,
  heart: (p) => <Icon {...p}><path d="M12 20S4 15 4 9.5A4 4 0 0 1 12 7a4 4 0 0 1 8 2.5C20 15 12 20 12 20Z"/></Icon>,
  sun: (p) => <Icon {...p}><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19.1v2.4M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7"/></Icon>,
  moon: (p) => <Icon {...p}><path d="M20 13.5A8 8 0 0 1 9.5 4 7 7 0 1 0 20 13.5Z"/></Icon>,
};

/* ---------- Exercise library ---------- */
const EX = [
  { id: "bench", name: "Bench Press", muscle: "Chest", equip: "Barbell", cat: "Push",
    cues: ["Retract scapula, feet flat and driving.", "Lower bar to mid-chest with control.", "Press up and slightly back over shoulders."] },
  { id: "incline", name: "Incline Dumbbell Press", muscle: "Chest", equip: "Dumbbell", cat: "Push",
    cues: ["Set bench to 30°.", "Press dumbbells up and together.", "Stretch at the bottom, don't bounce."] },
  { id: "ohp", name: "Overhead Press", muscle: "Shoulders", equip: "Barbell", cat: "Push",
    cues: ["Brace core, squeeze glutes.", "Press bar overhead, move head through.", "Lock out with biceps by ears."] },
  { id: "latraise", name: "Lateral Raise", muscle: "Shoulders", equip: "Dumbbell", cat: "Push",
    cues: ["Slight bend in elbows.", "Lead with elbows to shoulder height.", "Lower slowly, no swinging."] },
  { id: "dip", name: "Triceps Dip", muscle: "Triceps", equip: "Bodyweight", cat: "Push",
    cues: ["Lean slightly forward.", "Lower to 90° at elbows.", "Press through palms to lock out."] },
  { id: "pushdown", name: "Cable Pushdown", muscle: "Triceps", equip: "Cable", cat: "Push",
    cues: ["Pin elbows to sides.", "Extend fully, squeeze triceps.", "Control the return."] },
  { id: "squat", name: "Back Squat", muscle: "Quads", equip: "Barbell", cat: "Legs",
    cues: ["Bar on upper traps, brace hard.", "Break at hips and knees together.", "Drive up through mid-foot."] },
  { id: "rdl", name: "Romanian Deadlift", muscle: "Hamstrings", equip: "Barbell", cat: "Legs",
    cues: ["Soft knees, hinge at hips.", "Bar drags down thighs.", "Feel hamstring stretch, drive hips forward."] },
  { id: "legpress", name: "Leg Press", muscle: "Quads", equip: "Machine", cat: "Legs",
    cues: ["Feet shoulder-width on platform.", "Lower until knees near chest.", "Don't lock knees at top."] },
  { id: "legcurl", name: "Seated Leg Curl", muscle: "Hamstrings", equip: "Machine", cat: "Legs",
    cues: ["Pad just above heels.", "Curl fully, squeeze.", "Resist the return."] },
  { id: "calf", name: "Standing Calf Raise", muscle: "Calves", equip: "Machine", cat: "Legs",
    cues: ["Full stretch at bottom.", "Rise onto toes, pause.", "Slow negative."] },
  { id: "deadlift", name: "Deadlift", muscle: "Back", equip: "Barbell", cat: "Pull",
    cues: ["Bar over mid-foot, grip outside knees.", "Chest up, lats tight.", "Push floor away, lock hips."] },
  { id: "pullup", name: "Pull-up", muscle: "Back", equip: "Bodyweight", cat: "Pull",
    cues: ["Full hang, depress shoulders.", "Pull chest to bar.", "Control the descent."] },
  { id: "row", name: "Barbell Row", muscle: "Back", equip: "Barbell", cat: "Pull",
    cues: ["Hinge to ~45°, flat back.", "Row to lower ribs.", "Squeeze, then lower with control."] },
  { id: "latpull", name: "Lat Pulldown", muscle: "Back", equip: "Cable", cat: "Pull",
    cues: ["Slight lean back.", "Pull bar to upper chest.", "Drive elbows down and back."] },
  { id: "curl", name: "Barbell Curl", muscle: "Biceps", equip: "Barbell", cat: "Pull",
    cues: ["Elbows pinned, no swing.", "Curl to full contraction.", "Lower slowly."] },
  { id: "hammer", name: "Hammer Curl", muscle: "Biceps", equip: "Dumbbell", cat: "Pull",
    cues: ["Neutral grip throughout.", "Curl without rotating.", "Control the negative."] },
  { id: "facepull", name: "Face Pull", muscle: "Rear Delts", equip: "Cable", cat: "Pull",
    cues: ["Rope at face height.", "Pull to forehead, elbows high.", "Squeeze rear delts."] },
  { id: "plank", name: "Plank", muscle: "Core", equip: "Bodyweight", cat: "Core",
    cues: ["Forearms down, body in line.", "Brace abs and glutes.", "Don't let hips sag."] },
  { id: "legraise", name: "Hanging Leg Raise", muscle: "Core", equip: "Bodyweight", cat: "Core",
    cues: ["Hang, depress shoulders.", "Raise legs to parallel+.", "No swinging."] },
];
const exById = (id) => EX.find((e) => e.id === id);

/* ---------- Routines (templates) ---------- */
const ROUTINES = [
  { id: "push", name: "Push Day", focus: "Chest · Shoulders · Triceps", color: "#AE7E56",
    items: [
      { exId: "bench", sets: [{ kg: 80, reps: 8 }, { kg: 80, reps: 8 }, { kg: 80, reps: 6 }, { kg: 70, reps: 8 }] },
      { exId: "incline", sets: [{ kg: 30, reps: 10 }, { kg: 30, reps: 10 }, { kg: 30, reps: 9 }] },
      { exId: "ohp", sets: [{ kg: 45, reps: 8 }, { kg: 45, reps: 7 }, { kg: 40, reps: 9 }] },
      { exId: "latraise", sets: [{ kg: 12, reps: 15 }, { kg: 12, reps: 14 }, { kg: 12, reps: 12 }] },
      { exId: "pushdown", sets: [{ kg: 25, reps: 14 }, { kg: 25, reps: 12 }, { kg: 22, reps: 12 }] },
    ] },
  { id: "pull", name: "Pull Day", focus: "Back · Biceps · Rear delts", color: "#2E5D3C",
    items: [
      { exId: "deadlift", sets: [{ kg: 140, reps: 5 }, { kg: 140, reps: 5 }, { kg: 120, reps: 6 }] },
      { exId: "pullup", sets: [{ kg: 0, reps: 10 }, { kg: 0, reps: 9 }, { kg: 0, reps: 8 }] },
      { exId: "row", sets: [{ kg: 70, reps: 10 }, { kg: 70, reps: 9 }, { kg: 65, reps: 10 }] },
      { exId: "latpull", sets: [{ kg: 60, reps: 12 }, { kg: 60, reps: 11 }] },
      { exId: "curl", sets: [{ kg: 30, reps: 12 }, { kg: 30, reps: 10 }, { kg: 27, reps: 10 }] },
      { exId: "facepull", sets: [{ kg: 22, reps: 18 }, { kg: 22, reps: 16 }] },
    ] },
  { id: "legs", name: "Leg Day", focus: "Quads · Hamstrings · Calves", color: "#BF6E4E",
    items: [
      { exId: "squat", sets: [{ kg: 110, reps: 6 }, { kg: 110, reps: 6 }, { kg: 110, reps: 5 }, { kg: 95, reps: 8 }] },
      { exId: "rdl", sets: [{ kg: 90, reps: 8 }, { kg: 90, reps: 8 }, { kg: 80, reps: 10 }] },
      { exId: "legpress", sets: [{ kg: 200, reps: 12 }, { kg: 200, reps: 11 }, { kg: 180, reps: 12 }] },
      { exId: "legcurl", sets: [{ kg: 55, reps: 12 }, { kg: 55, reps: 11 }] },
      { exId: "calf", sets: [{ kg: 90, reps: 16 }, { kg: 90, reps: 15 }, { kg: 90, reps: 14 }] },
    ] },
  { id: "upper", name: "Upper Body", focus: "Full upper · 45 min", color: "#D4A46A",
    items: [
      { exId: "bench", sets: [{ kg: 75, reps: 8 }, { kg: 75, reps: 8 }, { kg: 75, reps: 7 }] },
      { exId: "row", sets: [{ kg: 65, reps: 10 }, { kg: 65, reps: 10 }, { kg: 65, reps: 9 }] },
      { exId: "ohp", sets: [{ kg: 42, reps: 9 }, { kg: 42, reps: 8 }] },
      { exId: "latpull", sets: [{ kg: 60, reps: 12 }, { kg: 60, reps: 11 }] },
      { exId: "hammer", sets: [{ kg: 14, reps: 12 }, { kg: 14, reps: 11 }] },
    ] },
];
const routineById = (id) => ROUTINES.find((r) => r.id === id);

/* ---------- Helpers ---------- */
const volOf = (items) => items.reduce((t, it) =>
  t + it.sets.reduce((s, st) => s + (st.done === false ? 0 : (st.kg || 0) * (st.reps || 0)), 0), 0);
const setCount = (items) => items.reduce((t, it) => t + it.sets.length, 0);
const e1rm = (kg, reps) => Math.round(kg * (1 + reps / 30)); // Epley

const DAY = 864e5;
const fmtDate = (d) => d.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
const fmtDay = (d) => d.toLocaleDateString("en-CA", { weekday: "long" });
const sameDay = (a, b) => a.toDateString() === b.toDateString();

/* ---------- History (generated, deterministic) ---------- */
const TODAY = new Date(2026, 5, 4); // Jun 4 2026
function buildHistory() {
  const plan = ["push", "pull", "legs", "push", "pull", "upper"];
  const out = [];
  // sessions spread across the last ~8 weeks, ~3-4/week
  const offsets = [1, 3, 5, 8, 10, 12, 15, 17, 19, 22, 24, 26, 29, 31, 33, 36, 38, 40, 43, 45, 47, 50, 52];
  offsets.forEach((off, i) => {
    const r = routineById(plan[i % plan.length]);
    // simulate slight progressive overload (older = lighter)
    const factor = 1 - off / 320;
    const items = r.items.map((it) => ({
      exId: it.exId,
      sets: it.sets.map((s) => ({
        kg: Math.max(0, Math.round((s.kg * factor) / 2.5) * 2.5),
        reps: s.reps + (Math.random() < 0.3 ? -1 : 0),
        done: true,
      })),
    }));
    const date = new Date(TODAY.getTime() - off * DAY);
    out.push({
      id: "s" + i,
      date,
      routineId: r.id,
      name: r.name,
      durationMin: 38 + Math.round(setCount(items) * 1.6),
      items,
      volume: volOf(items),
    });
  });
  return out.sort((a, b) => b.date - a.date);
}
const HISTORY = buildHistory();

/* ---------- Bodyweight + measurements ---------- */
function buildWeight() {
  const out = [];
  for (let w = 11; w >= 0; w--) {
    const base = 84.5 - (11 - w) * 0.18; // slow recomp
    out.push({ date: new Date(TODAY.getTime() - w * 7 * DAY), kg: Math.round((base + (Math.random() - 0.5)) * 10) / 10 });
  }
  return out;
}
const WEIGHT = buildWeight();
const MEASURES = [
  { key: "weight", label: "Bodyweight", unit: "kg", val: WEIGHT[WEIGHT.length - 1].kg, prev: WEIGHT[0].kg },
  { key: "chest", label: "Chest", unit: "cm", val: 104, prev: 101 },
  { key: "waist", label: "Waist", unit: "cm", val: 82, prev: 85 },
  { key: "arms", label: "Arms", unit: "cm", val: 39.5, prev: 38 },
  { key: "thigh", label: "Thigh", unit: "cm", val: 60, prev: 58 },
];

/* ---------- Personal records (derived from history) ---------- */
function buildPRs() {
  const map = {};
  HISTORY.forEach((sess) => {
    sess.items.forEach((it) => {
      it.sets.forEach((st) => {
        if (!st.kg) return;
        const rm = e1rm(st.kg, st.reps);
        if (!map[it.exId] || rm > map[it.exId].e1rm) {
          map[it.exId] = { exId: it.exId, kg: st.kg, reps: st.reps, e1rm: rm, date: sess.date };
        }
      });
    });
  });
  return Object.values(map).sort((a, b) => b.e1rm - a.e1rm);
}
const PRS = buildPRs();

/* weekly volume for last 8 weeks (for chart) */
function weeklyVolume() {
  const weeks = [];
  for (let w = 7; w >= 0; w--) {
    const end = new Date(TODAY.getTime() - w * 7 * DAY);
    const start = new Date(end.getTime() - 7 * DAY);
    const v = HISTORY.filter((s) => s.date > start && s.date <= end).reduce((t, s) => t + s.volume, 0);
    weeks.push({ label: w === 0 ? "Now" : `-${w}w`, vol: v });
  }
  return weeks;
}
const WEEKLY_VOL = weeklyVolume();

Object.assign(window, {
  Icon, Icons, EX, exById, ROUTINES, routineById,
  volOf, setCount, e1rm, fmtDate, fmtDay, sameDay, DAY, TODAY,
  HISTORY, WEIGHT, MEASURES, PRS, WEEKLY_VOL,
});
