/**
 * PostCSS exists here for one reason: Tailwind, for the vendored report builder.
 *
 * Vite reads this file for every stylesheet in the app, so it is deliberately one
 * plugin. Tailwind is a no-op on a file with no `@tailwind` directive in it, which is
 * every stylesheet here except `src/features/reports/reports.css` — the app's own CSS
 * comes out of the build byte for byte as it went in.
 *
 * No autoprefixer, and that is a choice rather than an omission: nothing in this app's
 * CSS needs a prefix for the browsers it supports, and adding it would rewrite every
 * existing stylesheet for the sake of one new one.
 */
export default {
  plugins: {
    tailwindcss: {}
  }
};
