import type { Config } from 'tailwindcss';

// Monochrome tokens only (ARCHITECTURE.md §17 / §O) — no colour accents anywhere on the website. These map to
// the CSS variables defined in `src/app/globals.css` so both Tailwind utility classes (`bg-ink-2`, `text-grey-4`,
// ...) and raw CSS (`var(--ink-2)`) stay in sync with one source of truth.
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          0: 'var(--ink-0)',
          1: 'var(--ink-1)',
          2: 'var(--ink-2)',
          3: 'var(--ink-3)',
          4: 'var(--ink-4)',
          5: 'var(--ink-5)',
          6: 'var(--ink-6)',
          7: 'var(--ink-7)',
        },
        grey: {
          1: 'var(--grey-1)',
          2: 'var(--grey-2)',
          3: 'var(--grey-3)',
          4: 'var(--grey-4)',
          5: 'var(--grey-5)',
          6: 'var(--grey-6)',
          7: 'var(--grey-7)',
        },
        paper: 'var(--paper)',
      },
      fontFamily: {
        sans: ['ui-sans-serif', '-apple-system', '"Segoe UI"', 'Inter', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
