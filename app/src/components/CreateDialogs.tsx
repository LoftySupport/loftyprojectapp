import { useState, type ReactNode } from "react";
import {
  Button, Modal, ModalContent, ModalFooter, ModalHeader, Text, TextField
} from "@vibe/core";
import { Select, toOptions } from "./Select";
import { useRepository } from "../data/DataProvider";
import {
  AU_STATES, PROJECT_TYPE_LABELS, PROJECT_TYPES, SA_COUNCILS,
  type NewAddress, type ProjectType, type SaCouncil
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
      <Field label="Street number">
        <TextField
          value={value.streetNumber ?? ""}
          onChange={v => set("streetNumber", v || null)}
          placeholder="42"
          id="addr-street-number"
          inputAriaLabel="Street number"
        />
      </Field>
      <Field label="Street" required>
        <TextField
          value={value.street1}
          onChange={v => set("street1", v)}
          placeholder="Ironbark Road"
          id="addr-street-1"
          inputAriaLabel="Street"
          required
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

const EMPTY_ADDRESS: NewAddress = {
  street1: "", suburb: "", state: "SA", postcode: "", council: null,
  lotNumber: null, streetNumber: null, street2: null
};

/**
 * The same four rules the `addresses` table enforces, checked here so the Create button
 * greys out instead of the insert coming back with a constraint name.
 *
 * Kept beside the fields rather than inside the repository because it is a statement
 * about this form: what the person still has to fill in. The database remains the one
 * that decides — this only saves them a round trip.
 */
const addressIsValid = (a: NewAddress): boolean =>
  a.street1.trim() !== "" &&
  a.suburb.trim() !== "" &&
  // addresses_postcode_shape: four digits, and text, because 0800 is Darwin.
  /^[0-9]{4}$/.test(a.postcode.trim()) &&
  // addresses_has_a_number: a subdivided site is "Lot 3" long before it is "28", so
  // either one will do — but not neither.
  (!!a.lotNumber?.trim() || !!a.streetNumber?.trim()) &&
  // addresses_council_required_in_sa: an SA address must name its council. Interstate
  // addresses cannot carry one at all, which is why this is conditional.
  ((a.state ?? "SA") !== "SA" || a.council !== null);

export function NewProjectDialog({
  show,
  onClose,
  onCreated
}: {
  show: boolean;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const repo = useRepository();
  const [address, setAddress] = useState<NewAddress>(EMPTY_ADDRESS);
  const [projectType, setProjectType] = useState<ProjectType | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const valid = addressIsValid(address);

  const reset = () => {
    setAddress(EMPTY_ADDRESS);
    setProjectType(null);
    setError(null);
    setCreated(null);
    setSaving(false);
  };

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const project = await repo.createProject({ address, projectType });
      // The project number is the thing the person came for — it is what they will
      // quote on the phone — and it does not exist until the sequence issues it.
      setCreated(String(project.projectNo));
      onCreated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal show={show} onClose={() => { reset(); onClose(); }} id="new-project">
      <ModalHeader title="New project" />
      <ModalContent>
        {created ? (
          <Result>
            Project <strong>{created}</strong> created.
          </Result>
        ) : (
          <div className="create-form">
            <Field label="Project type" hint="jobs inherit this — they never set their own">
              <Select
                aria-label="Project type"
                options={PROJECT_TYPES.map(t => ({ value: t, label: PROJECT_TYPE_LABELS[t] }))}
                value={projectType}
                onChange={v => setProjectType(v as ProjectType)}
                placeholder="Select a type"
              />
            </Field>
            <AddressFields value={address} onChange={setAddress} />
          </div>
        )}
        {error && <Problem>{error}</Problem>}
      </ModalContent>
      <ModalFooter
        primaryButton={
          created
            ? { text: "Done", onClick: () => { reset(); onClose(); } }
            : { text: saving ? "Creating…" : "Create project", onClick: save, disabled: !valid || saving }
        }
        secondaryButton={created ? undefined : { text: "Cancel", onClick: () => { reset(); onClose(); } }}
      />
    </Modal>
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
  const [ownAddress, setOwnAddress] = useState(false);
  const [address, setAddress] = useState<NewAddress>(EMPTY_ADDRESS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const valid = projectId !== null && (!ownAddress || addressIsValid(address));

  const reset = () => {
    setProjectId(null);
    setOwnAddress(false);
    setAddress(EMPTY_ADDRESS);
    setError(null);
    setCreated(null);
    setSaving(false);
  };

  async function save() {
    if (!projectId) return;
    setSaving(true);
    setError(null);
    try {
      const job = await repo.createJob({
        projectId,
        address: ownAddress ? address : undefined
      });
      setCreated(job.jobNumber);
      onCreated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal show={show} onClose={() => { reset(); onClose(); }} id="new-job">
      <ModalHeader title="New job" />
      <ModalContent>
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
      </ModalContent>
      <ModalFooter
        primaryButton={
          created
            ? { text: "Done", onClick: () => { reset(); onClose(); } }
            : { text: saving ? "Creating…" : "Create job", onClick: save, disabled: !valid || saving }
        }
        secondaryButton={created ? undefined : { text: "Cancel", onClick: () => { reset(); onClose(); } }}
      />
    </Modal>
  );
}

// ------------------------------------------------------------------ bits

function Field({
  label, hint, required, children
}: {
  label: string; hint?: string; required?: boolean; children: ReactNode;
}) {
  return (
    <div className="field-row">
      <div className="field-label">
        <Text type="text2">
          {label}{required && <span className="field-required" aria-hidden="true"> *</span>}
        </Text>
        {hint && <div className="field-hint">{hint}</div>}
      </div>
      <div className="field-control">{children}</div>
    </div>
  );
}

/**
 * The error is shown verbatim rather than replaced with "Something went wrong".
 * Postgres messages here are the ones worth reading — a permission denied from RLS, a
 * check constraint naming itself — and hiding them would mean the person cannot tell a
 * missing field from a missing permission.
 */
function Problem({ children }: { children: ReactNode }) {
  return (
    <div className="create-problem" role="alert">
      <Text type="text2">{children}</Text>
    </div>
  );
}

function Result({ children }: { children: ReactNode }) {
  return (
    <div className="create-result" role="status">
      <Text type="text1">{children}</Text>
    </div>
  );
}
