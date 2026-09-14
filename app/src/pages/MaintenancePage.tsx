import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, Heading, Text, TextField } from "@vibe/core";
import { useQuery, useRepository } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import { useAuth } from "../data/AuthProvider";
import { supabaseUrl } from "../data/supabaseEnv";
import { SidePanel } from "../components/SidePanel";
import { useOneLine } from "../components/Toolbar";
import { Field, Problem } from "../components/Form";
import { PersonSelect } from "../components/PersonSelect";
import { Select } from "../components/Select";
import { splitBrainDump } from "../data/brainDump";
import { DateField } from "../components/DateField";
import { TypeaheadSelect } from "../components/TypeaheadSelect";
import { LoadProblem } from "../components/SearchNotices";
import {
  MAINTENANCE_ASSIGNEE_KINDS, MAINTENANCE_ASSIGNEE_KIND_LABELS,
  MAINTENANCE_ASSIGNMENT_STATUS_LABELS, MAINTENANCE_HEALTH_LABELS,
  MAINTENANCE_IDENTIFIED_AT, MAINTENANCE_IDENTIFIED_AT_LABELS,
  MAINTENANCE_ITEM_STATUS_LABELS, MAINTENANCE_PRIORITIES, MAINTENANCE_PRIORITY_LABELS,
  MAINTENANCE_SOURCE_LABELS, MAINTENANCE_STATUSES, MAINTENANCE_STATUS_LABELS,
  type MaintenanceAssigneeKind, type MaintenanceIdentifiedAt, type MaintenanceItem, type MaintenanceMessage,
  type MaintenancePriority, type MaintenanceRequest, type MaintenanceStatus
} from "../data/types";
import "../components/ui.css";
import "../components/processes.css";

/**
 * Maintenance (0084) — the separate tab Amber asked for: "this will have a lot of
 * automation and needs a quick access".
 *
 * THE QUEUE
 *
 *   Every open request on one screen, worst first: over SLA, then at risk, then the rest by
 *   report date. Health is the view's word (`maintenance_request_health`), never computed
 *   here, so the tab and the 15-minute scan that sends the notifications agree.
 *
 * THE REQUEST
 *
 *   One ticket, however it arrived; its items, each a trade; an offer per item to a
 *   contractor — the database queues the email and hands back the accept-link token ONCE,
 *   which this page shows once and then forgets; the thread of what came in, went out and
 *   was said on the phone; and Close, which the database refuses while an item is open,
 *   in its own words.
 *
 * Nothing is invented. A job with no handover run has no warranty end date and says so; a
 * request in a category with no SLA reads "No SLA", not "on track".
 */
