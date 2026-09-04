import { useEffect, useState } from "react";
import { Button, Text } from "@vibe/core";
import { Select } from "./Select";
import { fmtDate, fmtMoney, hasValue } from "../data/propertyFormat";
import type {
  MyPropertyAccess, PropertyDef, PropertyOption, PropertyValueData
} from "../data/types";
import "./processes.css";

/**
 * One property, rendered for its format and edited in place.
 *
 * The rules that shape it:
 *
 *   - A DATE is a tick box and a date (Amber, 1 Sep): ticking it records today, which
 *     is what "received" means nine times in ten; the date beside it is for the tenth,
 *     when it happened on Tuesday and is being logged on Thursday. Unticking clears it.
 *   - A value that exists is edited under the UPDATE rung, a value that does not under
 *     CREATE, and clearing is DELETE. Three rungs because the database has three, and a
 *     control the database would refuse is a control that must not be drawn.
 *   - `unknown` renders a sentence, not a control. The workbook had no type for 87
 *     fields, and until a person picks one nothing can be recorded — the CHECK says so.
 *   - Text saves on blur or Enter, never per keystroke: a history line per letter is
 *     noise, and the trigger writes one for every change.
 *
 * Read-only rendering is the same component with nothing to save through, so the
 * drawer and the report show a value the same way.
 */

export interface PropertyFieldProps {
  def: PropertyDef;
  value: PropertyValueData | null;
  access: MyPropertyAccess;
  options?: PropertyOption[];
  people?: { id: string; name: string }[];
  /** Absent means read-only however the access reads — a value borrowed from the project. */
  onSave?: (value: PropertyValueData | null) => Promise<void>;
  busy?: boolean;
}

const today = () => new Date().toISOString().slice(0, 10);

export function PropertyField({ def, value, access, options = [], people = [], onSave, busy }: PropertyFieldProps) {
  const has = value != null && hasValue(def, value);
  const mayWrite = onSave != null && (has ? access.canUpdate : access.canCreate);
  const mayClear = onSave != null && has && access.canDelete;
  const disabled = busy || !mayWrite;

  if (def.format === "unknown") {
    return (
      <Text type="text3" color="secondary" element="span" className="pf-unset">
        Format not set — pick one in Setup → Properties before this can be recorded
      </Text>
    );
  }

  const clear = mayClear ? (
    <Button kind="tertiary" size="xs" onClick={() => onSave?.(null)} disabled={busy} aria-label={`Clear ${def.label}`}>
      Clear
    </Button>
  ) : null;

  switch (def.format) {
    case "date": {
      const d = value?.date ?? null;
      if (onSave == null) return <Text type="text2" element="span" className="pf-readonly">{d ? fmtDate(d) : "—"}</Text>;
      return (
        <span className="pf-date">
          <input
            type="checkbox"
            checked={d != null}
            disabled={disabled && !(has && mayClear)}
            aria-label={`${def.label} done`}
            onChange={e => onSave?.(e.target.checked ? { date: today() } : null)}
          />
          <input
            type="date"
            className="date-input"
            aria-label={`${def.label} date`}
            value={d ?? ""}
            disabled={disabled}
            onChange={e => { if (e.target.value) onSave?.({ date: e.target.value }); }}
          />
          {d && <Text type="text3" color="secondary" element="span">{fmtDate(d)}</Text>}
        </span>
      );
    }
    case "checkbox":
      if (onSave == null) return <Text type="text2" element="span" className="pf-readonly">{value?.bool == null ? "—" : value.bool ? "Yes" : "No"}</Text>;
      return (
        <span className="pf-inline">
          <input
            type="checkbox"
            checked={value?.bool === true}
            disabled={disabled}
            aria-label={def.label}
            onChange={e => onSave?.({ bool: e.target.checked })}
          />
          <Text type="text3" color="secondary" element="span">
            {value?.bool == null ? "not recorded" : value.bool ? "yes" : "no"}
          </Text>
          {clear}
        </span>
      );
    case "person":
      return (
        <span className="pf-inline">
          {mayWrite ? (
            <Select
              className="pf-select"
              clearable
              placeholder="Nobody"
              aria-label={def.label}
              options={people.map(p => ({ value: p.id, label: p.name }))}
              value={value?.profileId ?? null}
              onChange={v => onSave?.(v ? { profileId: v } : null)}
            />
          ) : (
            <Text type="text2" element="span">
              {people.find(p => p.id === value?.profileId)?.name ?? (has ? "Someone you cannot see" : "—")}
            </Text>
          )}
        </span>
      );
    case "single select":
      return (
        <span className="pf-inline">
          {mayWrite ? (
            <Select
              className="pf-select"
              clearable
              placeholder={options.length ? "Choose" : "No options defined yet"}
              aria-label={def.label}
              options={options.filter(o => o.isActive || o.key === value?.optionKey).map(o => ({ value: o.key, label: o.label }))}
              value={value?.optionKey ?? null}
              onChange={v => onSave?.(v ? { optionKey: v } : null)}
            />
          ) : (
            <Text type="text2" element="span">
              {options.find(o => o.key === value?.optionKey)?.label ?? (has ? value?.optionKey : "—")}
            </Text>
          )}
        </span>
      );
    case "multi select": {
      const chosen = value?.optionKeys ?? [];
      if (!mayWrite) {
        return <Text type="text2" element="span">{chosen.length ? chosen.map(k => options.find(o => o.key === k)?.label ?? k).join(", ") : "—"}</Text>;
      }
      return (
        <span className="pf-multi">
          {options.filter(o => o.isActive || chosen.includes(o.key)).map(o => (
            <label key={o.key} className="pf-check">
              <input
                type="checkbox"
                checked={chosen.includes(o.key)}
                disabled={busy}
                onChange={e => {
                  const next = e.target.checked ? [...chosen, o.key] : chosen.filter(k => k !== o.key);
                  onSave?.(next.length ? { optionKeys: next } : null);
                }}
              />
              <Text type="text3" element="span">{o.label}</Text>
            </label>
          ))}
          {options.length === 0 && <Text type="text3" color="secondary" element="span">No options defined yet</Text>}
        </span>
      );
    }
    case "number":
    case "currency":
      return (
        <TypedInput
          key={String(value?.number ?? "")}
          kind="number"
          prefix={def.format === "currency" ? "$" : undefined}
          label={def.label}
          initial={value?.number == null ? "" : String(value.number)}
          display={value?.number == null ? null : def.format === "currency" ? fmtMoney(value.number) : String(value.number)}
          disabled={disabled}
          readOnly={onSave == null || (!mayWrite)}
          onCommit={raw => onSave?.(raw.trim() === "" ? null : { number: Number(raw) })}
          clear={clear}
        />
      );
    case "link":
    case "file":
      return (
        <TypedInput
          key={value?.text ?? ""}
          kind="url"
          label={def.label}
          initial={value?.text ?? ""}
          display={value?.text ? (
            <a href={value.text} target="_blank" rel="noreferrer" className="pf-link">{shorten(value.text)}</a>
          ) : null}
          placeholder={def.format === "file" ? "https://… (SharePoint link)" : "https://…"}
          disabled={disabled}
          readOnly={onSave == null || !mayWrite}
          onCommit={raw => onSave?.(raw.trim() === "" ? null : { text: raw.trim() })}
          clear={clear}
        />
      );
    case "text":
    default:
      return (
        <TypedInput
          key={value?.text ?? ""}
          kind="text"
          label={def.label}
          initial={value?.text ?? ""}
          display={value?.text ?? null}
          disabled={disabled}
          readOnly={onSave == null || !mayWrite}
          onCommit={raw => onSave?.(raw.trim() === "" ? null : { text: raw })}
          clear={clear}
        />
      );
  }
}

