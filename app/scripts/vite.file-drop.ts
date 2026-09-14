/**
 * The build `npm run check:file-drop` drives. The ordinary config with one entry swapped:
 * `scripts/file-drop.html`, which mounts the drop zone alone.
 *
 * A separate entry rather than a route in the app, for the same reason the date-clear
 * harness gives: reaching the attach control through Maintenance needs a request, and the
 * stub repository refuses every maintenance read ("Maintenance needs Supabase."), so the
 * drawer that holds the control never renders anything to drop onto.
 */
import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vite";
import base from "../vite.config.ts";

const entry = fileURLToPath(new URL("./file-drop.html", import.meta.url));

export default defineConfig(async env => {
  const resolved = typeof base === "function" ? await (base as (e: typeof env) => unknown)(env) : base;
  return mergeConfig(resolved as Record<string, unknown>, {
    build: { rollupOptions: { input: entry } }
  });
});
