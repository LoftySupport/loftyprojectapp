# report-share

Serves one shared document to somebody with **no Lofty login**.

## What it returns, and what it cannot return

A stored snapshot and the document's title. That is the whole response.

It does not read jobs, properties, people, teams or processes — and could not usefully be
made to. The document was compiled **before it got here**, in the author's browser, under
the author's session and therefore the author's RLS, and stored on the row (`0095`). This
function looks the row up by token, checks the expiry and the password, and hands back
what is stored.

That is the security design rather than a simplification of it. An earlier draft of this
file held a `loadViewerContext()` that re-queried the app with the service role — RLS off —
so that live blocks could resolve for a viewer. Its own comment called it *"the single most
likely serious bug in an endpoint of this kind"*, because one forgotten `.eq(job_id, …)`
returns Lofty's whole book of work to anybody with a link. There is now no query here that
reads anything except the single row asked for.

The cost is stated where a person can see it: a shared link does not update, the Share
panel says so, and the page itself says so at the bottom. Re-share to send newer numbers.

## Deploying it

```bash
supabase functions deploy report-share --no-verify-jwt
supabase secrets set SHARE_ALLOWED_ORIGINS="https://<the app's domain>"
```

`--no-verify-jwt` is required and is the point: the caller has no account. What stands in
for a session is the 256-bit token, the mandatory expiry, the origin allowlist and the
optional password.

**`SHARE_ALLOWED_ORIGINS` is a comma-separated list and there is no default.** With the
secret unset every request is refused with *"Sharing is not switched on."*, so deploying
before deciding gets an endpoint that answers nothing. Set it to the origins the app is
actually served from — during the Netlify → Vercel migration that is both, plus any
preview URL somebody is testing on.

The origin is checked twice on purpose. CORS headers tell a *browser* not to read a
response; they do not stop the request being made or answered. So there is also a plain
refusal in the handler, which is the one that actually refuses.

## Passwords

`verify.ts` holds the check, split out of `index.ts` so it can be tested: `index.ts` calls
`Deno.serve()` at the top level and imports from an `npm:` specifier, so a Node script
cannot import it. `npm run check:share-password` imports **this file's** verifier and the
browser's hasher and asserts they agree — 23 assertions, including that a malformed stored
value locks the link rather than throwing.

PBKDF2-SHA256 with the iteration count carried inside the stored string, so raising it
later leaves existing links verifiable. Web Crypto on both sides, no dependency, one
implementation. The comparison is constant-time; `===` on the digests would leak the
position of the first wrong byte to anybody timing the endpoint.

## What it deliberately does not distinguish

"No such token" and "revoked" are the same 404 with the same sentence. Telling them apart
tells somebody probing tokens which half they got right. "Expired" and "needs a password"
*are* distinguished, because both are things the person holding the link can act on.
