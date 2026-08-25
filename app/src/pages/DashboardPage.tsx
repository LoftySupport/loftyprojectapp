import { Avatar, Text } from "@vibe/core";
import { useQuery } from "../data/DataProvider";
import { initialsOf, useAuth } from "../data/AuthProvider";
import { greetingName } from "../data/types";
import { useTeamLabels } from "../data/useLookups";
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
  const { labels, error: teamsError } = useTeamLabels();

  // Joined rather than reduced to one: somebody can sit in several teams, and picking
  // the first would quietly answer a question this page is not asking.
  //
  // Three outcomes, not two. No profile yet is the token's case. A profile with no teams
  // is not — that is a real answer, and showing {{profiles.teams}} for it reads as a
  // broken screen rather than as "nobody has put you in a team".
  //
  // Through `labels`, because `profile.teams` is a list of foreign keys. This greeted
  // Amber with "lofty_general" — the slug, rendered straight — where the rest of the app
  // had long since started resolving a job's owning team through the same lookup.
  //
  // FOUR outcomes, and the fourth is the one that made it "still showing lofty_general"
  // after the first fix. This page's loading gate below waits on `listJobs()`, and
  // somebody with no jobs clears it immediately — while the teams read is still in
  // flight. `labels` returns null for that window rather than the slug, so there is
  // something real to render instead of a foreign key that looks like a name.
  const teamNames = profile?.teams.length ? labels(profile.teams) : null;
  const teamLabel: React.ReactNode = !profile
    ? <Token>profiles.teams</Token>
    : !profile.teams.length
      ? <span className="pd-unassigned">No team assigned</span>
      : teamNames
        ? teamNames.join(", ")
        // Blank while it loads — this is the greeting row, and a spinner in it would be
        // louder than the thing it is waiting for. If the lookup actually failed, say so:
        // silence forever reads as "you are in no team", which is a different fact.
        : <span className="pd-unassigned">{teamsError ? "Team names unavailable" : ""}</span>;

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
          <span className="pd-team-label">{teamLabel}</span>
          {/* Three teammates called "SB" used to sit here. They were invented — there is
              no query behind them — and three fictional colleagues on the page you land on
              is the most convincing wrong thing in the app. The real version is a read of
              your team's members, which profile_teams can already answer; until that is
              built, nothing belongs here. */}
        </div>
      </div>

      <div className="pd-grid">
        {/* left — identity, the headline figure, the workload block */}
        <div className="pd-col">
          <div className="pd-team-pill">
            <span className="pd-team-mark" aria-hidden="true" />
            <div>
              <div className="pd-team-name">{teamLabel}</div>
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
              {/* Was tagged "Live". These three figures are hardcoded zeroes, so the tag
                  was the one part of the panel making a claim, and the claim was false. */}
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
