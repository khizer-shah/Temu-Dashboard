/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Semantic tokens backed by CSS variables (see index.css). Channels are
        // space-separated RGB so `<alpha-value>` opacity modifiers still work.
        // `white` = primary foreground, `black` = page background — both flip
        // per theme, so the existing class names need no changes.
        white: 'rgb(var(--c-fg) / <alpha-value>)',
        black: 'rgb(var(--c-bg) / <alpha-value>)',
        accent: {
          DEFAULT: 'rgb(var(--c-accent) / <alpha-value>)',
          dim: '#00bfae',
          glow: 'var(--c-accent-glow)',
        },
        slate: {
          200: 'rgb(var(--c-slate-200) / <alpha-value>)',
          300: 'rgb(var(--c-slate-300) / <alpha-value>)',
          400: 'rgb(var(--c-slate-400) / <alpha-value>)',
          500: 'rgb(var(--c-slate-500) / <alpha-value>)',
          600: 'rgb(var(--c-slate-600) / <alpha-value>)',
        },
        // Muted surface scale for secondary labels / surfaces
        surface: {
          900: 'rgb(var(--c-surface-900) / <alpha-value>)',
          850: 'rgb(var(--c-surface-850) / <alpha-value>)',
          800: 'rgb(var(--c-surface-800) / <alpha-value>)',
          700: 'rgb(var(--c-surface-700) / <alpha-value>)',
          600: 'rgb(var(--c-surface-600) / <alpha-value>)',
          500: 'rgb(var(--c-surface-500) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(0,245,212,0.25), 0 0 24px -8px rgba(0,245,212,0.35)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-out': {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        pulse_ring: {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out both',
        'fade-out': 'fade-out 0.3s ease-in forwards',
        'pulse-ring': 'pulse_ring 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
