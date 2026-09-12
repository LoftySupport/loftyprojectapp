import { useMemo, useState, type ReactNode } from "react";
import { Add, ExternalPage } from "@vibe/icons";
import { useQuery } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import type { BoardJob } from "../data/boardModel";
import { RECORD_STATUS_LABELS, type ProcessRun } from "../data/types";
import { HealthChip, StageTrack, type HealthStatus, type Stage } from "./record/StageTrack";
import { FieldList, FieldRow } from "./record/FieldRow";
import { RecordSection } from "./record/RecordDrawer";
import { JobTitle } from "./record/RecordBreadcrumb";
import { ProcessSteps, type ProcessStep } from "./record/ProcessSteps";
import { Token } from "./Token";
import "./record/record.css";

/**
 * The job record's head and its three sections — the same content at both widths.
 *
 * 6a and 6b are **the same record at two widths, not two designs**: the same properties
 * in the same order, differing only in the label column (110 vs 136), the control width,
 * and whether the stage strip draws as separated bars or a butted track. So there is one
 * component and a `variant`, and the two cannot drift into showing different things.
 *
 * WHAT IS HERE, AND WHAT IS NOT
 *
 *   Here: the title and health, the blocked-by banner, Job Stage, Key properties and
 *   Process. Those are the five things 6a specifies above the footer.
 *
 *   Not here: Documents, Maintenance, the timeline, Parties, the full property list.
 *   They are not in the handoff's drawer, but they are real working screens and removing
 *   them would take function away that nobody asked to lose — so they stay below this, as
 *   the handoff's own *"Properties and Contacts & Companies — collapsed rows with
 *   counts"* tail. See `JobDrawer`.
 */

/** The five segments, always (decision 4). Closed and Cancelled are not stages here. */
const STRIP = [
  "Acquisition & Development",
  "Pre-construction",
  "Construction",
  "Maintenance",
  "Completed"
] as const;

/** What the five are called on the strip. Only the last differs from the database. */
const STRIP_LABEL: Record<string, string> = { Completed: "Complete" };

/**
 * The record's health, from the status somebody set.
 *
 * NOT a derived health — that is open question 8 and nobody has defined its inputs. This
 * reads `job_status`, which is a real column a person sets, and maps it onto the three
 * the design draws. `behind_schedule` is the app's word for what the design calls
 * overdue; `on_hold` is not a health, so it reads as at risk rather than as fine.
 */
function healthOf(status: BoardJob["status"]): HealthStatus {
  if (status === "behind_schedule") return "overdue";
  if (status === "at_risk" || status === "on_hold") return "at-risk";
  return "on-track";
}

