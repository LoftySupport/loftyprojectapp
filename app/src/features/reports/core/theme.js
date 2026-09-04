// theme.js — one theme object, four renderers.
//
// Before this existed, the look of a report was set in three unconnected
// places: Tailwind classes in the React document, a preset table in the Word
// exporter, and two loose parameters on the HTML serialiser. Changing a brand
// colour meant editing all three and discovering the one you missed when a
// client opened the .docx. A theme is now defined once, here, and every
// renderer reads it.
//
// A theme carries three things:
//   colors   the palette, as semantic roles rather than brand names
//   fonts    families and heading weight
//   logo     one artwork for light surfaces, one for dark
//
// Roles, not names. A theme says `accent`, never `lime`. That is what lets a
// report be re-themed without every renderer knowing what business it is for.

// ─── Token reference ─────────────────────────────────────────────────
//
//   ink          primary text, and the strongest rules
//   muted        secondary text, captions, quiet borders
//   surface      the page itself
//   surfaceAlt   table headers and subtle fills, one step off the page
//   line         table and block borders
//   accent       the highlight; used sparingly and never as body text
//   accentText   text drawn ON the accent (contrast partner)
//   inverse      a dark band or panel
//   onInverse    text on that dark band
//   heading      section headings, if they differ from ink
//
// Every renderer resolves these and nothing else, so adding a colour to a
// theme means adding a role here first.

export const THEME_COLOR_ROLES = [
  'ink', 'muted', 'surface', 'surfaceAlt', 'line',
  'accent', 'accentText', 'inverse', 'onInverse', 'heading',
];

const SANS = "'Onest', 'Outfit', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
const SERIF = "'Sofia Pro', Georgia, 'Times New Roman', serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

// ─── Built-in themes ─────────────────────────────────────────────────
//
// Two are the ones most integrations want: `modern` (confident, high contrast,
// a single bright accent) and `professional` (restrained, navy and slate, the
// document a finance or legal reader expects). `minimal` and `editorial` are
// there because some clients need a report to look like it came from them, not
// from a product.

export const BUILT_IN_THEMES = {
  modern: {
    key: 'modern',
    label: 'Modern',
    description: 'High contrast, one bright accent, geometric sans. Confident and current.',
    colors: {
      ink: '#021012',
      muted: '#898A8D',
      surface: '#FFFFFF',
      surfaceAlt: '#F9F7F2',
      line: '#D9DADB',
      accent: '#E6FF2B',
      accentText: '#021012',
      inverse: '#021012',
      onInverse: '#FFFFFF',
      heading: '#0B4650',
    },
    fonts: { heading: SANS, body: SANS, mono: MONO, headingWeight: 800 },
    header: { style: 'rule', rule: 2 },
    logo: null,
  },

  professional: {
    key: 'professional',
    label: 'Professional',
    description: 'Navy and slate, restrained rules, no bright accent. Reads as a corporate document.',
    colors: {
      ink: '#0F172A',
      muted: '#64748B',
      surface: '#FFFFFF',
      surfaceAlt: '#F1F5F9',
      line: '#CBD5E1',
      accent: '#1E3A5F',
      accentText: '#FFFFFF',
      inverse: '#0F172A',
      onInverse: '#FFFFFF',
      heading: '#1E3A5F',
    },
    fonts: { heading: SANS, body: SANS, mono: MONO, headingWeight: 700 },
    header: { style: 'band', rule: 0 },
    logo: null,
  },

  minimal: {
    key: 'minimal',
    label: 'Minimal',
    description: 'Almost no chrome. Hairline rules, grey headings, the content carries it.',
    colors: {
      ink: '#18181B',
      muted: '#A1A1AA',
      surface: '#FFFFFF',
      surfaceAlt: '#FFFFFF',
      line: '#E4E4E7',
      accent: '#18181B',
      accentText: '#FFFFFF',
      inverse: '#18181B',
      onInverse: '#FFFFFF',
      heading: '#18181B',
    },
    fonts: { heading: SANS, body: SANS, mono: MONO, headingWeight: 600 },
    header: { style: 'minimal', rule: 1 },
    logo: null,
  },

  editorial: {
    key: 'editorial',
    label: 'Editorial',
    description: 'Serif headings and body. For long-form reports meant to be read rather than skimmed.',
    colors: {
      ink: '#1C1917',
      muted: '#78716C',
      surface: '#FFFFFF',
      surfaceAlt: '#FAF9F7',
      line: '#D6D3D1',
      accent: '#7C2D12',
      accentText: '#FFFFFF',
      inverse: '#1C1917',
      onInverse: '#FAF9F7',
      heading: '#7C2D12',
    },
    fonts: { heading: SERIF, body: SERIF, mono: MONO, headingWeight: 700 },
    header: { style: 'rule', rule: 2 },
    logo: null,
  },
};

export const DEFAULT_THEME_KEY = 'modern';

