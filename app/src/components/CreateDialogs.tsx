import { useEffect, useState } from "react";
import { Button, Text, TextField } from "@vibe/core";
import { CreatePanel } from "./CreatePanel";
import { Field, Problem, Result } from "./Form";
import { Select, toOptions } from "./Select";
import { useRepository } from "../data/DataProvider";
import { useTeams } from "../data/useLookups";
import {
  AU_STATES, MAX_SPLIT, PROJECT_TYPE_LABELS, PROJECT_TYPES, SA_COUNCILS,
  type NewAddress, type ProjectType, type SaCouncil, type TeamId
} from "../data/types";
import "./ui.css";

/**
 * The create forms behind "+ New project" and "+ New job".
 *
 * Both buttons rendered and did nothing until now — they were passed to Toolbar as the
 * `actions` prop, which renders whatever it is given, and neither carried an onClick.
 *
 * What they ask for is deliberately the minimum the database will not fill in itself.
 * A project needs an address and a type; everything else — the project number from a
 * sequence, both address pointers, the audit quartet — is the database's to set. Asking
 * for a project number here would be offering to fight the sequence.
 *
 * ALL THREE ARE PANELS NOW, NOT ONE PANEL AND TWO DIALOGS
 *
 *   New project moved to `CreatePanel` and the other two did not, which left the app
 *   with two different answers to "what does creating something look like". They are
 *   the same answer now. The reasoning for the panel is in `CreatePanel` and applies
 *   to all three: the list you are adding to stays visible, and splitting a project
 *   into six jobs is precisely the case where you want to see the six appear.
 *
 *   `Field`, `Problem` and `Result` came out of this file into `Form.tsx`, because a
 *   second copy of them in `UserDialogs` had drifted onto class names nothing styles.
 */

/** Shared between both dialogs, because a job may sit at its own address. */
function AddressFields({
  value,
  onChange
}: {
  value: NewAddress;
  onChange: (next: NewAddress) => void;
}) {
  const set = <K extends keyof NewAddress>(key: K, v: NewAddress[K]) =>
    onChange({ ...value, [key]: v });

  // The council enum is SA-only and the database enforces it with a CHECK, so the
  // picker disappears rather than offering values that would be rejected on save.
  const councilAvailable = (value.state ?? "SA") === "SA";

  // Which of 0037's two address shapes this currently is. Drives the hints, so the form
  // explains the rule as it is being met rather than only when it is broken.
  const shape = addressShape(value);

  return (
    <>
      <Field label="Lot number" hint="as it appears on the plan of division">
        <TextField
          value={value.lotNumber ?? ""}
          onChange={v => set("lotNumber", v || null)}
          placeholder="12A"
          id="addr-lot-number"
          inputAriaLabel="Lot number"
        />
      </Field>
      <Field
        label="Street number"
        hint={shape === "locality" ? "once there is a street to number" : undefined}
      >
        <TextField
          value={value.streetNumber ?? ""}
          onChange={v => set("streetNumber", v || null)}
          placeholder="42"
          id="addr-street-number"
          inputAriaLabel="Street number"
        />
      </Field>
      {/* Not required since 0037. Leaving it blank is what makes this a locality, which
          is the only kind of address Lofty has when the land is bought — so the hint says
          what blank means rather than treating it as a field somebody forgot. */}
      <Field
        label="Street"
        hint={
          shape === "locality"
            ? "leave blank if only the suburb is settled — the project can be created without it"
            : "with a lot or street number above"
        }
      >
        <TextField
          value={value.street1 ?? ""}
          onChange={v => set("street1", v || null)}
          placeholder="Ironbark Road"
          id="addr-street-1"
          inputAriaLabel="Street"
        />
      </Field>
      <Field label="Unit / level" hint="anything above the street line">
        <TextField
          value={value.street2 ?? ""}
          onChange={v => set("street2", v || null)}
          placeholder="Unit 3"
          id="addr-street-2"
          inputAriaLabel="Unit or level"
        />
      </Field>
      <Field label="Suburb" required>
        <TextField
          value={value.suburb}
          onChange={v => set("suburb", v)}
          placeholder="Golden Grove"
          id="addr-suburb"
          inputAriaLabel="Suburb"
          required
        />
      </Field>
      <Field label="State">
        <Select
          aria-label="State"
          options={toOptions([...AU_STATES])}
          value={value.state ?? "SA"}
          onChange={v => {
            // Changing away from SA has to clear the council, or the insert fails the
            // addresses_council_is_sa check with an error nobody can act on.
            const state = v as NewAddress["state"];
            onChange({ ...value, state, council: state === "SA" ? value.council : null });
          }}
        />
      </Field>
      <Field label="Postcode" required>
        <TextField
          value={value.postcode}
          onChange={v => set("postcode", v)}
          placeholder="5125"
          id="addr-postcode"
          inputAriaLabel="Postcode"
          required
        />
      </Field>
      {councilAvailable && (
        <Field label="Council region" hint="in the LGA's own order">
          <Select
            aria-label="Council region"
            options={toOptions([...SA_COUNCILS])}
            value={value.council ?? null}
            onChange={v => set("council", v as SaCouncil)}
            placeholder="Select a council"
            clearable
          />
        </Field>
      )}
    </>
  );
}

