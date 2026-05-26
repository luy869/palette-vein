/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Midnight Glass パレット
        bg: '#0a0a14',
        surface: 'rgba(255,255,255,0.05)',
        'surface-hover': 'rgba(255,255,255,0.08)',
        border: 'rgba(255,255,255,0.10)',
        'border-accent': '#a78bfa',
        accent: '#a78bfa',
        'accent-dim': '#7c6af5',
        'accent-hover': '#c4b5fd',
      },
      backdropBlur: {
        xs: '4px',
      },
    },
  },
  plugins: [],
}
