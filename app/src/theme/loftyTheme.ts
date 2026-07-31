/**
 * Lofty's two hero colours in Vibe's primary slots.
 *
 * ThemeProvider only themes 11 primary/brand tokens. Everything else Lofty needs —
 * the accessible orange sibling, the semantic inks — lives in tokens.css, because it
 * cannot go through here.
 *
 * Dark uses a lightened green: #005058 is 1.3:1 on Vibe's dark canvas. The logo orange
 * needs no change, at 6.4:1 on #181b34.
 */
export const loftyTheme = {
  name: "lofty",
  colors: {
    light: {
      "primary-color": "#005058",
      "primary-hover-color": "#00393f",
      "primary-selected-color": "#d3e3e4",
      "primary-selected-hover-color": "#bcd4d6",
      "text-color-on-primary": "#ffffff",
      "brand-color": "#005058",
      "brand-hover-color": "#00393f",
      "text-color-on-brand": "#ffffff"
    },
    dark: {
      "primary-color": "#4db3bd",
      "primary-hover-color": "#59c2cc",
      "primary-selected-color": "#173c41",
      "primary-selected-hover-color": "#1d4a50",
      "text-color-on-primary": "#12141f",
      "brand-color": "#4db3bd",
      "brand-hover-color": "#59c2cc",
      "text-color-on-brand": "#12141f"
    },
    black: {
      "primary-color": "#4db3bd",
      "primary-hover-color": "#59c2cc",
      "primary-selected-color": "#173c41",
      "primary-selected-hover-color": "#1d4a50",
      "text-color-on-primary": "#12141f",
      "brand-color": "#4db3bd",
      "brand-hover-color": "#59c2cc",
      "text-color-on-brand": "#12141f"
    }
  }
};

export type SystemTheme = "light" | "dark" | "black";
export const SYSTEM_THEMES: SystemTheme[] = ["light", "dark", "black"];
