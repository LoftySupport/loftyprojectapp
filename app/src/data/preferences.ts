/**
 * Working preferences — the two "where you land" choices, made real (G39; they
 * rendered as inert selects, which is the one thing this app otherwise refuses to
 * ship: a control that does nothing).
 *
 * **They roam now** (0050, Q9's last layer). `user_preferences` holds one bag per
 * person, so signing in on the site laptop finds the same app as the office one.
 *
 * localStorage stays, and is not a leftover: it is what answers before the profile has
 * loaded — the landing route is decided on the very first render, and waiting on a
 * round trip there would flash the dashboard at somebody whose default is Jobs. So the
 * device's copy is the immediate answer and the profile's is the true one; `syncPrefs`
 * pulls the profile's down into the device on sign-in, and every write goes to both.
 * A device that has never synced still opens somewhere sensible, which is the whole
 * point of keeping it.
 */

export const LANDING_PAGES = ["Dashboard", "Projects", "Jobs", "Reports"] as const;
export type LandingPage = (typeof LANDING_PAGES)[number];

export const JOBS_VIEWS = ["Board", "Table", "Gantt", "Calendar"] as const;
export type JobsView = (typeof JOBS_VIEWS)[number];

export interface Prefs {
  landingPage: LandingPage;
  defaultJobsView: JobsView;
}

export const DEFAULT_PREFS: Prefs = { landingPage: "Dashboard", defaultJobsView: "Board" };

const KEY = "lofty.prefs";

export function readPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      landingPage: LANDING_PAGES.includes(parsed.landingPage as LandingPage)
        ? (parsed.landingPage as LandingPage) : DEFAULT_PREFS.landingPage,
      defaultJobsView: JOBS_VIEWS.includes(parsed.defaultJobsView as JobsView)
        ? (parsed.defaultJobsView as JobsView) : DEFAULT_PREFS.defaultJobsView
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

/**
 * Take what the profile holds and make it this device's answer too, so the next first
 * render is already right. Called once when the signed-in profile arrives.
 */
export function adoptPrefs(bag: Record<string, unknown>): Prefs {
  const next = {
    landingPage: LANDING_PAGES.includes(bag.landingPage as LandingPage)
      ? (bag.landingPage as LandingPage) : DEFAULT_PREFS.landingPage,
    defaultJobsView: JOBS_VIEWS.includes(bag.defaultJobsView as JobsView)
      ? (bag.defaultJobsView as JobsView) : DEFAULT_PREFS.defaultJobsView
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage refused — the profile's copy still governs this session.
  }
  return next;
}

export function writePrefs(patch: Partial<Prefs>): Prefs {
  const next = { ...readPrefs(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage refused (private window, quota) — the choice still applies this session.
  }
  return next;
}

/** Where a landing-page choice actually points. */
export const LANDING_ROUTES: Record<LandingPage, string> = {
  Dashboard: "/",
  Projects: "/projects",
  Jobs: "/jobs",
  Reports: "/reports"
};

/**
 * The notification matrix's choices (G40). Overrides only — the quiet defaults live
 * with the matrix itself — and device-local like the rest, with the screen owning up.
 * Delivery starts when notifications are built (in-app first, per Q4); recording the
 * choice now means nobody re-answers seven questions later.
 */
const NOTIF_KEY = "lofty.notifs";
export type NotifChannel = 0 | 1 | 2; // in-app · email · teams

export function readNotifMatrix(): Record<string, boolean[]> {
  try {
    return JSON.parse(localStorage.getItem(NOTIF_KEY) ?? "{}") as Record<string, boolean[]>;
  } catch {
    return {};
  }
}

export function writeNotifChoice(event: string, channel: NotifChannel, on: boolean, defaults: boolean[]): Record<string, boolean[]> {
  const all = readNotifMatrix();
  const row = all[event] ?? [...defaults];
  row[channel] = on;
  const next = { ...all, [event]: row };
  try {
    localStorage.setItem(NOTIF_KEY, JSON.stringify(next));
  } catch {
    // Storage refused — the choice still applies this session.
  }
  return next;
}
