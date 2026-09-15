import { Dropdown } from "@vibe/core";

/**
 * Vibe's Dropdown, narrowed to the one shape this app uses.
 *
 * Dropdown is generic over its item type and its `value`/`onChange` signatures widen to
 * cover multi-select. Rather than fight that at forty call sites, the cast lives here
 * once and every screen gets a plain `{ value, label }[]` API.
 */

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * The props, split on `clearable` so the callback says what can actually arrive.
 *
 * A clearable Select genuinely can hand back nothing, and a caller has to handle it;
 * a plain one never does, and widening its callback to `string | null` would push a
 * null check into forty sites that cannot reach it. So the two shapes are separate
 * and TypeScript picks the right one from the flag.
 */
type SelectProps = {
  options: SelectOption[];
  value: string | null;
  placeholder?: string;
  "aria-label": string;
  size?: "small" | "medium" | "large";
  className?: string;
  /**
   * Keep the caller's order instead of sorting the labels.
   *
   * Amber, 3 September: *"in all drop downs you should have them in alphabetical order
   * (unless they staged order)"*. The exception is the point — a lifecycle picker that
   * offers Acquisition & Development, Cancelled, Closed, Completed, Construction is
   * alphabetical and useless, because the order IS the information. So sorting is the
   * default and this opts out, one flag at the few call sites where sequence means
   * something: the lifecycle, a stage's run of processes, a roadmap's phases.
   */
  ordered?: boolean;
} & (
  | {
      /** Only for controls that can genuinely hold nothing — a filter, not a view. */
      clearable: true;
      onChange: (value: string | null) => void;
    }
  | {
      clearable?: false;
      onChange: (value: string) => void;
    }
);

export function Select({
  options,
  value,
  onChange,
  placeholder,
  "aria-label": ariaLabel,
  size = "small",
  clearable = false,
  className,
  ordered = false
}: SelectProps) {
  /**
   * Alphabetical unless the caller says the order carries meaning.
   *
   * `numeric` matters more than it looks: without it "Stage 10" sorts between "Stage 1"
   * and "Stage 2", which is exactly the list this app is full of. `localeCompare` with
   * numeric collation puts them in the order a person would write them.
   */
  const items = (ordered ? options : sortOptions(options)).map(o => ({ value: o.value, label: o.label }));
  const selected = items.find(o => o.value === value) ?? null;

  return (
    <Dropdown
      className={className}
      size={size}
      placeholder={placeholder}
      clearable={clearable}
      aria-label={ariaLabel}
      /**
       * Type to narrow the list, as the suburb field does — Amber asked for the same
       * behaviour everywhere: *"you should be able to type into the field to see the
       * options and select (like you can with suburubs in creating an address)"*.
       *
       * Unlike SuburbField this stays a Dropdown rather than becoming a text box: a
       * suburb has to be typeable because a locality missing from a July dataset is a
       * real place, whereas a team, a stage or a process is a closed set and typing one
       * that is not on the list is a mistake, not a new fact.
       */
      searchable
      options={items as never}
      /**
       * `null`, not `undefined`, when nothing is selected.
       *
       * Vibe reads an `undefined` value as "this Dropdown is uncontrolled" and falls
       * back to the selection it is holding internally — so clearing updated our state,
       * re-rendered with `undefined`, and the trigger went on displaying the option that
       * had just been cleared. The filter was off and the control said it was on.
       */
      value={selected as never}
      onChange={((option: SelectOption | null) => {
        if (option) onChange(option.value);
      }) as never}
      /**
       * WHY THE × NEEDED THIS PROP TO DO ANYTHING
       *
       * Vibe's clear button runs `onClear ? onClear() : reset()`, and `reset()` is
       * downshift's — it clears the *uncontrolled* selection inside the component.
       * This Dropdown is controlled: `value` is recomputed from our state on the very
       * next render and puts the old choice straight back. Nothing ever reached the
       * caller, so every clearable filter in the app rendered an × that visibly did
       * nothing — pick a table on the dictionary and you could not get back to all of
       * them without reloading the page.
       *
       * Passing `onClear` is what turns the button into the branch that reports.
       * Only when `clearable`, so a non-clearable Select cannot emit a null its
       * caller has not been typed to expect.
       */
      onClear={clearable ? () => (onChange as (v: string | null) => void)(null) : undefined}
    />
  );
}

export const toOptions = (values: readonly string[]): SelectOption[] =>
  values.map(v => ({ value: v, label: v }));

/**
 * The one sort every dropdown uses — shared so `Select`, `MultiSelect` and the typeahead
 * cannot disagree about where "Stage 10" goes.
 */
export const sortOptions = <T extends { label: string }>(options: readonly T[]): T[] =>
  [...options].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" }));

/**
 * The same Dropdown in multi mode, for the fields that hold a set rather than a value.
 *
 * Separate from `Select` rather than a flag on it because the two have genuinely
 * different signatures — `value` is an array, `onChange` hands back an array — and
 * threading both through one component means every caller carries a union it does not
 * use. The cast stays here for the same reason it does above: once, not at each site.
 */
export function MultiSelect({
  options,
  value,
  onChange,
  placeholder,
  "aria-label": ariaLabel,
  size = "small",
  className,
  ordered = false
}: {
  options: SelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  "aria-label": string;
  size?: "small" | "medium" | "large";
  className?: string;
  /** Keep the caller's order — the same opt-out `Select` has, for the same reason. */
  ordered?: boolean;
}) {
  // Alphabetical by default, exactly as `Select` is. This was the one dropdown that kept
  // insertion order, so a team picker offered Estimating before Admin because that was
  // the order the rows came back in — the one gap in "all drop downs alphabetical".
  const items = (ordered ? options : sortOptions(options)).map(o => ({ value: o.value, label: o.label }));
  const selected = value
    .map(v => items.find(o => o.value === v))
    .filter((o): o is SelectOption => Boolean(o));

  return (
    <Dropdown
      multi
      multiline
      className={className}
      size={size}
      placeholder={placeholder}
      aria-label={ariaLabel}
      options={items as never}
      value={selected as never}
      onChange={((opts: SelectOption[] | null) =>
        onChange((opts ?? []).map(o => o.value))) as never}
    />
  );
}
