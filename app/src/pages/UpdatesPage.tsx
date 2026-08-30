import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Button, Heading, Tab, TabList, Text, TextArea, TextField } from "@vibe/core";
import { ThumbsUp } from "@vibe/icons";
import { CommentsPanel } from "../components/CommentsPanel";
import { useQuery, useRepository } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import { useFeedback } from "../components/Feedback";
import { Field, Problem } from "../components/Form";
import { Select } from "../components/Select";
import { SidePanel } from "../components/SidePanel";
import { LoadProblem } from "../components/SearchNotices";
import {
  FEEDBACK_OPEN_STAGES, FEEDBACK_STAGES, FEEDBACK_STAGE_LABELS, FEEDBACK_STAGE_MEANING,
  RELEASE_ENTRY_KINDS, RELEASE_ENTRY_KIND_LABELS, ROADMAP_PHASE_STATUSES,
  ROADMAP_PHASE_STATUS_LABELS,
  type FeedbackItem, type FeedbackKind, type FeedbackStage, type FeedbackVoter,
  type Release, type ReleaseEntryKind, type RoadmapPhase, type RoadmapPhaseStatus
} from "../data/types";
import "../components/ui.css";
import "./UpdatesPage.css";

/**
 * Updates — the queue, the plan, and what has shipped.
 *
 * Amber, 30 Aug: *"to have a feature request and bug tracker so users can see where their
 * requests are in the queue and so they can see product updates… This will help stop
 * people saying I want this to happen when it is already planned. Also when managers help
 * plan next phase it is clear and ordered."*
 *
 * WHY ONE DESTINATION WITH THREE TABS. They are three tenses of one question — what did
 * you do with my request. Requests is now, Roadmap is next, Changelog is done. Split
 * across three nav items they would each be visited by whoever remembered them; together,
 * somebody who came to complain that nothing has happened lands one tab away from the
 * evidence that it has.
 *
 * WHY IT IS NOT IN SETUP. The Setup tabs (0052) were an admin triage list and still are —
 * the page, the browser, the error, the screenshots, all the things a person fixing a bug
 * needs. This is the same table read the other way round: what everybody can see. The two
 * screens exist for two audiences, which is why widening the read policy (0060) did not
 * simply mean showing everyone the admin table.
 *
 * NOTHING HERE INVENTS A NUMBER. No "62% delivered", no progress bar over phases nobody
 * has dated, no vote count that is anything other than rows in `feedback_votes`. An empty
 * roadmap says the roadmap is empty; it does not draw three plausible phases.
 */

const SECTIONS = [
  { slug: "requests", label: "Requests" },
  { slug: "roadmap", label: "Roadmap" },
  { slug: "changelog", label: "Changelog" }
] as const;

export function UpdatesPage() {
  const { section } = useParams();
  const navigate = useNavigate();
  const index = SECTIONS.findIndex(s => s.slug === section);

  // /updates on its own is a reasonable thing to type or link, and it should land
  // somewhere rather than error. Requests first: it is what most people came for.
  if (index === -1) return <Navigate to="/updates/requests" replace />;

  return (
    <>
      <div className="page-head">
        <Heading type="h2" weight="bold">Updates</Heading>
        <Text type="text2" color="secondary">
          What has been asked for, what is planned, and what has shipped.
        </Text>
      </div>

      <TabList activeTabId={index} onTabChange={i => navigate(`/updates/${SECTIONS[i].slug}`)}>
        {SECTIONS.map(s => <Tab key={s.slug}>{s.label}</Tab>)}
      </TabList>

      <div style={{ marginTop: "var(--space-16)" }}>
        {section === "requests" && <Requests />}
        {section === "roadmap" && <Roadmap />}
        {section === "changelog" && <Changelog />}
      </div>
    </>
  );
}

// ===================================================================== requests

const KIND_FILTERS = [
  { value: "all", label: "Everything" },
  { value: "idea", label: "Ideas and requests" },
  { value: "bug", label: "Bugs" }
];

const SORTS = [
  { value: "votes", label: "Most voted" },
  { value: "newest", label: "Newest" }
];

/**
 * The board.
 *
 * Four columns, in the order Amber named them, and the two endings underneath rather than
 * as a fifth and sixth column. That is the same call the lifecycle board makes about
 * Completed and Cancelled, and for the same reason: a column of 300 shipped things
 * squashes the four that are live into a quarter of the screen.
 */
