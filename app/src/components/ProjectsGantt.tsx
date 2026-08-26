import { Text } from "@vibe/core";
import type { BoardProject } from "../data/boardModel";
import "./ui.css";

/**
 * The projects timeline (G28), from the two real dates a project carries: start date
 * and target completion — both editable on the project page. Proportional bars with
 * month ticks rather than a day grid, because a build spans months and a 28px day
 * column would put the target three screens away.
 *
 * A project missing either date is listed underneath, honestly, with where to set
 * them — not drawn from a guess.
 */

const DAY = 86_400_000;

const startOfDay = (d: Date | string | number) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
};

export function ProjectsGantt({ rows, onOpen }: {
  rows: BoardProject[];
  onOpen: (p: BoardProject) => void;
}) {
  const today = startOfDay(Date.now());
  const dated = rows.filter(p => p.startDate && p.targetCompletion);
  const undated = rows.filter(p => !(p.startDate && p.targetCompletion));

  if (dated.length === 0) {
    return (
      <div className="panel">
        <Text type="text2" color="secondary" ellipsis={false}>
          No project has both a start date and a target completion yet. Set them on the
          project page and this timeline draws itself — nothing here is estimated.
        </Text>
      </div>
    );
  }

  let min = today;
  let max = today;
  for (const p of dated) {
    const s = startOfDay(p.startDate!);
    const t = startOfDay(p.targetCompletion!);
    if (s < min) min = s;
    if (t > max) max = t;
  }
  min -= 7 * DAY;
  max += 14 * DAY;
  const span = max - min;
  const x = (t: number) => `${((t - min) / span) * 100}%`;

  // Month ticks across the window.
  const ticks: number[] = [];
  {
    const d = new Date(min);
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    for (; d.getTime() < max; d.setMonth(d.getMonth() + 1)) ticks.push(startOfDay(d));
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">Start to target, per project</Text>
        <Text type="text3" color="secondary">
          real dates only · rust = past its target and not completed
        </Text>
      </div>
      <div className="pgantt">
        <div className="pgantt-row pgantt-head">
          <div className="pgantt-left" />
          <div className="pgantt-lane">
            {ticks.map(t => (
              <span className="pgantt-tick" style={{ left: x(t) }} key={t}>
                {new Date(t).toLocaleDateString(undefined, { month: "short", year: "2-digit" })}
              </span>
            ))}
            <span className="gantt-today-line" style={{ left: x(today) }} aria-hidden />
          </div>
        </div>
        {dated.map(p => {
          const s = startOfDay(p.startDate!);
          const t = startOfDay(p.targetCompletion!);
          const finished = p.stage === "Completed" || p.stage === "Closed";
          const over = !finished && today > t;
          return (
            <div className="pgantt-row" key={p.projectNumber}>
              <button type="button" className="pgantt-left pgantt-project" onClick={() => onOpen(p)}>
                <span className="gantt-job-no">Project {p.projectNumber}</span>
                <span className="gantt-job-sub">{p.suburb ?? p.stage}</span>
              </button>
              <div className="pgantt-lane">
                <div
                  className={"pgantt-bar" + (over ? " is-over" : "")}
                  style={{ left: x(s), width: `calc(${x(t)} - ${x(s)})` }}
                  title={`${new Date(s).toLocaleDateString()} → ${new Date(t).toLocaleDateString()}`}
                />
                <span className="gantt-today-line" style={{ left: x(today) }} aria-hidden />
              </div>
            </div>
          );
        })}
      </div>
      {undated.length > 0 && (
        <Text type="text3" color="secondary" ellipsis={false} className="gantt-note">
          Not drawn — no start or target set yet:{" "}
          {undated.map(p => `Project ${p.projectNumber}`).join(", ")}. Both dates are
          editable on the project page.
        </Text>
      )}
    </div>
  );
}
