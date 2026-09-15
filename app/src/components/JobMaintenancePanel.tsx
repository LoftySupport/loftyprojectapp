import { Link } from "react-router-dom";
import { Text } from "@vibe/core";
import { useQuery } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import { MAINTENANCE_HEALTH_LABELS, type JobWarranty, type MaintenanceRequest } from "../data/types";
import "./ui.css";
import "./processes.css";
import { CollapsiblePanel } from "./CollapsiblePanel";

/**
 * The job's maintenance, in its drawer (0084): the warranty line and the requests on it,
 * each a link into the Maintenance tab where the work happens.
 *
 * The warranty is `job_warranty`'s answer — handover is the completion of the "7 - Handover"
 * run, the period is the settings' — and when there is no completed handover run the panel
 * says so instead of guessing a date.
 */
export function JobMaintenancePanel({ jobId }: { jobId: string }) {
  const { can } = usePermission();
  const { data: warranty } = useQuery<JobWarranty | null>(r => r.getJobWarranty(jobId), null, [jobId]);
  const { data: requests, loading } = useQuery<MaintenanceRequest[]>(r => r.listMaintenanceRequests({ jobId, queue: "all", limit: 50 }), [], [jobId]);
  const open = requests.filter(r => r.status !== "closed" && r.status !== "rejected");

  return (
    <CollapsiblePanel id="job-maintenance" title="Maintenance" defaultOpen={false}>
      {/* Links live in the body: the heading is a <button>, and nesting a <Link> in it is
          invalid HTML — unreachable by keyboard and inconsistent on click. */}
      <div className="panel-actions">
        <Link to={`/maintenance?job=${encodeURIComponent(jobId)}&queue=all`} className="tap-link">Open in Maintenance</Link>
        {can("user") && <Link to={`/maintenance?job=${encodeURIComponent(jobId)}&new=1`} className="tap-link">+ New request</Link>}
      </div>
      <Text type="text3" color="secondary" ellipsis={false} element="p">
        {warranty?.handoverAt
          ? <>Handed over {new Date(warranty.handoverAt).toLocaleDateString()}; warranty {warranty.isInWarranty ? "runs" : "ran"} until {warranty.warrantyEndsOn ? new Date(warranty.warrantyEndsOn).toLocaleDateString() : "—"}.</>
          : <>No completed handover run yet, so no warranty period — it starts when 7 - Handover is marked complete.</>}
      </Text>
      {!loading && requests.length === 0 && <Text type="text3" color="secondary" ellipsis={false} element="p">No maintenance requests on this job.</Text>}
      {requests.length > 0 && (
        <ul className="dep-list">
          {requests.map(r => (
            <li key={r.id} className={r.status === "closed" || r.status === "rejected" ? "muted" : undefined}>
              <Link to={`/maintenance?request=${r.id}`} className="tap-link"><strong>{r.number}</strong></Link>
              <Text type="text2" element="span" style={{ flex: "1 1 200px" }}>{r.summary}</Text>
              <span className={`health is-${r.health}`}>{MAINTENANCE_HEALTH_LABELS[r.health]}</span>
              <span className="muted nowrap">{r.itemsTotal ? `${r.itemsDone} / ${r.itemsTotal} items` : "no items"}</span>
            </li>
          ))}
        </ul>
      )}
      {open.length > 0 && <div className="slot-sub">{open.length} open</div>}
    </CollapsiblePanel>
  );
}
