# Forma "Experience" — Creative Direction & Storyboard

Cinematic, scroll-driven marketing site for Forma. Lives at `/experience` (new route,
alongside the existing marketing site at `/`) so it can be reviewed before it replaces
anything. Built with React Three Fiber + drei + GSAP ScrollTrigger, using the app's real
design tokens (`tailwind.config.ts`) — no external 3D asset files; every object is
constructed procedurally from primitive geometry (cylinders, tori, boxes) so there's no
licensing risk and no asset pipeline to manage.

This doc covers the 8 planning deliverables before any section past Hero/Problem is
built: creative direction, section storyboard, 3D transformation specs, asset list,
animation timing, mobile fallback, performance strategy, and component architecture.

## 1. Creative direction

**Line:** training evolves, coaching should too. A single gym object — a dumbbell —
is present from the first frame and physically reconfigures as the user scrolls: into a
barbell, then into a rack/bench rig, then dissolves into structural lines that resolve
into the Forma interface. The object is the throughline; copy is short and appears
around it, never on top of a screenshot grid.

**Tone:** athletic precision, not gaming/cyberpunk, not glassmorphism-everywhere.
Surfaces are matte dark charcoal (`surface` scale), lit like product photography —
one warm key light (orange/gold), one cool fill, soft shadows, no neon rim light.
Orange (`brand`) and gold appear only where they mean something: the object's metal
catches light, a CTA, a status highlight. The rest of the frame stays charcoal/`earth`
white so the accent keeps its weight.

**What we are not doing:** flat icon rows, stock photography, emoji, bouncing/looping
idle animation, autoplay unrelated to scroll position, glass-card-on-glass-card
stacking, screenshots pasted flat onto the page.

## 2. Section-by-section storyboard

Only §1 Hero and §2 Problem are being built in this pass (agreed scope: storyboard now,
build incrementally). §3–§12 are storyboarded here so the architecture and the object's
transformation states are planned coherently, and so each later section is a scoped,
independent follow-up rather than a redesign.

| # | Section | Object state | Copy beat |
|---|---|---|---|
| 1 | Hero | Dumbbell, floating, idle rotation + mouse parallax | `FORMA` / `TRAIN. TRACK. TRANSFORM.` + headline + 2 CTAs |
| 2 | Problem | Dumbbell → barbell (handle extends, plates migrate outward) while fragmented workflow lines appear, then collapse | "Coaching gets complicated fast." → fragments → "Forma brings it together." |
| 3 | Client management | Barbell's plates/collars separate into flat modular blocks, blocks become floating client cards (perspective, not flat) | "Every client. One clear workspace." |
| 4 | Plan building | Cards part; a bench/rack/cable frame assembles around a floating plan builder with 3 vertical layers (workout/nutrition/cardio) | "Build plans the way you coach." |
| 5 | Library | Rack frame becomes a 3D wall/grid of exercise + food tiles (structured grid, not marketplace tiles) | "A library that keeps growing." |
| 6 | Client experience | Camera pulls back, whole rig compresses down into a single phone mockup | "Simple for the client. Powerful for the coach." |
| 7 | Real-time coaching | Phone splits into two synced devices with a light-trail data line between them | "Coaching doesn't stop when the session ends." |
| 8 | Progress & adherence | The data line fans out into 3–4 animated charts | "See what's actually happening." |
| 9 | Business | Charts reduce into a small set of business metric tiles | "Coach the client. Understand the business." |
| 10 | Admin/platform | Camera pulls back further; tiles arrange into a system map (tiers/library/permissions/audit as nodes) | "Built to grow with your coaching business." |
| 11 | Before/After | Split-screen scroll: left fragments (chat bubbles/sheet grid/photo stack), right reorganizes live into Forma UI | "Less admin. More coaching." |
| 12 | Final | Everything dissolves into the Forma "F" mark, then full wordmark | "Your coaching system. Finally in one place." + CTAs |

## 3. 3D transformation specs (this pass: §1→§2, the `GymRig`)

One object, `GymRig`, built from 5 reusable primitive parts so "morphing" is really
**shared parts moving/rescaling**, not topology-blending between unrelated meshes —
this is what keeps it physically plausible without vertex-morph tooling:

