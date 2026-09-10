import { Text } from "@vibe/core";
import {
  PROJECT_TYPE_LABELS, RECORD_STATUS_LABELS, TASK_HEALTH_LABELS, isTaskLive,
  type LatestUpdate, type ProjectType, type RecordStatus, type TaskEntry
} from "../data/types";
import { Token } from "./Token";
import "./ui.css";
import "./processes.css";

/**
 * The record cards, one per level.
 *
 * Same geometry the board ships with — the structure being previewed is the structure
 * that ships. Values are tokenised until their table is wired; the card does not change
 * shape when they bind, it just stops showing braces.
 */

/**
 * Whether the status pill shows on a card.
 *
 * Lofty, 25 August: *"hide health status (don't remove it, just hide it until we have a
 * plan for it) on all cards."*
 *
 * There is no health column — `health_statuses` is parked in the dictionary, deliberately
 * unbuilt, because health is calculated and nobody has decided its inputs. What the cards
 * show is `status`, which the schema is emphatic is a different thing: what a person sets,
 * not what the system works out. On screen it does not read as that difference. Every
 * record defaults to `on_track` at creation and nothing maintains it, so the pill has been
 * telling everyone that everything is on track — which is the calculated claim it is not
 * entitled to make.
 *
 * Hidden, not removed: the column stays, the component stays, `StatusPill` still renders
 * on the drawer and in the tables where it is labelled as status. Flip this to bring it
 * back on the cards in one line, once there is a plan.
 */
export const SHOW_STATUS_ON_CARDS = false;

export function StatusPill({ status }: { status: RecordStatus }) {
  return <span className={`status-pill ${status}`}>{RECORD_STATUS_LABELS[status]}</span>;
}

