import { useEffect, useRef } from "react";
import { Text } from "@vibe/core";
import { isTaskLive, type TaskEntry } from "../data/types";
import "./ui.css";

/**
 * The tasks Gantt — each bar is one task's working window.
 *
 * Separate from `JobsGantt` and `ProjectsGantt` for the reason those two are separate
 * from each other: the geometry is shared (and so is every `gantt-*` class below), but
 * what a bar MEANS is not. A job's bar is its stay in a stage. A task's bar is the work
 * itself — from the day it started to the day it is due — and there is no honest way to
 * express one as the other.
 *
 * WHAT IS DRAWN, AND WHAT IS NOT
 *
 *   solid   from the start to today, or to the day it was completed. Elapsed time, a fact.
 *   tint    from the start to `due_effective`, where there is one. The planned window.
 *   red     the solid bar past its due date — the same `is-over` the jobs Gantt uses.
 *
 * A task with no start and no due date draws NOTHING but its name, and says so in the
 * row. That is deliberate: the alternative is to invent a start from `created_at` and
 * draw a bar the length of however long the row has existed, which reads as work in
 * progress and is nothing of the kind. `started_at` is stamped on the first move off
 * "to do" (0081), so a task that has never been picked up genuinely has no window.
 */

const DAY = 86_400_000;
const COL = 28;                       // px per day — the jobs Gantt's scale, so the two read alike
const MAX_DAYS = 120;                 // widest window worth scrolling

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

interface Span {
  /** When the work began, or null when nobody has started it. */
  from: number | null;
  /** When it is due, or null when nobody has set a date. */
  due: number | null;
  /** Where the solid bar ends: completion for a finished task, today for a live one. */
  to: number | null;
}

function spanOf(t: TaskEntry, today: number): Span {
  const from = dayOf(t.startedAt);
  const due = dayOf(t.dueEffective);
  const done = dayOf(t.completedAt);
  const to = from == null ? null : isTaskLive(t.status) ? today : done ?? today;
  return { from, due, to };
}

