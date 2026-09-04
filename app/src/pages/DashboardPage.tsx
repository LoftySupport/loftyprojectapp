import { Avatar, Button, Text } from "@vibe/core";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "../data/DataProvider";
import { initialsOf, useAuth } from "../data/AuthProvider";
import { greetingName, teamName } from "../data/types";
import type { MentionEntry } from "../data/types";
import { useTeamLabels, useTeams, useTemplatePhases } from "../data/useLookups";
import { daysSince } from "../data/boardModel";
import { Token, token } from "../components/Token";
import { ExportMenu } from "../components/ExportMenu";
import { tableFromFields, type ExportDocument } from "../data/export";
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
  /** The same read the bell makes — one source, so the two can never disagree. */
  const { data: mentions } = useQuery<MentionEntry[]>(r => r.listMyMentions(), []);
  const { profile } = useAuth();
  const { labels, error: teamsError } = useTeamLabels();
  const { teams } = useTeams();
  const { expectedDaysByStage } = useTemplatePhases();
  const navigate = useNavigate();

  // YOUR jobs, not all jobs — the assignee binding is real now, and this page once
  // claimed every job in the company was assigned to whoever was looking at it.
  // Sorted most-days-in-stage first, the prototype's order: the one that has sat
  // longest is the one to look at.
  const myJobs = profile
    ? jobs
        .filter(j => j.assigneeId === profile.id)
        .sort((a, b) => daysSince(b.stageEnteredAt) - daysSince(a.stageEnteredAt))
    : [];

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

  /**
   * Your jobs as a file — the middle column of this page, which is a list of cards and
   * therefore a table with the arrangement taken off.
   *
   * The two SLA figures the cards carry come along: days in stage, and the expected days
   * for that stage when the template sets one. Nothing else on this page exports, and
   * that is deliberate — the hero tile and the workload block are em dashes waiting on
   * the health calculation, and a spreadsheet column of dashes claims a figure was
   * computed.
   */
  const buildExport = (): ExportDocument => ({
    title: "My jobs",
    note: `${myJobs.length} job${myJobs.length === 1 ? "" : "s"} assigned to ${profile?.fullName ?? "you"}`,
    tables: [
      tableFromFields<(typeof myJobs)[number]>(
        "My jobs",
        [
          { label: "Job", text: j => j.id },
          { label: "Address", text: j => j.currentAddress ?? token("addresses.consolidated_address") },
          { label: "Stage", text: j => j.stage },
          { label: "Team", text: j => teamName(j.owningTeam, teams) },
          { label: "Days in stage", numeric: true, text: j => daysSince(j.stageEnteredAt) },
          // Blank rather than a dash where the template has no SLA for the stage: the
          // card says nothing there either, and a 0 would read as "no time allowed".
          { label: "Expected days", numeric: true, text: j => expectedDaysByStage[j.stage] ?? null }
        ],
        myJobs
      )
    ]
  });

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
        {/* Over the cards, which are what it downloads — and not inside the workload
            block, which is painted in the primary colour and would take a tertiary
            button's dark text with it. */}
        <div className="pd-centre-title">
          <span>Your jobs today</span>
          <ExportMenu build={buildExport} label="Export" disabled={myJobs.length === 0} />
        </div>
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
              {/* A real count now — this read `jobs.length`, which is every job in the
                  company, presented as yours. */}
              <div className="pd-team-sub">
                {myJobs.length} job{myJobs.length === 1 ? "" : "s"} assigned to you
              </div>
            </div>
          </div>

          {/* The hero was "0% of your jobs are on track", computed from nothing — the
              same claim the Reports page was cured of. The rate arrives with the health
              calculation; until then the tile says what it is waiting for. */}
          <div className="pd-hero">
            <div className="pd-hero-num">—</div>
            <div className="pd-hero-lbl">On-track rate — coming with the health calculation</div>
          </div>

          <div className="pd-activity">
            <div className="pd-activity-head">
              <span>Your workload</span>
            </div>
            <div className="pd-activity-stats">
              <div><div className="pd-stat-num">{myJobs.length}</div><div className="pd-stat-lbl">Assigned</div></div>
              {/* Em dashes, not zeroes: 0 claims the system checked and found nothing,
                  and nothing checks yet. Both wait on the health calculation reading the
                  SLAs now settable in Setup → Automations. */}
              <div><div className="pd-stat-num">—</div><div className="pd-stat-lbl">Need you</div></div>
              <div><div className="pd-stat-num">—</div><div className="pd-stat-lbl">Overdue</div></div>
            </div>
          </div>
        </div>

        {/* middle — your jobs, as cards. Real records: number, address, phase, team,
            days in stage against the SLA when one is set. */}
        <div className="pd-col pd-cards">
          {myJobs.length === 0 ? (
            <div className="pd-panel">
              <Empty>No jobs assigned to you right now.</Empty>
            </div>
          ) : (
            myJobs.map(j => {
              const days = daysSince(j.stageEnteredAt);
              const expected = expectedDaysByStage[j.stage];
              return (
                <div className="pd-card" key={j.id} style={{ borderStyle: "solid", minHeight: 0 }}>
                  <div className="pd-card-top">
                    <div>
                      <div className="pd-card-title">{j.currentAddress}</div>
                      <div className="pd-card-no">{j.id}</div>
                    </div>
                    <span className="pd-phase-tag">{j.stage}</span>
                  </div>
                  <div className="pd-card-grid">
                    <div>
                      <span className="pd-lbl">Team</span>
                      <span className="pd-val">{teamName(j.owningTeam, teams)}</span>
                    </div>
                    <div>
                      <span className="pd-lbl">In stage</span>
                      <span className="pd-val">
                        {expected != null ? `${days} of ${expected} days` : `${days} day${days === 1 ? "" : "s"}`}
                      </span>
                    </div>
                  </div>
                  <div className="pd-card-foot">
                    <Button size="small" kind="secondary" onClick={() => navigate(`/jobs/${j.id}`)}>
                      Open job
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* right — the three attention panels */}
        <div className="pd-col">
          <section className="pd-panel">
            <div className="pd-panel-head">
              <span className="pd-panel-mark" aria-hidden="true" />
              <h3>Needs your attention</h3>
            </div>
            {/* This said "all your jobs are on track" — a verdict nothing computes yet.
                Each panel now says what will fill it and what that waits on, which is
                Amber's Q4: notifications land here and on the bell this phase. */}
            <Empty>
              Coming soon — overdue, at-risk and waiting-on flags land here once the
              health calculation reads the stage SLAs.
            </Empty>
          </section>

          <section className="pd-panel">
            <div className="pd-panel-head">
              <span className="pd-panel-mark incoming" aria-hidden="true" />
              <h3>Heading to your team</h3>
            </div>
            <Empty>
              Coming soon — jobs one phase away from {teamNames?.length ? teamNames.join(", ") : "your team"} will
              show here once handoffs write the activity feed.
            </Empty>
          </section>

          <section className="pd-panel">
            <div className="pd-panel-head">
              <span className="pd-panel-mark mention" aria-hidden="true" />
              <h3>Mentions</h3>
            </div>
            {/* Real now — the same list the bell reads, because two places showing
                "your mentions" from two sources is two places to disagree. */}
            {mentions.length === 0 ? (
              <Empty>
                Nobody has mentioned you yet. Type @ in any comment to name somebody.
              </Empty>
            ) : (
              <ul className="notif-mentions">
                {mentions.slice(0, 5).map(m => (
                  <li key={m.commentId} className={m.readAt === null ? "is-unread" : undefined}>
                    <div className="notif-mention-head">
                      <Text type="text3" weight="medium" element="span">
                        {m.authorName ?? "Somebody"}
                      </Text>
                      <Text type="text3" color="secondary" element="span">
                        {new Date(m.at).toLocaleDateString()}
                      </Text>
                    </div>
                    <Text type="text3" element="div" ellipsis={false} className="notif-mention-body">
                      {m.body}
                    </Text>
                    {m.jobId && (
                      <Link to={`/jobs/${encodeURIComponent(m.jobId)}`} className="activity-subject">
                        {m.jobId}
                      </Link>
                    )}
                    {m.projectId != null && (
                      <Link to={`/projects/${m.projectId}`} className="activity-subject">
                        Project {m.projectId}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
