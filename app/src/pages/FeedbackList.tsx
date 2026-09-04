import { useState } from "react";
import { Text } from "@vibe/core";
import { useQuery, useRepository } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import { Select } from "../components/Select";
import { Problem } from "../components/Form";
import { ExportMenu } from "../components/ExportMenu";
import { tableFromFields, type ExportDocument } from "../data/export";
import { LoadProblem } from "../components/SearchNotices";
import {
  FEEDBACK_STAGES, FEEDBACK_STAGE_LABELS,
  type FeedbackItem, type FeedbackKind, type FeedbackStage
} from "../data/types";
import "../components/ui.css";

/**
 * Triage — what people have reported, read the way somebody fixing it needs it (0052,
 * reshaped by 0060).
 *
 * This screen and Updates read the same table and are not duplicates. Updates is the
 * queue everybody can see: titles, stages, votes. This is the working list — the page it
 * was sent from, the error the app was showing, the browser, the screenshots, all in one
 * table you can scan down. The read policy no longer separates them (0060 opened it to
 * everybody); the two audiences do.
 *
 * WHAT THE STAGE CONTROL DOES BELOW SUPERADMIN: nothing, and it is not offered. Amber's
 * instruction was *"only super admin can move the requests between stages"*, and the
 * database is what enforces it — `guard_feedback_stage_change()` raises 42501 at admin,
 * which is a rung that passes the UPDATE policy. So an admin sees the stage as text. That
 * is the one place in this app where hiding a control matters for more than tidiness:
 * offering a select that always errors would read as a broken screen rather than a rule.
 *
 * There is still no delete. `declined` says a report was read and is not being actioned,
 * which is a different and more useful fact than the report never having existed.
 */

