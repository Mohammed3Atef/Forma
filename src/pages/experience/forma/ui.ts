// @ts-nocheck
/* ============================================================
   FORMA — ui: the real product interface, living in 3D space.
   Rendered as DOM (crisp text, accessible, indexable) and
   transform-placed in a shared perspective container.
   Deliberately NOT a sci-fi HUD — this should look clickable.

   Ported from the Forma.html design (claude.ai/design), verbatim.
   ============================================================ */

const CLIENTS = [
  ['Amelia Roy', 'AR', 'Active', 94, '62.4', 'Complete', 2, '12 Jun'],
  ['Daniel Okafor', 'DO', 'Active', 88, '84.1', 'Complete', 0, '18 Jun'],
  ['Sofia Marchetti', 'SM', 'Active', 76, '58.9', 'Due', 5, '21 Jun'],
  ['Liam Tremblay', 'LT', 'Trial', 61, '91.7', 'Pending', 1, '09 Jun'],
  ['Priya Raman', 'PR', 'Active', 97, '55.2', 'Complete', 0, '28 Jun'],
  ['Marcus Bell', 'MB', 'Expiring', 44, '102.3', 'Overdue', 8, '07 Jun'],
  ['Yuki Tanaka', 'YT', 'Active', 91, '67.0', 'Complete', 1, '30 Jun'],
  ['Noah Kirby', 'NK', 'Active', 83, '78.6', 'Due', 3, '24 Jun'],
];

const EXERCISES = [
  ['Bench Press', 'Chest', 'Barbell', 'Compound'],
  ['Lat Pulldown', 'Back', 'Cable', 'Compound'],
  ['Romanian Deadlift', 'Hamstrings', 'Barbell', 'Compound'],
  ['Overhead Press', 'Shoulders', 'Barbell', 'Compound'],
  ['Cable Fly', 'Chest', 'Cable', 'Isolation'],
  ['Back Squat', 'Quads', 'Barbell', 'Compound'],
  ['Seated Row', 'Back', 'Cable', 'Compound'],
  ['Lateral Raise', 'Shoulders', 'Dumbbell', 'Isolation'],
  ['Leg Press', 'Quads', 'Machine', 'Compound'],
];
const FOODS = [
  ['Chicken Breast', 165, 31, 0, 3.6, '100 g'],
  ['White Rice', 130, 2.7, 28, 0.3, '100 g'],
  ['Rolled Oats', 389, 16.9, 66, 6.9, '100 g'],
  ['Whole Eggs', 143, 12.6, 0.7, 9.5, '100 g'],
  ['Greek Yogurt', 59, 10, 3.6, 0.4, '100 g'],
  ['Salmon Fillet', 208, 20, 0, 13, '100 g'],
];

