import { useEffect, useRef, useState } from "react";
import { Button, Text, TextField } from "@vibe/core";
import { SidePanel } from "./SidePanel";
import { Field, Problem, Result } from "./Form";
import { Select, toOptions } from "./Select";
import { useRepository } from "../data/DataProvider";
import { useTeams } from "../data/useLookups";
import { councilForSuburb, isAmbiguousSuburb, postcodeForSuburb } from "../data/saSuburbs";
import { SuburbField } from "./SuburbField";
import {
  AU_STATES, MAX_SPLIT, OPENING_TEAM, PROJECT_TYPE_LABELS, PROJECT_TYPES,
  projectNameTail, SA_COUNCILS, TITLE_TYPE_LABELS, TITLE_TYPES,
  type NewAddress, type ProjectType, type SaCouncil, type SplitLot, type TeamId,
  type TitleType
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
 *   New project moved to `SidePanel` and the other two did not, which left the app
 *   with two different answers to "what does creating something look like". They are
 *   the same answer now. The reasoning for the panel is in `SidePanel` and applies
 *   to all three: the list you are adding to stays visible, and splitting a project
 *   into six jobs is precisely the case where you want to see the six appear.
 *
 *   `Field`, `Problem` and `Result` came out of this file into `Form.tsx`, because a
 *   second copy of them in `UserDialogs` had drifted onto class names nothing styles.
 *
 * NO PLACEHOLDERS ON THE TEXT FIELDS, DELIBERATELY
 *
 *   Lofty: *"remove the placeholder info on the fields, it is confusing to work out what
 *   you have typed and what you haven't."* Grey example text sits in the same box, in
 *   the same position, at the same size as a real value — so a nine-field form looked
 *   filled in when it was empty, and the only way to check was to click into each one.
 *   Every field here has a label and most have a hint, so the example was saying a third
 *   time what two visible lines already said.
 *
 *   The dropdowns keep theirs. "Select a type" is not an example of a value, it is the
 *   name of the empty state, and it is the only thing distinguishing "nothing chosen"
 *   from a choice. `InlineNewProjectRow` keeps its placeholders too, for the stronger
 *   version of the same reason: a row in a table has no labels, so there the placeholder
 *   IS the label.
 */

/** Shared between both dialogs, because a job may sit at its own address. */
export function AddressFields({
  value,
  onChange
}: {
  value: NewAddress;
  onChange: (next: NewAddress) => void;
}) {
  const set = <K extends keyof NewAddress>(key: K, v: NewAddress[K]) =>
    onChange({ ...value, [key]: v });

  /**
   * Typing a suburb fills in its council.
   *
   * From the list Lofty supplied — "Councils by Suburb/Locality as at 1 July 2026" —
   * so it is the LGA's own answer rather than a guess from a postcode. Postcodes were
   * the obvious key and are the wrong one: they cross council boundaries routinely,
   * where a suburb almost never does.
   *
   * WHAT IT WILL NOT DO
   *
   *   Overwrite a council somebody chose. `autoFilled` remembers the last value this
   *   put there, so re-typing the suburb corrects its own answer and leaves a manual
   *   one alone — the field is a suggestion, not a lock.
   *
   *   Answer for the four suburbs that sit in two councils. Those clear the field and
   *   say so, because a council on a lodged application is not worth being confidently
   *   wrong about.
   */
  const autoFilled = useRef<SaCouncil | null>(null);
  const onSuburb = (suburb: string) => {
    const next: NewAddress = { ...value, suburb };
    if ((value.state ?? "SA") === "SA") {
      const chosenByHand = value.council !== null && value.council !== autoFilled.current;
      if (!chosenByHand) {
        const found = councilForSuburb(suburb);
        next.council = found;
        autoFilled.current = found;
      }
      // Typed in full rather than picked — same answer, so fill the postcode too, but
      // never over one already there.
      if (!value.postcode.trim()) {
        const code = postcodeForSuburb(suburb);
        if (code) next.postcode = code;
      }
    }
    onChange(next);
  };

  /** A suburb chosen from the list: postcode and council are known, so both go in. */
  const onSuburbPicked = (suburb: string, postcode: string | null, council: string | null) => {
    const next: NewAddress = { ...value, suburb };
    if (postcode) next.postcode = postcode;
    if ((value.state ?? "SA") === "SA") {
      next.council = council as NewAddress["council"];
      autoFilled.current = council as SaCouncil | null;
    }
    onChange(next);
  };

  const ambiguous = isAmbiguousSuburb(value.suburb);

  // The council enum is SA-only and the database enforces it with a CHECK, so the
  // picker disappears rather than offering values that would be rejected on save.
  const councilAvailable = (value.state ?? "SA") === "SA";

  // Which of 0037's two address shapes this currently is. Drives the hints, so the form
  // explains the rule as it is being met rather than only when it is broken.
  const shape = addressShape(value);

  return (
    <>
      <Field label="Lot number" hint="as it appears on the plan of division — 12A is a lot number">
        <TextField
          value={value.lotNumber ?? ""}
          onChange={v => set("lotNumber", v || null)}
          id="addr-lot-number"
          inputAriaLabel="Lot number"
        />
      </Field>
      {/* Second, not fourth. An address is said "Lot 12A, Unit 3, 42 Ironbark Road" —
          the unit sits above the street number, so the form asks in that order rather
          than leaving somebody to scroll back up past the street to fill it in. */}
      <Field label="Unit / level" hint="anything above the street line">
        <TextField
          value={value.street2 ?? ""}
          onChange={v => set("street2", v || null)}
          id="addr-street-2"
          inputAriaLabel="Unit or level"
        />
      </Field>
      <Field
        label="Street number"
        hint={shape === "locality" ? "once there is a street to number" : undefined}
      >
        <TextField
          value={value.streetNumber ?? ""}
          onChange={v => set("streetNumber", v || null)}
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
          id="addr-street-1"
          inputAriaLabel="Street"
        />
      </Field>
      <Field
        label="Suburb"
        required
        hint={
          ambiguous
            ? `${value.suburb} sits in two councils — pick the right one below`
            : councilAvailable && value.council && value.council === autoFilled.current
              ? "council filled in from the LGA list"
              : undefined
        }
      >
        <SuburbField value={value.suburb} onType={onSuburb} onPick={onSuburbPicked} />
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
          id="addr-postcode"
          inputAriaLabel="Postcode"
          required
        />
      </Field>
      {councilAvailable && (
        <Field
          label="Council region"
          hint={
            ambiguous
              ? "this suburb spans two councils — the list cannot choose for you"
              : "filled in from the suburb where the list is unambiguous · all 68, A–Z"
          }
        >
          <Select
            aria-label="Council region"
            /* Sorted here rather than in SA_COUNCILS, which is kept in the order the
               LGA list publishes them — that constant is what the CHECK constraint is
               written against, and reordering it would invite somebody to assume the
               order means something. Sorting the options changes what a person reads
               and nothing else.

               `localeCompare` so "City of Adelaide" and "Adelaide Hills Council" land
               where somebody looking for either would expect, rather than every "City
               of…" collecting under C. */
            options={toOptions(
              [...SA_COUNCILS].sort((a, b) => councilSortKey(a).localeCompare(councilSortKey(b)))
            )}
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

/**
 * The team a new job starts with.
 *
 * This used to be null on purpose — *"a default would mean nobody ever chose"* — and
 * Lofty's answer is that the choice is not in doubt: every job starts in Acquisition &
 * Development, which is the team that owns the first lifecycle stage. So the default is
 * not a guess standing in for a decision, it is the decision, and leaving the field
 * empty made somebody restate it on every job.
 *
 * Still a picker, and still changeable before saving — a job that genuinely starts
 * elsewhere is one selection away.
 */
const FIRST_TEAM: TeamId = OPENING_TEAM;

const EMPTY_ADDRESS: NewAddress = {
  street1: "", suburb: "", state: "SA", postcode: "", council: null,
  lotNumber: null, streetNumber: null, street2: null
};

const filled = (v: string | null | undefined) => !!v?.trim();

/**
 * What a council sorts under.
 *
 * "City of Burnside" is looked for under B and "District Council of Ceduna" under C —
 * the leading form of address is not the name. Stripping it is what makes an A–Z list
 * findable rather than three long runs of "City of…", "District Council of…" and "The…".
 */
const COUNCIL_PREFIX = /^(the |city of |district council of |regional council of |town of |corporation of )/i;
const councilSortKey = (name: string) => name.replace(COUNCIL_PREFIX, "");

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
  /**
   * Called with the new project, its total, and the mix it was given — so the split
   * dialog can seed each row's title type without re-reading the project it was just
   * handed.
   */
  onSplit?: (
    projectId: number,
    dwellings: number,
    community: number | null,
    torrens: number | null
  ) => void;
}) {
  const repo = useRepository();
  const [address, setAddress] = useState<NewAddress>(EMPTY_ADDRESS);
  // The "Add another address" block — for legacy imports, where the address the site
  // was bought under is already out of date. Null while the block is closed; the first
  // address becomes the immutable original and this one the current address.
  const [newAddress, setNewAddress] = useState<NewAddress | null>(null);
  const [projectType, setProjectType] = useState<ProjectType | null>(null);
  // Two counts now, not one (Amber, 28 Aug). Both blank means "the count is not
  // settled"; the total below is their sum, and the database refuses a row where a
  // total and a split disagree.
  const [community, setCommunity] = useState("");
  const [torrens, setTorrens] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<number | null>(null);

  // Blank is a real answer — "we do not know yet" — and is not the same as zero. Parsed
  // once here so the button, the insert and the follow-on split all read one value.
  // Zero IS allowed on each kind, unlike the old single count: "six lots, none of them
  // community" is a sentence somebody means.
  const lotCount = (raw: string): number | null | typeof NaN =>
    raw.trim() === "" ? null
    : /^[0-9]+$/.test(raw.trim()) ? Number(raw.trim())
    : NaN;
  const communityCount = lotCount(community);
  const torrensCount = lotCount(torrens);
  const countOk = (n: number | null) => n === null || (Number.isInteger(n) && n >= 0);
  const dwellingsValid = countOk(communityCount as number | null) && countOk(torrensCount as number | null);
  // The total the split dialog will be offered, and the number written to
  // project_proposed_dwellings. Null only when neither kind was given at all.
  const dwellingCount =
    communityCount === null && torrensCount === null
      ? null
      : ((communityCount as number | null) ?? 0) + ((torrensCount as number | null) ?? 0);

  // The tail of the name, from whichever address the project will actually be at: the
  // "new address" block, when it is open, is the current one. Empty until there is a
  // suburb to show, because half a name is not a preview of anything.
  const named = newAddress ?? address;
  const nameTail = projectNameTail(
    named.suburb,
    [named.streetNumber, named.street1].filter(Boolean).join(" ")
  );

  // projectType is required by the database now, so the button waits for it rather than
  // letting the insert come back with a not-null violation.
  const valid = addressIsValid(address) && projectType !== null && dwellingsValid
    && (newAddress === null || addressIsValid(newAddress));

  const reset = () => {
    setAddress(EMPTY_ADDRESS);
    setNewAddress(null);
    setProjectType(null);
    setCommunity("");
    setTorrens("");
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
        newAddress,
        projectType: projectType!,
        communityTitleLots: communityCount as number | null,
        torrensTitleLots: torrensCount as number | null
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
          onClick: () => {
            const id = created;
            const mix = [communityCount as number | null, torrensCount as number | null] as const;
            reset();
            onClose();
            onSplit?.(id, dwellingCount, mix[0], mix[1]);
          },
          disabled: false }
      : { text: "Done", onClick: close, disabled: false }
    : { text: saving ? "Creating…" : "Create project", onClick: save, disabled: !valid || saving };

  const secondary = created
    ? dwellingCount ? { text: "Not now", onClick: close } : null
    : { text: "Cancel", onClick: close };

  return (
    <SidePanel
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
            {/* The name field has gone (Amber, 28 Aug: "hide in the setup project form
                the 'project name' field — project name is the Project number - SUBURB,
                street address"). It was a free-text box producing a different convention
                every time — "14 Brodie Road, Reynella", "Howard Street Windsor Gardens",
                "St Clair 2007 St Clair Ave" across six projects — for a value nothing
                displays. It is composed now, and the preview at the bottom shows what
                from. */}
            <Field label="Project type" required hint="jobs inherit this — they never set their own">
              <Select
                aria-label="Project type"
                options={PROJECT_TYPES.map(t => ({ value: t, label: PROJECT_TYPE_LABELS[t] }))}
                value={projectType}
                onChange={v => setProjectType(v as ProjectType)}
                placeholder="Select a type"
              />
            </Field>
            {/* Two counts, because they are two products (Amber, 28 Aug): "these are
                different types and the job will need to carry this information through
                to the job. so now where you set 6 lots, 3 may be community title, and 3
                may be torrens title and we need to know that split." The single
                "Proposed dwellings" box could not hold that, and the total it did hold
                is now the sum of these two. */}
            <Field
              label="Community title lots"
              hint="leave blank if the count is not settled"
            >
              <TextField
                value={community}
                onChange={setCommunity}
                id="project-community-lots"
                inputAriaLabel="Community title lots"
                validation={
                  countOk(communityCount as number | null)
                    ? undefined
                    : { status: "error", text: "A whole number, 0 or more." }
                }
              />
            </Field>
            <Field
              label="Torrens title lots"
              hint={
                dwellingCount != null
                  ? `${dwellingCount} lot${dwellingCount === 1 ? "" : "s"} in total`
                  : "leave blank if the count is not settled"
              }
            >
              <TextField
                value={torrens}
                onChange={setTorrens}
                id="project-torrens-lots"
                inputAriaLabel="Torrens title lots"
                validation={
                  countOk(torrensCount as number | null)
                    ? undefined
                    : { status: "error", text: "A whole number, 0 or more." }
                }
              />
            </Field>
            <AddressFields value={address} onChange={setAddress} />

            {/* Amber, 25 August: "on project creation the option to add another address
                adds in a secondary lot of address information which is labelled 'new
                address' which is the new current address." The first block above then
                becomes the immutable original — which is the whole point for a legacy
                import, where the purchase address is already out of date. */}
            {newAddress === null ? (
              <Button kind="tertiary" size="small" onClick={() => setNewAddress(EMPTY_ADDRESS)}>
                + Add another address
              </Button>
            ) : (
              <div className="new-address-block">
                <div className="panel-head">
                  <Text type="text2" weight="bold">New address</Text>
                  <Button kind="tertiary" size="small" onClick={() => setNewAddress(null)}>
                    Remove
                  </Button>
                </div>
                <Text type="text3" color="secondary" element="p" ellipsis={false}>
                  This becomes the current address. The one above is kept as the original
                  and cannot be changed later.
                </Text>
                <AddressFields value={newAddress} onChange={setNewAddress} />
              </div>
            )}

            {/* What this creates (G32). The number itself is the sequence's to give —
                previewing a guess would promise a number somebody else can take first —
                so the preview states the consequences, not the value. */}
            <div className="create-preview">
              <Text type="text3" color="secondary" ellipsis={false}>
                <strong>What this creates:</strong> a project on the next free number
                (1000-series), owned by Acquisition &amp; Development, opening in
                Acquisition &amp; Development phase with 0 jobs
                {dwellingCount
                  ? ` — you'll be offered its ${dwellingCount} job${dwellingCount === 1 ? "" : "s"} (numbered -01 up) straight after.`
                  : " — its first job will be numbered -01 when you split it."}
                {" "}A project with no jobs has no progress or health to show.
              </Text>
              {/* What it will be called, built from what has been typed so far. The number
                  is the sequence's to issue, so it is shown as a gap rather than a guess —
                  promising 1008 and delivering 1009 is worse than not promising. */}
              <Text type="text3" color="secondary" ellipsis={false}>
                <strong>Named automatically:</strong>{" "}
                {nameTail
                  ? <>&ldquo;<em>number</em> - {nameTail}&rdquo;</>
                  : "the number, then the suburb and street below."}
              </Text>
            </div>
          </div>
        )}
        {error && <Problem>{error}</Problem>}
      </>
    </SidePanel>
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
  const [owningTeam, setOwningTeam] = useState<TeamId | null>(FIRST_TEAM);
  const [ownAddress, setOwnAddress] = useState(false);
  const [address, setAddress] = useState<NewAddress>(EMPTY_ADDRESS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const valid = projectId !== null && owningTeam !== null
    && (!ownAddress || addressIsValid(address));

  const reset = () => {
    setProjectId(null);
    setOwningTeam(FIRST_TEAM);
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
    <SidePanel
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
    </SidePanel>
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
  suggestedCommunity,
  suggestedTorrens,
  nextLot,
  onCreated
}: {
  show: boolean;
  onClose: () => void;
  /** Null while no project is chosen — the dialog renders nothing. */
  projectId: number | null;
  /** Proposed dwellings, when the project has one. */
  suggestedCount?: number | null;
  /**
   * The project's intended mix (0053). Used to seed each row's title type — the first
   * N community, the rest Torrens — so the common case is already right and the odd one
   * is one dropdown away. Null means the project never said, and the rows start blank.
   */
  suggestedCommunity?: number | null;
  suggestedTorrens?: number | null;
  /** One past the highest lot number already used. */
  nextLot?: number;
  onCreated?: () => void;
}) {
  const repo = useRepository();
  const [count, setCount] = useState("");
  const [startLot, setStartLot] = useState("");
  const [owningTeam, setOwningTeam] = useState<TeamId | null>(FIRST_TEAM);
  /**
   * One row per job, so the details that differ per lot have somewhere to go.
   *
   * Lofty: 2A Launceston Ave becomes "lot 1, 2A Launceston" and "lot 2B, 2A Launceston",
   * and each job also carries the number it had in the old system. Neither fits a count
   * and a starting number — 2B is not 2, and an old job number is per job by definition.
   *
   * Seeded from the count so the common case is still "type 4 and go", and editable so
   * the uncommon one is possible at all.
   */
  const [lots, setLots] = useState<SplitLot[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string[] | null>(null);

  // Defaults arrive as props and the fields start blank, so seed them when the dialog
  // opens rather than on every render — otherwise typing over the default fights back.
  useEffect(() => {
    if (!show) return;
    setCount(suggestedCount ? String(suggestedCount) : "");
    setStartLot(String(nextLot ?? 1));
    setLots([]);
    setOwningTeam(FIRST_TEAM);
    setError(null);
    setCreated(null);
    setSaving(false);
  }, [show, projectId, suggestedCount, nextLot]);

  const whole = (v: string) => /^[0-9]+$/.test(v.trim()) && Number(v.trim()) >= 1;
  // Same ceiling the repository enforces, imported rather than retyped — two copies
  // of a limit drift, and the one people meet first should not be the looser one.
  const countValid = whole(count) && Number(count) <= MAX_SPLIT;
  const lotValid = whole(startLot);

  const n = Number(count);
  const first = Number(startLot);

  /**
   * The rows as they will be sent: the edited list once there is one, otherwise the
   * count and starting number generating "1, 2, 3…" exactly as before.
   *
   * Kept derived rather than written into state on every keystroke, so changing the
   * count still reflows the list and does not fight what has been typed into it.
   */
  /**
   * Which title type a generated row starts as: the project's community lots first,
   * then its Torrens ones, then blank once both are used up.
   *
   * A seed, not a rule — nothing says lot 1 is community, and the dropdown on each row
   * is there because that decision belongs to whoever is doing the split. Blank when
   * the project never gave a mix, because "community" would be a guess and this project
   * has been bitten by those.
   */
  const seedTitle = (i: number): TitleType | null => {
    const c = suggestedCommunity ?? 0;
    const t = suggestedTorrens ?? 0;
    if (c === 0 && t === 0) return null;
    if (i < c) return "community";
    if (i < c + t) return "torrens";
    return null;
  };

  const rows: SplitLot[] = lots.length
    ? lots
    : countValid && lotValid
      ? Array.from({ length: n }, (_, i) => ({
          lotNumber: String(first + i),
          jobNumberOld: "",
          titleType: seedTitle(i)
        }))
      : [];

  /**
   * Editing a row takes a copy of the derived list into state.
   *
   * From then on `rows` is that copy, so the list stops reflowing from the count and
   * keeps what was typed. Clearing it again is what the count field's own handler does.
   */
  const editRow = (index: number, patch: Partial<SplitLot>) =>
    setLots(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const duplicateLot = rows.find((l, i) => rows.findIndex(o => o.lotNumber.trim() === l.lotNumber.trim()) !== i);
  const blankLot = rows.some(l => !l.lotNumber.trim());
  /** The Create button waits on the rows too, or a duplicate lot fails at the insert. */
  const canCreate = countValid && lotValid && owningTeam !== null
    && rows.length > 0 && !duplicateLot && !blankLot;

  async function save() {
    if (!projectId || !owningTeam) return;
    setSaving(true);
    setError(null);
    try {
      const jobs = await repo.createJobsFromSplit({
        projectId,
        count: n,
        owningTeam,
        startLot: first,
        // The list as edited. The repository takes its length as the count and its
        // order as the order.
        lots: rows
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
    <SidePanel
      open={show}
      title={`Create jobs on project ${projectId}`}
      onClose={onClose}
      footer={
        created
          ? <Button onClick={onClose}>Done</Button>
          : (
            <>
              <Button kind="tertiary" onClick={onClose}>Cancel</Button>
              <Button onClick={save} disabled={!canCreate || saving}>
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
                onChange={v => { setCount(v); setLots([]); }}
                id="split-count"
                inputAriaLabel="How many jobs"
                validation={
                  count === "" || countValid
                    ? undefined
                    : { status: "error", text: `A whole number between 1 and ${MAX_SPLIT}.` }
                }
              />
            </Field>

            <Field label="First lot number" hint="the rest count up from here — edit any of them below">
              <TextField
                value={startLot}
                onChange={v => { setStartLot(v); setLots([]); }}
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

            {rows.length > 0 && (
              <div className="split-rows">
                <div className="split-rows-head">
                  <Text type="text2" weight="bold">
                    {rows.length} job{rows.length === 1 ? "" : "s"}, each at the project's address
                  </Text>
                  <Text type="text3" color="secondary" ellipsis={false}>
                    A lot number can be anything on the plan — 2B as readily as 2. The old
                    job number is the one this job has in SiteBook or Trello; leave it
                    blank for a job that is new here. Job numbers themselves are issued by
                    the database, continuing from any that already exist. Title type is
                    seeded from the project's mix — check it per lot, since nothing says
                    which lots take which title.
                  </Text>
                </div>
                <div className="split-row split-row-head" aria-hidden="true">
                  <span>Lot</span><span>Old job number</span><span>Title</span>
                </div>
                {rows.map((row, i) => (
                  <div className="split-row" key={i}>
                    <TextField
                      value={row.lotNumber}
                      onChange={v => editRow(i, { lotNumber: v })}
                      size="small"
                      id={`split-lot-${i}`}
                      inputAriaLabel={`Lot number for job ${i + 1}`}
                      validation={
                        !row.lotNumber.trim()
                          ? { status: "error", text: "Needed" }
                          : duplicateLot && duplicateLot.lotNumber.trim() === row.lotNumber.trim()
                            ? { status: "error", text: "Listed twice" }
                            : undefined
                      }
                    />
                    <TextField
                      value={row.jobNumberOld ?? ""}
                      onChange={v => editRow(i, { jobNumberOld: v })}
                      size="small"
                      id={`split-old-${i}`}
                      inputAriaLabel={`Old job number for job ${i + 1}`}
                    />
                    {/* Clearable: "not decided yet" is a real state, and a job that
                        carries the wrong title type is worse than one that carries
                        none. */}
                    <Select
                      options={TITLE_TYPES.map(t => ({ value: t, label: TITLE_TYPE_LABELS[t] }))}
                      value={row.titleType ?? null}
                      clearable
                      onChange={v => editRow(i, { titleType: (v as TitleType | null) ?? null })}
                      aria-label={`Title type for job ${i + 1}`}
                      placeholder="—"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {error && <Problem>{error}</Problem>}
      </>
    </SidePanel>
  );
}
