import { useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BreadcrumbsBar, BreadcrumbItem, Button, Heading, Text } from "@vibe/core";
import { useCheckpoints, useTemplatePhases } from "../data/useLookups";
import type { BoardJob } from "../data/boardModel";
import { StatusPill } from "./RecordCards";
import { PropertySlots } from "./PropertySlots";
import { ExpandButton, usePanelExpand } from "./PanelExpand";
import { JOB_MOVE_NOTE, MoveStageControl } from "./MoveStageDialog";
import { CommentsPanel } from "./CommentsPanel";
import { useRepository } from "../data/DataProvider";
import { Token } from "./Token";
import "./ui.css";

/**
 * The job record, opened beside the board rather than on a page of its own — you keep
 * your place in the list, which is the whole reason the board is the default view.
 *
 * Escape closes it and focus moves into the panel on open, because a drawer you can
 * only leave with the mouse is a trap for anyone driving from the keyboard.
 */
export function JobDrawer({ job, onClose, onMoved }: {
  job: BoardJob;
  onClose: () => void;
  /** Bumps the board's reload after a stage move, so the card is already in its new column when the drawer closes. */
  onMoved: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const repo = useRepository();
  // The drawer had no way to widen — the same record, the same shape of panel, and the
  // control only on the create side. `open` is always true here: this component is
  // mounted only while the drawer is showing.
  const { expanded, canExpand, toggle } = usePanelExpand(true);

  // Once, on mount. Keyed on `onClose` this re-ran whenever the parent re-rendered and
  // pulled focus back to the drawer — the same fault that let the create form accept
  // only one keystroke at a time. See CreatePanel for the long version.
  useEffect(() => {
    panel.current?.focus();
  }, []);

  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const { expectedDaysByStage } = useTemplatePhases();
  const { byStage: checkpointsByStage } = useCheckpoints();

  // Undefined, not 14: no stage has an expected duration set, and inventing one here
  // put a number under "Days in stage" that read as a target somebody had agreed.
  const expected = expectedDaysByStage[job.stage];
  const checkpoints = checkpointsByStage[job.stage] ?? [];

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside
        className={`drawer${expanded ? " is-expanded" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={`Job ${job.jobNumber}`}
        tabIndex={-1}
        ref={panel}
      >
        <header className="drawer-head">
          <div>
            {/* Jobs › project › job, not Board › stage › job.
                The stage is where the job is *this week*; the project is what it belongs
                to, and that never changes. Drawing the temporary relationship as the
                hierarchy and leaving the permanent one out had it backwards — and the
                database is unambiguous about which is which, since `job_id` is literally
                `project_id || '-' || job_sequence`.

                `onClick` rather than `link`: Vibe's BreadcrumbItem renders a real anchor
                for `link`, which in this app is a full page reload of a 1 MB bundle and a
                fresh auth round trip. The project also appears below as a router Link, so
                copy-link-address and middle-click are not lost. */}
            <BreadcrumbsBar type="navigation">
              <BreadcrumbItem
                text="Jobs"
                isClickable
                onClick={() => { onClose(); navigate("/jobs"); }}
              />
              <BreadcrumbItem
                text={`Project ${job.projectNumber}`}
                isClickable
                onClick={() => { onClose(); navigate(`/projects/${job.projectNumber}`); }}
              />
              <BreadcrumbItem text={job.jobNumber} isCurrent />
            </BreadcrumbsBar>
            <Heading type="h3" weight="medium">
              {job.currentAddress ?? <Token>job_display.job_current_address</Token>}
            </Heading>
            <Text type="text3" color="secondary" element="div" ellipsis={false}>
              {job.jobNumber} ·{" "}
              <Link to={`/projects/${job.projectNumber}`} onClick={onClose} className="link-button">
                Project {job.projectNumber}
              </Link>
              {" "}· {job.projectAddress ?? <Token>job_display.project_current_address</Token>}
            </Text>
          </div>
          <div className="drawer-actions">
            {canExpand && <ExpandButton expanded={expanded} onToggle={toggle} />}
            <Button kind="tertiary" size="small" onClick={onClose} aria-label="Close">
              ×
            </Button>
          </div>
        </header>

        <div className="drawer-body stack">
          <section className="panel">
            <div className="panel-head">
              <Text type="text2" weight="bold">Who it’s with</Text>
              <StatusPill status={job.status} />
            </div>
            {/* Same as the card: no invented initials while the assignee is unbound. */}
            <div className="card-who">
              <div>
                <Text type="text3" weight="medium">{job.team}</Text>
                <Text type="text3" color="secondary"><Token>profiles.full_name</Token></Text>
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
            {/* Manager and above; the component hides itself below that, the same line
                the database draws (0038). Only later phases are offered — see
                MoveStageControl for why — and choosing one asks for confirmation,
                because a lifecycle move cannot be undone. */}
            <div className="field-row">
              <div className="field-label">
                <Text type="text2">Move</Text>
              </div>
              <MoveStageControl
                subject={job.jobNumber}
                stage={job.stage}
                move={to => repo.moveJobStage(job.jobNumber, to)}
                note={JOB_MOVE_NOTE}
                onMoved={onMoved}
              />
            </div>
            <div className="field-row">
              <div className="field-label">
                <Text type="text2">Days in stage</Text>
                {expected != null && <div className="field-hint">expected {expected}</div>}
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
              <div className="checkpoint" key={c.label}>
                <input type="checkbox" disabled aria-label={c.label} />
                <Text type="text2">{c.label}</Text>
              </div>
            ))}
          </section>

          {/* The site's own facts, above the job's — fencing, pegging, the developer, the
              council. One answer for the whole project, shown here rather than copied,
              so twenty jobs on one site cannot quietly disagree about it.

              Read-only on purpose: `property_def_scope` is exclusive, and a project
              property cannot be overridden per job. Editing one happens on the project. */}
          <PropertySlots
            scope="project"
            title="Project properties"
            note="True of the whole site, so every job on it shows the same answer. Change them on the project."
          />

          {/* Then the job's own — twenty jobs, twenty answers. */}
          <PropertySlots scope="job" title="Job properties" />

          {/* The job's own thread — the same shape the project has, because Amber's
              "latest update" is one rule for both kinds of record. */}
          <CommentsPanel jobId={job.jobNumber} title="Updates & comments" />
        </div>
      </aside>
    </>
  );
}
