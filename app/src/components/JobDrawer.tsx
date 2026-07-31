import { useEffect, useRef } from "react";
import { Avatar, BreadcrumbsBar, BreadcrumbItem, Button, Heading, Text } from "@vibe/core";
import { PHASE_CHECKPOINTS, PHASE_EXPECTED_DAYS } from "../data/lookups";
import type { ShapeJob } from "../data/placeholderShape";
import { StatusPill } from "./RecordCards";
import { PropertySlots } from "./PropertySlots";
import { Token } from "./Token";
import "./ui.css";

/**
 * The job record, opened beside the board rather than on a page of its own — you keep
 * your place in the list, which is the whole reason the board is the default view.
 *
 * Escape closes it and focus moves into the panel on open, because a drawer you can
 * only leave with the mouse is a trap for anyone driving from the keyboard.
 */
export function JobDrawer({ job, onClose }: { job: ShapeJob; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const expected = PHASE_EXPECTED_DAYS[job.stage] ?? 14;
  const checkpoints = PHASE_CHECKPOINTS[job.stage] ?? [];

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Job ${job.jobNumber}`}
        tabIndex={-1}
        ref={panel}
      >
        <header className="drawer-head">
          <div>
            <BreadcrumbsBar type="navigation">
              <BreadcrumbItem text="Board" />
              <BreadcrumbItem text={job.stage} />
              <BreadcrumbItem text={job.jobNumber} isCurrent />
            </BreadcrumbsBar>
            <Heading type="h3" weight="medium">
              <Token>jobs.address</Token>
            </Heading>
            <Text type="text3" color="secondary">
              {job.jobNumber} · <Token>projects.name</Token> · {job.projectNumber}
            </Text>
          </div>
          <Button kind="tertiary" size="small" onClick={onClose} aria-label="Close">
            ×
          </Button>
        </header>

        <div className="drawer-body stack">
          <section className="panel">
            <div className="panel-head">
              <Text type="text2" weight="bold">Who it’s with</Text>
              <StatusPill status={job.status} />
            </div>
            <div className="card-who">
              <Avatar size="small" type="text" text="SB" aria-label="Assignee, unbound" />
              <div>
                <Text type="text3" weight="medium">{job.team}</Text>
                <Text type="text3" color="secondary"><Token>users.full_name</Token></Text>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <Text type="text2" weight="bold">Phase &amp; stage</Text>
            </div>
            <div className="field-row">
              <div className="field-label">
                <Text type="text2">Phase</Text>
              </div>
              <Text type="text2" weight="medium">{job.stage}</Text>
            </div>
            <div className="field-row">
              <div className="field-label">
                <Text type="text2">Days in stage</Text>
                <div className="field-hint">expected {expected}</div>
              </div>
              <Text type="text2" weight="medium">{job.daysInStage}</Text>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <Text type="text2" weight="bold">Checkpoints</Text>
              <Text type="text3" color="secondary">from the template for this phase</Text>
            </div>
            {checkpoints.map(c => (
              <div className="checkpoint" key={c}>
                <input type="checkbox" disabled aria-label={c} />
                <Text type="text2">{c}</Text>
              </div>
            ))}
          </section>

          {/* Every field defined for a job, in the stage that captures it. */}
          <PropertySlots scope="job" />

          <section className="panel">
            <div className="panel-head">
              <Text type="text2" weight="bold">Activity &amp; comments</Text>
            </div>
            <div className="stack-tight">
              <Text type="text3" color="secondary">
                <Token>activity.description</Token>
              </Text>
              <Text type="text3" color="secondary">
                <Token>comments.author_name</Token> — <Token>comments.body</Token>
              </Text>
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}
