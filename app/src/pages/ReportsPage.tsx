import { useState } from "react";
import { Heading, Tab, TabList, Text } from "@vibe/core";
import { HEALTH_LABELS, STAGE_NAMES, TEAMS } from "../data/lookups";
import { SHAPE_JOBS } from "../data/placeholderShape";
import { StatusPill } from "../components/RecordCards";
import { Token } from "../components/Token";
import { Toolbar, type ToolbarFilter } from "../components/Toolbar";
import { toOptions } from "../components/Select";
import "../components/ui.css";

/**
 * Reports.
 *
 * Counts and percentages stay as figures rather than tokens — they are derived from
 * rows, not read from columns, so `{{…}}` would misrepresent where they come from. Only
 * the record-level values inside the attention list are unbound.
 */
export function ReportsPage() {
  const [tab, setTab] = useState(0);
  const [filters, setFilters] = useState<ToolbarFilter[]>([]);

  const jobs = SHAPE_JOBS;
  const onTrack = jobs.filter(j => j.status === "on-track").length;
  const atRisk = jobs.filter(j => j.status === "at-risk").length;
  const stalled = jobs.filter(j => j.status === "stale").length;
  const avgDays = Math.round(jobs.reduce((n, j) => n + j.daysInStage, 0) / (jobs.length || 1));

  const byStage = STAGE_NAMES.map(s => ({ key: s, n: jobs.filter(j => j.stage === s).length }));
  const byTeam = TEAMS.map(t => ({ key: t, n: jobs.filter(j => j.team === t).length }))
    .filter(r => r.n > 0)
    .sort((a, b) => b.n - a.n);

  const attention = jobs
    .filter(j => j.status !== "on-track")
    .sort((a, b) => b.daysInStage - a.daysInStage);

  const optionsFor = (field: string) =>
    field === "Stage" ? toOptions(STAGE_NAMES) : field === "Team" ? toOptions(TEAMS) : [];

  return (
    <>
      <div className="page-head">
        <Heading type="h2" weight="bold">Reports</Heading>
        <Text type="text2" color="secondary">Portfolio health, from the jobs in view.</Text>
      </div>

      <Toolbar
        filters={filters}
        onFiltersChange={setFilters}
        optionsFor={optionsFor}
        count={`Showing ${jobs.length} of ${jobs.length} jobs`}
      />

      <TabList activeTabId={tab} onTabChange={setTab}>
        <Tab>Portfolio overview</Tab>
        <Tab>Leadership summary</Tab>
        <Tab>Job report</Tab>
      </TabList>

      {tab === 0 && (
        <div className="stack" style={{ marginTop: "var(--space-16)" }}>
          <div className="stat-row">
            <Tile n={jobs.length} label="Jobs in view" />
            <Tile n={onTrack} label={`On track (${Math.round((onTrack / jobs.length) * 100)}%)`} />
            <Tile n={atRisk} label="At risk" />
            <Tile n={stalled} label="Stalled" />
            <Tile n={avgDays} label="Avg days in stage" />
          </div>

          <div className="stat-row">
            <BarPanel title="Jobs by stage" rows={byStage} />
            <BarPanel title="Jobs by team" rows={byTeam} />
          </div>

          <section className="panel">
            <div className="panel-head">
              <Text type="text2" weight="bold">
                Needs attention (at risk or stalled, longest-running first)
              </Text>
            </div>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Job</th><th>Address</th><th>Stage</th><th>Team</th>
                    <th>Assigned to</th><th className="num">Days</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {attention.map(j => (
                    <tr key={j.jobNumber}>
                      <td>{j.jobNumber}</td>
                      <td><Token>addresses.consolidated_address</Token></td>
                      <td>{j.stage}</td>
                      <td>{j.team}</td>
                      <td><Token>profiles.full_name</Token></td>
                      <td className="num">{j.daysInStage}</td>
                      <td><StatusPill status={j.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {tab === 1 && (
        <div className="stack" style={{ marginTop: "var(--space-16)" }}>
          <div className="stat-row">
            <Tile n={jobs.length} label="Jobs in flight" />
            <Tile n={byTeam.length} label="Teams holding work" />
            <Tile n={atRisk + stalled} label="Needing attention" />
          </div>
          <section className="panel">
            <div className="panel-head">
              <Text type="text2" weight="bold">Where the work is sitting</Text>
              <Text type="text3" color="secondary">by team, longest queue first</Text>
            </div>
            {byTeam.map(r => (
              <Bar key={r.key} label={r.key} n={r.n} max={byTeam[0]?.n ?? 1} />
            ))}
          </section>
        </div>
      )}

      {tab === 2 && (
        <section className="panel" style={{ marginTop: "var(--space-16)" }}>
          <div className="panel-head">
            <Text type="text2" weight="bold">Every job, every status</Text>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Job</th><th>Project</th><th>Address</th><th>Stage</th>
                  <th>Team</th><th className="num">Days</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(j => (
                  <tr key={j.jobNumber}>
                    <td>{j.jobNumber}</td>
                    <td>{j.projectNumber}</td>
                    <td><Token>addresses.consolidated_address</Token></td>
                    <td>{j.stage}</td>
                    <td>{j.team}</td>
                    <td className="num">{j.daysInStage}</td>
                    <td>{HEALTH_LABELS[j.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function Tile({ n, label }: { n: number; label: string }) {
  return (
    <div className="stat-tile">
      <div className="stat-num">{n}</div>
      <div className="stat-lbl">{label}</div>
    </div>
  );
}

function Bar({ label, n, max }: { label: string; n: number; max: number }) {
  return (
    <div className="bar-row">
      <Text type="text3">{label}</Text>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${max ? (n / max) * 100 : 0}%` }} />
      </div>
      <span className="bar-num">{n}</span>
    </div>
  );
}

function BarPanel({ title, rows }: { title: string; rows: { key: string; n: number }[] }) {
  const max = Math.max(1, ...rows.map(r => r.n));
  return (
    <section className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">{title}</Text>
      </div>
      {rows.map(r => (
        <Bar key={r.key} label={r.key} n={r.n} max={max} />
      ))}
    </section>
  );
}
