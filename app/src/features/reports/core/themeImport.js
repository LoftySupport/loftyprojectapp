// themeImport.js — build a theme from a design file you already have.
//
// Most teams have written their brand down once already: a `brand.md`, a
// `tokens.css`, a Tailwind config. Retyping those values into a theme is how
// they drift. These importers read the file and produce a theme.
//
// THEY ARE ASSISTANTS, NOT ORACLES. Every mapping from "a colour called Lime"
// to "the accent role" is a guess. So each importer returns a `report`
// alongside the theme, saying what it matched, what it guessed and what it
// could not find. Read it. An unreviewed import is how a report ends up with
// body text in a highlighter colour.

import { createTheme, THEME_COLOR_ROLES } from './theme.js';

const HEX = /#[0-9a-fA-F]{6}\b/;
const normalise = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Colour values in a real token system are not all plain hex. Three shapes
 * turn up constantly and all three used to be dropped:
 *
 *   #E6FF2B                     a hex
 *   rgba(2, 16, 18, 0.12)       a translucent hairline border
 *   var(--aia-grey-92)          one token pointing at another
 *
 * Skipping them is not neutral. It makes the importer fall through to the next
 * pattern and pick a plausible but wrong colour. Against a real brand file that
 * turned a subtle border into solid black and secondary text into a highlight.
 */

