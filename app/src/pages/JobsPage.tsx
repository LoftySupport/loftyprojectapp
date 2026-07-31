import { Counter, Text } from "@vibe/core";
import { useQuery } from "../data/DataProvider";
import { PlaceholderJobCard } from "../components/PlaceholderJobCard";
import { PageShell } from "./Placeholder";

/**
 * The board, rendered from the stages lookup. Columns exist before any job does.
 *
 * While `listJobs()` is unwired each column shows one placeholder card — the real
 * card geometry with every value replaced by the column it will come from. An
 * empty column tells you nothing about what a job looks like; this shows the
 * structure and doubles as the binding checklist. It disappears on its own the
 * moment jobs start coming back.
 */
export function JobsPage() {
  const { data: stages } = useQuery(r => r.listStages(), []);
  const { data: jobs, loading } = useQuery(r => r.listJobs(), []);
  const unbound = !loading && jobs.length === 0;

  return (
    <PageShell
      title="Jobs"
      subtitle={
        loading
          ? "Loading…"
          : unbound
            ? `${stages.length} stages · cards show the structure, not data — jobs is not wired yet`
            : `${jobs.length} jobs across ${stages.length} stages`
      }
    >
      <div className="board">
        {stages.map(stage => {
          const inStage = jobs.filter(() => false); // wired when job_stages lands
          return (
            <section className="board-column" key={stage.id}>
              <div className="board-column-head">
                <div>
                  <Text type="text3" color="secondary">Stage</Text>
                  <Text type="text2" weight="medium">{stage.name}</Text>
                </div>
                <Counter count={inStage.length} kind="line" />
              </div>

              {unbound ? (
                <PlaceholderJobCard stageName={stage.name} />
              ) : (
                <div className="board-column-empty">
                  <Text type="text3" color="secondary">No jobs</Text>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </PageShell>
  );
}
