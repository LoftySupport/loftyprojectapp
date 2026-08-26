import { useMemo, useState } from "react";
import { Button, Text } from "@vibe/core";
import type { BoardJob } from "../data/boardModel";
import "./ui.css";

/**
 * The month calendar (G14), placing only dates that exist.
 *
 * Two kinds of entry per job, both derived from real columns and labelled as what they
 * are: the day it ENTERED its current stage (`job_stage_entered_at`), and — where the
 * stage has an SLA — the day it is DUE out (entered + expected days). The prototype
 * derived a fabricated due date from invented durations; the grid ports, the
 * derivation does not. Dated step-properties join these when they land.
 *
 * The empty month keeps the prototype's best idea: "Jump to {nearest month with
 * entries}" instead of a shrug.
 */

const DAY = 86_400_000;

const startOfDay = (d: Date | string | number) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
};

interface CalEntry {
  job: BoardJob;
  kind: "entered" | "due";
  when: number;
}

export function MonthCalendar({ rows, expectedDaysByStage, onOpen }: {
  rows: BoardJob[];
  expectedDaysByStage: Record<string, number>;
  onOpen: (j: BoardJob) => void;
}) {
  const today = startOfDay(Date.now());
  const [anchor, setAnchor] = useState(() => {
    const d = new Date(today);
    d.setDate(1);
    return d.getTime();
  });

  const entries = useMemo(() => {
    const out: CalEntry[] = [];
    for (const j of rows) {
      const entered = startOfDay(j.stageEnteredAt);
      out.push({ job: j, kind: "entered", when: entered });
      const expected = expectedDaysByStage[j.stage];
      if (expected != null) out.push({ job: j, kind: "due", when: entered + expected * DAY });
    }
    return out;
  }, [rows, expectedDaysByStage]);

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
  // Monday-start: how many cells before the 1st.
  const lead = (first.getDay() + 6) % 7;
  const gridStart = startOfDay(first) - lead * DAY;
  const cells = Array.from({ length: 42 }, (_, i) => gridStart + i * DAY);

  const inMonth = (t: number) => new Date(t).getMonth() === a.getMonth();
  const monthHasEntries = cells.some(t => inMonth(t) && (byDay.get(t)?.length ?? 0) > 0);

  // The nearest month that has anything, for the empty state's jump.
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

  return (
    <div className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">{monthLabel}</Text>
        <div className="field-inline">
          <Text type="text3" color="secondary">
            grey = entered its stage · orange = due out (SLA)
          </Text>
          <Button size="small" kind="tertiary" onClick={() => move(-1)} aria-label="Previous month">‹</Button>
          <Button
            size="small"
            kind="tertiary"
            onClick={() => { const d = new Date(today); d.setDate(1); setAnchor(startOfDay(d)); }}
          >
            Today
          </Button>
          <Button size="small" kind="tertiary" onClick={() => move(1)} aria-label="Next month">›</Button>
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
                  key={`${e.job.jobNumber}-${e.kind}-${i}`}
                  type="button"
                  className={"cal-entry" + (e.kind === "due" ? " is-due" : "")}
                  onClick={() => onOpen(e.job)}
                  title={`${e.job.jobNumber} — ${e.kind === "due" ? `due out of ${e.job.stage}` : `entered ${e.job.stage}`}`}
                >
                  {e.job.jobNumber} {e.kind === "due" ? "due" : "entered"}
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
    </div>
  );
}
