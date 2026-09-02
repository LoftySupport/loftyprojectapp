import { useState } from "react";
import { Button } from "@vibe/core";
import { useQuery, useRepository } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import type { RecordWatch } from "../data/types";

/**
 * Follow this record (0083). A watcher is an audience the notification rules can name —
 * a stage move, a working-drawings change, a push of project properties reach whoever
 * pressed this. Own rows only, by policy.
 */
export function WatchButton({ jobId, projectId }: { jobId?: string; projectId?: number }) {
  const repo = useRepository();
  const { can } = usePermission();
  const [reload, setReload] = useState(0);
  const { data: watches } = useQuery<RecordWatch[]>(r => r.listMyWatches(), [], [reload]);
  const watching = watches.some(w => (jobId != null ? w.jobId === jobId : w.projectId === projectId));
  const [busy, setBusy] = useState(false);
  if (!can("viewer")) return null;
  const toggle = async () => {
    setBusy(true);
    try {
      if (watching) await repo.unwatchRecord({ jobId, projectId }); else await repo.watchRecord({ jobId, projectId });
      setReload(n => n + 1);
    } finally { setBusy(false); }
  };
  return (
    <Button size="small" kind={watching ? "secondary" : "tertiary"} disabled={busy} onClick={toggle}
      aria-pressed={watching} aria-label={watching ? "Stop watching this record" : "Watch this record for stage moves and changes"}>
      {watching ? "Watching" : "Watch"}
    </Button>
  );
}
