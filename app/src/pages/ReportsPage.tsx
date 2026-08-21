import { useMemo, useState } from "react";
import { Heading, Tab, TabList, Text } from "@vibe/core";
import { RECORD_STATUS_LABELS } from "../data/types";
import { useStages, useTeams } from "../data/useLookups";
import { useBoardRecords } from "../data/boardModel";
import { jobMatchesQuery, matchedOnPreviousAddress, useSearch } from "../data/SearchProvider";
import { LoadProblem, NoResults, NothingYet, PreviousAddressNote } from "../components/SearchNotices";
import { StatusPill } from "../components/RecordCards";
import { Token } from "../components/Token";
import { Toolbar, type ToolbarFilter } from "../components/Toolbar";
import { toOptions } from "../components/Select";
import { jobMatchesFilters } from "../data/filtering";
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

  const { stageNames } = useStages();
  const { teamNames } = useTeams();
  /**
   * Reports read the same filtered set as the board — a report of "the jobs in view"
   * that quietly ignored the search would contradict the screen you came from.
   */
  const { terms } = useSearch();
  const { jobs: all, loading, error } = useBoardRecords();
  /**
   * Both the toolbar's filters and the header search, which is what the count line above
   * has been claiming all along. The filters were rendered, took a value, and were never
   * read — "Showing 11 of 11" whatever you chose. Same bug the boards had before
   * `filtering.ts` existed; Reports was simply missed when it was fixed there.
   */
  const jobs = useMemo(
    () => all.filter(j => jobMatchesFilters(j, filters) && jobMatchesQuery(j, terms)),
    [all, filters, terms]
  );
  const noMatches = terms.length > 0 && jobs.length === 0;
  const stale = matchedOnPreviousAddress(jobs, terms);

  const onTrack = jobs.filter(j => j.status === "on_track").length;
  const atRisk = jobs.filter(j => j.status === "at_risk").length;
  const stalled = jobs.filter(j => j.status === "behind_schedule").length;
  const avgDays = Math.round(jobs.reduce((n, j) => n + j.daysInStage, 0) / (jobs.length || 1));
  // Guarded: a search that matches nothing would otherwise print "NaN% on track".
  const pctOnTrack = jobs.length ? Math.round((onTrack / jobs.length) * 100) : 0;

  const byStage = stageNames.map(s => ({ key: s, n: jobs.filter(j => j.stage === s).length }));
  const byTeam = teamNames.map(t => ({ key: t, n: jobs.filter(j => j.team === t).length }))
    .filter(r => r.n > 0)
    .sort((a, b) => b.n - a.n);

  const attention = jobs
    .filter(j => j.status !== "on_track")
    .sort((a, b) => b.daysInStage - a.daysInStage);

  const optionsFor = (field: string) =>
    field === "Stage" ? toOptions(stageNames) : field === "Team" ? toOptions(teamNames) : [];

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
        count={`Showing ${jobs.length} of ${all.length} jobs`}
      />

      {stale && <PreviousAddressNote />}

      {error && <LoadProblem error={error} />}

      <TabList activeTabId={tab} onTabChange={setTab}>
        <Tab>Portfolio overview</Tab>
        <Tab>Leadership summary</Tab>
        <Tab>Job report</Tab>
      </TabList>

      {loading && (
        <div className="panel" style={{ marginTop: "var(--space-16)" }}>
          <Text type="text2" color="secondary">Loading…</Text>
        </div>
      )}

      {!loading && all.length === 0 && (
        <div style={{ marginTop: "var(--space-16)" }}>
          <NothingYet
            title="Nothing to report on yet"
            description="These figures count the jobs in view. Import or create some and every tab fills in."
          />
        </div>
      )}

      {noMatches && <NoResults noun="jobs" />}

      {tab === 0 && !noMatches && !loading && all.length > 0 && (
        <div className="stack" style={{ marginTop: "var(--space-16)" }}>
          <div className="stat-row">
            <Tile n={jobs.length} label="Jobs in view" />
            <Tile n={onTrack} label={`On track (${pctOnTrack}%)`} />
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

      {tab === 1 && !noMatches && !loading && all.length > 0 && (
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

      {tab === 2 && !noMatches && !loading && all.length > 0 && (
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
                    <td>{RECORD_STATUS_LABELS[j.status]}</td>
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
