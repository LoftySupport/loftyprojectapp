/**
 * The build `npm run check:date-clear` drives. The ordinary config with one entry
 * swapped: `scripts/date-clear.html`, which mounts the two date controls alone.
 *
 * A separate entry rather than a route in the app, for the reason the builder's harness
 * gives and one more: reaching the job's completion date through the app needs a job,
 * and the stub repository refuses every write ("Editing a job needs Supabase."). So the
 * field reverts on the spot and the check can never see a date land — which is exactly
 * what happened the first time this was measured through the responsive harness.
 */
import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vite";
import base from "../vite.config.ts";

const entry = fileURLToPath(new URL("./date-clear.html", import.meta.url));

export default defineConfig(async env => {
  const resolved = typeof base === "function" ? await (base as (e: typeof env) => unknown)(env) : base;
  return mergeConfig(resolved as Record<string, unknown>, {
    build: { rollupOptions: { input: entry } }
  });
});
