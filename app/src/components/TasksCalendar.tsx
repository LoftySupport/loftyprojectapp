import { useMemo, useState } from "react";
import { Button, Text } from "@vibe/core";
import { isTaskLive, type TaskEntry } from "../data/types";
import "./ui.css";

/**
 * The tasks month calendar — two real dates per task, each labelled as what it is.
 *
 * `MonthCalendar` does this for jobs and places the two dates a job carries: the day it
 * entered its stage, and the day the stage's SLA runs out. A task carries a different
 * pair and the difference is the point of the screen:
 *
 *   **due**        `due_effective` — when it has to be finished.
 *   **scheduled**  `scheduled_date` — when somebody plans to do it (0102).
 *
 * They are frequently not the same day, and a calendar that merged them would answer
 * neither "what is landing this week" nor "what am I doing on Thursday". Both are drawn,
 * the due one in the orange the jobs calendar already uses for a deadline.
 *
 * The grid, the cells and every `cal-*` class are shared with the jobs calendar, so the
 * two months read as one control with different content in it.
 */

const DAY = 86_400_000;

const startOfDay = (d: Date | string | number) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
};

/** A date-only column at LOCAL midnight — see the same note in `taskFiltering.ts`. */
const dayOf = (iso: string | null): number | null => {
  if (!iso) return null;
  const t = startOfDay(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(t) ? null : t;
};

interface CalEntry {
  task: TaskEntry;
  kind: "due" | "scheduled";
  when: number;
}

export function TasksCalendar({ rows, onOpen }: {
  rows: TaskEntry[];
  onOpen?: (t: TaskEntry) => void;
}) {
  const today = startOfDay(Date.now());
  const [anchor, setAnchor] = useState(() => {
    const d = new Date(today);
    d.setDate(1);
    return d.getTime();
  });

  const entries = useMemo(() => {
    const out: CalEntry[] = [];
    for (const t of rows) {
      const due = dayOf(t.dueEffective);
      if (due != null) out.push({ task: t, kind: "due", when: due });
      const sched = dayOf(t.scheduledDate);
      // Only when it says something the due entry does not. A task scheduled for the
      // day it is due would otherwise sit in the cell twice.
      if (sched != null && sched !== due) out.push({ task: t, kind: "scheduled", when: sched });
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

  const undated = rows.filter(t => t.dueEffective == null && t.scheduledDate == null).length;

  return (
    <div className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">{monthLabel}</Text>
        <div className="field-inline cal-head">
          <Text type="text3" color="secondary">orange = due · grey = scheduled to be worked</Text>
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
                  key={`${e.task.id}-${e.kind}-${i}`}
                  type="button"
                  className={"cal-entry" + (e.kind === "due" ? " is-due" : "")}
                  onClick={() => onOpen?.(e.task)}
                  title={
                    `${e.task.name} — ${e.kind === "due" ? "due" : "scheduled"}` +
                    `${e.task.jobId ? ` on ${e.task.jobId}` : ""}` +
                    ` · ${e.task.assigneeName ?? "nobody"}` +
                    (isTaskLive(e.task.status) ? "" : " · closed")
                  }
                >
                  {e.task.name}
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
          {undated} of these have neither a due date nor a scheduled one, so they are on
          no day of any month. The table and the board still show them.
        </Text>
      )}
    </div>
  );
}
