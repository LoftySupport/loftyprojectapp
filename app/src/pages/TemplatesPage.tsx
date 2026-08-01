import { useState } from "react";
import { Chips, Counter, Heading, Text } from "@vibe/core";
import {
  PROJECT_TYPES,
  PHASE_CHECKPOINTS,
  PHASE_EXPECTED_DAYS,
  PHASE_TEAMS,
  STAGE_NAMES,
  slotsFor,
  type ProjectType
} from "../data/lookups";
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
  const checkpointCount = STAGE_NAMES.reduce(
    (n, s) => n + (PHASE_CHECKPOINTS[s]?.length ?? 0),
    0
  );
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
          {STAGE_NAMES.length} phases · {checkpointCount} checkpoints
        </Text>
      </div>

      <div className="toolbar">
        <span className="toolbar-label">Template</span>
        {PROJECT_TYPES.map(t => (
          <Chips
            key={t}
            label={t}
            readOnly={false}
            onClick={() => setType(t)}
            color={t === type ? "primary" : undefined}
          />
        ))}
      </div>

      <div className="phase-grid">
        {STAGE_NAMES.map((stage, i) => {
          const fields = jobFields.filter(f => f.stage === stage);
          return (
            <section className="phase-card" key={stage}>
              <Text type="text3" color="secondary">Phase {i + 1}</Text>
              <Heading type="h3" weight="medium">{stage}</Heading>

              <div className="stack-tight" style={{ marginTop: "var(--space-8)" }}>
                <Text type="text3" color="secondary">
                  {PHASE_TEAMS[stage].join(" or ")}
                </Text>
                <Text type="text3" color="secondary">
                  Expected {PHASE_EXPECTED_DAYS[stage]} days
                </Text>
              </div>

              <div className="card-divider" style={{ margin: "var(--space-12) 0" }} />

              <div className="panel-head">
                <Text type="text3" weight="bold">Checkpoints</Text>
                <Counter count={PHASE_CHECKPOINTS[stage]?.length ?? 0} kind="line" />
              </div>
              {(PHASE_CHECKPOINTS[stage] ?? []).map(c => (
                <div className="checkpoint" key={c}>
                  <input type="checkbox" disabled aria-label={c} />
                  <Text type="text3">{c}</Text>
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
