import { useState, type KeyboardEvent } from "react";
import { TextField } from "@vibe/core";
import { Select } from "./Select";
import "./processes.css";

/**
 * Which block inside a stage a process runs in — picked from the ones that exist, or
 * named for the first time.
 *
 * Amber, 3 September: *"when adding a new process or sorting/filtering the group/pipeline
 * needs to be filterable and sortable so when a drop down so when adding a process to a
 * group it can selected from that pipelien added into that pipeline"*.
 *
 * WHY A PICKER RATHER THAN A BOX
 *
 *   This was free text in the drawer and ABSENT from the create panel — so a new process
 *   could not be put in a block at all without saving it and opening it again, and an
 *   existing one joined "stage 1" or "Stage 1 " by typing, silently making a second block
 *   that looks like the first. Groups are a small closed vocabulary in practice (Stage 1,
 *   Stage 2, Stage 3, Variation); a list of what is already there is both faster and the
 *   only thing that keeps the blocks from multiplying by typo.
 *
 *   Naming a NEW block still has to be possible — that is how the vocabulary grew in the
 *   first place — so the list carries one extra option that swaps in a text box. The new
 *   name is trimmed, and a name that already exists (in any case) selects that block
 *   rather than creating a twin.
 */

/** The option that turns the picker into a text box. Not a group name anybody would type. */
const NEW_GROUP = "\u0000:new-group";
/** "Not in a group" is a real answer — some processes stand alone inside their stage. */
const NONE = "\u0000:no-group";

export function GroupPicker({ value, groups, noneLabel, onChange }: {
  value: string | null;
  /** Every group name already in use, in the order the caller wants them offered. */
  groups: readonly string[];
  noneLabel: string;
  onChange: (group: string | null) => void;
}) {
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState("");

  const commit = (raw: string) => {
    const name = raw.trim();
    setNaming(false);
    setDraft("");
    if (name === "") return;
    // Case-insensitive match against what exists, so "stage 1" joins "Stage 1" rather
    // than opening a second block beside it.
    const existing = groups.find(g => g.toLowerCase() === name.toLowerCase());
    onChange(existing ?? name);
  };

  if (naming) {
    return (
      <div className="field-inline">
        <TextField
          value={draft}
          id="group-new"
          inputAriaLabel="Name the new group"
          placeholder="Stage 4, Variation…"
          onChange={setDraft}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === "Enter") commit(draft);
            if (e.key === "Escape") { setNaming(false); setDraft(""); }
          }}
          onBlur={() => commit(draft)}
        />
      </div>
    );
  }

  return (
    <Select
      aria-label="Group or pipeline"
      placeholder={noneLabel}
      /*
       * Sorted by the CALLER, not by Select's alphabetical default.
       *
       * Two of these entries are not group names: "Not in a group" is the empty answer
       * and belongs at the top, "+ New group…" is an action and belongs at the bottom.
       * Sorting the list by label put the action first, above every real block. The
       * names between them arrive already ordered — this stage's blocks alphabetically,
       * then the rest of the vocabulary — which is more useful here than one flat A–Z.
       */
      ordered
      value={value ?? NONE}
      options={[
        { value: NONE, label: noneLabel },
        ...groups.map(g => ({ value: g, label: g })),
        { value: NEW_GROUP, label: "+ New group…" }
      ]}
      onChange={v => {
        if (v === NEW_GROUP) { setDraft(""); setNaming(true); return; }
        onChange(v === NONE ? null : v);
      }}
    />
  );
}
