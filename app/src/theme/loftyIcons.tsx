/**
 * The Lofty construction glyphs, from the design system.
 *
 * Copied from `assets/icons/` in Lofty's App Design System — see
 * `../design-system/README.md`. Eight of the fifteen Lofty-specific glyphs the design
 * project holds; the other seven are not copyable yet, and the reason is written down at
 * the bottom of this file so nobody re-discovers it.
 *
 * Same call contract as `@vibe/icons` and as `houseIcons.tsx` (a `size` prop, paint from
 * `currentColor`), so the nav, menus and table cells treat all three identically. Filled
 * 20×20 in the Vibe idiom, which is why they read as solid rather than stroked at 16px —
 * `houseIcons.tsx` is stroked 24×24 because it was drawn before this system existed.
 *
 * The C2PA content-credential blob each source file carries — about 14 kB per icon, more
 * than thirty times the glyph itself — is deliberately not copied. The signed originals
 * stay in the design project, which is where provenance belongs; the app ships the path.
 */
interface IconProps {
  size?: number | string;
}

const frame = (size: number | string | undefined) => ({
  width: size ?? 20,
  height: size ?? 20,
  viewBox: "0 0 20 20",
  fill: "currentColor",
  "aria-hidden": true as const
});

/** A clipboard with a tick — an approval step. */
export function Approval({ size }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7.2 1.4h5.6a1.2 1.2 0 0 1 1.2 1.2v.4h1.4A1.6 1.6 0 0 1 17 4.6V17a1.6 1.6 0 0 1-1.6 1.6H4.6A1.6 1.6 0 0 1 3 17V4.6A1.6 1.6 0 0 1 4.6 3H6v-.4a1.2 1.2 0 0 1 1.2-1.2Zm1.55 13.15L5.5 11.3l1.13-1.13 2.12 2.12 4.62-4.62 1.13 1.13-5.75 5.75Z"
      />
    </svg>
  );
}

/** An office block — the company, or a builder on a job. */
export function Company({ size }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M4.6 1.5h10.8a1.1 1.1 0 0 1 1.1 1.1V18.5H3.5V2.6a1.1 1.1 0 0 1 1.1-1.1Zm1.3 2.4v2.2h2.4V3.9H5.9Zm5.8 0v2.2h2.4V3.9h-2.4ZM5.9 7.1v2.2h2.4V7.1H5.9Zm5.8 0v2.2h2.4V7.1h-2.4ZM5.9 10.3v2.2h2.4v-2.2H5.9Zm5.8 0v2.2h2.4v-2.2h-2.4Zm-3.3 4.1h3.2v4.1H8.4v-4.1Z"
      />
    </svg>
  );
}

/** A stack of coins — costs. */
export function Costs({ size }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M10 1.8c3.87 0 7 1.3 7 2.9s-3.13 2.9-7 2.9S3 6.3 3 4.7s3.13-2.9 7-2.9Z" />
      <path d="M3 6.9v2.6c0 1.6 3.13 2.9 7 2.9s7-1.3 7-2.9V6.9c0 1.6-3.13 2.9-7 2.9S3 8.5 3 6.9Z" />
      <path d="M3 11.5v2.6c0 1.6 3.13 2.9 7 2.9s7-1.3 7-2.9v-2.6c0 1.6-3.13 2.9-7 2.9s-7-1.3-7-2.9Z" />
    </svg>
  );
}

/** A truck — a delivery to site. */
export function Delivery({ size }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M1.2 5.4a1.2 1.2 0 0 1 1.2-1.2h7.8a1.2 1.2 0 0 1 1.2 1.2v8.4H1.2V5.4Z" />
      <path d="M12.6 7.8h2.6c.39 0 .75.19.98.5l2 2.8c.15.2.22.45.22.7v2h-5.8V7.8Z" />
      <circle cx="5" cy="15.6" r="1.9" />
      <circle cx="15" cy="15.6" r="1.9" />
    </svg>
  );
}

/** A ruled sheet — the drawings. */
export function Drawings({ size }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path
        fillRule="evenodd"
        d="M3 2.5A1.5 1.5 0 0 1 4.5 1h11A1.5 1.5 0 0 1 17 2.5v15a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 17.5v-15Zm2 .5v14h10V3H5Zm1.5 4.5V9h7V7.5h-7Zm0 2.5v1.5h7V10h-7Zm0 2.5V14h4.5v-1.5H6.5Z"
      />
    </svg>
  );
}

/** A gridded take-off sheet — estimating. */
export function Estimating({ size }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M4.6 1.4h10.8A1.6 1.6 0 0 1 17 3v14a1.6 1.6 0 0 1-1.6 1.6H4.6A1.6 1.6 0 0 1 3 17V3a1.6 1.6 0 0 1 1.6-1.6Zm.8 2.5v3h9.2v-3H5.4Zm0 4.8v2.6H8V8.7H5.4Zm3.3 0v2.6h2.6V8.7H8.7Zm3.3 0v2.6h2.6V8.7H12Zm-6.6 3.5v2.6H8v-2.6H5.4Zm3.3 0v2.6h2.6v-2.6H8.7Zm3.3 0v2.6h2.6v-2.6H12Z"
      />
    </svg>
  );
}

/** Stacked bricks — materials. */
export function Materials({ size }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M4.2 3.2h5.2v3.6H4.2z" />
      <path d="M10.6 3.2h5.2v3.6h-5.2z" />
      <path d="M1.2 8h4.6v3.6H1.2z" />
      <path d="M7 8h6v3.6H7z" />
      <path d="M14.2 8h4.6v3.6h-4.6z" />
      <path d="M4.2 12.8h5.2v3.6H4.2z" />
      <path d="M10.6 12.8h5.2v3.6h-5.2z" />
    </svg>
  );
}

/** A hard hat — safety. */
export function Safety({ size }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M10 2.8a6.4 6.4 0 0 0-6.4 6.4v3.1h12.8V9.2A6.4 6.4 0 0 0 10 2.8Z" />
      <path d="M1.6 13.4h16.8a1.1 1.1 0 0 1 1.1 1.1v1.3a1.1 1.1 0 0 1-1.1 1.1H1.6a1.1 1.1 0 0 1-1.1-1.1v-1.3a1.1 1.1 0 0 1 1.1-1.1Z" />
    </svg>
  );
}

/**
 * The seven that are NOT here, and why.
 *
 * `Projects`, `JobHouse`, `JobSite`, `Reports`, `Maintenance`, `Design` and `FloorPlan`
 * exist in the design project as `.svg` files, but they are not vectors — each is an SVG
 * wrapper whose only content is `<image href="Projects.png">`, pointing at a PNG sibling.
 * Copied here they would render nothing, and they could not take `currentColor`, so they
 * would not work in the nav, in a dark theme, or in a destructive menu item.
 *
 * They need re-exporting from the design project as real paths. Until then the app keeps
 * its own hand-drawn `houseIcons.tsx` for the three of those it actually uses — Projects,
 * Jobs and Reports — so nothing is missing from any screen.
 */
