// theme.js — Lofty's brand, as report themes.
//
// The colours are read off `src/theme/tokens.css`, which is where the app's own
// contrast decisions live (design-system-evaluation.md has the numbers). They
// are not retyped from a logo or guessed from a screenshot:
//
//   --primary-color          #005058   deep teal, the app's primary
//   --primary-hover-color    #00393f   the darker teal the header wears
//   --lofty-orange           #f47e63   logo and decorative fills only, 2.6:1 on white
//   --lofty-orange-strong    #b8482a   anything carrying text or meaning, 5.3:1
//
// That distinction is the one that matters here. `accent` in a report theme
// paints rules, chips and the section marks — decoration — so it takes the
// logo orange. Nothing in a report renders body text in the accent, and if a
// future block does, it needs `--lofty-orange-strong` instead.
//
// Two themes rather than one, for the reason the module's docs give: the report
// that goes to a client and the one that goes to the leadership meeting rarely
// want the same amount of colour.

import { createTheme } from '../../core/theme.js';

/**
 * The wordmark. A PNG, and deliberately: an SVG will not embed in the Word
 * export (the `docx` package cannot rasterise one), so the format that works
 * everywhere is the one carried here.
 *
 * Only a `light` variant is supplied, because only a light variant exists.
 * Both themes therefore use a ruled header rather than a dark band — a band
 * would ask `logoForSurface` for dark artwork, get the light one back, and put
 * an orange-on-white wordmark on a dark teal field. When somebody produces a
 * reversed wordmark, add it as `dark` and the band becomes available.
 */
const LOGO = {
  light: '/lofty_logo_orange.png',
  height: 30,
  alt: 'Lofty'
};

/** Figtree is what the app loads and what Lofty's documents are set in. */
const LOFTY_SANS =
  "Figtree, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, ui-sans-serif, system-ui, sans-serif";

export const LOFTY_THEME = createTheme({
  key: 'lofty',
  label: 'Lofty',
  description: 'Deep teal and the logo orange, on a ruled header. The default for anything going out under Lofty’s name.',
  extends: 'professional',
  colors: {
    ink: '#00393f',
    muted: '#5c6b6d',
    surface: '#FFFFFF',
    surfaceAlt: '#f1f5f5',
    line: '#c9d6d7',
    accent: '#f47e63',
    // Ink on the accent, not white: #f47e63 is a 2.6:1 background, so white
    // text on it fails at any size. The teal clears 5:1.
    accentText: '#00232a',
    inverse: '#00393f',
    onInverse: '#FFFFFF',
    heading: '#005058'
  },
  fonts: { heading: LOFTY_SANS, body: LOFTY_SANS, headingWeight: 700 },
  header: { style: 'rule', rule: 2 },
  logo: LOGO
});

export const LOFTY_THEME_QUIET = createTheme({
  key: 'lofty-quiet',
  label: 'Lofty (quiet)',
  description: 'The same brand with the orange held back to hairlines. For long documents and anything that gets printed in mono.',
  extends: 'minimal',
  colors: {
    ink: '#00393f',
    muted: '#6b7778',
    surfaceAlt: '#f7f8f8',
    line: '#dde4e4',
    accent: '#005058',
    accentText: '#FFFFFF',
    inverse: '#00393f',
    onInverse: '#FFFFFF',
    heading: '#005058'
  },
  fonts: { heading: LOFTY_SANS, body: LOFTY_SANS, headingWeight: 600 },
  logo: { ...LOGO, height: 26 }
});

/**
 * What the theme picker offers. The module's four built-ins stay in the list —
 * `createThemeSet` keeps them unless told not to — because a report going to a
 * council or a bank is sometimes better off not wearing Lofty's colours at all.
 */
export const LOFTY_THEME_SPECS = {
  [LOFTY_THEME.key]: LOFTY_THEME,
  [LOFTY_THEME_QUIET.key]: LOFTY_THEME_QUIET
};