export function MaintenancePage() {
  const [params, setParams] = useSearchParams();
  const { can } = usePermission();
  /** Below 720px the create button moves onto the heading's line — see `useOneLine`. */
  const oneLine = useOneLine();
  const { profile } = useAuth();
  const selected = params.get("request");
  const jobFilter = params.get("job");
  const creating = params.get("new") === "1";
  const queue = (params.get("queue") ?? "open") as "open" | "mine" | "attention" | "closed" | "all";
  const [search, setSearch] = useState("");
  const [reload, setReload] = useState(0);
  const bump = () => setReload(n => n + 1);

  const dbQueue = queue === "closed" ? "closed" : queue === "all" ? "all" : "open";
  const { data: requests, loading, error } = useQuery<MaintenanceRequest[]>(
    r => r.listMaintenanceRequests({ queue: dbQueue, search, jobId: jobFilter ?? undefined }), [], [dbQueue, search, jobFilter, reload]
  );

  const RANK: Record<MaintenanceRequest["health"], number> = { overdue: 0, at_risk: 1, on_track: 2, no_sla: 3, complete: 4, closed: 5 };
  const rows = useMemo(() => {
    let list = requests;
    if (queue === "mine") list = list.filter(r => r.ownerProfileId === profile?.id);
    if (queue === "attention") list = list.filter(r => r.health === "overdue" || r.health === "at_risk" || r.offersOpen > 0 || r.status === "new");
    return [...list].sort((a, b) => RANK[a.health] - RANK[b.health] || b.reportedAt.localeCompare(a.reportedAt));
  }, [requests, queue, profile?.id]);

  const counts = useMemo(() => ({
    open: requests.filter(r => r.status !== "closed" && r.status !== "rejected").length,
    overdue: requests.filter(r => r.health === "overdue").length,
    atRisk: requests.filter(r => r.health === "at_risk").length,
    waiting: requests.filter(r => r.offersOpen > 0).length
  }), [requests]);

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (v == null) next.delete(k); else next.set(k, v); }
    setParams(next, { replace: true });
  };


  return (
    <>
      <div className="page-head page-head-row">
        {/* No line under the heading (12 September). The counts beside it stay — they
            are a readout, on the heading's own line. */}
        <div>
          <Heading type="h2" weight="bold">Maintenance</Heading>
        </div>
        {!loading && dbQueue === "open" && (
          <Text type="text3" color="secondary" className="page-head-count">
            {counts.open} open · {counts.overdue} over SLA · {counts.atRisk} at risk · {counts.waiting} awaiting a contractor
          </Text>
        )}
        {/* The create button rides the heading's line on a phone and stays in the
            toolbar at a desk — Amber, 12 September. One or the other, never both. */}
        {oneLine && can("user") && (
          <Button size="small" className="page-head-action" onClick={() => setParam({ new: "1", request: null })}>+ New request</Button>
        )}
      </div>

      <div className="toolbar">
        <Select aria-label="Which requests" value={queue} onChange={v => setParam({ queue: v })}
          options={[
            { value: "open", label: "All open" }, { value: "attention", label: "Needs attention" }, { value: "mine", label: "Mine" },
            { value: "closed", label: "Closed" }, { value: "all", label: "Everything" }
          ]} />
        <TextField size="small" id="maintenance-search" inputAriaLabel="Search requests" placeholder="Search number, address, summary, reporter…" value={search} onChange={setSearch} />
        {jobFilter && (
          <Button size="small" kind="tertiary" onClick={() => setParam({ job: null })}>Job {jobFilter} only — show all</Button>
        )}
        {!oneLine && can("user") && <Button size="small" onClick={() => setParam({ new: "1", request: null })}>+ New request</Button>}
      </div>

      {error && <LoadProblem error={error} />}

      {/* Full width, with the request opening over it in the shared slideout — the same
          change, for the same reason, as Contacts and Setup → Properties (Amber, 3 Sep:
          "ensure all pages open items in the slideout side bar (can expand to full
          width) and is width adjustable"). A detail column has none of those three. */}
      <section className="panel">
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                {/* Booked and Completed sit beside the identification date, so the three
                    dates of an issue read left to right: found, booked, done. Amber,
                    14 September: "add in the date booked, date completed into UI". */}
                <tr><th>Request</th><th>Address</th><th>What</th><th>Identified</th><th>Booked</th><th>Completed</th><th>Assigned to</th><th className="num">Items</th><th>Health</th><th>Next visit</th></tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className={`contact-row${selected === r.id ? " is-selected" : ""}`} onClick={() => setParam({ request: r.id, new: null })}>
                    <td className="nowrap">
                      <button type="button" className="link-button tap-link" onClick={e => { e.stopPropagation(); setParam({ request: r.id, new: null }); }}>
                        <strong>{r.number}</strong>
                      </button>
                      {r.priority !== "normal" && <span className={`health is-${r.priority === "low" ? "no_due_date" : "overdue"}`} style={{ marginLeft: 6 }}>{MAINTENANCE_PRIORITY_LABELS[r.priority]}</span>}
                    </td>
                    <td>{r.jobAddress}</td>
                    <td>{r.summary}{r.isWarranty && <span className="slot-chip" style={{ marginLeft: 6 }}>warranty</span>}</td>
                    {/* The identified date and place when somebody recorded them, and the
                        logged date and channel when nobody did. Showing "Logged by staff"
                        beside a request that says PCI would hide the fact that was typed. */}
                    <td className="muted nowrap">
                      {new Date(r.identifiedOn ?? r.reportedAt).toLocaleDateString()}
                      {" · "}
                      {r.identifiedAt ? MAINTENANCE_IDENTIFIED_AT_LABELS[r.identifiedAt] : MAINTENANCE_SOURCE_LABELS[r.source]}
                    </td>
                    <td className="muted nowrap">{r.bookedOn ? new Date(r.bookedOn).toLocaleDateString() : "—"}</td>
                    <td className="muted nowrap">{r.completedOn ? new Date(r.completedOn).toLocaleDateString() : "—"}</td>
                    {/* Who is fixing it, whichever side of the radio it came from. Replaces
                        Trade and Owner, which the new drawer stops asking for and which read
                        as an em dash on every issue logged since. */}
                    <td className="muted">{(r.assigneeKind === "external" ? r.assignedCompanyName : r.assigneeName) ?? "—"}</td>
                    <td className="num">{r.itemsTotal ? `${r.itemsDone} / ${r.itemsTotal}` : <span className="muted">—</span>}</td>
                    <td><span className={`health is-${r.health}`}>{MAINTENANCE_HEALTH_LABELS[r.health]}</span>{r.offersOpen > 0 && <div className="slot-sub">{r.offersOpen} offer{r.offersOpen === 1 ? "" : "s"} unanswered</div>}</td>
                    <td className="muted nowrap">{r.nextVisit ? new Date(r.nextVisit).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && rows.length === 0 && (
              <Text type="text2" color="secondary" element="p" ellipsis={false}>
                {queue === "closed" ? "Nothing has been closed yet." : queue === "mine" ? "Nothing is owned by you." : "No open maintenance requests. When a homeowner emails the intake mailbox, rings, or a form comes in, it appears here."}
              </Text>
            )}
          </div>
      </section>

      {creating && (
        <SidePanel open title="New maintenance request" onClose={() => setParam({ new: null })}>
          {/* One issue opens on save; several do not, because opening the first of five is
              a choice nobody made — the queue behind the drawer is already showing them. */}
          <NewRequests jobId={jobFilter} onDone={ids => { bump(); setParam({ new: null, request: ids.length === 1 ? ids[0] : null }); }} />
        </SidePanel>
      )}
      {/* The number and the summary come from the row that was clicked, so the head says
          which request is opening before the detail's own fetch lands. */}
      {selected && !creating && (
        <SidePanel open onClose={() => setParam({ request: null })}
          title={(() => { const r = rows.find(x => x.id === selected); return r ? `${r.number} · ${r.summary}` : "Request"; })()}>
          <RequestDetail id={selected} onChanged={bump} />
        </SidePanel>
      )}
    </>
  );
}

// -----------------------------------------------------------------------------------------
/**
 * One drawer, one header, as many issues as the walk turned up.
 *
 * Amber, 14 September: *"each one of these issues have its own record id but you only
 * enter the job number, reported by, identifies at, date once so you can then have a
 * status, date booked, and followup for each"* — and, asked which shape that should take,
 * she chose **a request per issue**. So this form types the header once and posts N
 * requests, all carrying the same `batchId`, all numbered by the database.
 *
 * WHAT CAME OFF THE FORM, AND WHAT THAT COSTS
 *
 *   How it arrived, the trade, the priority and the owner are gone (Amber, item 2). The
 *   columns are still there and email, form and portal intake still set them. The visible
 *   consequence: no trade means no SLA, so the queue reads **No SLA** for everything logged
 *   here. That is the readout the health derivation has always given a request with no
 *   category, and it is better than a priority nobody chose being quoted back as agreed.
 *
 * THE POST IS SEQUENTIAL, NOT PARALLEL
 *
 *   `assign_maintenance_request_number()` takes the next number by bumping
 *   `jobs.job_maintenance_seq_high_water`. Five inserts on one job at once are five
 *   updates contending for one row; one at a time is both correct and, on five rows, not
 *   slower in any way a person can see. A failure part-way through is reported as what it
 *   is — the ones that landed stay landed, and only the rest are left in the form.
 */
interface IssueDraft {
  /** React's key. The record id is the database's, and it does not exist until save. */
  key: string;
  summary: string;
  description: string;
  assigneeKind: MaintenanceAssigneeKind;
  assigneeProfileId: string | null;
  assignedCompanyId: string | null;
  /** Chosen, not uploaded. The request has no id to attach them to until it is saved. */
  files: File[];
}

