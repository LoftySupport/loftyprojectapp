/**
 * Which Supabase project this build points at, and under which variable names.
 *
 * A module of its own so that a screen needing the project URL — the maintenance accept
 * link, the pages that explain an empty app — can have it without importing the client
 * and dragging the whole repository in behind it. The seam in `repository.ts` stays the
 * only way to reach data; this is configuration, which is a different thing.
 *
 * Everything here is decided at build time. Vite inlines `import.meta.env.VITE_*` into
 * the bundle, so a variable added after a deploy went out changes nothing until the next
 * build — which is its own small trap, and the reason the sign-in page says so out loud.
 */

// Two names, and only these two.
//
// This app once read a second spelling of each — `VITE_SUPABASE_DATABASE_URL` and
// `VITE_SUPABASE_ANON_KEY`, the names a host integration provisioned when it was told the
// framework was something other than Vite. That fallback was removed on 6 September, after
// checking the LIVE production bundle rather than assuming: both fell through to `void 0`,
// so neither name was set on the deployment and the branch was dead code.
//
// If a future integration provisions names of its own, the fix is to tell it the framework
// is **Vite** so it writes the two below, not to add a third spelling here. The prefix is
// the framework's and not Supabase's: Vite exposes only `VITE_`-prefixed variables, and a
// `NEXT_PUBLIC_*` variable is absent from the bundle entirely — the build goes green, the
// site serves, and sign-in reports "Not configured" while the dashboard shows the values
// sitting right there. A prefix mismatch cost this app its data once already.
//
// Nothing here reads `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_JWT_SECRET`, and nothing
// ever should: anything named `VITE_*` is inlined into the JavaScript that ships to the
// browser, and the service role key bypasses RLS entirely.
const clean = (value: string | undefined): string | undefined => value?.trim() || undefined;

const rawUrl = clean(import.meta.env.VITE_SUPABASE_URL as string | undefined);

// The publishable key (`sb_publishable_…`). It is safe in a client bundle — public by
// design, and RLS is what protects the data — and it rotates independently of the JWT
// secret, so a compromise here does not force a re-issue of every token.
const publishableKey = clean(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined);

// The guard is for a value that is set but is not a project API URL: a `postgres://`
// connection string handed to `createClient` would fail every request at runtime with
// something unreadable, and refusing it here says "not configured" instead, which is at
// least the truth.
const url = rawUrl && /^https:\/\//i.test(rawUrl) ? rawUrl.replace(/\/+$/, "") : undefined;

/** The project API URL this build is pointed at, for the screens that must link to it. */
export const supabaseUrl: string | null = url ?? null;

/** The publishable key the client authenticates with. */
export const supabaseKey: string | null = publishableKey ?? null;

/**
 * What the build actually found, for the pages that have to explain an empty app.
 *
 * Named rather than counted: "no key" and "no URL" have different fixes, and a screen
 * that says which one is missing saves the round trip of finding out.
 */
export const supabaseEnv = {
  hasUrl: Boolean(url),
  hasKey: Boolean(publishableKey),
  /** A URL was supplied and is not an https project URL — a connection string, probably. */
  urlUnusable: Boolean(rawUrl) && !url
};
