import { useMemo, useState } from "react";
import { Button, Heading, Tab, TabList, Text, TextArea, TextField } from "@vibe/core";
import {
  DICTIONARY,
  DICTIONARY_STATUSES,
  DICTIONARY_TABLES,
  STATUS_LABELS,
  STATUS_TONE,
  countByStatus,
  type DictionaryEntry,
  type DictionaryStatus
} from "../data/dictionary";
import { usePermission } from "../data/PermissionProvider";
import { Select, toOptions } from "../components/Select";
import "../components/ui.css";
import "./DictionaryPage.css";

/**
 * The data dictionary.
 *
 * Every property in the schema, what Lofty calls it, what it means, what shape it is,
 * what rules it carries, what it relates to, and how far along it is.
 *
 * Who can do what:
 *   viewer / user   read it
 *   manager         plus edit the friendly name and the definition — the two fields
 *                   that are about the business rather than the database
 *   admin           plus set status
 *   superadmin      plus archive an entry
 *
 * Edits are held in page state. They are not persisted anywhere yet, because there is
 * nowhere to persist them to — this array is the source of truth until a
 * `data_dictionary` table exists, and pretending otherwise would lose someone's work.
 * That is said on the page rather than left to be discovered.
 */
export function DictionaryPage() {
  const { can } = usePermission();
  const canEditWording = can("manager");
  const canEditStatus = can("admin");
  const canArchive = can("superadmin");

  const [tab, setTab] = useState(0);
  const [table, setTable] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [edits, setEdits] = useState<Record<string, Partial<DictionaryEntry>>>({});
  const [openRow, setOpenRow] = useState<string | null>(null);

  const merged = useMemo(
    () => DICTIONARY.map(d => ({ ...d, ...edits[d.id] })),
    [edits]
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return merged.filter(d =>
      (!table || d.table === table) &&
      (!status || d.status === status) &&
      (!q ||
        d.id.toLowerCase().includes(q) ||
        d.friendlyName.toLowerCase().includes(q) ||
        d.definition.toLowerCase().includes(q))
    );
  }, [merged, table, status, query]);

  const counts = countByStatus();

  const edit = (id: string, patch: Partial<DictionaryEntry>) =>
    setEdits(prev => ({
      ...prev,
      [id]: { ...prev[id], ...patch, updatedAt: new Date().toISOString().slice(0, 10), updatedBy: "you" }
    }));

  return (
    <>
      <div className="page-head page-head-row">
        <div>
          <Heading type="h2" weight="bold">Data dictionary</Heading>
          <Text type="text2" color="secondary">
            Every property in the schema — what it is called, what it means, what shape it is,
            and how far along it is.
          </Text>
        </div>
        <Text type="text3" color="secondary">
          {DICTIONARY.length} properties across {DICTIONARY_TABLES.length} tables
        </Text>
      </div>

      <div className="stat-row" style={{ marginBottom: "var(--space-16)" }}>
        {DICTIONARY_STATUSES.map(s => (
          <button
            key={s}
            type="button"
            className={"stat-tile dict-stat" + (status === s ? " is-active" : "")}
            onClick={() => setStatus(status === s ? null : s)}
            aria-pressed={status === s}
          >
            <div className="stat-num">{counts[s]}</div>
            <div className="stat-lbl">{STATUS_LABELS[s]}</div>
          </button>
        ))}
      </div>

      <TabList activeTabId={tab} onTabChange={setTab}>
        <Tab>Properties</Tab>
        <Tab>Tables</Tab>
      </TabList>

      {tab === 0 && (
        <>
          <div className="toolbar">
            <div className="toolbar-field">
              <span className="toolbar-label">Table</span>
              <Select
                className="toolbar-control"
                aria-label="Filter by table"
                placeholder="All tables"
                clearable
                options={toOptions(DICTIONARY_TABLES)}
                value={table}
                onChange={setTable}
              />
            </div>
            <div className="toolbar-field">
              <span className="toolbar-label">Status</span>
              <Select
                className="toolbar-control"
                aria-label="Filter by status"
                placeholder="Any status"
                clearable
                options={DICTIONARY_STATUSES.map(s => ({ value: s, label: STATUS_LABELS[s] }))}
                value={status}
                onChange={setStatus}
              />
            </div>
            <div className="toolbar-field dict-search">
              <TextField
                placeholder="Search name, id or definition…"
                value={query}
                onChange={setQuery}
                size="small"
                aria-label="Search the dictionary"
              />
            </div>
            <div className="toolbar-spacer" />
            <Text type="text2" color="secondary">
              Showing {rows.length} of {DICTIONARY.length}
            </Text>
          </div>

          <PermissionNote canEditWording={canEditWording} canEditStatus={canEditStatus} canArchive={canArchive} />

          <div className="panel data-table-wrap">
            <table className="data-table dict-table">
              <thead>
                <tr>
                  <th>Supabase ID</th>
                  <th>Lofty name</th>
                  <th>Definition</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map(d => (
                  <>
                    <tr key={d.id}>
                      <td><code className="dict-id">{d.id}</code></td>
                      <td>
                        {canEditWording ? (
                          <TextField
                            value={d.friendlyName}
                            onChange={v => edit(d.id, { friendlyName: v })}
                            size="small"
                            aria-label={`Lofty name for ${d.id}`}
                          />
                        ) : (
                          <strong>{d.friendlyName}</strong>
                        )}
                      </td>
                      <td className="dict-definition">
                        {canEditWording ? (
                          <TextArea
                            value={d.definition}
                            onChange={e => edit(d.id, { definition: e.target.value })}
                            rows={3}
                            aria-label={`Definition for ${d.id}`}
                          />
                        ) : (
                          d.definition
                        )}
                      </td>
                      <td><span className="dict-type">{d.type}</span></td>
                      <td>
                        {canEditStatus ? (
                          <Select
                            aria-label={`Status for ${d.id}`}
                            options={DICTIONARY_STATUSES.map(s => ({ value: s, label: STATUS_LABELS[s] }))}
                            value={d.status}
                            onChange={v => edit(d.id, { status: v as DictionaryStatus })}
                          />
                        ) : (
                          <span className={`status-pill dict-${STATUS_TONE[d.status]}`}>
                            {STATUS_LABELS[d.status]}
                          </span>
                        )}
                      </td>
                      <td className="muted">
                        {d.updatedAt}
                        <div className="slot-sub">{d.updatedBy}</div>
                      </td>
                      <td>
                        <Button
                          kind="tertiary"
                          size="small"
                          onClick={() => setOpenRow(openRow === d.id ? null : d.id)}
                        >
                          {openRow === d.id ? "Hide" : "Rules"}
                        </Button>
                      </td>
                    </tr>

                    {openRow === d.id && (
                      <tr key={d.id + "-detail"} className="dict-detail">
                        <td colSpan={7}>
                          <div className="dict-detail-grid">
                            <div>
                              <Text type="text3" color="secondary">Rules</Text>
                              <Text type="text2">{d.rules || "—"}</Text>
                            </div>
                            <div>
                              <Text type="text3" color="secondary">Relationships</Text>
                              <Text type="text2">{d.relationships || "—"}</Text>
                            </div>
                            <div>
                              <Text type="text3" color="secondary">Created</Text>
                              <Text type="text2">{d.createdAt} · {d.createdBy}</Text>
                            </div>
                            {canArchive && d.status !== "archived" && (
                              <div>
                                <Button
                                  kind="tertiary"
                                  size="small"
                                  onClick={() => edit(d.id, { status: "archived" })}
                                >
                                  Archive this property
                                </Button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 1 && <Tables rows={merged} />}
    </>
  );
}

function PermissionNote({
  canEditWording,
  canEditStatus,
  canArchive
}: {
  canEditWording: boolean;
  canEditStatus: boolean;
  canArchive: boolean;
}) {
  const { permission } = usePermission();
  return (
    <section className="panel dict-note">
      <Text type="text2">
        Signed in as <strong>{permission}</strong>.{" "}
        {canEditWording
          ? "You can edit the Lofty name and the definition — the two fields that are about the business rather than the database."
          : "You can read the dictionary. Editing the Lofty name and definition needs manager."}
        {canEditStatus && " You can set status."}
        {canArchive && " You can archive a property."}
      </Text>
      <Text type="text3" color="secondary">
        Edits live in this page only — there is no <code>data_dictionary</code> table to save
        them to yet, so a refresh loses them. Said here rather than left to be discovered.
      </Text>
    </section>
  );
}

/** The schema listing: one card per table, with its columns and their relationships. */
function Tables({ rows }: { rows: DictionaryEntry[] }) {
  return (
    <div className="stack" style={{ marginTop: "var(--space-16)" }}>
      {DICTIONARY_TABLES.map(t => {
        const cols = rows.filter(d => d.table === t);
        const done = cols.filter(d => d.status === "created" || d.status === "merged").length;
        return (
          <section className="panel" key={t}>
            <div className="panel-head">
              <Text type="text2" weight="bold"><code>{t}</code></Text>
              <Text type="text3" color="secondary">
                {cols.length} propert{cols.length === 1 ? "y" : "ies"} · {done} built
              </Text>
            </div>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Column</th><th>Lofty name</th><th>Type</th>
                    <th>Rules</th><th>Relationships</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {cols.map(d => (
                    <tr key={d.id}>
                      <td><code className="dict-id">{d.column}</code></td>
                      <td>{d.friendlyName}</td>
                      <td><span className="dict-type">{d.type}</span></td>
                      <td className="muted dict-rules">{d.rules || "—"}</td>
                      <td className="muted dict-rules">{d.relationships || "—"}</td>
                      <td>
                        <span className={`status-pill dict-${STATUS_TONE[d.status]}`}>
                          {STATUS_LABELS[d.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