/**
 * The owning team, from `teams` rather than from TEAM_SEED.
 *
 * It read the constant directly, which is the one thing the repository seam exists to
 * prevent — and it mattered here more than most, because this value is a foreign key.
 * Retired teams are filtered out: `useTeams().teamNames` is active-only, and a picker
 * must not offer Commercial or Executive.
 */
function OwningTeamField({
  value,
  onChange,
  hint
}: {
  value: TeamId | null;
  onChange: (t: TeamId) => void;
  hint: string;
}) {
  const { teams } = useTeams();
  const active = teams.filter(t => t.isActive);

  return (
    <Field label="Owning team" required hint={hint}>
      <Select
        aria-label="Owning team"
        options={active.map(t => ({ value: t.id, label: t.name }))}
        value={value}
        onChange={v => onChange(v as TeamId)}
        placeholder={active.length ? "Select a team" : "Loading teams…"}
      />
    </Field>
  );
}

const EMPTY_ADDRESS: NewAddress = {
  street1: "", suburb: "", state: "SA", postcode: "", council: null,
  lotNumber: null, streetNumber: null, street2: null
};

const filled = (v: string | null | undefined) => !!v?.trim();

/**
 * The rules the `addresses` table enforces, checked here so the Create button greys out
 * instead of the insert coming back with a constraint name.
 *
 * Kept beside the fields rather than in the repository because it is a statement about
 * this form: what the person still has to fill in. The database remains the one that
 * decides — this only saves them a round trip.
 *
 * Rewritten for `0037`, which is where the interesting part is. The street used to be
 * required; it is now the thing that decides which of two shapes this address is.
 */
const addressIsValid = (a: NewAddress): boolean =>
  // Always: suburb, a four-digit postcode (text, because 0800 is Darwin), and a council
  // in SA. addresses_council_required_in_sa is conditional because an interstate address
  // cannot carry one at all.
  filled(a.suburb) &&
  /^[0-9]{4}$/.test(a.postcode.trim()) &&
  ((a.state ?? "SA") !== "SA" || a.council !== null) &&
  // And then one of two shapes, which is exactly the pair of constraints 0037 installed:
  //
  //   locality — no street, and therefore no numbers either. Enough for a project,
  //              because Lofty buys land before it has a frontage.
  //   street   — a street and at least one of lot or street number. A subdivided site is
  //              "Lot 3" long before it is "28", so either will do, but not neither.
  //
  // The halfway states are what the constraints refuse: a number with no street is a
  // fragment, and a street with no number is somewhere nobody can find.
  (filled(a.street1)
    ? filled(a.lotNumber) || filled(a.streetNumber)
    : !filled(a.lotNumber) && !filled(a.streetNumber));

/** Which of the two shapes the form is currently describing, for the hint under it. */
const addressShape = (a: NewAddress): "locality" | "street" =>
  filled(a.street1) ? "street" : "locality";

