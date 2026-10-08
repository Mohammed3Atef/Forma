import type { Config } from 'tailwindcss';

/**
 * Forma design system (v2) — dark-mode-first, warm charcoal surface + orange→gold
 * brand ramp. Source of truth: the Claude Design "Forma Prototype" project
 * (forma/ds.css) — re-bases the previous cool-gray palette onto a warm scale
 * sampled from the logo, while keeping every existing token *name* stable so
 * nothing downstream needs renaming (see src/theme/colors.ts + src/index.css).
 *
 * The cool default `slate` scale is warm-shifted here so any legacy
 * `slate-*` reference still renders on-brand (warm neutrals on black).
 */
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // B1.2 semantic tokens — the ONLY colours new components use (values in
        // src/styles/tokens.css). Legacy keys below keep existing screens rendering.
        ui: {
          bg: 'rgb(var(--ui-bg) / <alpha-value>)',
          surface: 'rgb(var(--ui-surface) / <alpha-value>)',
          raised: 'rgb(var(--ui-surface-raised) / <alpha-value>)',
          interactive: 'rgb(var(--ui-surface-interactive) / <alpha-value>)',
          'border-subtle': 'var(--ui-border-subtle)',
          border: 'var(--ui-border)',
          'border-strong': 'var(--ui-border-strong)',
          primary: 'rgb(var(--ui-text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--ui-text-secondary) / <alpha-value>)',
          muted: 'rgb(var(--ui-text-muted) / <alpha-value>)',
          accent: 'rgb(var(--ui-accent) / <alpha-value>)',
          'accent-hover': 'rgb(var(--ui-accent-hover) / <alpha-value>)',
          'accent-pressed': 'rgb(var(--ui-accent-pressed) / <alpha-value>)',
          'accent-ink': 'rgb(var(--ui-accent-ink) / <alpha-value>)',
          success: 'rgb(var(--ui-success) / <alpha-value>)',
          warning: 'rgb(var(--ui-warning) / <alpha-value>)',
          error: 'rgb(var(--ui-error) / <alpha-value>)',
          info: 'rgb(var(--ui-info) / <alpha-value>)',
          offline: 'rgb(var(--ui-offline) / <alpha-value>)',
          syncing: 'rgb(var(--ui-syncing) / <alpha-value>)',
          conflict: 'rgb(var(--ui-conflict) / <alpha-value>)',
          focus: 'rgb(var(--ui-focus-ring) / <alpha-value>)',
        },
        black: '#000000',
        ink: '#0C0A09',
        // App surfaces — layered warm charcoal (depth: bg → sunken → card → raised → hover → strong)
        surface: {
          DEFAULT: '#0C0A09', // primary app background
          sunken: '#141110', // nav rails / recessed panels
          card: '#141110', // cards
          raised: '#1B1714', // raised card — inputs, inner tiles, steppers
          hover: '#241E1A', // interactive hover surface
          strong: '#2E2621', // high-contrast neutral fill — switch tracks, empty bar/progress fills
        },
        panel: {
          DEFAULT: '#141110',
          soft: '#1B1714',
        },
        // Brand accent — Forma orange→gold ramp (logo). Orange guides attention (primary
        // actions, active nav/tabs, links, focus); gold is a sparing premium accent.
        brand: {
          DEFAULT: '#FF8B02', // primary orange — accents, active states, links, focus ring on charcoal
          hover: '#FFB208', // lighter — interactive hover on dark
          dark: '#C8440A', // deep orange — gradient base / AA-safe fill
          pressed: '#FF4C01', // pressed/active fill
          light: '#FFC94D', // soft accent / lighter on dark
          ink: '#1A0E05', // near-black text for bright gradient-filled surfaces (buttons, active tabs)
        },
        copper: '#FF8B02', // legacy alias → primary
        sienna: '#C8440A', // → deep orange
        gold: '#FFB627', // gradients / chart highlights / premium + revenue badges — SPARING
        accent: '#FFC94D', // → brand.light
        // Warm neutrals (premium SaaS greys, re-based warm instead of cool)
        earth: {
          DEFAULT: '#F8F4F1', // primary text
          muted: '#ABA19B', // secondary text
          subtle: '#948A83', // tertiary text — meets WCAG AA (4.5:1) on every surface tier
          faint: '#6F6660', // placeholder / least-emphasis text
        },
        // Flattened-to-solid equivalents of the design's translucent warm-white
        // borders (rgba(255,238,228,<alpha>) over the new bg) — kept as solid hex
        // so Tailwind's `/opacity` modifier (already used in several call sites)
        // keeps working the same way it did with the previous solid line colors.
        line: {
          DEFAULT: '#2E2A28', // standard visible border (was the ~.14 alpha tier)
          soft: '#221F1D', // subtle dividers (~.09 alpha tier)
          strong: '#413C39', // emphasised border — hover states on interactive cards (~.22 alpha tier)
        },
        success: {
          DEFAULT: '#3FB27F', // single "ok" green — text/border/tint and solid fills alike
          light: '#3FB27F',
        },
        danger: '#F0483E', // unchanged — already matched the new spec's --bad
        warn: '#F5A623', // unchanged — already matched the new spec's --warn
        info: '#5B8DEF', // informational blue (distinct from brand orange)
        // Data-differentiation accents (macro breakdowns, chart series) — sparing use
        violet: '#8B7CF0',
        teal: '#2FB8B0',
        rose: '#EF5D8F',
        // Public website (src/pages/website) — the design's translucent tiers, kept
        // translucent (not flattened like `line.*`) because the site layers them over
        // gradients and glows. Everything else on the site uses the app tokens above.
        site: {
          line: 'rgba(255,238,228,0.09)', // --line
          line2: 'rgba(255,238,228,0.14)', // --line-2
          line3: 'rgba(255,238,228,0.22)', // --line-3
          tint: 'rgba(255,238,228,0.06)', // quiet fills (mute pills, secondary mock buttons)
          tx3: '#7C726C', // tertiary text
          tx4: '#564E49', // faintest text (footer legal line, placeholders)
          'brand-tint': 'rgba(255,139,2,0.13)',
          'ok-tint': 'rgba(63,178,127,0.14)',
          'warn-tint': 'rgba(245,166,35,0.14)',
          'bad-tint': 'rgba(240,72,62,0.14)',
          'info-tint': 'rgba(91,141,239,0.14)',
          'violet-tint': 'rgba(139,124,240,0.14)',
        },
        // Cool slate scale (overrides Tailwind default; dark anchors match the new warm surfaces)
        slate: {
          50: '#faf8f7',
          100: '#f3f0ee',
          200: '#e8e2df',
          300: '#cbc2bc',
          400: '#ABA19B',
          500: '#7C726C',
          600: '#2E2A28',
          700: '#241E1A',
          800: '#1B1714',
          900: '#141110',
          950: '#0C0A09',
        },
      },
      backgroundImage: {
        'ui-accent': 'var(--ui-accent-gradient)',
        'gradient-brand': 'linear-gradient(135deg, #FFB208 0%, #FF8B02 48%, #FF4C01 100%)',
        'gradient-brand-soft': 'linear-gradient(135deg, rgba(255,178,8,0.16), rgba(255,76,1,0.06))',
        'gradient-surface': 'linear-gradient(160deg, #1C1815 0%, #141110 100%)',
        'gradient-surface-hi': 'linear-gradient(160deg, #26201C 0%, #181412 100%)',
        'gradient-halo': 'radial-gradient(60% 70% at 78% 8%, rgba(255,139,2,0.16), transparent 70%)',
        'gradient-line': 'linear-gradient(120deg, rgba(255,178,8,0.5), rgba(255,76,1,0.12) 60%, transparent)',
        'gradient-gold': 'linear-gradient(135deg, #FFD277, #FFB627 55%, #E58A0C)',
      },
      fontFamily: {
        sans: ['Poppins', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        display: ['Poppins', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['DM Mono', 'ui-monospace', 'SF Mono', 'Menlo', 'monospace'],
        serif: ['Lora', 'Georgia', 'Times New Roman', 'serif'],
        // B1.8 / RTL-01: one Arabic face shared with the approved website (Cairo stays as fallback).
        arabic: ['IBM Plex Sans Arabic', 'Cairo', 'system-ui', 'sans-serif'],
        // Public website's Arabic face (the design's --f-ar).
        'site-ar': ['IBM Plex Sans Arabic', 'Poppins', 'sans-serif'],
      },
      borderRadius: {
        // B1.2 — four radius levels for new components.
        'ui-control': 'var(--ui-radius-control)',
        'ui-surface': 'var(--ui-radius-surface)',
        'ui-surface-lg': 'var(--ui-radius-surface-lg)',
        'ui-pill': 'var(--ui-radius-pill)',
        xl2: '18px', // cards
        hero: '20px',
        sheet: '30px', // mobile bottom sheet — matches the new spec's --r-2xl
      },
      boxShadow: {
        // B1.2 — elevation only where something floats.
        'ui-menu': 'var(--ui-shadow-menu)',
        'ui-sheet': 'var(--ui-shadow-sheet)',
        'ui-dialog': 'var(--ui-shadow-dialog)',
        'ui-sticky': 'var(--ui-shadow-sticky)',
        card: '0 1px 2px rgba(0,0,0,0.4), 0 4px 14px rgba(0,0,0,0.34)',
        elevated: '0 4px 14px rgba(0,0,0,0.34), 0 12px 34px rgba(0,0,0,0.44)',
        featured: '0 12px 34px rgba(0,0,0,0.44), inset 0 1px 0 rgba(255,238,228,0.06)',
        glow: '0 10px 30px rgba(255,110,2,0.24)',
        deep: '0 28px 70px rgba(0,0,0,0.55)',
        // Public website elevation tiers (design --e-2 / --e-3 / --e-inset) — the
        // app's `card`/`elevated` combine tiers, the site uses them singly.
        'site-2': '0 4px 14px rgba(0,0,0,0.34)',
        'site-3': '0 12px 34px rgba(0,0,0,0.44)',
        'site-inset': 'inset 0 1px 0 rgba(255,238,228,0.06)',
      },
      transitionTimingFunction: {
        card: 'cubic-bezier(0.16, 1, 0.3, 1)',
        ui: 'var(--ui-ease)',
        'ui-emphasized': 'var(--ui-ease-emphasized)',
      },
      transitionDuration: {
        'ui-fast': 'var(--ui-dur-fast)',
        'ui-base': 'var(--ui-dur-base)',
        'ui-slow': 'var(--ui-dur-slow)',
      },
      spacing: {
        // B1.2 semantic steps (responsive values live in tokens.css).
        'ui-gutter': 'var(--ui-gutter)',
        'ui-section': 'var(--ui-section)',
        'ui-stack': 'var(--ui-stack)',
        'ui-inset': 'var(--ui-inset)',
        'ui-inset-compact': 'var(--ui-inset-compact)',
        'ui-hit': 'var(--ui-hit)',
        'ui-hit-workout': 'var(--ui-hit-workout)',
        'ui-dense': 'var(--ui-control-dense)',
      },
      zIndex: {
        'ui-sticky': 'var(--ui-z-sticky)',
        'ui-header': 'var(--ui-z-header)',
        'ui-nav': 'var(--ui-z-nav)',
        'ui-banner': 'var(--ui-z-banner)',
        'ui-task': 'var(--ui-z-task)',
        'ui-overlay': 'var(--ui-z-overlay)',
        'ui-toast': 'var(--ui-z-toast)',
        'ui-dialog': 'var(--ui-z-dialog)',
        'ui-media': 'var(--ui-z-media)',
        'ui-palette': 'var(--ui-z-palette)',
      },
      minHeight: {
        'ui-hit': 'var(--ui-hit)',
        'ui-hit-workout': 'var(--ui-hit-workout)',
      },
      minWidth: {
        'ui-hit': 'var(--ui-hit)',
      },
    },
  },
  plugins: [],
};

export default config;
