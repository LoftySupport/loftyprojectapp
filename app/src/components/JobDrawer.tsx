import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BreadcrumbsBar, BreadcrumbItem, Button, Heading, Tab, TabList, Text, TextField } from "@vibe/core";
import { useTemplatePhases, useTeams } from "../data/useLookups";
import type { BoardJob } from "../data/boardModel";
import { TITLE_TYPE_LABELS, TITLE_TYPES, type TeamId, type TitleType } from "../data/types";
import { StatusPill } from "./RecordCards";
import { PropertySlots } from "./PropertySlots";
import { ProcessesPanel } from "./ProcessesPanel";
import { ExpandButton, usePanelExpand } from "./PanelExpand";
import { useResizablePanel } from "./useResizablePanel";
import { JOB_MOVE_NOTE, MoveStageControl } from "./MoveStageDialog";
import { ActivityFeed } from "./ActivityFeed";
import { PartiesPanel } from "./PartiesPanel";
import { WatchButton } from "./WatchButton";
import { JobMaintenancePanel } from "./JobMaintenancePanel";
import { JobTimeline } from "./JobTimeline";
import { TasksPanel } from "./TasksPanel";
import { CloneJobDialog } from "./CloneDialog";
import { CommentsPanel } from "./CommentsPanel";
import { useQuery, useRepository } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import { Select } from "./Select";
import { Problem } from "./Form";
import { useAskDock } from "./AskDock";
import { useToasts } from "./Toasts";
import { Token } from "./Token";
import "./ui.css";

/**
 * The job record, opened beside the board rather than on a page of its own — you keep
 * your place in the list, which is the whole reason the board is the default view.
 *
 * Escape closes it and focus moves into the panel on open, because a drawer you can
 * only leave with the mouse is a trap for anyone driving from the keyboard.
 */