export function NewProjectDialog({
  show,
  onClose,
  onCreated,
  onSplit
}: {
  show: boolean;
  onClose: () => void;
  onCreated?: () => void;
  /** Called with the new project and its dwelling count, to open the split dialog. */
  onSplit?: (projectId: number, dwellings: number) => void;
}) {
  const repo = useRepository();
  const [address, setAddress] = useState<NewAddress>(EMPTY_ADDRESS);
  const [name, setName] = useState("");
  const [projectType, setProjectType] = useState<ProjectType | null>(null);
  const [dwellings, setDwellings] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<number | null>(null);

  // Blank is a real answer — "we do not know yet" — and is not the same as zero. Parsed
  // once here so the button, the insert and the follow-on split all read one value.
  const dwellingCount =
    dwellings.trim() === "" ? null
    : /^[0-9]+$/.test(dwellings.trim()) ? Number(dwellings.trim())
    : NaN;
  const dwellingsValid =
    dwellingCount === null || (Number.isInteger(dwellingCount) && dwellingCount >= 1);

  // projectType is required by the database now, so the button waits for it rather than
  // letting the insert come back with a not-null violation.
  const valid = addressIsValid(address) && projectType !== null && dwellingsValid;

  const reset = () => {
    setAddress(EMPTY_ADDRESS);
    setName("");
    setProjectType(null);
    setDwellings("");
    setError(null);
    setCreated(null);
    setSaving(false);
  };

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const project = await repo.createProject({
        address,
        name,
        projectType: projectType!,
        proposedDwellings: dwellingCount
      });
      // The project number is the thing the person came for — it is what they will
      // quote on the phone — and it does not exist until the sequence issues it.
      setCreated(project.id);
      onCreated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const close = () => { reset(); onClose(); };

  // The footer's two buttons, built once. They are the same pair whether the panel is a
  // panel or expanded, and building them inline in JSX twice is how the two drift.
  const primary = created
    ? dwellingCount
      ? { text: `Create ${dwellingCount} job${dwellingCount === 1 ? "" : "s"}`,
          onClick: () => { const id = created; reset(); onClose(); onSplit?.(id, dwellingCount); },
          disabled: false }
      : { text: "Done", onClick: close, disabled: false }
    : { text: saving ? "Creating…" : "Create project", onClick: save, disabled: !valid || saving };

  const secondary = created
    ? dwellingCount ? { text: "Not now", onClick: close } : null
    : { text: "Cancel", onClick: close };

  return (
    <CreatePanel
      open={show}
      title="New project"
      onClose={close}
      footer={
        <>
          {secondary && (
            <Button kind="tertiary" onClick={secondary.onClick}>{secondary.text}</Button>
          )}
          <Button onClick={primary.onClick} disabled={primary.disabled}>{primary.text}</Button>
        </>
      }
    >
      <>
        {created ? (
          <Result>
            Project <strong>{created}</strong> created.
            {dwellingCount
              ? ` Next: create its ${dwellingCount} job${dwellingCount === 1 ? "" : "s"}.`
              : " Add its jobs from the project, or one at a time from the Jobs board."}
          </Result>
        ) : (
          <div className="create-form">
            {/* First, because it is what people will call it. Optional — most projects are
                known by their address — and the field that matters when the address is a
                locality, since "Mount Gambier SA 5290" is not what anybody says out loud. */}
            <Field label="Project name" hint={'optional — e.g. "Mt Gambier division"'}>
              <TextField
                value={name}
                onChange={setName}
                placeholder="Mt Gambier division"
                id="project-name"
                inputAriaLabel="Project name"
              />
            </Field>
            <Field label="Project type" required hint="jobs inherit this — they never set their own">
              <Select
                aria-label="Project type"
                options={PROJECT_TYPES.map(t => ({ value: t, label: PROJECT_TYPE_LABELS[t] }))}
                value={projectType}
                onChange={v => setProjectType(v as ProjectType)}
                placeholder="Select a type"
              />
            </Field>
            <Field
              label="Proposed dwellings"
              hint="how many lots are intended — leave blank if the count is not settled"
            >
              <TextField
                value={dwellings}
                onChange={setDwellings}
                placeholder="4"
                id="project-dwellings"
                inputAriaLabel="Proposed dwellings"
                validation={
                  dwellingsValid ? undefined : { status: "error", text: "A whole number, 1 or more." }
                }
              />
            </Field>
            <AddressFields value={address} onChange={setAddress} />
          </div>
        )}
        {error && <Problem>{error}</Problem>}
      </>
    </CreatePanel>
  );
}

