import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
  define: {
    __BUILD_REF__: JSON.stringify((process.env.COMMIT_REF ?? "").slice(0, 7) || "local"),
    __BUILD_CONTEXT__: JSON.stringify(process.env.CONTEXT ?? "local")
  }
})
