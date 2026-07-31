import { Text } from "@vibe/core";
import { useQuery } from "../data/DataProvider";
import { PlaceholderDashboardCard, UnboundNote } from "../components/PlaceholderCards";
import { PageShell } from "./Placeholder";

export function DashboardPage() {
  const { data: jobs, loading } = useQuery(r => r.listJobs(), []);
  const unbound = !loading && jobs.length === 0;

  return (
    <PageShell
      title="Dashboard"
      subtitle={
        loading
          ? "Loading…"
          : unbound
            ? "What is on your plate today."
            : "What is on your plate today."
      }
    >
      {loading ? (
        <Text type="text2" color="secondary">Loading…</Text>
      ) : unbound ? (
        <UnboundNote table="jobs">
          <div className="ph-grid">
            <PlaceholderDashboardCard />
            <PlaceholderDashboardCard />
            <PlaceholderDashboardCard />
          </div>
        </UnboundNote>
      ) : (
        <div className="panel">
          <Text type="text2">{jobs.length} jobs assigned to you</Text>
        </div>
      )}
    </PageShell>
  );
}
