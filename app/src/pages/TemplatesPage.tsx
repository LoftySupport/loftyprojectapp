import { Link } from "react-router-dom";
import { Chips, Counter, Heading, Text } from "@vibe/core";
import { PROJECT_TYPES, PROJECT_TYPE_LABELS, teamName } from "../data/types";
import { useProcessProperties, useProcesses, usePropertyDefs, useStages, useTeams, useTemplatePhases } from "../data/useLookups";
import { usePermission } from "../data/PermissionProvider";
import { accentStyle, columnAccent } from "../theme/accents";
import "../components/ui.css";
import "../components/processes.css";

/**
 * The job template, read as a page: each lifecycle phase, and inside it the processes a
 * record passes through, with what each collects and who does it.
 *
 * Everything here is read from the database — the phases from `pipeline_stages`, the
 * processes from `processes` (0078), the fields from `property_defs`. Nothing is invented
 * to fill a space: a phase with no processes says so, and a process with no duration says
 * "no duration set" rather than borrowing one.
 *
 * Editing happens in Setup → Processes and Setup → Properties; this page links there.
 */
export function TemplatesPage() {
  const { stageNames } = useStages();
  const { teamsByStage, expectedDaysByStage } = useTemplatePhases();
  const { byStage: processesByStage, processes } = useProcesses();
  const { byProcess } = useProcessProperties();
  const { slotsFor } = usePropertyDefs();
  const { teams } = useTeams();
  const { can } = usePermission();

  const activeProcesses = processes.filter(p => p.isActive);
  const milestoneCount = activeProcesses.filter(p => p.isMilestone).length;
  const fieldCount = slotsFor("job").length + slotsFor("project").length;

  return (
    <>
      <div className="page-head page-head-row">
        <div>
          <Heading type="h2" weight="bold">Processes</Heading>
          <Text type="text2" color="secondary" ellipsis={false}>
            The phases a record passes through, the processes inside each, and what every
            process collects. {can("manager") ? <>Edit them in <Link to="/setup/processes" className="tap-link">Setup → Processes</Link>.</> : null}
          </Text>
        </div>
        <Text type="text3" color="secondary">
          {stageNames.length} phases · {activeProcesses.length} processes · {milestoneCount} milestones · {fieldCount} fields
        </Text>
      </div>

      {activeProcesses.length === 0 && (
        <div className="search-note">
          <Text type="text3" ellipsis={false}>
            The <strong>phases</strong> are read from the database. No <strong>processes</strong> are
            defined yet — managers add them in Setup → Processes, and they appear here and on every record.
          </Text>
        </div>
      )}

      <div className="toolbar">
        <span className="toolbar-label">Applies to</span>
        {PROJECT_TYPES.map(t => (
          <Chips key={t} label={PROJECT_TYPE_LABELS[t]} readOnly />
        ))}
      </div>

      <div className="phase-grid">
        {stageNames.map((stage, i) => {
          const ps = (processesByStage.get(stage) ?? []).filter(p => p.isActive).sort((a, b) => a.position - b.position);
          const groups = [...new Set(ps.map(p => p.stageGroup ?? ""))];
          return (
            <section className="phase-card" key={stage} style={accentStyle(columnAccent("Stage", stage, i))}>
              <Text type="text3" color="secondary">Phase {i + 1}</Text>
              <Heading type="h3" weight="medium">{stage}</Heading>

              <div className="stack-tight" style={{ marginTop: "var(--space-8)" }}>
                <Text type="text3" color="secondary">
                  {(teamsByStage[stage] ?? []).join(" or ") || "No owning team — several teams work inside a phase"}
                </Text>
                <Text type="text3" color="secondary">
                  {expectedDaysByStage[stage] != null ? `Expected ${expectedDaysByStage[stage]} days` : "No expected duration set"}
                </Text>
              </div>

              <div className="card-divider" style={{ margin: "var(--space-12) 0" }} />

              <div className="panel-head">
                <Text type="text3" weight="bold">Processes</Text>
                <Counter count={ps.length} kind="line" />
              </div>
              {ps.length === 0 && <Text type="text3" color="secondary" ellipsis={false}>None defined for this phase.</Text>}
              {groups.map(group => (
                <div key={group || "none"}>
                  {group && groups.length > 1 && <div className="slot-process-head"><span>{group}</span></div>}
                  {ps.filter(p => (p.stageGroup ?? "") === group).map(p => {
                    const n = (byProcess.get(p.id) ?? []).length;
                    return (
                      <div className="milestone" key={p.id}>
                        <Text type="text3" ellipsis={false}>
                          {p.name}
                          {p.isMilestone && <span className="slot-chip">milestone</span>}
                          {p.isExternal && <span className="slot-chip">external</span>}
                          <span className="slot-sub">
                            {[
                              p.scope === "project" ? "project" : "each job",
                              p.owningTeam ? teamName(p.owningTeam, teams) : null,
                              p.expectedDays != null ? `${p.expectedDays} days` : null,
                              n ? `${n} field${n === 1 ? "" : "s"}` : null
                            ].filter(Boolean).join(" · ")}
                          </span>
                        </Text>
                      </div>
                    );
                  })}
                </div>
              ))}
            </section>
          );
        })}
      </div>
    </>
  );
}
