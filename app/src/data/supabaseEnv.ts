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

// Two spellings of the same two values, because Netlify's Supabase extension picks the
// names, not this app.
//
// Connecting a Netlify site to Supabase with the Vite framework selected provisions
// `VITE_SUPABASE_DATABASE_URL` and `VITE_SUPABASE_ANON_KEY` — the right values under
// different names. Reading only this app's own two names meant a connected site built a
// bundle with no client in it, and the sign-in page said "Not configured" while the
// Netlify screen listed the variables sitting right there. A prefix mismatch cost this
// app its data once already; a name mismatch is the same bug wearing a hat.
//
// So read both, and let the extension keep owning the values. The alternative — a
// hand-typed `VITE_SUPABASE_URL` beside the extension's copy — is two places to update
// and one of them silently stale after the next key rotation.
//
// The extension makes public copies of exactly the two values that are safe to publish.
// It does not prefix `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_JWT_SECRET`, and nothing
// here reads them: anything named VITE_* is inlined into the JavaScript that ships to
// the browser, and the service role key bypasses RLS entirely.
const firstSet = (...candidates: (string | undefined)[]): string | undefined =>
  candidates.map(c => c?.trim()).find(c => c) || undefined;

const rawUrl = firstSet(
  import.meta.env.VITE_SUPABASE_URL as string | undefined,
  import.meta.env.VITE_SUPABASE_DATABASE_URL as string | undefined
);
// The publishable key (`sb_publishable_…`) first, the legacy JWT anon key second. Both
// work and both are safe in a client bundle — they are public by design and RLS is what
// protects the data — but the publishable one rotates independently of the JWT secret,
// which the legacy key does not, so a compromise there does not force a re-issue of
// every token. Preferring it means a site that later adds the better key starts using it
// without anyone having to remember to delete the extension's.
const publishableKey = firstSet(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
);

// The extension's variable is named "database URL" and holds the project API URL
// (`https://<ref>.supabase.co`). The guard is for the day that stops being true: a
// `postgres://` connection string handed to `createClient` would fail every request at
// runtime with something unreadable, and refusing it here says "not configured" instead,
// which is at least the truth.
const url = rawUrl && /^https:\/\//i.test(rawUrl) ? rawUrl.replace(/\/+$/, "") : undefined;

/** The project API URL this build is pointed at, for the screens that must link to it. */
export const supabaseUrl: string | null = url ?? null;

/** The public key the client authenticates with. Publishable if there is one, else anon. */
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
