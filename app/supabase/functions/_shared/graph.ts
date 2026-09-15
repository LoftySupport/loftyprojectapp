// _shared/graph.ts — one way to talk to Microsoft Graph, for every function that needs it.
//
// WHY THIS EXISTS
//
//   `deliver-notifications` grew its own `graphToken()` when it was the only function
//   calling Graph. The Microsoft 365 work (6 September) adds a second and a third —
//   folders from a template, files on a record, mail into a job — and three copies of a
//   token exchange is three places to fix the day a tenant setting changes. This is the
//   first module under `_shared/`; there was no such directory before.
//
// APP-ONLY, AND ONLY EVER APP-ONLY
//
//   Every call here is client credentials: the app's own identity, admin-consented, with
//   application permissions narrowed by an Exchange application access policy (mail) and
//   `Sites.Selected` (files). There is deliberately no delegated path. A delegated token
//   would mean storing somebody's Microsoft refresh token, and `AuthProvider.tsx` is
//   explicit that the app trusts nothing it reads off a Microsoft token. If a delegated
//   flow is ever needed it gets its own module and its own argument, not a flag here.
//
// THE TOKEN IS CACHED, BECAUSE A COLD ISOLATE IS NOT A NEW TENANT
//
//   Graph tokens last an hour. An edge function woken every minute would otherwise ask
//   Microsoft for a new one sixty times an hour per channel and eventually be throttled
//   for it. The cache lives in module scope, so it survives for the life of the isolate
//   and disappears with it — which is correct, because a torn-down isolate has no
//   business handing its token to the next one.
//
// 429 IS AN INSTRUCTION, NOT AN ERROR
//
//   Graph throttles per app per tenant, and says how long to wait in `Retry-After`. The
//   one thing that turns a throttle into an outage is retrying immediately, so `graphFetch`
//   honours the header and backs off. It gives up after three attempts rather than
//   blocking a queue worker: the outbox row it was serving is re-queued with its own
//   backoff and tried again on the next run, which is the slower, safer loop.

const env = (k: string) => Deno.env.get(k) ?? "";

export const GRAPH = "https://graph.microsoft.com/v1.0";

/** Thrown for any non-2xx Graph response, carrying enough to put in an outbox row's error. */
export class GraphError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    readonly url: string,
  ) {
    super(`Graph ${status} on ${url}: ${body.slice(0, 500)}`);
    this.name = "GraphError";
  }
  /** 404 and 409 are answers, not faults: "no folder there yet", "one already". */
  get isNotFound() {
    return this.status === 404;
  }
  get isConflict() {
    return this.status === 409;
  }
}

/** True when the Microsoft secrets are set. A function should skip its Graph work, not fail, when they are not. */
export function graphConfigured(): boolean {
  return Boolean(env("MS_TENANT_ID") && env("MS_CLIENT_ID") && env("MS_CLIENT_SECRET"));
}

let cached: { token: string; expiresAt: number } | null = null;

/** An application token for Graph, cached until a minute before it expires. */
export async function graphToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt) return cached.token;

  const res = await fetch(
    `https://login.microsoftonline.com/${env("MS_TENANT_ID")}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env("MS_CLIENT_ID"),
        client_secret: env("MS_CLIENT_SECRET"),
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    },
  );
  if (!res.ok) throw new GraphError(res.status, await res.text(), "oauth2/v2.0/token");

  const body = (await res.json()) as { access_token: string; expires_in?: number };
  // A minute of headroom, so a token never expires between being handed out and being used.
  const ttl = Math.max(60, (body.expires_in ?? 3600) - 60);
  cached = { token: body.access_token, expiresAt: Date.now() + ttl * 1000 };
  return cached.token;
}

/** Drop the cached token. For a 401 that is worth exactly one retry with a fresh one. */
export function forgetGraphToken(): void {
  cached = null;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * One Graph request, authenticated, with throttling handled.
 *
 * `path` is either a path under /v1.0 ("/drives/{id}/root/children") or a full URL, so a
 * `@odata.nextLink` or an upload session URL can be passed straight back in.
 */
export async function graphFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = path.startsWith("http") ? path : `${GRAPH}${path}`;
  let retriedAuth = false;

  for (let attempt = 0; ; attempt++) {
    const token = await graphToken();
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");

    const res = await fetch(url, { ...init, headers });
    if (res.ok || res.status === 404 || res.status === 409) return res;

    // A token that was fine a moment ago can be rejected after a tenant change. Worth one
    // fresh attempt; a second 401 is a real permissions problem and should be reported.
    if (res.status === 401 && !retriedAuth) {
      retriedAuth = true;
      forgetGraphToken();
      await res.body?.cancel();
      continue;
    }

    const throttled = res.status === 429 || res.status === 503 || res.status === 504;
    if (throttled && attempt < 2) {
      const after = Number(res.headers.get("retry-after"));
      // Graph usually says. When it does not, back off rather than guessing at its limit.
      await res.body?.cancel();
      await sleep(Number.isFinite(after) && after > 0 ? after * 1000 : (attempt + 1) * 2000);
      continue;
    }

    throw new GraphError(res.status, await res.text(), url);
  }
}

/** A Graph request whose JSON body you want. */
export async function graphJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await graphFetch(path, init);
  if (!res.ok) throw new GraphError(res.status, await res.text(), path);
  return (await res.json()) as T;
}

/**
 * Every page of a Graph collection.
 *
 * Graph pages at its own discretion, not yours: a folder listing that fits in one response
 * today returns a `@odata.nextLink` the day somebody adds a two-hundredth file. Reading
 * only the first page is the bug that shows up months later as "the file is not in the
 * app", so listing goes through here.
 */
export async function graphList<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = path;
  // A guard, not a limit: a cursor that never advances should stop rather than spin.
  for (let page = 0; next && page < 200; page++) {
    const body: { value?: T[]; "@odata.nextLink"?: string } = await graphJson(next);
    out.push(...(body.value ?? []));
    next = body["@odata.nextLink"] ?? null;
  }
  return out;
}
