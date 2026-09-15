import { useMemo, useState } from "react";
import { Button, Heading, Tab, TabList, Text, TextArea, TextField } from "@vibe/core";
import {
  DICTIONARY,
  DICTIONARY_STATUSES,
  DICTIONARY_TABLES,
  STATUS_LABELS,
  STATUS_TONE,
  TABLE_DESCRIPTIONS,
  countByStatus,
  type AllowedValues,
  type DictionaryEntry,
  type DictionaryStatus
} from "../data/dictionary";
import { usePermission } from "../data/PermissionProvider";
import { useQuery, useRepository } from "../data/DataProvider";
import { Problem } from "../components/Form";
import { useStages, useTeams } from "../data/useLookups";
import { Select, toOptions } from "../components/Select";
import { ExportMenu } from "../components/ExportMenu";
import { tableFromFields, type ExportDocument } from "../data/export";
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
 * Edits persist since 0044: `dictionary_overrides` holds Lofty's words on top of the
 * repo's entries — one row per edited entry, null fields meaning the repo's wording
 * stands. Typing stays local; a field saves when you leave it, a status the moment it
 * changes. The ladder above is enforced in the database, not just reflected here.
 */
/**
 * The two statuses that describe what a property USED to be.
 *
 * `merged` is a property folded into another one; `archived` is one retired outright.
 * Neither is part of the schema any more, so neither belongs in a list of what the
 * schema is — sixteen dropped columns sitting among a hundred and ninety live ones is
 * sixteen chances to read a decision that was reversed as though it still held.
 *
 * Hidden, not deleted. The entries carry the reasoning for a reversal, which is the
 * whole point of keeping them — a schema choice without its reasoning gets "simplified"
 * back into a bug by the next person. So the status tiles still count them and clicking
 * one is how you get to them, which is also why this reads the filter rather than being
 * a toggle of its own: asking for merged properties is already the way to ask.
 */
const RETIRED: readonly DictionaryStatus[] = ["merged", "archived"];
const isRetired = (s: DictionaryStatus) => RETIRED.includes(s);

