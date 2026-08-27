import { Chips, Counter, Heading, Text } from "@vibe/core";
import { PROJECT_TYPES, PROJECT_TYPE_LABELS } from "../data/types";
import { useMilestones, usePropertyDefs, useStages, useTemplatePhases } from "../data/useLookups";
import { accentStyle, columnAccent } from "../theme/accents";
import "../components/ui.css";

/**
 * The job template — the set-up a new job inherits.
 *
 * Half of this page is now real and half of it is missing, and the difference matters
 * more than either half. The phases and the team that picks each one up come from
 * `pipeline_stages`. The milestones and the fields do not exist: `pipeline_stage_tasks`
 * and `property_defs` are specified and not built.
 *
 * What this page used to show instead was 36 milestones and 11 field definitions that
 * were invented — "Slab poured", "Defect walkthrough", plausible enough that the page's
 * own comment described them as "the process itself". They were not. The real process is
 * the 57-step preconstruction schedule and the process map, both still being revised, and
 * both needing a person to map each step to a team.
 *
 * So the sections stay, with nothing in them and a line saying why. A section that is
 * visibly unconfigured invites somebody to configure it; a section full of a convincing
 * guess gets quoted back at people as though Lofty had agreed it.
 */
export function TemplatesPage() {
  const { stageNames } = useStages();
  const { teamsByStage, expectedDaysByStage } = useTemplatePhases();
  const { byStage: milestonesByStage, milestones } = useMilestones();
  const { slotsFor } = usePropertyDefs();

  const milestoneCount = milestones.length;
  const jobFields = slotsFor("job");

  return (
    <>
      <div className="page-head page-head-row">
        <div>
          <Heading type="h2" weight="bold">Job template</Heading>
          <Text type="text2" color="secondary">
            The phases a job passes through, the team that picks it up at each one, and what
            they are expected to complete before it moves on.
          </Text>
        </div>
        <Text type="text3" color="secondary">
          {stageNames.length} phases · {milestoneCount} milestones
        </Text>
      </div>

      {(milestoneCount === 0 || jobFields.length === 0) && (
        <div className="search-note">
          <Text type="text3" ellipsis={false}>
            The <strong>phases</strong> and the team that owns each one are read from the
            database. The <strong>milestones</strong> and <strong>fields</strong> are not
            configured yet — those tables are not built, and the lists that used to appear
            here were written to fill the space rather than taken from Lofty's process.
          </Text>
        </div>
      )}

      {/* One template, applying to every project type.
          There was a chip per type here. They highlighted on click and nothing below read
          the selection, so switching from Residential to Commercial showed the identical
          page — a filter that looked broken rather than a feature that did not exist yet.
          Read-only chips instead: they still say who the template covers, and they no
          longer promise to narrow it. */}
      <div className="toolbar">
        <span className="toolbar-label">Applies to</span>
        {PROJECT_TYPES.map(t => (
          <Chips key={t} label={PROJECT_TYPE_LABELS[t]} readOnly />
        ))}
      </div>

      <div className="phase-grid">
        {stageNames.map((stage, i) => {
          const fields = jobFields.filter(f => f.stageName === stage);
          return (
            /* The same ramp the board wears (theme/accents). These are the same seven
               phases; wearing one flat colour here and a ramp there made the template
               read as a different vocabulary from the board it describes. */
            <section className="phase-card" key={stage} style={accentStyle(columnAccent("Stage", stage, i))}>
              <Text type="text3" color="secondary">Phase {i + 1}</Text>
              <Heading type="h3" weight="medium">{stage}</Heading>

              <div className="stack-tight" style={{ marginTop: "var(--space-8)" }}>
                <Text type="text3" color="secondary">
                  {(teamsByStage[stage] ?? []).join(" or ") || "No owning team set"}
                </Text>
                <Text type="text3" color="secondary">
                  {expectedDaysByStage[stage] != null
                    ? `Expected ${expectedDaysByStage[stage]} days`
                    : "No expected duration set"}
                </Text>
              </div>

              <div className="card-divider" style={{ margin: "var(--space-12) 0" }} />

              <div className="panel-head">
                <Text type="text3" weight="bold">Milestones</Text>
                <Counter count={milestonesByStage[stage]?.length ?? 0} kind="line" />
              </div>
              {(milestonesByStage[stage] ?? []).length === 0 ? (
                <Text type="text3" color="secondary" ellipsis={false}>
                  None defined yet.
                </Text>
              ) : (
                (milestonesByStage[stage] ?? []).map(c => (
                  <div className="milestone" key={c.label}>
                    <input type="checkbox" disabled aria-label={c.label} />
                    <Text type="text3">{c.label}</Text>
                  </div>
                ))
              )}

              {fields.length > 0 && (
                <>
                  <div className="card-divider" style={{ margin: "var(--space-12) 0" }} />
                  <div className="panel-head">
                    <Text type="text3" weight="bold">Fields captured here</Text>
                    <Counter count={fields.length} kind="line" />
                  </div>
                  {fields.map(f => (
                    <div className="milestone" key={f.key}>
                      <Text type="text3">
                        {f.label}
                        {f.required && <span className="slot-required">required</span>}
                      </Text>
                    </div>
                  ))}
                </>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
