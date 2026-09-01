import { useEffect, useRef, useState } from "react";
import { Button, Text } from "@vibe/core";
import "./ui.css";

/**
 * The date range picker — **the app's standard one** (Amber, 1 Sep: *"this is the default
 * way for every date picker in the app"*).
 *
 * ============================================================================
 * WHY A COMPONENT AND NOT A SELECT
 *
 *   The tracker and the jobs board each had their own idea of what "filter by date"
 *   meant. The jobs toolbar offered three fixed options in a dropdown — last 7 days, last
 *   30 days, this month — and there was no way to say "the fortnight of the handover" at
 *   all. Two screens with two vocabularies is how somebody learns the app twice.
 *
 *   So: one control, one serialisation, one set of words. Anywhere a date range is
 *   filtered on, this is the control, and `matchesRange` is what decides.
 * ============================================================================
 *
 * ---------------------------------------------------------------- the presets
 * Amber's list exactly: today, yesterday, last 7 days, last 30 days, next 30 days, and a
 * custom range chosen from a picker.
 *
 * Both directions are here on purpose. A tracker filters BACKWARDS — what came in this
 * week — and a roadmap filters FORWARDS — what is due in the next month. A picker with
 * only past presets makes the forward question a custom range every time.
 */

export const DATE_PRESETS = ["today", "yesterday", "7d", "30d", "next30", "custom"] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  next30: "Next 30 days",
  custom: "Custom"
};

/**
 * Null is "any date" — not a preset, and deliberately not a member of the union: an
 * "any" preset would be a filter that is always on and filters nothing, which is how a
 * cleared control ends up still narrowing the list.
 */
export interface DateRange {
  preset: DatePreset;
  /** ISO yyyy-mm-dd. Only meaningful for `custom`; either end may be open. */
  start: string | null;
  end: string | null;
}

const DAY = 86_400_000;

