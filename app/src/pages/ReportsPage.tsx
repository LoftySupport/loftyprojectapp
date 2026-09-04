import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Heading, Tab, TabList, Text } from "@vibe/core";
import { PROJECT_TYPES, PROJECT_TYPE_LABELS, RECORD_STATUS_LABELS } from "../data/types";
import { useProcesses, usePropertyAccess, usePropertyDefs, useStages, useTeams } from "../data/useLookups";
import { useBoardRecords } from "../data/boardModel";
import { jobMatchesQuery, matchedOnPreviousAddress, useSearch } from "../data/SearchProvider";
import { LoadProblem, NoResults, NothingYet, PreviousAddressNote } from "../components/SearchNotices";
import { StatusPill } from "../components/RecordCards";
import { Token, token } from "../components/Token";
import { Toolbar, type ToolbarFilter } from "../components/Toolbar";
import { ExportMenu } from "../components/ExportMenu";
import { tableFromFields, tableOfFigures, type ExportDocument } from "../data/export";
import { toOptions } from "../components/Select";
import { PROCESS_HEALTH_FILTER_OPTIONS, RECORDED_FILTER_OPTIONS, jobMatchesFilters } from "../data/filtering";
import { ProcessReport } from "../components/ProcessReport";
import { STAGE_ACCENTS } from "../theme/accents";
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
  // Report rows open the job (G38) — the one table family that didn't navigate.
  const navigate = useNavigate();

  const { stageNames } = useStages();
  const { teamNames } = useTeams();
  const { processes } = useProcesses();
  const { propertyDefs } = usePropertyDefs();
  const { access: filterAccess } = usePropertyAccess();
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

  // The four tabs, named so the export button can say what it downloads. The Processes
  // tab is not here: its report is computed inside `ProcessReport`, and its Export button
  // lives there too, next to the data, so the two cannot drift.
  const TABS = ["Portfolio overview", "Leadership summary", "Job report", "Processes"];

  /**
   * The report as a file. **The tab you are on**, not all of them: the tabs are different
   * reports for different audiences, and a leadership summary arriving with a 200-row job
   * table stapled to it is not the thing anybody asked for.
   *
   * The figures go in as figures. A stat tile is a number with a label, which is a
   * two-column table — so "On track (64%)" arrives as a row of a sheet somebody can put
   * in a deck, rather than as a picture of a tile. The bars are the same: a bar is a count
   * drawn wide, and the count is what survives the trip to a spreadsheet or a Word table.
   */
  const buildExport = (): ExportDocument => {
    const filtersSet = filters.filter(f => f.value).length;
    const note = [
      `Showing ${jobs.length} of ${all.length} jobs`,
      filtersSet > 0 ? `${filtersSet} filter${filtersSet === 1 ? "" : "s"} set` : null,
      terms.length > 0 ? `search: ${terms.join(" ")}` : null
    ]
      .filter(Boolean)
      .join(" · ");

    const jobFields = [
      { label: "Job", text: (j: (typeof jobs)[number]) => j.jobNumber },
      { label: "Project", text: (j: (typeof jobs)[number]) => j.projectNumber },
      {
        label: "Address",
        text: (j: (typeof jobs)[number]) =>
          j.currentAddress ?? token("addresses.consolidated_address")
      },
      { label: "Stage", text: (j: (typeof jobs)[number]) => j.stage },
      { label: "Team", text: (j: (typeof jobs)[number]) => j.team },
      { label: "Assigned to", text: (j: (typeof jobs)[number]) => j.assigneeName ?? null },
      { label: "Days in stage", numeric: true, text: (j: (typeof jobs)[number]) => j.daysInStage },
      { label: "Status", text: (j: (typeof jobs)[number]) => RECORD_STATUS_LABELS[j.status] }
    ];

    if (tab === 1) {
      return {
        title: "Leadership summary",
        note,
        tables: [
          tableOfFigures("Leadership summary", "Figure", [
            { key: "Jobs in flight", n: jobs.length },
            { key: "Teams holding work", n: byTeam.length },
            { key: "Needing attention", n: atRisk + stalled }
          ]),
          tableOfFigures("Where the work is sitting", "Team", byTeam, "by team, longest queue first")
        ]
      };
    }

    if (tab === 2) {
      return {
        title: "Job report",
        note,
        tables: [tableFromFields("Every job", jobFields, jobs)]
      };
    }

    return {
      title: "Portfolio overview",
      note,
      tables: [
        tableOfFigures("Portfolio at a glance", "Figure", [
          { key: "Jobs in view", n: jobs.length },
          { key: "On track", n: onTrack },
          { key: "On track (%)", n: pctOnTrack },
          { key: "At risk", n: atRisk },
          { key: "Stalled", n: stalled },
          { key: "Average days in stage", n: avgDays }
        ]),
        tableOfFigures("Jobs by stage", "Stage", byStage),
        tableOfFigures("Jobs by team", "Team", byTeam),
        // Kept even when it is empty, and the note says which it is: "nothing needs
        // attention" is the good news, and a report that drops the section instead
        // reads as a report that lost it.
        tableFromFields(
          "Needs attention",
          jobFields,
          attention,
          attention.length === 0
            ? "Nothing in view is at risk or stalled"
            : "at risk or stalled, longest-running first"
        )
      ]
    };
  };

  const optionsFor = (field: string) =>
    field === "Stage" ? toOptions(stageNames)
    : field === "Team" ? toOptions(teamNames)
    : field === "Type" ? PROJECT_TYPES.map(t => ({ value: t, label: PROJECT_TYPE_LABELS[t] }))
    : field === "Process" ? processes.filter(x => x.isActive).map(x => ({ value: x.key, label: `${x.name} (${x.stageName})` }))
    : field === "Process health" ? PROCESS_HEALTH_FILTER_OPTIONS
    : field === "Property" ? propertyDefs.filter(d => d.isActive && filterAccess(d.key).canRead).map(d => ({ value: d.key, label: `${d.label} (${d.scope})` }))
    : field === "Recorded" ? RECORDED_FILTER_OPTIONS
    : [];

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
        /* Named for the tab, because that is what it downloads. The Processes tab carries
           its own Export button, next to the figures it exports, so nothing here. */
        actions={
          tab !== 3 ? (
            <ExportMenu
              build={buildExport}
              label={`Export ${TABS[tab].toLowerCase()}`}
              disabled={loading || all.length === 0}
            />
          ) : undefined
        }
      />

      {stale && <PreviousAddressNote />}

      {error && <LoadProblem error={error} />}

      <TabList activeTabId={tab} onTabChange={setTab}>
        <Tab>Portfolio overview</Tab>
        <Tab>Leadership summary</Tab>
        <Tab>Job report</Tab>
        <Tab>Processes</Tab>
      </TabList>

      {tab === 3 && !noMatches && !loading && all.length > 0 && (
        <div style={{ marginTop: "var(--space-16)" }}>
          <ProcessReport jobs={jobs} />
        </div>
      )}

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
          {/* G34 — the two counts the prototype had that these tiles do not: both wait
              on wiring, and a tile showing 0 would claim they were checked. */}
          <Text type="text3" color="secondary" ellipsis={false}>
            Blocked-by-dependency and ownership-conflict counts join these tiles once
            task dependencies and the conflict flag are wired.
          </Text>

          <div className="stat-row">
            <BarPanel title="Jobs by stage" rows={byStage} colourFor={k => STAGE_ACCENTS[k]?.strip} />
            <BarPanel title="Jobs by team" rows={byTeam} />
          </div>

          <section className="panel">
            <div className="panel-head">
              <Text type="text2" weight="bold">
                Needs attention (at risk or stalled, longest-running first)
              </Text>
            </div>
            {/* Bare column headers over nothing read as broken; an empty list is good
                news and says so. */}
            {attention.length === 0 && (
              <Text type="text3" color="secondary">
                Nothing needs attention — no job in view is at risk or stalled.
              </Text>
            )}
            {attention.length > 0 && (
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
                    <tr key={j.jobNumber} onClick={() => navigate(`/jobs/${encodeURIComponent(j.jobNumber)}`)} style={{ cursor: "pointer" }}>
                      <td>{j.jobNumber}</td>
                      <td>{j.currentAddress ?? <Token>addresses.consolidated_address</Token>}</td>
                      <td>{j.stage}</td>
                      <td>{j.team}</td>
                      <td>{j.assigneeName ?? "\u2014"}</td>
                      <td className="num">{j.daysInStage}</td>
                      <td><StatusPill status={j.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
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

          {/* G36 — declared, not faked: the overrun and bottleneck analytics need SLA
              history to accumulate before there is anything true to draw. */}
          <section className="panel">
            <div className="panel-head">
              <Text type="text2" weight="bold">Overruns &amp; bottlenecks</Text>
              <Text type="text3" color="secondary">coming soon</Text>
            </div>
            <Text type="text2" color="secondary" ellipsis={false}>
              Once stage SLAs are set (Setup → Automations) and jobs accumulate history
              against them, this panel shows where time is actually lost: phases running
              past their expected days, and the team queue everything waits behind.
              Nothing shows until it is measured — an invented bottleneck sends someone
              to fix the wrong thing.
            </Text>
          </section>
        </div>
      )}

      {tab === 2 && !noMatches && !loading && all.length > 0 && (
        <section className="panel report-print-root" style={{ marginTop: "var(--space-16)" }}>
          <div className="panel-head">
            <Text type="text2" weight="bold">Every job, every status</Text>
            {/* G37 — the browser's own print, with print CSS that drops the chrome.
                What you filtered is what prints; the print-only line says so. */}
            <Button size="small" kind="secondary" onClick={() => window.print()}>Print</Button>
          </div>
          <div className="print-only">
            Lofty job report · {new Date().toLocaleDateString()} · {jobs.length} job{jobs.length === 1 ? "" : "s"} shown
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
                  <tr key={j.jobNumber} onClick={() => navigate(`/jobs/${encodeURIComponent(j.jobNumber)}`)} style={{ cursor: "pointer" }}>
                    <td>{j.jobNumber}</td>
                    <td>{j.projectNumber}</td>
                    <td>{j.currentAddress ?? <Token>addresses.consolidated_address</Token>}</td>
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

function Bar({ label, n, max, colour }: { label: string; n: number; max: number; colour?: string }) {
  return (
    <div className="bar-row">
      <Text type="text3">{label}</Text>
      <div className="bar-track">
        <div
          className="bar-fill"
          style={{ width: `${max ? (n / max) * 100 : 0}%`, ...(colour ? { background: colour } : {}) }}
        />
      </div>
      <span className="bar-num">{n}</span>
    </div>
  );
}

function BarPanel({ title, rows, colourFor }: {
  title: string;
  rows: { key: string; n: number }[];
  /** G35 — the stage bars wear their phase colour, the same ramp as the board. */
  colourFor?: (key: string) => string | undefined;
}) {
  const max = Math.max(1, ...rows.map(r => r.n));
  return (
    <section className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">{title}</Text>
      </div>
      {rows.map(r => (
        <Bar key={r.key} label={r.key} n={r.n} max={max} colour={colourFor?.(r.key)} />
      ))}
    </section>
  );
}