export function DictionaryPage() {
  const { can } = usePermission();
  // The two lookups the allowed-values cell reads live, needed up here too so the
  // download can resolve them the same way — see `allowedValues` below.
  const { teams } = useTeams();
  const { stageNames } = useStages();
  const canEditWording = can("manager");
  const canEditStatus = can("admin");
  const canArchive = can("superadmin");

  const [tab, setTab] = useState(0);
  const [table, setTable] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [edits, setEdits] = useState<Record<string, Partial<DictionaryEntry>>>({});
  const [openRow, setOpenRow] = useState<string | null>(null);

  const repo = useRepository();
  const [reload, setReload] = useState(0);
  const { data: overrides } = useQuery(r => r.listDictionaryOverrides(), [], [reload]);
  const [saveError, setSaveError] = useState<string | null>(null);

  /**
   * Three layers, in order: the repo's entry, the saved override, the keystroke not yet
   * saved. Only an override's non-null fields apply — null means the repo's wording
   * stands, which is what lets one field be Lofty's while the rest stay the code's.
   */
  const merged = useMemo(() => {
    const byId = new Map(overrides.map(o => [o.id, o]));
    return DICTIONARY.map(d => {
      const o = byId.get(d.id);
      return {
        ...d,
        ...(o?.friendlyName != null && { friendlyName: o.friendlyName }),
        ...(o?.definition != null && { definition: o.definition }),
        ...(o?.status != null && { status: o.status }),
        ...(o && { updatedAt: o.updatedAt.slice(0, 10) }),
        ...edits[d.id]
      };
    });
  }, [overrides, edits]);

  /**
   * The blur-save for the two wording fields. Sends only what changed against what the
   * merged view already shows; clears the local copy on success so the saved override
   * takes over without a flicker.
   */
  async function persistWording(id: string) {
    const local = edits[id];
    if (!local || (!("friendlyName" in local) && !("definition" in local))) return;
    setSaveError(null);
    try {
      await repo.saveDictionaryOverride(id, {
        ...("friendlyName" in local && { friendlyName: local.friendlyName }),
        ...("definition" in local && { definition: local.definition })
      });
      setEdits(prev => {
        const { friendlyName: _f, definition: _d, ...rest } = prev[id] ?? {};
        void _f; void _d;
        const next = { ...prev };
        if (Object.keys(rest).length) next[id] = rest; else delete next[id];
        return next;
      });
      setReload(k => k + 1);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  }

  /** Status saves the moment it changes — a dropdown has no blur worth waiting for. */
  async function persistStatus(id: string, status: DictionaryStatus) {
    setSaveError(null);
    try {
      await repo.saveDictionaryOverride(id, { status });
      setEdits(prev => {
        const { status: _s, ...rest } = prev[id] ?? {};
        void _s;
        const next = { ...prev };
        if (Object.keys(rest).length) next[id] = rest; else delete next[id];
        return next;
      });
      setReload(k => k + 1);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  }

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return merged.filter(d =>
      // Merged and archived are out unless you ask for them by name — see RETIRED below.
      (status ? d.status === status : !isRetired(d.status)) &&
      (!table || d.table === table) &&
      (!q ||
        d.id.toLowerCase().includes(q) ||
        d.friendlyName.toLowerCase().includes(q) ||
        d.definition.toLowerCase().includes(q))
    );
  }, [merged, table, status, query]);

  /** What the "of N" counts against: the live schema, not the history. */
  const live = useMemo(() => merged.filter(d => !isRetired(d.status)), [merged]);
  const liveTotal = live.length;
  const retiredTotal = merged.length - liveTotal;
  /** Tables that still have at least one column — `divisions` and `job_types` do not. */
  const liveTables = useMemo(() => [...new Set(live.map(d => d.table))], [live]);

  const counts = countByStatus();

  /**
   * The permitted values as one cell of text.
   *
   * The same resolution `AllowedValuesCell` does — read live for the two that are rows
   * in a lookup, because the point of a lookup table is that it changes — flattened,
   * because a nested list has nowhere to go in a spreadsheet. A column whose values have
   * not loaded yet exports as blank rather than as an empty list: "no values" and "not
   * read yet" are different, and one of them is a claim.
   */
  const allowedValues = (allowed?: AllowedValues): string | null => {
    if (!allowed) return null;
    const live =
      allowed.lookup === "teams" ? teams.map(t => t.name)
      : allowed.lookup === "stages" ? stageNames
      : null;
    const values = allowed.values ?? live;
    return values && values.length > 0 ? values.join(", ") : null;
  };

  /**
   * The dictionary as a file — the filtered set, with Lofty's edits already folded in
   * (`merged`, not `DICTIONARY`), so a manager who has renamed forty properties exports
   * their words and not the repo's.
   *
   * This is the export somebody actually reads away from the app: a hundred and ninety
   * properties is a spreadsheet job, not a scrolling job, and the schema conversation
   * with Lofty has been happening in a spreadsheet since before this page existed. The
   * allowed values come along flattened into one cell — a nested list has nowhere to go
   * in a sheet, and the values are what somebody checks a form against.
   */
  const buildExport = (): ExportDocument => ({
    title: "Data dictionary",
    note: [
      `Showing ${rows.length} of ${status ? DICTIONARY.length : liveTotal} properties`,
      table ? `table: ${table}` : null,
      status ? `status: ${STATUS_LABELS[status as DictionaryStatus]}` : null,
      query.trim() ? `search: ${query.trim()}` : null
    ]
      .filter(Boolean)
      .join(" · "),
    tables: [
      tableFromFields<DictionaryEntry>(
        "Dictionary",
        [
          { label: "Supabase ID", text: d => d.id },
          { label: "Table", text: d => d.table },
          { label: "Column", text: d => d.column },
          { label: "Lofty name", text: d => d.friendlyName },
          { label: "Definition", text: d => d.definition },
          { label: "Type", text: d => d.type },
          { label: "Rules", text: d => d.rules || null },
          { label: "Relationships", text: d => d.relationships || null },
          { label: "Allowed values", text: d => allowedValues(d.allowed) },
          {
            label: "Values held in",
            text: d =>
              d.allowed
                ? `${d.allowed.holder} (${d.allowed.source === "table" ? "lookup table" : d.allowed.source})`
                : null
          },
          { label: "Status", text: d => STATUS_LABELS[d.status] },
          { label: "Last updated", text: d => d.updatedAt },
          { label: "Updated by", text: d => d.updatedBy }
        ],
        rows
      )
    ]
  });

  const edit = (id: string, patch: Partial<DictionaryEntry>) =>
    setEdits(prev => ({
      ...prev,
      [id]: { ...prev[id], ...patch, updatedAt: new Date().toISOString().slice(0, 10), updatedBy: "you" }
    }));

  return (
    <>
      <div className="page-head page-head-row">
        {/* No line under the heading (12 September). The live count beside it stays —
            it is a readout, not a description, and it sits ON the heading's line. */}
        <div>
          <Heading type="h2" weight="bold">Data dictionary</Heading>
        </div>
        {/* The live schema, so this agrees with the "of N" beside the filters. Counting
            all 206 next to a table showing 190 makes the page look broken. */}
        <Text type="text3" color="secondary" ellipsis={false}>
          {liveTotal} properties across {liveTables.length} tables
          {retiredTotal > 0 && ` · ${retiredTotal} merged or archived`}
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
              {/* `inputAriaLabel`, not `aria-label`: Vibe overwrites aria-label with the
                  placeholder and ignores the prop. Ids are explicit because the default
                  is literally id="input" on every instance. */}
              <TextField
                id="dict-search"
                type="search"
                placeholder="Search name, id or definition…"
                value={query}
                onChange={setQuery}
                size="small"
                inputAriaLabel="Search the dictionary"
              />
            </div>
            <ExportMenu build={buildExport} disabled={rows.length === 0} />
            <div className="toolbar-spacer" />
            <Text type="text2" color="secondary">
              Showing {rows.length} of {status ? DICTIONARY.length : liveTotal}
            </Text>
          </div>

          <PermissionNote canEditWording={canEditWording} canEditStatus={canEditStatus} canArchive={canArchive} />
          {saveError && <Problem>{saveError}</Problem>}

          {/* Said rather than left to be noticed: a count that quietly disagrees with the
              tiles above it is how somebody concludes the page is broken. */}
          {!status && retiredTotal > 0 && (
            <Text type="text3" color="secondary" ellipsis={false}>
              {retiredTotal} merged or archived propert{retiredTotal === 1 ? "y is" : "ies are"} hidden —
              they are history rather than schema. Use the <strong>Merged</strong> or{" "}
              <strong>Archived</strong> tile above to read them.
            </Text>
          )}

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
                            id={`name-${d.id}`}
                            value={d.friendlyName}
                            onChange={v => edit(d.id, { friendlyName: v })}
                            onBlur={() => persistWording(d.id)}
                            size="small"
                            inputAriaLabel={`Lofty name for ${d.id}`}
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
                            onBlur={() => persistWording(d.id)}
                            rows={3}
                            aria-label={`Definition for ${d.id}`}
                          />
                        ) : (
                          d.definition
                        )}
                      </td>
                      <td>
                        <span className="dict-type">{d.type}</span>
                        <AllowedValuesCell allowed={d.allowed} />
                      </td>
                      <td>
                        {canEditStatus ? (
                          <Select
                            aria-label={`Status for ${d.id}`}
                            options={DICTIONARY_STATUSES.map(s => ({ value: s, label: STATUS_LABELS[s] }))}
                            value={d.status}
                            onChange={v => {
                              edit(d.id, { status: v as DictionaryStatus });
                              persistStatus(d.id, v as DictionaryStatus);
                            }}
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
                                  onClick={() => {
                                    edit(d.id, { status: "archived" });
                                    persistStatus(d.id, "archived");
                                  }}
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

      {/* Live columns only, same rule as the Properties tab: this tab is "what each table
          is", and a dropped column is not part of that. */}
      {tab === 1 && <Tables rows={live} />}
    </>
  );
}

