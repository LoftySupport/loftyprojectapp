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
