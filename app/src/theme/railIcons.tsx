/**
 * The client's own construction glyphs, for the navigation rail.
 *
 * Traced from the PNGs Lofty supplied and handed over as SVG on 11 September —
 * `docs/design/handoff/sidebar-navigation/assets/icons-lofty-svg/`, audited in
 * `ICONS.md` beside them. Six of the fourteen: the six the rail actually points at.
 * `Design` and `JobMeasure` have no destination and are deliberately absent rather than
 * imported and unused; `SettingsGear`, `SettingsGearOutline`, `SettingsUser` and `Team`
 * are superseded by design-system glyphs, which `ICONS.md` says outright — *"the design
 * system already carries them: Settings, Person, Location, Bookmark, Search, Note,
 * Group, the chevrons."*
 *
 * **Replace these wholesale when the client's vector originals arrive; do not edit
 * them.** The trace existed to unblock the build, not to become the master. That is the
 * handoff's instruction and it is the reason each glyph is a separate function here:
 * swapping one is a paste, not a merge.
 *
 * THE 24-VERSUS-28 RULE, WHICH IS NOT A ROUNDING ERROR
 *
 *   Every path sits inside a 3–21 box on a 24 grid, so each glyph carries about 3px of
 *   its own padding on every side. Rendered at 24px beside a design-system glyph that
 *   fills its box, a Lofty glyph reads noticeably lighter. **28px is what makes the two
 *   families the same weight**, which is why the collapsed rail asks for 28 here and 24
 *   there. `ICONS.md`: *"Do not re-crop them."* Cropping to the ink would fix the size
 *   and break the family.
 *
 * The C2PA content-credential blob each source file carries — 7.5 kB per icon against
 * about 300 bytes of path — is not copied, for the same reason `loftyIcons.tsx` gives:
 * provenance belongs with the signed original in the design project, and the app ships
 * the drawing.
 *
 * Same call contract as `@vibe/icons`, `houseIcons.tsx` and `loftyIcons.tsx` — a `size`
 * prop, paint from `currentColor` — so the rail treats all four identically and a row
 * does not care which family its glyph came from.
 */
interface IconProps {
  size?: number | string;
}

/** Stroked 24×24, one weight across the set. Matches the traced SVGs exactly. */
const frame = (size: number | string | undefined) => ({
  width: size ?? 20,
  height: size ?? 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const
});

/** Four panes of a board — My work. */
export function Dashboard({ size }: IconProps) {
  return (
    <svg {...frame(size)}>
      <rect x="3.4" y="3.4" width="7.4" height="6.4" rx="2" />
      <rect x="3.4" y="12.8" width="7.4" height="7.8" rx="2" />
      <rect x="13.2" y="3.4" width="7.4" height="9.6" rx="2" />
      <rect x="13.2" y="16" width="7.4" height="4.6" rx="2" />
    </svg>
  );
}

/** Two houses, one behind the other — a project holds many dwellings. */
export function Projects({ size }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M12.6 11 L16.8 7.2 L21 11" />
      <path d="M14.2 10 V18.8 H19.6 V11.6" />
      <path d="M3 13 L9.2 7.6 L15.4 13" />
      <path d="M4.6 11.8 V19.8 H13.8 V11.8" />
      <path d="M8 19.8 V15.6 H10.4 V19.8" />
    </svg>
  );
}

/** Crossed spanner and screwdriver — Maintenance. */
export function Maintenance({ size }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M8.4 3.2 a4.2 4.2 0 0 0 -2 6.9 a4.2 4.2 0 0 0 4.4 1 l6.9 6.9 a2 2 0 0 0 2.8 -2.8 l-6.9 -6.9 a4.2 4.2 0 0 0 -1 -4.4 l-2.3 2.3 l-2.3 -0.7 l-0.7 -2.3 Z" />
      <path d="M19.4 2.6 l2 2 l-2.6 2.6 l-2 -2 Z" />
      <path d="M16.5 6.1 l1.4 1.4 l-9 9 l-1.4 -1.4 Z" />
      <path d="M7.5 15.1 l1.4 1.4 l-3 1.6 Z" />
    </svg>
  );
}

/** Rising bars under a rising line — Reports. */
export function Reports({ size }: IconProps) {
  return (
    <svg {...frame(size)}>
      <rect x="4" y="14.6" width="3.6" height="5.6" rx="0.8" />
      <rect x="9.8" y="12.2" width="3.6" height="8" rx="0.8" />
      <rect x="15.6" y="9" width="3.6" height="11.2" rx="0.8" />
      <path d="M4.6 12 L9.4 7.6 L13.2 10.2 L19.4 4.2" />
      <path d="M15.6 4.2 H19.8 V8.4" />
    </svg>
  );
}

/** A folded page with a plus — Tools: the things you use to make something. */
export function Documents({ size }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M7.2 3.4 H14 L18.6 8 V20.6 H7.2 Z" />
      <path d="M13.8 3.6 V8.2 H18.4" />
      <path d="M12.9 11.6 V17" />
      <path d="M10.2 14.3 H15.6" />
    </svg>
  );
}

/**
 * A terminal prompt in a rounded square — Admin.
 *
 * One file, from two. `ICONS.md` records that `Admin.png` and `AdminConsole.png` were
 * the same mark drawn at two stroke weights; normalising the weight made them identical,
 * so the set ships one.
 */
export function AdminConsole({ size }: IconProps) {
  return (
    <svg {...frame(size)}>
      <rect x="3.4" y="3.4" width="17.2" height="17.2" rx="4.4" />
      <path d="M8.4 9.1 L11.5 12 L8.4 14.9" />
      <path d="M13.4 14.9 H16.4" />
    </svg>
  );
}
