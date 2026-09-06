/**
 * Lofty's brand colours in Vibe's primary slots, for ThemeProvider.
 *
 * These duplicate values that also live in `../design-system/tokens/colors.css`, and that
 * is not an oversight: ThemeProvider takes a plain object and generates CSS from it, so it
 * needs literal strings at build time and cannot read a CSS custom property. The duplication
 * is guarded rather than trusted — `npm run check:design-tokens` fails if any hex here stops
 * matching the mirror, and CI runs it. Change the design system, sync the mirror, and let
 * that check tell you this file is stale.
 *
 * ThemeProvider only themes these primary/brand tokens. Everything else Lofty needs —
 * the semantic layer, the highlight, the inks, the warm neutrals — is in `tokens.css`,
 * which also re-declares what is here at body-class specificity so PORTALED components
 * (Vibe renders modals and dropdown menus into document.body) get the brand too.
 *
 * **Primary is Crisp Orange, and the text on it is ink, not white.** White on #f47e63 is
 * 2.6:1 and fails AA; #191819 is 6.7:1 in light and 8.1:1 on the dark base. Eco Green is
 * NOT the secondary — the design system demotes it to a minimal highlight, never a shell,
 * a panel fill or a link colour.
 */
export const loftyTheme = {
  name: "lofty",
  colors: {
    light: {
      "primary-color": "#f47e63",
      "primary-hover-color": "#d9634a",
      "primary-selected-color": "#fae4d5",
      "primary-selected-hover-color": "#f6d3bf",
      "text-color-on-primary": "#191819",
      "brand-color": "#f47e63",
      "brand-hover-color": "#d9634a",
      "text-color-on-brand": "#191819"
    },
    // Crisp Orange keeps its hex on dark — it is already 7.0:1 on the #191819 base, so the
    // hue does not move; only the ink on it and the hover step do.
    dark: {
      "primary-color": "#f47e63",
      "primary-hover-color": "#f79a84",
      "primary-selected-color": "#4a2e28",
      "primary-selected-hover-color": "#5a3730",
      "text-color-on-primary": "#191819",
      "brand-color": "#f47e63",
      "brand-hover-color": "#f79a84",
      "text-color-on-brand": "#191819"
    },
    black: {
      "primary-color": "#f47e63",
      "primary-hover-color": "#f79a84",
      "primary-selected-color": "#4a2e28",
      "primary-selected-hover-color": "#5a3730",
      "text-color-on-primary": "#191819",
      "brand-color": "#f47e63",
      "brand-hover-color": "#f79a84",
      "text-color-on-brand": "#191819"
    }
  }
};

export type SystemTheme = "light" | "dark" | "black";
export const SYSTEM_THEMES: SystemTheme[] = ["light", "dark", "black"];
