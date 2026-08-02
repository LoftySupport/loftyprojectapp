import { useState } from "react";
import { Chips, Counter, Heading, Text } from "@vibe/core";
import { PROJECT_TYPES, PROJECT_TYPE_LABELS, type ProjectType } from "../data/types";
import { useCheckpoints, usePropertyDefs, useStages, useTemplatePhases } from "../data/useLookups";
import "../components/ui.css";

/**
 * The job template — the set-up a new job inherits.
 *
 * This is configuration, not records, so nothing here is tokenised: the phases, the
 * teams that own them and the checkpoints they expect are the process itself. Creating
 * a job from a template is what keeps every job's data consistent enough to report on.
 */
export function TemplatesPage() {
  const [type, setType] = useState<ProjectType>(PROJECT_TYPES[0]);
  const { stageNames } = useStages();
  const { teamsByStage, expectedDaysByStage } = useTemplatePhases();
  const { byStage: checkpointsByStage, checkpoints } = useCheckpoints();
  const { slotsFor } = usePropertyDefs();

  const checkpointCount = checkpoints.length;
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
          {stageNames.length} phases · {checkpointCount} checkpoints
        </Text>
      </div>

      <div className="toolbar">
        <span className="toolbar-label">Template</span>
        {PROJECT_TYPES.map(t => (
          <Chips
            key={t}
            label={PROJECT_TYPE_LABELS[t]}
            readOnly={false}
            onClick={() => setType(t)}
            color={t === type ? "primary" : undefined}
          />
        ))}
      </div>

      <div className="phase-grid">
        {stageNames.map((stage, i) => {
          const fields = jobFields.filter(f => f.stageName === stage);
          return (
            <section className="phase-card" key={stage}>
              <Text type="text3" color="secondary">Phase {i + 1}</Text>
              <Heading type="h3" weight="medium">{stage}</Heading>

              <div className="stack-tight" style={{ marginTop: "var(--space-8)" }}>
                <Text type="text3" color="secondary">
                  {(teamsByStage[stage] ?? []).join(" or ")}
                </Text>
                <Text type="text3" color="secondary">
                  Expected {expectedDaysByStage[stage]} days
                </Text>
              </div>

              <div className="card-divider" style={{ margin: "var(--space-12) 0" }} />

              <div className="panel-head">
                <Text type="text3" weight="bold">Checkpoints</Text>
                <Counter count={checkpointsByStage[stage]?.length ?? 0} kind="line" />
              </div>
              {(checkpointsByStage[stage] ?? []).map(c => (
                <div className="checkpoint" key={c.label}>
                  <input type="checkbox" disabled aria-label={c.label} />
                  <Text type="text3">{c.label}</Text>
                </div>
              ))}

              {fields.length > 0 && (
                <>
                  <div className="card-divider" style={{ margin: "var(--space-12) 0" }} />
                  <div className="panel-head">
                    <Text type="text3" weight="bold">Fields captured here</Text>
                    <Counter count={fields.length} kind="line" />
                  </div>
                  {fields.map(f => (
                    <div className="checkpoint" key={f.key}>
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