/** Composite an rgba colour over a background, since a report has no alpha. */
function flatten(r, g, b, a, over = '#FFFFFF') {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(over).trim());
  const bg = m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 255, 255];
  const mix = (c, i) => Math.round(c * a + bg[i] * (1 - a));
  return `#${[mix(r, 0), mix(g, 1), mix(b, 2)].map(v => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** Read one colour value to hex, following var() through `lookup`. */
function readColour(value, lookup = {}, over = '#FFFFFF', depth = 0) {
  const v = String(value || '').trim();
  if (!v || depth > 6) return null;

  const hex = v.match(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/);
  if (hex) {
    const h = hex[0];
    return (h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h).toUpperCase();
  }

  const rgba = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/i);
  if (rgba) {
    const a = rgba[4] === undefined ? 1 : Math.max(0, Math.min(1, parseFloat(rgba[4])));
    return flatten(+rgba[1], +rgba[2], +rgba[3], a, over);
  }

  const ref = v.match(/var\(\s*(--[a-z0-9-]+)/i);
  if (ref) return readColour(lookup[ref[1]], lookup, over, depth + 1);

  return null;
}

// ─── Role heuristics ─────────────────────────────────────────────────
//
// Ordered: the first pattern that matches a swatch's name or CSS token wins
// that role. Tokens are checked before names, because a token like `--fg-1` is
// a statement of intent while a name like "Black" is just a colour.
//
// Patterns are matched against a BARE token, with any leading dashes already
// stripped, so they use `^-*` rather than requiring the dashes. Requiring them
// meant `--fg-2` matched in the Markdown importer (which normalises them away)
// and silently missed in the CSS one, which is exactly the kind of difference
// nobody notices until two exports disagree.

const ROLE_RULES = [
  { role: 'ink',        tokens: [/^-*fg-?1$/, /text.*primary/, /^-*ink$/],       names: [/\bink\b/, /primary text/, /\bblack\b/] },
  { role: 'muted',      tokens: [/^-*fg-?2$/, /^-*text-?2$/, /^-*(fg|text)-muted$/, /^-*muted$/], names: [/\bgrey\b|\bgray\b/, /muted/, /secondary/, /caption/] },
  { role: 'surface',    tokens: [/^-*bg-?1$/, /surface.*(light|1)/],              names: [/\bwhite\b/, /page/, /light surface/] },
  { role: 'surfaceAlt', tokens: [/^-*bg-?2$/, /^-*surface-(alt|2)$/],             names: [/\bbeige\b/, /off.?white/, /cream/, /\balt\b/, /sand/] },
  { role: 'accent',     tokens: [/accent(?!-alt)/, /highlight/, /^-*brand$/],     names: [/accent/, /highlight/, /\blime\b/, /\bbrand\b/] },
  // Only a BACKGROUND token can be the inverse surface. A bare /inverse/
  // also matches `--fg-inverse-1` and `--line-inverse`, which are the things
  // drawn ON it, so it picked a near-white for the dark band.
  { role: 'inverse',    tokens: [/^-*bg-?inverse-?1?$/, /^-*bg-?inverse/, /^-*surface-inverse/], names: [/\bblack\b/, /dark surface/, /\bink\b/] },
  { role: 'heading',    tokens: [/heading/, /^-*bg-?inverse-?2$/],                names: [/teal/, /navy/, /deep/, /heading/] },
  // `line-1` before `line-strong`: a table's default border is the subtle
  // one. A brand offering both lists the heavy one for emphasis.
  { role: 'line',       tokens: [/^-*line-?1$/, /^-*border-?1?$/, /^-*divider$/, /^-*line$/, /^-*line-/], names: [/border/, /\bline\b/, /divider/, /\brule\b/] },
];

// Fonts are matched on the CSS token, or failing that on the table's ROLE
// cell. Never on prose. An earlier version matched the whole row and picked
// the mono face from the words "adds depth without leaving monochrome", and
// chose a display face for headings out of a cell that said, in as many words,
// never to do that.
const FONT_RULES = [
  { role: 'heading', tokens: [/^-*font-heading$/, /^-*font-title$/],                roles: [/^headings?$/, /^h1/] },
  { role: 'body',    tokens: [/^-*font-(web|body|text|ui)$/, /^-*font-sans$/],      roles: [/^body/, /^ui$/, /body\s*\/?\s*ui/, /paragraph/] },
  { role: 'mono',    tokens: [/^-*font-(mono|code)$/],                            roles: [/^mono/, /^code$/] },
];

// A display or logo face is not a heading face. Brand systems routinely ship
// one that is licensed or drawn for the wordmark alone, and this file's own
// source brand says so outright. Never promote these, and say why.
const DISPLAY_TOKENS = [/^-*font-display$/, /^-*font-logo$/, /^-*font-wordmark$/];

const matches = (patterns, value) => !!value && patterns.some(p => p.test(value));

/** Split markdown into table rows of trimmed cells. */
function markdownTableRows(md) {
  const rows = [];
  for (const line of String(md).split('\n')) {
    const t = line.trim();
    if (!t.startsWith('|') || /^\|[\s:|-]+\|$/.test(t)) continue; // skip separators
    rows.push(t.slice(1, -1).split('|').map(c => c.trim()));
  }
  return rows;
}

const stripMd = (s) => String(s || '').replace(/[*`_]/g, '').trim();

/**
 * Read a brand guideline written in Markdown.
 *
 * Recognises the common shape: a table where a row carries a swatch name, a
 * hex value and often a CSS token. It reads fonts from a typography table and
 * logo paths from a logo table, both by the same approach.
 *
 * @param {string} md
 * @param {object} [options]
 * @param {string} [options.key]        theme key. Defaults to 'brand'.
 * @param {string} [options.label]
 * @param {string} [options.extends]    the built-in theme to fill any gaps from
 * @param {object} [options.roles]      explicit overrides: { accent: '#E6FF2B' }
 *                                      or by swatch name: { accent: 'Lime' }
 * @param {string} [options.logoBase]   prefix for relative logo paths
 * @returns {{ theme, report }}
 */
