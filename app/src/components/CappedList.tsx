import { useState, type ReactNode } from "react";

/**
 * Show the first few of a list, then "Show all (N)".
 *
 * Amber, 7 September: *"when there is more than 5 of anything have the ability to click to
 * show all as otherwise too many"*. A job with forty audit lines or a dozen tasks turns a
 * panel into a page, and in a 460px drawer that means the panel below it is off-screen
 * before you have read the one above.
 *
 * WHY IT TAKES AN ARRAY RATHER THAN CHILDREN. Capping `children` would need
 * `React.Children.toArray`, which flattens fragments and renumbers keys — a list that came
 * from a `.map()` would silently lose its identity and re-mount every row on every render.
 * Taking the items and the render function keeps the caller's keys intact.
 *
 * NOT A SCROLL BOX. A fixed-height scroller inside a scrolling drawer gives you two
 * scrollbars in the same gesture and the inner one steals the wheel, which is the fault
 * this app has already fixed twice elsewhere. Showing fewer rows and offering the rest is
 * the version that survives being nested.
 *
 * The count in the label is the TOTAL, not the remainder: "Show all (12)" tells you how big
 * the thing is before you commit to it, where "Show 7 more" makes you do the addition.
 */
interface CappedListProps<T> {
  items: readonly T[];
  /** How many to show before the button appears. Amber's number is 5. */
  cap?: number;
  children: (item: T, index: number) => ReactNode;
  /** Overrides the button label's noun — "Show all 12 comments" reads better than "(12)". */
  noun?: string;
}

export function CappedList<T>({ items, cap = 5, children, noun }: CappedListProps<T>) {
  const [all, setAll] = useState(false);
  // Strictly MORE than the cap. At exactly five the button would hide nothing and cost a
  // click to prove it.
  const capped = !all && items.length > cap;
  const shown = capped ? items.slice(0, cap) : items;

  return (
    <>
      {shown.map((item, i) => children(item, i))}
      {capped && (
        <button type="button" className="capped-more" onClick={() => setAll(true)}>
          Show all {items.length}{noun ? ` ${noun}` : ""}
        </button>
      )}
    </>
  );
}
