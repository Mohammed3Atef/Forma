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
        ink: '#0a0a0a',
        // App surfaces
        surface: {
          DEFAULT: '#000000', // primary app surface (black)
          card: '#111111', // panel — cards on black
          raised: '#161616', // panel-2 — inputs, inner tiles, steppers
        },
        panel: {
          DEFAULT: '#111111',
          soft: '#161616',
        },
        // Brand accent — copper / earth-clay
        brand: {
          DEFAULT: '#AE7E56', // copper — signature mark
          dark: '#946640',
          light: '#C69975',
          hover: '#C4915F',
        },
        copper: '#AE7E56',
        sienna: '#BF6E4E',
        gold: '#D4A46A',
        accent: '#C69975',
        // Warm neutrals (text on black)
        earth: {
          DEFAULT: '#E6E2DC',
          muted: 'rgba(230,226,220,0.62)',
          subtle: 'rgba(230,226,220,0.40)',
        },
        line: {
          DEFAULT: 'rgba(230,226,220,0.12)',
          soft: 'rgba(230,226,220,0.07)',
        },
        success: {
          DEFAULT: '#2E5D3C', // dark muted green — completed set / "done"
          light: '#4CAF50',
        },
        danger: '#E08B6F',
        warn: '#D4A46A',
        // Warm-shifted slate scale (overrides Tailwind default cool slate)
        slate: {
          50: '#faf9f7',
          100: '#f3f1ed',
          200: '#e6e2dc',
          300: '#cbc6bc',
          400: '#9b968c',
          500: '#736f67',
          600: '#2c2c2a',
          700: '#1d1d1b',
          800: '#161616',
          900: '#111111',
          950: '#000000',
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
        card: '0 16px 48px rgba(0,0,0,0.3)',
        featured: '0 4px 24px rgba(174,126,86,0.15)',
        glow: '0 8px 28px rgba(174,126,86,0.45)',
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