export function JobCard({
  jobNumber,
  stageName,
  team,
  address,
  projectType,
  assigneeName,
  status = "on_track",
  latestUpdate = null,
  onOpen
}: {
  jobNumber: string;
  stageName: string;
  team: string;
  /**
   * The job's own current address, resolved by `job_display`. Lofty, 23 August: a card
   * shows the job number and the address, because `1001-001` identifies the job only to
   * somebody who knows the numbering and the address is what everyone says out loud.
   *
   * Null while the job has none — which after 0036 means the row is genuinely unreadable
   * rather than merely unjoined, so the token below is the honest answer and not a
   * placeholder for work not done.
   */
  address?: string | null;
  /** The project's type, inherited through `job_display`. Null until somebody sets it. */
  projectType?: string | null;
  /** Who is assigned, resolved to a name by boardModel. Null = nobody, shown as —. */
  assigneeName?: string | null;
  status?: RecordStatus;
  /**
   * The newest comment on this job (0059) — what "latest update" means here.
   *
   * Amber, 28 August: *"the latest update should be the last comment placed on the
   * job."* Null when nobody has commented, and then the card shows nothing at all: an
   * empty tinted block saying "No recent update logged" is a sentence about the app,
   * not about the job, and it would sit on every card on an unstarted board.
   */
  latestUpdate?: LatestUpdate | null;
  onOpen?: () => void;
}) {
  return (
    <article
      className="card card--unbound"
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={e => {
        if (onOpen && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={`Job ${jobNumber}`}
    >
      <header className="card-top">
        {/* The number leads. It is the thing on the contract, and it carries the project
            in its first half — 1001-001 is job 001 of project 1001. */}
        <Text type="text2" weight="medium">{jobNumber}</Text>
        {SHOW_STATUS_ON_CARDS && <StatusPill status={status} />}
      </header>

      {/* And the address underneath, which is what a person recognises. `ellipsis={false}`
          so a long one wraps to two lines rather than losing its street. */}
      <Text type="text3" color="secondary" element="div" ellipsis={false}>
        {address ?? <Token>job_display.job_current_address</Token>}
      </Text>

      {/* The latest update, kept quiet — a tinted block with a left rule, the shape the
          prototype used for the same line. It is the comment itself, clamped to two
          lines by CSS rather than cut here, so the drawer and the card can never
          disagree about what was said. */}
      {latestUpdate && (
        <div className="card-update">
          <Text type="text3" element="div" ellipsis={false} className="card-update-body">
            {latestUpdate.body}
          </Text>
          <Text type="text3" color="secondary" element="div">
            {latestUpdate.author ?? "—"} · {new Date(latestUpdate.at).toLocaleDateString()}
            {latestUpdate.editedAt && " · edited"}
          </Text>
        </div>
      )}

      <div className="card-divider" />

      <dl className="card-meta">
        <dt><Text type="text3" color="secondary">Type</Text></dt>
        <dd>
          <Text type="text3">
            {projectType
              ? PROJECT_TYPE_LABELS[projectType as ProjectType] ?? projectType
              : <Token>job_display.project_type</Token>}
          </Text>
        </dd>
        <dt><Text type="text3" color="secondary">Stage</Text></dt>
        <dd><Text type="text3">{stageName}</Text></dd>
      </dl>

      <footer className="card-foot">
        {/* No avatar until there is somebody to show. It used to render the initials
            "SB", which is a person who does not work here — and the name beside it was
            already saying, honestly, that the assignee is unbound. */}
        <div className="card-who">
          {/* The assignee resolves through boardModel now that job_assignee_id is
              read. An em dash means nobody is assigned — a real answer, not an
              absence.

              **No "Created by" line** (Amber, 28 Aug: "I don't need the created by on
              each card — check the layout on the prototype as it is much better"). It
              was added to keep two facts apart after Lofty read an empty assignee as
              "ten jobs assigned to me"; the assignee line now says who holds it, and
              who typed it in months ago is not what anybody scans a board for. The
              fact is still on the record — the drawer and the activity feed carry it. */}
          <div>
            <Text type="text3" weight="medium">{team}</Text>
            <Text type="text3" color="secondary">{assigneeName ?? "—"}</Text>
          </div>
        </div>
      </footer>
    </article>
  );
}

/**
 * A job's address with its project's site taken off the end — "Lot 1, 28 Corner Street,
 * Wandi WA 6167" under project "28 Corner Street, Wandi WA 6167" becomes "Lot 1".
 *
 * Only when the job really does sit at the project's address: anything else is returned
 * whole, which is what makes an outlier legible instead of hidden. Compared case- and
 * space-insensitively, because the two strings come from separate address rows and a
 * stray double space should not defeat the match.
 */
export function withoutSite(jobAddress: string, site: string | null): string {
  if (!site?.trim()) return jobAddress;
  // Matched with \\s+ between the site's words rather than by slicing a length: the two
  // strings come from separate address rows, and "28 Corner  Street" with a double
  // space made a length-based cut return "Lot 3,  2". Watched doing exactly that.
  const escaped = site.trim().split(/\s+/).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const tail = new RegExp("[,\\u2013\\u2014-]?\\s*" + escaped.join("\\s+") + "\\s*$", "i");
  const head = jobAddress.replace(tail, "").trim();
  // No match, or nothing left because the job IS at the site: show the whole thing.
  if (head === jobAddress.trim() || head === "") return jobAddress;
  return head.replace(/[,\u2013\u2014-]\s*$/, "").trim() || jobAddress;
}

/**
 * A task on the board (0102) — the kanban's card.
 *
 * The same geometry as `JobCard`, because a column of task cards beside a column of job
 * cards has to read as one board. What it carries is what somebody scanning a column
 * needs to act: what has to be done, whether it is late, which job it is on, when it is
 * due and who has it. Not the description — that is the reason for the task rather than
 * the task, and it belongs in the table's own column and in the record.
 *
 * `card`, not `card--unbound`: every value here is a real column on `task_display`, and
 * a dashed border says "this shape is a preview" — which would be a lie about a task.
 */
export function TaskCard({ task, onOpen }: { task: TaskEntry; onOpen?: () => void }) {
  const ref = task.jobId ?? (task.projectId != null ? `Project ${task.projectId}` : null);
  const due = task.dueEffective
    ? new Date(`${task.dueEffective}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })
    : null;
  return (
    <article
      className="card"
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={e => {
        if (onOpen && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={`Task ${task.name}`}
    >
      <header className="card-top">
        <Text type="text2" weight="medium" ellipsis={false}>{task.name}</Text>
        {/* Health, not status: the column the card is IN is usually the status, and
            repeating it on the card would spend the one chip on a fact already said.
            Suppressed for a task with no due date — "No due date" as a red-ish chip on
            every hand-typed task is noise, and the empty Due line below says it. */}
        {isTaskLive(task.status) && task.health !== "no_due_date" && (
          <span className={`health is-${task.health}`}>{TASK_HEALTH_LABELS[task.health]}</span>
        )}
      </header>

      {ref && (
        <Text type="text3" color="secondary" element="div" ellipsis={false}>
          {ref}{task.recordName ? ` · ${task.recordName}` : ""}
        </Text>
      )}

      {/* Only when there are boxes to tick. A "0 of 0" on a task nobody wrote a
          checklist for is a count of nothing. */}
      {task.checklistTotal > 0 && (
        <div className="card-progress">
          <div className="card-progress-track">
            <div
              className="card-progress-fill"
              style={{ width: `${(task.checklistDone / task.checklistTotal) * 100}%` }}
            />
          </div>
          <Text type="text3" color="secondary">
            {task.checklistDone} of {task.checklistTotal} ticked
          </Text>
        </div>
      )}

      <div className="card-divider" />

      {/* Due sits in the meta list rather than beside the assignee in the footer. It
          was in the footer and the two crushed each other on a narrow column — a
          process name is long, a date must not wrap, and neither would give way. */}
      <dl className="card-meta">
        <dt><Text type="text3" color="secondary">Due</Text></dt>
        <dd><Text type="text3">{due ?? "No due date"}</Text></dd>
        {/* "Manual" is the honest word for a task nobody's workflow raised, and it is a
            real answer rather than a blank. */}
        <dt><Text type="text3" color="secondary">Raised by</Text></dt>
        <dd><Text type="text3" ellipsis={false}>{task.processName ?? "Manual"}</Text></dd>
      </dl>

      <footer className="card-foot">
        <div className="card-who">
          <div>
            <Text type="text3" color="secondary">Assigned to</Text>
            <Text type="text3" weight="medium">{task.assigneeName ?? "Nobody"}</Text>
          </div>
        </div>
      </footer>
    </article>
  );
}

export function ProjectCard({
  projectNumber,
  jobs,
  address,
  suburb,
  stage,
  projectType,
  targetCompletion,
  status = "on_track",
  ofTotal,
  onOpen
}: {
  projectNumber: string;
  /** The project's jobs, each with its own lot address for the list at the foot. */
  jobs: { jobNumber: string; address: string | null; stage?: string }[];
  /**
   * How many jobs the project has in total, when this card is showing only SOME of them.
   *
   * Amber, 3 September: on a pipeline board a project appears in every column its jobs
   * occupy, "and the jobs split to the different stages". So the same project is drawn
   * three times with three different slices — and the progress bar below, which counts
   * completed jobs out of the ones it was handed, would then read "0 of 4 completed" on a
   * card for a project that is 9 of 11 done. That is not a smaller truth, it is a wrong
   * one, so a sliced card says what it is showing instead of computing a rate from it.
   */
  ofTotal?: number;
  /** The project's current address — null for a project that has none yet. */
  address?: string | null;
  suburb?: string | null;
  /** The project's own lifecycle stage — follows its slowest live job (0041). */
  stage?: string | null;
  projectType?: string | null;
  targetCompletion?: string | null;
  status?: RecordStatus;
  onOpen?: () => void;
}) {
  return (
    <article
      className="card card--unbound"
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={e => {
        if (onOpen && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={`Project ${projectNumber}`}
    >
      <header className="card-top">
        <Text type="text3" color="secondary">Project {projectNumber}</Text>
        {SHOW_STATUS_ON_CARDS && <StatusPill status={status} />}
      </header>

      <Text type="text1" weight="medium" ellipsis={false}>
        {address ?? <Token>project_display.current_address</Token>}
      </Text>

      <div className="card-divider" />

      {/* Progress (G26), derived from the one real per-job fact the card holds:
          how many of the project's jobs have reached Completed or beyond. The
          prototype's task-based progress joins when tasks are wired. */}
      {ofTotal != null && ofTotal !== jobs.length ? (
        <div className="card-progress">
          <Text type="text3" color="secondary">
            {jobs.length} of {ofTotal} job{ofTotal === 1 ? "" : "s"} here
          </Text>
        </div>
      ) : jobs.length > 0 && (() => {
        const done = jobs.filter(j => j.stage === "Completed" || j.stage === "Closed").length;
        return (
          <div className="card-progress">
            <div className="card-progress-track">
              <div className="card-progress-fill" style={{ width: `${(done / jobs.length) * 100}%` }} />
            </div>
            <Text type="text3" color="secondary">
              {done} of {jobs.length} job{jobs.length === 1 ? "" : "s"} completed
            </Text>
          </div>
        );
      })()}

      <dl className="card-meta">
        {/* "Project stage" on a sliced card, because the column heading beside it is a
            different fact: 9001 sits in Pre-construction while one of its jobs is in
            Construction, and both lines are true. Naming which is which is the whole
            point of the grouping — a bare "Stage" next to a Construction heading reads
            as a contradiction. */}
        <dt><Text type="text3" color="secondary">{ofTotal != null && ofTotal !== jobs.length ? "Project stage" : "Stage"}</Text></dt>
        <dd><Text type="text3">{stage}</Text></dd>
        <dt><Text type="text3" color="secondary">Suburb</Text></dt>
        <dd>
          <Text type="text3">
            {suburb ?? <Token>addresses.suburb</Token>}
          </Text>
        </dd>
        <dt><Text type="text3" color="secondary">Type</Text></dt>
        <dd>
          <Text type="text3">
            {projectType
              ? PROJECT_TYPE_LABELS[projectType as ProjectType] ?? projectType
              : <Token>projects.project_type</Token>}
          </Text>
        </dd>
        <dt><Text type="text3" color="secondary">Target</Text></dt>
        <dd>
          {/* A project with no target date says so in words (Amber, 2 Sep: "don't show the
              variable… have as not set"). Not a column token, not a dash, never a date
              parsed from nothing. */}
          <Text type="text3" color={targetCompletion ? undefined : "secondary"}>
            {targetCompletion
              ? new Date(targetCompletion).toLocaleDateString()
              : <span className="pf-unset">Not set</span>}
          </Text>
        </dd>
      </dl>

      <div className="card-divider" />

      <Text type="text3" color="secondary">
        {/* "on this project" is only true when the card holds the whole project. On a
            pipeline board it holds one column's worth, and the same sentence would have
            claimed a project with eleven jobs had two. */}
        {ofTotal != null && ofTotal !== jobs.length
          ? `${jobs.length} of this project's ${ofTotal} jobs`
          : `${jobs.length} job${jobs.length === 1 ? "" : "s"} on this project`}
      </Text>
      <div className="stack-tight">
        {/* Each job's own lot address, resolved — a wall of thirty tokens on a
            thirty-lot project read as "the app doesn't show addresses", when the only
            thing missing was passing them down. Capped so that project is a card, not
            a column.

            Shown as what DIFFERS from the project's address: seven lines each ending
            "28 Corner Street, Wandi WA 6167" under a card titled "28 Corner Street,
            Wandi WA 6167" made the eye hunt thirty characters deep for the two that
            change. A job genuinely somewhere else keeps its whole address — and now
            stands out, because it is the only line that does. */}
        {jobs.slice(0, 8).map(j => (
          <div key={j.jobNumber}>
            <Text type="text3" weight="medium" element="span">{j.jobNumber}</Text>{" "}
            <Text type="text3" color="secondary" element="span">
              {j.address ? withoutSite(j.address, address ?? null)
                         : <Token>addresses.consolidated_address</Token>}
            </Text>
          </div>
        ))}
        {jobs.length > 8 && (
          <Text type="text3" color="secondary">
            and {jobs.length - 8} more — open the project to see them all
          </Text>
        )}
      </div>
    </article>
  );
}
