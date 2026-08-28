import { useMemo, useState } from "react";
import { Button, Text } from "@vibe/core";
import { useQuery } from "../data/DataProvider";
import { LoadProblem } from "./SearchNotices";
import type { StagePeriod } from "../data/types";
import "./ui.css";

/**
 * One job's passage through the lifecycle, as a list, a bar chart or a month grid.
 *
 * Amber, 28 August: *"on a single job i need to be able to open it as a gantt chart,
 * calendar, list."*
 *
 * **What a chart of ONE job can honestly show.** A job has no tasks and no checkpoints
 * — `pipeline_stage_tasks` is unbuilt and the 36 checkpoints the template used to show
 * were written by nobody at Lofty. What a job does have, recorded and real, is where it
 * has been: every stage change since 0001 is in the audit trail, and each row carries
 * both ends of a period (when the stage was left, and when it had been entered). So
 * that is what these three views draw. When tasks exist they join the same timeline;
 * until then nothing here is a placeholder.
 *
 * Three renderings of one set of facts, not three datasets:
 *
 *   List      every stage, when it started, when it ended, how long it took
 *   Gantt     the same periods as bars on a shared scale, so the long one is obvious
 *   Calendar  the months it crossed, marking the day it entered each stage
 */

const VIEWS = ["List", "Gantt", "Calendar"] as const;
type TimelineView = (typeof VIEWS)[number];

