import { useState } from "react";
import { Button, Text, TextField, Toggle } from "@vibe/core";
import { MultiSelect, Select, toOptions } from "./Select";
import { useRepository } from "../data/DataProvider";
import { useUndo } from "../data/UndoProvider";
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
  onOpen,
  onFullEdit,
  onDeactivate,
  onToggleDemo,
  canEdit,
  selected,
  onToggleSelect
}: {
  profile: Profile;
  editing: boolean;
  onEdit: () => void;
  /** Called after a successful save, and on cancel with `false`. */
  onDone: (saved: boolean) => void;
  onActivity: () => void;
  /** The name was clicked: open the person — their details and actions in the panel. */
  onOpen: () => void;
  onFullEdit: () => void;
  /** Asked for a change of status. Deactivating confirms first; restoring is immediate. */
  onDeactivate: () => void;
  onToggleDemo?: () => void;
  canEdit: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  return editing
    ? <EditingRow profile={profile} onDone={onDone} onFullEdit={onFullEdit} selectable={Boolean(onToggleSelect)} />
    : (
      <ReadingRow
        profile={profile}
        onEdit={onEdit}
        onActivity={onActivity}
        onOpen={onOpen}
        onDeactivate={onDeactivate}
        onToggleDemo={onToggleDemo}
        canEdit={canEdit}
        selected={selected}
        onToggleSelect={onToggleSelect}
      />
    );
}

