/**
 * The build `npm run check:import` drives — the ordinary config with one entry swapped.
 *
 * A page of its own rather than a route in the app, for the same reason
 * `vite.builder-dnd.ts` gives: reaching the builder through the app needs a session, and
 * this check is about a parser, not about signing in.
 */
import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vite";
import base from "../vite.config.ts";

const entry = fileURLToPath(new URL("./import.html", import.meta.url));

export default defineConfig(async env => {
  const resolved = typeof base === "function" ? await (base as (e: typeof env) => unknown)(env) : base;
  return mergeConfig(resolved as Record<string, unknown>, {
    build: { rollupOptions: { input: entry } }
  });
});
