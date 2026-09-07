import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button, Heading, Tab, TabList, Text, TextArea, TextField } from "@vibe/core";
import { Search, ThumbsUp } from "@vibe/icons";
import { CommentsPanel } from "../components/CommentsPanel";
import { useQuery, useRepository } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import { useUndo } from "../data/UndoProvider";
import { useFeedback } from "../components/Feedback";
import { Field, Problem } from "../components/Form";
import { Select } from "../components/Select";
import { PersonSelect } from "../components/PersonSelect";
import { SidePanel } from "../components/SidePanel";
import { LoadProblem } from "../components/SearchNotices";
import {
  ViewSwitcher, useUpdatesView
} from "../components/UpdatesViews";
import {
  DateRangeFilter, matchesRange, parseRange, serialiseRange
} from "../components/DateRange";
import { SortHeader, useTableSort } from "../components/SortableTable";
import { ExportMenu } from "../components/ExportMenu";
import { tableFromFields, type ExportDocument } from "../data/export";
import { useChangelogPulls } from "../data/github";
import {
  FEEDBACK_OPEN_STAGES, FEEDBACK_STAGES, FEEDBACK_STAGE_LABELS, FEEDBACK_STAGE_MEANING,
  RELEASE_ENTRY_KINDS, RELEASE_ENTRY_KIND_LABELS, ROADMAP_PHASE_STATUSES,
  ROADMAP_PHASE_STATUS_LABELS,
  type FeedbackItem, type FeedbackKind, type FeedbackStage, type FeedbackVoter,
  type Release, type ReleaseEntry, type ReleaseEntryKind, type RoadmapPhase, type RoadmapPhaseStatus
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
  const [params, setParams] = useSearchParams();
  const [view, setView] = useUpdatesView();
  const [openId, setOpenId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busyVote, setBusyVote] = useState<string | null>(null);
  const [voted, setVoted] = useState<Record<string, { count: number; mine: boolean }>>({});

  /* Every control on this bar rides the query string, for the reason `saved_views` stores
     one verbatim: a filtered board is a thing people send each other. `write` drops a
     param when it is at its default, so a plain board has a plain URL. */
  const write = (key: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(key, v); else next.delete(key);
    setParams(next, { replace: true });
  };

  const search = params.get("q") ?? "";
  const kind = (params.get("kind") as FeedbackKind | null) ?? "all";
  const phaseId = params.get("phase") ?? "all";
  const sort = params.get("sort") === "newest" ? "newest" : "votes";
  const range = parseRange(params.get("date"));

  const withVotes = (f: FeedbackItem): FeedbackItem => {
    const v = voted[f.id];
    return v ? { ...f, voteCount: v.count, votedByMe: v.mine } : f;
  };

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const list = items
      .filter(f => kind === "all" || f.kind === kind)
      .filter(f => phaseId === "all"
        || (phaseId === "none" ? f.roadmapPhaseId === null : f.roadmapPhaseId === phaseId))
      // Reported, not moved: "what came in last week" is the question a date filter on a
      // queue is asked, and the moved date answers "when did somebody triage it".
      .filter(f => matchesRange(f.createdAt, range))
      .filter(f => !needle
        || f.title.toLowerCase().includes(needle)
        || f.detail.toLowerCase().includes(needle)
        || (f.fromName ?? "").toLowerCase().includes(needle))
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
  }, [items, kind, phaseId, sort, search, params.get("date"), voted]);

  const byStage = (stage: FeedbackStage) => shown.filter(f => f.stage === stage);

  /**
   * Dragging a card to another column moves the request (Amber, 31 Aug).
   *
   * Gated on `superadmin` because that is what the database enforces — 0060's
   * `guard_feedback_stage_change()` raises 42501 for anybody below it, admins included.
   * The attribute is only set when the rung is held, so the board never offers a gesture
   * that ends in a refusal.
   */
  const canMoveStage = can("superadmin");
  const [dragged, setDragged] = useState<FeedbackItem | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const moveTo = async (f: FeedbackItem, stage: FeedbackStage) => {
    if (f.stage === stage) return;
    setProblem(null);
    try {
      await repo.setFeedbackStage(f.id, stage);
      setReloadKey(k => k + 1);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    }
  };

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
  const filtered = search.trim() !== "" || kind !== "all" || phaseId !== "all" || range !== null;

  /**
   * The tracker as a file — `shown`, so the download is the queue after the search, the
   * kind, the phase and the date range, in the order the sort control put them.
   *
   * Board and table export the same thing, and they should: the board's columns ARE the
   * stage column, so a spreadsheet of the same requests sorts into the same groups with
   * one click. What the board has that the file cannot is the drag, and a file is not
   * where anybody moves a request between stages.
   */
  const buildExport = (): ExportDocument => ({
    title: "Requests and bugs",
    note: filtered
      ? `Showing ${shown.length} of ${items.length} requests`
      : `${shown.length} ${shown.length === 1 ? "request" : "requests"}`,
    tables: [
      tableFromFields<FeedbackItem>(
        "Requests",
        [
          { label: "Request", text: f => f.title },
          { label: "Detail", text: f => f.detail || null },
          { label: "Kind", text: f => (f.kind === "bug" ? "Bug" : "Idea") },
          { label: "Stage", text: f => FEEDBACK_STAGE_LABELS[f.stage] },
          {
            label: "Phase",
            text: f => phases.find(p => p.id === f.roadmapPhaseId)?.name ?? null
          },
          { label: "Votes", numeric: true, text: f => f.voteCount },
          { label: "From", text: f => f.fromName ?? null },
          { label: "Sent", text: f => shortDate(f.createdAt) },
          { label: "In stage since", text: f => shortDate(f.stageEnteredAt) }
        ],
        shown
      )
    ]
  });

  return (
    <section className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">Requests and bugs</Text>
        <Text type="text3" color="secondary">
          {filtered ? `${shown.length} of ${items.length}` : shown.length}
          {" "}{shown.length === 1 ? "item" : "items"}
        </Text>
      </div>
      <Text type="text2" color="secondary" ellipsis={false}>
        Everything anyone has sent in, and where it has got to. Thumbs up the ideas you
        want — one vote each, and the count is what gets read when the next phase is
        planned.
      </Text>

      <div className="updates-bar">
        {/* Search first, because on a board of a few hundred it is the control people
            reach for before any filter. Title, detail and who sent it — the three things
            somebody remembers about a request they are trying to find again. */}
        <div className="updates-search">
          <Search size={16} aria-hidden />
          <input
            type="search"
            value={search}
            placeholder="Search requests…"
            aria-label="Search requests"
            onChange={e => write("q", e.target.value || null)}
          />
        </div>

        <div className="select-wrap">
          <Select options={KIND_FILTERS} value={kind}
                  onChange={v => write("kind", v === "all" ? null : String(v))}
                  aria-label="Show" size="small" />
        </div>

        {/* The filter Amber asked for, on the axis the board cannot already show: the
            board groups by stage, so a stage filter would be a filter on the columns.
            Phase is the other thing a request belongs to, and "not planned yet" is a
            real answer rather than a missing one. */}
        <div className="select-wrap">
          <Select
            /* Two standing answers first, then the phases in their own order — sorting
               would put "Any phase" among the phase names and Phase two above Phase one. */
            ordered
            options={[
              { value: "all", label: "Any phase" },
              { value: "none", label: "Not planned yet" },
              ...phases.map(p => ({ value: p.id, label: p.name }))
            ]}
            value={phaseId}
            onChange={v => write("phase", v === "all" ? null : String(v))}
            aria-label="Filter by roadmap phase"
            size="small"
          />
        </div>

        <DateRangeFilter
          label=""
          ariaLabel="Filter by when a request was sent in"
          value={range}
          onChange={v => write("date", serialiseRange(v))}
        />

        <div className="select-wrap">
          <Select options={SORTS} value={sort}
                  onChange={v => write("sort", v === "votes" ? null : String(v))}
                  aria-label="Sort by" size="small" />
        </div>

        <span className="updates-bar-spacer" />
        <ExportMenu build={buildExport} disabled={loading || shown.length === 0} />
        <ViewSwitcher value={view} onChange={setView} />
        {/* "+ New", not "Report something" (Amber, 1 Sep): the form takes an idea as
            readily as a bug, and a button that says "report" asks people with a
            suggestion whether they are in the right place. */}
        <Button size="small" onClick={() => report()}>+ New</Button>
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

      {items.length > 0 && shown.length === 0 && (
        <Text type="text2" color="secondary" element="p" ellipsis={false}
              style={{ marginTop: "var(--space-12)" }}>
          No requests match the current filters.
        </Text>
      )}

      {items.length > 0 && view === "board" && (
        <>
          {canMoveStage && (
            <div className="updates-drag-hint">
              <Text type="text3" color="secondary">
                Drag a card between columns to move a request.
              </Text>
            </div>
          )}
          <div className="updates-board">
            {FEEDBACK_OPEN_STAGES.map(stage => {
              const column = byStage(stage);
              const isTarget = dropTarget === stage && dragged !== null && dragged.stage !== stage;
              return (
                <div
                  key={stage}
                  className={`updates-col updates-col-${stage}${isTarget ? " is-drop-target" : ""}`}
                  onDragOver={e => {
                    if (!canMoveStage || !dragged || dragged.stage === stage) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDropTarget(stage);
                  }}
                  onDragLeave={() => setDropTarget(t => (t === stage ? null : t))}
                  onDrop={e => {
                    if (canMoveStage && dragged && dragged.stage !== stage) {
                      e.preventDefault();
                      void moveTo(dragged, stage);
                    }
                    setDragged(null);
                    setDropTarget(null);
                  }}
                >
                  {/* The caption under each heading is gone with the Canny restyle —
                      their columns are a dot and a word. What it said is kept as the
                      heading's title, because "in review" versus "planned" is the
                      difference between "we are thinking about it" and "it is going to
                      happen", and that is worth being able to find. */}
                  <div className="updates-col-head" title={FEEDBACK_STAGE_MEANING[stage]}>
                    {/* The dot carries the column's colour, so the heading and the cards
                        under it read as one group without tinting the whole column. */}
                    <span className="updates-col-dot" aria-hidden />
                    <Text type="text2" weight="bold" element="div">
                      {FEEDBACK_STAGE_LABELS[stage]}
                    </Text>
                    <span className="updates-count">{column.length}</span>
                  </div>
                  <div className="updates-cards">
                    {column.map(f => (
                      <div
                        key={f.id}
                        className={canMoveStage ? "updates-card-draggable" : undefined}
                        draggable={canMoveStage}
                        onDragStart={e => {
                          setDragged(f);
                          e.dataTransfer.effectAllowed = "move";
                          // Some browsers refuse to begin a drag carrying no data at all.
                          e.dataTransfer.setData("text/plain", f.id);
                        }}
                        onDragEnd={() => { setDragged(null); setDropTarget(null); }}
                      >
                        <RequestCard
                          item={f}
                          phase={phases.find(p => p.id === f.roadmapPhaseId) ?? null}
                          busy={busyVote === f.id}
                          onVote={() => void vote(f)}
                          onOpen={() => setOpenId(f.id)}
                        />
                      </div>
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

          {/* Declined stays underneath. It is the one ending nobody is moving towards,
              and a column of refusals at the end of the run would read as where requests
              end up. */}
          <Ended
            title="Declined"
            note="Read, considered, and not going ahead — kept so the answer does not get lost."
            items={byStage("declined")}
            onOpen={setOpenId}
          />
        </>
      )}

      {items.length > 0 && view === "table" && (
        <RequestsTable rows={shown} phases={phases} onOpen={setOpenId} />
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

/* ================================================ the table ====================== */

const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : null;

type ReqCol = "title" | "kind" | "stage" | "phase" | "votes" | "from" | "moved";

/**
 * The tracker as a table, on the app's own table (Amber, 1 Sep: *"make the table view
 * match the rest of the UI"*).
 *
 * `panel` + `data-table-wrap` + `data-table` + `SortHeader` — the same four things the
 * jobs table is made of, rather than the bespoke `.updates-table` this used to carry. A
 * second table style is a second set of paddings, hover colours and header weights to
 * keep in step, and they do not stay in step.
 */
function RequestsTable({ rows, phases, onOpen }: {
  rows: FeedbackItem[];
  phases: RoadmapPhase[];
  onOpen: (id: string) => void;
}) {
  const phaseName = (id: string | null) => phases.find(p => p.id === id)?.name ?? null;

  // Every column reads a value the row actually holds; blanks sort last in both
  // directions, which is `sortRows`' own rule and why "no phase" never leads the table.
  const columns = useMemo(() => ({
    title: (f: FeedbackItem) => f.title,
    kind: (f: FeedbackItem) => f.kind,
    stage: (f: FeedbackItem) => FEEDBACK_STAGES.indexOf(f.stage),
    phase: (f: FeedbackItem) => phaseName(f.roadmapPhaseId),
    votes: (f: FeedbackItem) => f.voteCount,
    from: (f: FeedbackItem) => f.fromName,
    moved: (f: FeedbackItem) => Date.parse(f.stageEnteredAt)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [phases]);

  const { sorted, sort, toggle } = useTableSort<FeedbackItem, ReqCol>(
    rows, columns, { key: "votes", direction: "desc" }
  );

  return (
    <div className="panel data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <SortHeader column="title" label="Request" sort={sort} onSort={toggle} />
            <SortHeader column="kind" label="Kind" sort={sort} onSort={toggle} />
            <SortHeader column="stage" label="Stage" sort={sort} onSort={toggle} />
            <SortHeader column="phase" label="Phase" sort={sort} onSort={toggle} />
            <SortHeader column="votes" label="Votes" sort={sort} onSort={toggle} />
            <SortHeader column="from" label="From" sort={sort} onSort={toggle} />
            <SortHeader column="moved" label="In stage since" sort={sort} onSort={toggle} />
          </tr>
        </thead>
        <tbody>
          {sorted.map(f => (
            <tr key={f.id}>
              <td>
                <button type="button" className="updates-table-open" onClick={() => onOpen(f.id)}>
                  {f.title}
                </button>
              </td>
              <td>
                <span className={`updates-kind updates-kind-${f.kind}`}>
                  {f.kind === "bug" ? "Bug" : "Idea"}
                </span>
              </td>
              <td>{FEEDBACK_STAGE_LABELS[f.stage]}</td>
              {/* An em dash, not a guess: no phase is a real answer and the commonest one. */}
              <td>{phaseName(f.roadmapPhaseId) ?? "—"}</td>
              <td>{f.voteCount}</td>
              <td>{f.fromName ?? "—"}</td>
              <td>{shortDate(f.stageEnteredAt) ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * One card, Canny-shaped (Amber, 1 Sep, with their board attached).
 *
 * The vote box moves to the LEFT and becomes the card's anchor — a caret over a count,
 * bordered, the width of a thumb. That is not decoration: on their board the number is
 * the first thing the eye lands on in every row, which is what makes a column of cards
 * read as a ranking rather than as a list. Ours sorts by votes by default, so the number
 * and the order now say the same thing in the same place.
 *
 * Under the title sits one small capitalised label — their board name, ours the kind.
 * It is the line that lets somebody scanning a column tell a bug from an idea without
 * reading either title.
 */
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
      <VoteButton item={item} busy={busy} onVote={onVote} />
      <button type="button" className="updates-card-open" onClick={onOpen}>
        <Text type="text2" weight="medium" element="span" ellipsis={false}>{item.title}</Text>
        <span className="updates-card-sub">{item.kind === "bug" ? "BUG" : "IDEA"}</span>
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
  const { record } = useUndo();
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shots, setShots] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [showVoters, setShowVoters] = useState(false);
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
          {/* The detail view, Canny-shaped (Amber, 1 Sep, with their post attached): the
              vote box leads, the title sits beside it, and the stage is a quiet
              capitalised line underneath rather than a chip in a row of chips. Their
              layout puts the number and the decision — "53" and "UNDER REVIEW" — in the
              first inch of the page, which are the two things somebody opening a request
              came to find out. */}
          <div className="updates-detail-head">
            <VoteButton item={item} busy={busyVote === item.id} onVote={() => void onVote(item)} />
            <div className="updates-detail-title">
              <Text type="text1" weight="bold" element="h3" ellipsis={false}>{item.title}</Text>
              <span className="updates-detail-stage">
                {FEEDBACK_STAGE_LABELS[item.stage].toUpperCase()}
              </span>
            </div>
          </div>

          {/* Who it is from, as an author block rather than a byline — the same move
              their post makes, and it is what turns a row in a queue into somebody's
              request. The initial stands in for an avatar the app has no source for;
              it is derived from the name rather than invented. */}
          <div className="updates-author">
            <span className="updates-avatar" aria-hidden>
              {(item.fromName ?? "?").trim().charAt(0).toUpperCase()}
            </span>
            <div className="updates-author-body">
              <Text type="text2" weight="medium" element="div" ellipsis={false}>
                {item.fromName ?? "—"}
              </Text>
              {item.detail
                ? <Text type="text2" element="p" ellipsis={false}>{item.detail}</Text>
                : <Text type="text2" color="secondary" element="p" ellipsis={false}>
                    No detail was written — the one line above is all of it.
                  </Text>}
              <Text type="text3" color="secondary" element="div" ellipsis={false}>
                {item.addedByName ? `Entered by ${item.addedByName}` : "Created"}
                {" · "}{new Date(item.createdAt).toLocaleDateString()}
                {" · "}in {FEEDBACK_STAGE_LABELS[item.stage].toLowerCase()} since{" "}
                {new Date(item.stageEnteredAt).toLocaleDateString()}
              </Text>
            </div>
          </div>

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
                    <PersonSelect
                      exclude={voters.map(v => v.profileId)}
                      value={null}
                      placeholder="Add somebody who asked for this…"
                      onChange={v => v && void run(() => repo.addVoteFor(item.id, v))}
                      aria-label="Add a voter"
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
                  const from = item.stage;
                  const to = v as FeedbackStage;
                  const result = await repo.setFeedbackStage(item.id, to, note);
                  setNote("");
                  // The note is not re-sent on undo: the move back is its own event, and
                  // a comment saying why it went forward would be wrong on the way back.
                  record({
                    label: `Moved “${item.title}” to ${FEEDBACK_STAGE_LABELS[to]}`,
                    undo: async () => { await repo.setFeedbackStage(item.id, from); onChanged(); },
                    redo: async () => { await repo.setFeedbackStage(item.id, to); onChanged(); }
                  });
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
                ordered
                options={phases.map(p => ({ value: p.id, label: p.name }))}
                value={item.roadmapPhaseId}
                clearable
                placeholder="Not planned into a phase"
                onChange={v => void run(async () => {
                  const from = item.roadmapPhaseId;
                  await repo.setFeedbackPhase(item.id, v);
                  const name = (id: string | null) => phases.find(p => p.id === id)?.name ?? "no phase";
                  record({
                    label: `Planned “${item.title}” into ${name(v)}`,
                    undo: async () => { await repo.setFeedbackPhase(item.id, from); onChanged(); },
                    redo: async () => { await repo.setFeedbackPhase(item.id, v); onChanged(); }
                  });
                })}
                aria-label="Roadmap phase"
                className={busy ? "is-busy" : undefined}
              />
            </Field>
          )}

          {canPlan && (
            <Field
              label="Filed as"
              hint="A bug is something that does not work; an idea is something that would. Re-file it when the reporter picked the other one."
            >
              {/* Amber, 7 Sep: "you can't change an idea to a bug in updates". The radio
                  on the report form is the reporter's guess; this is the triage call, at
                  the rung that already plans the request. `ordered` because bug-then-idea
                  is the form's order, and a two-item list sorted a–z would swap them. */}
              <Select
                ordered
                options={[
                  { value: "bug", label: "A bug or an error" },
                  { value: "idea", label: "An idea or a feature request" }
                ]}
                value={item.kind}
                onChange={v => void run(async () => {
                  const from = item.kind;
                  const to = v as FeedbackKind;
                  if (to === from) return;
                  await repo.setFeedbackKind(item.id, to);
                  record({
                    label: `Re-filed “${item.title}” as ${to === "bug" ? "a bug" : "an idea"}`,
                    undo: async () => { await repo.setFeedbackKind(item.id, from); onChanged(); },
                    redo: async () => { await repo.setFeedbackKind(item.id, to); onChanged(); }
                  });
                })}
                aria-label="Filed as"
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
/**
 * Exported since 4 September: Admin renders this same component on its Roadmap tab.
 *
 * One implementation, two doors. Amber wanted the roadmap reachable from the cog along
 * with users, teams and the changelog; the alternative was a second roadmap screen for
 * admins, which is how two pages start disagreeing about what phase 2 contains. Nothing
 * about the component changes with the door — the planning controls are already
 * `can("admin")` and shaping the phases is already `can("superadmin")`, and Updates
 * remains everybody's read of the same rows.
 */
export function Roadmap() {
  const repo = useRepository();
  const { can } = usePermission();
  const [reloadKey, setReloadKey] = useState(0);
  const { data: phases, loading, error } = useQuery(r => r.listRoadmapPhases(), [], [reloadKey]);
  const { data: items } = useQuery(r => r.listFeedback(), [], [reloadKey]);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [view, setView] = useUpdatesView();
  const [openId, setOpenId] = useState<string | null>(null);
  const canEdit = can("superadmin");

  /**
   * Planning a request into a phase is ADMIN, not superadmin.
   *
   * Two different acts, and the database already draws the line between them: 0060's
   * trigger keeps `feedback_stage` for superadmin because moving a request along the
   * queue is a promise about whether it happens, while `roadmap_phase_id` rides the
   * ordinary `admins triage feedback` UPDATE policy because saying "this belongs in
   * phase 2" is triage. Shaping the phases themselves stays superadmin (0063).
   */
  const canPlan = can("admin");
  const [dragged, setDragged] = useState<FeedbackItem | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  /** `null` is the unplanned bucket — dragging out of a phase is as real as dragging in. */
  const planInto = async (f: FeedbackItem, phaseId: string | null) => {
    if (f.roadmapPhaseId === phaseId) return;
    setProblem(null);
    try {
      await repo.setFeedbackPhase(f.id, phaseId);
      setReloadKey(k => k + 1);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    }
  };

  const unplanned = items.filter(f => f.roadmapPhaseId === null && f.mergedIntoId === null);

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

  /**
   * The roadmap as a file. Two counts per phase, which is what the board draws and the
   * table lists: how much is planned into it, and how much of that is already live.
   *
   * "Not set" for a phase with no dates, in both the file and the table — an empty cell
   * where a date belongs reads as data that failed to load, where unscheduled is a
   * decision nobody has made yet. That is the one place a blank would say the wrong
   * thing, so it is the one place this writes a word instead.
   */
  const buildExport = (): ExportDocument => ({
    title: "Roadmap",
    note: `${phases.length} ${phases.length === 1 ? "phase" : "phases"}`,
    tables: [
      tableFromFields<RoadmapPhase>(
        "Roadmap",
        [
          { label: "Phase", text: p => p.name },
          { label: "Summary", text: p => p.summary || null },
          { label: "Status", text: p => ROADMAP_PHASE_STATUS_LABELS[p.status] },
          { label: "Starts", text: p => shortDate(p.startsOn) ?? "Not set" },
          { label: "Ends", text: p => shortDate(p.endsOn) ?? "Not set" },
          {
            label: "Planned",
            numeric: true,
            text: p => items.filter(f => f.roadmapPhaseId === p.id).length
          },
          {
            label: "Live in the app",
            numeric: true,
            text: p =>
              items.filter(f => f.roadmapPhaseId === p.id && f.stage === "shipped").length
          }
        ],
        phases
      )
    ]
  });

  return (
    <section className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">Roadmap</Text>
        <div className="updates-bar" style={{ margin: 0 }}>
          <ExportMenu build={buildExport} disabled={loading || phases.length === 0} />
          <ViewSwitcher value={view} onChange={setView} />
          {canEdit && (
            <Button size="small" onClick={() => setAdding(true)}>Add a phase</Button>
          )}
        </div>
      </div>
      <Text type="text2" color="secondary" ellipsis={false}>
        The phases the build is planned in, and what is going into each. Dates are the
        intention, not a promise — a phase with no dates set has not been scheduled yet.
      </Text>
      {view === "board" && canPlan && phases.length > 0 && (
        <div className="updates-drag-hint">
          <Text type="text3" color="secondary">
            Drag a request between phases to plan it — or onto Not planned yet to take it
            back out.
          </Text>
        </div>
      )}

      {error && <LoadProblem error={error} />}
      {problem && <Problem>{problem}</Problem>}

      {!loading && phases.length === 0 && (
        <Text type="text2" color="secondary" element="p" ellipsis={false}
              style={{ marginTop: "var(--space-12)" }}>
          {/* Not three plausible phases. The roadmap is empty until somebody writes one. */}
          No phases yet.{canEdit ? " Add the first one above." : " Amber sets these up."}
        </Text>
      )}

      {view === "board" && (
        <>
          <ol className="roadmap">
            {phases.map((p, i) => (
              <PhaseCard
                key={p.id}
                phase={p}
                planned={items.filter(f => f.roadmapPhaseId === p.id)}
                canEdit={canEdit}
                canPlan={canPlan}
                busy={busy}
                first={i === 0}
                last={i === phases.length - 1}
                dragged={dragged}
                isTarget={dropTarget === p.id}
                onDragItem={setDragged}
                onDropHere={f => void planInto(f, p.id)}
                onHover={over => setDropTarget(over ? p.id : null)}
                onOpenItem={setOpenId}
                onSave={patch => run(() => repo.updateRoadmapPhase(p.id, patch))}
                onMove={d => run(() => repo.moveRoadmapPhase(p.id, d))}
                onDelete={() => run(() => repo.deleteRoadmapPhase(p.id))}
              />
            ))}
          </ol>

          {/* The unplanned bucket. It exists so the drag has somewhere to go BACK to —
              without it a request could be planned by dragging and only unplanned through
              the dropdown inside it, which is the kind of one-way gesture that makes
              people afraid to try the other one. It also answers "what have we not
              decided about", which is the roadmap's other real question. */}
          {(unplanned.length > 0 || dragged !== null) && (
            <div
              className={`updates-col roadmap-unplanned${dropTarget === "none" ? " is-drop-target" : ""}`}
              onDragOver={e => {
                if (!canPlan || !dragged || dragged.roadmapPhaseId === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDropTarget("none");
              }}
              onDragLeave={() => setDropTarget(t => (t === "none" ? null : t))}
              onDrop={e => {
                if (canPlan && dragged && dragged.roadmapPhaseId !== null) {
                  e.preventDefault();
                  void planInto(dragged, null);
                }
                setDragged(null);
                setDropTarget(null);
              }}
            >
              <div className="updates-col-head">
                <Text type="text2" weight="bold" element="div">Not planned yet</Text>
                <span className="updates-count">{unplanned.length}</span>
              </div>
              <Text type="text3" color="secondary" element="div" ellipsis={false}
                    className="updates-col-meaning">
                Sent in, and not put into a phase. Nothing here is promised.
              </Text>
              <ul className="roadmap-items">
                {unplanned.map(f => (
                  <li
                    key={f.id}
                    className={canPlan ? "updates-card-draggable" : undefined}
                    draggable={canPlan}
                    onDragStart={e => {
                      setDragged(f);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", f.id);
                    }}
                    onDragEnd={() => { setDragged(null); setDropTarget(null); }}
                  >
                    <button type="button" className="updates-table-open"
                            onClick={() => setOpenId(f.id)}>{f.title}</button>
                    <Text type="text3" color="secondary" element="span">
                      {" "}· {FEEDBACK_STAGE_LABELS[f.stage]}
                    </Text>
                  </li>
                ))}
                {unplanned.length === 0 && (
                  <Text type="text3" color="secondary" element="li" ellipsis={false}>
                    Everything has a phase.
                  </Text>
                )}
              </ul>
            </div>
          )}
        </>
      )}

      {view === "table" && <PhasesTable phases={phases} items={items} />}

      <RequestPanel
        item={items.find(f => f.id === openId) ?? null}
        all={items}
        phases={phases}
        canMove={can("superadmin")}
        canPlan={canPlan}
        onClose={() => setOpenId(null)}
        onChanged={() => setReloadKey(k => k + 1)}
        onVote={async () => {}}
        busyVote={null}
      />

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

type PhaseCol = "phase" | "status" | "starts" | "ends" | "planned" | "live";

function PhasesTable({ phases, items }: { phases: RoadmapPhase[]; items: FeedbackItem[] }) {
  const inPhase = (id: string) => items.filter(f => f.roadmapPhaseId === id);

  const columns = useMemo(() => ({
    // Position, not name: the roadmap has an order somebody chose, and sorting Phase 10
    // between Phase 1 and Phase 2 is what sorting the label alphabetically does.
    phase: (p: RoadmapPhase) => p.position,
    status: (p: RoadmapPhase) => ROADMAP_PHASE_STATUSES.indexOf(p.status),
    starts: (p: RoadmapPhase) => (p.startsOn ? Date.parse(p.startsOn) : null),
    ends: (p: RoadmapPhase) => (p.endsOn ? Date.parse(p.endsOn) : null),
    planned: (p: RoadmapPhase) => inPhase(p.id).length,
    live: (p: RoadmapPhase) => inPhase(p.id).filter(f => f.stage === "shipped").length
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [items]);

  const { sorted, sort, toggle } = useTableSort<RoadmapPhase, PhaseCol>(
    phases, columns, { key: "phase", direction: "asc" }
  );

  if (phases.length === 0) {
    return (
      <Text type="text2" color="secondary" element="p" ellipsis={false}
            style={{ marginTop: "var(--space-12)" }}>
        No phases yet.
      </Text>
    );
  }

  return (
    <div className="updates-table-wrap">
      <table className="updates-table">
        <thead>
          <tr>
            <SortHeader column="phase" label="Phase" sort={sort} onSort={toggle} />
            <SortHeader column="status" label="Status" sort={sort} onSort={toggle} />
            <SortHeader column="starts" label="Starts" sort={sort} onSort={toggle} />
            <SortHeader column="ends" label="Ends" sort={sort} onSort={toggle} />
            <SortHeader column="planned" label="Planned" sort={sort} onSort={toggle} />
            <SortHeader column="live" label="Live in the app" sort={sort} onSort={toggle} />
          </tr>
        </thead>
        <tbody>
          {sorted.map(p => (
            <tr key={p.id}>
              <td>
                <Text type="text2" weight="medium" element="div" ellipsis={false}>{p.name}</Text>
                {p.summary && (
                  <Text type="text3" color="secondary" element="div" ellipsis={false}>{p.summary}</Text>
                )}
              </td>
              <td>
                <span className={`roadmap-status roadmap-status-${p.status}`}>
                  {ROADMAP_PHASE_STATUS_LABELS[p.status]}
                </span>
              </td>
              {/* "Not set" rather than a blank cell: an unscheduled phase is a decision
                  nobody has made yet, and an empty cell reads as data that failed to load. */}
              <td>{shortDate(p.startsOn) ?? "Not set"}</td>
              <td>{shortDate(p.endsOn) ?? "Not set"}</td>
              <td>{inPhase(p.id).length}</td>
              <td>{inPhase(p.id).filter(f => f.stage === "shipped").length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * What has been merged, straight from GitHub (Amber, 31 Aug).
 *
 * Only pull requests carrying a `@changelog` line in their description, which is the
 * filter she chose and the right one: the repository has had fifty-odd pull requests and
 * most are refactors, typo fixes and work in progress. A feed of all of them would be a
 * git log on a page people came to for "what changed for me".
 *
 * Deliberately BELOW the published releases and separately headed. A merged pull request
 * is a developer saying what they did; a release is Amber saying what Lofty shipped. They
 * are different claims and the page should not blur them into one list.
 */
function MergedPullRequests() {
  const pulls = useChangelogPulls();

  if (pulls.state === "loading") {
    return (
      <section className="updates-ended">
        <Text type="text3" color="secondary" element="div">Reading what has been merged…</Text>
      </section>
    );
  }

  if (pulls.state === "error") {
    // Said out loud. An empty list here would read as "nothing has been merged", which is
    // false, and it is the exact shape of the "your account is not set up" fault: an
    // error rendered as an ordinary empty state.
    return (
      <section className="updates-ended">
        <Text type="text2" weight="bold" element="div">Merged from the build</Text>
        <Text type="text3" color="secondary" element="div" ellipsis={false}>
          Could not read this from GitHub just now. {pulls.reason}
        </Text>
      </section>
    );
  }

  if (pulls.pulls.length === 0) {
    return (
      <section className="updates-ended">
        <Text type="text2" weight="bold" element="div">Merged from the build</Text>
        <Text type="text3" color="secondary" element="div" ellipsis={false}>
          Nothing merged recently declared a changelog line. A pull request joins this list
          by putting <code>@changelog</code> at the start of a row in its description — the
          rest of that row is what appears here.
        </Text>
      </section>
    );
  }

  return (
    <section className="updates-ended">
      <Text type="text2" weight="bold" element="div">Merged from the build</Text>
      <Text type="text3" color="secondary" element="div" ellipsis={false}>
        Pull requests that declared a <code>@changelog</code> line, newest first. Read live
        from GitHub — this is the work itself, not a release Amber has published.
      </Text>
      <ul className="updates-ended-list">
        {pulls.pulls.map(p => (
          <li key={p.number}>
            {p.notes.map((n, i) => (
              <div key={i}>
                <Text type="text2" element="span" ellipsis={false}>{n}</Text>
              </div>
            ))}
            <Text type="text3" color="secondary" element="span">
              <a href={p.url} target="_blank" rel="noreferrer">#{p.number}</a>
              {" "}· merged {shortDate(p.mergedAt)}
              {p.author ? ` · ${p.author}` : ""}
            </Text>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PhaseCard({
  phase, planned, canEdit, canPlan, busy, first, last,
  dragged, isTarget, onDragItem, onDropHere, onHover, onOpenItem,
  onSave, onMove, onDelete
}: {
  phase: RoadmapPhase;
  planned: FeedbackItem[];
  canEdit: boolean;
  /** Admin+, per the 0060/0063 split: planning is triage, shaping the phase is not. */
  canPlan: boolean;
  busy: boolean;
  first: boolean;
  last: boolean;
  dragged: FeedbackItem | null;
  isTarget: boolean;
  onDragItem: (f: FeedbackItem | null) => void;
  onDropHere: (f: FeedbackItem) => void;
  onHover: (over: boolean) => void;
  onOpenItem: (id: string) => void;
  onSave: (patch: { name?: string; summary?: string; startsOn?: string | null; endsOn?: string | null; status?: RoadmapPhaseStatus }) => void;
  onMove: (direction: "up" | "down") => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(phase.name);
  const [summary, setSummary] = useState(phase.summary);
  const [startsOn, setStartsOn] = useState(phase.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(phase.endsOn ?? "");

  const canDropHere = canPlan && dragged !== null && dragged.roadmapPhaseId !== phase.id;

  return (
    <li
      className={`roadmap-phase is-${phase.status}${isTarget && canDropHere ? " is-drop-target" : ""}`}
      onDragOver={e => {
        if (!canDropHere) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onHover(true);
      }}
      onDragLeave={() => onHover(false)}
      onDrop={e => {
        if (canDropHere && dragged) {
          e.preventDefault();
          onDropHere(dragged);
        }
        onDragItem(null);
        onHover(false);
      }}
    >
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
            <li
              key={f.id}
              className={canPlan ? "updates-card-draggable" : undefined}
              draggable={canPlan}
              onDragStart={e => {
                onDragItem(f);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", f.id);
              }}
              onDragEnd={() => onDragItem(null)}
            >
              {/* Ticked when it shipped. A tick is a fact here — the stage says shipped —
                  and never a percentage: "68% of phase 2" implies a weighting nobody set. */}
              <span className="roadmap-tick" aria-hidden>{f.stage === "shipped" ? "✓" : "○"}</span>
              <button type="button" className="updates-table-open" onClick={() => onOpenItem(f.id)}>
                {f.title}
              </button>
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
/** Exported since 4 September — Admin's Changelog tab renders this same component. See
 *  the note on `Roadmap` above: one implementation, two doors, publishing still
 *  superadmin's. */
export function Changelog() {
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

  /**
   * The changelog as a file — one row per line of a release, rather than one per
   * release, because the version and the date repeating down a column is what makes it
   * sortable and filterable. A release with no lines in it still contributes a row: a
   * version that shipped with nothing written about it is a fact worth seeing, and
   * dropping it would make the file disagree with the page above it.
   *
   * The "asked for as" column is the one worth downloading. It is the join between what
   * somebody asked for and what actually went out, and it exists nowhere else.
   */
  const buildExport = (): ExportDocument => {
    interface Line { release: Release; entry: ReleaseEntry | null }
    const lines = releases.flatMap<Line>(r =>
      r.entries.length > 0
        ? r.entries.map(e => ({ release: r, entry: e }))
        : [{ release: r, entry: null }]
    );
    const tables = [
      tableFromFields<Line>(
        "Changelog",
        [
          { label: "Version", text: l => l.release.version },
          { label: "Released", text: l => shortDate(l.release.shippedOn + "T00:00:00") },
          { label: "Release name", text: l => l.release.name || null },
          { label: "Kind", text: l => (l.entry ? RELEASE_ENTRY_KIND_LABELS[l.entry.kind] : null) },
          { label: "Change", text: l => l.entry?.summary ?? null },
          { label: "Asked for as", text: l => l.entry?.feedbackTitle ?? null }
        ],
        lines
      )
    ];
    if (shipped.length > 0) {
      tables.push(
        tableFromFields<FeedbackItem>(
          "Live in the app",
          [
            { label: "Request", text: f => f.title },
            { label: "Asked for by", text: f => f.fromName ?? null },
            { label: "Kind", text: f => (f.kind === "bug" ? "Bug" : "Idea") },
            { label: "Votes", numeric: true, text: f => f.voteCount },
            { label: "Live since", text: f => shortDate(f.stageEnteredAt) }
          ],
          shipped,
          "Requests moved to Live in the app on the tracker"
        )
      );
    }
    return {
      title: "Changelog",
      note: `${releases.length} ${releases.length === 1 ? "release" : "releases"}`,
      tables
    };
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">Changelog</Text>
        <span className="panel-head-actions">
          <ExportMenu
            build={buildExport}
            disabled={loading || (releases.length === 0 && shipped.length === 0)}
          />
          {canPublish && <Button size="small" onClick={() => setPublishing(true)}>Publish a release</Button>}
        </span>
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

      {/* Requests that reached "Live in the app" — Amber's other half of the ask. Read
          from `feedback` rather than waiting to be written into a release, because a
          request is live the moment somebody moves it there, and a changelog that only
          knows what was formally published is a changelog that is always behind. A line
          here that later appears under a release is the same fact told twice on purpose:
          one is "your request landed", the other is "which version it landed in". */}
      {shipped.length > 0 && (
        <section className="updates-ended">
          <Text type="text2" weight="bold" element="div">Requests now live in the app</Text>
          <Text type="text3" color="secondary" element="div" ellipsis={false}>
            Moved to Live in the app on the tracker. The person who asked was told when it
            happened.
          </Text>
          <ul className="updates-ended-list">
            {shipped.map(f => (
              <li key={f.id}>
                <Text type="text2" element="span" ellipsis={false}>{f.title}</Text>
                <Text type="text3" color="secondary" element="span">
                  {" "}· asked for by {f.fromName ?? "somebody who has since left"}
                </Text>
              </li>
            ))}
          </ul>
        </section>
      )}

      <MergedPullRequests />

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
