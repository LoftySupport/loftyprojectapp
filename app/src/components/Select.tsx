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
  className
}: SelectProps) {
  const items = options.map(o => ({ value: o.value, label: o.label }));
  const selected = items.find(o => o.value === value) ?? null;

  return (
    <Dropdown
      className={className}
      size={size}
      placeholder={placeholder}
      clearable={clearable}
      aria-label={ariaLabel}
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
  className
}: {
  options: SelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  "aria-label": string;
  size?: "small" | "medium" | "large";
  className?: string;
}) {
  const items = options.map(o => ({ value: o.value, label: o.label }));
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
