import { useMemo, useState } from "react";
import { Button, Text } from "@vibe/core";
import type { BoardProject } from "../data/boardModel";
import "./ui.css";

/**
 * The projects month calendar — the third view of a month, and the one the projects
 * board never had.
 *
 * `/projects?view=Calendar` was reachable, because `useBoardParams` validated the view
 * against the app-wide list rather than the board's own, and it drew **nothing at all**:
 * the toolbar's View control went blank and the page ended under it. That is what
 * "the calendar view has disappeared" was. Both halves are fixed — the board has a
 * calendar now, and an unknown view falls back to the default rather than rendering an
 * empty page.
 *
 * WHAT IT PLACES, AND WHAT IT REFUSES TO
 *
 * Three dates, each a real column, each labelled as itself:
 *
 *   **start**   `project_start_date` — the day work began.
 *   **target**  `project_target_completion` — the day it is being worked towards.
 *   **end**     `project_end_date` — the day it actually finished, where it has.
 *
 * A project missing all three is on no day of any month, and the note under the grid
 * says how many and where to set them. Nothing is derived from a duration nobody agreed:
 * that is the same rule `ProjectsGantt` states — *"A project missing either date is
 * listed underneath, honestly, with where to set them — not drawn from a guess."*
 *
 * `stage_entered_at` is deliberately NOT drawn. Every project has one, so placing it
 * would put a chip on every project in the month and drown the three dates a person
 * actually looks for; the jobs calendar places it because for a job it is the fact that
 * moves.
 *
 * The grid, the cells and every `cal-*` class are shared with the jobs and tasks
 * calendars, so the three read as one control with different content in them.
 */

const DAY = 86_400_000;

const startOfDay = (d: Date | string | number) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
};

/** A date-only column at LOCAL midnight — `new Date("2026-09-10")` is UTC and shifts. */
const dayOf = (iso: string | null): number | null => {
  if (!iso) return null;
  const t = startOfDay(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(t) ? null : t;
};

type Kind = "start" | "target" | "end";
const KIND_LABEL: Record<Kind, string> = {
  start: "starts",
  target: "target completion",
  end: "finished"
};

interface CalEntry {
  project: BoardProject;
  kind: Kind;
  when: number;
}

export function ProjectsCalendar({ rows, onOpen }: {
  rows: BoardProject[];
  onOpen: (p: BoardProject) => void;
}) {
  const today = startOfDay(Date.now());
  const [anchor, setAnchor] = useState(() => {
    const d = new Date(today);
    d.setDate(1);
    return d.getTime();
  });

  const entries = useMemo(() => {
    const out: CalEntry[] = [];
    for (const p of rows) {
      const pairs: [Kind, string | null][] = [
        ["start", p.startDate],
        ["target", p.targetCompletion],
        ["end", p.endDate]
      ];
      const seen = new Set<number>();
      for (const [kind, iso] of pairs) {
        const when = dayOf(iso);
        // A project that finished on its target date has one fact, not two, and drawing
        // both would put the same project in the same cell twice.
        if (when == null || seen.has(when)) continue;
        seen.add(when);
        out.push({ project: p, kind, when });
      }
    }
    return out;
  }, [rows]);

  const byDay = useMemo(() => {
    const m = new Map<number, CalEntry[]>();
    for (const e of entries) {
      const list = m.get(e.when) ?? [];
      list.push(e);
      m.set(e.when, list);
    }
    return m;
  }, [entries]);

  const a = new Date(anchor);
  const monthLabel = a.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const first = new Date(a.getFullYear(), a.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7;              // Monday-start
  const gridStart = startOfDay(first) - lead * DAY;
  const cells = Array.from({ length: 42 }, (_, i) => gridStart + i * DAY);

  const inMonth = (t: number) => new Date(t).getMonth() === a.getMonth();
  const monthHasEntries = cells.some(t => inMonth(t) && (byDay.get(t)?.length ?? 0) > 0);

  /** The nearest month that has anything, for the empty state's jump. */
  const nearest = useMemo(() => {
    if (entries.length === 0) return null;
    let best: number | null = null;
    let bestDist = Infinity;
    for (const e of entries) {
      const d = new Date(e.when);
      const m = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      const dist = Math.abs(m - anchor);
      if (m !== anchor && dist < bestDist) { bestDist = dist; best = m; }
    }
    return best;
  }, [entries, anchor]);

  const move = (months: number) => {
    const d = new Date(anchor);
    d.setMonth(d.getMonth() + months);
    setAnchor(d.getTime());
  };

  const undated = rows.filter(p => !p.startDate && !p.targetCompletion && !p.endDate).length;

  return (
    <div className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">{monthLabel}</Text>
        <div className="field-inline cal-head">
          <Text type="text3" color="secondary">orange = target completion · grey = started or finished</Text>
          <Button size="small" kind="tertiary" className="cal-nav" onClick={() => move(-1)} aria-label="Previous month">‹</Button>
          <Button
            size="small"
            kind="tertiary"
            onClick={() => { const d = new Date(today); d.setDate(1); setAnchor(startOfDay(d)); }}
          >
            Today
          </Button>
          <Button size="small" kind="tertiary" className="cal-nav" onClick={() => move(1)} aria-label="Next month">›</Button>
        </div>
      </div>

      <div className="cal-grid" role="grid" aria-label={monthLabel}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
          <div key={d} className="cal-dow">{d}</div>
        ))}
        {cells.map(t => {
          const dayEntries = byDay.get(t) ?? [];
          const d = new Date(t);
          const dow = d.getDay();
          return (
            <div
              key={t}
              className={
                "cal-cell" +
                (inMonth(t) ? "" : " is-outside") +
                (dow === 0 || dow === 6 ? " is-weekend" : "") +
                (t === today ? " is-today" : "")
              }
            >
              <div className="cal-date">
                <span>{d.getDate()}</span>
                {t === today && <span className="cal-today-chip">Today</span>}
              </div>
              {dayEntries.slice(0, 3).map((e, i) => (
                <button
                  key={`${e.project.projectNumber}-${e.kind}-${i}`}
                  type="button"
                  className={"cal-entry" + (e.kind === "target" ? " is-due" : "")}
                  onClick={() => onOpen(e.project)}
                  title={
                    `${e.project.projectNumber} — ${KIND_LABEL[e.kind]}` +
                    (e.project.currentAddress ? ` · ${e.project.currentAddress}` : "")
                  }
                >
                  {e.project.projectNumber} {e.kind === "target" ? "target" : e.kind}
                </button>
              ))}
              {dayEntries.length > 3 && (
                <span className="cal-more">+{dayEntries.length - 3} more</span>
              )}
            </div>
          );
        })}
      </div>

      {!monthHasEntries && (
        <div className="cal-empty">
          <Text type="text2" color="secondary" ellipsis={false}>
            Nothing lands in {monthLabel}.
          </Text>
          {nearest != null && (
            <Button size="small" kind="secondary" onClick={() => setAnchor(nearest)}>
              Jump to {new Date(nearest).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </Button>
          )}
        </div>
      )}

      {undated > 0 && (
        <Text type="text3" color="secondary" ellipsis={false} className="gantt-note">
          {undated} of these {undated === 1 ? "project has" : "projects have"} no start
          date, target completion or end date, so {undated === 1 ? "it is" : "they are"} on
          no day of any month. Set them on the project and {undated === 1 ? "it appears" : "they appear"} here —
          nothing on this calendar is estimated.
        </Text>
      )}
    </div>
  );
}
