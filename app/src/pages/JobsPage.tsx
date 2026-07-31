import { Counter, Text } from "@vibe/core";
import { useQuery } from "../data/DataProvider";
import { PageShell } from "./Placeholder";

/**
 * The board, rendered from the stages lookup. Columns exist before any job does —
 * which is the point: the structure is real, the rows arrive later.
 */
export function JobsPage() {
  const { data: stages } = useQuery(r => r.listStages(), []);
  const { data: jobs, loading } = useQuery(r => r.listJobs(), []);

  return (
    <PageShell
      title="Jobs"
      subtitle={loading ? "Loading…" : `${jobs.length} jobs across ${stages.length} stages`}
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
              <div className="board-column-empty">
                <Text type="text3" color="secondary">No jobs</Text>
              </div>
            </section>
          );
        })}
      </div>
    </PageShell>
  );
}
