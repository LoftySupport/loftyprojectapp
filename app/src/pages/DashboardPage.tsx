import { PageShell, NotWired } from "./Placeholder";

export function DashboardPage() {
  return (
    <PageShell title="Dashboard" subtitle="What is on your plate today.">
      <NotWired
        table="user_profiles"
        description="Your jobs, what needs attention and what is heading to your team. Comes online once user_profiles and jobs are wired."
      />
    </PageShell>
  );
}