function Requests() {
  const repo = useRepository();
  const { can } = usePermission();
  const { report } = useFeedback();
  const [reloadKey, setReloadKey] = useState(0);
  const { data: items, loading, error } = useQuery(r => r.listFeedback(), [], [reloadKey]);
  const { data: phases } = useQuery(r => r.listRoadmapPhases(), [], [reloadKey]);
  const [kind, setKind] = useState<"all" | FeedbackKind>("all");
  const [sort, setSort] = useState<"votes" | "newest">("votes");
  const [openId, setOpenId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busyVote, setBusyVote] = useState<string | null>(null);
  // The vote a click has already changed, held here so the thumb and the count update
  // from the row the database returned rather than from a guess.
  const [voted, setVoted] = useState<Record<string, { count: number; mine: boolean }>>({});

  const withVotes = (f: FeedbackItem): FeedbackItem => {
    const v = voted[f.id];
    return v ? { ...f, voteCount: v.count, votedByMe: v.mine } : f;
  };

  const shown = useMemo(() => {
    const list = items
      .filter(f => kind === "all" || f.kind === kind)
      // A merged duplicate is off the board (0066): its votes and followers are on the
      // survivor, so leaving it here would show the same request twice with the count
      // split across them — the exact fault merging exists to fix. It is still reachable:
      // the person who filed it finds it by searching, and it says where it went.
      .filter(f => f.mergedIntoId === null)
      .map(withVotes);
    return list.sort((a, b) =>
      sort === "votes"
        ? b.voteCount - a.voteCount || Date.parse(b.createdAt) - Date.parse(a.createdAt)
        : Date.parse(b.createdAt) - Date.parse(a.createdAt)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, kind, sort, voted]);

  const byStage = (stage: FeedbackStage) => shown.filter(f => f.stage === stage);

  const vote = async (f: FeedbackItem) => {
    setBusyVote(f.id);
    setProblem(null);
    try {
      const fresh = await repo.setFeedbackVote(f.id, !f.votedByMe);
      setVoted(v => ({ ...v, [f.id]: { count: fresh.voteCount, mine: fresh.votedByMe } }));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyVote(null);
    }
  };

  const open = shown.find(f => f.id === openId) ?? null;

  return (
    <section className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">Requests and bugs</Text>
        <Text type="text3" color="secondary">
          {shown.length} {shown.length === 1 ? "item" : "items"}
        </Text>
      </div>
      <Text type="text2" color="secondary" ellipsis={false}>
        Everything anyone has sent in, and where it has got to. Thumbs up the ideas you
        want — one vote each, and the count is what gets read when the next phase is
        planned.
      </Text>

      <div className="updates-bar">
        <div className="select-wrap">
          <Select options={KIND_FILTERS} value={kind} onChange={v => setKind(v as "all" | FeedbackKind)}
                  aria-label="Show" size="small" />
        </div>
        <div className="select-wrap">
          <Select options={SORTS} value={sort} onChange={v => setSort(v as "votes" | "newest")}
                  aria-label="Sort by" size="small" />
        </div>
        <span className="updates-bar-spacer" />
        <Button size="small" onClick={() => report()}>Report something</Button>
      </div>

      {error && <LoadProblem error={error} />}
      {problem && <Problem>{problem}</Problem>}

      {!loading && items.length === 0 && (
        // Empty is empty. Nobody has sent one yet, which is a different statement from
        // "no results" and is what a brand-new tracker actually looks like.
        <Text type="text2" color="secondary" element="p" ellipsis={false}
              style={{ marginTop: "var(--space-12)" }}>
          Nothing has been sent in yet. The footer on every page is where it starts.
        </Text>
      )}

      {items.length > 0 && (
        <>
          <div className="updates-board">
            {FEEDBACK_OPEN_STAGES.map(stage => {
              const column = byStage(stage);
              return (
                <div key={stage} className={`updates-col updates-col-${stage}`}>
                  <div className="updates-col-head">
                    <Text type="text2" weight="bold" element="div">
                      {FEEDBACK_STAGE_LABELS[stage]}
                    </Text>
                    <span className="updates-count">{column.length}</span>
                  </div>
                  <Text type="text3" color="secondary" element="div" ellipsis={false}
                        className="updates-col-meaning">
                    {FEEDBACK_STAGE_MEANING[stage]}
                  </Text>
                  <div className="updates-cards">
                    {column.map(f => (
                      <RequestCard
                        key={f.id}
                        item={f}
                        phase={phases.find(p => p.id === f.roadmapPhaseId) ?? null}
                        busy={busyVote === f.id}
                        onVote={() => void vote(f)}
                        onOpen={() => setOpenId(f.id)}
                      />
                    ))}
                    {column.length === 0 && (
                      <Text type="text3" color="secondary" element="div" ellipsis={false}>
                        Nothing here.
                      </Text>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <Ended
            title="Shipped"
            note="Out and in use. The changelog says which release."
            items={byStage("shipped")}
            onOpen={setOpenId}
          />
          <Ended
            title="Declined"
            note="Read, considered, and not going ahead — kept so the answer does not get lost."
            items={byStage("declined")}
            onOpen={setOpenId}
          />
        </>
      )}

      <RequestPanel
        item={open}
        all={items}
        phases={phases}
        canMove={can("superadmin")}
        canPlan={can("admin")}
        onClose={() => setOpenId(null)}
        onChanged={() => setReloadKey(k => k + 1)}
        onVote={vote}
        busyVote={busyVote}
      />
    </section>
  );
}

function RequestCard({
  item, phase, busy, onVote, onOpen
}: {
  item: FeedbackItem;
  phase: RoadmapPhase | null;
  busy: boolean;
  onVote: () => void;
  onOpen: () => void;
}) {
  return (
    <article className="updates-card">
      <button type="button" className="updates-card-open" onClick={onOpen}>
        <span className={`updates-kind updates-kind-${item.kind}`}>
          {item.kind === "bug" ? "Bug" : "Request"}
        </span>
        <Text type="text2" weight="medium" element="span" ellipsis={false}>{item.title}</Text>
        <Text type="text3" color="secondary" element="span" ellipsis={false}>
          {/* An em dash, not "Unknown": the profile is gone, and naming somebody would be
              a claim about who sent it. */}
          {item.fromName ?? "—"} · {new Date(item.createdAt).toLocaleDateString()}
        </Text>
        <span className="updates-card-chips">
          {phase && <span className="updates-phase-chip">{phase.name}</span>}
          {item.commentCount > 0 && (
            <span className="updates-chip">{item.commentCount} 💬</span>
          )}
          {/* Why this count is large: it absorbed other requests. Without this the number
              looks either inflated or lucky. */}
          {item.duplicateCount > 0 && (
            <span className="updates-chip">+{item.duplicateCount} merged</span>
          )}
          {/* Only ever shown to the person following it — feedback_move_unseen is
              computed against the signed-in profile. */}
          {item.moveUnseen && <span className="updates-chip is-new">Moved</span>}
        </span>
      </button>
      <VoteButton item={item} busy={busy} onVote={onVote} />
    </article>
  );
}

/**
 * The thumb.
 *
 * Pressed state on `aria-pressed` rather than on colour alone, and the label says the
 * count out loud — "12 votes, you have voted" — because a filled thumb next to a number
 * is a picture, and a screen reader reads it as "button, 12".
 */
function VoteButton({ item, busy, onVote }: { item: FeedbackItem; busy: boolean; onVote: () => void }) {
  return (
    <button
      type="button"
      className={"updates-vote" + (item.votedByMe ? " is-on" : "")}
      onClick={onVote}
      disabled={busy}
      aria-pressed={item.votedByMe}
      aria-label={
        `${item.voteCount} ${item.voteCount === 1 ? "vote" : "votes"}` +
        (item.votedByMe ? ", you have voted — click to take it back" : ", click to vote")
      }
    >
      <ThumbsUp size={16} aria-hidden />
      <span>{item.voteCount}</span>
    </button>
  );
}

/** Shipped and Declined: real, and deliberately not columns. Collapsed until asked for. */
function Ended({
  title, note, items, onOpen
}: {
  title: string;
  note: string;
  items: FeedbackItem[];
  onOpen: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <details className="updates-ended">
      <summary>
        <Text type="text2" weight="medium" element="span">{title}</Text>
        <span className="updates-count">{items.length}</span>
      </summary>
      <Text type="text3" color="secondary" element="div" ellipsis={false}>{note}</Text>
      <ul className="updates-ended-list">
        {items.map(f => (
          <li key={f.id}>
            <button type="button" className="link-button" onClick={() => onOpen(f.id)}>
              {f.title}
            </button>
            <Text type="text3" color="secondary" element="span">
              {" "}· {f.fromName ?? "—"}
            </Text>
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * One request, opened.
 *
 * The two controls at the bottom are the whole permission model on this screen, and they
 * are at two different rungs on purpose: **superadmin** moves a request between stages
 * (Amber's instruction, enforced by `guard_feedback_stage_change()`), **admin** plans one
 * into a phase. Both are hidden below their rung, and hiding them is politeness — the
 * database refuses either way, which is what makes it safe to show this panel to
 * everybody.
 */
function RequestPanel({
  item, all, phases, canMove, canPlan, onClose, onChanged, onVote, busyVote
}: {
  item: FeedbackItem | null;
  /** Every request, for the merge picker — a duplicate is merged into one of these. */
  all: FeedbackItem[];
  phases: RoadmapPhase[];
  canMove: boolean;
  canPlan: boolean;
  onClose: () => void;
  onChanged: () => void;
  onVote: (item: FeedbackItem) => Promise<void>;
  busyVote: string | null;
}) {
  const repo = useRepository();
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shots, setShots] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [showVoters, setShowVoters] = useState(false);
  const { data: people } = useQuery(r => r.listProfiles(), [], []);
  /**
   * Opening it IS having seen it — the same rule the bell uses for a mention.
   *
   * Only when there is something to mark: an unconditional write on every open would
   * touch the row for people who do not follow it at all (matching nothing, by policy)
   * and would cost a request per card opened.
   */
  useEffect(() => {
    if (item?.moveUnseen) {
      void repo.markMoveSeen(item.id).then(onChanged).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, item?.moveUnseen]);

  const { data: voters } = useQuery<FeedbackVoter[]>(
    r => (item && showVoters ? r.listFeedbackVoters(item.id) : Promise.resolve([])),
    [], [item?.id, showVoters]
  );

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setProblem(null);
    try {
      await work();
      onChanged();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // Asked for when the panel opens, not when the board renders: the bucket is private, a
  // signed URL expires, and minting one per card for a board of forty would be forty
  // round trips for pictures nobody has opened.
  const showShot = async (path: string) => {
    if (shots[path]) return;
    const url = await repo.attachmentUrl(path);
    if (url) setShots(s => ({ ...s, [path]: url }));
  };

  return (
    <SidePanel open={item !== null} title={item?.title ?? ""} onClose={onClose}>
      {item && (
        <div className="create-form">
          <div className="updates-panel-head">
            <span className={`updates-kind updates-kind-${item.kind}`}>
              {item.kind === "bug" ? "Bug" : "Request"}
            </span>
            <span className="updates-stage-chip">{FEEDBACK_STAGE_LABELS[item.stage]}</span>
            <VoteButton item={item} busy={busyVote === item.id} onVote={() => void onVote(item)} />
          </div>

          <Text type="text3" color="secondary" element="div" ellipsis={false}>
            From {item.fromName ?? "—"} on {new Date(item.createdAt).toLocaleDateString()}
            {" · "}in {FEEDBACK_STAGE_LABELS[item.stage].toLowerCase()} since{" "}
            {new Date(item.stageEnteredAt).toLocaleDateString()}
          </Text>

          {/* Where it went, for the person who filed the duplicate. The whole reason a
              merged request is kept rather than deleted. */}
          {item.mergedIntoId && (
            <div className="updates-merged-notice">
              <Text type="text2" element="span" ellipsis={false}>
                Merged into “{item.mergedIntoTitle ?? "another request"}” — the votes and
                the conversation moved there.
              </Text>
            </div>
          )}

          {item.detail
            ? <Text type="text2" element="p" ellipsis={false}>{item.detail}</Text>
            : <Text type="text2" color="secondary" element="p" ellipsis={false}>
                No detail was written — the one line above is all of it.
              </Text>}

          <dl className="updates-facts">
            <dt>Page</dt>
            <dd>{item.page ? <span className="dict-type">{item.page}</span> : "—"}</dd>
            <dt>Error</dt>
            <dd>{item.errorText ? <span className="dict-type">{item.errorText}</span> : "—"}</dd>
          </dl>

          {item.attachments.length > 0 && (
            <Field label="Screenshots">
              <ul className="updates-shots">
                {item.attachments.map(a => (
                  <li key={a.id}>
                    {shots[a.path]
                      ? <a href={shots[a.path]} target="_blank" rel="noreferrer">
                          <img src={shots[a.path]} alt={a.name} />
                        </a>
                      : <button type="button" className="link-button"
                                onClick={() => void showShot(a.path)}>
                          Show {a.name}
                        </button>}
                  </li>
                ))}
              </ul>
            </Field>
          )}

          <div className="updates-panel-actions">
            {/* Voting already follows you (0065), so this is for the case Canny's bell
                exists for: you did not vote, but you want to know what happens. */}
            <button
              type="button"
              className={"updates-follow" + (item.followedByMe ? " is-on" : "")}
              aria-pressed={item.followedByMe}
              onClick={() => void run(() => repo.setFeedbackFollow(item.id, !item.followedByMe))}
            >
              {item.followedByMe ? "Following — you'll hear when it moves" : "Follow this"}
            </button>
            <button type="button" className="link-button" onClick={() => setShowVoters(v => !v)}>
              {showVoters ? "Hide who voted" : `Who voted (${item.voteCount})`}
            </button>
          </div>

          {showVoters && (
            <ul className="updates-voters">
              {voters.length === 0 && (
                <li><Text type="text3" color="secondary">Nobody yet.</Text></li>
              )}
              {voters.map(v => (
                <li key={v.profileId}>
                  <Text type="text3" element="span">{v.name ?? "—"}</Text>
                  {/* The audit that makes vote-on-behalf trustworthy (0067): the count
                      can be checked by the people it is counted against. */}
                  {v.addedByName && (
                    <Text type="text3" color="secondary" element="span">
                      {" "}· added by {v.addedByName}
                    </Text>
                  )}
                </li>
              ))}
              {canPlan && (
                <li>
                  <div className="select-wrap">
                    <Select
                      options={people
                        .filter(p => p.active && !voters.some(v => v.profileId === p.id))
                        .map(p => ({ value: p.id, label: p.fullName }))}
                      value={null}
                      clearable
                      placeholder="Add somebody who asked for this…"
                      onChange={v => v && void run(() => repo.addVoteFor(item.id, v))}
                      aria-label="Add a voter"
                      size="small"
                    />
                  </div>
                  <Text type="text3" color="secondary" element="div" ellipsis={false}>
                    For a request that arrived on a call or on site. Your name is recorded
                    beside it, and only they can take it back.
                  </Text>
                </li>
              )}
            </ul>
          )}

          {canMove && (
            <Field
              label="Stage"
              hint="Only superadmin can move a request along the queue. Whoever follows it hears about the move."
            >
              <Select
                options={FEEDBACK_STAGES.map(s => ({ value: s, label: FEEDBACK_STAGE_LABELS[s] }))}
                value={item.stage}
                onChange={v => void run(async () => {
                  const result = await repo.setFeedbackStage(item.id, v as FeedbackStage, note);
                  setNote("");
                  return result;
                })}
                aria-label="Stage"
                className={busy ? "is-busy" : undefined}
              />
              {/* Canny's status update: the move arrives with a sentence rather than as a
                  silent change. Typed BEFORE the move, because the select is what commits
                  it — a note box that appeared afterwards would be a second step people
                  skip. */}
              <TextField
                value={note}
                onChange={setNote}
                placeholder="Optional: why, or what happens next"
                inputAriaLabel="Note to send with the move"
              />
            </Field>
          )}

          {canPlan && (
            <Field
              label="Roadmap phase"
              hint={phases.length === 0
                ? "No phases yet — add them on the Roadmap tab."
                : "Which phase this is planned into."}
            >
              <Select
                options={phases.map(p => ({ value: p.id, label: p.name }))}
                value={item.roadmapPhaseId}
                clearable
                placeholder="Not planned into a phase"
                onChange={v => void run(() => repo.setFeedbackPhase(item.id, v))}
                aria-label="Roadmap phase"
                className={busy ? "is-busy" : undefined}
              />
            </Field>
          )}

          {canPlan && (
            <Field
              label="Duplicate of"
              hint="Merging moves the votes and the followers to the other request. Nothing is deleted."
            >
              <div className="select-wrap">
                <Select
                  options={all
                    .filter(f => f.id !== item.id && f.mergedIntoId === null)
                    .map(f => ({ value: f.id, label: `${f.title} (${f.voteCount})` }))}
                  value={item.mergedIntoId}
                  clearable
                  placeholder="Not a duplicate"
                  onChange={v => void run(() => repo.mergeFeedback(item.id, v))}
                  aria-label="Merge into"
                  className={busy ? "is-busy" : undefined}
                />
              </div>
            </Field>
          )}

          {problem && <Problem>{problem}</Problem>}

          {/* The thread. Same component as a job's, so @mentions, the picker and the
              bell all work here without a second implementation of any of them. */}
          <CommentsPanel feedbackId={item.id} title="Discussion" />
        </div>
      )}
    </SidePanel>
  );
}

// ====================================================================== roadmap

/**
 * The phases, with the dates Amber shows people, and what is planned into each.
 *
 * An undated phase is drawn as undated — "no dates set" — and not estimated from the
 * phases either side of it. That is the house rule about invented values, and this is the
 * screen where breaking it would do the most damage: a date on a roadmap gets quoted back
 * as a commitment by whoever read it.
 */
function Roadmap() {
  const repo = useRepository();
  const { can } = usePermission();
  const [reloadKey, setReloadKey] = useState(0);
  const { data: phases, loading, error } = useQuery(r => r.listRoadmapPhases(), [], [reloadKey]);
  const { data: items } = useQuery(r => r.listFeedback(), [], [reloadKey]);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const canEdit = can("superadmin");

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setProblem(null);
    try {
      await work();
      setReloadKey(k => k + 1);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">Roadmap</Text>
        {canEdit && (
          <Button size="small" onClick={() => setAdding(true)}>Add a phase</Button>
        )}
      </div>
      <Text type="text2" color="secondary" ellipsis={false}>
        The phases the build is planned in, and what is going into each. Dates are the
        intention, not a promise — a phase with no dates set has not been scheduled yet.
      </Text>

      {error && <LoadProblem error={error} />}
      {problem && <Problem>{problem}</Problem>}

      {!loading && phases.length === 0 && (
        <Text type="text2" color="secondary" element="p" ellipsis={false}
              style={{ marginTop: "var(--space-12)" }}>
          {/* Not three plausible phases. The roadmap is empty until somebody writes one. */}
          No phases yet.{canEdit ? " Add the first one above." : " Amber sets these up."}
        </Text>
      )}

      <ol className="roadmap">
        {phases.map((p, i) => (
          <PhaseCard
            key={p.id}
            phase={p}
            planned={items.filter(f => f.roadmapPhaseId === p.id)}
            canEdit={canEdit}
            busy={busy}
            first={i === 0}
            last={i === phases.length - 1}
            onSave={patch => run(() => repo.updateRoadmapPhase(p.id, patch))}
            onMove={d => run(() => repo.moveRoadmapPhase(p.id, d))}
            onDelete={() => run(() => repo.deleteRoadmapPhase(p.id))}
          />
        ))}
      </ol>

      <NewPhasePanel
        open={adding}
        onClose={() => setAdding(false)}
        onCreate={async input => {
          await run(() => repo.createRoadmapPhase(input));
          setAdding(false);
        }}
      />
    </section>
  );
}

/** A date range read as people say it, and an honest blank when nobody has set one. */
function phaseDates(phase: RoadmapPhase): string {
  const fmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString(undefined,
    { day: "numeric", month: "short", year: "numeric" });
  if (phase.startsOn && phase.endsOn) return `${fmt(phase.startsOn)} – ${fmt(phase.endsOn)}`;
  if (phase.startsOn) return `From ${fmt(phase.startsOn)}`;
  if (phase.endsOn) return `By ${fmt(phase.endsOn)}`;
  return "No dates set";
}

function PhaseCard({
  phase, planned, canEdit, busy, first, last, onSave, onMove, onDelete
}: {
  phase: RoadmapPhase;
  planned: FeedbackItem[];
  canEdit: boolean;
  busy: boolean;
  first: boolean;
  last: boolean;
  onSave: (patch: { name?: string; summary?: string; startsOn?: string | null; endsOn?: string | null; status?: RoadmapPhaseStatus }) => void;
  onMove: (direction: "up" | "down") => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(phase.name);
  const [summary, setSummary] = useState(phase.summary);
  const [startsOn, setStartsOn] = useState(phase.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(phase.endsOn ?? "");

  return (
    <li className={`roadmap-phase is-${phase.status}`}>
      <div className="roadmap-phase-head">
        <div>
          <Text type="text1" weight="bold" element="div" ellipsis={false}>{phase.name}</Text>
          <Text type="text3" color="secondary" element="div" ellipsis={false}>
            {phaseDates(phase)}
          </Text>
        </div>
        <span className={`roadmap-status roadmap-status-${phase.status}`}>
          {ROADMAP_PHASE_STATUS_LABELS[phase.status]}
        </span>
      </div>

      {phase.summary && (
        <Text type="text2" color="secondary" element="p" ellipsis={false}>{phase.summary}</Text>
      )}

      {planned.length > 0 ? (
        <ul className="roadmap-items">
          {planned.map(f => (
            <li key={f.id}>
              {/* Ticked when it shipped. A tick is a fact here — the stage says shipped —
                  and never a percentage: "68% of phase 2" implies a weighting nobody set. */}
              <span className="roadmap-tick" aria-hidden>{f.stage === "shipped" ? "✓" : "○"}</span>
              <Text type="text2" element="span" ellipsis={false}>{f.title}</Text>
              <Text type="text3" color="secondary" element="span">
                {" "}· {FEEDBACK_STAGE_LABELS[f.stage]}
              </Text>
            </li>
          ))}
        </ul>
      ) : (
        <Text type="text3" color="secondary" element="p" ellipsis={false}>
          Nothing planned into this phase yet.
        </Text>
      )}

      {canEdit && !editing && (
        <div className="roadmap-actions">
          <div className="select-wrap">
            <Select
              options={ROADMAP_PHASE_STATUSES.map(s => ({ value: s, label: ROADMAP_PHASE_STATUS_LABELS[s] }))}
              value={phase.status}
              onChange={v => onSave({ status: v as RoadmapPhaseStatus })}
              aria-label={`Status for ${phase.name}`}
              size="small"
            />
          </div>
          <Button size="small" kind="tertiary" onClick={() => setEditing(true)}>Edit</Button>
          <Button size="small" kind="tertiary" disabled={first || busy}
                  onClick={() => onMove("up")}>Move up</Button>
          <Button size="small" kind="tertiary" disabled={last || busy}
                  onClick={() => onMove("down")}>Move down</Button>
          {/* No confirmation dialog, and a deliberate note instead: ON DELETE SET NULL
              means the requests survive, so the worst case is re-adding a phase. */}
          <Button size="small" kind="tertiary" color="negative" disabled={busy}
                  onClick={onDelete}>Remove</Button>
        </div>
      )}

      {canEdit && editing && (
        <div className="create-form roadmap-edit">
          <Field label="Name" required>
            <TextField value={name} onChange={setName} inputAriaLabel="Phase name" />
          </Field>
          <Field label="What it covers">
            <TextArea value={summary} onChange={e => setSummary(e.target.value)} rows={2}
                      aria-label="Phase summary" />
          </Field>
          <Field label="Starts" hint="Leave blank if it is not scheduled yet.">
            <input type="date" className="date-input" value={startsOn}
                   onChange={e => setStartsOn(e.target.value)} aria-label="Starts on" />
          </Field>
          <Field label="Ends">
            <input type="date" className="date-input" value={endsOn}
                   onChange={e => setEndsOn(e.target.value)} aria-label="Ends on" />
          </Field>
          <div className="roadmap-actions">
            <Button size="small" disabled={busy || !name.trim()} onClick={() => {
              onSave({ name, summary, startsOn: startsOn || null, endsOn: endsOn || null });
              setEditing(false);
            }}>Save</Button>
            <Button size="small" kind="tertiary" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </li>
  );
}

function NewPhasePanel({
  open, onClose, onCreate
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: { name: string; summary: string; startsOn: string | null; endsOn: string | null }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");

  return (
    <SidePanel
      open={open}
      title="Add a phase"
      onClose={onClose}
      footer={
        <>
          <Button
            disabled={!name.trim()}
            onClick={() => void onCreate({
              name, summary, startsOn: startsOn || null, endsOn: endsOn || null
            }).then(() => { setName(""); setSummary(""); setStartsOn(""); setEndsOn(""); })}
          >
            Add
          </Button>
          <Button kind="tertiary" onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <div className="create-form">
        <Field label="Name" required hint="What people will call it — 'Phase 2 — costings'.">
          <TextField value={name} onChange={setName} inputAriaLabel="Phase name" />
        </Field>
        <Field label="What it covers">
          <TextArea value={summary} onChange={e => setSummary(e.target.value)} rows={3}
                    aria-label="Phase summary" />
        </Field>
        <Field label="Starts" hint="Both dates are optional. An unscheduled phase is normal.">
          <input type="date" className="date-input" value={startsOn}
                 onChange={e => setStartsOn(e.target.value)} aria-label="Starts on" />
        </Field>
        <Field label="Ends">
          <input type="date" className="date-input" value={endsOn}
                 onChange={e => setEndsOn(e.target.value)} aria-label="Ends on" />
        </Field>
      </div>
    </SidePanel>
  );
}

// ==================================================================== changelog

/**
 * What went out, newest first.
 *
 * The in-app editor and `scripts/changelog.mjs` write the same shape: the script builds
 * `CHANGELOG.md` from commit trailers so a merge cannot forget to say what it did, and
 * this publishes the release people read inside the app. Both exist because they answer
 * to different audiences — one to the repository, one to the forty-seven people who do
 * not read it.
 */
function Changelog() {
  const { can } = usePermission();
  const repo = useRepository();
  const [reloadKey, setReloadKey] = useState(0);
  const { data: releases, loading, error } = useQuery(r => r.listReleases(), [], [reloadKey]);
  const { data: shipped } = useQuery(
    r => r.listFeedback().then(list => list.filter(f => f.stage === "shipped")), [], [reloadKey]
  );
  const [publishing, setPublishing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const canPublish = can("superadmin");

  return (
    <section className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">Changelog</Text>
        {canPublish && <Button size="small" onClick={() => setPublishing(true)}>Publish a release</Button>}
      </div>
      <Text type="text2" color="secondary" ellipsis={false}>
        What has actually gone out. A line that came from somebody's request names it, so
        you can see your own suggestion arrive.
      </Text>

      {error && <LoadProblem error={error} />}
      {problem && <Problem>{problem}</Problem>}

      {!loading && releases.length === 0 && (
        <Text type="text2" color="secondary" element="p" ellipsis={false}
              style={{ marginTop: "var(--space-12)" }}>
          Nothing published yet.
        </Text>
      )}

      {releases.map(r => <ReleaseCard key={r.id} release={r} canPublish={canPublish}
                                      onDelete={async () => {
                                        try {
                                          await repo.deleteRelease(r.id);
                                          setReloadKey(k => k + 1);
                                        } catch (e) {
                                          setProblem(e instanceof Error ? e.message : String(e));
                                        }
                                      }} />)}

      <PublishPanel
        open={publishing}
        shipped={shipped}
        onClose={() => setPublishing(false)}
        onPublished={() => { setPublishing(false); setReloadKey(k => k + 1); }}
      />
    </section>
  );
}

function ReleaseCard({
  release, canPublish, onDelete
}: {
  release: Release;
  canPublish: boolean;
  onDelete: () => void;
}) {
  const byKind = (kind: ReleaseEntryKind) => release.entries.filter(e => e.kind === kind);
  return (
    <article className="release">
      <div className="release-head">
        <div>
          <Text type="text1" weight="bold" element="div" ellipsis={false}>
            {release.version}{release.name ? ` — ${release.name}` : ""}
          </Text>
          <Text type="text3" color="secondary" element="div">
            {new Date(release.shippedOn + "T00:00:00").toLocaleDateString(undefined,
              { day: "numeric", month: "long", year: "numeric" })}
          </Text>
        </div>
        {canPublish && (
          <Button size="small" kind="tertiary" color="negative" onClick={onDelete}>Remove</Button>
        )}
      </div>

      {release.summary && (
        <Text type="text2" color="secondary" element="p" ellipsis={false}>{release.summary}</Text>
      )}

      {RELEASE_ENTRY_KINDS.map(kind => {
        const lines = byKind(kind);
        if (lines.length === 0) return null;
        return (
          <div key={kind} className="release-group">
            <Text type="text3" weight="bold" element="div">{RELEASE_ENTRY_KIND_LABELS[kind]}</Text>
            <ul>
              {lines.map(e => (
                <li key={e.id}>
                  <Text type="text2" element="span" ellipsis={false}>{e.summary}</Text>
                  {e.feedbackTitle && (
                    <Text type="text3" color="secondary" element="span" ellipsis={false}>
                      {" "}· asked for as "{e.feedbackTitle}"
                    </Text>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </article>
  );
}

/**
 * Publishing one.
 *
 * A line may name the request it came from, and that is the loop closing: the person who
 * asked sees their own words in the changelog. The list offered is exactly the requests
 * already at `shipped` — offering everything would invite marking something delivered
 * here that the tracker still shows as in development, and then two screens disagree.
 */
function PublishPanel({
  open, shipped, onClose, onPublished
}: {
  open: boolean;
  shipped: FeedbackItem[];
  onClose: () => void;
  onPublished: () => void;
}) {
  const repo = useRepository();
  const [version, setVersion] = useState("");
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [shippedOn, setShippedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<{ kind: ReleaseEntryKind; summary: string; feedbackId: string | null }[]>(
    [{ kind: "added", summary: "", feedbackId: null }]
  );
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const publish = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await repo.createRelease({ version, name, summary, shippedOn, entries: lines });
      setVersion(""); setName(""); setSummary("");
      setLines([{ kind: "added", summary: "", feedbackId: null }]);
      onPublished();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SidePanel
      open={open}
      title="Publish a release"
      onClose={onClose}
      footer={
        <>
          <Button disabled={busy || !version.trim() || !lines.some(l => l.summary.trim())}
                  onClick={() => void publish()}>
            {busy ? "Publishing…" : "Publish"}
          </Button>
          <Button kind="tertiary" onClick={onClose} disabled={busy}>Cancel</Button>
        </>
      }
    >
      <div className="create-form">
        <Field label="Version" required hint="What people say out loud — '0.9', '2026-08-30'.">
          <TextField value={version} onChange={setVersion} inputAriaLabel="Version" />
        </Field>
        <Field label="Name">
          <TextField value={name} onChange={setName} placeholder="the tracker"
                     inputAriaLabel="Release name" />
        </Field>
        <Field label="Shipped on">
          <input type="date" className="date-input" value={shippedOn}
                 onChange={e => setShippedOn(e.target.value)} aria-label="Shipped on" />
        </Field>
        <Field label="Summary">
          <TextArea value={summary} onChange={e => setSummary(e.target.value)} rows={2}
                    aria-label="Release summary" />
        </Field>

        <Field label="What changed" required hint="One line per change. Name the request where there was one.">
          <div className="release-lines">
            {lines.map((line, i) => (
              <div key={i} className="release-line">
                <Select
                  options={RELEASE_ENTRY_KINDS.map(k => ({ value: k, label: RELEASE_ENTRY_KIND_LABELS[k] }))}
                  value={line.kind}
                  onChange={v => setLines(ls => ls.map((l, n) =>
                    n === i ? { ...l, kind: v as ReleaseEntryKind } : l))}
                  aria-label={`Kind for line ${i + 1}`}
                  size="small"
                />
                <TextField
                  value={line.summary}
                  onChange={v => setLines(ls => ls.map((l, n) => n === i ? { ...l, summary: v } : l))}
                  placeholder="Ideas can be voted on"
                  inputAriaLabel={`Line ${i + 1}`}
                />
                <Select
                  options={shipped.map(f => ({ value: f.id, label: f.title }))}
                  value={line.feedbackId}
                  clearable
                  placeholder={shipped.length === 0 ? "No shipped requests" : "From a request…"}
                  onChange={v => setLines(ls => ls.map((l, n) => n === i ? { ...l, feedbackId: v } : l))}
                  aria-label={`Request for line ${i + 1}`}
                  size="small"
                />
                <button type="button" className="link-button"
                        onClick={() => setLines(ls => ls.filter((_, n) => n !== i))}>
                  Remove
                </button>
              </div>
            ))}
            <Button size="small" kind="tertiary"
                    onClick={() => setLines(ls => [...ls, { kind: "added", summary: "", feedbackId: null }])}>
              Add a line
            </Button>
          </div>
        </Field>

        {problem && <Problem>{problem}</Problem>}
      </div>
    </SidePanel>
  );
}
