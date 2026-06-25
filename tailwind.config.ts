import type { Config } from 'tailwindcss';

/**
 * MyRocky design system — dark-mode-first, black surface + copper accent.
 * Source of truth: design_handoff_gym_tracker/design_files/colors_and_type.css
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
        black: '#000000',
        ink: '#0B0C0F',
        // App surfaces — layered premium charcoal (depth: bg → sunken → card → raised → hover)
        surface: {
          DEFAULT: '#0B0C0F', // primary app background — deep charcoal
          sunken: '#111318', // nav rails / secondary panels (recessed)
          card: '#15171C', // cards
          raised: '#1B1F26', // raised card — inputs, inner tiles, steppers
          hover: '#222832', // interactive hover surface
        },
        panel: {
          DEFAULT: '#15171C',
          soft: '#1B1F26',
        },
        // Brand accent — Forma orange→gold (logo). Orange guides attention (primary
        // actions, active nav/tabs, links, focus); gold is a sparing premium accent.
        brand: {
          DEFAULT: '#E5520F', // primary orange — accents, active states, links, focus ring on charcoal
          hover: '#F2611C', // lighter — interactive hover on dark
          dark: '#C8440A', // deep orange — AA-safe white-text fill (4.8:1) + gradient base
          pressed: '#B23C08', // pressed/active fill
          light: '#FF8A3D', // soft accent / lighter on dark
        },
        copper: '#E5520F', // legacy alias → primary
        sienna: '#C8440A', // → deep orange
        gold: '#FFB627', // gradients / chart highlights / premium + revenue badges — SPARING
        accent: '#FF8A3D', // → brand.light
        // Cool neutrals (premium SaaS greys on charcoal)
        earth: {
          DEFAULT: '#F5F5F5', // primary text
          muted: '#9CA3AF', // secondary text
          subtle: '#6B7280', // tertiary text
        },
        line: {
          DEFAULT: '#2E3642', // borders (solid, defined on charcoal)
          soft: '#20262E', // subtle dividers
        },
        success: {
          DEFAULT: '#2E5D3C', // dark muted green — completed set / "done"
          light: '#4CAF50',
        },
        danger: '#F0483E', // clear red — distinct from the orange brand (destructive ≠ primary)
        warn: '#F5A623', // amber — distinct from brand orange + gold
        // Admin "control center" system accent (cool indigo) — used sparingly,
        // copper remains the brand/primary action colour everywhere.
        system: {
          DEFAULT: '#6E7BF2',
          soft: 'rgba(110,123,242,0.14)',
        },
        // Cool slate scale (overrides Tailwind default; dark anchors match surfaces)
        slate: {
          50: '#f8fafc',
          100: '#f1f3f6',
          200: '#e6e9ee',
          300: '#cbd1d9',
          400: '#9CA3AF',
          500: '#6B7280',
          600: '#2E3642',
          700: '#222832',
          800: '#1B1F26',
          900: '#15171C',
          950: '#0B0C0F',
        },
      },
      fontFamily: {
        sans: ['Poppins', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        display: ['Poppins', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['DM Mono', 'ui-monospace', 'SF Mono', 'Menlo', 'monospace'],
        serif: ['Lora', 'Georgia', 'Times New Roman', 'serif'],
        arabic: ['Cairo', 'Tajawal', 'system-ui', 'sans-serif'],
      },
      spacing: {
        touch: '3.5rem', // 56px — gym-friendly large touch target
      },
      borderRadius: {
        xl2: '18px', // cards
        hero: '20px',
        sheet: '26px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.32)',
        elevated: '0 4px 12px rgba(0,0,0,0.4), 0 16px 40px rgba(0,0,0,0.45)',
        featured: '0 4px 24px rgba(229,82,15,0.16)',
        glow: '0 8px 28px rgba(229,82,15,0.42)',
        deep: '0 16px 48px rgba(0,0,0,0.3)',
      },
      transitionTimingFunction: {
        card: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
