import { useMemo, useState } from "react";
import { Button, Text } from "@vibe/core";
import { useQuery, useRepository } from "../data/DataProvider";
import { usePropertyAccess, usePropertyDefs, usePropertyOptions } from "../data/useLookups";
import { formatValue, hasValue } from "./PropertyField";
import "./ui.css";
import "./processes.css";

/**
 * Amber's "push to jobs" (1 Sep): copy the project's recorded project-level values onto
 * every live job on it.
 *
 * A preview first, per job-count, because a push is a write to twenty rows and the
 * person should see which twenty. Only values the person may READ are listed (the access
 * map decides), and the database refuses any it may not create on a job — so the number
 * that comes back is the truth of what moved, not what was asked for.
 *
 * Closed and Cancelled jobs are left alone by the function itself: their data does not
 * change (0045, 0057).
 */
export function PushToJobs({
  projectId,
  jobCount,
  onDone,
  onClose
}: {
  projectId: number;
  jobCount: number;
  onDone: (pushed: number) => void;
  onClose: () => void;
}) {
  const repo = useRepository();
  const { propertyDefs } = usePropertyDefs();
  const { access } = usePropertyAccess();
  const { byProperty: options } = usePropertyOptions();
  const { data: values } = useQuery(r => r.listPropertyValues({ projectId }), [], [projectId]);
  const { data: profiles } = useQuery(r => r.listProfiles(), []);
  const people = useMemo(() => profiles.map(p => ({ id: p.id, name: p.fullName })), [profiles]);

  const rows = useMemo(() => {
    const byKey = new Map(values.filter(v => v.projectId === projectId).map(v => [v.propertyKey, v]));
    return propertyDefs
      .filter(d => d.scope === "project" && access(d.key).canRead)
      .map(d => ({ def: d, value: byKey.get(d.key) ?? null }))
      .filter(r => r.value && hasValue(r.def, r.value.value));
  }, [values, propertyDefs, access, projectId]);

  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const selected = chosen ?? new Set(rows.map(r => r.def.key));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function push() {
    setBusy(true);
    setError(null);
    try {
      const n = await repo.pushProjectProperties(projectId, [...selected]);
      onDone(n);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="new-address-block">
      <div className="panel-head">
        <Text type="text2" weight="bold">Push project properties to the jobs</Text>
        <Text type="text3" color="secondary">{jobCount} job{jobCount === 1 ? "" : "s"} on this project</Text>
      </div>
      <Text type="text3" color="secondary" ellipsis={false} element="p">
        Each ticked value is copied onto every live job as that job's own copy. A job keeps
        reading the project's value until it is pushed; after a push the job's drawer marks
        the copy and says when the project has since changed. Closed and cancelled jobs are
        not touched.
      </Text>
      {rows.length === 0 ? (
        <Text type="text2" color="secondary" ellipsis={false}>
          Nothing to push — no project-level property has a value recorded yet.
        </Text>
      ) : (
        <div className="picker-list">
          {rows.map(({ def, value }) => (
            <label key={def.key}>
              <input
                type="checkbox"
                checked={selected.has(def.key)}
                onChange={e => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(def.key); else next.delete(def.key);
                  setChosen(next);
                }}
              />
              <Text type="text2" element="span">{def.label}</Text>
              <Text type="text3" color="secondary" element="span">
                {formatValue(def, value!.value, options.get(def.key) ?? [], people)}
              </Text>
            </label>
          ))}
        </div>
      )}
      {error && <div className="create-problem" role="alert"><Text type="text2" ellipsis={false}>{error}</Text></div>}
      <div className="field-inline" style={{ marginTop: "var(--space-8)" }}>
        <Button size="small" onClick={push} disabled={busy || selected.size === 0 || jobCount === 0}>
          {busy ? "Pushing…" : `Push ${selected.size} value${selected.size === 1 ? "" : "s"} to ${jobCount} job${jobCount === 1 ? "" : "s"}`}
        </Button>
        <Button size="small" kind="tertiary" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}