const DAY = 86_400_000;
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export function JobTimeline({ jobId }: { jobId: string }) {
  const [view, setView] = useState<TimelineView>("List");
  const { data: periods, loading, error } = useQuery<StagePeriod[]>(
    r => r.listJobStageHistory(jobId), [], [jobId]
  );

  /** The span every view measures against: first known start to today or the last end. */
  const span = useMemo(() => {
    const starts = periods.map(p => p.from).filter(Boolean).map(v => Date.parse(v!));
    if (!starts.length) return null;
    const ends = periods.map(p => Date.parse(p.to ?? new Date().toISOString()));
    const start = Math.min(...starts);
    const end = Math.max(...ends, Date.now());
    // A job that entered its first stage this morning would otherwise divide by zero
    // and render every bar at NaN% — one day is the floor.
    return { start, end: Math.max(end, start + DAY) };
  }, [periods]);

  return (
    <section className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">Timeline</Text>
        {/* Three buttons rather than a dropdown: there are exactly three, they fit,
            and switching between them is the thing this panel is for — a dropdown
            makes a one-click choice into three (open, read, pick). */}
        <div className="jt-views" role="group" aria-label="How to show this job's timeline">
          {VIEWS.map(v => (
            <Button
              key={v}
              size="small"
              kind={v === view ? "primary" : "tertiary"}
              aria-pressed={v === view}
              onClick={() => setView(v)}
            >
              {v}
            </Button>
          ))}
        </div>
      </div>

      {error && <LoadProblem error={error} />}

      {/* Nothing invented for a job with no recorded history. A job created before the
          audit trail and never moved since has one period and says so; a job with none
          at all says that instead of drawing an empty chart. */}
      {!loading && !error && periods.length === 0 && (
        <Text type="text2" color="secondary" element="p" ellipsis={false}>
          No stage history recorded for this job yet.
        </Text>
      )}

      {periods.length > 0 && view === "List" && (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Stage</th><th>Entered</th><th>Left</th><th className="num">Days</th></tr>
            </thead>
            <tbody>
              {periods.map((p, i) => (
                <tr key={`${p.stage}-${i}`} className={p.to === null ? "is-current" : undefined}>
                  <td>{p.stage}</td>
                  <td>{p.from ? shortDate(p.from) : "—"}</td>
                  {/* "Still here" rather than a blank: an empty cell in a date column
                      reads as missing data, and this is the opposite — it is the one
                      period we know most about. */}
                  <td>{p.to ? shortDate(p.to) : "Still here"}</td>
                  <td className="num">{p.days ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {periods.length > 0 && view === "Gantt" && span && (
        <>
          <div className="jt-scale">
            <Text type="text3" color="secondary">{shortDate(new Date(span.start).toISOString())}</Text>
            <Text type="text3" color="secondary">{shortDate(new Date(span.end).toISOString())}</Text>
          </div>
          <ol className="jt-gantt">
            {periods.map((p, i) => {
              const from = p.from ? Date.parse(p.from) : null;
              const to = Date.parse(p.to ?? new Date().toISOString());
              const total = span.end - span.start;
              const left = from === null ? 0 : ((from - span.start) / total) * 100;
              const width = from === null ? 0 : Math.max(((to - from) / total) * 100, 1);
              return (
                <li key={`${p.stage}-${i}`}>
                  <span className="jt-label">{p.stage}</span>
                  <span className="jt-track">
                    {/* A period with no known start has no bar rather than a bar from
                        the beginning of time — the second one is a claim. */}
                    {from !== null && (
                      <span
                        className={`jt-bar${p.to === null ? " is-current" : ""}`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        title={`${p.stage}: ${shortDate(p.from!)} → ${p.to ? shortDate(p.to) : "still here"}`}
                      />
                    )}
                  </span>
                  <span className="jt-days">{p.days ?? "—"}d</span>
                </li>
              );
            })}
          </ol>
        </>
      )}

      {periods.length > 0 && view === "Calendar" && span && (
        <StageMonths periods={periods} />
      )}
    </section>
  );
}

/**
 * The months the job has crossed, with the day it entered each stage marked.
 *
 * Months rather than one scrolling grid: a job that has been running two years is 24
 * month grids, and nobody reads those — the months that carry a transition are the ones
 * worth drawing, and the rest are said as a gap.
 */
function StageMonths({ periods }: { periods: StagePeriod[] }) {
  const byMonth = useMemo(() => {
    const map = new Map<string, { date: Date; stage: string }[]>();
    for (const p of periods) {
      if (!p.from) continue;
      const d = new Date(p.from);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const list = map.get(key) ?? [];
      list.push({ date: d, stage: p.stage });
      map.set(key, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [periods]);

  if (byMonth.length === 0) {
    return (
      <Text type="text2" color="secondary" element="p" ellipsis={false}>
        No dated stage changes to place on a calendar.
      </Text>
    );
  }

  return (
    <div className="jt-months">
      {byMonth.map(([key, entries]) => {
        const first = new Date(entries[0].date.getFullYear(), entries[0].date.getMonth(), 1);
        const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
        // Monday-first, which is how a build week is counted here.
        const lead = (first.getDay() + 6) % 7;
        const marks = new Map(entries.map(e => [e.date.getDate(), e.stage]));
        return (
          <div className="jt-month" key={key}>
            <Text type="text3" weight="medium">
              {first.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </Text>
            <div className="jt-grid" role="list">
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                <span className="jt-dow" key={i} aria-hidden="true">{d}</span>
              ))}
              {Array.from({ length: lead }, (_, i) => <span key={`lead-${i}`} />)}
              {Array.from({ length: days }, (_, i) => {
                const day = i + 1;
                const stage = marks.get(day);
                return (
                  <span
                    key={day}
                    role={stage ? "listitem" : undefined}
                    className={`jt-day${stage ? " is-marked" : ""}`}
                    title={stage ? `Entered ${stage}` : undefined}
                  >
                    {day}
                  </span>
                );
              })}
            </div>
            {/* The stage names under the grid, not inside the squares. A day cell is
                about 36px and "Acquisition & Development" broke across four lines in
                it; here each mark gets a whole line and the grid stays a calendar. */}
            <ul className="jt-marks">
              {entries.map(e => (
                <li key={`${e.date.toISOString()}-${e.stage}`}>
                  <Text type="text3" color="secondary" element="span" ellipsis={false}>
                    <strong>{e.date.getDate()}</strong> — entered {e.stage}
                  </Text>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