/** dd/mm/yyyy — what every date in this app reads as. */
function au(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function JobRecord({
  job,
  variant = "drawer",
  onChangeAddress,
  currentlyWithControl,
  onSetCompletion
}: {
  job: BoardJob;
  variant?: "drawer" | "page";
  /** The `+` on Current address — opens the add-address form the drawer already has. */
  onChangeAddress?: () => void;
  /**
   * The real assignee control, passed in rather than built here.
   *
   * The design's "Currently with" dropdown **reassigns** — it is not a readout. The app
   * already has a person picker that knows about teams, RLS and who may (`PersonSelect`),
   * and rebuilding it here would be a second one to keep in step. So the record owns the
   * row and the caller owns the control, which is the same split `FieldRow`'s `children`
   * exists for.
   */
  currentlyWithControl?: ReactNode;
  /** Completion date — writes `job_target_completion` through the seam (0113). */
  onSetCompletion?: (iso: string | null) => void;
}) {
  const { can } = usePermission();
  const [open, setOpen] = useState({ stage: true, key: true, process: true });
  const [openStep, setOpenStep] = useState<number | null>(null);

  /**
   * The job's process runs — ONE read that feeds two things on this record: the Process
   * checklist and the Next milestone row above it. Two queries for one list would be two
   * answers that can disagree about which step is next.
   */
  const { data: runs } = useQuery<ProcessRun[]>(
    r => r.listProcessRuns({ jobId: job.jobNumber }),
    [],
    [job.jobNumber]
  );

  const health = healthOf(job.status);

  /** Where the job is in the five, and how far through. */
  const at = STRIP.indexOf(job.stage as (typeof STRIP)[number]);
  /**
   * Frozen when the job is closed or cancelled — decision 4, in one line.
   *
   * *"when a job is closed or cancelled the job pipeline is not open so that is fine and
   * it will just stay as it last was"*. Those two are not segments, so `at` is -1 for
   * them and every segment reads as done-or-todo from the dates rather than from a
   * current position. The strip stops being a live indicator and becomes a record of what
   * was done, which is exactly what she asked for.
   */
  const frozen = at < 0;

  const { data: history } = useQuery(
    r => r.listJobStageHistory(job.jobNumber),
    [],
    [job.jobNumber]
  );
  const byStage = useMemo(() => {
    const m = new Map<string, { from: string | null; days: number | null }>();
    for (const h of history) if (!m.has(h.stage)) m.set(h.stage, { from: h.from, days: h.days });
    return m;
  }, [history]);
  /** Every day the job has been alive across the five, for Complete's "Total days". */
  const totalDays = useMemo(
    () => history.reduce((n, h) => n + (h.days ?? 0), 0),
    [history]
  );

  const stages: Stage[] = STRIP.map((name, i) => {
    const seen = byStage.get(name);
    const entered = seen?.from ?? (name === job.stage ? job.stageEnteredAt : null);
    const days = seen?.days ?? (name === job.stage ? job.daysInStage : null);
    const state: Stage["state"] = frozen
      ? (entered ? "done" : "todo")
      : i < at ? "done" : i === at ? "current" : "todo";

    /**
     * 6b's two lines under each segment, from the README's own table.
     *
     * Every line here is a fact the record holds. Where it does not hold one the line is
     * **omitted** rather than drawn with a dash: Maintenance's "Open jobs / Completed
     * jobs" counts maintenance requests on this job, which this component does not load,
     * and a dash under a label reads as "none" rather than as "not asked".
     */
    const readouts: { label: string; value: string }[] = [];
    const push = (label: string, value: string | null | undefined) => {
      if (value) readouts.push({ label, value });
    };
    if (name === "Acquisition & Development") {
      push("Job started", au(entered));
      push("Days in stage", days != null ? String(days) : null);
    } else if (name === "Pre-construction") {
      push("Started on", au(entered));
      push("Days in stage", days != null ? String(days) : null);
    } else if (name === "Construction") {
      // The target until it begins, the start date once it has — the README's own
      // "Target completion (or Started on once begun)".
      if (entered) push("Started on", au(entered));
      else push("Target completion", au(job.targetCompletion));
      push("Days in stage", days != null ? String(days) : null);
    } else if (name === "Completed") {
      // "Job completed (or Target completion)" — the actual once there is one.
      if (job.endDate) push("Job completed", au(job.endDate));
      else push("Target completion", au(job.targetCompletion));
      push("Total days", totalDays ? String(totalDays) : null);
    }

    return {
      name: STRIP_LABEL[name] ?? name,
      state,
      readoutValue: au(entered) ?? undefined,
      readouts: readouts.length ? readouts : undefined
    };
  });

  /**
   * The next milestone: the first process run still open that is marked a milestone.
   *
   * Read off the runs rather than stored, which is what "Next milestone derives from the
   * process" means. Null when no milestone is open — a real state, and the row says so
   * with a dash rather than naming a step that is not next.
   */
  const nextMilestone = useMemo(() => {
    const openRuns = runs
      .filter(r => r.isMilestone && r.status !== "complete" && r.status !== "not_applicable")
      .sort((a, b) => a.position - b.position);
    const n = openRuns[0];
    if (!n) return null;
    const due = au(n.dueDate);
    return due ? `${n.processName} · ${due}` : n.processName;
  }, [runs]);

  /** The Process checklist — every run on this job, in order, as ticked steps. */
  const steps: ProcessStep[] = useMemo(
    () => runs
      .slice()
      .sort((a, b) => a.position - b.position)
      .map(r => ({
        name: r.processName,
        done: r.status === "complete",
        date: au(r.completedAt) ?? (r.dueDate ? `Due ${au(r.dueDate)}` : null),
        owner: undefined,
        fields: []
      })),
    [runs]
  );
  const doneCount = steps.filter(s => s.done).length;

  /**
   * Currently with — **the assigned person and their team**, internal staff only
   * (decision 8). *"Currently with should be the username who is currently assigned that
   * job and their team"*.
   *
   * Rendered as **name · team**, not the mockup's "Ben Sultana · Owner · Northline",
   * which reads as an external company and is misleading example data — correction 2.
   */
  const currentlyWith = job.assigneeName ? `${job.assigneeName} · ${job.team}` : null;

  const stageLabel = STRIP_LABEL[job.stage] ?? job.stage;
  const meta = frozen
    ? `${stageLabel} · ${job.daysInStage} days`
    : `Stage ${at + 1} of 5 · ${job.daysInStage} days`;

  return (
    <>
      <div className="record-title-row">
        <JobTitle
          jobNumber={job.jobNumber}
          location={job.currentAddress ?? <Token>job_display.job_current_address</Token>}
          size={variant}
        />
        {/* Guarded: a status is not-null in the database, but a pill with no label is a
            coloured dot nobody can read, and that is what a missing one drew. */}
        {job.status && (
          <HealthChip status={health} label={RECORD_STATUS_LABELS[job.status] ?? job.status} />
        )}
      </div>

      {/* The blocked-by banner, and it only draws when something is actually blocking.
          A banner that is always there saying nothing is a banner people stop seeing —
          and there is no "blocked by" column, so the honest source is a process run
          that is waiting on somebody. */}
      {runs.filter(r => r.status === "waiting" && r.waitingOn).slice(0, 1).map(r => (
        <div className="record-banner" key={r.id}>
          <span className="record-banner-icon" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <circle cx="12" cy="12" r="9" /><path d="M12 7v6" /><path d="M12 16.5v.5" />
            </svg>
          </span>
          <span className="record-banner-label">Blocked by</span>
          <span className="record-banner-reason">
            {r.processName}{r.note ? ` — ${r.note}` : ""}
          </span>
        </div>
      ))}

      <RecordSection
        title="Job Stage"
        meta={meta}
        first
        open={open.stage}
        onToggle={() => setOpen(o => ({ ...o, stage: !o.stage }))}
      >
        <StageTrack
          stages={stages}
          status={health}
          variant={variant === "page" ? "track" : "bars"}
        />
        {/* Said once, where it matters, rather than left for somebody to work out from a
            strip that has stopped moving. */}
        {frozen && (
          <p className="record-note">
            This job is {stageLabel.toLowerCase()}, so the pipeline is closed and the
            strip shows where it got to.
          </p>
        )}
      </RecordSection>

      <RecordSection
        title="Key properties"
        open={open.key}
        onToggle={() => setOpen(o => ({ ...o, key: !o.key }))}
      >
        {/* THE SAME FIXED SIX on jobs and projects (decision 6) — *"key properties for
            jobs and projects will always be those key 6 which relate to every job and
            project"*. No `is_key` flag and no manager configuration: a configurable set
            would mean two people's job records showing different things. */}
        <FieldList variant={variant}>
          <FieldRow
            label="Current address"
            value={job.currentAddress}
            type="pick"
            action={can("user") && onChangeAddress ? (
              <button
                type="button"
                className="field-add"
                onClick={onChangeAddress}
                aria-label="Add a new address for this job"
                title="Add a new address"
              >
                <Add size={16} aria-hidden />
              </button>
            ) : undefined}
          />
          {/* Read-only here on purpose: the council belongs to the ADDRESS (0108), and
              changing it is part of changing the address rather than a field of its own.
              Editing it in two places is how the two come to disagree. */}
          <FieldRow label="Council" value={job.council} />
          {/* Internal staff and their team (decision 8), rendered as **name · team** —
              not the mockup's "Ben Sultana · Owner · Northline", which reads as an
              external company and is misleading example data (correction 2). */}
          <FieldRow label="Currently with" value={currentlyWith} type="person">
            {can("user") ? currentlyWithControl : undefined}
          </FieldRow>
          <FieldRow label="Next milestone" value={nextMilestone} />
          {/* 0113. The target while the job runs, the actual once it is done — which is
              what 6b draws under Complete: *"Job completed (or Target completion)"*. */}
          <FieldRow
            label="Completion date"
            value={au(job.endDate) ?? au(job.targetCompletion)}
            type="date"
          >
            {can("user") && onSetCompletion && !job.endDate ? (
              <input
                type="date"
                className="field-box is-input"
                aria-label="Completion date being worked towards"
                value={job.targetCompletion ?? ""}
                onChange={e => onSetCompletion(e.target.value || null)}
              />
            ) : undefined}
          </FieldRow>
          <FieldRow label="SharePoint folder" value={job.sharepointUrl ? job.jobNumber : null}>
            {job.sharepointUrl ? (
              <a
                href={job.sharepointUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="field-link"
              >
                {job.jobNumber}
                {job.currentAddress ? ` — ${job.currentAddress}` : ""}
                <ExternalPage size={16} aria-hidden />
              </a>
            ) : undefined}
          </FieldRow>
        </FieldList>
      </RecordSection>

      <RecordSection
        title="Process"
        meta={steps.length ? `${doneCount} of ${steps.length} steps` : undefined}
        open={open.process}
        onToggle={() => setOpen(o => ({ ...o, process: !o.process }))}
      >
        {steps.length ? (
          <ProcessSteps
            steps={steps}
            openStep={openStep}
            onOpenStep={setOpenStep}
            // Ticking a step here would have to complete a process RUN, which has its own
            // rules (attempts, dependencies, who may). Until that is wired through the
            // seam the boxes read rather than write — the panel below this section is
            // where a run is actually moved, and two ways to complete the same step is
            // how the two come to disagree.
            canEdit={false}
            visible={variant === "drawer" ? 5 : undefined}
          />
        ) : (
          <p className="record-note">
            No process has been started on this job. Start one below to get a checklist.
          </p>
        )}
      </RecordSection>
    </>
  );
}
