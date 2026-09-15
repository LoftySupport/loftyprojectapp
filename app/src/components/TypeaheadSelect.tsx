import { useEffect, useId, useMemo, useRef, useState } from "react";
import { TextField } from "@vibe/core";
import { sortOptions } from "./Select";
import "./ui.css";

/**
 * A picker you type into — the suburb field's behaviour, for any closed list.
 *
 * Amber, 7 September, on choosing a team or a person: *"when you start typing a name it
 * auto selects them … for example like how it works in the suburb app in address"*. The
 * Vibe Dropdown does filter as you type, but it is still a dropdown: the list is a menu,
 * the highlight is a menu's highlight, and nothing is chosen until you press Enter or
 * click. The suburb field is a text box with a list under it, and it is the thing she
 * pointed at, so this is that shape made general.
 *
 * WHAT "AUTO SELECTS" MEANS HERE, precisely, because it is easy to over-do:
 *
 *   - Typing narrows the list and the first match is highlighted, so Enter or Tab takes
 *     it. Tab is the one that matters for speed — "dea⇥" is Deanna, hands never leave
 *     the keyboard.
 *   - When the typed text leaves EXACTLY ONE match, leaving the field picks it too. That
 *     is the ecommerce behaviour: you typed enough to be unambiguous, so it is chosen.
 *   - When it leaves several, leaving the field picks NOTHING and the box shows the
 *     current value again. Guessing between two Sams is precisely the wrong thing to do.
 *
 * Grouped, when the caller says so: `group` on an option puts a small heading over its
 * run, in the order groups first appear. `PersonSelect` uses it for "in this team" and
 * "other teams". Within a group the options are alphabetical unless `ordered`.
 *
 * WHY NOT SUBURBFIELD ITSELF. That one accepts free text, because a locality missing
 * from a July dataset is a real place. Here the set is closed — a person who is not on
 * the list is not a person the app knows — so free text that matches nothing is not a
 * value, and the field says so by reverting.
 *
 * `onCreate` OPENS THE LIST, DELIBERATELY NARROWLY
 *
 *   Amber, 14 September, on picking the trade for a maintenance issue: *"you should be
 *   able to start typing the field and the name will come up if in the system, if it
 *   isn't there they can type in and it can says 'Add new company' when no results and by
 *   pressing enter it will add that company in as typed"*.
 *
 *   So a caller may pass `onCreate`, and the row appears **only when the typed text
 *   matches nothing**. It is not a free-text field with a list attached: while anything
 *   matches, the list is closed exactly as before, because offering to create a second
 *   "Bianco Tiling" next to the one already there is how a contractor list becomes two
 *   contractor lists. The caller does the creating and sets the value; this component
 *   only reports the text that was typed.
 */

export interface TypeaheadOption {
  value: string;
  label: string;
  /** A quieter second line — the team beside a name, a postcode beside a suburb. */
  sub?: string | null;
  /** A heading the option sits under. Options without one come first, unheaded. */
  group?: string | null;
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

/** Every typed word has to appear somewhere in the label or the sub — "dea est" finds Deanna in Estimating. */
function matches(o: TypeaheadOption, query: string): boolean {
  const hay = norm(`${o.label} ${o.sub ?? ""}`);
  return norm(query).split(/\s+/).filter(Boolean).every(w => hay.includes(w));
}

export function TypeaheadSelect({
  options,
  value,
  onChange,
  placeholder,
  "aria-label": ariaLabel,
  id,
  className,
  disabled,
  ordered = false,
  clearable = false,
  emptyText = "No matches",
  onCreate,
  createLabel = typed => `Add “${typed}”`
}: {
  options: TypeaheadOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  "aria-label": string;
  id?: string;
  className?: string;
  disabled?: boolean;
  /** Keep the caller's order within a group — a stage's processes, a roadmap's phases. */
  ordered?: boolean;
  /** Draw the × and let the field be emptied. Otherwise clearing reverts to the value. */
  clearable?: boolean;
  emptyText?: string;
  /** Offered only when the typed text matches nothing. The caller creates and sets the value. */
  onCreate?: (typed: string) => void;
  createLabel?: (typed: string) => string;
}) {
  const generated = useId();
  const inputId = id ?? `typeahead-${generated}`;
  const listId = `${inputId}-listbox`;

  const selected = useMemo(() => options.find(o => o.value === value) ?? null, [options, value]);

  // `text` is what is in the box. While the list is shut it mirrors the selection; while
  // open it is whatever has been typed, which is why the two are kept apart — a value
  // that changed underneath (another person's edit) replaces the text only when nobody
  // is mid-word in it.
  const [text, setText] = useState(selected?.label ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  // Follows the SELECTION, not the open state. Choosing writes to the record and the
  // caller re-reads; between the two the old value is still what `selected` says, and
  // resetting the text on close would blank the name just chosen until the read lands.
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => { if (!openRef.current) setText(selected?.label ?? ""); }, [selected]);

  /**
   * The list, in the order it is drawn: grouped, then alphabetical within the group.
   * While the box still shows the current selection's own label, everything is offered —
   * otherwise opening the field on "Deanna Smith" would show only Deanna.
   */
  const shown = useMemo(() => {
    const q = text.trim();
    const filtering = q !== "" && q !== (selected?.label ?? "");
    const pool = filtering ? options.filter(o => matches(o, q)) : options;
    const groups: string[] = [];
    pool.forEach(o => { const g = o.group ?? ""; if (!groups.includes(g)) groups.push(g); });
    // Unheaded options first, then the groups in the order the caller listed them.
    groups.sort((a, b) => (a === "" ? -1 : b === "" ? 1 : 0));
    const out: TypeaheadOption[] = [];
    groups.forEach(g => {
      const run = pool.filter(o => (o.group ?? "") === g);
      out.push(...(ordered ? run : sortOptions(run)));
    });
    return out;
  }, [options, text, selected, ordered]);

  /**
   * The create row, when there is one. Only with something typed and nothing matching it:
   * `shown.length` is the filtered list, so a query that narrows to one company offers
   * that company rather than a second copy of it.
   */
  const typed = text.trim();
  const canCreate = Boolean(onCreate) && typed !== "" && typed !== (selected?.label ?? "") && shown.length === 0;

  useEffect(() => {
    // The highlight follows the selection when the whole list is showing, and the first
    // match once typing has narrowed it — Enter then means "the one at the top".
    const at = shown.findIndex(o => o.value === value);
    setActive(at >= 0 && text === (selected?.label ?? "") ? at : 0);
  }, [shown, value, text, selected]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shown, text]);

