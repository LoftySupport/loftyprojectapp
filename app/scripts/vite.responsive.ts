/**
 * The dev server the responsive check measures. Not the one anybody develops against.
 *
 * It is the ordinary config with one alias: every import of `AuthProvider` resolves to
 * `scripts/signed-in-stub.tsx` instead of `src/data/AuthProvider.tsx`, so a headless
 * browser gets past the sign-in gate and can reach the screens. Nothing else changes.
 *
 * The regex matches the whole specifier rather than a trailing fragment. A partial match
 * leaves the unmatched prefix in place — `../data/AuthProvider` became
 * `../data/home/user/.../signed-in-stub.tsx` and failed to resolve, which is worth
 * writing down because the error it produces ("Does the file exist?") points at the
 * wrong file entirely.
 */
import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vite";
import base from "../vite.config.ts";

const stub = fileURLToPath(new URL("./signed-in-stub.tsx", import.meta.url));

/**
 * A second alias, for the same reason as the first: the sweep can only measure what it
 * can draw. `stubRepository` answers empty for the tracker by design, so the six
 * `?view=` routes each rendered one line of "nothing to place yet" and the sweep passed
 * without ever laying out a wide table, a multi-month timeline or a full month grid.
 *
 * `tracker-fixtures.ts` re-exports `createStubRepository` with those three reads
 * populated — visible only to this build, never to the app.
 */
const fixtures = fileURLToPath(new URL("./tracker-fixtures.ts", import.meta.url));

export default defineConfig(async env => {
  const resolved = typeof base === "function" ? await (base as (e: typeof env) => unknown)(env) : base;
  return mergeConfig(resolved as Record<string, unknown>, {
    resolve: {
      alias: [
        { find: /^.*\/AuthProvider$/, replacement: stub },
        // EXACTLY `./stubRepository`, which is how both files inside `src/data` import
        // it — and deliberately NOT the `.*` shape used above. `tracker-fixtures.ts`
        // imports the real stub as `../src/data/stubRepository` in order to wrap it, and
        // a `.*` pattern would rewrite that import to the fixtures file itself: an alias
        // that resolves to its own source, which is an import cycle rather than an error
        // and shows up as a blank page.
        { find: /^\.\/stubRepository$/, replacement: fixtures }
      ]
    }
  });
});
