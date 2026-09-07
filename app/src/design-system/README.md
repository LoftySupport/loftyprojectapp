# The design-system mirror

**This directory is a copy. Do not edit anything in it by hand.**

Every file under `tokens/` is a verbatim copy of the same path in **Lofty's App Design
System**, the Claude Design project at
<https://claude.ai/design/p/491d6888-cf3b-4d56-bdaa-4ac8a6948e99>. The design project is
the source of truth for what Lofty Hub looks like; this directory is how the app reads it,
and [`DESIGN.md`](../../../DESIGN.md) is how a person reads it.

An edit made here is lost the next time somebody syncs. Change the design project, then
sync — the whole point of the mirror is that those two can be compared.

## What is here, and what is deliberately not

| Path | |
| --- | --- |
| `tokens/colors.css` | The brand palette and the full Vibe-named semantic layer |
| `tokens/dark.css` | The dark theme, under `[data-theme="dark"]` |
| `tokens/typography.css` | Vibe's screen scale, plus the Fieldwork brand families |
| `tokens/spacing.css` · `radius.css` · `shadows.css` · `motion.css` | The rest of the foundations |
| `tokens/base.css` · `fonts.css` | Mirrored for completeness; **the app does not import them** — `../theme/tokens.css` says why |
| `styles.css` | The design project's own entry point, kept so the mirror is complete |

**Not mirrored, on purpose:**

- **The ~50 JSX components** (`components/core/Button.jsx` and friends). They exist in the
  design project because it renders in a browser with no bundler. This app uses the real
  `@vibe/core` React components, which are the more complete implementation of the same
  contract. Two implementations of `Button` would be two things to keep in step.
- **The 276 Vibe icons.** The app already has them through `@vibe/icons`. Only the Lofty
  glyphs — the ones Vibe does not ship — are worth copying, and they live in
  [`../theme/loftyIcons.tsx`](../theme/loftyIcons.tsx).
- **The six Fieldwork `.woff` files.** Fieldwork is for brand-led surfaces: decks, print,
  proposals. The design system is explicit that product screens use Figtree and Poppins,
  so shipping ~300 KB of fonts no screen asks for would cost every visitor for nothing.
  `--brand-font-family` falls back to Poppins, so a brand token used here degrades to the
  product face rather than to a system serif.
- **The brand logo colourways and the lines/shapes silhouettes.** Real, and available — but
  the app has no surface that uses them yet, and a decorative asset nobody renders is
  weight in the bundle and a thing to keep in step. Pull them when a screen needs them.

## Syncing

There is no `npm run` for this: the design project is read through Claude's `DesignSync`
tool, not over HTTP with a token, so the sync is a conversation rather than a cron job.
Ask Claude:

> Sync the design-system mirror from Lofty's App Design System.

and it will list the project's files, fetch the ones this directory mirrors, write them
here verbatim, and tell you what moved. Then:

```bash
cd app
npm run check:design-tokens   # loftyTheme.ts still agrees with the mirror
npm run build                 # the tokens still resolve
```

**Sync is one-way, into this repository.** The `DesignSync` tool can write back to the
design project, and this repo never should: the design project is where design decisions
are made, and a code change that silently edited it would put the two out of step in the
direction that is hardest to notice.

### The one thing the mirror cannot hold

`../theme/loftyTheme.ts` repeats brand hexes as literal strings, because Vibe's
`ThemeProvider` takes a plain object and generates CSS from it — it cannot read a CSS
custom property. `npm run check:design-tokens` resolves the mirror's `var()` chains and
compares them against that file — 24 values across the three themes — and CI runs it, so
the duplication cannot drift quietly. It was proved by breaking it in both directions
before it was trusted.

The check derives which mirror token each theme key maps to from the name itself, rather
than holding its own table of that mapping. An earlier version held the table, and it went
stale the first time the design system moved: the 7 September brand rule changed
`--text-color-on-primary` to Finisher White, and the check went red claiming
`loftyTheme.ts` disagreed with a mirror it in fact matched. A check that can be wrong about
which file is at fault is worse than no check, because it sends you to edit the right value
back out of the right file.

## How the app consumes this

`../theme/tokens.css` imports the token files and then **re-declares the semantic layer at
`body.<theme>-app-theme` specificity**. That is not redundancy. The mirror declares its
tokens on `:root`; Vibe declares its own palette on the class it puts on `<body>`, and a
class beats an element selector — so a bare `:root` declaration loses and every Vibe
component paints monday.com blue. The names repeat; the values do not, because the
re-declarations are `var(--lofty-*)` references back into this directory.

`App.tsx` also stamps `data-theme` on `<html>`, because `dark.css` declares the entire
`--lofty-dark-*` palette under `[data-theme="dark"]`. Without that stamp those names are
undefined and dark mode silently falls back to the light values.
