// app/src/data/InboxProvider.tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useRepository } from "./DataProvider";
import type { MovedRequest, Notification } from "./types";

/**
 * What is waiting on you — read once, shown in two places.
 *
 * ONE NUMBER, TWO PLACES, AND WHY IT HAD TO BE A PROVIDER
 *
 *   Amber, 11 September: *"Inbox and tasks should have a badge"*. The Inbox row in the
 *   rail and the bell in the header now both show how much is unread, and a badge that
 *   disagrees with the one eight pixels above it is worse than either on its own. Two
 *   components each making their own read would disagree the moment somebody pressed
 *   *Mark all read*: the bell would clear and the rail would keep a stale 3 until the
 *   next navigation.
 *
 *   So the reads, the two-minute poll and the three mark-as-read actions live here, and
 *   both the bell and the rail render the same numbers from the same state.
 *
 * WHAT COUNTS AS WAITING
 *
 *   Unread rows in `notifications` (0083 — assigned, mentioned, a stage moved, working
 *   drawings changed, a contact awaiting sign-off, plus the 15-minute at-risk scan),
 *   **plus** the tracker's "a request you follow moved" (0065), which predates the inbox
 *   and keeps its own list. That sum is what the bell has shown since it was built; the
 *   rail now shows the same sum rather than a second, smaller definition of unread.
 *
 *   Nothing is invented and nothing is derived: both are rows somebody or something
 *   wrote on purpose, and with nothing unread there is no badge at all, because a 0
 *   would be a claim.
 */

export interface Inbox {
  /** The 40 most recent, read and unread — the bell's list. */
  notifications: Notification[];
  /** Followed requests that moved stage since you last looked. */
  moved: MovedRequest[];
  /** The unread slice of `notifications`. */
  unread: Notification[];
  /** `unread.length + moved.length` — the badge, in both places. */
  waiting: number;
  /** Re-read both lists now. The poll calls this every two minutes. */
  refresh(): void;
  markRead(id: number): void;
  markAllRead(): void;
  markMovedSeen(id: string): void;
}

const EMPTY: Inbox = {
  notifications: [],
  moved: [],
  unread: [],
  waiting: 0,
  refresh() {},
  markRead() {},
  markAllRead() {},
  markMovedSeen() {}
};

const InboxContext = createContext<Inbox>(EMPTY);

/**
 * Mounted inside `AppShell`, which is inside `DataProvider` — so it may use the
 * repository, and everything under the shell can read it.
 *
 * The default above is not a fallback anybody should rely on; it exists so a component
 * rendered outside the shell (a test, a storybook page) gets an empty inbox rather than
 * a crash, and an empty inbox draws no badge.
 */
export function InboxProvider({ children }: { children: ReactNode }) {
  const repo = useRepository();
  const [reload, setReload] = useState(0);
  const refresh = useCallback(() => setReload(k => k + 1), []);

  const { data: notifications } = useQuery<Notification[]>(
    r => r.listMyNotifications({ limit: 40 }), [], [reload]
  );
  const { data: moved } = useQuery<MovedRequest[]>(r => r.listMyMovedRequests(), [], [reload]);

  // Every two minutes while the page is open, so a scan that ran at 07:30 shows without
  // a reload. Realtime would be the next step and the sync batch adds it; polling is
  // honest until then. It was the bell's timer and is now the whole shell's — one timer
  // rather than one per component that wants the number.
  useEffect(() => {
    const t = setInterval(refresh, 120_000);
    return () => clearInterval(t);
  }, [refresh]);

  const value = useMemo<Inbox>(() => {
    const unread = notifications.filter(n => n.readAt === null);
    return {
      notifications,
      moved,
      unread,
      waiting: unread.length + moved.length,
      refresh,
      // The failures are swallowed on purpose and were before this file existed: a
      // refused mark-as-read leaves the row unread, which is the safe direction, and a
      // toast about it would interrupt whatever the person actually came to do.
      markRead: id => void repo.markNotificationsRead([id]).then(refresh).catch(() => {}),
      markAllRead: () => void repo.markNotificationsRead().then(refresh).catch(() => {}),
      markMovedSeen: id => void repo.markMoveSeen(id).then(refresh).catch(() => {})
    };
  }, [notifications, moved, refresh, repo]);

  return <InboxContext.Provider value={value}>{children}</InboxContext.Provider>;
}

export function useInbox(): Inbox {
  return useContext(InboxContext);
}
