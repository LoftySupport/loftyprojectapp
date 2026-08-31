import { useMemo, useState } from "react";
import { Button, Text } from "@vibe/core";
import "./ui.css";
import "../pages/UpdatesPage.css";

/**
 * The four ways to look at the tracker — the view primitives the Requests and Roadmap
 * tabs share (Amber, 31 Aug: *"see it in table view, gantt chart, calendar as well"*,
 * and *"roadmap should be in these 4 default views as well"*).
 *
 * ============================================================================
 * WHERE THE DATES COME FROM, AND WHY THAT DECIDES WHAT THESE CAN DRAW
 *
 *   A gantt and a calendar are instruments for reading time, and a request has almost
 *   no time on it. What exists is:
 *
 *     feedback_created_at        when it was sent in          — a real date
 *     feedback_stage_entered_at  when it last moved           — a real date
 *     roadmap_phase.starts_on    when its phase begins        — real, and NULLABLE
 *     roadmap_phase.ends_on      when its phase ends          — real, and NULLABLE
 *
 *   There is no "this request will take four days". So a request's BAR is its phase's
 *   window, borrowed and labelled as borrowed, and a request in no phase gets no bar at
 *   all — it is listed as unscheduled, by name, under the chart.
 *
 *   That is the house rule doing its job rather than a limitation being apologised for.
 *   An estimated bar would be read as a date the company had committed to, and the one
 *   thing worse than an empty roadmap is one that quietly makes promises.
 * ============================================================================
 */

export type UpdatesView = "board" | "table" | "gantt" | "calendar";

export const UPDATES_VIEWS: { slug: UpdatesView; label: string }[] = [
  { slug: "board", label: "Board" },
  { slug: "table", label: "Table" },
  { slug: "gantt", label: "Gantt" },
  { slug: "calendar", label: "Calendar" }
];

