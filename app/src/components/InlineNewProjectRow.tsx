import { useState } from "react";
import { Button, Text, TextField } from "@vibe/core";
import { Select } from "./Select";
import { useRepository } from "../data/DataProvider";
import {
  PROJECT_TYPE_LABELS, PROJECT_TYPES, SA_COUNCILS,
  type ProjectType, type SaCouncil
} from "../data/types";
import "./ui.css";

/**
 * "+ New project" as the last row of the table, the way monday does it.
 *
 * Lofty, 23 August, asked for both this and the panel: *"both. they can add either way."*
 * The panel is what the toolbar button opens; this is for when you are already looking at
 * the list and want three more sites in it without leaving.
 *
 * WHY THIS IS POSSIBLE AT ALL, AND WAS NOT LAST WEEK
 *
 *   A monday item needs a name and nothing else, which is what makes typing one into a
 *   row work there. A Lofty project used to need a full street address — seven fields
 *   with two conditional constraints — and that does not fit on a line.
 *
 *   `0037` changed it. A project may now sit at a **locality**: suburb, state, postcode.
 *   With the type and an optional name that is five inputs, and five fit.
 *
 * SO THIS ROW CREATES A LOCALITY PROJECT, DELIBERATELY
 *
 *   Not a reduced version of the panel's form — the honest minimum, which is also what
 *   Lofty actually knows when the land is bought. A street and its lot numbers arrive
 *   later, on the project, and the panel is there for the case where they are known up
 *   front. The row says so rather than leaving somebody hunting for the street field.
 */
export function InlineNewProjectRow({
  columns,
  onCreated
}: {
  /** How many cells the table has, so the prompt row can span all of them. */
  columns: number;
  onCreated: () => void;
}) {
  const repo = useRepository();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [suburb, setSuburb] = useState("");
  const [postcode, setPostcode] = useState("");
  const [council, setCouncil] = useState<SaCouncil | null>(null);
  const [projectType, setProjectType] = useState<ProjectType | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The same rules the panel checks, minus the street half — this row never sets one,
  // so it is always the locality shape and the number constraints cannot apply.
  const valid =
    suburb.trim() !== "" &&
    /^[0-9]{4}$/.test(postcode.trim()) &&
    council !== null &&
    projectType !== null;

  const reset = () => {
    setName(""); setSuburb(""); setPostcode(""); setCouncil(null);
    setProjectType(null); setError(null);
  };

  async function save() {
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      await repo.createProject({
        name,
        projectType: projectType!,
        // State is SA because the council picker is, and the database refuses a council
        // outside SA. An interstate project goes through the panel, which asks.
        address: { suburb, postcode, state: "SA", council }
      });
      // Stays open and clears. The whole reason to type into a row rather than open a
      // panel is that there is another one after it.
      reset();
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <tr className="inline-add">
        <td colSpan={columns}>
          <button type="button" className="inline-add-open" onClick={() => setOpen(true)}>
            + New project
          </button>
        </td>
      </tr>
    );
  }

  return (
    <>
      <tr className="inline-add is-open">
        <td>
          {/* No number to type. It comes from the sequence at insert, and offering a box
              for it would be offering to fight the sequence. */}
          <Text type="text3" color="secondary">auto</Text>
        </td>
        <td>
          <TextField
            value={name}
            onChange={setName}
            placeholder="Mt Gambier division"
            id="inline-name"
            inputAriaLabel="Project name"
            size="small"
          />
        </td>
        <td>
          <TextField
            value={suburb}
            onChange={setSuburb}
            placeholder="Mount Gambier"
            id="inline-suburb"
            inputAriaLabel="Suburb"
            size="small"
          />
        </td>
        <td>
          <Select
            aria-label="Project type"
            options={PROJECT_TYPES.map(t => ({ value: t, label: PROJECT_TYPE_LABELS[t] }))}
            value={projectType}
            onChange={v => setProjectType(v as ProjectType)}
            placeholder="Type"
          />
        </td>
        <td>
          <TextField
            value={postcode}
            onChange={setPostcode}
            placeholder="5290"
            id="inline-postcode"
            inputAriaLabel="Postcode"
            size="small"
          />
        </td>
        <td colSpan={Math.max(1, columns - 5)}>
          <Select
            aria-label="Council"
            options={SA_COUNCILS.map(c => ({ value: c, label: c }))}
            value={council}
            onChange={v => setCouncil(v as SaCouncil)}
            placeholder="Council"
          />
        </td>
      </tr>
      <tr className="inline-add is-open">
        <td colSpan={columns}>
          <div className="inline-add-foot">
            <Text type="text3" color="secondary">
              Suburb only for now — add the street and its lots on the project.
            </Text>
            <div className="inline-add-actions">
              <Button
                kind="tertiary"
                size="small"
                onClick={() => { reset(); setOpen(false); }}
              >
                Cancel
              </Button>
              <Button size="small" onClick={save} disabled={!valid || saving}>
                {saving ? "Adding…" : "Add"}
              </Button>
            </div>
          </div>
          {error && <div className="create-problem inline-add-problem">{error}</div>}
        </td>
      </tr>
    </>
  );
}
