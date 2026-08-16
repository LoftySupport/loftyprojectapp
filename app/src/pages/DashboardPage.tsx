import { Avatar, Text } from "@vibe/core";
import { useQuery } from "../data/DataProvider";
import { initialsOf, useAuth } from "../data/AuthProvider";
import { greetingName } from "../data/types";
import { Token } from "../components/Token";
import { PageShell } from "./Placeholder";
import "./DashboardPage.css";

/**
 * The personal dashboard, laid out as the prototype had it: greeting row, then
 * three columns — team pill, hero figure and workload block on the left, the job
 * cards in the middle, the three attention panels on the right.
 *
 * With nothing wired this is the prototype's own empty state, which is also what
 * a real user sees on a quiet day — so it is worth getting right rather than
 * papering over. Values that will come from a table show it.
 *
 * "Show it" means a token only while the value is genuinely unavailable. Your own
 * name, initials and teams are not: `currentProfile` is wired, AuthProvider already
 * holds the row, and the header has been greeting you by name from it all along.
 * Rendering {{profiles.first_name}} next to that was the template being honest about
 * a gap that had closed. The token stays as the fallback for the case it was built
 * for — no profile, or no teams on it — rather than being deleted, because the rest
 * of this page is still waiting on tables that do not have rows yet.
 */

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="pd-empty">{children}</div>;
}

export function DashboardPage() {
  const { data: jobs, loading } = useQuery(r => r.listJobs(), []);
  const { profile } = useAuth();

  // Joined rather than reduced to one: somebody can sit in several teams, and picking
  // the first would quietly answer a question this page is not asking.
  const teams = profile?.teams.length
    ? profile.teams.join(", ")
    : null;

  if (loading) {
    return (
      <PageShell title="Dashboard" subtitle="What is on your plate today.">
        <Text type="text2" color="secondary">Loading…</Text>
      </PageShell>
    );
  }

  return (
    <div className="pd-shell">
      <div className="pd-greeting-row">
        <div className="pd-greeting">
          <Avatar
            size="large"
            type="text"
            text={profile ? initialsOf(profile) : "…"}
            aria-label="You"
            className="pd-avatar"
          />
          <h2 className="pd-greeting-title">
            Hi, {profile ? greetingName(profile) : <Token>profiles.first_name</Token>}!
          </h2>
        </div>
        <div className="pd-centre-title">Your jobs today</div>
        <div className="pd-team">
          <span className="pd-team-label">{teams ?? <Token>profiles.teams</Token>}</span>
          <div className="pd-avatars">
            <Avatar size="small" type="text" text="SB" aria-label="Teammate" />
            <Avatar size="small" type="text" text="SB" aria-label="Teammate" />
            <Avatar size="small" type="text" text="SB" aria-label="Teammate" />
          </div>
        </div>
      </div>

      <div className="pd-grid">
        {/* left — identity, the headline figure, the workload block */}
        <div className="pd-col">
          <div className="pd-team-pill">
            <span className="pd-team-mark" aria-hidden="true" />
            <div>
              <div className="pd-team-name">{teams ?? <Token>profiles.teams</Token>}</div>
              <div className="pd-team-sub">{jobs.length} jobs assigned to you</div>
            </div>
          </div>

          <div className="pd-hero">
            <div className="pd-hero-num">0%</div>
            <div className="pd-hero-lbl">Of your jobs are on track</div>
          </div>

          <div className="pd-activity">
            <div className="pd-activity-head">
              <span>Your workload</span>
              <span className="pd-activity-tag">Live</span>
            </div>
            <div className="pd-activity-stats">
              <div><div className="pd-stat-num">0</div><div className="pd-stat-lbl">Assigned</div></div>
              <div><div className="pd-stat-num">0</div><div className="pd-stat-lbl">Need you</div></div>
              <div><div className="pd-stat-num">0</div><div className="pd-stat-lbl">Overdue</div></div>
            </div>
          </div>
        </div>

        {/* middle — the job cards */}
        <div className="pd-col pd-cards">
          <div className="pd-panel">
            <Empty>No jobs assigned to you right now.</Empty>
          </div>
        </div>

        {/* right — the three attention panels */}
        <div className="pd-col">
          <section className="pd-panel">
            <div className="pd-panel-head">
              <span className="pd-panel-mark" aria-hidden="true" />
              <h3>Needs your attention</h3>
            </div>
            <Empty>Nothing flagged — all your jobs are on track.</Empty>
          </section>

          <section className="pd-panel">
            <div className="pd-panel-head">
              <span className="pd-panel-mark incoming" aria-hidden="true" />
              <h3>Heading to your team</h3>
            </div>
            <Empty>
              Nothing due to hand over to <Token>profiles.teams</Token>.
            </Empty>
          </section>

          <section className="pd-panel">
            <div className="pd-panel-head">
              <span className="pd-panel-mark mention" aria-hidden="true" />
              <h3>Mentions</h3>
            </div>
            <Empty>No one has tagged you in a comment.</Empty>
          </section>
        </div>
      </div>
    </div>
  );
}
