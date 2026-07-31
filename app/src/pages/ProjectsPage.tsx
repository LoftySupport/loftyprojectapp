import { Text } from "@vibe/core";
import { useQuery } from "../data/DataProvider";
import { PageShell, NotWired } from "./Placeholder";

export function ProjectsPage() {
  const { data: projects, loading } = useQuery(r => r.listProjects(), []);

  return (
    <PageShell title="Projects" subtitle="Every project, and the jobs inside it.">
      {loading ? (
        <Text type="text2" color="secondary">Loading…</Text>
      ) : projects.length === 0 ? (
        <NotWired
          table="projects"
          description="Wire listProjects() in supabaseRepository.ts and projects appear here. The page, its toolbar and its empty state are already the real ones."
        />
      ) : (
        <div className="panel">
          <Text type="text2">{projects.length} projects</Text>
        </div>
      )}
    </PageShell>
  );
}
