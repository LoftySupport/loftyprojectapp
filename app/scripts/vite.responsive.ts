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

export default defineConfig(async env => {
  const resolved = typeof base === "function" ? await (base as (e: typeof env) => unknown)(env) : base;
  return mergeConfig(resolved as Record<string, unknown>, {
    resolve: { alias: [{ find: /^.*\/AuthProvider$/, replacement: stub }] }
  });
});
