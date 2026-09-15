import type { CSSProperties } from "react";
import { Warning } from "@vibe/icons";
import "./record.css";

/**
 * The pipeline strip and the health pill — one signal, deliberately.
 *
 * From `docs/design/handoff/job-record/`, built against the names in
 * `component-contracts/StageTrack.d.ts` so this and the design-system version converge
 * rather than having to be reconciled.
 *
 * THE RULE THAT MAKES THIS ONE COMPONENT AND NOT TWO
 *
 *   **The current stage takes the record's health colour.** The bar is not saying "you
 *   are here" — the bold stage name already says that — it is saying "this is how the
 *   job is going". Amber, 11 September: *"the at risk stage is yellow"*. So the pill and
 *   the strip cannot be built apart without the two drifting into disagreeing about the
 *   same fact, which is how a board ends up with an amber chip over a green bar.
 *
 *   It also dissolves an apparent collision with `DESIGN.md`'s rule that colour on a
 *   container means phase: the bar was never carrying phase.
 *
 * FIVE SEGMENTS, ALWAYS (decision 4)
 *
 *   The database has seven stages; the strip has five. Amber: *"there are 7 stages but
 *   when a job is closed or cancelled the job pipeline is not open so that is fine and it
 *   will just stay as it last was… if it is cancelled they stay as they were at cancelled
 *   date so information knows what is done."* Closed and Cancelled are not segments —
 *   they **freeze** the strip, which turns it from a live indicator into a record of what
 *   was done. A job closed thirteen months after completion keeps its completion dates.
 */

export type HealthStatus = "on-track" | "at-risk" | "overdue";
export type StageState = "done" | "current" | "todo";

export interface Stage {
  name: string;
  state: StageState;
  /** Dark semibold — the thing you scan for. */
  readoutLabel?: string;
  /** Light secondary — the number. */
  readoutValue?: string;
  /**
   * The page variant's readouts, which are TWO lines per segment and not one.
   *
   * The contract carries a single `readoutLabel`/`readoutValue` pair; 6b draws two rows
   * under every segment — "Job started 02/06/26" over "Days in stage 79". An array is the
   * smaller departure: the singular pair still works for the drawer, and the design-system
   * version can take this shape without losing anything.
   *
   * A readout with no value is omitted rather than drawn as a dash. "Open jobs —" under
   * Maintenance would be a number the record does not have, dressed as one it does.
   */
  readouts?: { label: string; value: string }[];
}

/**
 * What colour a segment takes.
 *
 * Exported because the contract exports it, and because the drawer's bars and the page's
 * track must not each decide this for themselves — that is the thirteen-filter-rows
 * failure in miniature.
 *
 * `--warning-color-selected` for at risk rather than `--warning-color`: the pale yellow
 * carries dark ink at 12:1, where the full yellow with dark ink is a warning triangle
 * rather than a strip. Overdue and on track take the status colours with **white** ink,
 * which is the job-record README's instruction — *"never Crisp Orange behind small
 * text"*, and Crisp Orange behind the stage names is exactly what a brand-coloured
 * "current" bar would have been.
 */
export function stageColor(state: StageState, status: HealthStatus): string {
  if (state === "done") return "var(--lofty-foundation-black)";
  if (state === "todo") return "var(--lofty-flint-200)";
  return status === "overdue" ? "var(--negative-color)"
    : status === "on-track" ? "var(--positive-color)"
    : "var(--warning-color-selected)";
}

/** Ink that reads on that fill. Pale yellow takes dark; the two status fills take white. */
function stageInk(state: StageState, status: HealthStatus): string {
  if (state === "done") return "var(--lofty-finisher-white)";
  if (state === "todo") return "var(--primary-text-color)";
  return status === "at-risk" ? "var(--primary-text-color)" : "var(--lofty-finisher-white)";
}

export interface HealthChipProps {
  status?: HealthStatus;
  label: string;
  style?: CSSProperties;
}

/**
 * The health pill — outline-free, pill radius, carrying the status colour.
 *
 * Dark ink on pale yellow for at risk; white on the status colours otherwise. The warning
 * glyph is on every state rather than only the bad ones: a pill that grows an icon when
 * things go wrong moves the label sideways, and a row that reflows is a row people stop
 * trusting to stay put.
 */
export function HealthChip({ status = "on-track", label, style }: HealthChipProps) {
  return (
    <span
      className="health-chip"
      style={{
        background: stageColor("current", status),
        color: stageInk("current", status),
        ...style
      }}
    >
      <Warning size={16} aria-hidden />
      {label}
    </span>
  );
}

export interface StageTrackProps {
  stages?: Stage[];
  status?: HealthStatus;
  /**
   * `bars` — separated 4px lines with the name above and the date below (the drawer).
   * `track` — butted segments with white hairlines and the name inside (the page).
   *
   * Two variants rather than two components, because they are the same five stages in
   * the same order carrying the same colours: at 460px the names cannot sit inside the
   * segments and stay readable, and at 1180px they can.
   */
  variant?: "bars" | "track";
  style?: CSSProperties;
}

export function StageTrack({ stages = [], status = "on-track", variant = "bars", style }: StageTrackProps) {
  if (!stages.length) return null;

  if (variant === "track") {
    return (
      <div className="stage-track" style={style}>
        <div className="stage-track-row" role="list">
          {stages.map((s, i) => (
            <div
              key={s.name}
              role="listitem"
              className={
                "stage-track-seg" +
                (i === 0 ? " is-first" : "") +
                (i === stages.length - 1 ? " is-last" : "")
              }
              style={{ background: stageColor(s.state, status), color: stageInk(s.state, status) }}
              // The state is in the accessible name, because the colour is the only
              // thing carrying it visually and colour is not information on its own.
              aria-label={`${s.name} — ${s.state === "done" ? "completed" : s.state === "current" ? "current" : "not started"}`}
            >
              {s.name}
            </div>
          ))}
        </div>
        <div className="stage-track-readouts">
          {stages.map(s => (
            <dl className="stage-readout" key={s.name}>
              {(s.readouts ?? (s.readoutLabel
                ? [{ label: s.readoutLabel, value: s.readoutValue ?? "—" }]
                : [])).map(r => (
                <div className="stage-readout-line" key={r.label}>
                  <dt>{r.label}</dt>
                  <dd>{r.value}</dd>
                </div>
              ))}
            </dl>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="stage-bars" style={style} role="list">
      {stages.map(s => (
        <div className="stage-bar" key={s.name} role="listitem">
          <div className={"stage-bar-name" + (s.state === "current" ? " is-current" : "")}>
            {s.name}
          </div>
          <div className="stage-bar-line" style={{ background: stageColor(s.state, status) }} />
          <div className={"stage-bar-date" + (s.state === "todo" ? " is-empty" : "")}>
            {s.readoutValue ?? "—"}
          </div>
        </div>
      ))}
    </div>
  );
}
