/**
 * The contrast claims in DESIGN.md are arithmetic, so assert them.
 *
 * The design system moved the app's primary colour from Eco Green to Crisp Orange on
 * 6 September. Crisp Orange is the colour that made this check necessary: **white on
 * #f47e63 is 2.6:1 and fails AA**, which is exactly the kind of fact that gets lost when
 * somebody "fixes" the text colour on a primary button to white because it looks cleaner.
 *
 * Every pairing below is one this repo has written down as a reason. The numbers come out
 * of `src/design-system/tokens/`, not out of this file, so changing the mirror changes what
 * is measured — and the two `expect: "fail"` rows are the load-bearing ones. They assert
 * that a pairing we deliberately do NOT use is still as bad as we said it was; if one of
 * them ever passes, the palette moved and the reasoning in DESIGN.md needs revisiting.
 *
 *   node scripts/check-contrast.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const src = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const strip = (file) => readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Every `--name:value` in a file, flattened. Last declaration wins, as in CSS. */
function declarations(file) {
  const out = new Map();
  for (const m of strip(file).matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) out.set(m[1], m[2].trim());
  return out;
}

/**
 * Declarations inside one selector's block only.
 *
 * The app's theme layer declares --positive-ink twice — once light, once under the dark
 * body classes — so flattening the file would silently measure the dark ink against the
 * light tint and call it a pass. The selector has to be part of the question.
 */
function block(file, selector) {
  const css = strip(file);
  const at = css.indexOf(selector);
  const out = new Map();
  if (at === -1) return out;
  const body = css.slice(css.indexOf("{", at) + 1, css.indexOf("}", at));
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) out.set(m[1], m[2].trim());
  return out;
}

const tokens = join(src, "design-system", "tokens");
const themeCss = join(src, "theme", "tokens.css");

// The mirror holds the palette; the app's theme layer holds the values Vibe has no slot
// for — the three status inks. Both are needed to measure what a screen actually renders.
const light = new Map([
  ...declarations(join(tokens, "colors.css")),
  ...block(themeCss, ":root {")
]);
const dark = new Map([
  ...light,
  ...declarations(join(tokens, "dark.css")),
  ...block(themeCss, "body.dark-app-theme,\nbody.black-app-theme {")
]);

function resolve(name, vars, seen = new Set()) {
  if (seen.has(name)) throw new Error(`circular var reference at ${name}`);
  seen.add(name);
  const value = vars.get(name);
  if (value === undefined) throw new Error(`${name} is not declared in the mirror`);
  const ref = value.match(/^var\((--[\w-]+)\)$/);
  return ref ? resolve(ref[1], vars, seen) : value;
}

