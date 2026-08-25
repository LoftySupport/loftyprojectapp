import { useEffect, useRef, useState } from "react";
import { TextField } from "@vibe/core";
import { councilForSuburb, isAmbiguousSuburb, postcodeForSuburb, suggestSuburbs } from "../data/saSuburbs";
import "./ui.css";

/**
 * The suburb, with the rest of the address behind it.
 *
 * Lofty asked for the ecommerce behaviour — "as soon as you get to 14 brod… it shows a
 * dropdown and you select and it fills in the rest" — and said no to Google Places, then
 * supplied the two datasets that make most of it possible offline: the LGA's councils by
 * suburb, and SA suburbs with postcodes. So this is that, at suburb level: type three
 * letters, pick a suburb, and the postcode and council fill themselves in.
 *
 * WHAT IT STILL CANNOT DO
 *
 *   Street numbers and street names. Those need a street-level address service, which is
 *   the part Places was for. The three fields it does fill are the three that were being
 *   typed by hand every time.
 *
 * WHY IT IS NOT A DROPDOWN
 *
 *   A Dropdown restricts you to its options, and a new locality that is not on a list
 *   published in July has to be typeable. So this stays a text field and offers
 *   suggestions beside it — the list is help, not a gate.
 */
export function SuburbField({
  value,
  onPick,
  onType,
  id = "addr-suburb"
}: {
  value: string;
  /** A suburb chosen from the list — postcode and council are known for it. */
  onPick: (suburb: string, postcode: string | null, council: string | null) => void;
  /** Free text. Still resolved on an exact match, so typing it in full works too. */
  onType: (suburb: string) => void;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [matches, setMatches] = useState<string[]>([]);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const found = suggestSuburbs(value);
    setMatches(found);
    setActive(0);
  }, [value]);

  // A click anywhere else closes the list. Without this it survives a click on the next
  // field and covers it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const choose = (suburb: string) => {
    setOpen(false);
    onPick(suburb, postcodeForSuburb(suburb), isAmbiguousSuburb(suburb) ? null : councilForSuburb(suburb));
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open || matches.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(i => (i + 1) % matches.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(i => (i - 1 + matches.length) % matches.length); }
    else if (e.key === "Enter") { e.preventDefault(); choose(matches[active]); }
    else if (e.key === "Escape") { setOpen(false); }
  };

  return (
    <div className="suburb-field" ref={box} onKeyDown={onKey}>
      <TextField
        id={id}
        value={value}
        onChange={v => { onType(v); setOpen(true); }}
        inputAriaLabel="Suburb"
        required
        autoComplete="off"
      />
      {open && matches.length > 0 && (
        /* `role="listbox"` with the input above it is the combobox pattern; the input
           keeps its own label, and each option says its postcode because two suburbs
           with similar names are told apart by exactly that. */
        <ul className="suburb-suggestions" role="listbox" aria-label="Suburb suggestions">
          {matches.map((m, i) => (
            <li key={m}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                className={"suburb-suggestion" + (i === active ? " is-active" : "")}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(m)}
              >
                <span>{m}</span>
                <span className="suburb-postcode">{postcodeForSuburb(m) ?? ""}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
