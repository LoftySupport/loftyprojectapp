import { useCallback, useMemo, useState } from "react";
import { Button, Text, TextField } from "@vibe/core";
import { useQuery, useRepository } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import { useBoardRecords } from "../data/boardModel";
import { useProcesses, useStages, useTeams } from "../data/useLookups";
import { LoadProblem, NothingYet } from "../components/SearchNotices";
import { Problem } from "../components/Form";
import { useToasts } from "../components/Toasts";
import type { ReportTemplate } from "../data/types";
import type { CompiledReport, ReportStoreRow } from "../features/reports/index.js";
import {
  LOFTY_GROUPS,
  LOFTY_SEEDS,
  LOFTY_THEME,
  LOFTY_THEME_SPECS,
  LOFTY_WIDGETS,
  ReportBuilder,
  ReportOverlay,
  createReportEngine,
  createReportRegistry,
  createRepositoryTemplateStore,
  createThemeSet
} from "../features/reports/index.js";
import "../features/reports/reports.css";
import "../components/ui.css";

/**
 * Tools → Template Builder.
 *
 * The report builder from `amberbeaumont/modules → packages/report-builder`, wired to
 * Lofty's data. `src/features/reports/README.md` says what was changed on the way in;
 * this file is the whole of the wiring.
 *
 * WHAT A TEMPLATE IS, AND THE ONE THING THAT MAKES IT WORTH HAVING
 *
 *   A template is a list of blocks, not a list of rows. "The jobs table grouped by
 *   stage" is what is stored; the jobs are read out of the app every time somebody opens
 *   it. So a template built in September and used in March shows March's jobs, and the
 *   prose its author typed around them is kept verbatim. A builder that saved the rows
 *   would produce a document that looked current and was not — which is the same failure
 *   as the Reports page computing "45% on track" from a fixed array.
 *
 * WHAT PEOPLE CAN DO, BY RUNG
 *
 *   Everyone reads a template and can preview and export it. Manager and above builds
 *   and edits one; admin and above deletes one. The `can()` calls below decide which
 *   buttons render; the policies in migration 0094 decide what the database accepts, and
 *   they are the security. A viewer who reaches this screen gets Preview & export and no
 *   other control — not a disabled Edit button, and not a builder that looks editable
 *   and then refuses every autosave.
 */

// Built once at module scope. The registry is a pure description of the palette, so
// rebuilding it per render would only churn identities the memoised previews compare on.
const registry = createReportRegistry({ widgets: LOFTY_WIDGETS, groups: LOFTY_GROUPS });
const engine = createReportEngine(registry, { seeds: LOFTY_SEEDS });
const themes = createThemeSet(LOFTY_THEME_SPECS);

