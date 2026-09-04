# report-share — NOT DEPLOYED

This endpoint would serve a shared document to somebody with **no Lofty login**. It is
written, and it is deliberately not deployed. Nothing in the app calls it, and nothing
writes a share token, so today there is no anonymous path into `report_documents` at all.

## Why it cannot be a table read

RLS decides which rows a *signed-in* person sees. A share link is opened by somebody with
no session, so the only way to serve it through RLS would be to grant `anon` a SELECT
policy on `report_documents` — which would expose **every other document in the table** to
anyone holding any link. That is not a policy that can be written narrowly enough: the
token is in the request, not in the session, so the database cannot key on it safely.

So it has to be a server endpoint holding the service role, which returns one row and only
the parts of it a viewer may see.

## Before deploying it, decide these

1. **Which origins may call it.** `ALLOWED_ORIGINS` is empty, and with it empty the
   function refuses every browser. That is the safe default and it is why the function
   does nothing useful as it stands.
2. **What a viewer's context contains.** `loadViewerContext()` is the security-critical
   part and it currently returns nothing, so a shared document renders its prose and its
   typed tables and says so for every live block. Filling it in means deciding what a
   person outside Lofty may see of a job — and every query in it must be filtered to the
   one record the document is about. A query that forgets its filter returns the whole
   book of work to anybody with a link.
3. **Whether links may be passwordless.** The column exists; the app does not offer it yet.

## Turning it on, once those are answered

- `supabase functions deploy report-share`
- add `createShareLink` / `deleteShareLink` / `fetchShared` to `createDocumentStore` in
  `app/src/features/reports/adapters/lofty/store.js` — the builder feature-detects them
  and shows its Share panel the moment all three exist
- add a public route for `/documents/shared/:token` outside the auth gate, rendering the
  module's `SharedReportPage` (which this integration currently does not vendor)

Nothing in the database changes: `0094` already carries the token, the mandatory expiry
and the password hash.
