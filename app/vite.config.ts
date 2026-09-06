import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * The first of these that is actually set to something.
 *
 * `??` is wrong here and it was wrong in the first draft of this file: it falls through
 * only on null and undefined, so a variable that exists with an EMPTY value wins and the
 * next one is never read. A project setting defined with no value is an ordinary state on
 * Vercel, and a build carrying `VERCEL_ENV=""` would take the empty string as an answer —
 * the footer would say "local" on a real deployment and nobody would know which commit
 * they were looking at. Caught by a build that set it empty on purpose.
 */
const firstSet = (...values: (string | undefined)[]): string =>
  values.find(v => v != null && v.trim() !== "") ?? "";

// https://vite.dev/config/
export default defineConfig({
  // The app is the site now — served from the root, not a subfolder. The router's
  // basename and the OAuth redirectTo both read import.meta.env.BASE_URL, so this one
  // value is the only place the path is decided.
  base: "/",
  plugins: [react()],

  // The build identity the footer shows.
  //
  // Vercel is the only host. It sets VERCEL=1, VERCEL_ENV and VERCEL_GIT_COMMIT_SHA
  // during the build, and none of them is VITE_-prefixed, so Vite will not expose them
  // on its own — inlining them here is the whole reason this block exists.
  //
  // The commit is the version question anyone actually asks ("is what I am looking at
  // the fix?"), shortened to seven characters because that is what GitHub shows. A build
  // that cannot say which commit it is has lost the only question that footer exists for.
  //
  // "local" rather than a fake number when building outside Vercel: a version string that
  // looks real and is not is worse than one that admits what it is.
  //
  // __BUILD_HOST__ survives the move to a single host because it is not really about
  // which host — it is about whether the Vercel runtime is there. `npm run dev` and
  // `npm run preview` serve no /_vercel/speed-insights/script.js either, and a component
  // that asks for it there puts a 404 in the console and collects nothing for it.
  define: {
    __BUILD_REF__: JSON.stringify(firstSet(process.env.VERCEL_GIT_COMMIT_SHA).slice(0, 7) || "local"),
    __BUILD_CONTEXT__: JSON.stringify(firstSet(process.env.VERCEL_ENV) || "local"),
    __BUILD_HOST__: JSON.stringify(
      firstSet(process.env.VERCEL, process.env.VERCEL_ENV) ? "vercel" : "local"
    )
  }
})