/**
 * A text-like input that saves on blur or Enter. Uncontrolled between edits, keyed on
 * the saved value by the caller so an outside change (a push from the project, another
 * person's edit) replaces the draft rather than fighting it.
 */
function TypedInput({
  kind, label, initial, display, placeholder, prefix, disabled, readOnly, onCommit, clear
}: {
  kind: "text" | "number" | "url";
  label: string;
  initial: string;
  display: React.ReactNode;
  placeholder?: string;
  prefix?: string;
  disabled: boolean;
  readOnly: boolean;
  onCommit: (raw: string) => void;
  clear: React.ReactNode;
}) {
  const [draft, setDraft] = useState(initial);
  useEffect(() => { setDraft(initial); }, [initial]);
  if (readOnly) {
    return <Text type="text2" element="span" className="pf-readonly">{display ?? "—"}</Text>;
  }
  return (
    <span className="pf-inline">
      {prefix && <span className="pf-prefix">{prefix}</span>}
      <input
        type={kind === "number" ? "number" : kind === "url" ? "url" : "text"}
        inputMode={kind === "number" ? "decimal" : undefined}
        className="pf-input"
        aria-label={label}
        value={draft}
        placeholder={placeholder}
        disabled={disabled}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { if (draft !== initial) onCommit(draft); }}
        onKeyDown={e => { if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); } }}
      />
      {clear}
    </span>
  );
}

/**
 * The value helpers now live in `data/propertyFormat.ts` — a pure module, so the report
 * builder's widget adapter can use the same one without dragging React into a plain-Node
 * check. Re-exported here because this is where every caller already imports them from,
 * and moving the import site is a change with no benefit.
 */
export { hasValue, formatValue, fmtDate } from "../data/propertyFormat";

const shorten = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "").slice(0, 48) + (url.length > 56 ? "…" : "");