export function TasksGantt({ groups, grouping, onOpen }: {
  /** `key` identifies the group; `label` is what a person reads — for the Assignee
   *  grouping the key is a uuid, and a band headed with one is a band headed with
   *  nothing. */
  groups: { key: string; label?: string; tasks: TaskEntry[] }[];
  grouping: string;
  onOpen?: (t: TaskEntry) => void;
}) {
  const today = startOfDay(Date.now());
  const tasks = groups.flatMap(g => g.tasks);

  // The window: everything the bars need, clamped so one task due in 2031 does not
  // squeeze this fortnight into four pixels.
  let min = today;
  let max = today;
  for (const t of tasks) {
    const { from, due, to } = spanOf(t, today);
    for (const point of [from, due, to]) {
      if (point == null) continue;
      if (point < min) min = point;
      if (point > max) max = point;
    }
  }
  min -= 2 * DAY;
  max += 3 * DAY;
  if ((max - min) / DAY > MAX_DAYS) {
    // Anchored on today rather than on the far end: the question a Gantt of tasks
    // answers is "what is happening now and next", not "when did the oldest one start".
    min = Math.max(min, today - Math.floor(MAX_DAYS / 3) * DAY);
    max = Math.min(max, min + MAX_DAYS * DAY);
  }
  const days: number[] = [];
  for (let t = min; t <= max; t += DAY) days.push(t);

  const x = (t: number) => ((t - min) / DAY) * COL;
  const clamp = (t: number) => Math.min(Math.max(t, min), max);

  // Open with today in view — the same 70% the jobs Gantt uses, so switching between
  // the two boards does not move the eye.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const line = el.querySelector<HTMLElement>(".gantt-today-line");
    if (!line) return;
    const lineX = line.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
    el.scrollLeft = Math.max(0, lineX - el.clientWidth * 0.7);
  }, [min, max]);

  const monthOf = (t: number) =>
    new Date(t).toLocaleDateString(undefined, { month: "short", year: "numeric" });
  const short = (t: number) => new Date(t).toLocaleDateString();

  const undated = tasks.filter(t => spanOf(t, today).from == null && spanOf(t, today).due == null).length;

  return (
    <div className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">When each task runs</Text>
        <Text type="text3" color="secondary">
          solid = started until today or completion · tint = the window to the due date ·
          red = past due
        </Text>
      </div>

      <div className="gantt-scroll" ref={scrollRef}>
        <div className="gantt" style={{ width: `calc(var(--gantt-left) + ${days.length * COL}px)` }}>
          <div className="gantt-row gantt-head">
            <div className="gantt-left">
              <Text type="text3" color="secondary">{monthOf(min)} – {monthOf(max)}</Text>
            </div>
            <div className="gantt-days">
              {days.map(t => {
                const d = new Date(t);
                const dow = d.getDay();
                return (
                  <div
                    key={t}
                    className={"gantt-day" + (dow === 0 || dow === 6 ? " is-weekend" : "") + (t === today ? " is-today" : "")}
                  >
                    <span className="gantt-day-num">{d.getDate()}</span>
                  </div>
                );
              })}
              <div className="gantt-today-line" style={{ left: x(today) + COL / 2 }} aria-hidden />
            </div>
          </div>

          {groups.filter(g => g.tasks.length > 0).map(g => (
            <div key={g.key}>
              {/* No band when the board is ungrouped — a heading over one group named
                  by nothing is a heading that says nothing. */}
              {grouping !== "None" && (
                <div className="gantt-row gantt-band">
                  <div className="gantt-left"><Text type="text3" weight="medium">{g.label ?? g.key}</Text></div>
                  <div className="gantt-days gantt-band-fill" />
                </div>
              )}
              {g.tasks.map(t => {
                const { from, due, to } = spanOf(t, today);
                const over = due != null && isTaskLive(t.status) && today > due;
                const barFrom = from == null ? null : clamp(from);
                const barTo = to == null ? null : clamp(to);
                const cut = from != null && from < min;
                return (
                  <div className="gantt-row" key={t.id}>
                    <button
                      type="button"
                      className="gantt-left gantt-job"
                      onClick={() => onOpen?.(t)}
                      title={t.name}
                    >
                      <span className="gantt-job-no">{t.name}</span>
                      <span className="gantt-job-sub">
                        {t.assigneeName ?? "Nobody"}
                        {due != null ? ` · due ${short(due)}` : " · no due date"}
                      </span>
                    </button>
                    <div className="gantt-days gantt-lane">
                      {/* The planned window needs a left edge to start from. With no
                          start recorded it hangs off the due date by the expected days,
                          and where there are none it is drawn as the due day itself —
                          a marker rather than a made-up duration. */}
                      {due != null && (() => {
                        const left = barFrom ?? clamp(due - (t.expectedDays ?? 0) * DAY);
                        const right = clamp(due);
                        return right > left ? (
                          <div
                            className="gantt-window"
                            style={{ left: x(left), width: Math.max(COL / 2, x(right) - x(left)) }}
                            aria-hidden
                          />
                        ) : null;
                      })()}
                      {barFrom != null && barTo != null && (
                        <div
                          className={"gantt-bar" + (cut ? " is-cut" : "") + (over ? " is-over" : "")}
                          style={{ left: x(barFrom), width: Math.max(COL / 2, x(barTo) - x(barFrom) + COL / 2) }}
                          title={`${t.name} — started ${short(from!)}${due != null ? `, due ${short(due)}` : ""}`}
                        />
                      )}
                      <div className="gantt-today-line" style={{ left: x(today) + COL / 2 }} aria-hidden />
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {undated > 0 && (
        <Text type="text3" color="secondary" ellipsis={false} className="gantt-note">
          {undated} of these {undated === 1 ? "has" : "have"} neither a start nor a due
          date, so {undated === 1 ? "it draws" : "they draw"} no bar. A start is stamped
          the first time a task moves off To do; a due date is set on the task or comes
          from its process template.
        </Text>
      )}
    </div>
  );
}