- `bar` — a `CylinderGeometry` (length animates: short "handle" → long "barbell bar")
- `plateInner` × 2 (left/right) — wide short cylinders, sit close to center at rest
- `plateOuter` × 2 (left/right) — a second pair that appear (scale 0→1) and slide to the
  bar's ends only once it's long enough to read as a barbell
- `collar` × 2 (left/right) — thin toruses that clamp at the plate position, purely a
  detail read

**State A — Hero (progress 0 → 0.32):** dumbbell at rest. `bar` short (1.1 units),
`plateInner` pair at ±0.62 on the bar, `plateOuter` scaled to 0 (not visible). Slow
constant idle spin (`+0.05 rad/s` on Y) plus a mouse-parallax tilt (± 0.12 rad on X/Y,
lerped, never snaps) — the only non-scroll-driven motion in the whole piece, and it's
disabled under `prefers-reduced-motion`.

**Transition — Problem (progress 0.32 → 0.78):** `bar` scales from length 1.1 → 6.4.
`plateInner` pair slides outward from ±0.62 to ±2.7 (tracking the bar ends).
`plateOuter` pair fades/scales in from 0 → 1 starting at progress 0.5, taking position
just inboard of `plateInner` (the "loaded barbell" read). `collar` pairs fade in at 0.6.
Camera dollies back slightly (z: 4.2 → 5.6) to keep the now-longer object framed.
Rotation slows from idle spin to a near-stop (reads as "settling into place") by 0.78.

**State B — resolved barbell (progress 0.78 → 1.0):** fully formed, small continued
idle rotation (0.01 rad/s) so it doesn't feel frozen while the "Forma brings it
together" copy resolves and fragment text clears.

All positions/scales are driven by a single `progress: number` (0–1) prop — no internal
timers — so the whole thing scrubs perfectly with scroll in both directions.

## 4. Asset list

No external `.glb`/`.gltf` files. Everything below is procedural Three.js geometry +
material, built at runtime:

- Geometry: `CylinderGeometry` (bar, plates, collars — reused via scale, not separate
  meshes per size), `TorusGeometry` (collars)
- Material: a single shared `meshStandardMaterial`-based brushed-metal look
  (`color` charcoal `#1B1F26` body, `metalness 0.6`, `roughness 0.35`), plates get a
  thin emissive rim using `brand.dark`/`gold` at grazing angles (fresnel-style via
  `MeshPhysicalMaterial` clearcoat, not a texture)
- Lighting rig: 1 warm key `directionalLight` (`brand.light` tint, casts soft shadow),
  1 cool fill `directionalLight` (low intensity, `#3A4250` tint, no shadow), 1
  `ambientLight` (very low, keeps blacks from crushing), optional `ContactShadows`
  (drei) under the object for grounding
- No environment texture / HDRI file — a flat dark `surface.DEFAULT` background keeps
  first-load weight down; a very subtle radial gradient (CSS, behind the canvas) adds
  atmosphere without a texture asset

## 5. Animation timing / ScrollTrigger ranges

One pinned scroll container, `#hero-problem-story`, height `340vh` (desktop) so there's
enough scroll distance to read 5 fragment lines without the transformation feeling
rushed. `ScrollTrigger` config: `trigger: '#hero-problem-story'`, `start: 'top top'`,
`end: 'bottom bottom'`, `scrub: 0.6` (slight easing lag, not raw 1:1 — reads as
weighted/physical rather than a slider).

Progress → beat mapping (of the 0–1 range across the full 340vh):

| Progress | Beat |
|---|---|
| 0.00 – 0.30 | Hero holds: wordmark, headline, subcopy, CTAs at full opacity |
| 0.22 – 0.32 | Hero copy fades/lifts out (`opacity 1→0`, `y 0→-24px`) |
| 0.30 – 0.34 | "Coaching gets complicated fast." fades in, holds |
| 0.36 – 0.60 | 5 fragment lines, staggered ~0.045 progress apart, each in ~0.03, hold ~0.02, out ~0.02 (only ever 1–2 visible at once) |
| 0.32 – 0.78 | `GymRig` morph runs (see §3) concurrently |
| 0.62 – 0.72 | Fragments finish clearing |
| 0.72 – 0.86 | "Forma brings it together." fades in centered, holds |
| 0.86 – 1.00 | Resolved barbell holds, copy holds, ready to hand off to §3 (not yet built) |

