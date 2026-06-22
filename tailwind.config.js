/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Single precise brand accent
        accent: {
          DEFAULT: '#00f5d4',
          dim: '#00bfae',
          glow: 'rgba(0, 245, 212, 0.15)',
        },
        // Muted slate scale for secondary labels / surfaces
        surface: {
          900: '#000000',
          850: '#070708',
          800: '#0c0d0f',
          700: '#141518',
          600: '#1c1e22',
          500: '#26282d',
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