export function FeedbackList({ kind }: { kind: FeedbackKind }) {
  const repo = useRepository();
  const { can } = usePermission();
  const [reloadKey, setReloadKey] = useState(0);
  const { data: items, loading, error } = useQuery(r => r.listFeedback(kind), [], [kind, reloadKey]);
  const { data: phases } = useQuery(r => r.listRoadmapPhases(), [], [reloadKey]);
  const [saving, setSaving] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const canMove = can("superadmin");

  /**
   * Triage as a file.
   *
   * The screen puts the title, the detail and the error the app was showing in one cell,
   * because a person scans down them. A spreadsheet wants them apart — you sort by one
   * and read the other — so they are three columns here. That is the one place an export
   * legitimately differs in shape from the table it came from: same values, split where
   * a cell was doing the work of three.
   *
   * The screenshots cannot come along. They are files behind a signed URL, so what goes
   * in is the count and the sentence the table already shows about where to find them.
   */
  const buildExport = (): ExportDocument => ({
    title: kind === "bug" ? "Bugs" : "Ideas and requests",
    note: `${items.length} ${items.length === 1 ? "report" : "reports"}`,
    tables: [
      tableFromFields<FeedbackItem>(
        kind === "bug" ? "Bugs" : "Ideas",
        [
          { label: "What", text: f => f.title },
          { label: "Detail", text: f => f.detail ?? null },
          { label: "Error shown", text: f => f.errorText ?? null },
          { label: "From", text: f => f.fromName ?? null },
          { label: "Where", text: f => f.page ?? null },
          { label: "Votes", numeric: true, text: f => f.voteCount },
          { label: "Sent", text: f => new Date(f.createdAt).toLocaleDateString() },
          { label: "Stage", text: f => FEEDBACK_STAGE_LABELS[f.stage] },
          {
            label: "Phase",
            text: f => phases.find(p => p.id === f.roadmapPhaseId)?.name ?? null
          },
          { label: "Screenshots", numeric: true, text: f => f.attachments.length }
        ],
        items
      )
    ]
  });

  const run = async (id: string, work: () => Promise<unknown>) => {
    setSaving(id);
    setProblem(null);
    try {
      await work();
      setReloadKey(k => k + 1);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">{kind === "bug" ? "Bugs" : "Ideas and requests"}</Text>
        <span className="panel-head-actions">
          <Text type="text3" color="secondary">
            {items.length} {items.length === 1 ? "report" : "reports"}
          </Text>
          <ExportMenu build={buildExport} disabled={loading || items.length === 0} />
        </span>
      </div>
      <Text type="text2" color="secondary" ellipsis={false}>
        Sent from the footer by anyone signed in. Everyone can see the queue on Updates;
        this is the same list with what a fix needs — the page, the error, the browser and
        the screenshots.{canMove ? "" : " Moving a request between stages needs superadmin."}
      </Text>

      {error && <LoadProblem error={error} />}
      {problem && <Problem>{problem}</Problem>}

      {!loading && items.length === 0 && (
        <Text type="text2" color="secondary" element="p" ellipsis={false}
              style={{ marginTop: "var(--space-12)" }}>
          {/* An empty list is empty, not "no results found" — nobody has sent one yet. */}
          Nothing reported yet.
        </Text>
      )}

      {items.length > 0 && (
        <div className="data-table-wrap" style={{ marginTop: "var(--space-12)" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">What</th>
                <th scope="col">From</th>
                <th scope="col">Where</th>
                <th scope="col">Votes</th>
                <th scope="col">Sent</th>
                <th scope="col">Stage</th>
                <th scope="col">Phase</th>
              </tr>
            </thead>
            <tbody>
              {items.map(f => (
                <Row
                  key={f.id}
                  item={f}
                  phases={phases}
                  canMove={canMove}
                  busy={saving === f.id}
                  onStage={stage => void run(f.id, () => repo.setFeedbackStage(f.id, stage))}
                  onPhase={phaseId => void run(f.id, () => repo.setFeedbackPhase(f.id, phaseId))}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Row({
  item, phases, canMove, busy, onStage, onPhase
}: {
  item: FeedbackItem;
  phases: { id: string; name: string }[];
  canMove: boolean;
  busy: boolean;
  onStage: (stage: FeedbackStage) => void;
  onPhase: (phaseId: string | null) => void;
}) {
  return (
    <tr>
      <td>
        <Text type="text2" weight="medium" element="div" ellipsis={false}>{item.title}</Text>
        {item.detail && (
          <Text type="text3" color="secondary" element="div" ellipsis={false}>{item.detail}</Text>
        )}
        {item.errorText && (
          <div><span className="dict-type">{item.errorText}</span></div>
        )}
        {item.attachments.length > 0 && (
          <Text type="text3" color="secondary" element="div">
            {item.attachments.length}{" "}
            {item.attachments.length === 1 ? "screenshot" : "screenshots"} — open it on Updates
          </Text>
        )}
      </td>
      {/* An em dash, not "Unknown": the profile is gone, and naming somebody would be a
          claim about who sent it. */}
      <td><Text type="text2">{item.fromName ?? "—"}</Text></td>
      <td><span className="dict-type">{item.page ?? "—"}</span></td>
      <td><Text type="text2">{item.voteCount}</Text></td>
      <td><Text type="text2">{new Date(item.createdAt).toLocaleDateString()}</Text></td>
      <td>
        {canMove ? (
          <Select
            options={FEEDBACK_STAGES.map(s => ({ value: s, label: FEEDBACK_STAGE_LABELS[s] }))}
            value={item.stage}
            onChange={v => onStage(v as FeedbackStage)}
            aria-label={`Stage for "${item.title}"`}
            className={busy ? "is-busy" : undefined}
          />
        ) : (
          <Text type="text2">{FEEDBACK_STAGE_LABELS[item.stage]}</Text>
        )}
      </td>
      <td>
        <Select
          ordered
          options={phases.map(p => ({ value: p.id, label: p.name }))}
          value={item.roadmapPhaseId}
          clearable
          placeholder={phases.length === 0 ? "No phases yet" : "Not planned"}
          onChange={v => onPhase(v)}
          aria-label={`Roadmap phase for "${item.title}"`}
          className={busy ? "is-busy" : undefined}
        />
      </td>
    </tr>
  );
}