let issueSeed = 0;
const blankIssue = (): IssueDraft => ({
  key: `issue-${++issueSeed}`, summary: "", description: "",
  assigneeKind: "internal", assigneeProfileId: null, assignedCompanyId: null, files: []
});

/** `yyyy-mm-dd` for the browser's own day, which at Lofty is the Adelaide day. */
function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The two teams Amber named for an internal repairer. Anyone already chosen stays offered. */
const REPAIR_TEAMS = ["maintenance", "construction"] as const;

function NewRequests({ jobId, onDone }: { jobId: string | null; onDone: (ids: string[]) => void }) {
  const repo = useRepository();
  const { data: jobs } = useQuery(r => r.listJobs(), []);
  const [companyReload, setCompanyReload] = useState(0);
  const { data: companies } = useQuery(r => r.listCompanies(), [], [companyReload]);

  const [job, setJob] = useState<string | null>(jobId);
  // Today, and clearable — both halves are Amber's: "default to today's date, but can be
  // cleared or edited". Which is why the column behind it is nullable.
  const [identifiedOn, setIdentifiedOn] = useState<string | null>(todayIso());
  const [identifiedAt, setIdentifiedAt] = useState<MaintenanceIdentifiedAt | null>(null);
  const [reportedBy, setReportedBy] = useState<string | null>(null);
  const [issues, setIssues] = useState<IssueDraft[]>(() => [blankIssue()]);
  const [dump, setDump] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The companies on this job come first in the external picker — Amber: "prioritising
  // those who are linked to the job". Only while a job is chosen; there is nothing to
  // prioritise by before that.
  const { data: parties } = useQuery(r => job ? r.listRecordParties({ jobId: job }) : Promise.resolve([]), [], [job]);
  const onThisJob = useMemo(() => {
    const m = new Map<string, string>();
    parties.forEach(p => { if (p.companyId && !p.endedOn) m.set(p.companyId, p.roleName); });
    return m;
  }, [parties]);

  /**
   * Trades and contractors, with the ones already on the job at the top.
   *
   * `contractor` is the only classification in the system that means "a trade" — there is
   * no separate Trade classification, and inventing one here would be a value nobody set.
   * A company on the job is offered whatever it is classified as, because being the
   * plumber on 1042-01 is the stronger evidence.
   */
  const companyOptions = useMemo(() => {
    const pool = companies.filter(c => c.isActive && (c.classificationIds.includes("contractor") || onThisJob.has(c.id)));
    const opt = (c: typeof pool[number]) => ({
      value: c.id,
      label: c.name,
      sub: onThisJob.get(c.id) ?? null,
      group: onThisJob.has(c.id) ? "On this job" : "Other contractors"
    });
    // Group order follows first appearance, so the job's companies are listed first here.
    return [...pool.filter(c => onThisJob.has(c.id)), ...pool.filter(c => !onThisJob.has(c.id))].map(opt);
  }, [companies, onThisJob]);

  const patch = (key: string, change: Partial<IssueDraft>) =>
    setIssues(list => list.map(i => i.key === key ? { ...i, ...change } : i));

  /**
   * A company typed into the picker that matches nothing. Amber: *"if it isn't there they
   * can type in and it can says 'Add new company' when no results and by pressing enter it
   * will add that company in as typed as contractor"*. It is a real `companies` row, with
   * the contractor classification and nothing else invented — a manager still approves it,
   * which is what `company_approved_at` has been for since 0082.
   */
  const addCompany = async (key: string, name: string) => {
    setProblem(null);
    try {
      const made = await repo.createCompany({ name, classificationIds: ["contractor"] });
      setCompanyReload(n => n + 1);
      patch(key, { assignedCompanyId: made.id });
    } catch (e) { setProblem(e instanceof Error ? e.message : String(e)); }
  };

  /** Recomputed as it is typed, so the button can say how many are coming. */
  const dumpLines = useMemo(() => splitBrainDump(dump), [dump]);

  const ready = issues.filter(i => i.summary.trim() !== "");
  const canSave = Boolean(job) && ready.length > 0 && !busy;

  const submit = async () => {
    if (!job || ready.length === 0) return;
    setBusy(true); setProblem(null);
    const batchId = crypto.randomUUID();
    const made: string[] = [];
    const landed = new Set<string>();
    const refusedFiles: string[] = [];
    try {
      for (const i of ready) {
        const r = await repo.createMaintenanceRequest({
          jobId: job,
          summary: i.summary.trim(),
          description: i.description.trim() || null,
          identifiedOn, identifiedAt,
          reportedByProfileId: reportedBy,
          batchId,
          assigneeKind: i.assigneeKind,
          assigneeProfileId: i.assigneeKind === "internal" ? i.assigneeProfileId : null,
          assignedCompanyId: i.assigneeKind === "external" ? i.assignedCompanyId : null
        });
        made.push(r.id);
        landed.add(i.key);
        // After the request, because the attachment needs its id. A file that will not
        // upload must not undo a request that saved: the issue is logged either way and
        // the failure is reported with the file named, rather than the whole batch
        // reading as refused because somebody picked a video.
        if (i.files.length) {
          try { await repo.attachMaintenanceFiles({ requestId: r.id, jobId: job, files: i.files }); }
          catch (e) { refusedFiles.push(e instanceof Error ? e.message : String(e)); }
        }
      }
      if (refusedFiles.length) {
        // Every issue landed; some files did not. Said here rather than swallowed, and the
        // drawer stays open so the files can be picked again on the request itself.
        setProblem(`${made.length} logged. ${refusedFiles.join(" ")}`);
        return;
      }
      onDone(made);
    } catch (e) {
      // Half a batch is a real state and the form says so rather than pretending nothing
      // happened. What landed is taken out of the form, so pressing the button again
      // finishes the job instead of logging the first ones twice.
      const said = e instanceof Error ? e.message : String(e);
      setProblem(made.length
        ? `${made.length} of ${ready.length} logged. The next one was refused: ${said}`
        : said);
      if (made.length) setIssues(list => list.filter(i => !landed.has(i.key)));
    } finally { setBusy(false); }
  };

  return (
    <div className="stack">
      {problem && <Problem>{problem}</Problem>}

      {/* The header is a panel too, so its controls sit at the same inset as the issue
          cards' and the whole column lines up — Amber, 14 September: "ensuring all
          fillable properties are same width and aligned". Two cards at different insets
          is what "aligned" rules out. */}
      <section className="panel">
      <Field label="Job" required>
        <Select aria-label="Job" clearable value={job} onChange={setJob}
          options={jobs.map(j => ({ value: j.id, label: `${j.id} · ${j.currentAddress}` }))} />
      </Field>
      <Field label="Date identified">
        <DateField value={identifiedOn} onChange={setIdentifiedOn} ariaLabel="Date identified" />
      </Field>
      {/* `ordered`: Amber's list runs PCI → the inspectors → handover → the 1, 2 and 3
          month inspections. That sequence is the information, so it is not sorted. */}
      <Field label="Identified at">
        <Select aria-label="Identified at" clearable ordered
          value={identifiedAt} onChange={v => setIdentifiedAt(v as MaintenanceIdentifiedAt | null)}
          options={MAINTENANCE_IDENTIFIED_AT.map(k => ({ value: k, label: MAINTENANCE_IDENTIFIED_AT_LABELS[k] }))} />
      </Field>
      <Field label="Reported by">
        <PersonSelect aria-label="Reported by" placeholder="" value={reportedBy} onChange={setReportedBy} />
      </Field>
      </section>

      {issues.map((issue, n) => (
        <section key={issue.key} className="panel">
          <div className="field-inline" style={{ justifyContent: "space-between", marginBottom: "var(--space-8)" }}>
            <Text type="text2" weight="medium" element="h3">Issue {n + 1}</Text>
            {issues.length > 1 && (
              <Button size="small" kind="tertiary" onClick={() => setIssues(list => list.filter(i => i.key !== issue.key))}>
                Remove
              </Button>
            )}
          </div>
          <Field label="Issue" required>
            <TextField size="small" id={`${issue.key}-summary`} inputAriaLabel={`Issue ${n + 1}`}
              value={issue.summary} onChange={v => patch(issue.key, { summary: v })} />
          </Field>
          <Field label="Details">
            {/* Six rows, not three — Amber: "allow the details section to have more space
                to write with". The width stays the column's so it lines up with the rest. */}
            <textarea className="pf-input" rows={6} aria-label={`Details for issue ${n + 1}`}
              value={issue.description} onChange={e => patch(issue.key, { description: e.target.value })} />
          </Field>
          <Field label="Assigned to">
            <div className="stack-tight">
              <div className="field-inline" role="radiogroup" aria-label={`Assigned to, issue ${n + 1}`}>
                {MAINTENANCE_ASSIGNEE_KINDS.map(kind => (
                  <label key={kind} className="issue-draft-radio">
                    <input type="radio" name={`${issue.key}-kind`} value={kind}
                      checked={issue.assigneeKind === kind}
                      // The other half is cleared with the switch: the database refuses a
                      // row that names a person AND a company, and clearing here means the
                      // refusal never reaches somebody who cannot act on it.
                      onChange={() => patch(issue.key, { assigneeKind: kind, assigneeProfileId: null, assignedCompanyId: null })} />
                    <Text type="text2" element="span">{MAINTENANCE_ASSIGNEE_KIND_LABELS[kind]}</Text>
                  </label>
                ))}
              </div>
              {issue.assigneeKind === "internal" ? (
                <PersonSelect aria-label={`Internal assignee, issue ${n + 1}`} placeholder=""
                  only={REPAIR_TEAMS} emptyText="Nobody on Maintenance or Construction by that name"
                  value={issue.assigneeProfileId} onChange={v => patch(issue.key, { assigneeProfileId: v })} />
              ) : (
                <TypeaheadSelect aria-label={`Contractor, issue ${n + 1}`} clearable placeholder=""
                  options={companyOptions} value={issue.assignedCompanyId}
                  onChange={v => patch(issue.key, { assignedCompanyId: v })}
                  emptyText="No contractor by that name"
                  createLabel={typed => `Add new company “${typed}”`}
                  onCreate={name => { void addCompany(issue.key, name); }} />
              )}
            </div>
          </Field>
          {/* One input, not two. `accept` without `capture` is what gives an iPhone the
              choice of Photo Library, Take Photo or Browse — adding `capture` would force
              the camera and take away choosing one already taken, which is the commoner
              half of what Amber asked for. Uploaded after the request exists to hold it. */}
          <Field label="Attach files">
            <div className="issue-files">
              <input type="file" multiple accept="image/*,application/pdf"
                aria-label={`Attach files to issue ${n + 1}`}
                onChange={e => {
                  const picked = Array.from(e.target.files ?? []);
                  if (picked.length) patch(issue.key, { files: [...issue.files, ...picked] });
                  // Cleared so picking the same file twice in a row still fires a change.
                  e.target.value = "";
                }} />
              {issue.files.map((f, at) => (
                <div className="issue-file" key={`${f.name}-${at}`}>
                  <Text type="text3" color="secondary" element="span">{f.name}</Text>
                  <Button size="xs" kind="tertiary"
                    onClick={() => patch(issue.key, { files: issue.files.filter((_, i) => i !== at) })}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </Field>
        </section>
      ))}

      {/* Paste a list, get an issue per line. The count is live so the number of issues
          about to appear is visible BEFORE the button is pressed — a button that says
          "Add" and quietly makes nineteen is one nobody presses twice.

          The lines land in the Issue field of a block each, with details, assignee and
          files still to fill in per issue. It adds rather than replaces, and an untouched
          empty block is consumed rather than left stranded above the new ones. */}
      <section className="panel">
        <div className="panel-head">
          <Text type="text2" weight="bold">Paste a list</Text>
          {dumpLines.length > 0 && (
            <Text type="text3" color="secondary">{dumpLines.length} issue{dumpLines.length === 1 ? "" : "s"}</Text>
          )}
        </div>
        <textarea className="pf-input" rows={4} aria-label="Paste a list of issues"
          style={{ width: "100%" }}
          value={dump} onChange={e => setDump(e.target.value)} />
        <div className="field-inline" style={{ justifyContent: "space-between", marginTop: "var(--space-8)" }}>
          <Text type="text3" color="secondary" ellipsis={false} element="span">One line, one issue. Bullets and numbering are stripped.</Text>
          <Button size="small" kind="tertiary" disabled={dumpLines.length === 0} onClick={() => {
            setIssues(list => {
              const kept = list.filter(i => i.summary.trim() !== "" || i.description.trim() !== "" || i.files.length > 0);
              return [...kept, ...dumpLines.map(line => ({ ...blankIssue(), summary: line }))];
            });
            setDump("");
          }}>
            {dumpLines.length > 0 ? `Add ${dumpLines.length} issue${dumpLines.length === 1 ? "" : "s"}` : "Add"}
          </Button>
        </div>
      </section>

      <div className="field-inline">
        <Button size="small" kind="tertiary" onClick={() => setIssues(list => [...list, blankIssue()])}>
          + Add
        </Button>
      </div>

      <div className="field-inline" style={{ justifyContent: "flex-end" }}>
        <Button size="small" disabled={!canSave} onClick={submit}>
          {ready.length > 1 ? `Log ${ready.length} issues` : "Log issue"}
        </Button>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------------------
function RequestDetail({ id, onChanged }: { id: string; onChanged: () => void }) {
  const repo = useRepository();
  const { can } = usePermission();
  const canWrite = can("user");
  const [reload, setReload] = useState(0);
  const { data: request, loading } = useQuery<MaintenanceRequest | null>(r => r.getMaintenanceRequest(id), null, [id, reload]);
  const { data: items } = useQuery<MaintenanceItem[]>(r => r.listMaintenanceItems(id), [], [id, reload]);
  const { data: messages } = useQuery<MaintenanceMessage[]>(r => r.listMaintenanceMessages(id), [], [id, reload]);
  const { data: categories } = useQuery(r => r.listMaintenanceCategories(), []);
  const [problem, setProblem] = useState<string | null>(null);
  const [closeReason, setCloseReason] = useState("");
  const [note, setNote] = useState("");
  const [newItem, setNewItem] = useState({ description: "", location: "", categoryId: null as string | null });

  const bump = () => { setReload(n => n + 1); onChanged(); };
  const { data: files } = useQuery(r => r.listMaintenanceDocuments(id), [], [id, reload]);
  /**
   * `job-documents` is private, so there is no URL to render into an href — one is asked
   * for when somebody clicks and it expires in five minutes. Null when storage refuses,
   * which says the copy is gone rather than opening an error page.
   */
  const openFile = async (path: string | null) => {
    if (!path) return;
    const url = await repo.jobDocumentUrl(path);
    if (url) window.open(url, "_blank", "noopener");
  };
  async function run(fn: () => Promise<unknown>) {
    setProblem(null);
    try { await fn(); bump(); }
    catch (e) { setProblem(e instanceof Error ? e.message : String(e)); }
  }

  if (loading && !request) return <section className="panel"><Text type="text2" color="secondary">Loading…</Text></section>;
  if (!request) return <section className="panel"><Text type="text2" color="secondary">This request no longer exists.</Text></section>;
  const r = request;
  const isClosed = r.status === "closed" || r.status === "rejected";
  const openItems = items.filter(i => i.status !== "done" && i.status !== "not_applicable").length;

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-head">
          <div className="slot-sub">
            <Link to={`/jobs/${r.jobId}`}>{r.jobId}</Link> · {r.jobAddress} · reported {new Date(r.reportedAt).toLocaleDateString()} by {MAINTENANCE_SOURCE_LABELS[r.source].toLowerCase()}
          </div>
          <div className="panel-actions">
            <span className={`health is-${r.health}`}>{MAINTENANCE_HEALTH_LABELS[r.health]}</span>
          </div>
        </div>
        {problem && <Problem>{problem}</Problem>}

        <div className="field-inline" style={{ flexWrap: "wrap", gap: "var(--space-8)" }}>
          {r.handoverAt
            ? <span className={`slot-chip${r.isWarranty ? "" : " muted"}`}>{r.isWarranty ? "In warranty" : "Out of warranty"} · handed over {new Date(r.handoverAt).toLocaleDateString()}, ends {r.warrantyEndsOn ? new Date(r.warrantyEndsOn).toLocaleDateString() : "—"}</span>
            : <span className="slot-chip muted">No handover run completed on this job — warranty unknown</span>}
          {r.dueOn && <span className="slot-chip">Due {new Date(r.dueOn).toLocaleDateString()}{r.atRiskOn && r.atRiskOn !== r.dueOn ? ` · at risk from ${new Date(r.atRiskOn).toLocaleDateString()}` : ""}</span>}
          {!r.dueOn && <span className="slot-chip muted">No SLA — pick a trade with one, or type a due date</span>}
        </div>

        <div className="field-inline" style={{ flexWrap: "wrap", gap: "var(--space-12)", marginTop: "var(--space-8)" }}>
          <label className="field-inline"><Text type="text3" element="span">Status</Text>
            {canWrite ? (
              <Select aria-label="Status" value={r.status} onChange={v => run(() => repo.updateMaintenanceRequest(r.id, { status: v as MaintenanceStatus }))}
                options={MAINTENANCE_STATUSES.filter(s => s !== "closed").map(s => ({ value: s, label: MAINTENANCE_STATUS_LABELS[s] }))} />
            ) : <Text type="text3" element="span">{MAINTENANCE_STATUS_LABELS[r.status]}</Text>}
          </label>
          <label className="field-inline"><Text type="text3" element="span">Priority</Text>
            {canWrite ? (
              <Select aria-label="Priority" value={r.priority} onChange={v => run(() => repo.updateMaintenanceRequest(r.id, { priority: v as MaintenancePriority }))}
                options={MAINTENANCE_PRIORITIES.map(p => ({ value: p, label: MAINTENANCE_PRIORITY_LABELS[p] }))} />
            ) : <Text type="text3" element="span">{MAINTENANCE_PRIORITY_LABELS[r.priority]}</Text>}
          </label>
          {/* The three dates of an issue, editable in the drawer — Amber, 14 September:
              "add in the date booked, date completed into UI and drawer when clicked on."
              Follow-up joins them because 0114 added it at the same time on her earlier
              ask and nothing has ever shown it.

              Each writes on change and clears to null: DateField draws its own ✕ because
              the browser's is not a promise (12 September). None of the three is derived
              from the status and none derives it — a repair finished on Tuesday that
              nobody has closed shows a completion date and In progress, which is true. */}
          <label className="field-inline"><Text type="text3" element="span">Booked</Text>
            {canWrite ? (
              <DateField value={r.bookedOn} ariaLabel="Date booked"
                onChange={v => run(() => repo.updateMaintenanceRequest(r.id, { bookedOn: v }))} />
            ) : <Text type="text3" element="span">{r.bookedOn ? new Date(r.bookedOn).toLocaleDateString() : "—"}</Text>}
          </label>
          <label className="field-inline"><Text type="text3" element="span">Completed</Text>
            {canWrite ? (
              <DateField value={r.completedOn} ariaLabel="Date completed"
                onChange={v => run(() => repo.updateMaintenanceRequest(r.id, { completedOn: v }))} />
            ) : <Text type="text3" element="span">{r.completedOn ? new Date(r.completedOn).toLocaleDateString() : "—"}</Text>}
          </label>
          <label className="field-inline"><Text type="text3" element="span">Follow-up</Text>
            {canWrite ? (
              <DateField value={r.followUpOn} ariaLabel="Follow-up date"
                onChange={v => run(() => repo.updateMaintenanceRequest(r.id, { followUpOn: v }))} />
            ) : <Text type="text3" element="span">{r.followUpOn ? new Date(r.followUpOn).toLocaleDateString() : "—"}</Text>}
          </label>
          <label className="field-inline"><Text type="text3" element="span">Trade</Text>
            {canWrite ? (
              <Select aria-label="Trade" clearable placeholder="Trade…" value={r.categoryId} onChange={v => run(() => repo.updateMaintenanceRequest(r.id, { categoryId: v }))}
                options={categories.map(c => ({ value: c.id, label: c.name }))} />
            ) : <Text type="text3" element="span">{r.categoryName ?? "—"}</Text>}
          </label>
          <label className="field-inline"><Text type="text3" element="span">Owner</Text>
            {canWrite ? (
              <PersonSelect aria-label="Owner" placeholder="Lofty person…" value={r.ownerProfileId} onChange={v => run(() => repo.updateMaintenanceRequest(r.id, { ownerProfileId: v }))} />
            ) : <Text type="text3" element="span">{r.ownerName ?? "—"}</Text>}
          </label>
          {canWrite && (
            <label className="field-inline"><Text type="text3" element="span">Due</Text>
              <input type="date" className="date-input" aria-label="Due date" defaultValue={r.dueOn ?? ""} key={r.dueOn ?? "none"}
                onBlur={e => { const v = e.target.value || null; if (v !== r.dueOn) run(() => repo.updateMaintenanceRequest(r.id, { dueOn: v })); }} />
            </label>
          )}
        </div>

        <div style={{ marginTop: "var(--space-8)" }}>
          <Text type="text3" weight="bold">Reported by</Text>
          {r.reportedByName ? (
            <Text type="text2" ellipsis={false} element="p">
              {r.reportedByName}
              {r.reportedByEmail && <> · <a href={`mailto:${r.reportedByEmail}`} className="tap-link">{r.reportedByEmail}</a></>}
              {r.reportedByPhone && <> · <a href={`tel:${r.reportedByPhone.replace(/\s/g, "")}`} className="tap-link">{r.reportedByPhone}</a></>}
            </Text>
          ) : <Text type="text3" color="secondary" ellipsis={false} element="p">Nobody recorded — the closing email has nowhere to go until a contact is set.</Text>}
          {r.description && <Text type="text2" ellipsis={false} element="p" style={{ whiteSpace: "pre-wrap" }}>{r.description}</Text>}
        </div>
      </section>

      {/* The photos and files on this issue (0115). Opened through a signed URL asked for
          at the moment somebody clicks — `job-documents` is private and has no permanent
          address, which is the choice Amber made on 14 September. Removing one here takes
          it off the ISSUE; the copy filed against the job stays, because they are two
          links to one document. */}
      <section className="panel">
        <div className="panel-head">
          <Text type="text2" weight="bold">Photos and files</Text>
          <Text type="text3" color="secondary">{files.length === 0 ? "none yet" : `${files.length} attached`}</Text>
        </div>
        {files.length === 0 && <Text type="text3" color="secondary" ellipsis={false} element="p">Nothing attached. Add photos when the issue is logged, or here.</Text>}
        {files.map(f => (
          <div key={f.linkId} className="issue-file" style={{ padding: "var(--space-4) 0" }}>
            <button type="button" className="link-button tap-link" onClick={() => void openFile(f.storagePath)}>{f.name}</button>
            {canWrite && (
              <Button size="xs" kind="tertiary" onClick={() => run(() => repo.removeRecordDocument(f.linkId))}>Remove</Button>
            )}
          </div>
        ))}
        {canWrite && !isClosed && (
          <input type="file" multiple accept="image/*,application/pdf" aria-label="Attach files to this issue"
            style={{ marginTop: "var(--space-8)" }}
            onChange={e => {
              const picked = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (picked.length) void run(() => repo.attachMaintenanceFiles({ requestId: r.id, jobId: r.jobId, files: picked }));
            }} />
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <Text type="text2" weight="bold">Items</Text>
          <Text type="text3" color="secondary">{items.length === 0 ? "none yet" : `${items.length - openItems} of ${items.length} done`}</Text>
        </div>
        <Text type="text3" color="secondary" ellipsis={false} element="p">One line per trade. Offer each to a contractor — the email goes with an accept link; the item follows the answer.</Text>
        {items.map(i => <ItemRow key={i.id} item={i} closed={isClosed} canWrite={canWrite} onRun={run} />)}
        {canWrite && !isClosed && (
          <div className="field-inline" style={{ flexWrap: "wrap", marginTop: "var(--space-8)" }}>
            <TextField size="small" id={`item-${r.id}`} inputAriaLabel="New item" placeholder="What is wrong…" value={newItem.description} onChange={v => setNewItem({ ...newItem, description: v })} />
            <TextField size="small" id={`item-loc-${r.id}`} inputAriaLabel="Where in the house" placeholder="Where — ensuite, garage…" value={newItem.location} onChange={v => setNewItem({ ...newItem, location: v })} />
            <Select aria-label="Trade for the new item" clearable placeholder="Trade…" value={newItem.categoryId} onChange={v => setNewItem({ ...newItem, categoryId: v })} options={categories.map(c => ({ value: c.id, label: c.name }))} />
            <Button size="small" disabled={!newItem.description.trim()} onClick={() => run(async () => {
              await repo.addMaintenanceItem({ requestId: r.id, description: newItem.description.trim(), location: newItem.location.trim() || null, categoryId: newItem.categoryId ?? r.categoryId });
              setNewItem({ description: "", location: "", categoryId: null });
            })}>Add item</Button>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <Text type="text2" weight="bold">Thread</Text>
          <Text type="text3" color="secondary">what came in, what went out, what was said</Text>
        </div>
        {messages.length === 0 && <Text type="text3" color="secondary" ellipsis={false} element="p">Nothing yet.</Text>}
        <ul className="maint-thread">
          {messages.map(m => (
            <li key={m.id} className={`maint-msg is-${m.direction}`}>
              <div className="maint-msg-head">
                <span className="slot-chip" style={{ marginLeft: 0 }}>{m.direction === "in" ? "← in" : m.direction === "out" ? "→ out" : "note"} · {m.channel}</span>
                {m.toAddress && <span className="muted">{m.direction === "in" ? "from" : "to"} {m.toAddress}</span>}
                <span className="muted">{new Date(m.at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</span>
                {m.direction === "out" && <span className={`health is-${m.status === "sent" ? "done" : m.status === "failed" ? "overdue" : "no_due_date"}`}>{m.status}</span>}
              </div>
              {m.subject && <Text type="text2" weight="medium" ellipsis={false} element="div">{m.subject}</Text>}
              <Text type="text2" ellipsis={false} element="div" style={{ whiteSpace: "pre-wrap" }}>{m.body.replace("{{ACCEPT_LINK}}", "[accept link — filled when sent]")}</Text>
              {m.error && <div className="slot-sub">{m.error}</div>}
            </li>
          ))}
        </ul>
        {canWrite && (
          <div className="field-inline" style={{ marginTop: "var(--space-8)" }}>
            <TextField size="small" id={`note-${r.id}`} inputAriaLabel="Add a note" placeholder="Rang the homeowner — they are away until Monday…" value={note} onChange={setNote}
              onKeyDown={e => { if (e.key === "Enter" && note.trim()) run(async () => { await repo.addMaintenanceNote({ requestId: r.id, body: note.trim(), channel: "phone" }); setNote(""); }); }} />
            <Button size="small" disabled={!note.trim()} onClick={() => run(async () => { await repo.addMaintenanceNote({ requestId: r.id, body: note.trim(), channel: "phone" }); setNote(""); })}>Note</Button>
          </div>
        )}
      </section>

      {canWrite && (
        <section className="panel">
          <div className="panel-head">
            <Text type="text2" weight="bold">{isClosed ? "Closed" : "Close"}</Text>
            {isClosed && <Text type="text3" color="secondary">{r.closedAt ? new Date(r.closedAt).toLocaleString() : ""}{r.closedReason ? ` · ${r.closedReason}` : ""}</Text>}
          </div>
          {isClosed ? (
            <Button size="small" kind="secondary" onClick={() => run(() => repo.updateMaintenanceRequest(r.id, { status: "in_progress" }))}>Reopen</Button>
          ) : (
            <>
              <Text type="text3" color="secondary" ellipsis={false} element="p">
                {openItems > 0 ? `${openItems} item${openItems === 1 ? " is" : "s are"} still open — the database will refuse to close until each is done or not applicable.` : "Closing emails the homeowner (when they have an email on file) and tells the owner. A reply reopens it."}
              </Text>
              <div className="field-inline" style={{ flexWrap: "wrap" }}>
                <TextField size="small" id={`close-${r.id}`} inputAriaLabel="Reason for closing" placeholder="Reason — tap replaced, not a warranty item…" value={closeReason} onChange={setCloseReason} />
                <Button size="small" onClick={() => run(() => repo.updateMaintenanceRequest(r.id, { status: "closed", closedReason: closeReason.trim() || null }))}>Close request</Button>
                <Button size="small" kind="tertiary" onClick={() => run(() => repo.updateMaintenanceRequest(r.id, { status: "rejected", closedReason: closeReason.trim() || null }))}>Reject</Button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------------------
function acceptLinkFor(token: string): string | null {
  // supabaseUrl, not the raw variable: the project URL can arrive under either of two
  // names and resolving it twice is how one of them gets forgotten.
  return supabaseUrl ? `${supabaseUrl}/functions/v1/maintenance-accept?t=${token}` : null;
}

function ItemRow({ item, closed, canWrite, onRun }: { item: MaintenanceItem; closed: boolean; canWrite: boolean; onRun: (fn: () => Promise<unknown>) => Promise<void> }) {
  const repo = useRepository();
  const [offering, setOffering] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [shown, setShown] = useState<{ token: string; sentTo: string | null } | null>(null);
  const { data: companies } = useQuery(r => offering ? r.listCompanies() : Promise.resolve([]), [], [offering]);
  const { data: contacts } = useQuery(r => offering ? r.listContacts() : Promise.resolve([]), [], [offering]);
  const [draft, setDraft] = useState({ companyId: null as string | null, contactId: null as string | null, note: "" });
  const [answer, setAnswer] = useState({ status: "accepted" as "accepted" | "scheduled" | "declined", when: "", note: "" });
  const a = item.assignment;
  const live = a && (a.status === "offered" || a.status === "accepted" || a.status === "scheduled");
  const link = shown ? acceptLinkFor(shown.token) : null;

  return (
    <div className="maint-item">
      <div className="maint-item-head">
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <Text type="text2" weight="medium" ellipsis={false} element="div">{item.description}{item.location && <span className="muted"> · {item.location}</span>}</Text>
          <div className="slot-sub">
            {item.categoryName ?? "no trade"}
            {item.originalTrade && <> · did this on the build: <strong>{item.originalTrade}</strong></>}
            {item.completedAt && <> · done {new Date(item.completedAt).toLocaleDateString()}{item.completedByName ? ` by ${item.completedByName}` : ""}</>}
          </div>
        </div>
        <span className={`health is-${item.status === "done" ? "done" : item.status === "not_applicable" ? "cancelled" : item.status === "scheduled" ? "on_track" : item.status === "assigned" ? "waiting" : "no_due_date"}`}>{MAINTENANCE_ITEM_STATUS_LABELS[item.status]}</span>
      </div>
      {a && (
        <div className="slot-sub">
          {a.companyName ?? a.contactName ?? "somebody"}{a.companyName && a.contactName ? ` (${a.contactName})` : ""} — {MAINTENANCE_ASSIGNMENT_STATUS_LABELS[a.status]}
          {a.scheduledFor && <> · {new Date(a.scheduledFor).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</>}
          {a.respondedAt && <> · answered {new Date(a.respondedAt).toLocaleDateString()}</>}
          {a.note && <> · “{a.note}”</>}
        </div>
      )}
      {shown && (
        <div className="token-box" role="status">
          <Text type="text3" weight="bold" element="div">The contractor's accept link — shown once</Text>
          <Text type="text3" ellipsis={false} element="div">
            {shown.sentTo ? `Queued by email to ${shown.sentTo}. ` : "No email on file for them, so nothing was queued. "}
            Copy it now if you are sending it another way; it is not stored in the clear and cannot be shown again.
          </Text>
          <code className="token-link">{link ?? `token ${shown.token} (the app does not know its Supabase URL, so the link cannot be built here)`}</code>
          <div className="field-inline">
            {link && <Button size="xs" kind="secondary" onClick={() => { void navigator.clipboard?.writeText(link); }}>Copy link</Button>}
            <Button size="xs" kind="tertiary" onClick={() => setShown(null)}>Done</Button>
          </div>
        </div>
      )}
      {canWrite && !closed && item.status !== "done" && item.status !== "not_applicable" && (
        <div className="field-inline" style={{ flexWrap: "wrap", gap: "var(--space-4)" }}>
          {!live && <Button size="xs" kind="secondary" onClick={() => setOffering(o => !o)}>{offering ? "Cancel offer" : "Offer to a contractor…"}</Button>}
          {live && a.status === "offered" && <Button size="xs" kind="secondary" onClick={() => setAnswering(x => !x)}>{answering ? "Cancel" : "Record their answer…"}</Button>}
          {live && a.status !== "offered" && <Button size="xs" kind="secondary" onClick={() => setAnswering(x => !x)}>{answering ? "Cancel" : "Change the visit…"}</Button>}
          {live && <Button size="xs" kind="tertiary" onClick={() => onRun(() => repo.updateMaintenanceAssignment(a.id, { status: "done" }))}>Done</Button>}
          {live && <Button size="xs" kind="tertiary" onClick={() => onRun(() => repo.updateMaintenanceAssignment(a.id, { status: "cancelled" }))}>Cancel offer</Button>}
          {!live && <Button size="xs" kind="tertiary" onClick={() => onRun(() => repo.updateMaintenanceItem(item.id, { status: "done" }))}>Done</Button>}
          <Button size="xs" kind="tertiary" onClick={() => onRun(() => repo.updateMaintenanceItem(item.id, { status: "not_applicable" }))}>Not applicable</Button>
        </div>
      )}
      {canWrite && !closed && (item.status === "done" || item.status === "not_applicable") && !live && (
        <Button size="xs" kind="tertiary" onClick={() => onRun(() => repo.updateMaintenanceItem(item.id, { status: "open" }))}>Reopen item</Button>
      )}
      {offering && (
        <div className="field-inline" style={{ flexWrap: "wrap", marginTop: "var(--space-4)" }}>
          <Select aria-label="Company" clearable placeholder="Company…" value={draft.companyId} onChange={v => setDraft({ ...draft, companyId: v })}
            options={companies.map(c => ({ value: c.id, label: c.name + (c.primaryEmail ? ` · ${c.primaryEmail}` : "") }))} />
          <Select aria-label="Person" clearable placeholder="Person (optional)…" value={draft.contactId} onChange={v => setDraft({ ...draft, contactId: v })}
            options={contacts.filter(c => !draft.companyId || c.companyId === draft.companyId).map(c => ({ value: c.id, label: c.fullName + (c.primaryEmail ? ` · ${c.primaryEmail}` : "") }))} />
          <TextField size="small" id={`offer-note-${item.id}`} inputAriaLabel="Note to the contractor" placeholder="Note — before Friday please" value={draft.note} onChange={v => setDraft({ ...draft, note: v })} />
          <Button size="small" disabled={!draft.companyId && !draft.contactId} onClick={() => onRun(async () => {
            const o = await repo.offerMaintenanceItem({ itemId: item.id, companyId: draft.companyId, contactId: draft.contactId, note: draft.note.trim() || null });
            setShown({ token: o.acceptToken, sentTo: o.sentTo }); setOffering(false); setDraft({ companyId: null, contactId: null, note: "" });
          })}>Send offer</Button>
        </div>
      )}
      {answering && a && (
        <div className="field-inline" style={{ flexWrap: "wrap", marginTop: "var(--space-4)" }}>
          <Select aria-label="Their answer" value={answer.status} onChange={v => setAnswer({ ...answer, status: v as typeof answer.status })}
            options={[{ value: "accepted", label: "Accepted, no time yet" }, { value: "scheduled", label: "Accepted, with a time" }, { value: "declined", label: "Declined" }]} />
          {answer.status === "scheduled" && <input type="datetime-local" className="date-input" aria-label="Visit time" value={answer.when} onChange={e => setAnswer({ ...answer, when: e.target.value })} />}
          <TextField size="small" id={`answer-note-${item.id}`} inputAriaLabel="What they said" placeholder="What they said" value={answer.note} onChange={v => setAnswer({ ...answer, note: v })} />
          <Button size="small" disabled={answer.status === "scheduled" && !answer.when} onClick={() => onRun(async () => {
            await repo.updateMaintenanceAssignment(a.id, { status: answer.status, scheduledFor: answer.status === "scheduled" ? new Date(answer.when).toISOString() : null, note: answer.note.trim() || undefined });
            await repo.addMaintenanceNote({ requestId: item.requestId, assignmentId: a.id, channel: "phone", body: `${a.companyName ?? a.contactName ?? "The contractor"} ${answer.status === "declined" ? "declined" : "accepted"} by phone${answer.status === "scheduled" ? ` for ${new Date(answer.when).toLocaleString()}` : ""}${answer.note.trim() ? `: ${answer.note.trim()}` : ""}` });
            setAnswering(false);
          })}>Record</Button>
        </div>
      )}
    </div>
  );
}