// The pre-theme releases of this package used `styleKey` with these three
// values. Keeping the aliases means a report saved before theming still opens
// looking as its author left it, rather than silently changing appearance.
const LEGACY_STYLE_ALIASES = { brand: 'modern', serif: 'editorial', minimal: 'minimal' };

// ─── Building and resolving ──────────────────────────────────────────

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** Deep merge, used so an override names only what it changes. */
function merge(base, patch) {
  if (!isPlainObject(patch)) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = isPlainObject(v) && isPlainObject(base?.[k]) ? merge(base[k], v) : v;
  }
  return out;
}

/**
 * Create a theme, optionally extending a built-in one.
 *
 *   createTheme({ key: 'acme', label: 'Acme',
 *                 extends: 'professional',
 *                 colors: { accent: '#E6FF2B' },
 *                 logo: { light: '/logo.svg' } })
 *
 * Anything unspecified falls back to the base, so a theme is usually a handful
 * of colours rather than a full palette.
 */
export function createTheme(spec = {}) {
  const baseKey = LEGACY_STYLE_ALIASES[spec.extends] || spec.extends || DEFAULT_THEME_KEY;
  const base = BUILT_IN_THEMES[baseKey] || BUILT_IN_THEMES[DEFAULT_THEME_KEY];
  const { extends: _ignored, ...rest } = spec;
  const theme = merge(base, rest);

  // A theme with no key cannot be saved on a report or found again.
  theme.key = spec.key || base.key;
  theme.label = spec.label || base.label;

  const missing = THEME_COLOR_ROLES.filter(role => !theme.colors?.[role]);
  if (missing.length) {
    throw new Error(`Theme "${theme.key}" is missing colour role(s): ${missing.join(', ')}.`);
  }
  return theme;
}

/**
 * Resolve whatever a caller has (a key, a theme object, nothing) to a theme.
 * Never throws and never returns undefined: an unknown key falls back to the
 * default, because a report that will not render is worse than one that
 * renders in the wrong colours.
 *
 * @param {string|object} theme
 * @param {object} [themes] the available themes, keyed. Defaults to built-ins.
 */
export function resolveTheme(theme, themes = BUILT_IN_THEMES) {
  if (isPlainObject(theme) && theme.colors) return theme;
  const key = typeof theme === 'string' ? (LEGACY_STYLE_ALIASES[theme] || theme) : null;
  return themes[key] || BUILT_IN_THEMES[key] || themes[DEFAULT_THEME_KEY] || BUILT_IN_THEMES[DEFAULT_THEME_KEY];
}

/** Merge custom themes over the built-ins, for a host app's theme list. */
export function createThemeSet(custom = {}, { includeBuiltIns = true } = {}) {
  const out = includeBuiltIns ? { ...BUILT_IN_THEMES } : {};
  for (const [key, spec] of Object.entries(custom)) {
    out[key] = spec.colors && spec.key ? spec : createTheme({ ...spec, key });
  }
  return out;
}

// ─── Renderer bridges ────────────────────────────────────────────────

/**
 * Theme to CSS custom properties. The React document sets these on its root so
 * Tailwind arbitrary values can reference them, which is what keeps a single
 * theme from turning into thirty-five hard-coded hexes again.
 */
export function themeToCssVars(theme) {
  const t = resolveTheme(theme);
  const vars = {};
  for (const role of THEME_COLOR_ROLES) vars[`--rb-${role.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`] = t.colors[role];
  vars['--rb-font-heading'] = t.fonts?.heading || SANS;
  vars['--rb-font-body'] = t.fonts?.body || SANS;
  vars['--rb-font-mono'] = t.fonts?.mono || MONO;
  vars['--rb-heading-weight'] = String(t.fonts?.headingWeight || 700);
  return vars;
}

/** The same, as a CSS declaration string, for the standalone HTML export. */
export function themeToCssText(theme) {
  return Object.entries(themeToCssVars(theme)).map(([k, v]) => `${k}:${v}`).join(';');
}

/** Word wants hex with no leading '#'. */
export const hexForDocx = (hex, fallback = '000000') =>
  (typeof hex === 'string' && /^#?[0-9a-fA-F]{6}$/.test(hex.trim()))
    ? hex.trim().replace(/^#/, '').toUpperCase()
    : fallback;

/**
 * Pick the logo variant that will be legible on a given surface.
 * `dark` artwork is the one drawn FOR dark surfaces, so it is chosen when the
 * surface is dark. Falls back to whichever variant exists.
 */
export function logoForSurface(theme, surface = 'light') {
  const logo = resolveTheme(theme).logo;
  if (!logo) return null;
  const src = surface === 'dark' ? (logo.dark || logo.light) : (logo.light || logo.dark);
  return src ? { src, height: logo.height || 32, alt: logo.alt || '' } : null;
}

/**
 * True when a colour is dark enough to need light text on it. Used to decide
 * which logo variant a header band takes, so a theme only has to state its
 * colours and not also restate the consequences.
 */
export function isDarkColour(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  // Rec. 601 luma. Good enough for a text-on-background decision and cheap.
  return (0.299 * r + 0.587 * g + 0.114 * b) < 140;
}
