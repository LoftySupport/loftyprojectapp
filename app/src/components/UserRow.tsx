import { useState } from "react";
import { Button, Text, TextField } from "@vibe/core";
import { MultiSelect, Select, toOptions } from "./Select";
import { useRepository } from "../data/DataProvider";
import { useTeamLabels, useTeams } from "../data/useLookups";
import {
  PERMISSION_LEVELS, profileStatus,
  type NewProfile, type PermissionLevel, type Profile, type TeamId
} from "../data/types";
import "./ui.css";

/**
 * A person, as a table row — read, and edited in place.
 *
 * WHY THERE IS AN INLINE EDITOR AS WELL AS A PANEL
 *
 *   The same reason there is an inline new-project row as well as a create panel, and
 *   Lofty asked for it in the same words: *"both. they can add either way."* Correcting
 *   four job titles meant opening, editing, saving and closing a dialog four times, each
 *   one hiding the list that told you which four.
 *
 * WHAT IT DELIBERATELY DOES NOT COVER
 *
 *   Exactly the columns the table shows, and no more. `login_email` is the field a
 *   Microsoft account is matched on and there is no column for it here, so it is not
 *   silently editable from a row — it stays in the panel, under the hint that explains
 *   what it is for. An editor that quietly reached one field further than the table
 *   displays would be the worst kind: invisible until it has changed something.
 *
 *   Status and last sign-in are not editable at all, in either place. Both are facts
 *   about what has happened rather than settings — `profileStatus` is derived from
 *   `active` and whether an auth id has ever appeared — and a box around them would
 *   invite somebody to try.
 *
 * Only the changed fields are sent. `updateProfile` takes a `Partial<NewProfile>`, so a
 * row where one job title was corrected writes one column, and two people editing
 * different fields of the same person do not overwrite each other's work.
 */
export function UserRow({
  profile,
  editing,
  onEdit,
  onDone,
  onActivity,
  onFullEdit,
  onDeactivate,
  canEdit
}: {
  profile: Profile;
  editing: boolean;
  onEdit: () => void;
  /** Called after a successful save, and on cancel with `false`. */
  onDone: (saved: boolean) => void;
  onActivity: () => void;
  onFullEdit: () => void;
  onDeactivate: () => void;
  canEdit: boolean;
}) {
  return editing
    ? <EditingRow profile={profile} onDone={onDone} onFullEdit={onFullEdit} />
    : (
      <ReadingRow
        profile={profile}
        onEdit={onEdit}
        onActivity={onActivity}
        onDeactivate={onDeactivate}
        canEdit={canEdit}
      />
    );
}

function ReadingRow({
  profile: p, onEdit, onActivity, onDeactivate, canEdit
}: {
  profile: Profile;
  onEdit: () => void;
  onActivity: () => void;
  onDeactivate: () => void;
  canEdit: boolean;
}) {
  const { labels } = useTeamLabels();
  const st = profileStatus(p);
  const teams = labels(p.teams);

  return (
    <tr>
      <td>
        {/* The name is the way in to their history, which is the thing somebody is
            usually after when they look a person up. */}
        <button type="button" className="link-button" onClick={onActivity}>{p.fullName}</button>
      </td>
      <td className="muted">{p.jobTitle ?? "—"}</td>
      <td className="muted">{p.email}</td>
      {/* Names, not slugs. `profiles.teams` holds foreign keys — `lofty_general` — and
          rendering them raw is what put "lofty_general" on the dashboard greeting. */}
      <td>{teams.length ? teams.join(", ") : "—"}</td>
      <td>{p.permission}</td>
      <td><span className={`status-pill is-${st}`}>{st}</span></td>
      {/* "Never" and "not yet" are different facts: never signed in versus signed in
          before this column existed. Only the first can happen now. */}
      <td className="muted">{p.lastLoginAt ? new Date(p.lastLoginAt).toLocaleDateString() : "Never"}</td>
      <td>
        <span className="row-actions">
          <Button size="xs" kind="tertiary" onClick={onEdit} disabled={!canEdit}>Edit</Button>
          <Button size="xs" kind="tertiary" onClick={onDeactivate} disabled={!canEdit}>
            {p.active ? "Deactivate" : "Restore"}
          </Button>
        </span>
      </td>
    </tr>
  );
}

