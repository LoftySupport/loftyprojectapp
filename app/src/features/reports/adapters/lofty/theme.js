// theme.js — Lofty's house document format, as a report theme.
//
// NOT a second look. Every document Lofty sends already wears one — the exported PDF and
// Word file built in `data/export/` (0026) — and a document composed in the builder has
// to be the same document. So the palette is imported from `data/export/houseFormat.ts`
// rather than retyped, and the roles below are that file's roles under the module's
// names.
//
// The first version of this file read `theme/tokens.css` and built a teal-inked theme
// from the app's UI palette. It looked like Lofty and was wrong: the house DOCUMENT
// format is Foundation Black on white with an Eco Green eyebrow and a Crisp Orange rule,
// and a builder document in teal would not have matched the Jobs export sitting beside
// it in the same email.
//
// THE APP'S CHROME IS A DIFFERENT QUESTION and stays as it is. The builder's toolbars and
// palette wear the app's UI teal from `theme/tokens.css`; the page inside them wears
// this. A document and the tool that made it are allowed to look different — a document
// and another document are not.

import {
  HOUSE_COLOURS,
  HOUSE_RULE_PT
} from '../../../../data/export/houseFormat';
import { createTheme } from '../../core/theme.js';

/**
 * The wordmark, and the same file both document writers use — `data/export/logo.ts`
 * decodes `public/lofty_logo_orange.png` for them, and this points the browser at it.
 *
 * A PNG deliberately: an SVG will not embed in the Word export, so the format that works
 * everywhere is the one carried here.
 *
 * Only a `light` variant, because only a light variant exists. Both themes therefore use
 * a ruled header rather than a dark band — a band would ask `logoForSurface` for dark
 * artwork, get the light one back, and put an orange-on-white wordmark on a dark field.
 */
const LOGO = {
  light: '/lofty_logo_orange.png',
  height: 30,
  alt: 'Lofty'
};

/**
 * The house stack, and the reasoning is the Word writer's, quoted rather than re-decided:
 * the brand face is **Fieldwork Geo**, but embedding it in a .docx needs Word's
 * embed-fonts option, so **Helvetica is the template's only approved fallback — never
 * Arial**.
 *
 * Helvetica is therefore first, not second. `core/docx.js` takes the first family in the
 * stack and writes it into the document, so putting Fieldwork Geo there would produce a
 * .docx asking for a font the reader does not have, and Word would substitute something
 * the brand kit has not approved. Naming it after Helvetica keeps it documented without
 * letting it reach a file.
 */
const HOUSE_SANS =
  "Helvetica, 'Fieldwork Geo', 'Helvetica Neue', ui-sans-serif, system-ui, sans-serif";

export const LOFTY_THEME = createTheme({
  key: 'lofty',
  label: 'Lofty',
  description: 'The house document format: Foundation Black on white, an Eco Green eyebrow and the Crisp Orange section rule. What every other Lofty export already looks like.',
  extends: 'professional',
  colors: {
    ink: HOUSE_COLOURS.ink,
    muted: HOUSE_COLOURS.muted,
    surface: '#FFFFFF',
    surfaceAlt: HOUSE_COLOURS.headFill,
    line: HOUSE_COLOURS.rowRule,
    accent: HOUSE_COLOURS.orange,
    // Nothing in this build draws text ON the accent — the orange is a rule, which is all
    // the house format uses it for — so this role exists to satisfy the theme contract
    // rather than to be rendered. It is the house ink for that reason.
    //
    // Worth knowing before anything starts using it: the brand kit has no colour that
    // clears AA on Crisp Orange. Foundation Black manages 3.9:1 and white is 2.6:1. If a
    // block ever needs text on an orange fill, that is a question for the kit, not a hex
    // to pick here.
    accentText: HOUSE_COLOURS.ink,
    inverse: HOUSE_COLOURS.ink,
    onInverse: '#FFFFFF',
    heading: HOUSE_COLOURS.green
  },
  fonts: { heading: HOUSE_SANS, body: HOUSE_SANS, headingWeight: 700 },
  // `house`, not `rule`: the brand kit's Level 2 is a 2pt Crisp Orange rule under a
  // SECTION heading, which the module's built-in styles draw as a grey hairline. The
  // style is an integration addition — see the note in components/ReportDocument.jsx —
  // and it is what makes the on-screen document, the Word export and the HTML export all
  // draw the same rule the app's own PDF has drawn since 0026.
  header: { style: 'house', rule: HOUSE_RULE_PT },
  logo: LOGO
});

/**
 * The same format with the orange held back to the green.
 *
 * Offering two is worth it for the reason the module's docs give — the report that goes
 * to a client and the one that goes to the leadership meeting rarely want the same amount
 * of colour — and this one is also what to reach for when a document will be printed in
 * mono, where the orange rule reads as a grey smudge.
 */
export const LOFTY_THEME_QUIET = createTheme({
  key: 'lofty-quiet',
  label: 'Lofty (quiet)',
  description: 'The house format with the orange rule held back to Eco Green. For long documents, and for anything printed in mono.',
  extends: 'minimal',
  colors: {
    ink: HOUSE_COLOURS.ink,
    muted: HOUSE_COLOURS.muted,
    surface: '#FFFFFF',
    surfaceAlt: HOUSE_COLOURS.headFill,
    line: HOUSE_COLOURS.hairline,
    accent: HOUSE_COLOURS.green,
    accentText: '#FFFFFF',
    inverse: HOUSE_COLOURS.ink,
    onInverse: '#FFFFFF',
    heading: HOUSE_COLOURS.green
  },
  fonts: { heading: HOUSE_SANS, body: HOUSE_SANS, headingWeight: 600 },
  logo: { ...LOGO, height: 26 }
});

/**
 * What the theme picker offers. The module's four built-ins stay in the list —
 * `createThemeSet` keeps them unless told not to — because a report going to a council or
 * a bank is sometimes better off not wearing Lofty's colours at all.
 */
export const LOFTY_THEME_SPECS = {
  [LOFTY_THEME.key]: LOFTY_THEME,
  [LOFTY_THEME_QUIET.key]: LOFTY_THEME_QUIET
};