  const choose = (o: TypeaheadOption) => {
    setOpen(false);
    setText(o.label);
    if (o.value !== value) onChange(o.value);
  };

  /**
   * Leaving the field. One unambiguous match is taken; anything else reverts to what was
   * already chosen. Emptying the box on a clearable field clears the value — that is the
   * keyboard route to "nobody", which the × also offers.
   */
  const close = () => {
    if (!open) return;
    setOpen(false);
    const q = text.trim();
    if (q === "") {
      if (clearable && value !== null) onChange(null);
      else setText(selected?.label ?? "");
      return;
    }
    if (q === (selected?.label ?? "")) return;
    // Leaving the field with a create on offer keeps the typed text rather than reverting:
    // the name is the only copy of what was typed, and the person is one Enter from using it.
    if (onCreate && shown.length === 0) return;
    const exact = shown.filter(o => norm(o.label) === norm(q));
    if (exact.length === 1) { choose(exact[0]); return; }
    if (shown.length === 1) { choose(shown[0]); return; }
    setText(selected?.label ?? "");
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      if (shown.length) setActive(i => (i + 1) % shown.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (shown.length) setActive(i => (i - 1 + shown.length) % shown.length);
    } else if (e.key === "Enter") {
      if (open && shown[active]) { e.preventDefault(); choose(shown[active]); }
      else if (open && canCreate) { e.preventDefault(); setOpen(false); onCreate?.(typed); }
    } else if (e.key === "Tab") {
      // Tab commits the highlight and moves on — no preventDefault, focus should leave.
      if (open && shown[active] && text.trim() !== "" && text !== (selected?.label ?? "")) choose(shown[active]);
      else close();
    } else if (e.key === "Escape") {
      if (open) { e.stopPropagation(); setOpen(false); setText(selected?.label ?? ""); }
    }
  };

  // Group headings are drawn where the group changes, walking the flat list.
  let lastGroup: string | null = null;

  return (
    <div className={"typeahead" + (className ? ` ${className}` : "")} ref={box} onKeyDown={onKey}>
      <TextField
        id={inputId}
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        onChange={v => { setText(v); setOpen(true); }}
        onFocus={() => setOpen(true)}
        inputAriaLabel={ariaLabel}
        autoComplete="off"
        size="small"
      />
      {/* A chevron, so this reads as a picker rather than as a text box.
          Amber, 14 September, of the drawer's Reported by: *"is reported by a dropdown to
          select from internal username"* — it always was, and the field gave no sign of
          it. Next to a Vibe `Dropdown` with its own chevron, a bare box says "type
          anything here", which is exactly what this control does not accept.
          Hidden while the × is showing: two glyphs in one corner is a target nobody can
          hit, and the × is the one you want when there is a value to clear. */}
      {!(clearable && value !== null) && !disabled && (
        <span className="typeahead-chevron" aria-hidden>▾</span>
      )}
      {clearable && value !== null && !disabled && (
        <button
          type="button"
          className="typeahead-clear"
          aria-label={`Clear ${ariaLabel}`}
          onMouseDown={e => e.preventDefault()}
          onClick={() => { setText(""); setOpen(false); onChange(null); }}
        >
          ×
        </button>
      )}
      {open && (
        <ul className="suburb-suggestions typeahead-list" role="listbox" id={listId} aria-label={`${ariaLabel} options`}>
          {shown.length === 0 && !canCreate && (
            <li className="typeahead-empty" aria-disabled="true">{emptyText}</li>
          )}
          {canCreate && (
            <li>
              <button
                type="button"
                className="suburb-suggestion typeahead-create is-active"
                onMouseDown={e => { e.preventDefault(); setOpen(false); onCreate?.(typed); }}
              >
                <span>{createLabel(typed)}</span>
                <span className="suburb-postcode typeahead-sub">Enter</span>
              </button>
            </li>
          )}
          {shown.map((o, i) => {
            const g = o.group ?? "";
            const heading = g && g !== lastGroup ? g : null;
            lastGroup = g;
            return (
              <li key={o.value}>
                {heading && <div className="typeahead-group" aria-hidden>{heading}</div>}
                <button
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  className={"suburb-suggestion" + (i === active ? " is-active" : "")}
                  onMouseEnter={() => setActive(i)}
                  // mousedown, not click: the input blurs on mousedown and a click handler
                  // would fire after the list has already closed underneath it.
                  onMouseDown={e => { e.preventDefault(); choose(o); }}
                >
                  <span>{o.label}</span>
                  {o.sub && <span className="suburb-postcode typeahead-sub">{o.sub}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