/** sRGB relative luminance, per WCAG 2.1. */
function luminance(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map(c => c + c).join("") : h;
  const [r, g, b] = [0, 2, 4].map(i => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/**
 * [foreground, background, floor, theme, why, known?]
 *
 * floor: 4.5 for text, 3.0 for a UI boundary, or "fail" for a pairing that must stay
 * unusable. `known` is an escape hatch with teeth: a pairing that does NOT meet its floor
 * today, recorded at its measured value. The check then asserts it has not got WORSE, and
 * prints it as a warning every run so it stays visible instead of becoming normal. Every
 * `known` here is an open question with the design system, listed in DESIGN.md — none of
 * them is a value this repo chose.
 */
const PAIRS = [
  // The decision the whole palette turns on.
  ["--text-color-on-primary", "--primary-color", 4.5, light, "ink on Crisp Orange — the primary button"],
  ["--lofty-finisher-white", "--primary-color", "fail", light, "WHITE on Crisp Orange — must stay a failure, it is why ink is used"],

  // Text on the page.
  ["--primary-text-color", "--primary-background-color", 4.5, light, "body text on white"],
  ["--secondary-text-color", "--primary-background-color", 4.5, light, "muted text on white"],
  ["--placeholder-color", "--primary-background-color", 4.5, light, "placeholder on white", 3.47],
  ["--primary-text-color", "--allgrey-background-color", 4.5, light, "body text on the grey surface"],
  ["--link-color", "--primary-background-color", 4.5, light, "a link at rest"],

  // Boundaries need 3:1, not 4.5:1 — and Mid Grey is why --ui-border-color is not Mid Grey.
  ["--ui-border-color", "--primary-background-color", 3.0, light, "a control boundary on white"],
  ["--lofty-mid-gray", "--primary-background-color", "fail", light, "Mid Grey as a control boundary — 1.5:1, which is why it is not used for one"],

  // Selection is tinted, and the text on it stays Foundation Black.
  ["--primary-text-color", "--primary-selected-color", 4.5, light, "text on a selected row"],

  // Status inks on their own tints. Vibe ships the tint but no ink that survives on it,
  // which is exactly why the app derives --positive-ink / --negative-ink / --warning-ink
  // in theme/tokens.css. Measure the pairing the app uses, not the one it avoids.
  ["--positive-ink", "--positive-color-selected", 4.5, light, "positive INK on its tint"],
  ["--negative-ink", "--negative-color-selected", 4.5, light, "negative INK on its tint"],
  ["--warning-ink", "--warning-color-selected", 4.5, light, "warning INK on its tint"],
  ["--negative-color", "--negative-color-selected", "fail", light, "negative at full strength on its own tint — why the ink exists"],

  // Dark.
  ["--primary-text-color", "--primary-background-color", 8.0, dark, "dark: body text on the surface"],
  ["--secondary-text-color", "--primary-background-color", 8.0, dark, "dark: muted text on the surface"],
  ["--text-color-on-primary", "--primary-color", 4.5, dark, "dark: ink on Crisp Orange"],
  ["--lofty-finisher-white", "--highlight-color", 4.5, dark, "dark: white on the lifted Eco Green", 4.26],
  ["--primary-text-color", "--allgrey-background-color", 8.0, dark, "dark: body text on the base"],
  ["--ui-border-color", "--primary-background-color", 3.0, dark, "dark: a control boundary", 2.28]
];

let failures = 0;
console.log("pairing".padEnd(64) + "ratio    floor");
console.log("-".repeat(84));

let warnings = 0;
for (const [fgName, bgName, floor, vars, why, known] of PAIRS) {
  const fg = resolve(fgName, vars);
  const bg = resolve(bgName, vars);
  if (!/^#[0-9a-f]{3,8}$/i.test(fg) || !/^#[0-9a-f]{3,8}$/i.test(bg)) {
    console.error(`  cannot measure ${why}: ${fg} on ${bg} is not a plain hex`);
    failures++;
    continue;
  }
  const r = ratio(fg, bg);
  const shown = r.toFixed(2).padStart(6);

  if (floor === "fail") {
    // This pairing must NOT be usable. If it became usable, a documented reason evaporated.
    const ok = r < 4.5;
    console.log(`${ok ? "  ✓" : "  ✗"} ${why}`.padEnd(64) + `${shown}   <4.5`);
    if (!ok) {
      console.error(`      ^ this now PASSES at ${r.toFixed(2)}:1. DESIGN.md says it must not.`);
      failures++;
    }
  } else if (known !== undefined) {
    // A recorded shortfall. It must not get worse; a small tolerance absorbs rounding.
    const ok = r >= known - 0.01;
    console.log(`${ok ? "  !" : "  ✗"} ${why}`.padEnd(64) + `${shown}   ≥${floor} — KNOWN SHORTFALL`);
    if (ok) warnings++;
    else {
      console.error(`      ^ was ${known}:1, now ${r.toFixed(2)}:1 — this got worse.`);
      failures++;
    }
  } else {
    const ok = r >= floor;
    console.log(`${ok ? "  ✓" : "  ✗"} ${why}`.padEnd(64) + `${shown}   ≥${floor}`);
    if (!ok) {
      console.error(`      ^ ${fg} on ${bg} is ${r.toFixed(2)}:1, below ${floor}`);
      failures++;
    }
  }
}

console.log("-".repeat(84));
if (failures) {
  console.error(`\n${failures} contrast assertion${failures === 1 ? "" : "s"} failed.`);
  process.exit(1);
}
if (warnings) {
  console.log(
    `\n${warnings} known shortfall${warnings === 1 ? "" : "s"} — open with the design system, ` +
    `listed under "Where the palette falls short" in DESIGN.md. Held at their current value, ` +
    `not accepted as correct.`
  );
}
console.log(`\n${PAIRS.length} pairings measured, none worse than DESIGN.md records.`);
