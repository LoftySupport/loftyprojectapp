import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Text, TextField } from "@vibe/core";
import { useTemplatePhases, useTeams } from "../data/useLookups";
import type { BoardJob } from "../data/boardModel";
import { TITLE_TYPE_LABELS, TITLE_TYPES, type JobPatch, type NewAddress, type TeamId, type TitleType } from "../data/types";
import { StatusPill } from "./RecordCards";
import { PropertySlots } from "./PropertySlots";
import { ProcessesPanel } from "./ProcessesPanel";
import { RecordDocuments } from "./RecordDocuments";
import { ExpandButton, usePanelExpand } from "./PanelExpand";
import { JobRecord } from "./JobRecord";
import { RecordBreadcrumb } from "./record/RecordBreadcrumb";
import { RecordTabs } from "./record/RecordTabs";
import { useResizablePanel } from "./useResizablePanel";
import { JOB_MOVE_NOTE, MoveStageControl } from "./MoveStageDialog";
import { ActivityFeed } from "./ActivityFeed";
import { PartiesPanel } from "./PartiesPanel";
import { WatchButton } from "./WatchButton";
import { JobMaintenancePanel } from "./JobMaintenancePanel";
import { JobTimeline } from "./JobTimeline";
import { TasksPanel } from "./TasksPanel";
import { AddressFields } from "./CreateDialogs";
import { CommentsPanel } from "./CommentsPanel";
import { useRepository } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import { Select } from "./Select";
import { PersonSelect } from "./PersonSelect";
import { Problem } from "./Form";
import { useAskDock } from "./AskDock";
import { useToasts } from "./Toasts";
import { Token } from "./Token";
import "./ui.css";
import { CollapsiblePanel, PanelGroup } from "./CollapsiblePanel";

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

  /** Which of the three docked panels is showing. Its own state, not the fullscreen tab:
   *  one is "which part of the record", the other is "which part of the conversation". */
  const [foot, setFoot] = useState("comments");

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
  const [whoBusy, setWhoBusy] = useState(false);
  const [whoErr, setWhoErr] = useState<string | null>(null);
  // `JobPatch` rather than a hand-written subset of it. The subset was a second list of
  // what a job can have edited, and it went stale the moment 0113 added the completion
  // dates — this now cannot.
  const saveWho = async (patch: JobPatch) => {
    if (whoBusy) return;
    setWhoBusy(true);
    setWhoErr(null);
    try {
      // Undoable from the header — the repository records the step (undoableRepository).
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
  /**
   * Changing the job's address (0105) — Amber, 10 September: *"A project address needs
   * to be updatable. A Job address needs to be updatable."* The project half has
   * existed for weeks; this is the half that did not, and it is the one that matters
   * more, because a job's address is the one that moves: "Lot 3" becomes "13 Tester
   * Street" when titles issue, and the res number arrives months into a build.
   *
   * Same shape and the same words as the project's panel, deliberately — it is the
   * same act on a different record, and two dialects of it would be two things to
   * learn.
   */
  const [newAddress, setNewAddress] = useState<NewAddress | null>(null);
  const [addressBusy, setAddressBusy] = useState(false);
  const [addressErr, setAddressErr] = useState<string | null>(null);
  useEffect(() => { setNewAddress(null); setAddressErr(null); }, [job.jobNumber]);
  const saveAddress = async () => {
    if (!newAddress || addressBusy) return;
    setAddressBusy(true);
    setAddressErr(null);
    try {
      await repo.setJobCurrentAddress(job.jobNumber, newAddress);
      setNewAddress(null);
      onMoved();
    } catch (err) {
      setAddressErr(err instanceof Error ? err.message : String(err));
    } finally {
      setAddressBusy(false);
    }
  };

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
        {/* 48px: breadcrumb left, expand and close right. The TITLE moved into the body
            (see JobRecord) — the handoff puts it on the first line of the record with the
            health pill beside it, and a title in the header as well would be the same
            sentence twice in 80 pixels. */}
        <header className="record-head">
          {/* Jobs › 1209 › 1209-002. Three levels, no more.
              `onClick` rather than an anchor: Vibe's BreadcrumbItem rendered a real one,
              which in this app is a full page reload of a 1 MB bundle and a fresh auth
              round trip. The project also appears in the title below as a router link, so
              copy-link-address and middle-click are not lost. */}
          <RecordBreadcrumb
            items={[
              { label: "Jobs", render: l => (
                <button type="button" className="record-crumb-link"
                  onClick={() => { onClose(); navigate("/jobs"); }}>{l}</button>
              ) },
              { label: job.projectNumber, render: l => (
                <button type="button" className="record-crumb-link"
                  onClick={() => { onClose(); navigate(`/projects/${job.projectNumber}`); }}>{l}</button>
              ) },
              { label: job.jobNumber }
            ]}
          />
          <div className="drawer-actions">
            {/* Only expand and close, which is what the handoff's 48px header holds.
                "Request changes" and "Ask about this job" moved into the body under the
                title: they are acts on the record, and two 32px buttons beside a
                breadcrumb wrapped it onto two lines and doubled the header. */}
            {/* NO CLONE HERE. Amber, 7 September: "remove clone off the job sidepanel..
                cloning jobs can only be done on projects". CloneDialog.tsx and
                repository.cloneJob() are deliberately KEPT and referenced by no screen:
                the capability is unchanged, only its entry point moved. Do not delete
                them as dead code — see docs/open-questions.md. */}
            {canExpand && <ExpandButton expanded={expanded} onToggle={toggle} />}
            <Button kind="tertiary" size="small" onClick={onClose} aria-label="Close">
              ×
            </Button>
          </div>
        </header>

        {/* Fullscreen gets the prototype's tab bar; docked stays one scrolled column —
            in a 460px panel four hidden columns read worse than one scroll. The same
            sections render either way; the tabs only choose which show. */}
        {/* THE FULLSCREEN TAB STRIP IS GONE, and this is the one thing the 11 September
            rebuild takes away rather than moves.

            It was Main info / All properties / Departments, and 6b has no such strip: the
            full page is *"the same record at two widths, not two designs"* — the same
            properties in the same order, with room to show the tail expanded and the
            conversation docked beside it rather than under it. Three hidden columns was
            the drawer's answer to not having room; the page has room.

            Nothing is lost. Every section the tabs hid now renders in the one scroll,
            which is what the docked footer freed the height for. `Tab`/`TabList` stay
            imported for the Departments placeholder below. */}

        <PanelGroup>{bulk => (
        <div className="drawer-body stack">
          {/* Amber, 7 September: "you can't find anything on it". Shut everything and the
              drawer becomes a contents page you can read in one look — which is what the
              reference designs do. Two buttons rather than one toggle: after a "collapse
              all" a single toggle reads "expand all", and with nine sections in mixed
              states there is no honest label for what one button would do next. */}
          {(<>
          {/* The record, in the shape the 11 September handoff specifies: title and
              health, the blocked-by banner, Job Stage, Key properties and Process. The
              panels below it are the tail — Documents, Maintenance, Parties, the full
              property list — which the handoff draws as "collapsed rows with counts" and
              which stay because they are real working screens nobody asked to lose. */}
          <JobRecord
            job={job}
            variant={expanded ? "page" : "drawer"}
            onChangeAddress={() => setNewAddress({ suburb: "", postcode: "" })}
            onSetCompletion={iso => void saveWho({ targetCompletion: iso })}
            currentlyWithControl={
              /* The job's team first, everybody else under "Other teams", each name with
                 their team beside it (Amber, 7 Sep). The same control the "Who it's with"
                 panel below uses, and the same write — one picker, not two. */
              <PersonSelect
                aria-label="Currently with"
                teamId={job.teamId}
                value={job.assigneeId}
                onChange={v => { if (v !== job.assigneeId) saveWho({ assigneeId: v }); }}
              />
            }
          />

          {/* The two acts on this record. Below it rather than in the header, for the
              reason above. G25 — the Request changes entry point ships; the flow rides
              the variations model (Amber's Q8: waiting-on is part of the request). */}
          <div className="record-acts">
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
          </div>

          {/* The drawer's own controls, BELOW the record rather than above it. They were
              the first two things on the panel, which put a "Collapse all" and a search
              box between somebody and the job number they opened it for. */}
          <div className="drawer-bulk">
            <button type="button" className="drawer-bulk-btn" onClick={bulk.collapseAll}>Collapse all</button>
            <span aria-hidden>·</span>
            <button type="button" className="drawer-bulk-btn" onClick={bulk.expandAll}>Expand all</button>
          </div>
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

          {/* First, because it is how a job is looked up (Amber, 27 Aug): the old
              Lofty number is what SiteBook, Trello and the paperwork link by, and the
              addresses are what people say on the phone. */}
          <CollapsiblePanel id="job-numbers" title={<>Numbers &amp; addresses</>} summary="how this job is looked up">
            <div className="field-row">
              <div className="field-label"><Text type="text2">Job number</Text></div>
              <Text type="text2" weight="medium">{job.jobNumber}</Text>
            </div>
            <div className="field-row">
              <div className="field-label">
                <Text type="text2">Old job number</Text>
                <div className="field-hint">the old Lofty number — SiteBook and Trello reference it</div>
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
              <div className="field-inline">
                <Text type="text2" weight="medium">
                  {job.currentAddress ?? <Token>job_display.job_current_address</Token>}
                </Text>
                {can("user") && newAddress === null && (
                  <Button size="small" kind="tertiary" onClick={() => setNewAddress({ suburb: "", postcode: "" })}>
                    Change
                  </Button>
                )}
              </div>
            </div>

            {newAddress !== null && (
              <div className="new-address-block">
                <div className="panel-head">
                  <Text type="text2" weight="bold">New address</Text>
                </div>
                {/* The same sentence the project's panel uses, because it is the same
                    rule: the original is what the job was created as and never moves,
                    and every address it has had stays searchable. */}
                <Text type="text3" color="secondary" element="p" ellipsis={false}>
                  The original address never changes — it is what the job was created as,
                  and what old paperwork says. Saving this makes it the current one; every
                  previous address stays on the record and stays searchable.
                </Text>
                <div className="create-form">
                  {/* `needs="street"` because a job may not sit at a locality. The res
                      number is on every address form now, a project's included — see
                      `AddressFields`. */}
                  <AddressFields value={newAddress} onChange={setNewAddress} needs="street" />
                </div>
                <div className="field-inline" style={{ marginTop: "var(--space-8)" }}>
                  <Button
                    size="small"
                    onClick={() => void saveAddress()}
                    disabled={addressBusy || !newAddress.suburb.trim() || !newAddress.postcode.trim()}
                  >
                    {addressBusy ? "Saving…" : "Make this the current address"}
                  </Button>
                  <Button size="small" kind="tertiary" onClick={() => setNewAddress(null)}>
                    Cancel
                  </Button>
                </div>
                {addressErr && <Problem>{addressErr}</Problem>}
              </div>
            )}
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
            {/* Beside the address, never inside it. Amber, 10 September: *"the council
                area still needs to be recorded, but just not in the full address line.
                it stays as a property field."* `build_consolidated_address()` has never
                composed it in; what was missing was anywhere to READ it back on a job —
                the change-address form above carries the picker, and until 0108
                `job_display` did not select the column, so a council set here vanished.

                The job's own, not the project's: a job moved off its project's site can
                sit in a different LGA. An em dash rather than a token when it is null,
                because optional-since-0073 is a real answer — four SA suburbs span two
                councils and the form refuses to guess for them. */}
            <div className="field-row">
              <div className="field-label">
                <Text type="text2">Council region</Text>
              </div>
              {job.council ? (
                <Text type="text2" weight="medium">{job.council}</Text>
              ) : (
                <Text type="text3" color="secondary">—</Text>
              )}
            </div>
          </CollapsiblePanel>

          {/* The status pill is the summary, so it stays readable with the section shut —
              "who it's with" closed but "On hold" visible is the useful half. Guarded:
              StatusPill renders an empty pill for an absent status, and an empty pill in a
              heading reads as a rendering fault rather than as missing data. */}
          <CollapsiblePanel
            id="job-who"
            title={<>Who it’s with</>}
            defaultOpen={false}
            summary={job.status ? <StatusPill status={job.status} /> : undefined}
          >
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
                  {/* The job's team first, everybody else under "Other teams", each
                      name with their team beside it (Amber, 7 Sep). */}
                  <PersonSelect
                    aria-label="Assignee"
                    teamId={job.teamId}
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
          </CollapsiblePanel>

          <CollapsiblePanel id="job-folders" title="Folders" defaultOpen={false} summary={<>the job&apos;s subfolder, inside its project&apos;s</>}>
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
          </CollapsiblePanel>

          <CollapsiblePanel id="job-phase" title={<>Phase &amp; stage</>} defaultOpen={false} summary={job.stage}>
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
          </CollapsiblePanel>

          {/* The processes of every stage, this one open — with their properties to
              record and their checklists to create. Milestones are the processes flagged
              as such; the stage header counts them. This replaced a Milestones panel of
              disabled checkboxes that had nothing behind it. */}
          <ProcessesPanel target={{ jobId: job.jobNumber }} scope="job" currentStage={job.stage} />

          {/* What has been written ABOUT this job — the progress reports, client letters
              and maintenance reports made in the Document Builder. Amber, 4 September:
              *"all documents need to be associated to a job or project and they are
              listed on that project"*. This is where they are listed. */}
          {/* The job's own folder is where a document published from here should go by
              default (Amber, 10 Sep: "should default to job file"). Its project's folder
              is deliberately not the fallback: a document about one lot filed at the
              project would be findable by nobody looking for it. */}
          <RecordDocuments jobId={job.jobNumber} folderUrl={job.sharepointUrl} />
          </>)}

          {(<>
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

          {(<>
          {/* Tasks, comments and the activity log are DOCKED IN THE FOOTER now — see the
              record-foot below. They were here, in the body, which meant the conversation
              was nine sections of scrolling away from the record it is about. */}

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
          </>)}

          {(
            <CollapsiblePanel id="job-departments" title="Departments" summary="handoff view — coming soon">
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
            </CollapsiblePanel>
          )}

          {/* LAST, AND NOT IN A TAB. Amber, 7 September: "activity logging and comments
              need to be at the bottom as not as important in tabs". A tab implies you
              might come to the drawer FOR the history; you come for the job and read the
              history if something looks wrong. Untabbed also means it is in the same place
              docked and fullscreen, so "scroll to the bottom" is one instruction.

              Two panels rather than one merged stream: comments are user-authored and
              editable, activity is append-only (0058), and interleaving them makes a feed
              where half the entries can be rewritten after the fact. */}
        </div>
        )}</PanelGroup>

        {/* DOCKED, never inside the scroll region — the RecordDrawer contract's own
            warning, and the part of the design no earlier option had: *"a drawer is
            header / scrolling body / docked footer, three flex siblings, or the tabs
            scroll away and the pattern is pointless."*

            Amber, 7 September, said comments and activity belong "at the bottom as not
            as important in tabs", and this is not a reversal of that: they are still at
            the bottom and still not a tab you might come to the drawer FOR. What changed
            is that the bottom no longer means "after nine sections of scrolling" — the
            conversation is in reach the whole way down, which is what a record you read
            while talking to somebody needs. */}
        <div className="record-foot">
          <RecordTabs
            tabs={[
              { id: "tasks", label: "Tasks" },
              { id: "comments", label: "Comments" },
              { id: "activity", label: "Activity Log" }
            ]}
            value={foot}
            onChange={setFoot}
          />
          <div
            className="record-foot-panel"
            role="tabpanel"
            id={`record-panel-${foot}`}
            aria-labelledby={`record-tab-${foot}`}
          >
            {foot === "tasks" && <TasksPanel jobId={job.jobNumber} bare />}
            {foot === "comments" && <CommentsPanel jobId={job.jobNumber} bare />}
            {foot === "activity" && <ActivityFeed jobId={job.jobNumber} bare />}
          </div>
        </div>
      </aside>

    </>
  );
}
