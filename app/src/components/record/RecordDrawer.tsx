import { useId, type CSSProperties, type ReactNode } from "react";
import { NavigationChevronDown, NavigationChevronRight } from "@vibe/icons";
import "./record.css";

/**
 * The record shell: header, scrolling body, docked footer — three flex siblings.
 *
 * Built against `component-contracts/RecordDrawer.d.ts`, whose `footer` prop carries the
 * warning that is the whole point of the component: *"docked. If this ends up inside the
 * scroll region the tabs scroll away and the pattern is broken."*
 *
 * That is the part no option in the original question had, and it is why this exists as a
 * shell rather than as a div with some padding. A job record is a thing you read down
 * while talking to somebody, and the conversation has to stay in reach the whole way —
 * so Tasks, Comments and Activity are **docked at the foot**, not scrolled to.
 *
 * `min-height: 0` on the body is the load-bearing line and the one everybody forgets: a
 * flex child's default minimum is its content, so without it the body grows to fit and
 * pushes the footer off the bottom instead of scrolling.
 */

export interface RecordDrawerProps {
  header?: ReactNode;
  /** Docked. Never inside the scroll region — see above. */
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function RecordDrawer({ header, footer, children, className, style }: RecordDrawerProps) {
  return (
    <div className={"record-shell" + (className ? " " + className : "")} style={style}>
      {header && <div className="record-head">{header}</div>}
      <div className="record-body">{children}</div>
      {footer && <div className="record-foot">{footer}</div>}
    </div>
  );
}

export interface RecordSectionProps {
  title: string;
  /** Right-aligned summary — "Stage 2 of 5 · 22 days". */
  meta?: ReactNode;
  open: boolean;
  onToggle: () => void;
  /** Suppresses the top rule on the first section. */
  first?: boolean;
  children?: ReactNode;
}

/**
 * A collapsible section of a record — Job Stage, Key properties, Process.
 *
 * All three open by default, which is the handoff's call: the drawer's job is to be read,
 * and a record that opens as three closed headings makes somebody click three times
 * before seeing anything. The tail sections below them (Properties, Contacts) are the
 * ones that open closed, because they are counts you go to rather than facts you scan.
 *
 * The header is a real `<button>` with `aria-expanded` and the chevron rotates right →
 * down. The meta sits outside the button: "Stage 2 of 5 · 22 days" is a readout, and
 * putting it inside would read it out as part of the control's name every time.
 */
export function RecordSection({ title, meta, open, onToggle, first, children }: RecordSectionProps) {
  const bodyId = useId();
  return (
    <section className={"record-section" + (first ? " is-first" : "")}>
      <div className="record-section-head">
        <button
          type="button"
          className="record-section-toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
        >
          <span className="record-section-chev" aria-hidden>
            {open ? <NavigationChevronDown size={16} /> : <NavigationChevronRight size={16} />}
          </span>
          {title}
        </button>
        {meta && <span className="record-section-meta">{meta}</span>}
      </div>
      {open && <div className="record-section-body" id={bodyId}>{children}</div>}
    </section>
  );
}
