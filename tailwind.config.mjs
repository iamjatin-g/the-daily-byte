/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,ts}'],
  darkMode: ['class', '[data-theme="dark"]'],
  // The stylesheet has its own small reset (src/styles/global.css), so Tailwind's preflight is off.
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        paper: 'var(--paper)', ink: 'var(--ink)', muted: 'var(--ink-2)', rule: 'var(--rule)', accent: 'var(--accent)',
      },
    },
  },
  plugins: [],
};
