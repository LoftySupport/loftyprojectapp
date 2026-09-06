/**
 * loftyTheme.ts agrees with the design-system mirror.
 *
 * `src/design-system/tokens/colors.css` is the single place a Lofty hex is written down.
 * `src/theme/loftyTheme.ts` has to repeat eight of them as literal strings, because Vibe's
 * ThemeProvider takes a plain object and generates CSS from it — it cannot read a CSS custom
 * property. That duplication is the kind that goes stale silently: the design system changes,
 * the mirror is re-synced, and ThemeProvider keeps painting last month's brand inside its
 * wrapper while everything portaled out of it paints the new one. You would see it only as
 * "the modal's button is a slightly different orange".
 *
 * So: resolve the mirror's variables, resolve what loftyTheme.ts claims, and compare.
 *
 *   node scripts/check-design-tokens.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "src");

/** Every `--name:value` pair in a CSS file, flattened. Last declaration wins, as in CSS. */
function declarations(cssPath) {
  const css = readFileSync(cssPath, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const out = new Map();
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) out.set(m[1], m[2].trim());
  return out;
}

/** `var(--a)` chains down to a literal. Throws rather than guessing at a dangling name. */
function resolve(name, vars, seen = new Set()) {
  if (seen.has(name)) throw new Error(`circular var reference at ${name}`);
  seen.add(name);
  const value = vars.get(name);
  if (value === undefined) throw new Error(`${name} is not declared in the mirror`);
  const ref = value.match(/^var\((--[\w-]+)\)$/);
  return ref ? resolve(ref[1], vars, seen) : value.toLowerCase();
}

const light = declarations(join(src, "design-system", "tokens", "colors.css"));
const dark = new Map([...light, ...declarations(join(src, "design-system", "tokens", "dark.css"))]);

// What loftyTheme.ts must match, per theme, as mirror variable names.
const EXPECTED = {
  light: {
    "primary-color": "--lofty-crisp-orange",
    "primary-hover-color": "--lofty-orange-hover",
    "primary-selected-color": "--lofty-orange-selected",
    "primary-selected-hover-color": "--lofty-orange-selected-hover",
    "text-color-on-primary": "--lofty-ink",
    "brand-color": "--lofty-crisp-orange",
    "brand-hover-color": "--lofty-orange-hover",
    "text-color-on-brand": "--lofty-ink"
  },
  dark: {
    "primary-color": "--lofty-crisp-orange",
    "primary-hover-color": "--lofty-orange-dark-hover",
    "primary-selected-color": "--lofty-orange-dark-selected",
    "text-color-on-primary": "--lofty-dark-base",
    "brand-color": "--lofty-crisp-orange",
    "brand-hover-color": "--lofty-orange-dark-hover",
    "text-color-on-brand": "--lofty-dark-base"
  }
};

// loftyTheme.ts is TypeScript, so read the literals out of the source rather than importing
// it — this script must run under plain node with no transpiler in front of it.
const theme = readFileSync(join(src, "theme", "loftyTheme.ts"), "utf8");
function themeBlock(name) {
  const start = theme.indexOf(`${name}: {`);
  if (start === -1) throw new Error(`loftyTheme.ts has no "${name}" theme`);
  const block = theme.slice(start, theme.indexOf("}", start));
  const out = new Map();
  for (const m of block.matchAll(/"([\w-]+)"\s*:\s*"(#[0-9a-fA-F]{3,8})"/g)) out.set(m[1], m[2].toLowerCase());
  return out;
}

const problems = [];
for (const [themeName, expected] of Object.entries(EXPECTED)) {
  const actual = themeBlock(themeName);
  // "black" takes the same palette as "dark"; check it against the same expectations.
  const alsoCheck = themeName === "dark" ? ["black"] : [];
  for (const target of [themeName, ...alsoCheck]) {
    const got = target === themeName ? actual : themeBlock(target);
    for (const [token, mirrorVar] of Object.entries(expected)) {
      const want = resolve(mirrorVar, themeName === "dark" ? dark : light);
      const have = got.get(token);
      if (have === undefined) problems.push(`${target}.${token} is missing from loftyTheme.ts`);
      else if (have !== want) problems.push(`${target}.${token} is ${have}, mirror says ${want} (${mirrorVar})`);
    }
  }
}

if (problems.length) {
  console.error("loftyTheme.ts disagrees with src/design-system/tokens/:\n");
  for (const p of problems) console.error(`  ${p}`);
  console.error("\nThe mirror is the source of truth. Update loftyTheme.ts to match it.");
  process.exit(1);
}
console.log(`loftyTheme.ts matches the design-system mirror — ${Object.keys(EXPECTED.light).length} tokens across 3 themes.`);
