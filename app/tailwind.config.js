/**
 * Tailwind, for the vendored report builder and nothing else.
 *
 * The app is built on Vibe and its own CSS; it has never used Tailwind and this does not
 * change that. The report-builder module ships Tailwind utility classes, and its
 * integration guide offers two ways to live with that in an app like this one: restyle
 * two thousand lines of `components/`, or add a preflight-free Tailwind build for those
 * files. This is the second, because the first turns every re-sync from the module into
 * a merge.
 *
 * TWO SETTINGS CARRY THE WHOLE ARRANGEMENT, AND BOTH MATTER
 *
 * `content` is only `src/features/reports`. Tailwind emits a class when it finds the
 * name in a scanned file, so scanning the rest of `src` would start generating utilities
 * from words that happen to appear in Vibe class names and comments.
 *
 * `preflight: false` keeps Tailwind's global reset out of the app. Preflight unstyles
 * every heading, list and button on the page — it would land on Vibe's components, not
 * just on the builder's, and the builder renders into a portal on `document.body` where
 * there is nothing to scope it to. What preflight would otherwise have provided is
 * supplied deliberately in `src/features/reports/reports.css`, scoped to the builder.
 */
export default {
  content: ['./src/features/reports/**/*.{js,jsx}'],
  corePlugins: {
    preflight: false
  },
  theme: {
    extend: {}
  },
  plugins: []
};
