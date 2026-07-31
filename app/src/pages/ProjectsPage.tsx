import { Text } from "@vibe/core";
import { useQuery } from "../data/DataProvider";
import { PlaceholderProjectCard, UnboundNote } from "../components/PlaceholderCards";
import { PageShell } from "./Placeholder";

export function ProjectsPage() {
  const { data: projects, loading } = useQuery(r => r.listProjects(), []);
  const unbound = !loading && projects.length === 0;

  return (
    <PageShell
      title="Projects"
      subtitle={
        loading ? "Loading…" : unbound ? "Every project, and the jobs inside it." : `${projects.length} projects`
      }
    >
      {loading ? (
        <Text type="text2" color="secondary">Loading…</Text>
      ) : unbound ? (
        <UnboundNote table="projects">
          <div className="ph-grid ph-grid--wide">
            <PlaceholderProjectCard />
            <PlaceholderProjectCard />
          </div>
        </UnboundNote>
      ) : (
        <div className="panel">
          <Text type="text2">{projects.length} projects</Text>
        </div>
      )}
    </PageShell>
  );
}