export function JobDrawer({ job, onClose, onMoved, siblings = [], onJump }: {
  job: BoardJob;
  onClose: () => void;
  /** Bumps the board's reload after a stage move, so the card is already in its new column when the drawer closes. */
  onMoved: () => void;
  /** Every job the drawer can jump to (G19) — the board's rows, unfiltered. */
  siblings?: BoardJob[];
  /** Jump to another job WITHOUT closing — the whole point of searching in here. */
  onJump?: (j: BoardJob) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const repo = useRepository();
  // The drawer had no way to widen — the same record, the same shape of panel, and the
  // control only on the create side. `open` is always true here: this component is
  // mounted only while the drawer is showing.
  const { expanded, canExpand, toggle } = usePanelExpand(true);
  // Drag the left edge to widen (Amber, 27 Aug). Disabled while expanded — the panel is
  // already the whole main area there, and a handle would fight the toggle.
  const { width, handleProps } = useResizablePanel(!expanded);
  const { openAsk } = useAskDock();
  const { toast } = useToasts();

  // The fullscreen tab, sticky while the drawer stays open — editing a field must not
  // bounce the view back to Main info (the prototype's rule). Docked has no tabs: a
  // 420-wide column reads better as one scroll than as four hidden ones.
  const [tab, setTab] = useState(0);

  // Once, on mount. Keyed on `onClose` this re-ran whenever the parent re-rendered and
  // pulled focus back to the drawer — the same fault that let the create form accept
  // only one keystroke at a time. See SidePanel for the long version.
  useEffect(() => {
    panel.current?.focus();
  }, []);

  // Esc is a two-step in fullscreen (G20): the first press shrinks back to the docked
  // panel — the state you came from — and the second closes. Losing the whole drawer to
  // one keypress from fullscreen threw away your place twice over.
  const close = useRef(onClose);
  close.current = onClose;
  const esc = useRef<() => void>(() => {});
  esc.current = () => {
    if (expanded) toggle();
    else close.current();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") esc.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const { expectedDaysByStage } = useTemplatePhases();

  // Editing who holds the job — the same `updateJob` the bulk bar writes through, at
  // the same rung (`user`+, backed by the `users update jobs` policy). One record here,
  // so the write saves on change and the board reloads behind the drawer.
  const { can } = usePermission();
  const { teams } = useTeams();
  const { data: profiles } = useQuery(r => r.listProfiles(), []);
  const [cloning, setCloning] = useState(false);
  const [whoBusy, setWhoBusy] = useState(false);
  const [whoErr, setWhoErr] = useState<string | null>(null);
  const saveWho = async (patch: {
    owningTeam?: TeamId;
    assigneeId?: string | null;
    titleType?: TitleType | null;
  }) => {
    if (whoBusy) return;
    setWhoBusy(true);
    setWhoErr(null);
    try {
      await repo.updateJob(job.jobNumber, patch);
      onMoved();
    } catch (err) {
      setWhoErr(err instanceof Error ? err.message : String(err));
    } finally {
      setWhoBusy(false);
    }
  };

  // The old Lofty number (Amber, 27 Aug): what SiteBook, Trello and everyone's head
  // link a job by, so it is addable right here. Draft-then-Save rather than on-blur —
  // an identifier deserves a deliberate commit, and the unique refusal needs somewhere
  // to land before focus has already gone.
  const [oldNoDraft, setOldNoDraft] = useState(job.jobNumberOld ?? "");
  const [oldNoBusy, setOldNoBusy] = useState(false);
  const [oldNoErr, setOldNoErr] = useState<string | null>(null);
  useEffect(() => { setOldNoDraft(job.jobNumberOld ?? ""); setOldNoErr(null); }, [job.jobNumber, job.jobNumberOld]);
  const oldNoDirty = oldNoDraft.trim() !== (job.jobNumberOld ?? "");
  const saveOldNo = async () => {
    if (oldNoBusy || !oldNoDirty) return;
    setOldNoBusy(true);
    setOldNoErr(null);
    try {
      await repo.updateJob(job.jobNumber, { jobNumberOld: oldNoDraft.trim() || null });
      onMoved();
    } catch (err) {
      setOldNoErr(err instanceof Error ? err.message : String(err));
    } finally {
      setOldNoBusy(false);
    }
  };

  // In-drawer search (G19): find another job and jump to it without losing the drawer.
  // Reset when the record changes, or the last search haunts the next job.
  const [find, setFind] = useState("");
  useEffect(() => { setFind(""); }, [job.jobNumber]);
  const q = find.trim().toLowerCase();
  const found = q
    ? siblings
        .filter(s =>
          s.jobNumber !== job.jobNumber &&
          `${s.jobNumber} ${s.jobNumberOld ?? ""} ${s.currentAddress ?? ""}`.toLowerCase().includes(q))
        .slice(0, 5)
    : [];

  // Undefined, not 14: no stage has an expected duration set, and inventing one here
  // put a number under "Days in stage" that read as a target somebody had agreed.
  const expected = expectedDaysByStage[job.stage];

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
        style={expanded ? undefined : { width: `min(${width}px, calc(100vw - var(--shell-rail-w, 0px)))` }}
      >
        {/* The grab edge. Its own element rather than a border, because a 1px border is
            not something a hand can catch — this is 8px wide and sits half over the
            edge, which is the shape every split pane has settled on. */}
        {!expanded && <div className="drawer-grip" {...handleProps} />}
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
              {job.jobNumber}
              {job.jobNumberOld && <> · Lofty #{job.jobNumberOld}</>} ·{" "}
              <Link to={`/projects/${job.projectNumber}`} onClick={onClose} className="link-button">
                Project {job.projectNumber}
              </Link>
              {" "}· {job.projectAddress ?? <Token>job_display.project_current_address</Token>}
            </Text>
          </div>
          <div className="drawer-actions">
            {/* Opens the one AI surface, scoped — "opening from a job is itself the
                question". The dock says coming soon; the entry point is real. */}
            {/* G25 — the entry point ships; the flow rides the variations model
                (Amber's Q8: waiting-on is part of the variation request). */}
            <Button
              kind="tertiary"
              size="small"
              onClick={() => toast("Request changes comes with variations — it will raise one on this job and flag what it's waiting on.", "normal")}
            >
              Request changes
            </Button>
            <Button kind="secondary" size="small" onClick={() => openAsk(`job ${job.jobNumber}`)}>
              Ask about this job
            </Button>
            {/* Clone (0057). On every job, not only cancelled ones: a second dwelling
                on the same plan is the other reason to reach for it. Manager+, the same
                rung that may create a job at all — the database decides, this only
                hides the button. */}
            {can("manager") && (
              <Button kind="tertiary" size="small" onClick={() => setCloning(true)}>
                Clone…
              </Button>
            )}
            {canExpand && <ExpandButton expanded={expanded} onToggle={toggle} />}
            <Button kind="tertiary" size="small" onClick={onClose} aria-label="Close">
              ×
            </Button>
          </div>
        </header>

        {/* Fullscreen gets the prototype's tab bar; docked stays one scrolled column —
            in a 460px panel four hidden columns read worse than one scroll. The same
            sections render either way; the tabs only choose which show. */}
        {expanded && (
          <div className="drawer-tabs">
            <TabList activeTabId={tab} onTabChange={setTab}>
              <Tab>Main info</Tab>
              <Tab>All properties</Tab>
              <Tab>Activity &amp; comments</Tab>
              <Tab>Departments</Tab>
            </TabList>
          </div>
        )}

        <div className="drawer-body stack">
          {onJump && siblings.length > 1 && (
            <div className="drawer-find">
              <input
                type="search"
                placeholder="Find another job…"
                aria-label="Find another job"
                value={find}
                onChange={e => setFind(e.target.value)}
              />
              {found.length > 0 && (
                <div className="drawer-find-results">
                  {found.map(s2 => (
                    <button type="button" key={s2.jobNumber} onClick={() => onJump(s2)}>
                      <strong>{s2.jobNumber}</strong> {s2.currentAddress ?? ""} · {s2.stage}
                    </button>
                  ))}
                </div>
              )}
              {q && found.length === 0 && (
                <Text type="text3" color="secondary">No other job matches “{find.trim()}”.</Text>
              )}
            </div>
          )}
          {(!expanded || tab === 0) && (<>
          {/* First, because it is how a job is looked up (Amber, 27 Aug): the old
              Lofty number is what SiteBook, Trello and the paperwork link by, and the
              addresses are what people say on the phone. */}
          <section className="panel">
            <div className="panel-head">
              <Text type="text2" weight="bold">Numbers &amp; addresses</Text>
              <Text type="text3" color="secondary">how this job is looked up</Text>
            </div>
            <div className="field-row">
              <div className="field-label"><Text type="text2">Job number</Text></div>
              <Text type="text2" weight="medium">{job.jobNumber}</Text>
            </div>
            <div className="field-row">
              <div className="field-label">
                <Text type="text2">Lofty number</Text>
                <div className="field-hint">the old number — SiteBook and Trello use it</div>
              </div>
              {can("user") ? (
                <div className="field-inline">
                  <TextField
                    inputAriaLabel="Old Lofty number"
                    placeholder="e.g. 12345"
                    size="small"
                    value={oldNoDraft}
                    onChange={setOldNoDraft}
                  />
                  {oldNoDirty && (
                    <Button size="small" disabled={oldNoBusy} onClick={() => void saveOldNo()}>
                      Save
                    </Button>
                  )}
                </div>
              ) : (
                <Text type="text2" weight="medium">{job.jobNumberOld ?? "—"}</Text>
              )}
            </div>
            {oldNoErr && <Problem>{oldNoErr}</Problem>}
            {/* Community or Torrens (0054, Amber 28 Aug: "the job will need to carry
                this information through to the job"). Set at the split from the
                project's mix and corrected here, because which lots take which title is
                a decision and the seeding is only a guess at it. Clearable: "nobody has
                said" is the honest state for every job created before today, and a job
                labelled with the wrong title type is worse than one labelled with
                none. */}
            <div className="field-row">
              <div className="field-label">
                <Text type="text2">Title type</Text>
                <div className="field-hint">community or Torrens — the product this lot is</div>
              </div>
              {can("user") ? (
                <Select
                  aria-label="Title type"
                  options={TITLE_TYPES.map(t => ({ value: t, label: TITLE_TYPE_LABELS[t] }))}
                  value={job.titleType}
                  clearable
                  placeholder="—"
                  onChange={v => {
                    const next = (v as TitleType | null) ?? null;
                    if (next !== job.titleType) saveWho({ titleType: next });
                  }}
                />
              ) : (
                <Text type="text2" weight="medium">
                  {job.titleType ? TITLE_TYPE_LABELS[job.titleType] : "—"}
                </Text>
              )}
            </div>
            <div className="field-row">
              <div className="field-label"><Text type="text2">Current address</Text></div>
              <Text type="text2" weight="medium">
                {job.currentAddress ?? <Token>job_display.job_current_address</Token>}
              </Text>
            </div>
            <div className="field-row">
              <div className="field-label">
                <Text type="text2">Previous address</Text>
              </div>
              {job.originalAddress ? (
                <Text type="text2" weight="medium">{job.originalAddress}</Text>
              ) : (
                <Text type="text3" color="secondary">never renamed — always this address</Text>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <Text type="text2" weight="bold">Who it’s with</Text>
              <StatusPill status={job.status} />
            </div>
            {/* Same facts as the card, editable from `user` up — the rung the database
                already enforces on this write. Below that, read-only, and an em dash
                stays the honest answer when nobody is assigned. */}
            {can("user") ? (
              <>
                <div className="field-row">
                  <div className="field-label">
                    <Text type="text2">Team</Text>
                  </div>
                  <Select
                    aria-label="Owning team"
                    options={teams.filter(t => t.isActive).map(t => ({ value: t.id, label: t.name }))}
                    value={job.teamId}
                    onChange={v => { if (v !== job.teamId) saveWho({ owningTeam: v as TeamId }); }}
                  />
                </div>
                <div className="field-row">
                  <div className="field-label">
                    <Text type="text2">Assigned to</Text>
                  </div>
                  <Select
                    aria-label="Assignee"
                    placeholder="— nobody —"
                    clearable
                    options={profiles.map(p => ({ value: p.id, label: p.fullName }))}
                    value={job.assigneeId}
                    onChange={v => { if (v !== job.assigneeId) saveWho({ assigneeId: v }); }}
                  />
                </div>
                {whoBusy && <Text type="text3" color="secondary">Saving…</Text>}
                {whoErr && <Problem>{whoErr}</Problem>}
              </>
            ) : (
              <div className="card-who">
                <div>
                  <Text type="text3" weight="medium">{job.team}</Text>
                  <Text type="text3" color="secondary">{job.assigneeName ?? "—"}</Text>
                </div>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-head">
              <Text type="text2" weight="bold">Folders</Text>
              <Text type="text3" color="secondary">the job&apos;s subfolder, inside its project&apos;s</Text>
            </div>
            {/* Both links, per Lofty's rule — a job's page shows its own folder and its
                project's, never its siblings'. An unlinked folder is a real state and
                says so rather than hiding the row. */}
            <div className="field-row">
              <div className="field-label"><Text type="text2">Job folder</Text></div>
              {job.sharepointUrl ? (
                <a href={job.sharepointUrl} target="_blank" rel="noreferrer" className="link-button">
                  Open job folder
                </a>
              ) : (
                <Text type="text3" color="secondary">no folder linked yet</Text>
              )}
            </div>
            <div className="field-row">
              <div className="field-label"><Text type="text2">Project folder</Text></div>
              {job.projectSharepointUrl ? (
                <a href={job.projectSharepointUrl} target="_blank" rel="noreferrer" className="link-button">
                  Open project folder
                </a>
              ) : (
                <Text type="text3" color="secondary">no folder linked yet — set it on the project</Text>
              )}
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

          {/* The processes of every stage, this one open — with their properties to
              record and their checklists to create. Milestones are the processes flagged
              as such; the stage header counts them. This replaced a Milestones panel of
              disabled checkboxes that had nothing behind it. */}
          <ProcessesPanel target={{ jobId: job.jobNumber }} scope="job" currentStage={job.stage} />
          </>)}

          {(!expanded || tab === 1) && (<>
          {/* The site's own facts, above the job's — fencing, pegging, the developer, the
              council. One answer for the whole project, shown here rather than copied,
              so twenty jobs on one site cannot quietly disagree about it.

              Read-only on purpose: `property_def_scope` is exclusive, and a project
              property cannot be overridden per job. Editing one happens on the project. */}
          <PropertySlots
            scope="project"
            target={{ jobId: job.jobNumber }}
            title="Project properties"
            note="True of the whole site — read through from the project, or pushed onto this job as its own copy. Change them on the project, or push them from there."
          />

          {/* Then the job's own — twenty jobs, twenty answers. */}
          <PropertySlots scope="job" target={{ jobId: job.jobNumber }} title="Job properties" showHistory={expanded} />

          </>)}

          {(!expanded || tab === 2) && (<>
          {/* Real since 0058. This said "coming soon" for as long as `activity_audit`
              was admin-only — the events were being recorded the whole time, and nobody
              below admin could read one. Two panels rather than one merged stream:
              comments are user-authored and editable, activity is append-only, and
              interleaving them makes a feed where half the entries can be rewritten
              after the fact. */}
          {/* What has to be done on this job. Above the timeline because a checklist is
              worked from, and a history is read — the thing you act on goes first. */}
          <TasksPanel jobId={job.jobNumber} />

          {/* Who from outside Lofty is on this job — the purchaser, the trades on its runs
              (0082). Sits with the work because "ring the plumber" is a task. */}
          <div className="field-inline" style={{ justifyContent: "flex-end" }}><WatchButton jobId={job.jobNumber} /></div>
          <PartiesPanel target={{ jobId: job.jobNumber }} />

          {/* After handover the job keeps living here: its warranty and what the homeowner
              has reported (0084). Each line opens the Maintenance tab. */}
          <JobMaintenancePanel jobId={job.jobNumber} />

          {/* The job as a gantt, a calendar or a list (Amber, 28 August). It sits with
              the activity because it is the same history read a different way — every
              bar on it is a stage change this feed also carries as a line. */}
          {expanded && <JobTimeline jobId={job.jobNumber} />}
          {expanded && <ActivityFeed jobId={job.jobNumber} title="Activity" />}
          {/* The job's own thread — the same shape the project has, because Amber's
              "latest update" is one rule for both kinds of record. */}
          <CommentsPanel jobId={job.jobNumber} title="Updates & comments" />
          </>)}

          {expanded && tab === 3 && (
            <section className="panel">
              <div className="panel-head">
                <Text type="text2" weight="bold">Departments</Text>
                <Text type="text3" color="secondary">handoff view — coming soon</Text>
              </div>
              <Text type="text2" color="secondary" ellipsis={false}>
                Where every team stands on this job, in the order it passes through them —
                who had it, who has it, who is next, with the fields each team works with.
                It builds from real handoff history once team changes write the activity
                feed; the states below are the shape, not the facts.
              </Text>
              <div className="dept-placeholder" aria-hidden>
                <div className="dept-block is-done">Handed on — team a</div>
                <div className="dept-block is-current">Current owner — team b</div>
                <div className="dept-block">Not started — team c</div>
              </div>
            </section>
          )}
        </div>
      </aside>

      {/* Outside the drawer's <aside>, so the clone panel is a sibling of it rather
          than a panel inside a panel — two nested dialogs fight over Escape, and the
          inner one loses. */}
      <CloneJobDialog
        show={cloning}
        jobNumber={cloning ? job.jobNumber : null}
        onClose={() => setCloning(false)}
        onCloned={onMoved}
      />
    </>
  );
}
