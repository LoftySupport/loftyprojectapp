import { PageShell, NotWired } from "./Placeholder";

export function ReportsPage() {
  return (
    <PageShell title="Reports" subtitle="Portfolio health, leadership summary and the job report.">
      <NotWired
        table="jobs"
        description="Every report is a rollup of jobs and their stage history. Comes online once jobs and job_stages are wired."
      />
    </PageShell>
  );
}

export function AdminPage() {
  return (
    <PageShell title="Admin" subtitle="Users, teams and permissions.">
      <NotWired
        table="user_profiles"
        description="Wire listUsers() to fill this. Roles and teams are owned here, not in the identity provider."
      />
    </PageShell>
  );
}

export function SettingsPage() {
  return (
    <PageShell title="Settings" subtitle="Your details and preferences.">
      <NotWired
        table="user_profiles"
        description="Wire currentUser() to fill this. The theme switcher in the header already works without it."
      />
    </PageShell>
  );
}
