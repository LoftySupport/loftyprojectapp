/**
 * The build `npm run check:builder-dnd` drives. The ordinary config with one entry
 * swapped: `scripts/builder-dnd.html`, which mounts the builder alone.
 *
 * A separate entry rather than a route in the app, because reaching the builder through
 * the app needs a session and a document, and therefore Supabase — which is exactly what
 * stopped the first attempt at this check ("Creating a document needs Supabase.").
 */
import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vite";
import base from "../vite.config.ts";

const entry = fileURLToPath(new URL("./builder-dnd.html", import.meta.url));

export default defineConfig(async env => {
  const resolved = typeof base === "function" ? await (base as (e: typeof env) => unknown)(env) : base;
  return mergeConfig(resolved as Record<string, unknown>, {
    build: { rollupOptions: { input: entry } }
  });
});