Every fade uses `opacity` + small `y` translate (12–24px), `power2.out`/`power2.in`,
never a hard cut. No element animates on a timer independent of `progress`.

## 6. Mobile / fallback strategy

- **No WebGL / `prefers-reduced-motion`:** the whole `GymRig` canvas is skipped. Hero
  and Problem render as static sections: a CSS radial-gradient backdrop, the wordmark,
  headline, copy, and fragment lines still appear but as a simple sequential fade-in
  tied to viewport-enter (IntersectionObserver), not scroll-scrub. No motion is forced
  on anyone who's asked for less.
- **Mobile (< 768px):** canvas renders but simplified — `dpr` capped at `1` (vs. up to
  `1.5` on desktop), no `ContactShadows`, mouse-parallax disabled (no mouse), scroll
  container height reduced to `220vh` (shorter reading distance for a smaller, faster
  scroll gesture), fragment lines reduced from 5 to 3.
- **Tablet:** desktop configuration minus `ContactShadows` and with `dpr` capped at
  `1.25`.
- **Low-power detection:** a lightweight heuristic (`navigator.hardwareConcurrency <= 4`
  or a failed `WebGL2RenderingContext` probe) drops to the no-WebGL static fallback
  even on desktop-sized viewports.

## 7. Performance strategy

- 3D canvas and GSAP/ScrollTrigger are loaded via `React.lazy` + `Suspense`, so the
  route's initial JS doesn't include `three`/`@react-three/fiber`/`gsap` until
  `/experience` is actually visited.
- `<Canvas frameloop="demand">` (drei/fiber) — the scene only re-renders on
  scroll-progress change or pointer move, not a free-running 60fps loop while idle.
- `ScrollTrigger` uses a single instance for the whole pinned container (not one per
  fragment line) to keep scroll listener count flat regardless of copy length.
- Geometry is instantiated once (`useMemo`) and only transformed (position/scale/
  rotation), never recreated per frame or per scroll tick.
- Renderer capped `pixelRatio` (`Math.min(devicePixelRatio, 1.5)` desktop, lower on
  mobile per §6), `antialias` on desktop only.
- `IntersectionObserver` gate: the canvas is only mounted once the story container
  nears the viewport (root margin ~200px), so it never renders while off-screen below
  the fold, and `frameloop` pauses when the container leaves the viewport entirely.
- No texture/HDRI downloads (see §4) — first paint isn't blocked on any binary asset.

## 8. Component architecture (this pass)

```
src/pages/experience/
  Experience.tsx              — page shell: mounts HeroProblemStory, route target
  hooks/
    useStoryProgress.ts        — GSAP ScrollTrigger scrub → progress (0..1), SSR/no-op safe
    useReducedMotionPref.ts    — prefers-reduced-motion + WebGL/low-power capability check
  scene/
    GymRigCanvas.tsx           — <Canvas> wrapper: lighting rig, camera, frameloop="demand",
                                 mounts <GymRig progress={...} />, contact shadow
    GymRig.tsx                 — the procedural object described in §3 (pure, driven by `progress` prop)
  sections/
    HeroProblemStory.tsx        — the pinned 340vh/220vh container; owns the story's `progress`
                                 value and lays out Hero + Problem copy blocks + GymRigCanvas
    HeroCopy.tsx                — wordmark/headline/subcopy/CTAs, opacity/y driven by progress
    ProblemCopy.tsx             — fragment line list + resolution line, opacity/y driven by progress
    StaticFallbackStory.tsx     — no-WebGL/reduced-motion version of the above (IO-driven fades)
```

`AnonymousApp.tsx` gains one lazy route: `<Route path="/experience" element={<Experience />} />`,
independent of the existing `/` marketing site so both can be compared before switching over.
