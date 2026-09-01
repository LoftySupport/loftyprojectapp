import { useMemo } from "react";
import { Text } from "@vibe/core";
import { Link } from "react-router-dom";
import { useQuery } from "../data/DataProvider";
import { useProcesses, usePropertyAccess, usePropertyDefs, useTeams } from "../data/useLookups";
import type { BoardJob } from "../data/boardModel";
import { PROCESS_RUN_HEALTH_LABELS, isRunOpen, teamName, type ProcessRun } from "../data/types";
import "./ui.css";
import "./processes.css";

/**
 * The Processes report — where every process stands across the jobs in view.
 *
 * Counts only, from real runs: how many jobs have each process open, complete, overdue,
 * at risk; the average days a completed pass took. No percentage of "done" — a process
 * is a milestone or it is not, and a mean over unequal steps is a number people trust
 * that is wrong (agreed 24 Aug). Then the overdue runs themselves, longest first, each a
 * link to its job.
 *
 * The property half is the plainest possible: how many of the jobs in view have each
 * readable property recorded. Restricted properties the reader cannot see are simply not
 * rows — the access map decides.
 */
export function ProcessReport({ jobs }: { jobs: BoardJob[] }) {
  const { processes } = useProcesses();
  const { teams } = useTeams();
  const { propertyDefs } = usePropertyDefs();
  const { access } = usePropertyAccess();
  const { data: runs, loading } = useQuery(r => r.listProcessRuns(), []);

  const jobIds = useMemo(() => new Set(jobs.map(j => j.jobNumber)), [jobs]);
  const projectIds = useMemo(() => new Set(jobs.map(j => Number(j.projectNumber))), [jobs]);
  const inView = useMemo(
    () => runs.filter(r => (r.jobId ? jobIds.has(r.jobId) : r.projectId != null && projectIds.has(r.projectId))),
    [runs, jobIds, projectIds]
  );

  /** Latest attempt per (record, process). */
  const latest = useMemo(() => {
    const m = new Map<string, ProcessRun>();
    inView.forEach(r => {
      const k = `${r.jobId ?? `p${r.projectId}`}:${r.processId}`;
      const prior = m.get(k);
      if (!prior || r.attempt > prior.attempt) m.set(k, r);
    });
    return [...m.values()];
  }, [inView]);

  const rows = useMemo(() => processes.filter(p => p.isActive || latest.some(r => r.processId === p.id)).map(p => {
    const rs = latest.filter(r => r.processId === p.id);
    const done = rs.filter(r => r.status === "complete");
    const taken = done.map(r => r.daysTaken).filter((d): d is number => d != null);
    return {
      process: p,
      runs: rs.length,
      open: rs.filter(r => isRunOpen(r.status) && r.status !== "not_started").length,
      complete: done.length,
      na: rs.filter(r => r.status === "not_applicable").length,
      overdue: rs.filter(r => r.health === "overdue").length,
      atRisk: rs.filter(r => r.health === "at_risk").length,
      waiting: rs.filter(r => r.status === "waiting").length,
      avgDays: taken.length ? Math.round(taken.reduce((a, b) => a + b, 0) / taken.length) : null,
      attempts: inView.filter(r => r.processId === p.id).length - rs.length
    };
  }).filter(r => r.runs > 0), [processes, latest, inView]);

  const overdue = latest.filter(r => r.health === "overdue" || r.health === "at_risk")
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));

  const propertyRows = useMemo(() => propertyDefs
    .filter(d => d.isActive && d.scope === "job" && access(d.key).canRead)
    .map(d => ({ def: d, n: jobs.filter(j => j.recordedKeys.includes(d.key)).length }))
    .filter(r => r.n > 0)
    .sort((a, b) => b.n - a.n), [propertyDefs, access, jobs]);

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-head">
          <Text type="text2" weight="bold">Processes across the jobs in view</Text>
          <Text type="text3" color="secondary">{latest.length} runs · latest attempt per job</Text>
        </div>
        {loading && <Text type="text3" color="secondary">Loading…</Text>}
        {!loading && rows.length === 0 && (
          <Text type="text2" color="secondary" ellipsis={false}>
            No process has been started on any job in view. Start one from a job's drawer and it counts here.
          </Text>
        )}
        {rows.length > 0 && (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Process</th><th>Stage</th><th>Team</th><th className="num">Runs</th><th className="num">Open</th><th className="num">Waiting</th>
                  <th className="num">At risk</th><th className="num">Overdue</th><th className="num">Complete</th><th className="num">Not applicable</th><th className="num">Avg days</th><th className="num">Repeats</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.process.id}>
                    <td><strong>{r.process.name}</strong>{r.process.isMilestone && <span className="slot-chip">milestone</span>}</td>
                    <td className="muted">{r.process.stageName}{r.process.stageGroup ? ` · ${r.process.stageGroup}` : ""}</td>
                    <td className="muted">{r.process.owningTeam ? teamName(r.process.owningTeam, teams) : "—"}</td>
                    <td className="num">{r.runs}</td>
                    <td className="num">{r.open}</td>
                    <td className="num">{r.waiting || "—"}</td>
                    <td className="num">{r.atRisk ? <span className="health is-at_risk">{r.atRisk}</span> : "—"}</td>
                    <td className="num">{r.overdue ? <span className="health is-overdue">{r.overdue}</span> : "—"}</td>
                    <td className="num">{r.complete}</td>
                    <td className="num">{r.na || "—"}</td>
                    <td className="num">{r.avgDays ?? "—"}</td>
                    <td className="num">{r.attempts || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Text type="text3" color="secondary" ellipsis={false} element="p" style={{ marginTop: "var(--space-8)" }}>
          "Avg days" is the mean of completed passes, started to completed. "Repeats" counts
          earlier attempts an amendment superseded. A process with no expected duration can
          be neither at risk nor overdue — set one in Setup → Processes.
        </Text>
      </section>

      <section className="panel">
        <div className="panel-head">
          <Text type="text2" weight="bold">Runs at risk or overdue</Text>
          <Text type="text3" color="secondary">soonest due first</Text>
        </div>
        {overdue.length === 0 ? (
          <Text type="text3" color="secondary">None — every started process with a duration is inside it.</Text>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>Record</th><th>Process</th><th>Health</th><th>Started</th><th>Due</th><th>Waiting on</th></tr></thead>
              <tbody>
                {overdue.map(r => (
                  <tr key={r.id}>
                    {/* A link in the cell, not a click on the row: a row is not in the tab
                        order, and the person on a keyboard is the one this table is for. */}
                    <td className="nowrap">
                      {r.jobId
                        ? <Link to={`/jobs/${encodeURIComponent(r.jobId)}`} className="tap-link">{r.jobId}</Link>
                        : `Project ${r.projectId}`}
                    </td>
                    <td>{r.processName}{r.attempt > 1 ? ` (attempt ${r.attempt})` : ""}</td>
                    <td><span className={`health is-${r.health}`}>{PROCESS_RUN_HEALTH_LABELS[r.health]}</span></td>
                    <td>{r.startedAt ? new Date(r.startedAt).toLocaleDateString() : "—"}</td>
                    <td>{r.dueDate ? new Date(r.dueDate + "T00:00:00").toLocaleDateString() : "—"}</td>
                    <td className="muted">{r.waitingOn ? teamName(r.waitingOn, teams) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <Text type="text2" weight="bold">Properties recorded</Text>
          <Text type="text3" color="secondary">how many of the {jobs.length} jobs in view have each</Text>
        </div>
        {propertyRows.length === 0 ? (
          <Text type="text3" color="secondary" ellipsis={false}>
            Nothing recorded yet on the jobs in view — or nothing you may see.
          </Text>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>Property</th><th>Stage</th><th className="num">Recorded on</th><th className="num">Missing on</th></tr></thead>
              <tbody>
                {propertyRows.map(({ def, n }) => (
                  <tr key={def.key}>
                    <td><strong>{def.label}</strong></td>
                    <td className="muted">{def.stageName}</td>
                    <td className="num">{n} job{n === 1 ? "" : "s"}</td>
                    <td className="num muted">{jobs.length - n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
