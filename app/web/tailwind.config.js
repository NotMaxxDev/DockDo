/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: 'rgb(var(--c-primary) / <alpha-value>)',
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        bg: 'rgb(var(--c-background) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        ink: 'rgb(var(--c-text) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        line: 'rgb(var(--c-border) / <alpha-value>)',
        ok: 'rgb(var(--c-success) / <alpha-value>)',
        danger: 'rgb(var(--c-danger) / <alpha-value>)',
        warn: 'rgb(var(--c-warning) / <alpha-value>)'
      },
      borderRadius: {
        theme: 'var(--r-theme)'
      },
      spacing: {
        theme: 'var(--s-theme)'
      },
      fontFamily: {
        theme: 'var(--f-theme), ui-sans-serif, system-ui, sans-serif'
      }
    }
  },
  plugins: []
};