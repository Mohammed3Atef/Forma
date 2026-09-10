# MyRocky Design System

A design system for **MyRocky**, a Canadian (expanding to US) premium health & longevity brand — biological-age testing, NAD+ therapy, semaglutide programs, hair loss & sexual health care, supplements, and personalized longevity plans.

- **Canada site**: [myrocky.ca](https://myrocky.ca) · **USA site**: [myrocky.com](https://myrocky.com)
- **Asset CDN**: `myrocky.b-cdn.net` (unreachable from this sandbox — placeholders in use)
- **Design reference**: Figma *"MyRocky Website — Longevity-Dark"* pages + timeline.com editorial DNA

## Sources
Authored from:
- `uploads/CLAUDE.md` — project architecture / deploy / standards
- `uploads/DESIGN.md` — design tokens spec
- Mounted Figma file (87 pages, 5,346 frames). Primary surface: **Longevity-Dark** landing — the canonical direction. The product-pages sub-world (Hair / Semaglutide / Sexual Health) shares tokens but uses a lighter palette; that's a derivative treatment documented in the Caveats.

## 1. Brand snapshot

| | |
|---|---|
| Positioning | Premium, science-backed longevity & men's-health platform for health-conscious Canadians. |
| Voice | Editorial. Confident. Warm. Scientific without being clinical. |
| Proof | 5,875+ Canadians served · doctor-reviewed · HSA/FSA eligible · free shipping · NBA · Blue Jays · Maple Leafs · Argonauts |

## 2. Content fundamentals

**Tone**: confident, premium, understated. Like a well-edited health magazine — never shouty, never emoji-driven, never clinical-sterile.

**Signature copy patterns**
- *"Your body is aging."* followed by italic copper *"Now you can measure it."*
- *"BOOK YOUR TEST →"* — CTAs are **action-verb-led, ALL-CAPS in DM Mono**, with arrow suffix
- *"5,875+ Canadians trust MyRocky"* — numbers do the talking
- *"43 biomarkers. 1 biological age."* — short, declarative, numerical

**Casing**
- **Headlines**: sentence case. Almost never all-caps.
- **UI labels / buttons / nav / eyebrows**: ALL-CAPS in **DM Mono**, letter-spacing 0.02–0.08em. This is the signature.
- **Trust fragments**: ALL-CAPS DM Mono with ` · ` separators — *"HSA/FSA ELIGIBLE · FREE SHIPPING · 60-DAY GUARANTEE"*.

**Italic-for-emotion pattern** (signature) — a declarative sentence + italic **copper** emotional pivot:
> "Your body is aging. *Now you can measure it.*"
> "Hair loss is common. *You don't have to accept it.*"

Italic pivots use Poppins 400 italic in copper (`#AE7E56`); they appear mid-headline, never as standalone lines.

**Pronouns**: second-person "you/your". "We" appears only in supporting copy.

**Not used**: emoji, exclamation points, gendered assumptions beyond product-specific copy, rhetorical-question headlines, buzzwords ("revolutionary", "cutting-edge").

**Section rhythm**: every section follows `statement → supporting detail → visual proof → CTA`.

## 3. Visual foundations

### Surface palette (dark-mode-first)
The Longevity landing is **black-on-black**. Alternate dark surfaces create rhythm; cream is secondary.

- **Black** `#000000` — primary surface across hero, editorial, stats, pricing, CTA, footer
- **Promo-bar dark brown** `#261D17` — fixed top partner banner only
- **Panel dark** `#111111` — raised cards on black
- **Cream** `#F0EEEA` — secondary / testimonials surface
- **Sand** `#F7F5F2`, **Card** `#FFFFFF` — alternate light surfaces (app UI)
- Sections *alternate* dark ↔ light for rhythm — never three of the same in a row.

### Brand accent — copper
- **Copper** `#AE7E56` is the *only* brand accent. Used on: italic emotional subheads, "m" logo mark, featured price-card borders, eyebrows, progress fills, CTA alt style.
- **Copper hover** `#C4915F`, **Copper soft** `#C69975`, **Gold** `#D4A46A`, **Earth deep** `#5C3A2A`.

### Earth neutrals (dark-mode text)
- **Earth warm** `#E6E2DC` — secondary text & dividers on black (critical token — replaces pure white for body).
- `rgba(230,226,220, 0.6 / 0.4 / 0.2)` — muted / subtle / divider alphas.
- Stat cards: **Success-dark** `#2E5D3C` (bio age) vs **Earth warm** (chrono age) — dual-tone pattern.

### Absolutely no cold colors
No blues, no purples, no neon. Greens are strictly success-semantic.

### Typography
- **Poppins** — display, body, headlines, editorial. `font-display: Poppins 700, -0.03em tracking, line-height 1.02` is the signature display setting.
- **DM Mono** — **UI labels, buttons, nav, eyebrows, trust lines, footer headings, stat labels**. 14px / weight 500 / letter-spacing 0–0.08em. This is the system's *most distinctive* element — use it wherever you'd reach for a sans UI label.
- **Lora italic** — editorial accent for pull-quotes and testimonial quotes only. Never for headlines or body.
- Italic emotional pivot: Poppins 400 italic in copper — *not* Lora (Lora is reserved for quotation blocks).

| Token | Setting |
|---|---|
| Display H1 | Poppins 700 · clamp(40–64px) · 1.02 · −0.03em |
| Section H2 | Poppins 700 · clamp(32–48px) · 1.1 · −0.03em |
| Editorial | Poppins 500 · clamp(26–36px) · 1.3 · −0.02em |
| Card H3 | Poppins 500 · 24px · 1.2 · −0.02em |
| Body | Poppins 400 · 16px · 1.55 |
| UI label | DM Mono 500 · 14px |
| Eyebrow | DM Mono 500 · 12px · 0.06em UPPERCASE · copper |
| Stat | Poppins 600 · clamp(48–72px) · 0.95 · −0.04em |
| Pull quote | Lora 400 italic |

### Spacing
8px base grid. Section vertical padding: **140px** on dark surfaces, **120px** on cream. Content max-widths: **1300px** hero/footer, **900px** editorial/stats/pricing.

### Dividers
On **light** surfaces: `1px dotted #CFCCC6`. On **dark** surfaces: `1px solid rgba(230,226,220,0.2)`. Both are signature — do not replace with heavy rules.

### Backgrounds
- Flat color fills. No gradient backgrounds on content surfaces.
- Permitted gradients: hero card (`linear-gradient(145deg, #3a3d2e 0%, #262820 60%, #18180f 100%)`), hero overlay (radial copper glow + radial olive glow on black).
- Photography is warm-toned, natural, lifestyle — never stock, clinical, or blue-tinted.

### Iconography
- **Carbon Icons** family (2px stroke, round caps/joins). CDN substitute: **Lucide** (linked from unpkg — visually very close). For production, swap to `@carbon/icons` or export from Figma.
- Icons inherit text colour (`currentColor`). Never filled copper.
- Unicode used: `→` (button arrows), `★` (ratings), `✓` (checklists), `·` (separators). No emoji.

### Logo
Two-part: circular copper **"m" mark** (Poppins 700 italic, tight tracking, black text on copper circle) + wordmark **"my**rocky**"** (DM Mono with copper "rocky" highlight). Files: `assets/logos/my-rocky-black.svg`, `assets/logos/my-rocky-white.svg` — *placeholders*. Production uses raster `.webp` from `myrocky.b-cdn.net/WP Images/Global Images/`; swap on deploy.

### Buttons
- All pill-shaped (100px radius), DM Mono 500, 14px, UPPERCASE, 0.02em tracking.
- `primary-light` (white-on-black, used on dark surfaces), `primary-dark` (black-on-light), `outline-light`, `outline-dark`, `copper` (for featured / upgrade).
- Arrow suffix `→` translates right 3px on hover.

### Cards & radii
Small images 12px · cards / price cards / testimonials **16px** · hero card 16px · bio tiles 12px · pills 100px · phone mockup 36px outer / 26px screen.

### Shadows (warm-tinted, restrained)
- Card hover: `0 16px 48px rgba(0,0,0,0.08)` (light) / `0 16px 48px rgba(0,0,0,0.3)` (dark)
- Featured copper glow: `0 4px 24px rgba(174,126,86,0.15)`
- Phone: `0 40px 80px rgba(0,0,0,0.3), inset 0 0 0 2px rgba(255,255,255,0.1)`

### Animation
- Easing: `cubic-bezier(0.16, 1, 0.3, 1)` over 0.5s. Gentle, editorial.
- Card hover: `translateY(-6px)` + shadow bloom.
- Floating data cards: 3–6s infinite bob.
- No springs, no bounces, no swooshes.

## 4. Index

```
├── README.md                  ← this file
├── SKILL.md                   ← agent-skill entrypoint
├── colors_and_type.css        ← CSS vars for colour + type (import this)
├── assets/logos/              ← wordmark SVGs + NBA partner logo
├── preview/                   ← Design System tab cards
└── ui_kits/
    ├── website/               ← Longevity-Dark marketing site
    └── app/                   ← MyRocky mobile app (Poppins-primary)
```

## 5. Caveats

1. **Product-page sub-world.** The Figma file also contains an e-commerce product-page surface (Hair Loss, Semaglutide, Sexual Health) that uses lighter backgrounds and leans on the same Poppins/DM Mono/copper tokens. This kit covers the Longevity landing; product pages want their own page template layer.
2. **CDN assets unreachable.** Production logos + photography live on `myrocky.b-cdn.net`; swap placeholders before deploy.
3. **Fellix TRIAL substitution.** The original Figma dark page uses **Fellix TRIAL** for display headlines. Fellix is a licensed foundry face. This system substitutes **Poppins 700 with −0.03em tracking**, which matches Fellix's geometric stance closely. If strict fidelity matters, license Fellix from Sharp Type and swap `--font-display`.
4. **Icon family.** Lucide stands in for Carbon Icons — very close visually. For production, switch to `@carbon/icons` or Figma-exported SVGs.
5. **Content depth.** Checkout, Consultations, Longevity results report, and the Patient Portal exist in Figma but are not built into these kits yet.