/* ---------- fragments: the coach's scattered reality ---------- */
function fragChat() {
  return `<div class="fg fg-chat"><div class="fg-h"><span class="fg-dot"></span>Client thread</div>
  <div class="bub in">Coach, should I go up on bench today?</div>
  <div class="bub in">Also I missed Thursday</div>
  <div class="bub out">Keep 80kg, add a rep. I'll move Thursday to Sat.</div>
  <div class="bub in">Sending my progress pics 📷</div>
  <div class="fg-f">14 unread across 6 threads</div></div>`;
}
function fragSheet() {
  const rows = [
    ['W1', 'Bench', '80×8', '80×8', '80×6'],
    ['W2', 'Bench', '82.5×8', '82.5×7', '80×8'],
    ['W3', 'Bench', '82.5×8', '85×6', '82.5×7'],
    ['W4', 'Bench', '85×8', '85×7', '85×6'],
    ['W1', 'Squat', '110×6', '110×6', '110×5'],
    ['W2', 'Squat', '112×6', '112×6', '110×6'],
  ];
  return `<div class="fg fg-sheet"><div class="fg-h"><span class="fg-dot"></span>client_programs_v7_FINAL.xlsx</div>
  <table><thead><tr><th></th><th>A</th><th>B</th><th>C</th><th>D</th></tr></thead><tbody>
  ${rows.map((r, i) => `<tr><td class="rn">${i + 1}</td>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}
  </tbody></table><div class="fg-f">7 tabs · last edited by you, 3 weeks ago</div></div>`;
}
function fragPdf() {
  return `<div class="fg fg-pdf"><div class="fg-h"><span class="fg-dot"></span>PhaseII_Hypertrophy.pdf</div>
  <div class="pdf-b"><div class="pdf-t">PHASE II — HYPERTROPHY</div>
  <div class="pdf-l"></div><div class="pdf-l" style="width:82%"></div><div class="pdf-l" style="width:64%"></div>
  <div class="pdf-t" style="margin-top:14px">DAY 1 — UPPER</div>
  <div class="pdf-l" style="width:90%"></div><div class="pdf-l" style="width:70%"></div>
  <div class="pdf-l" style="width:78%"></div><div class="pdf-l" style="width:52%"></div></div>
  <div class="fg-f">Page 1 of 14 · emailed 11 Apr</div></div>`;
}
function fragPhotos() {
  return `<div class="fg fg-photos"><div class="fg-h"><span class="fg-dot"></span>Progress photos — shared folder</div>
  <div class="ph-g">${Array.from({ length: 8 }, (_, i) => `<div class="ph" style="--k:${i}"></div>`).join('')}</div>
  <div class="fg-f">312 files · no dates · 4 clients mixed</div></div>`;
}
function fragNotes() {
  return `<div class="fg fg-notes"><div class="fg-h"><span class="fg-dot"></span>Notes — renewals</div>
  <ul><li>Marcus — expired?? chase</li><li>Sofia paid e-transfer 12th</li>
  <li>Liam trial ends Tue</li><li>Priya wants nutrition add-on</li><li>invoice Daniel!!</li></ul>
  <div class="fg-f">Manual. Every month.</div></div>`;
}

/* ---------- coach dashboard ---------- */
function dashboard() {
  const pill = (s) => `<span class="pill ${s.toLowerCase()}">${s}</span>`;
  const bar = (v) => `<span class="adh"><i style="width:${v}%"></i></span><b>${v}%</b>`;
  return `<div class="app" role="img" aria-label="Forma coach dashboard">
  <aside class="app-nav"><div class="app-brand"><i></i></div>
    <nav>${['Overview', 'Clients', 'Programs', 'Library', 'Messages', 'Business']
      .map((n, i) => `<a class="${i === 1 ? 'on' : ''}">${n}</a>`)
      .join('')}</nav>
    <div class="app-nav-f">COACH · A. NDIAYE</div></aside>
  <main class="app-main">
    <header class="app-top"><div><div class="app-eye">CLIENTS</div><h4>All clients</h4></div>
      <div class="app-actions"><span class="btn-g">FILTER</span><span class="btn-a">NEW CLIENT</span></div></header>
    <div class="kpi-row">
      ${[
        ['Active clients', '38'],
        ['Renewals this week', '6'],
        ['Adherence', '88%'],
        ['Unread', '14'],
      ]
        .map(([l, v]) => `<div class="kpi"><div class="kpi-l">${l}</div><div class="kpi-v">${v}</div></div>`)
        .join('')}
    </div>
    <table class="tbl"><thead><tr>
      <th>Client</th><th>Status</th><th>Adherence</th><th>Weight</th><th>Assessment</th><th>Msg</th><th>Renews</th>
    </tr></thead><tbody>
    ${CLIENTS.map(
      ([n, av, st, ad, w, as, ms, rn]) => `<tr>
      <td><span class="av">${av}</span>${n}</td><td>${pill(st)}</td><td class="adhc">${bar(ad)}</td>
      <td class="num">${w} kg</td><td class="${as === 'Overdue' ? 'warn' : as === 'Complete' ? 'ok' : ''}">${as}</td>
      <td class="num">${ms || '—'}</td><td class="num">${rn}</td></tr>`,
    ).join('')}
    </tbody></table>
  </main></div>`;
}

/* ---------- floated client modules ---------- */
function clientCard(i) {
  const [n, av, st, ad, w, as, ms, rn] = CLIENTS[i];
  return `<div class="cc"><div class="cc-h"><span class="av lg">${av}</span>
    <div><div class="cc-n">${n}</div><div class="cc-s">${st} · renews ${rn}</div></div></div>
    <div class="cc-g">
      <div><span>ADHERENCE</span><b>${ad}%</b></div><div><span>WEIGHT</span><b>${w} kg</b></div>
      <div><span>ASSESSMENT</span><b>${as}</b></div><div><span>UNREAD</span><b>${ms}</b></div>
    </div>
    <div class="cc-p"><i style="width:${ad}%"></i></div></div>`;
}

/* ---------- plan builder ---------- */
function builderWorkout() {
  const rows = [
    ['Warm-up', 'Bike + shoulder prep', '—', '6 min', '—', '—'],
    ['A1', 'Bench Press', '4', '8,8,6,8', '80 kg', '150 s'],
    ['A2', 'Incline DB Press', '3', '10', '30 kg', '90 s'],
    ['B1', 'Lat Pulldown', '3', '12', '60 kg', '90 s'],
    ['B2', 'Seated Row', '3', '12', '55 kg', '90 s'],
    ['C1', 'Lateral Raise', '3', '15', '12 kg', '60 s'],
  ];
  return `<div class="app bld"><header class="app-top"><div><div class="app-eye">PROGRAM · PHASE II</div>
    <h4>Week 3 — Day 1 · Upper</h4></div>
    <div class="app-actions"><span class="btn-g">DUPLICATE</span><span class="btn-a">ASSIGN</span></div></header>
    <div class="seg3"><span class="on">WORKOUT</span><span>NUTRITION</span><span>CARDIO</span></div>
    <div class="wk">${['W1', 'W2', 'W3', 'W4', 'W5', 'W6'].map((w, i) => `<span class="${i === 2 ? 'on' : ''}">${w}</span>`).join('')}</div>
    <table class="tbl bld-t"><thead><tr><th>#</th><th>Exercise</th><th>Sets</th><th>Reps</th><th>Load</th><th>Rest</th><th>Video</th></tr></thead>
    <tbody>${rows
      .map(
        ([a, b, c, d, e, f]) => `<tr><td class="mono dim">${a}</td><td>${b}</td>
      <td class="num">${c}</td><td class="num">${d}</td><td class="num">${e}</td><td class="num">${f}</td>
      <td><span class="vid"></span></td></tr>`,
      )
      .join('')}</tbody></table></div>`;
}
function builderNutrition() {
  const meals = [
    ['Breakfast', 'Oats · Whey · Blueberries', 512, 38, 62, 11],
    ['Lunch', 'Chicken · Rice · Greens', 640, 52, 71, 14],
    ['Snack', 'Greek Yogurt · Almonds', 288, 24, 14, 15],
    ['Dinner', 'Salmon · Potato · Asparagus', 610, 44, 48, 26],
  ];
  return `<div class="app bld"><header class="app-top"><div><div class="app-eye">NUTRITION</div>
    <h4>Daily target — 2,050 kcal</h4></div><div class="app-actions"><span class="btn-g">ALTERNATIVES</span><span class="btn-a">SAVE</span></div></header>
    <div class="seg3"><span>WORKOUT</span><span class="on">NUTRITION</span><span>CARDIO</span></div>
    <div class="macro">${[
      ['PROTEIN', '158 g'],
      ['CARBS', '195 g'],
      ['FAT', '66 g'],
      ['FIBRE', '31 g'],
    ]
      .map(([l, v]) => `<div><span>${l}</span><b>${v}</b></div>`)
      .join('')}</div>
    <table class="tbl"><thead><tr><th>Meal</th><th>Foods</th><th>kcal</th><th>P</th><th>C</th><th>F</th></tr></thead>
    <tbody>${meals
      .map(
        ([m, f, k, p, c, ft]) => `<tr><td>${m}</td><td class="dim">${f}</td>
      <td class="num">${k}</td><td class="num">${p}</td><td class="num">${c}</td><td class="num">${ft}</td></tr>`,
      )
      .join('')}</tbody></table></div>`;
}
function builderCardio() {
  const rows = [
    ['Mon', 'Zone 2 walk', '40 min', 'Z2 · 60-70%'],
    ['Wed', 'Intervals', '18 min', '8×30s hard'],
    ['Fri', 'Zone 2 bike', '35 min', 'Z2 · 65%'],
    ['Sun', 'Steady row', '25 min', 'Z2'],
  ];
  return `<div class="app bld"><header class="app-top"><div><div class="app-eye">CARDIO</div>
    <h4>Weekly schedule</h4></div><div class="app-actions"><span class="btn-a">ASSIGN</span></div></header>
    <div class="seg3"><span>WORKOUT</span><span>NUTRITION</span><span class="on">CARDIO</span></div>
    <table class="tbl"><thead><tr><th>Day</th><th>Type</th><th>Duration</th><th>Intensity</th></tr></thead>
    <tbody>${rows.map(([a, b, c, d]) => `<tr><td>${a}</td><td>${b}</td><td class="num">${c}</td><td class="dim">${d}</td></tr>`).join('')}</tbody></table></div>`;
}

/* ---------- library walls ---------- */
function libraryEx() {
  return `<div class="wall">${EXERCISES.map(
    ([n, m, e, c], i) => `<div class="lc" style="--k:${i}">
    <div class="lc-th"><span class="play"></span></div><div class="lc-n">${n}</div>
    <div class="lc-m">${m} · ${e}</div><div class="lc-t">${c}</div></div>`,
  ).join('')}</div>`;
}
function libraryFood() {
  return `<div class="wall">${FOODS.map(
    ([n, k, p, c, f, s], i) => `<div class="lc food" style="--k:${i}">
    <div class="lc-th food-th"></div><div class="lc-n">${n}</div>
    <div class="lc-m">${k} kcal · ${s}</div>
    <div class="lc-macros"><span>P ${p}</span><span>C ${c}</span><span>F ${f}</span></div></div>`,
  ).join('')}</div>`;
}

/* ---------- client phone ---------- */
function phone() {
  const today = `<div class="ph-today">
    <div class="ph-brand"><i></i></div>
    <div class="ph-eye">TODAY · WEEK 3</div><div class="ph-h2">Upper A</div>
    <div class="ph-card"><div class="ph-row"><span>Bench Press</span><b>4 × 8</b></div>
      <div class="ph-row"><span>Incline DB Press</span><b>3 × 10</b></div>
      <div class="ph-row"><span>Lat Pulldown</span><b>3 × 12</b></div>
      <div class="ph-row"><span>Seated Row</span><b>3 × 12</b></div></div>
    <div class="ph-cta">START WORKOUT</div>
    <div class="ph-mini"><div><span>NUTRITION</span><b>2,050</b></div><div><span>STEPS</span><b>8,420</b></div></div></div>`;
  return `<div class="phone" role="img" aria-label="Forma client app">
    <div class="phone-scr">${today}
      <nav class="ph-tabs">${['Today', 'Workout', 'Nutrition', 'Progress', 'More']
        .map((t, i) => `<span class="${i === 0 ? 'on' : ''}">${t}</span>`)
        .join('')}</nav>
    </div></div>`;
}

/* ---------- progress + business ---------- */
function progressPanel() {
  const w = [95, 93.8, 92.4, 90.7, 89.2];
  const max = 96,
    min = 88;
  const pts = w.map((v, i) => `${20 + i * 90},${20 + (1 - (v - min) / (max - min)) * 92}`).join(' ');
  return `<div class="app pg"><header class="app-top"><div><div class="app-eye">PROGRESS · AMELIA ROY</div>
    <h4>Last 5 check-ins</h4></div></header>
    <div class="pg-grid">
      <div class="pg-chart"><div class="pg-l">WEIGHT TREND (KG)</div>
        <svg viewBox="0 0 400 140" preserveAspectRatio="none">
          <defs><linearGradient id="fgWt" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#FFB208"/><stop offset="1" stop-color="#FF4C01"/></linearGradient></defs>
          <polyline points="${pts}" fill="none" stroke="url(#fgWt)" stroke-width="2.5" stroke-linejoin="round"/>
          ${w.map((v, i) => `<circle cx="${20 + i * 90}" cy="${20 + (1 - (v - min) / (max - min)) * 92}" r="4" fill="#FF8B02"/>`).join('')}
        </svg>
        <div class="pg-x">${w.map((v) => `<span>${v}</span>`).join('')}</div></div>
      <div class="pg-rings">
        ${[
          ['WORKOUT', 88],
          ['NUTRITION', 92],
          ['ASSESSMENTS', 100],
        ]
          .map(
            ([l, v]) => `
          <div class="ring"><svg viewBox="0 0 42 42"><defs><linearGradient id="fgR${l}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#FFB208"/><stop offset="1" stop-color="#FF4C01"/></linearGradient></defs>
          <circle cx="21" cy="21" r="17" fill="none" stroke="rgba(230,226,220,.14)" stroke-width="4"/>
          <circle cx="21" cy="21" r="17" fill="none" stroke="url(#fgR${l})" stroke-width="4" stroke-linecap="round"
            stroke-dasharray="${(v / 100) * 106.8} 200" transform="rotate(-90 21 21)"/></svg>
          <b>${v}%</b><span>${l}</span></div>`,
          )
          .join('')}
      </div></div>
    <div class="pg-photos">${Array.from({ length: 6 }, (_, i) => `<div class="pp" style="--k:${i}"><span>WK ${i * 2 + 1}</span></div>`).join('')}</div></div>`;
}
function businessPanel() {
  const k = [
    ['Active clients', '38', '+4'],
    ['Renewals this week', '6', ''],
    ['Due this month', '$4,180', ''],
    ['Collected this month', '$11,240', '+8%'],
    ['Retention', '91%', '+2%'],
    ['Churn', '4.2%', '−1.1%'],
    ['Subscriptions expiring', '3', ''],
    ['Avg. client value', '$296', '+$14'],
  ];
  return `<div class="app bz"><header class="app-top"><div><div class="app-eye">BUSINESS</div>
    <h4>This month</h4></div><div class="app-actions"><span class="btn-g">EXPORT</span></div></header>
    <div class="bz-grid">${k
      .map(
        ([l, v, d]) => `<div class="bz-k"><div class="bz-l">${l}</div>
      <div class="bz-v">${v}</div>${d ? `<div class="bz-d">${d}</div>` : ''}</div>`,
      )
      .join('')}</div>
    <div class="bz-note">Sample values for design review — replace with live figures before launch.</div></div>`;
}

/* ---------- hierarchy labels ---------- */
function hierPanel() {
  const tiers = [
    ['FORMA'],
    ['Coaches', 'Clients', 'Templates'],
    ['Workout plans', 'Nutrition plans', 'Cardio', 'Assessments', 'Progress', 'Messages'],
    ['Subscriptions', 'Exercise library', 'Food library', 'Renewals'],
  ];
  return `<div class="hier">${tiers
    .map(
      (row, i) => `<div class="hier-r r${i}">
    ${row.map((n) => `<span class="${i === 0 ? 'root' : ''}">${n}</span>`).join('')}</div>`,
    )
    .join('')}</div>`;
}

/* ---------- registry ---------- */
export const PANELS = {
  fchat: fragChat(),
  fsheet: fragSheet(),
  fpdf: fragPdf(),
  fphotos: fragPhotos(),
  fnotes: fragNotes(),
  dash: dashboard(),
  cc0: clientCard(0),
  cc1: clientCard(4),
  cc2: clientCard(6),
  bWork: builderWorkout(),
  bNut: builderNutrition(),
  bCar: builderCardio(),
  libEx: libraryEx(),
  libFood: libraryFood(),
  phone: phone(),
  dashMini: dashboard(),
  prog: progressPanel(),
  biz: businessPanel(),
  hier: hierPanel(),
};

export function mountUI(container) {
  const nodes = {};
  Object.entries(PANELS).forEach(([id, html]) => {
    const w = document.createElement('div');
    w.className = 'uiw';
    w.dataset.id = id;
    w.innerHTML = html;
    w.style.opacity = '0';
    w.style.visibility = 'hidden';
    container.appendChild(w);
    nodes[id] = w;
  });
  return {
    nodes,
    /* o=opacity, x/y in vw/vh-ish px, z depth, rx/ry deg, s scale */
    set(id, { o = 0, x = 0, y = 0, z = 0, rx = 0, ry = 0, s = 1 } = {}) {
      const n = nodes[id];
      if (!n) return;
      const vis = o > 0.008;
      n.style.visibility = vis ? 'visible' : 'hidden';
      if (!vis) return;
      n.style.opacity = o.toFixed(3);
      n.style.transform = `translate3d(calc(-50% + ${x}px), calc(-50% + ${y}px), ${z}px) rotateX(${rx}deg) rotateY(${ry}deg) scale(${s})`;
    },
    hideAll() {
      Object.values(nodes).forEach((n) => {
        n.style.visibility = 'hidden';
        n.style.opacity = '0';
      });
    },
    dispose() {
      Object.values(nodes).forEach((n) => n.remove());
    },
  };
}
