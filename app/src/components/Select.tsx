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

export function Select({
  options,
  value,
  onChange,
  placeholder,
  "aria-label": ariaLabel,
  size = "small",
  clearable = false,
  className
}: {
  options: SelectOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  "aria-label": string;
  size?: "small" | "medium" | "large";
  /** Only for controls that can genuinely hold nothing — a filter, not a view. */
  clearable?: boolean;
  className?: string;
}) {
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
      value={(selected ?? undefined) as never}
      onChange={((option: SelectOption | null) => {
        if (option) onChange(option.value);
      }) as never}
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
