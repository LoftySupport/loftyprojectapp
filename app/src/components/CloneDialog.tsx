import { useState } from "react";
import { Button, Checkbox, Text } from "@vibe/core";
import { useRepository } from "../data/DataProvider";
import { Problem, Result } from "./Form";
import { SidePanel } from "./SidePanel";
import { CLONE_EVERYTHING, type CloneOptions } from "../data/types";
import "./ui.css";

/**
 * "Clone this job" (0057).
 *
 * Amber, 28 Aug: *"would be good to have the ability to clone a job or a project so if
 * we had to revive a project or job we could just copy it with or without the
 * information."*
 *
 * It exists because Cancelled stopped being revivable in the same breath. A cancelled
 * job's number is on contracts and its dates are stale, so the way back is a new record
 * that says where it came from — which is what `job_number_old` carries.
 *
 * **The checkboxes are the "with or without".** Three of them, all on by default,
 * because "this again" is the common case. What is not on the list is not an oversight:
 * the number, the stage, the status, the SharePoint folder and the history are never
 * copied, and `CloneOptions` says why for each. A checkbox for those would offer a
 * choice the whole feature exists to take away.
 *
 * The panel does not close itself on success. The new job's number is the thing
 * somebody came for — they will quote it on the phone — so it stays on screen until
 * they dismiss it, the same way the create form holds its result.
 */
export function CloneJobDialog({
  show,
  jobNumber,
  onClose,
  onCloned
}: {
  show: boolean;
  /** The job being copied — '1042-03'. Null closes the panel. */
  jobNumber: string | null;
  onClose: () => void;
  onCloned?: () => void;
}) {
  const repo = useRepository();
  const [copy, setCopy] = useState<CloneOptions>(CLONE_EVERYTHING);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const close = () => {
    setCopy(CLONE_EVERYTHING);
    setError(null);
    setCreated(null);
    onClose();
  };

  const go = async () => {
    if (!jobNumber || saving) return;
    setSaving(true);
    setError(null);
    try {
      const made = await repo.cloneJob(jobNumber, copy);
      setCreated(made.id);
      onCloned?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (!jobNumber) return null;

  return (
    <SidePanel
      open={show}
      title={`Clone ${jobNumber}`}
      onClose={close}
      footer={
        created
          ? <Button onClick={close}>Done</Button>
          : (
            <>
              <Button kind="tertiary" onClick={close} disabled={saving}>Cancel</Button>
              <Button onClick={() => void go()} disabled={saving}>
                {saving ? "Cloning…" : "Create the clone"}
              </Button>
            </>
          )
      }
    >
      {created ? (
        <Result>
          Created <strong>{created}</strong> on the same project, at Acquisition &amp;
          Development. It carries <strong>{jobNumber}</strong> as its old job number, so
          searching either finds both.
        </Result>
      ) : (
        <div className="create-form">
          <Text type="text2" color="secondary" element="p" ellipsis={false}>
            A new job on the same project, with its own number from the sequence. Tick
            what should come across.
          </Text>

          <div className="clone-options">
          <Checkbox
            label="The lot address"
            checked={copy.address}
            onChange={() => setCopy(c => ({ ...c, address: !c.address }))}
          />
          <Checkbox
            label="Team and assignee"
            checked={copy.who}
            onChange={() => setCopy(c => ({ ...c, who: !c.who }))}
          />
          <Checkbox
            label="Title type"
            checked={copy.titleType}
            onChange={() => setCopy(c => ({ ...c, titleType: !c.titleType }))}
          />
          </div>

          {/* Said plainly rather than left to be discovered. Somebody cloning a
              cancelled job is doing it precisely because the old facts are stale, and
              needs to know which of them the clone refuses to carry. */}
          <Text type="text3" color="secondary" element="div" ellipsis={false}>
            <strong>Never copied:</strong> the job number (the sequence issues a new
            one), the stage and status (it opens at Acquisition &amp; Development, on
            track), the SharePoint folder, and the activity and comments — those
            happened to {jobNumber}.
          </Text>

          {error && <Problem>{error}</Problem>}
        </div>
      )}
    </SidePanel>
  );
}
