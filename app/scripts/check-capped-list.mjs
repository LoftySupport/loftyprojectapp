/**
 * CappedList shows the first five and offers the rest.
 *
 * Amber, 7 September: "when there is more than 5 of anything have the ability to click to
 * show all as otherwise too many". The logic is four lines and every one of them is an
 * off-by-one waiting to happen, so it is asserted rather than eyeballed.
 *
 * IT COULD NOT BE PROVED THROUGH THE APP, which is why this exists. The responsive stub's
 * fixtures carry no comments and no tasks at all, so every capped list rendered zero rows
 * and the button never appeared — a browser check would have reported "no capped rows" and
 * looked like a pass. There is no test runner in this repo, so the component is built with
 * Vite and rendered with react-dom/server, which is the smallest thing that actually
 * exercises it.
 *
 * Both failure modes were watched: `>=` instead of `>` (a list of exactly five gets a
 * button that hides nothing) and labelling the remainder instead of the total ("Show all 2"
 * on a list of seven).
 *
 *   node scripts/check-capped-list.mjs
 */
import { renderToStaticMarkup } from "react-dom/server";
import { createElement as h } from "react";
import { writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { build } from "vite";

const out = join(process.cwd(), ".capcheck-out");
await build({
  logLevel: "error",
  build: { lib: { entry: "src/components/CappedList.tsx", formats: ["es"], fileName: () => "c.js" },
           outDir: out, emptyOutDir: true, rollupOptions: { external: ["react", "react-dom"] } },
  esbuild: { jsx: "automatic" }
});
writeFileSync(join(out, "package.json"), JSON.stringify({ type: "module" }));
const { CappedList } = await import(join(out, "c.js"));

const row = (n) => h("p", { key: n }, `item-${n}`);
const render = (count, cap, noun) =>
  renderToStaticMarkup(h(CappedList, { items: Array.from({ length: count }, (_, i) => i), cap, noun }, row));

let fails = 0;
const check = (name, cond, got) => {
  console.log(`  ${cond ? "ok " : "FAIL"} ${name}${cond ? "" : ` — got: ${got}`}`);
  if (!cond) fails++;
};

const seven = render(7, undefined, "comments");
check("7 items with the default cap shows 5", (seven.match(/item-/g) || []).length === 5, (seven.match(/item-/g)||[]).length);
check("the button counts the TOTAL, not the remainder", seven.includes("Show all 7 comments"), seven.slice(-120));

const five = render(5, undefined, "comments");
check("exactly 5 shows all 5", (five.match(/item-/g) || []).length === 5, (five.match(/item-/g)||[]).length);
check("exactly 5 shows NO button", !five.includes("capped-more"), "button present");

const none = render(0);
check("0 items renders nothing", !none.includes("item-") && !none.includes("capped-more"), none);

const noNoun = render(9, 2);
check("cap is overridable", (noNoun.match(/item-/g) || []).length === 2, (noNoun.match(/item-/g)||[]).length);
check("no noun still labels", noNoun.includes("Show all 9<"), noNoun.slice(-80));

await rm(out, { recursive: true, force: true });
if (fails) {
  console.error(`\n${fails} CappedList assertion${fails === 1 ? "" : "s"} failed.`);
  process.exit(1);
}
console.log(`\nCappedList holds — ${7} assertions.`);