/**
 * The permitted values for a constrained column, and — the part that matters — whether
 * they can be changed from here.
 *
 * Amber, on finding `project_type` listed as an enum: *"if it is in an enum type i need
 * to be able to edit in the app and each type should be a dropdown listing in that column
 * so i can add or edit it."* The listing half is straightforward and is what this does.
 * The editing half has a real answer that is not "yes", and the honest thing is to say
 * which of the two it is per property rather than to offer an editor that would fail:
 *
 *   rows in a lookup   — `teams`, and `stages` once the pipeline work lands. Adding one
 *                        is an ordinary INSERT under RLS. That is genuinely editable, and
 *                        this points at where.
 *   an enum or a CHECK — `ALTER TYPE ... ADD VALUE`, or dropping and recreating the
 *                        constraint. Both are DDL. PostgREST cannot issue DDL and no
 *                        policy can grant it, so no amount of app code makes this button
 *                        work: it is a migration, and it lands with the next one.
 *
 * A dropdown that silently did nothing would be the worse answer — it is exactly the
 * "currently data dictionary doesn't do anything" complaint, one layer down.
 */
function AllowedValuesCell({ allowed }: { allowed?: AllowedValues }) {
  const { teams } = useTeams();
  const { stageNames } = useStages();

  if (!allowed) return null;

  // Read live for the table-backed ones: the whole point of a lookup table is that it
  // changes, so a list frozen at build time would be wrong the first time it did.
  const live =
    allowed.lookup === "teams" ? teams.map(t => t.name)
    : allowed.lookup === "stages" ? stageNames
    : null;
  const values = allowed.values ?? live ?? [];

  const editable = allowed.source === "table";
  const where =
    allowed.source === "table" ? <>rows in <code>{allowed.holder}</code></>
    : allowed.source === "enum" ? <>the <code>{allowed.holder}</code> enum</>
    : <>the <code>{allowed.holder}</code> constraint</>;

  return (
    <details className="dict-values">
      <summary>
        {values.length ? `${values.length} value${values.length === 1 ? "" : "s"}` : "values"}
      </summary>
      <ul className="dict-value-list">
        {values.length === 0
          ? <li className="muted">Not readable yet — the lookup has not loaded.</li>
          : values.map(v => <li key={v}><code>{v}</code></li>)}
      </ul>
      <p className="dict-values-note">
        {editable ? <>Held as {where} — a team can be added and renamed from the app.</>
                  : <>Held in {where}. Adding or removing one is DDL, which PostgREST cannot
                     issue and no policy can grant — it takes a migration, not a screen.</>}
      </p>
    </details>
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
        // Tables whose every column is retired are tables that no longer exist —
        // `divisions` and `job_types` were both dropped. An empty card for one reads
        // as a table with no columns, which is a different and untrue thing.
        if (cols.length === 0) return null;
        // `merged` used to count as built. It is the opposite: a merged column was
        // folded into another one and does not exist, so counting it inflated every
        // table's progress by however many decisions had been reversed on it.
        const done = cols.filter(d => d.status === "created").length;
        return (
          <section className="panel" key={t}>
            <div className="panel-head">
              <Text type="text2" weight="bold"><code>{t}</code></Text>
              <Text type="text3" color="secondary">
                {cols.length} propert{cols.length === 1 ? "y" : "ies"} · {done} built
              </Text>
            </div>
            <p className="dict-table-purpose">
              {TABLE_DESCRIPTIONS[t] ?? "No purpose recorded for this table yet."}
            </p>
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
                      <td>
                        <span className="dict-type">{d.type}</span>
                        <AllowedValuesCell allowed={d.allowed} />
                      </td>
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
