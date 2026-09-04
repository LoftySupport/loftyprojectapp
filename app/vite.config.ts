import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * The first of these that is actually set to something.
 *
 * `??` is wrong here and it was wrong in the first draft of this file: it falls through
 * only on null and undefined, so a variable that exists with an EMPTY value wins and the
 * next one is never read. A project setting defined with no value is an ordinary state on
 * both hosts, and on a build carrying `COMMIT_REF=""` the Vercel SHA beneath it would
 * never be looked at — the footer would say "local" on a real deployment and nobody would
 * know which commit they were looking at. Caught by a build that set it empty on purpose.
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
  // Netlify sets these during the build but they are not `VITE_` prefixed, so Vite will
  // not expose them on its own — inlining them here is the whole reason this block
  // exists. COMMIT_REF is the commit the deploy was built from, which is the version
  // question anyone actually asks ("is what I am looking at the fix?"). Shortened to
  // seven characters because that is what GitHub shows.
  //
  // "local" rather than a fake number when building outside Netlify: a version string
  // that looks real and is not is worse than one that admits what it is.
  // Both hosts' spellings, because the deploy is moving from Netlify to Vercel and for a
  // while it is on both. Netlify sets COMMIT_REF and CONTEXT; Vercel sets
  // VERCEL_GIT_COMMIT_SHA and VERCEL_ENV. Neither is VITE_-prefixed, so Vite will not
  // expose either on its own — inlining them here is the whole reason this block exists.
  //
  // Reading only Netlify's names on a Vercel build is not a cosmetic miss: the footer
  // would say "vlocal" on a real deployment, and the version string is there to answer
  // "is what I am looking at the fix?". A build that cannot say which commit it is has
  // lost the only question that footer exists for.
  //
  // WHICH host, as well as which context, because "production" is what both of them call
  // it and the two are not interchangeable to anything downstream. Speed Insights reports
  // to an endpoint Vercel serves and Netlify does not, so a build that cannot say where it
  // is running would either miss its own metrics or ask Netlify for a script that 404s.
  // Each host is read by two signals: the flag it sets (VERCEL=1, NETLIFY=true) and the
  // git variable already read above, so losing one of them does not make the build
  // anonymous.
  define: {
    __BUILD_REF__: JSON.stringify(firstSet(process.env.COMMIT_REF, process.env.VERCEL_GIT_COMMIT_SHA).slice(0, 7) || "local"),
    __BUILD_CONTEXT__: JSON.stringify(firstSet(process.env.CONTEXT, process.env.VERCEL_ENV) || "local"),
    __BUILD_HOST__: JSON.stringify(
      firstSet(process.env.VERCEL, process.env.VERCEL_ENV) ? "vercel"
        : firstSet(process.env.NETLIFY, process.env.CONTEXT) ? "netlify"
        : "local"
    )
  }
})