const startOfDay = (t: number | Date | string) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** yyyy-mm-dd in LOCAL time — `toISOString()` is UTC and shifts the day in Australia. */
export function toDateInput(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * The half-open window a range covers: `from` inclusive, `to` EXCLUSIVE.
 *
 * Exclusive on purpose. "Today" has to include something stamped at 23:59, and the
 * alternative — an inclusive end at midnight — silently drops the last day of every
 * range. That is the classic off-by-one in date filtering and it is invisible, because
 * the range still looks right in the control.
 *
 * Either end may be null, which means unbounded on that side.
 */
export function rangeBounds(range: DateRange | null, now = Date.now()): {
  from: number | null;
  to: number | null;
} {
  if (!range) return { from: null, to: null };
  const today = startOfDay(now);
  switch (range.preset) {
    case "today":     return { from: today, to: today + DAY };
    case "yesterday": return { from: today - DAY, to: today };
    case "7d":        return { from: today - 6 * DAY, to: today + DAY };
    case "30d":       return { from: today - 29 * DAY, to: today + DAY };
    case "next30":    return { from: today, to: today + 31 * DAY };
    case "custom":
      return {
        from: range.start ? startOfDay(range.start) : null,
        to: range.end ? startOfDay(range.end) + DAY : null
      };
  }
}

/** Does a timestamp fall in the range? Null range means no filter, so everything passes. */
export function matchesRange(iso: string | null | undefined, range: DateRange | null, now = Date.now()): boolean {
  if (!range) return true;
  if (!iso) return false;
  const { from, to } = rangeBounds(range, now);
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return (from === null || t >= from) && (to === null || t < to);
}

/* ------------------------------------------------------------------ the URL form
   One string, so a range rides the query string like every other piece of board state
   and a filtered view can be linked to and saved. `custom` carries its ends; a preset
   carries only its name, because the dates it means are the reader's today and not the
   writer's. */

export function serialiseRange(range: DateRange | null): string | null {
  if (!range) return null;
  if (range.preset !== "custom") return range.preset;
  if (!range.start && !range.end) return null;
  return `custom:${range.start ?? ""}..${range.end ?? ""}`;
}

export function parseRange(raw: string | null | undefined): DateRange | null {
  if (!raw) return null;
  if (raw.startsWith("custom:")) {
    const [start, end] = raw.slice(7).split("..");
    if (!start && !end) return null;
    return { preset: "custom", start: start || null, end: end || null };
  }
  return DATE_PRESETS.includes(raw as DatePreset) && raw !== "custom"
    ? { preset: raw as DatePreset, start: null, end: null }
    : null;
}

const short = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** What the closed control says. Never "Custom" on its own — that names the mechanism. */
export function rangeLabel(range: DateRange | null): string {
  if (!range) return "Any date";
  if (range.preset !== "custom") return DATE_PRESET_LABELS[range.preset];
  if (range.start && range.end) return `${short(range.start)} – ${short(range.end)}`;
  if (range.start) return `From ${short(range.start)}`;
  if (range.end) return `Until ${short(range.end)}`;
  return "Any date";
}

export function DateRangeFilter({ value, onChange, label = "Date", ariaLabel }: {
  value: DateRange | null;
  onChange: (v: DateRange | null) => void;
  label?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(value?.start ?? "");
  const [end, setEnd] = useState(value?.end ?? "");
  const wrap = useRef<HTMLDivElement>(null);

  // Re-seed the inputs whenever the control is opened, so a popover reopened after a
  // preset was chosen elsewhere does not show the last thing that was typed into it.
  useEffect(() => {
    if (open) {
      setStart(value?.start ?? "");
      setEnd(value?.end ?? "");
    }
  }, [open, value]);

  // Close on an outside click and on Escape. Both, not one: a popover that only closes
  // on a click traps the keyboard, and one that only closes on Escape is a popover most
  // people cannot get rid of.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (preset: DatePreset) => {
    if (preset === "custom") {
      // Custom is not a value on its own — it opens the two inputs. Choosing it and
      // typing nothing must not become a filter that matches everything.
      setStart(start || toDateInput(Date.now()));
      setEnd(end || toDateInput(Date.now()));
      return;
    }
    onChange({ preset, start: null, end: null });
    setOpen(false);
  };

  const applyCustom = () => {
    if (!start && !end) onChange(null);
    else onChange({ preset: "custom", start: start || null, end: end || null });
    setOpen(false);
  };

  const active = (p: DatePreset) => value?.preset === p;

  return (
    <div className="toolbar-field dr-wrap" ref={wrap}>
      {label && <span className="toolbar-label">{label}</span>}
      <button
        type="button"
        className={`dr-trigger${value ? " is-set" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel ?? "Filter by date"}
        onClick={() => setOpen(o => !o)}
      >
        {rangeLabel(value)}
      </button>

      {open && (
        <div className="dr-pop" role="dialog" aria-label="Choose a date range">
          <div className="dr-chips">
            {DATE_PRESETS.map(p => (
              <button
                key={p}
                type="button"
                className={`dr-chip${active(p) || (p === "custom" && value?.preset === "custom") ? " is-on" : ""}`}
                aria-pressed={active(p)}
                onClick={() => pick(p)}
              >
                {DATE_PRESET_LABELS[p]}
              </button>
            ))}
          </div>

          <div className="dr-fields">
            <label className="dr-field">
              <Text type="text3" color="secondary" element="span">Start</Text>
              <input type="date" value={start} max={end || undefined}
                     onChange={e => setStart(e.target.value)} aria-label="Start date" />
            </label>
            <span className="dr-dash" aria-hidden>–</span>
            <label className="dr-field">
              <Text type="text3" color="secondary" element="span">End</Text>
              <input type="date" value={end} min={start || undefined}
                     onChange={e => setEnd(e.target.value)} aria-label="End date" />
            </label>
          </div>

          <div className="dr-actions">
            <button type="button" className="dr-clear"
                    onClick={() => { setStart(""); setEnd(""); onChange(null); setOpen(false); }}>
              Clear dates
            </button>
            <Button size="small" onClick={applyCustom}>Done</Button>
          </div>
        </div>
      )}
    </div>
  );
}
