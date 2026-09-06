## What changed

<!-- One paragraph. What a reader of the diff would not work out on their own. -->

## Why

<!-- The reasoning, not the restatement. A schema choice without its reasoning gets
     "simplified" back into a bug by the next person — that is why this section exists. -->

## Changelog trailer

<!-- Every shipped change reaches CHANGELOG.md and the app's Updates page through a commit
     trailer, never by editing the file. One of:

       Changelog: Added: <what a person at Lofty would notice>
       Changelog: Changed: …
       Changelog: Fixed: …
       Changelog: Removed: …
       Changelog: skip          ← for changes nobody outside the repo would notice

     Add `Roadmap: <the item's text>` as well when this finishes a roadmap item. -->

## Checks

- [ ] `cd app && npm run lint && npm run typecheck && npm run build`
- [ ] `node scripts/check-links.mjs` — if any document moved or was added
- [ ] `cd app && npm run dictionary` — if `src/data/dictionary.ts` changed, and both files committed
- [ ] `app/supabase/verify/check.sh` — if a migration changed
- [ ] The Vercel preview for this branch looks right

## If this is a schema change

One branch and PR per table. Four files move together, and all four are in this PR:

- [ ] the migration in `app/supabase/migrations/`
- [ ] `app/src/data/types.ts`
- [ ] `app/src/data/dictionary.ts` (then regenerated)
- [ ] `docs/schema/schema-plan.md`, saying what was decided and why

- [ ] Every `can()` this adds has a matching RLS policy. The app's checks hide controls;
      they are not security.
- [ ] Any new assertion in `app/supabase/verify/` was **watched failing** before it was
      trusted. A check nobody has seen fail is not evidence.

## Anything left undone

<!-- Say it here rather than leaving it to be discovered. A blank invites configuring;
     a plausible-looking gap-filler gets quoted back as though it were agreed. -->
