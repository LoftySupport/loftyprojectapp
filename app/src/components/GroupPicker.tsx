import { useState, type KeyboardEvent } from "react";
import { TextField } from "@vibe/core";
import { Select } from "./Select";
import "./processes.css";

/**
 * Which sub-stage a process runs in: picked from the ones its stage has, or named for
 * the first time.
 *
 * Amber, 3 September: *"when adding a new process or sorting/filtering the group/pipeline
 * needs to be filterable and sortable so when a drop down so when adding a process to a
 * group it can selected from that pipelien added into that pipeline"*.
 *
 * WHY A PICKER RATHER THAN A BOX
 *
 *   This was free text in the drawer and ABSENT from the create panel, so a new process
 *   could not be put in a block at all without saving it and opening it again, and an
 *   existing one joined "stage 1" or "Stage 1 " by typing, silently making a second block
 *   that looks like the first. Since 0127 the blocks are rows (`lifecycle_substages`) with
 *   an id, so the picker offers the rows and carries the id, and the database refuses a
 *   second block of the same name in the same stage.
 *
 *   Naming a NEW block still has to be possible, because that is how the vocabulary grew in
 *   the first place, so the list carries one extra option that swaps in a text box. The new
 *   name is trimmed, a name that already exists (in any case) selects that block rather
 *   than creating a twin, and otherwise `onCreate` makes the row and hands back its id.
 */

/** The option that turns the picker into a text box. Not a uuid, so it cannot be a sub-stage id. */
const NEW_GROUP = "__new-substage__";
/** "Not in a sub-stage" is only ever true of a retired process, but it has to be showable. Not a uuid either. */
const NONE = "__no-substage__";

export function GroupPicker({ value, groups, noneLabel, onChange, onCreate }: {
  /** The chosen sub-stage's id. */
  value: string | null;
  /** The stage's sub-stages, in the order the caller wants them offered. */
  groups: readonly { id: string; name: string }[];
  noneLabel: string;
  onChange: (id: string | null) => void;
  /** Make a new sub-stage in this stage and return its id; null when it could not be made. */
  onCreate: (name: string) => Promise<string | null>;
}) {
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState("");

  const commit = async (raw: string) => {
    const name = raw.trim();
    setNaming(false);
    setDraft("");
    if (name === "") return;
    // Case-insensitive match against what exists, so "stage 1" joins "Stage 1" rather
    // than opening a second block beside it.
    const existing = groups.find(g => g.name.toLowerCase() === name.toLowerCase());
    if (existing) { onChange(existing.id); return; }
    const id = await onCreate(name);
    if (id) onChange(id);
  };

  if (naming) {
    return (
      <div className="field-inline">
        <TextField
          value={draft}
          id="group-new"
          inputAriaLabel="Name the new sub-stage"
          placeholder="Stage 4, Lock-up"
          onChange={setDraft}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === "Enter") void commit(draft);
            if (e.key === "Escape") { setNaming(false); setDraft(""); }
          }}
          onBlur={() => void commit(draft)}
        />
      </div>
    );
  }

  return (
    <Select
      aria-label="Sub-stage"
      placeholder={noneLabel}
      /*
       * Sorted by the CALLER, not by Select's alphabetical default.
       *
       * Two of these entries are not sub-stage names: the empty answer belongs at the top
       * and "+ New sub-stage" is an action that belongs at the bottom. Sorting the list by
       * label put the action first, above every real block. The names between them arrive
       * in the stage's own order, which is the order a job moves through them.
       */
      ordered
      value={value ?? NONE}
      options={[
        { value: NONE, label: noneLabel },
        ...groups.map(g => ({ value: g.id, label: g.name })),
        { value: NEW_GROUP, label: "+ New sub-stage" }
      ]}
      onChange={v => {
        if (v === NEW_GROUP) { setDraft(""); setNaming(true); return; }
        onChange(v === NONE ? null : v);
      }}
    />
  );
}