function EditingRow({
  profile: p, onDone, onFullEdit
}: {
  profile: Profile;
  onDone: (saved: boolean) => void;
  onFullEdit: () => void;
}) {
  const repo = useRepository();
  const { teams } = useTeams();
  const active = teams.filter(t => t.isActive);

  const [firstName, setFirstName] = useState(p.firstName);
  const [lastName, setLastName] = useState(p.lastName);
  const [jobTitle, setJobTitle] = useState(p.jobTitle ?? "");
  const [email, setEmail] = useState(p.email);
  const [permission, setPermission] = useState<PermissionLevel>(p.permission);
  const [teamIds, setTeamIds] = useState<TeamId[]>(p.teams);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const st = profileStatus(p);
  const valid = firstName.trim() !== "" && lastName.trim() !== "" && email.trim() !== "";

  async function save() {
    // Only what actually moved. A row that was opened and closed again sends nothing,
    // rather than an UPDATE that touches every column and stamps the audit quartet.
    const patch: Partial<NewProfile> = {};
    if (firstName.trim() !== p.firstName) patch.firstName = firstName.trim();
    if (lastName.trim() !== p.lastName) patch.lastName = lastName.trim();
    if (email.trim() !== p.email) patch.email = email.trim();
    if ((jobTitle.trim() || null) !== p.jobTitle) patch.jobTitle = jobTitle.trim() || null;
    if (permission !== p.permission) patch.permission = permission;
    if (!sameSet(teamIds, p.teams)) patch.teams = teamIds;

    if (Object.keys(patch).length === 0) {
      onDone(false);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await repo.updateProfile(p.id, patch);
      onDone(true);
    } catch (e) {
      // Verbatim, for the reason every other form in this app shows it verbatim: an RLS
      // refusal and a failed check constraint need to look different from each other.
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <tr className="is-editing">
        <td>
          <div className="cell-pair">
            <TextField value={firstName} onChange={setFirstName} size="small"
              id={`edit-first-${p.id}`} inputAriaLabel="First name" placeholder="First" />
            <TextField value={lastName} onChange={setLastName} size="small"
              id={`edit-last-${p.id}`} inputAriaLabel="Last name" placeholder="Last" />
          </div>
        </td>
        <td>
          <TextField value={jobTitle} onChange={setJobTitle} size="small" className="cell-edit"
            id={`edit-title-${p.id}`} inputAriaLabel="Job title" placeholder="Job title" />
        </td>
        <td>
          <TextField value={email} onChange={setEmail} size="small" className="cell-edit-wide"
            id={`edit-email-${p.id}`} inputAriaLabel="Email" placeholder="name@lofty.com.au" />
        </td>
        <td>
          <MultiSelect
            aria-label="Teams"
            className="cell-edit-wide"
            options={active.map(t => ({ value: t.id, label: t.name }))}
            value={teamIds}
            onChange={t => setTeamIds(t as TeamId[])}
            placeholder={active.length ? "Select teams" : "Loading teams…"}
          />
        </td>
        <td>
          <Select
            aria-label="Permission"
            className="cell-edit"
            options={toOptions([...PERMISSION_LEVELS])}
            value={permission}
            onChange={v => setPermission(v as PermissionLevel)}
          />
        </td>
        {/* Derived, not set. Left as it reads so the row keeps its columns. */}
        <td><span className={`status-pill is-${st}`}>{st}</span></td>
        <td className="muted">{p.lastLoginAt ? new Date(p.lastLoginAt).toLocaleDateString() : "Never"}</td>
        <td>
          <span className="row-actions">
            <Button size="xs" onClick={save} disabled={!valid || saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button size="xs" kind="tertiary" onClick={() => onDone(false)} disabled={saving}>
              Cancel
            </Button>
          </span>
        </td>
      </tr>
      <tr className="is-editing">
        <td colSpan={8}>
          {error && <div className="create-problem row-editing-problem" role="alert">{error}</div>}
          <Text type="text3" color="secondary" ellipsis={false}>
            Editing the columns you can see.{" "}
            <button type="button" className="link-button" onClick={onFullEdit}>
              Open the full form
            </button>{" "}
            for the Microsoft sign-in address, which is what their login is matched on.
          </Text>
        </td>
      </tr>
    </>
  );
}

/**
 * Membership is a set, so a reorder is not a change.
 *
 * Worth comparing properly rather than with `join(",")`: 0022 made `profiles.teams` a
 * normalised set that the database sorts into its own order on every write, so the
 * array coming back is not necessarily in the order the picker sent it.
 */
function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const seen = new Set(a);
  return b.every(v => seen.has(v));
}
