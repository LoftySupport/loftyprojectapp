/**
 * Lofty's own nav icons (Amber, 27 Aug — supplied as images, redrawn as strokes).
 *
 * A builder's app gets builder's icons: a project holds many houses, a job is one
 * site on the map, and the reports are the house doing well. (Amber, 27 Aug, on the
 * first cut having the first two the other way round: the pin marks a single place,
 * which is what a job is.) Same call contract as
 * @vibe/icons (`size` prop, currentColor) so the nav treats them identically, and the
 * collapsed rail keeps its meaning.
 */
interface IconProps {
  size?: number | string;
}

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

/** A house inside a map pin, standing on its site — Jobs: one job, one place. */
export function HousePin({ size }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M12 20.5c3.6-4 6.5-7 6.5-10.3a6.5 6.5 0 1 0-13 0c0 3.3 2.9 6.3 6.5 10.3z" />
      <path d="M9.6 12.6v-2.4L12 8.1l2.4 2.1v2.4h-4.8z" />
      <path d="M3 21.5h4.5M16.5 21.5H21" />
    </svg>
  );
}

/** Two houses, one behind the other — Projects: the dwellings a project holds. */
export function Houses({ size }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M4 18v-7l4.5-4L13 11" />
      <path d="M4 18h5" />
      <path d="M9 18v-6.2l5.5-4.8 5.5 4.8V18H9z" />
      <path d="M13.2 18v-3.4h2.6V18" />
    </svg>
  );
}

/** A house with rising bars inside — Reports. */
export function HouseChart({ size }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M5 11.2V19h14v-7.8" />
      <path d="M3.5 11.8 12 4.5l8.5 7.3" />
      <path d="M9 19v-3.5M12 19v-5.5M15 19v-7.5" />
    </svg>
  );
}
