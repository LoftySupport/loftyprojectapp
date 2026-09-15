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

/**
 * Every Vibe token name in loftyTheme.ts is also a semantic token in the mirror, spelled the
 * same with a `--` in front, so the mapping is derived rather than written down twice.
 *
 * An earlier version of this script hardcoded which *brand* variable each theme key should
 * equal (`"text-color-on-primary": "--lofty-ink"`). That is a third copy of a decision the
 * mirror already states, and it went stale the first time the design system moved: on
 * 7 September the brand rule became "never black on Crisp Orange", the mirror changed to
 * Finisher White, and this check went red pointing at the wrong file — it reported that
 * loftyTheme.ts disagreed with a mirror that in fact already agreed with it. Deriving the
 * mapping means a design change can only ever make this check fail for the real reason.
 */
const THEMES = ["light", "dark", "black"];
/** The mirror palette each theme resolves against; "black" shares dark's. */
const paletteFor = (theme) => (theme === "light" ? light : dark);

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
let compared = 0;
for (const themeName of THEMES) {
  const palette = paletteFor(themeName);
  for (const [token, have] of themeBlock(themeName)) {
    const mirrorVar = `--${token}`;
    if (!palette.has(mirrorVar)) {
      problems.push(`${themeName}.${token} is not a token the mirror declares (${mirrorVar})`);
      continue;
    }
    const want = resolve(mirrorVar, palette);
    compared++;
    if (have !== want) problems.push(`${themeName}.${token} is ${have}, mirror says ${want} (${mirrorVar})`);
  }
}

if (problems.length) {
  console.error("loftyTheme.ts disagrees with src/design-system/tokens/:\n");
  for (const p of problems) console.error(`  ${p}`);
  console.error("\nThe mirror is the source of truth. Update loftyTheme.ts to match it.");
  process.exit(1);
}
if (!compared) {
  console.error("check-design-tokens compared nothing — loftyTheme.ts parsed as empty, so this check proved nothing.");
  process.exit(1);
}
console.log(`loftyTheme.ts matches the design-system mirror — ${compared} token values across ${THEMES.length} themes.`);