function ReadingRow({
  profile: p, onEdit, onActivity, onOpen, onDeactivate, onToggleDemo, canEdit, selected, onToggleSelect
}: {
  profile: Profile;
  onEdit: () => void;
  onActivity: () => void;
  onOpen: () => void;
  onDeactivate: () => void;
  /** Ticked = held at the gate (0049). Same asymmetry: restricting confirms, releasing does not. */
  onToggleDemo?: () => void;
  canEdit: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const { labels } = useTeamLabels();
  const st = profileStatus(p);
  // Null until the lookup can answer — see useTeamLabels. Rendering the slug in the
  // meantime is what put `lofty_general` in this column in the first place.
  const teams = labels(p.teams);

  return (
    <tr>
      {onToggleSelect && (
        <td>
          <input
            type="checkbox"
            checked={Boolean(selected)}
            onChange={onToggleSelect}
            aria-label={`Select ${p.fullName}`}
          />
        </td>
      )}
      <td>
        {/* The name opens the person — details, and the actions beside them (Amber,
            7 Sep: "when you click on the name it should open the side panel with
            settings and actions"). It opened their activity before; that is one of the
            actions now, a button inside the panel, and still one click from here. */}
        <button type="button" className="link-button" onClick={onOpen}>{p.fullName}</button>
      </td>
      <td className="muted">{p.jobTitle ?? "—"}</td>
      <td className="muted">{p.email}</td>
      {/* Names, not slugs. `profiles.teams` holds foreign keys — `lofty_general` — and
          rendering them raw is what put "lofty_general" on the dashboard greeting.
          Three states: no memberships is an em dash, resolved names are the names, and
          a lookup that has not landed is blank rather than a column of foreign keys. */}
      <td>{!p.teams.length ? "—" : teams ? teams.join(", ") : ""}</td>
      <td>{p.permission}</td>
      {/* The status IS the control now (Amber, 27 Aug). A pill beside a button that
          said "Deactivate" made you read two things to learn one fact; the toggle
          shows the state and changes it in the same place.

          Deactivating still confirms — it is the act that takes somebody's access
          away, and a mis-click on a row of forty-five people is exactly what the
          dialog is for. Restoring applies straight away: giving access back is
          undoable by the same switch. */}
      <td>
        <span className="status-toggle">
          {/* Blank override text: Vibe writes "Off"/"On" either side by default, and
              the pill next to it already names the state — three words for one fact. */}
          <Toggle
            isSelected={p.active}
            onChange={onDeactivate}
            disabled={!canEdit}
            size="small"
            onOverrideText=""
            offOverrideText=""
            aria-label={p.active ? `Deactivate ${p.fullName}` : `Restore ${p.fullName}`}
          />
          <span className={`status-pill is-${st}`}>{st}</span>
        </span>
      </td>
      {/* Demo: a separate fact from active, because it answers a different question —
          not "is this person still here" but "may they walk the app on their own yet".
          Ticked reads as held, not broken. */}
      <td>
        <span className="status-toggle">
          <Toggle
            isSelected={p.isDemo}
            onChange={() => onToggleDemo?.()}
            disabled={!canEdit || !onToggleDemo}
            size="small"
            onOverrideText=""
            offOverrideText=""
            aria-label={p.isDemo ? `Let ${p.fullName} into the app` : `Hold ${p.fullName} at the gate`}
          />
          {p.isDemo && <span className="status-pill is-pending">held</span>}
        </span>
      </td>
      {/* "Never" and "not yet" are different facts: never signed in versus signed in
          before this column existed. Only the first can happen now. */}
      <td className="muted">{p.lastLoginAt ? new Date(p.lastLoginAt).toLocaleDateString() : "Never"}</td>
      <td>
        <span className="row-actions">
          <Button size="xs" kind="tertiary" onClick={onEdit} disabled={!canEdit}>Edit</Button>
          <Button size="xs" kind="tertiary" onClick={onActivity}>Activity</Button>
        </span>
      </td>
    </tr>
  );
}

function EditingRow({
  profile: p, onDone, onFullEdit, selectable
}: {
  profile: Profile;
  onDone: (saved: boolean) => void;
  onFullEdit: () => void;
  /** A blank leading cell, so an editing row keeps the columns aligned with its neighbours. */
  selectable?: boolean;
}) {
  const repo = useRepository();
  const { record } = useUndo();
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
      // The inverse is the same patch with the values the row had — every key in `patch`
      // has a "before" on `p`, so undo writes exactly the columns this write did.
      const before: Partial<NewProfile> = {};
      (Object.keys(patch) as (keyof NewProfile)[]).forEach(k => {
        (before as Record<string, unknown>)[k] = p[k as keyof Profile];
      });
      record({
        label: `Edited ${p.fullName}`,
        undo: async () => { await repo.updateProfile(p.id, before); },
        redo: async () => { await repo.updateProfile(p.id, patch); }
      });
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
        {selectable && <td />}
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
        {/* Derived, not set. Left as it reads so the row keeps its columns — the
            status toggle lives on the reading row, not mid-edit. */}
        <td><span className={`status-pill is-${st}`}>{st}</span></td>
        <td />
        <td className="muted">{p.lastLoginAt ? new Date(p.lastLoginAt).toLocaleDateString() : "Never"}</td>
        <td />
      </tr>
      {/* Save and Cancel sit HERE, in the row that spans the table, not in the actions
          column. Six controls across an editing row are wider than most windows, so the
          table scrolls sideways and the last column — where Save was — is off the right
          edge: "the row is cut off and you can't edit or save it" (Amber, 7 Sep). This
          row starts at the left edge whatever the scroll, so the buttons are always in
          view. */}
      <tr className="is-editing">
        <td colSpan={selectable ? 10 : 9}>
          {error && <div className="create-problem row-editing-problem" role="alert">{error}</div>}
          <div className="row-editing-foot">
            <span className="row-actions">
              <Button size="small" onClick={save} disabled={!valid || saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button size="small" kind="tertiary" onClick={() => onDone(false)} disabled={saving}>
                Cancel
              </Button>
            </span>
            <Text type="text3" color="secondary" ellipsis={false}>
              Editing the columns you can see.{" "}
              <button type="button" className="link-button" onClick={onFullEdit}>
                Open the full form
              </button>{" "}
              for the Microsoft sign-in address, which is what their login is matched on.
            </Text>
          </div>
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
