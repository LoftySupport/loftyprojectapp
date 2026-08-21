import { useEffect, useState, type ReactNode } from "react";
import { Modal, ModalContent, ModalFooter, ModalHeader, Text, TextField } from "@vibe/core";
import { MultiSelect, Select, toOptions } from "./Select";
import { useRepository } from "../data/DataProvider";
import {
  PERMISSION_LEVELS, TEAM_SEED,
  type ActivityEntry, type NewProfile, type PermissionLevel, type Profile, type TeamId
} from "../data/types";
import "./ui.css";

/**
 * Add, edit, deactivate and inspect a person.
 *
 * The shape of these forms is decided by the fact that Lofty's staff list exists before
 * anyone signs in. There is no password field and no invitation to send: adding somebody
 * creates the row they will be *linked to* the first time they authenticate with
 * Microsoft. `login_email` is the field that link is made on, which is why it is asked
 * for here and explained rather than left to look like a duplicate of the email above it.
 */

function Field({
  label, hint, required, children
}: { label: string; hint?: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="create-field">
      <span className="create-label">
        {label}{required && <span aria-hidden="true"> *</span>}
        {hint && <span className="create-hint"> — {hint}</span>}
      </span>
      {children}
    </label>
  );
}

const Problem = ({ children }: { children: ReactNode }) => (
  <div className="create-problem" role="alert">
    <Text type="text2" element="span" ellipsis={false}>{children}</Text>
  </div>
);

const EMPTY: NewProfile = {
  firstName: "", lastName: "", email: "",
  loginEmail: null, jobTitle: null, permission: "viewer", teams: []
};

