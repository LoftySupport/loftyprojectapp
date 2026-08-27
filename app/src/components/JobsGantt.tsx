import { Text } from "@vibe/core";
import type { BoardJob } from "../data/boardModel";
import { STAGE_ACCENTS, accentStyle } from "../theme/accents";
import "./ui.css";

/**
 * The Gantt (G13), against real facts only.
 *
 * Each bar is the job's stay in its CURRENT stage: solid from the day it entered to
 * today (elapsed — a fact), and a tinted planned window on to entered + expected days
 * when the stage has an SLA (Setup → Automations). Nothing else is drawn, because
 * nothing else is known: the prototype fabricated start dates and per-stage durations,
 * and that duration model is exactly what the comparison doc says not to port.
 * Dependency connectors join when task dependencies are wired (G6).
 *
 * A stay that began before the window's left edge draws from the edge with a squared
 * start — the bar is cut, not the truth.
 */

const DAY = 86_400_000;
const COL = 28;                       // px per day
const MAX_DAYS = 90;                  // widest window worth scrolling

const startOfDay = (d: Date | string | number) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
};

interface GanttGroup {
  key: string;
  jobs: BoardJob[];
}

export function JobsGantt({ groups, grouping, expectedDaysByStage, onOpen }: {
  groups: GanttGroup[];
  grouping: string;
  expectedDaysByStage: Record<string, number>;
  onOpen: (j: BoardJob) => void;
}) {
  const jobs = groups.flatMap(g => g.jobs);
  const today = startOfDay(Date.now());

  // The window: from the earliest stage entry (clamped to MAX_DAYS back) to the latest
  // SLA due date, with a little air both sides.
  let min = today;
  let max = today;
  for (const j of jobs) {
    const entered = startOfDay(j.stageEnteredAt);
    if (entered < min) min = entered;
    const expected = expectedDaysByStage[j.stage];
    if (expected != null) {
      const due = entered + expected * DAY;
      if (due > max) max = due;
    }
  }
  min -= 2 * DAY;
  max += 3 * DAY;
  if ((max - min) / DAY > MAX_DAYS) min = max - MAX_DAYS * DAY;
  const days: number[] = [];
  for (let t = min; t <= max; t += DAY) days.push(t);

  const x = (t: number) => ((t - min) / DAY) * COL;

  const monthOf = (t: number) =>
    new Date(t).toLocaleDateString(undefined, { month: "short", year: "numeric" });

  return (
    <div className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">Where each job's current stay sits in time</Text>
        <Text type="text3" color="secondary">
          solid = days in stage so far · tint = the SLA window, where one is set ·
          dependencies join when task wiring lands
        </Text>
      </div>
      <div className="gantt-scroll">
        <div className="gantt" style={{ width: `calc(var(--gantt-left) + ${days.length * COL}px)` }}>
          {/* day header */}
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

          {groups.filter(g => g.jobs.length > 0).map(g => {
            const accent = grouping === "Stage" ? STAGE_ACCENTS[g.key] : undefined;
            return (
              <div key={g.key}>
                {/* the full-width band naming the group — phase-coloured when the
                    grouping IS the lifecycle */}
                <div className="gantt-row gantt-band" style={accent ? accentStyle(accent) : undefined}>
                  <div className="gantt-left"><Text type="text3" weight="medium">{g.key}</Text></div>
                  <div className="gantt-days gantt-band-fill" />
                </div>
                {g.jobs.map(j => {
                  const entered = startOfDay(j.stageEnteredAt);
                  const from = Math.max(entered, min);
                  const cut = entered < min;
                  const expected = expectedDaysByStage[j.stage];
                  const due = expected != null ? entered + expected * DAY : null;
                  const over = due != null && today > due;
                  return (
                    <div className="gantt-row" key={j.jobNumber}>
                      <button type="button" className="gantt-left gantt-job" onClick={() => onOpen(j)}>
                        <span className="gantt-job-no">{j.jobNumber}</span>
                        <span className="gantt-job-sub">
                          {j.assigneeName ?? "—"} · {j.daysInStage}d in stage
                          {expected != null ? ` of ${expected}` : ""}
                        </span>
                      </button>
                      <div className="gantt-days gantt-lane">
                        {due != null && due > from && (
                          <div
                            className="gantt-window"
                            style={{ left: x(from), width: x(Math.min(due, max)) - x(from) }}
                            aria-hidden
                          />
                        )}
                        <div
                          className={"gantt-bar" + (cut ? " is-cut" : "") + (over ? " is-over" : "")}
                          style={{ left: x(from), width: Math.max(COL / 2, x(Math.min(today, max)) - x(from) + COL / 2) }}
                          title={`${j.jobNumber} — entered ${new Date(entered).toLocaleDateString()}${due != null ? `, due ${new Date(due).toLocaleDateString()}` : ""}`}
                        />
                        <div className="gantt-today-line" style={{ left: x(today) + COL / 2 }} aria-hidden />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      {Object.keys(expectedDaysByStage).length === 0 && (
        <Text type="text3" color="secondary" ellipsis={false} className="gantt-note">
          No stage has an expected duration set, so the bars show only the days each job
          has been where it is. Set expected days in Setup → Automations and the planned
          windows appear.
        </Text>
      )}
    </div>
  );
}