export function TemplateBuilderPage() {
  const repo = useRepository();
  const { can } = usePermission();
  const { toast } = useToasts();

  const canEdit = can("manager");
  const canDelete = can("admin");

  const [reloadKey, setReloadKey] = useState(0);
  const [open, setOpen] = useState<ReportStoreRow | null>(null);
  /** A compiled report, for the read-only Preview & export path. */
  const [preview, setPreview] = useState<{ model: CompiledReport; theme: string } | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const {
    data: templates, loading: templatesLoading, error: templatesError
  } = useQuery(r => r.listReportTemplates(), [], [reloadKey]);

  // ── The data every block resolves against ────────────────────────────────
  //
  // The same reads the boards use, so a report cannot disagree with the board it was
  // taken from — and already narrowed by RLS, so "every job" means every job this
  // person may see. The blocks say so in their hints.
  const { projects, jobs, loading: recordsLoading, error: recordsError } = useBoardRecords(reloadKey);
  const { teams } = useTeams();
  const { stageNames } = useStages();
  const { processes } = useProcesses();
  const { data: people } = useQuery(r => r.listProfiles(), []);

  // Memoised, and it is not an optimisation: a fresh `ctx` identity re-resolves every
  // block on every render, which makes typing in a text block feel broken.
  const ctx = useMemo(
    () => ({ projects, jobs, teams, stageNames, people, processes }),
    [projects, jobs, teams, stageNames, people, processes]
  );

  const store = useMemo(() => createRepositoryTemplateStore(repo), [repo]);

  const nameTaken = templates.some(
    t => t.name.trim().toLowerCase() === newName.trim().toLowerCase()
  );

  const create = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setProblem(null);
    try {
      const row = await store.create({ title: name, layout: { widgets: [] } });
      setNewName("");
      setReloadKey(k => k + 1);
      setOpen(row);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }, [newName, store]);

  const remove = useCallback(async (t: ReportTemplate) => {
    if (!window.confirm(`Delete the template “${t.name}”? Everyone shares these, so it goes for the whole company.`)) return;
    setProblem(null);
    try {
      await repo.deleteReportTemplate(t.id);
      setReloadKey(k => k + 1);
      toast(`Deleted “${t.name}”.`, "positive");
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    }
  }, [repo, toast]);

  /**
   * Open the builder on a template.
   *
   * Re-read through the store rather than handed the row the list is holding. The list
   * was fetched when the tab opened, and these are shared: somebody else may have
   * changed the layout since. The builder autosaves whatever it was given, so opening a
   * stale copy would write the stale copy back over their work.
   */
  const openForEdit = useCallback(async (t: ReportTemplate) => {
    setProblem(null);
    try {
      setOpen(await store.get(t.id));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
      setReloadKey(k => k + 1);
    }
  }, [store]);

  /**
   * Preview & export without opening the builder.
   *
   * `engine.compile` resolves every block against `ctx` right now and returns the same
   * model the builder's own preview hands to the overlay — so print, PDF, Word, Markdown
   * and HTML all come out of one pipeline whether or not the reader may edit.
   */
  const previewTemplate = useCallback((t: ReportTemplate) => {
    setPreview({
      model: engine.compile({ title: t.name }, t.layout?.widgets ?? [], ctx),
      theme: t.layout?.theme ?? LOFTY_THEME.key
    });
  }, [ctx]);

  if (templatesError) return <LoadProblem error={templatesError} />;

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <Text type="text2" weight="bold">Report templates</Text>
          <Text type="text3" color="secondary">
            {canEdit
              ? "shared by everyone — a change here changes the report the whole company sends"
              : "read-only below manager — preview and export any of these"}
          </Text>
        </div>
        <Text type="text2" color="secondary" ellipsis={false}>
          A template holds the <em>question</em> — “the jobs table grouped by stage”, “the
          teams’ workload” — never the answer. Open one and it reads the app as it is
          today, so the same template is a September report in September and a March
          report in March. The prose you type around the blocks is kept as you wrote it.
        </Text>

        {/* `panel-actions` rather than `page-head-row`: that one is space-between, which
            sent Vibe's full-width TextField across the panel and wrapped the button onto
            its own line. The field gets a flex basis so the two sit together and still
            wrap on a phone. */}
        {canEdit && (
          <div className="panel-actions" style={{ marginTop: "var(--space-12)" }}>
            <span style={{ flex: "0 1 280px", minWidth: 0 }}>
              <TextField
                id="new-template-name"
                placeholder="Name a new template…"
                value={newName}
                onChange={setNewName}
                size="small"
                inputAriaLabel="Name for a new report template"
                onKeyDown={e => { if (e.key === "Enter" && !nameTaken) void create(); }}
              />
            </span>
            <Button
              size="small"
              onClick={() => void create()}
              disabled={!newName.trim() || nameTaken || creating}
            >
              {creating ? "Creating…" : "New template"}
            </Button>
            {/* Said before the save rather than after it: the unique constraint would
                otherwise answer with a database error the moment they press the button. */}
            {nameTaken && (
              <Text type="text3" color="secondary">
                There is already a template with that name.
              </Text>
            )}
          </div>
        )}

        {problem && <Problem>{problem}</Problem>}

        {templatesLoading ? (
          <Text type="text2" color="secondary">Loading…</Text>
        ) : templates.length === 0 ? (
          <NothingYet
            title="No templates yet"
            description={
              canEdit
                ? "Name one above and the builder opens on an empty page — drag blocks in from the palette, or start from one of the drafts it offers."
                : "Nobody has built a report template yet. Manager and above can create one."
            }
          />
        ) : (
          <div className="data-table-wrap" style={{ marginTop: "var(--space-12)" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Template</th>
                  <th>Blocks</th>
                  <th>Last changed</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {templates.map(t => (
                  <tr key={t.id}>
                    <td><Text type="text2" weight="medium">{t.name}</Text></td>
                    <td><Text type="text2">{t.layout?.widgets?.length ?? 0}</Text></td>
                    <td>
                      {/* The date, and the person only when the database knows one. A
                          template written by a migration or a script has no author, and
                          a name invented for it would be quoted back as though somebody
                          had made that edit. */}
                      <Text type="text2">
                        {new Date(t.updatedAt).toLocaleDateString("en-AU")}
                        {t.updatedBy
                          ? ` · ${people.find(p => p.id === t.updatedBy)?.fullName ?? "someone no longer listed"}`
                          : ""}
                      </Text>
                    </td>
                    <td>
                      <div className="row-actions">
                        <Button
                          size="small"
                          kind="tertiary"
                          onClick={() => previewTemplate(t)}
                          disabled={recordsLoading}
                        >
                          Preview &amp; export
                        </Button>
                        {canEdit && (
                          <Button
                            size="small"
                            kind="tertiary"
                            onClick={() => void openForEdit(t)}
                          >
                            Edit
                          </Button>
                        )}
                        {canDelete && (
                          <Button size="small" kind="tertiary" onClick={() => void remove(t)}>
                            Delete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* The reads behind the blocks, failing loudly. A builder whose ctx never
            arrived renders every block as "no jobs yet", which is the same sentence as
            the truth on an empty database and a lie on a full one. */}
        {recordsError && <LoadProblem error={recordsError} />}
      </section>

      {/* Both render into a portal over the whole viewport, so neither needs a slot in
          the page's layout. */}
      {open && (
        <ReportBuilder
          report={open}
          engine={engine}
          store={store}
          ctx={ctx}
          themes={themes}
          branding="Lofty"
          canSaveTemplate={false}
          onClose={() => { setOpen(null); setReloadKey(k => k + 1); }}
          onSaved={(row: ReportStoreRow) => setOpen(row)}
        />
      )}

      {preview && (
        <ReportOverlay
          report={preview.model}
          themes={themes}
          initialTheme={preview.theme}
          branding="Lofty"
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}