export function ViewSwitcher({ value, onChange }: {
  value: UpdatesView;
  onChange: (v: UpdatesView) => void;
}) {
  return (
    <div className="updates-views" role="group" aria-label="View">
      {UPDATES_VIEWS.map(v => (
        <button
          key={v.slug}
          type="button"
          className={`updates-view-btn${value === v.slug ? " is-on" : ""}`}
          aria-pressed={value === v.slug}
          onClick={() => onChange(v.slug)}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

/* ============================================================ the gantt =========== */

const DAY = 86_400_000;

const startOfDay = (v: string | number | Date) => {
  const d = new Date(v);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const monthStart = (t: number) => {
  const d = new Date(t);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const addMonths = (t: number, n: number) => {
  const d = new Date(t);
  d.setMonth(d.getMonth() + n);
  return d.getTime();
};

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface TimelineBar {
  id: string;
  label: string;
  /** The line under the label — whose window this is, when it is borrowed. */
  sublabel?: string;
  /** ISO dates. Either may be null: an unscheduled end is not an open-ended commitment. */
  startsOn: string | null;
  endsOn: string | null;
  /** Drives the bar's colour. Free text so the caller names its own vocabulary. */
  tone?: string;
  onOpen?: () => void;
}

/**
 * A month-scaled timeline.
 *
 * Month-scaled and not day-scaled, unlike `JobsGantt`: a roadmap phase runs for weeks or
 * months, and a day grid over six months is four hundred columns nobody can read. The
 * jobs gantt is a different instrument for a different question and is deliberately left
 * alone.
 */
export function Timeline({ bars, nothingNote, unscheduledNote }: {
  bars: TimelineBar[];
  nothingNote: string;
  unscheduledNote: string;
}) {
  const today = startOfDay(Date.now());

  const dated = bars.filter(b => b.startsOn || b.endsOn);
  const undated = bars.filter(b => !b.startsOn && !b.endsOn);

  const range = useMemo(() => {
    if (dated.length === 0) return null;
    let lo = Infinity;
    let hi = -Infinity;
    for (const b of dated) {
      for (const iso of [b.startsOn, b.endsOn]) {
        if (!iso) continue;
        const t = startOfDay(iso);
        lo = Math.min(lo, t);
        hi = Math.max(hi, t);
      }
    }
    // Today belongs on the chart even when everything is in the future, so "we are here"
    // is answerable without arithmetic.
    lo = Math.min(lo, today);
    hi = Math.max(hi, today);
    const from = monthStart(lo);
    const to = addMonths(monthStart(hi), 1);
    const months: number[] = [];
    for (let m = from; m < to; m = addMonths(m, 1)) months.push(m);
    return { from, to, months };
  }, [dated, today]);

  if (bars.length === 0) {
    return <Text type="text2" color="secondary" element="p" ellipsis={false}>{nothingNote}</Text>;
  }

  const pct = (t: number) =>
    range ? ((t - range.from) / (range.to - range.from)) * 100 : 0;

  return (
    <div className="tl-wrap">
      {range && (
        <div className="tl-scroll">
          <div className="tl" style={{ minWidth: `${Math.max(560, range.months.length * 110)}px` }}>
            <div className="tl-head">
              <div className="tl-left" />
              <div className="tl-months">
                {range.months.map((m, i) => (
                  <div key={m} className="tl-month" style={{ width: `${100 / range.months.length}%` }}>
                    <Text type="text3" color="secondary">
                      {MONTH[new Date(m).getMonth()]}
                      {(i === 0 || new Date(m).getMonth() === 0) && ` ${new Date(m).getFullYear()}`}
                    </Text>
                  </div>
                ))}
              </div>
            </div>

            {dated.map(b => {
              // A bar needs two ends. With only one date this renders a MARKER at the day
              // it does have — because a phase that starts in March with no agreed end is
              // exactly the case where drawing a length would invent the answer.
              const s = b.startsOn ? startOfDay(b.startsOn) : null;
              const e = b.endsOn ? startOfDay(b.endsOn) : null;
              const both = s !== null && e !== null;
              const at = (s ?? e) as number;
              const left = pct(both ? (s as number) : at);
              const width = both ? Math.max(pct(e as number) + (100 / range.months.length) * 0.12 - left, 1.2) : 0;

              return (
                <div className="tl-row" key={b.id}>
                  <div className="tl-left">
                    {b.onOpen ? (
                      <button type="button" className="tl-open" onClick={b.onOpen}>
                        <span className="tl-label">{b.label}</span>
                        {b.sublabel && <span className="tl-sub">{b.sublabel}</span>}
                      </button>
                    ) : (
                      <div>
                        <span className="tl-label">{b.label}</span>
                        {b.sublabel && <span className="tl-sub">{b.sublabel}</span>}
                      </div>
                    )}
                  </div>
                  <div className="tl-track">
                    {range.months.map((m, i) => (
                      <span key={m} className="tl-gridline"
                            style={{ left: `${(i / range.months.length) * 100}%` }} />
                    ))}
                    {today >= range.from && today < range.to && (
                      <span className="tl-today" style={{ left: `${pct(today)}%` }} aria-hidden="true" />
                    )}
                    {both ? (
                      <span
                        className={`tl-bar tl-tone-${b.tone ?? "planned"}`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        title={`${b.label} — ${fmt(b.startsOn)} to ${fmt(b.endsOn)}`}
                      />
                    ) : (
                      <span
                        className={`tl-point tl-tone-${b.tone ?? "planned"}`}
                        style={{ left: `${left}%` }}
                        title={`${b.label} — ${s ? `starts ${fmt(b.startsOn)}, no end date set` : `ends ${fmt(b.endsOn)}, no start date set`}`}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {undated.length > 0 && (
        // Named, not counted. "7 unscheduled" tells somebody there is a problem and not
        // which requests are in it, and the list is the only version they can act on.
        <div className="tl-undated">
          <Text type="text3" color="secondary" element="div" ellipsis={false}>
            {unscheduledNote}
          </Text>
          <ul className="tl-undated-list">
            {undated.map(b => (
              <li key={b.id}>
                {b.onOpen ? (
                  <button type="button" className="tl-undated-open" onClick={b.onOpen}>{b.label}</button>
                ) : b.label}
                {b.sublabel && <span className="tl-sub"> · {b.sublabel}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";

/* ========================================================== the calendar ========= */

export interface DatedEntry {
  id: string;
  /** ISO. Every entry here is a date the database holds — nothing is derived forward. */
  when: string;
  label: string;
  /** What KIND of date this is, shown beside it: "reported", "moved", "phase starts". */
  kind: string;
  tone?: string;
  onOpen?: () => void;
}

/**
 * A month grid over dates that exist.
 *
 * Monday-start, today ringed, "+N more" overflow, and — kept from `MonthCalendar`
 * because it is the best idea in it — an empty month offers to jump to the nearest month
 * that has anything, instead of shrugging.
 */
export function MonthEntries({ entries, nothingNote }: {
  entries: DatedEntry[];
  nothingNote: string;
}) {
  const today = startOfDay(Date.now());
  const [anchor, setAnchor] = useState(() => monthStart(today));

  const byDay = useMemo(() => {
    const m = new Map<number, DatedEntry[]>();
    for (const e of entries) {
      const d = startOfDay(e.when);
      const list = m.get(d) ?? [];
      list.push(e);
      m.set(d, list);
    }
    return m;
  }, [entries]);

  const cells = useMemo(() => {
    const first = new Date(anchor);
    // Monday-start: getDay() is 0 for Sunday, so Sunday has to reach back six days.
    const lead = (first.getDay() + 6) % 7;
    const start = startOfDay(anchor) - lead * DAY;
    return Array.from({ length: 42 }, (_, i) => start + i * DAY);
  }, [anchor]);

  const monthOf = new Date(anchor);
  const inMonth = (t: number) => new Date(t).getMonth() === monthOf.getMonth();
  const anyThisMonth = cells.some(t => inMonth(t) && byDay.has(t));

  const nearest = useMemo(() => {
    if (entries.length === 0) return null;
    let best: number | null = null;
    for (const e of entries) {
      const m = monthStart(startOfDay(e.when));
      if (best === null || Math.abs(m - anchor) < Math.abs(best - anchor)) best = m;
    }
    return best === anchor ? null : best;
  }, [entries, anchor]);

  if (entries.length === 0) {
    return <Text type="text2" color="secondary" element="p" ellipsis={false}>{nothingNote}</Text>;
  }

  return (
    <div className="cal">
      <div className="cal-bar">
        <Button size="small" kind="tertiary" onClick={() => setAnchor(a => addMonths(a, -1))}
                aria-label="Previous month">‹</Button>
        <Text type="text2" weight="medium">
          {MONTH[monthOf.getMonth()]} {monthOf.getFullYear()}
        </Text>
        <Button size="small" kind="tertiary" onClick={() => setAnchor(monthStart(today))}>Today</Button>
        <Button size="small" kind="tertiary" onClick={() => setAnchor(a => addMonths(a, 1))}
                aria-label="Next month">›</Button>
      </div>

      {!anyThisMonth && nearest !== null && (
        <div className="cal-jump">
          <Text type="text3" color="secondary">Nothing this month. </Text>
          <Button size="small" kind="tertiary" onClick={() => setAnchor(nearest)}>
            Jump to {MONTH[new Date(nearest).getMonth()]} {new Date(nearest).getFullYear()}
          </Button>
        </div>
      )}

      <div className="cal-grid">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
          <div key={d} className="cal-dow"><Text type="text3" color="secondary">{d}</Text></div>
        ))}
        {cells.map(t => {
          const list = byDay.get(t) ?? [];
          return (
            <div key={t} className={`cal-cell${inMonth(t) ? "" : " is-outside"}${t === today ? " is-today" : ""}`}>
              <div className="cal-daynum"><Text type="text3" color="secondary">{new Date(t).getDate()}</Text></div>
              {list.slice(0, 3).map(e => (
                <button key={e.id + e.kind} type="button"
                        className={`cal-entry cal-tone-${e.tone ?? "planned"}`}
                        onClick={e.onOpen} disabled={!e.onOpen}
                        title={`${e.label} — ${e.kind}`}>
                  <span className="cal-entry-kind">{e.kind}</span>
                  <span className="cal-entry-label">{e.label}</span>
                </button>
              ))}
              {list.length > 3 && (
                <Text type="text3" color="secondary">+{list.length - 3} more</Text>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