/** Create when `profile` is null, edit when it is not. One form, because it is one form. */
export function UserDialog({
  show, profile, onClose, onSaved
}: {
  show: boolean;
  profile: Profile | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const repo = useRepository();
  const [form, setForm] = useState<NewProfile>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed whenever the dialog opens on a different person, or the previous person's
  // details would show under the new one's name.
  useEffect(() => {
    if (!show) return;
    setError(null);
    setForm(profile
      ? {
          firstName: profile.firstName, lastName: profile.lastName, email: profile.email,
          loginEmail: profile.loginEmail, jobTitle: profile.jobTitle,
          permission: profile.permission, teams: profile.teams
        }
      : EMPTY);
  }, [show, profile]);

  const set = <K extends keyof NewProfile>(k: K, v: NewProfile[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const valid =
    form.firstName.trim() !== "" && form.lastName.trim() !== "" && form.email.trim() !== "";

  async function save() {
    setSaving(true);
    setError(null);
    try {
      if (profile) await repo.updateProfile(profile.id, form);
      else await repo.createProfile(form);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal show={show} onClose={onClose} id="user-dialog">
      <ModalHeader title={profile ? `Edit ${profile.fullName}` : "Add user"} />
      <ModalContent>
        <div className="create-form">
          <Field label="First name" required>
            <TextField id="user-first" inputAriaLabel="First name"
              value={form.firstName} onChange={v => set("firstName", v)} />
          </Field>
          <Field label="Last name" required>
            <TextField id="user-last" inputAriaLabel="Last name"
              value={form.lastName} onChange={v => set("lastName", v)} />
          </Field>
          <Field label="Email" required hint="their real address — what the app shows">
            <TextField id="user-email" inputAriaLabel="Email" placeholder="name@lofty.com.au"
              value={form.email} onChange={v => set("email", v)} />
          </Field>
          <Field
            label="Microsoft sign-in address"
            hint="how their login is matched — usually @loftybg.onmicrosoft.com"
          >
            <TextField id="user-login-email" inputAriaLabel="Microsoft sign-in address"
              placeholder="name@loftybg.onmicrosoft.com"
              value={form.loginEmail ?? ""} onChange={v => set("loginEmail", v || null)} />
          </Field>
          <Field label="Job title">
            <TextField id="user-job-title" inputAriaLabel="Job title"
              value={form.jobTitle ?? ""} onChange={v => set("jobTitle", v || null)} />
          </Field>
          <Field label="Permission" hint="viewer reads; superadmin manages everything">
            <Select
              aria-label="Permission"
              options={toOptions([...PERMISSION_LEVELS])}
              value={form.permission}
              onChange={v => set("permission", v as PermissionLevel)}
            />
          </Field>
          <Field label="Teams" hint="the first is their primary — add as many as apply">
            <TeamPicker value={form.teams} onChange={t => set("teams", t)} />
          </Field>
        </div>
        {error && <Problem>{error}</Problem>}
        {!profile && (
          <Text type="text3" color="secondary" ellipsis={false}>
            No password and no invitation: this creates the record their Microsoft account
            links to the first time they sign in.
          </Text>
        )}
      </ModalContent>
      <ModalFooter
        primaryButton={{
          text: saving ? "Saving…" : profile ? "Save changes" : "Add user",
          onClick: save,
          disabled: !valid || saving
        }}
        secondaryButton={{ text: "Cancel", onClick: onClose }}
      />
    </Modal>
  );
}

/**
 * Membership is a set, and now the control says so: one multi-select over the `team`
 * enum, rather than a single-select that appended to a list of chips beside it.
 *
 * The options are TEAM_SEED, which is the enum transcribed — all fifteen values, including
 * the four 0014 added. The old control could reach them too; what it could not do was
 * show you what you had and what you could add in the same place.
 *
 * The "(primary)" label on the first chip is gone, and its removal is the point rather
 * than tidying. 0022 dropped `is_primary` and made `profiles.teams` a normalised set —
 * the database sorts it into enum order on every write. So the first team you picked
 * was not the first one stored, and a label claiming otherwise was telling you something
 * the schema had stopped being able to honour.
 */
/**
 * Shows team names, stores team slugs.
 *
 * The two were the same string while teams were an enum. They are not any more: the
 * label is renameable and the slug is a foreign key, which is the whole reason the list
 * became a table. So the option's value and its label come from different fields, and
 * retired teams are filtered out — they are still valid for the rows that already
 * reference them, just not offerable to anyone new.
 */
function TeamPicker({ value, onChange }: { value: TeamId[]; onChange: (t: TeamId[]) => void }) {
  return (
    <MultiSelect
      aria-label="Teams"
      options={TEAM_SEED.filter(t => t.isActive).map(t => ({ value: t.id, label: t.name }))}
      value={value}
      onChange={t => onChange(t as TeamId[])}
      placeholder="Select teams"
    />
  );
}

/**
 * Deactivation, asked for plainly.
 *
 * The button says "Deactivate" and not "Delete" because that is what happens: `profiles`
 * has no DELETE policy, deliberately, since a name sits on years of activity. The dialog
 * says so rather than letting someone believe they erased a person.
 */
export function DeactivateDialog({
  show, profile, onClose, onSaved
}: {
  show: boolean;
  profile: Profile | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const repo = useRepository();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const restoring = profile ? !profile.active : false;

  async function go() {
    if (!profile) return;
    setSaving(true);
    setError(null);
    try {
      await repo.setProfileActive(profile.id, restoring);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal show={show} onClose={onClose} id="deactivate-user">
      <ModalHeader title={restoring ? `Restore ${profile?.fullName}` : `Deactivate ${profile?.fullName}`} />
      <ModalContent>
        <Text type="text2" element="p" ellipsis={false}>
          {restoring
            ? "They will be able to sign in and read again immediately."
            : "They lose access straight away — every read is gated on being active. Their record, their history and their name on past work all stay."}
        </Text>
        <Text type="text3" color="secondary" ellipsis={false}>
          Nobody is ever deleted outright: a person's name is on years of activity and
          comments, and removing the row would orphan all of it.
        </Text>
        {error && <Problem>{error}</Problem>}
      </ModalContent>
      <ModalFooter
        primaryButton={{
          text: saving ? "Saving…" : restoring ? "Restore" : "Deactivate",
          onClick: go,
          disabled: saving
        }}
        secondaryButton={{ text: "Cancel", onClick: onClose }}
      />
    </Modal>
  );
}

/** One person's or one team's history, newest first. */
export function ActivityDialog({
  show, title, profileId, team, onClose
}: {
  show: boolean;
  title: string;
  profileId?: string;
  team?: string;
  onClose: () => void;
}) {
  const repo = useRepository();
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    setEntries(null);
    setError(null);
    repo.listActivity({ profileId, team })
      .then(e => { if (!cancelled) setEntries(e); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [repo, show, profileId, team]);

  return (
    <Modal show={show} onClose={onClose} id="activity">
      <ModalHeader title={`Activity — ${title}`} />
      <ModalContent>
        {error && <Problem>{error}</Problem>}
        {!error && entries === null && <Text type="text2" color="secondary">Loading…</Text>}
        {entries !== null && entries.length === 0 && (
          /* Two very different reasons for an empty list, and the difference matters:
             somebody who has never signed in has no auth id to attribute anything to. */
          <Text type="text2" color="secondary" ellipsis={false}>
            Nothing recorded yet. Activity is attributed to a Microsoft account, so
            somebody who has not signed in has none by definition.
          </Text>
        )}
        {entries !== null && entries.length > 0 && (
          <ul className="activity-list">
            {entries.map(e => (
              <li key={e.id}>
                <span className={`activity-kind is-${e.kind}`}>{e.kind === "login" ? "Sign-in" : "Change"}</span>
                <span className="activity-summary">{e.summary}</span>
                <time dateTime={e.at}>{new Date(e.at).toLocaleString()}</time>
              </li>
            ))}
          </ul>
        )}
      </ModalContent>
      <ModalFooter primaryButton={{ text: "Close", onClick: onClose }} />
    </Modal>
  );
}
