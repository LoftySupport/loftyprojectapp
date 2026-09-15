// app/src/components/NewTaskDialog.tsx
import { useMemo, useState } from "react";
import { Button, TextField } from "@vibe/core";
import { SidePanel } from "./SidePanel";
import { Field, Problem, Result } from "./Form";
import { Select } from "./Select";
import { PersonSelect } from "./PersonSelect";
import { DateField } from "./DateField";
import { useRepository, useQuery } from "../data/DataProvider";
import { useTeams } from "../data/useLookups";
import type { Job, Project, TeamId } from "../data/types";
import "./ui.css";

/**
 * "+ New task" — the button the Tasks board did not have.
 *
 * Amber, 12 September: *"on tasks you can't add a new task and assign it to a person or
 * team or job and project. There is no button."*
 *
 * She is exactly right, and the reason is worth writing down rather than fixing quietly.
 * `createTask` has existed since 0102 and takes every one of those four — `jobId`,
 * `projectId`, `owningTeam`, `assigneeId` — and `TasksPanel` calls it from inside a job.
 * So a task typed in by hand could only ever be created from the record it hung off. The
 * board that exists to show every task across every job had no way to add one, which
 * makes it a report rather than a place to work.
 *
 * WHAT IT ASKS FOR, AND WHAT IT DOES NOT
 *
 *   The name is the only required field. Everything else is a fact somebody may not have
 *   yet: a task with no assignee is a real state the board already draws as "Nobody", and
 *   a task with no due date reads as `no_due_date` health rather than as overdue. Making
 *   any of them required would mean inventing a value to get past the form — which is the
 *   one thing this repository is most consistently against.
 *
 *   A job OR a project, never both. `tasks` carries both columns and the database's own
 *   check allows one of them; a task on job 1042-01 is not also a task on project 1042.
 *   The picker is one list of both, so nobody has to know which kind of thing they are
 *   attaching to before they can find it.
 *
 *   **A task attached to nothing is allowed**, and that is deliberate rather than an
 *   oversight: "ring the insurer" is a real task that belongs to a person and no record.
 *   The board's Job column already renders those as blank.
 */

/** Job or project, in one list — nobody should have to pick the kind first. */
type Attach = { value: string; label: string };

export function NewTaskDialog({
  show,
  onClose,
  onCreated,
  /** Pre-attached when the board is already looking at one record. */
  defaultJobId = null
}: {
  show: boolean;
  onClose: () => void;
  onCreated?: () => void;
  defaultJobId?: string | null;
}) {
  const repo = useRepository();
  const { teams } = useTeams();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [attach, setAttach] = useState<string | null>(defaultJobId ? `job:${defaultJobId}` : null);
  const [owningTeam, setOwningTeam] = useState<TeamId | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [scheduledDate, setScheduledDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  // Read only while the panel is open: the board behind it is already holding a list of
  // every task, and a second read of every job on every page load is a cost with no
  // reader until somebody presses the button.
  const { data: jobs } = useQuery<Job[]>(
    r => (show ? r.listJobs() : Promise.resolve([])),
    [], [show]
  );
  const { data: projects } = useQuery<Project[]>(
    r => (show ? r.listProjects() : Promise.resolve([])),
    [], [show]
  );

  const attachments: Attach[] = useMemo(() => [
    // Jobs first: most tasks are about one lot, and a project-level task is the rarer
    // case. Each reads as its number and its address, which is how people say them.
    ...jobs.map(j => ({ value: `job:${j.id}`, label: `${j.id} — ${j.currentAddress}` })),
    ...projects.map(p => ({
      value: `project:${p.id}`,
      label: `Project ${p.id}${p.currentAddress ? ` — ${p.currentAddress}` : ""}`
    }))
  ], [jobs, projects]);

  const reset = () => {
    setName("");
    setDescription("");
    setAttach(defaultJobId ? `job:${defaultJobId}` : null);
    setOwningTeam(null);
    setAssigneeId(null);
    setDueDate(null);
    setScheduledDate(null);
    setError(null);
    setCreated(null);
    setSaving(false);
  };

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      const task = await repo.createTask({
        name: trimmed,
        description: description.trim() || null,
        jobId: attach?.startsWith("job:") ? attach.slice(4) : undefined,
        projectId: attach?.startsWith("project:") ? Number(attach.slice(8)) : undefined,
        owningTeam,
        assigneeId,
        dueDate,
        scheduledDate
      });
      setCreated(task.name);
      onCreated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const close = () => { reset(); onClose(); };

  return (
    <SidePanel
      open={show}
      title="New task"
      onClose={close}
      footer={
        created
          ? (
            <>
              {/* Four in a row is the commonest way this gets used — a stand-up where
                  somebody reads out what needs doing. "Add another" keeps the panel and
                  the record it was attached to. */}
              <Button kind="tertiary" onClick={() => { const a = attach; reset(); setAttach(a); }}>Add another</Button>
              <Button onClick={close}>Done</Button>
            </>
          )
          : (
            <>
              <Button kind="tertiary" onClick={close}>Cancel</Button>
              <Button onClick={() => void save()} disabled={!name.trim() || saving}>
                {saving ? "Creating…" : "Create task"}
              </Button>
            </>
          )
      }
    >
      <>
        {created ? (
          <Result>Task <strong>{created}</strong> created.</Result>
        ) : (
          <div className="create-form">
            <Field label="Task" required>
              <TextField inputAriaLabel="Task name" size="small" value={name} onChange={setName} />
            </Field>

            <Field label="Detail">
              <TextField inputAriaLabel="Task description" size="small" value={description} onChange={setDescription} />
            </Field>

            {/* One list of jobs and projects. A task may hang off neither — see the
                header — so this is clearable and starts empty. */}
            <Field label="Job or project">
              <Select
                aria-label="Job or project"
                options={attachments}
                value={attach}
                clearable
                placeholder={attachments.length ? "Not about a record" : "Loading…"}
                onChange={setAttach}
              />
            </Field>

            <Field label="Team">
              <Select
                aria-label="Owning team"
                options={teams.filter(t => t.isActive).map(t => ({ value: t.id, label: t.name }))}
                value={owningTeam}
                clearable
                placeholder="— no team —"
                onChange={v => setOwningTeam((v as TeamId | null) ?? null)}
              />
            </Field>

            {/* The team's own people first, everybody else under "Other teams" — the same
                picker the job record uses, not a second one. */}
            <Field label="Assigned to">
              <PersonSelect
                aria-label="Assigned to"
                teamId={owningTeam}
                value={assigneeId}
                onChange={setAssigneeId}
              />
            </Field>

            {/* "Due by" and "Planned for" rather than Due and Scheduled: they are two
                different questions (0102) and the bare words do not say which is which.
                No hint line under either — Amber, 10 September: *"a description belongs
                in a tooltip or nowhere"* — so the label carries it. */}
            <Field label="Due by">
              <DateField ariaLabel="Due date" value={dueDate} onChange={setDueDate} />
            </Field>

            {/* Different question from Due (0102): the day somebody intends to do it. */}
            <Field label="Planned for">
              <DateField ariaLabel="Scheduled date" value={scheduledDate} onChange={setScheduledDate} />
            </Field>

            {error && <Problem>{error}</Problem>}
          </div>
        )}
      </>
    </SidePanel>
  );
}