export function themeFromBrandMarkdown(md, options = {}) {
  const rows = markdownTableRows(md);

  // ── Colours ──
  const swatches = [];
  for (const cells of rows) {
    const joined = cells.join(' | ');
    const hex = joined.match(HEX)?.[0];
    if (!hex) continue;
    const token = (joined.match(/--[a-z0-9-]+/i) || [])[0] || null;
    // The name is the first cell that is not the hex and not the token.
    const name = stripMd(cells.find(c => !HEX.test(c) && !/^`?--/.test(stripMd(c))) || '');
    swatches.push({ name, token, hex: hex.toUpperCase(), context: normalise(joined) });
  }

  // Also accept CSS custom properties written inside fenced blocks, which is
  // how the semantic layer of a brand file is usually expressed.
  //
  // Matched ONE LINE AT A TIME. A regex allowed to run across lines pairs a
  // token with a hex belonging to a later declaration: reading a real brand
  // file, `--line-1` (whose value is an rgba) was paired with the hex three
  // lines below it and the report's table borders came out solid black.
  const declared = {};
  for (const line of String(md).split('\n')) {
    const decl = line.match(/(--[a-z0-9-]+)\s*:?\s*([^;]*)/i);
    if (!decl) continue;
    declared[decl[1]] = decl[2];
  }
  for (const [token, raw] of Object.entries(declared)) {
    const hex = readColour(raw, declared, '#FFFFFF');
    if (hex) swatches.push({ name: '', token, hex, context: normalise(`${token} ${raw}`) });
  }

  const colors = {};
  const decisions = [];
  const used = new Set();

  for (const { role, tokens, names } of ROLE_RULES) {
    const byToken = swatches.find(s => matches(tokens, normalise(s.token).replace(/\s/g, '-')) && !used.has(s.hex));
    const byName = swatches.find(s => matches(names, normalise(s.name)) && !used.has(s.hex));
    const hit = byToken || byName;
    if (!hit) continue;
    colors[role] = hit.hex;
    // `inverse` and `ink` are legitimately the same colour in a mono palette,
    // so those two are allowed to share; everything else prefers a distinct one.
    if (role !== 'inverse' && role !== 'ink') used.add(hit.hex);
    decisions.push({ role, hex: hit.hex, from: hit.token || hit.name, how: byToken ? 'token' : 'name' });
  }

  // ── Fonts ──
  const fonts = {};
  const skipped = [];
  for (const cells of rows) {
    const token = (cells.join(' ').match(/--[a-z0-9-]+/i) || [])[0] || '';
    const bare = token.replace(/^--/, '').toLowerCase();
    const family = stripMd(cells[0]);
    if (!family || HEX.test(family) || /^typeface$/i.test(family)) continue;

    if (matches(DISPLAY_TOKENS, bare)) {
      skipped.push({ family, token, why: 'display or logo face, not a text face' });
      continue;
    }
    // The role cell is the one that is neither the family nor the token, and
    // is short enough to be a label rather than a paragraph of usage notes.
    const roleCell = normalise(cells.slice(1).find(c => !/--/.test(c) && stripMd(c) && stripMd(c).length < 24) || '');

    for (const rule of FONT_RULES) {
      if (fonts[rule.role]) continue;
      const byToken = bare && matches(rule.tokens, bare);
      const byRole = !bare && roleCell && matches(rule.roles, roleCell);
      if (byToken || byRole) {
        fonts[rule.role] = family;
        decisions.push({ role: `font.${rule.role}`, value: family, from: token || roleCell, how: byToken ? 'token' : 'role column' });
      }
    }
  }

  // ── Logos ──
  // A logo table says which artwork goes on which SURFACE, and the surface is
  // named in a different cell from the filename. Reading the whole row instead
  // put "AIA_BlackonWhite.svg" on dark surfaces, because the filename contains
  // the word "black". Only the non-path cells describe the surface.
  const logo = {};
  for (const cells of rows) {
    const pathCell = cells.find(c => /\.(?:svg|png|jpg|jpeg|webp)/i.test(c));
    if (!pathCell) continue;
    const path = (pathCell.match(/[^\s`|]+\.(?:svg|png|jpg|jpeg|webp)/i) || [])[0];
    if (!path) continue;
    const surface = normalise(cells.filter(c => c !== pathCell).join(' '));
    if (!surface || /^surface|^logo file/.test(surface)) continue;
    const full = options.logoBase ? `${String(options.logoBase).replace(/\/$/, '')}/${path.replace(/^\.?\//, '')}` : path;
    if (!logo.light && /white|light|beige|cream/.test(surface)) logo.light = full;
    if (!logo.dark && /black|dark|inverse/.test(surface)) logo.dark = full;
  }

  return finish({ colors, fonts, logo, decisions, swatches: swatches.length, skipped }, options, 'brand markdown');
}