export function NewJobDialog({
  show,
  onClose,
  projects,
  onCreated
}: {
  show: boolean;
  onClose: () => void;
  /** The projects a job can be created under. A job cannot exist without one. */
  projects: { id: string; label: string }[];
  onCreated?: () => void;
}) {
  const repo = useRepository();
  const [projectId, setProjectId] = useState<string | null>(null);
  // No default. The database has none either, deliberately: this decides whose work the
  // job is, and a default would mean nobody ever chose.
  const [owningTeam, setOwningTeam] = useState<TeamId | null>(null);
  const [ownAddress, setOwnAddress] = useState(false);
  const [address, setAddress] = useState<NewAddress>(EMPTY_ADDRESS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const valid = projectId !== null && owningTeam !== null
    && (!ownAddress || addressIsValid(address));

  const reset = () => {
    setProjectId(null);
    setOwningTeam(null);
    setOwnAddress(false);
    setAddress(EMPTY_ADDRESS);
    setError(null);
    setCreated(null);
    setSaving(false);
  };

  async function save() {
    if (!projectId || !owningTeam) return;
    setSaving(true);
    setError(null);
    try {
      const job = await repo.createJob({
        projectId: Number(projectId),
        owningTeam,
        address: ownAddress ? address : undefined
      });
      setCreated(job.id);
      onCreated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const close = () => { reset(); onClose(); };

  return (
    <CreatePanel
      open={show}
      title="New job"
      onClose={close}
      footer={
        created
          ? <Button onClick={close}>Done</Button>
          : (
            <>
              <Button kind="tertiary" onClick={close}>Cancel</Button>
              <Button onClick={save} disabled={!valid || saving}>
                {saving ? "Creating…" : "Create job"}
              </Button>
            </>
          )
      }
    >
      <>
        {created ? (
          <Result>
            Job <strong>{created}</strong> created.
          </Result>
        ) : (
          <div className="create-form">
            <Field label="Project" required hint="a job always belongs to one">
              <Select
                aria-label="Project"
                options={projects.map(p => ({ value: p.id, label: p.label }))}
                value={projectId}
                onChange={setProjectId}
                placeholder={projects.length ? "Select a project" : "No projects yet"}
              />
            </Field>

            <OwningTeamField
              value={owningTeam}
              onChange={setOwningTeam}
              hint="who is accountable for this job"
            />

            {/* Most jobs sit at the project's address, so that is the default and the
                fields stay out of the way until someone says otherwise. */}
            <Field label="Address" hint="jobs inherit the project's address">
              <Button
                kind={ownAddress ? "primary" : "tertiary"}
                size="small"
                onClick={() => setOwnAddress(v => !v)}
              >
                {ownAddress ? "Using its own address" : "Give it its own address"}
              </Button>
            </Field>

            {ownAddress && <AddressFields value={address} onChange={setAddress} />}
          </div>
        )}
        {error && <Problem>{error}</Problem>}
      </>
    </CreatePanel>
  );
}

/**
 * Split a project into its lots.
 *
 * The one thing worth understanding before changing this: each job gets **its own copy**
 * of the project's address with a lot number on it, not a pointer at the project's row.
 * That copy is what the immutable original address is *of* — rename the project to
 * "20A Corner Street" a month later and Lot 3 still remembers being created as
 * "Lot 3, Corner Street", which is what somebody searching an old contract will type.
 *
 * `startLot` exists because a second split is adding lots 5 and 6, not repeating 1 and 2.
 * It defaults to one past the highest lot already on the project, which is right almost
 * always and editable for when it is not.
 */
export function SplitProjectDialog({
  show,
  onClose,
  projectId,
  suggestedCount,
  nextLot,
  onCreated
}: {
  show: boolean;
  onClose: () => void;
  /** Null while no project is chosen — the dialog renders nothing. */
  projectId: number | null;
  /** Proposed dwellings, when the project has one. */
  suggestedCount?: number | null;
  /** One past the highest lot number already used. */
  nextLot?: number;
  onCreated?: () => void;
}) {
  const repo = useRepository();
  const [count, setCount] = useState("");
  const [startLot, setStartLot] = useState("");
  const [owningTeam, setOwningTeam] = useState<TeamId | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string[] | null>(null);

  // Defaults arrive as props and the fields start blank, so seed them when the dialog
  // opens rather than on every render — otherwise typing over the default fights back.
  useEffect(() => {
    if (!show) return;
    setCount(suggestedCount ? String(suggestedCount) : "");
    setStartLot(String(nextLot ?? 1));
    setOwningTeam(null);
    setError(null);
    setCreated(null);
    setSaving(false);
  }, [show, projectId, suggestedCount, nextLot]);

  const whole = (v: string) => /^[0-9]+$/.test(v.trim()) && Number(v.trim()) >= 1;
  // Same ceiling the repository enforces, imported rather than retyped — two copies
  // of a limit drift, and the one people meet first should not be the looser one.
  const countValid = whole(count) && Number(count) <= MAX_SPLIT;
  const lotValid = whole(startLot);
  const valid = countValid && lotValid && owningTeam !== null;

  const n = Number(count);
  const first = Number(startLot);

  async function save() {
    if (!projectId || !owningTeam) return;
    setSaving(true);
    setError(null);
    try {
      const jobs = await repo.createJobsFromSplit({
        projectId,
        count: n,
        owningTeam,
        startLot: first
      });
      setCreated(jobs.map(j => j.id));
      onCreated?.();
    } catch (e) {
      // Shown verbatim, and the repository's message says how many were made before it
      // stopped — which is the difference between "try again" and "you now have three".
      setError(e instanceof Error ? e.message : String(e));
      onCreated?.();
    } finally {
      setSaving(false);
    }
  }

  if (projectId === null) return null;

  return (
    <CreatePanel
      open={show}
      title={`Create jobs on project ${projectId}`}
      onClose={onClose}
      footer={
        created
          ? <Button onClick={onClose}>Done</Button>
          : (
            <>
              <Button kind="tertiary" onClick={onClose}>Cancel</Button>
              <Button onClick={save} disabled={!valid || saving}>
                {saving
                  ? "Creating…"
                  : countValid
                    ? `Create ${n} job${n === 1 ? "" : "s"}`
                    : "Create jobs"}
              </Button>
            </>
          )
      }
    >
      <>
        {created ? (
          <Result>
            Created <strong>{created.length}</strong> job{created.length === 1 ? "" : "s"}:{" "}
            {created.join(", ")}.
          </Result>
        ) : (
          <div className="create-form">
            <Field label="How many jobs" required hint="one per dwelling">
              <TextField
                value={count}
                onChange={setCount}
                placeholder="4"
                id="split-count"
                inputAriaLabel="How many jobs"
                validation={
                  count === "" || countValid
                    ? undefined
                    : { status: "error", text: `A whole number between 1 and ${MAX_SPLIT}.` }
                }
              />
            </Field>

            <Field label="First lot number" hint="the rest count up from here">
              <TextField
                value={startLot}
                onChange={setStartLot}
                placeholder="1"
                id="split-start-lot"
                inputAriaLabel="First lot number"
                validation={
                  startLot === "" || lotValid
                    ? undefined
                    : { status: "error", text: "A whole number, 1 or more." }
                }
              />
            </Field>

            <OwningTeamField
              value={owningTeam}
              onChange={setOwningTeam}
              hint="the same team for every job in this batch — they diverge later"
            />

            {countValid && lotValid && (
              <div className="create-preview">
                <Text type="text3" color="secondary" ellipsis={false}>
                  {n === 1
                    ? `Lot ${first}, at the project's address.`
                    : `Lots ${first}–${first + n - 1}, each at the project's address with its own lot number. Job numbers are issued by the database, continuing from any that already exist.`}
                </Text>
              </div>
            )}
          </div>
        )}
        {error && <Problem>{error}</Problem>}
      </>
    </CreatePanel>
  );
}