/**
 * Read CSS custom properties: `--aia-black: #021012;`
 * Useful when the design lives in a tokens.css rather than a document, and as
 * a second pass over the same brand that also ships a stylesheet.
 */
export function themeFromCssVariables(css, options = {}) {
  // Every declaration first, so var() references can be followed afterwards.
  const declared = {};
  for (const m of String(css).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) declared[m[1]] = m[2].trim();

  const swatches = [];
  for (const [token, raw] of Object.entries(declared)) {
    const hex = readColour(raw, declared, '#FFFFFF');
    if (!hex) continue;
    swatches.push({ name: token.replace(/^--/, '').replace(/-/g, ' '), token, hex });
  }

  const fontDecls = [...String(css).matchAll(/(--[a-z0-9-]*font[a-z0-9-]*)\s*:\s*([^;]+);/gi)];

  const colors = {};
  const decisions = [];
  const used = new Set();
  for (const { role, tokens, names } of ROLE_RULES) {
    const hit = swatches.find(s => matches(tokens, s.token.replace(/^--/, '')) && !used.has(s.hex))
             || swatches.find(s => matches(names, normalise(s.name)) && !used.has(s.hex));
    if (!hit) continue;
    colors[role] = hit.hex;
    if (role !== 'inverse' && role !== 'ink') used.add(hit.hex);
    decisions.push({ role, hex: hit.hex, from: hit.token, how: 'token' });
  }

  const fonts = {};
  for (const rule of FONT_RULES) {
    const hit = fontDecls.find(d => matches(rule.tokens, d[1].replace(/^--/, '')));
    if (!hit) continue;
    fonts[rule.role] = hit[2].trim().replace(/^["']|["']$/g, '');
    decisions.push({ role: `font.${rule.role}`, value: fonts[rule.role], from: hit[1], how: 'token' });
  }

  return finish({ colors, fonts, logo: {}, decisions, swatches: swatches.length }, options, 'CSS variables');
}

// ─── Shared finishing ────────────────────────────────────────────────

function finish({ colors, fonts, logo, decisions, swatches, skipped = [] }, options, source) {
  // Explicit overrides always win over anything inferred. They may name a hex
  // directly, or name a swatch ("accent: 'Lime'") when the guess went wrong.
  for (const [role, value] of Object.entries(options.roles || {})) {
    if (typeof value === 'string' && HEX.test(value)) {
      colors[role] = value.toUpperCase();
      decisions.push({ role, hex: colors[role], from: 'options.roles', how: 'explicit' });
    }
  }

  // A guessed colour that would be unreadable is worse than no guess: the
  // fallback theme is at least coherent. Roles are dropped here rather than
  // shipped, and the drop is reported so it can be set explicitly.
  const rejected = [];
  const lumOf = (hex) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  };
  const drop = (role, why) => {
    rejected.push({ role, hex: colors[role], why });
    delete colors[role];
  };
  const inkL = lumOf(colors.ink);
  for (const role of ['surface', 'surfaceAlt']) {
    const l = lumOf(colors[role]);
    if (l != null && inkL != null && Math.abs(l - inkL) < 0.3) {
      drop(role, `too close to the text colour (${colors.ink}) to read`);
    }
  }
  if (colors.line && colors.line === colors.ink) {
    drop('line', 'identical to the text colour, so every border would read as a rule');
  }
  if (colors.muted && colors.accent && colors.muted === colors.accent) {
    drop('muted', 'identical to the accent, which would put body text in a highlight colour');
  }
  // An inverse surface that barely differs from the page is not an inverse.
  const surfaceL = lumOf(colors.surface);
  const inverseL = lumOf(colors.inverse);
  if (inverseL != null && surfaceL != null && Math.abs(inverseL - surfaceL) < 0.3) {
    drop('inverse', `too close to the page colour (${colors.surface}) to read as a contrasting band`);
  }

  // A palette needs a readable partner for its accent. Guessing this wrong is
  // very visible (unreadable button text), so it is derived rather than matched.
  if (colors.accent && !options.roles?.accentText) {
    colors.accentText = pickReadable(colors.accent, colors.ink, colors.surface);
    decisions.push({ role: 'accentText', hex: colors.accentText, from: 'contrast with accent', how: 'derived' });
  }
  if (colors.inverse && !colors.onInverse) {
    colors.onInverse = pickReadable(colors.inverse, colors.ink, colors.surface || '#FFFFFF');
    decisions.push({ role: 'onInverse', hex: colors.onInverse, from: 'contrast with inverse', how: 'derived' });
  }

  const fontStack = (family, fallback) =>
    family ? `'${family}', ${fallback}` : undefined;
  const SANS_FALLBACK = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

  const spec = {
    key: options.key || 'brand',
    label: options.label || 'Brand',
    extends: options.extends || 'modern',
    colors,
    fonts: {
      ...(fonts.heading ? { heading: fontStack(fonts.heading, SANS_FALLBACK) } : {}),
      ...(fonts.body ? { body: fontStack(fonts.body, SANS_FALLBACK) } : {}),
      ...(fonts.mono ? { mono: fontStack(fonts.mono, 'ui-monospace, monospace') } : {}),
    },
    ...(logo && (logo.light || logo.dark) ? { logo: { ...logo, ...(options.logo || {}) } } : (options.logo ? { logo: options.logo } : {})),
  };

  const theme = createTheme(spec);

  const filled = THEME_COLOR_ROLES.filter(r => colors[r]);
  const inherited = THEME_COLOR_ROLES.filter(r => !colors[r]);

  return {
    theme,
    report: {
      source,
      swatchesFound: swatches,
      matched: decisions,
      rolesFromFile: filled,
      // The honest half: these came from the base theme, not from the design
      // file. If any of them matter, set them explicitly.
      rolesInherited: inherited,
      rolesRejected: rejected,
      fontsFromFile: Object.keys(fonts),
      logo: spec.logo || null,
      skippedFonts: skipped,
      warnings: [
        ...skipped.map(s => `Ignored the "${s.family}" face: ${s.why}. Set fonts.heading explicitly if that is wrong.`),
        ...rejected.map(r => `Ignored ${r.hex} for "${r.role}": ${r.why}. It fell back to the base theme.`),
        ...(inherited.length ? [`${inherited.length} colour role(s) fell back to the "${spec.extends}" theme: ${inherited.join(', ')}.`] : []),
        ...(!fonts.heading && !fonts.body ? ['No fonts were recognised. The base theme\'s fonts are in use.'] : []),
        ...(!spec.logo ? ['No logo was found. Set one with options.logo if the report should carry it.'] : []),
        ...(swatches < 3 ? ['Fewer than three colours were found. Check the file really contains a colour table.'] : []),
      ],
    },
  };
}

/**
 * Choose whichever candidate reads best on `bg`, by luminance distance.
 * Candidates are tried in order and the palette's own ink/surface come first,
 * so a brand's near-black is preferred to pure black when both are legible.
 */
function pickReadable(bg, ...candidates) {
  const lum = (hex) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return 0;
    const n = parseInt(m[1], 16);
    return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  };
  const bgL = lum(bg);
  const options = [...candidates.filter(Boolean), '#FFFFFF', '#000000'];
  // 0.45 of the luminance range is comfortably past WCAG AA for body text at
  // these sizes. The first candidate that clears it wins, so the brand's own
  // ink is preferred over pure black when both are legible.
  const clear = options.find(c => Math.abs(lum(c) - bgL) >= 0.45);
  return (clear || options.reduce((best, c) =>
    Math.abs(lum(c) - bgL) > Math.abs(lum(best) - bgL) ? c : best, options[0])).toUpperCase();
}
