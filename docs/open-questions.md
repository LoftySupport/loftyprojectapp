# Open questions

**The queue of things only Amber can decide, asked one at a time.**

Amber, 7 September: *"ask me questions on what I should fix one at a time … if you want a
question, ask it here and then record updates"*. So this file is the queue and the record.
It is not a backlog of work — it is the list of places where Claude would otherwise have to
invent a value, and `CLAUDE.md` is explicit that an invented default is worse than a blank.

## How this works

1. **One question at a time.** Ask the top open question in the chat, not four at once.
2. **Ask, then record.** The answer goes in *Answered* below, with the date and Amber's own
   words where they are shorter than a paraphrase.
3. **Never guess ahead of an answer.** Do everything that does not depend on it first, then
   ask. If a question is blocking, say what is blocked.
4. **A question leaves this file only when it is answered or it stops mattering** — and if it
   stops mattering, say why rather than deleting the row.

---

## Open — next question first

### 1. "Dear [Owner Name]" — which party on the record is that? *(parked)*

**Parked by Amber, 10 September: _"that will be later when linking a contact or company to
project or job"_.** The decision waits until parties are actually being attached to records
rather than being made in the abstract — which is right, because the answer depends on what
a real job's Parties panel turns out to hold. Nothing is guessed in the meantime and no
token is built; a letter written today types the name by hand.

Kept in the file rather than removed, because it is unanswered rather than irrelevant, and
it will be the first thing to settle when the linking work starts.

Amber, 10 September, writing a letter: *"dear [Owner Name] your property [property address]
has just received planning approval on [planning approval date]"*.

Two of those three resolve today. `{{address}}` is a record fact, and
`{{planning_approval_received}}` is a real property definition. **The name has nowhere to
come from**, and this is the sentence it blocks.

What exists: `record_parties` attaches a contact or a company to a job or a project under a
role, with one marked primary — the Parties panel on every record. The roles are
**certifier, consultant, contractor, council, engineer, purchaser, real estate agent,
supplier, surveyor, other**. There is no *owner* and no *client*.

So the question is really two:

- **Is the person a letter is addressed to the `purchaser`**, or is "owner" a role Lofty
  needs that the list does not have? (A land owner who is not the purchaser is an ordinary
  thing in this business, which is why this is not obvious from the list.)
- **When there are several** — two purchasers on one house — does the letter take the one
  marked primary, or every one of them joined with "and"?

Nothing is guessed until this is answered. What it unblocks: a token per role, filled from
the record's own parties, so `Dear {{purchaser_name}}` (or `{{owner_name}}`) works the same
way `{{address}}` does. The mechanism is the small half — `record_parties` and the Parties
panel already exist, and `makeFillTextTokens`/`tokensFor` are where a role token would be
added. What is missing is only the decision about which role a letter opens to.

### 2. Each publish saves another copy on the job. Is that a version history or clutter?

`0106` lets a document be published by saving the file against the job. Publish it, edit it,
publish it again, and the record now holds **two** files — both called by the document's
title, one of them out of date, with nothing on either saying which is which.

Three ways to go, and the difference matters more the longer a job runs:

- **Leave it.** Every publish is a copy of what was sent on that day, which is what somebody
  asks for in a dispute. The Documents list on a long job fills up.
- **Chain them.** `documents.supersedes_id` already exists for exactly this (`0032`: *"a
  version integer cannot say WHICH document a revision revises"*), so the list could show
  the current one with "and what it replaced" behind it. More to build, and nothing else in
  the app uses the chain yet.
- **Replace.** Publishing again removes the previous copy. Tidiest list, and the only one of
  the three that loses something you cannot get back.

Built as **leave it** for now, because it is the only one that discards nothing — but that is
a default, not a decision, and the chain is cheap to add before there are real jobs on here.

### 3. Does undo need a home on a phone?

The header bar is hidden below 600px because two more 32px targets left the search box 70px
wide, and Ctrl+Z does not exist on a phone — so a phone has no undo at all. Is that
acceptable for now, or does it need one (a long-press on the "saved" toast is the obvious
place)?

### 4. Should the person picker offer deactivated people?

`PersonSelect` lists active people only, and every assignee, owner and "who is doing this"
control uses it. A job already assigned to somebody who has since been deactivated still
shows their name read-only. Nobody asked for the other behaviour; this records that it was a
choice.

### 5. What is "undo" allowed to reach?

Today it reaches every field write that saves as you make it — team, assignee, dates, tasks,
process runs, property values, a request's stage. It deliberately does NOT reach lifecycle
moves (forwards-only by your rule), creating, deleting, votes, follows or comments. Is that
the right line, or should a lifecycle move be undoable within, say, a minute of making it?
(The database refuses the way back today; allowing it is a migration, not a UI change.)

### 6. Where does "clone a job" live now?

**Blocked:** nothing is broken, but the app currently has no way to clone a job at all.

Amber, 7 September: *"remove clone off the job sidepanel.. cloning jobs can only be done on
projects"*. Done — the button is off the job drawer. But **there is no clone control on the
Projects side yet**, and there never was: `CloneDialog.tsx` and `repository.cloneJob()` were
only ever reached from that one button. Both are kept on purpose and are now referenced by
no screen, so the capability is intact and only its entry point is missing.

What is not decided is what it should look like there:

- **A row action on each job listed inside a project** — closest to the old behaviour, and
  it keeps "which job am I copying" obvious.
- **One "add a job like…" control on the project**, which picks the job to copy from a list.
  Reads better as an act on the project, which is the reasoning for moving it.

Either way `cloneJob(id, copy)` is unchanged and manager+ still gates it. Do not delete
`CloneDialog.tsx` as dead code before this is answered.

### 7. Is the placeholder at 3.47:1 accepted, or does it get fixed?

The design system now labels it *"example text only, never a label"*, which narrows the
exposure but does not clear it — placeholder text is still text under WCAG 1.4.3. `#757478`
would clear it at 4.64:1 as a new `--lofty-black-70` step, leaving `--ui-border-color` at
the 3.47:1 it was deliberately chosen for.

### 8. What should five missing roadmap items say?

Five commits carry a `Roadmap:` trailer whose text matches no checkbox in `ROADMAP.md`, so
work that was finished has no line to tick:

- A readable change history on every record
- Companies, contacts and parties on records
- Maintenance
- Notifications, in-app first
- Tasks, sub-tasks and checklists

They are real and shipped. What is missing is which phase each belongs to and whether the
wording above is the wording you want, and inventing roadmap text is exactly the thing
`CLAUDE.md` forbids.

### 9. How is health status worked out?

Long-standing, from the schema plan's own risk list. *"Status is what someone sets. Health
is what the system works out"* — from inputs nobody has defined. Kanban-by-status and
kanban-by-team work today; **kanban-by-health cannot be built until this is answered.** Is a
job at risk because it is past `expected_days`, because a required field is empty, because a
dependency is blocked, or some combination?

### 10. Does Acquisition & Development want a `project_stage` vocabulary?

`project_stage` is nullable and costs nothing empty. Do not seed a vocabulary until they
confirm they want one — a half-filled stage column that some projects use and others ignore
is worse for reporting than no column.

### 11. Do exported documents take Flint for their greys?

The design system retired the two cool greys on 7 September: `#f6f7f7` and `#e7e8e9` are
gone from the mirror, and in the app Flint 100 `#f4f3ee` is the page and Flint 300 `#c6c5ba`
draws the rules. The Word and PDF writers (`app/src/data/export/houseFormat.ts`) still use
the old two behind a table header and for the header hairline — deliberately decoupled from
the app's theme so a document does not change look when a screen does, and print is also
where the design system says Mid Grey still belongs. So: do exported documents follow the
app onto Flint, or is the house format its own record? Not changed on the sync, because the
export palette is written down as a decision (0026) and this file is where decisions change.

### 12. A Xero invoice with no purchase order — job or project?

Purchase orders belong to a job and a contractor (answered 8 September, question 16). A
contractor's bill reconciles against its purchase order, so it inherits the job. What is not
decided is the invoice that has **no** purchase order — a land purchase, a development cost, a
consultant on the whole site. Recommended: the `invoices` table carries a job **or** a project
(one of the two, checked), and the review queue holds anything Xero sends that matches neither.
The alternative — everything on a job — leaves project-level money with nowhere to go.

### 13. "Only managers can connect it to approved sources … this is done by superadmin"

Question 18's answer (8 September) says both. Read as: a **superadmin registers** each approved
source once, organisation-wide (the Copilot Studio agent, the Xero and SiteBook connections),
and **managers may use** what is registered, alongside everyone else who signs in. If instead
managers should be able to register a new source themselves, the Admin → Integrations page
opens to managers for that one act and the plan's §3 changes one word. Not blocking: Phase 1
has one source to register and a superadmin registers it either way.

### 14. Fieldwork in a printed PDF — is the licence settled?

Amber's rule for documents (9 September, answered below): Montserrat, *"unless it has fonts
embedded in it for print then it will be brand font"*. The PDF writer now embeds Montserrat,
so by that rule it could embed Fieldwork instead. It does not yet, for one reason: the brand
repository's own `NOTICE.md` says Fieldwork is a commercial face whose distribution beyond
the private repository is unconfirmed. Embedding it in a PDF puts a subset of the font
program in every file a client receives, and shipping it in the app puts the whole face on
`hub.lofty.au` for anyone to fetch. Montserrat is under the SIL Open Font License and has
neither problem. So: does Lofty's Fieldwork licence permit embedding in documents sent to
clients, and web-serving the face? If yes, the PDF's two faces become Fieldwork Geo Demibold
(600) for headings and Fieldwork Hum Light (300) for cells — the six `.woff` cuts are in the
brand repository — and the Word file stays Montserrat, since Word cannot embed without the
reader's cooperation.

### 15. When the SharePoint integration lands, does Lofty Hub ever hold the file?

`0103` lets a document be a URL, so a job's contract can be filed against it today by
pasting the link. The row that holds it (`documents`, from `0032`) has **both** a storage
path and a URL, and nothing stops both being set — deliberately, because the integration
might legitimately be the case for it.

What has not been decided is which of two things the integration is:

- **A link recorder.** It reads SharePoint and writes the URL, and the bytes never leave
  Microsoft. `document_storage_path` then stays empty for everything filed this way, and
  Lofty Hub never has a copy of a client's contract.
- **A two-way sync.** Uploading here puts the file in SharePoint, and a file in SharePoint
  is fetched here. Both columns get set, and Lofty Hub does hold copies.

It changes what has to be built and where the risk sits, so it is worth answering before
the integration is scoped rather than during. Nothing is blocked meanwhile: filing a link
by hand works either way.

### 16. Should removing a document from a record be a manager's job?

The Documents panel's **Remove** takes a document off *this* job or project and leaves it
on any other record it is filed against, and leaves the file itself untouched in SharePoint.
That is `0032`'s existing rule — *"detaching is not deleting: the link goes, the file
stays"* — inherited rather than chosen for this, and any user can do it.

It has not been asked, and the argument for asking is that "remove" on a contract reads
heavier than it is. The screen already says what it does not do before it asks, so this is
recording a choice rather than reporting a problem — but if the answer is *manager*, it is
one policy line.

### 17. Should a draft be openable in Word, and edit back into the app?

Amber, 10 September: *"you can choose to open it in the app document builder or in the
document native file (eg word, pdf. viewer etc, but it still edits and saves it)"*.

Half of that is built and works. A **published** document opens at its SharePoint address,
where Word Online or the desktop app edits it and saves it back — Microsoft doing the round
trip, not Lofty Hub.

The other half cannot be built yet, and it is worth being plain about why. A **draft** has
no file anywhere: it is blocks in a database. The app can hand you a `.docx` of it, but
that download is a dead-end copy — edit it and nothing comes back, because a round trip
needs the integration (or a Word add-in) that has not been scoped. So the panel offers a
draft's builder and nothing else, rather than a second button that quietly loses work.

Two ways out, and this is the question: **(a)** leave it — a draft is edited in the builder,
and Word only enters the picture once it is published; or **(b)** the coming integration
creates the SharePoint file at *draft* time, watermark and all, so there is always something
to open. (b) is more of what you asked for and is a bigger integration — it means Lofty Hub
writing files into SharePoint rather than only recording where they are, which is also open
question 16.

Nothing is blocked meanwhile: drafts are editable in the builder and publishing works.

### 18. What is a Res #, and where does it live?

**Blocked:** *"please add Lot #, Res # Street # at project creation type and default to
showing Res # until Lot number assigned"* (Amber, 10 September) cannot be built without
this, and it is a schema change rather than a form change.

**Two of the three already exist.** `addresses` carries `address_lot_number` and
`address_street_number`, and the constraint on them already states the rule Amber is
extending — `addresses_has_a_number`: *"A site is identified by a lot number, a street
number, or both — never neither. Before titles are issued there is only 'Lot 3';
afterwards there is '28'."* Project creation collects the lot number per row today and
does not collect the street number; adding that column to the split rows is a form
change and nothing more.

**Res # is new.** Nothing in the schema holds one, and it is not a rename of either
existing column, because Amber's ordering puts three numbers in a sequence:

    Res #  →  Lot #  →  Street #

with the display defaulting to the Res # until a lot number is assigned. Three things
have to be decided before a migration can be written, and each is a business fact rather
than a preference:

1. **What is it?** The reading that fits the ordering is the builder's own number for the
   dwelling, carried before the land division registers the lots. If that is right, say
   so; if it is something else — a council or a display-home number — it changes where it
   belongs.
2. **Does it belong to the address or to the job?** A lot number and a street number are
   facts about a *place*, which is why they are on `addresses`. If a Res # is also a fact
   about the place it joins them; if it is Lofty's number for the *dwelling being built*
   it belongs on `jobs`, and the two are not interchangeable — the address is versioned
   over time (`address_history`) and the job is not.
3. **Does it replace the "lot or street number" rule?** Today an address with neither is
   refused. If a new project has only a Res #, that CHECK has to become "res, lot or
   street", which also means `address_consolidated` — a column a trigger generates for
   every address in the system — has to render a Res # when it is the only number there
   is. That is a migration touching every address row, so it is worth being sure.

**What is not blocked and is already done:** the field at project creation that said
*"SiteBook number"* now says **"Old job number"**, because *"sitebook number isn't
created until after construction"* — it always wrote `job_number_old`, the old system's
number, and asking for a SiteBook number on a create form asked for one that cannot
exist yet.

### 19. Do the four views and bulk edit go back onto the older screens?

The 10 September rules say *"all **new** pages that are tables"* get board, table, gantt
and calendar — and, separately, *"**always** allow selection and editing on a screen for
the ability to select multiple jobs **or properties** at once"*. The two sentences point
different ways for the screens that already exist: Maintenance, Contacts and Settings →
Properties are tables with none of it.

What is unambiguous is already built: Jobs and Tasks have all four views, drag-and-drop
and bulk edit. What is not is how far back to go, and it is not a small amount of work,
so it is a question rather than a guess:

- **Maintenance** is the one where all four views have something true to draw — a reported
  date, a next visit and an owner. Board, gantt and calendar, or leave it a table?
- **Settings → Properties** is named in the sentence ("or properties"), so **selection and
  bulk edit** there looks intended even if the four views are not. Confirm?
- **Contacts** and the other Settings tables are configuration and lookups. Claude's
  reading is that these are the "unless specified otherwise" case and stay tables with
  sorting, filters and bulk edit only. Agree?

Nothing is blocked on this — the rules are written down and the two boards meet them. It
decides how much retro-fitting to schedule, and in what order.

---

## Answered

| Date | Question | Answer |
| --- | --- | --- |
| 10 Sep | (asked as 3) Saved projects views carrying `?stage=` — leave them, or rewrite them? | **Leave them.** *"[No preference]"* — so the recommendation stands, and this records that Claude made the call rather than Amber. The new meaning (the project's own phase) matches the Stage grouping, which was the point of #51. Anyone whose saved view shifted sees a different set once and re-saves it: one confusing moment, no lost work. The rewrite was rejected because `saved_views` stores the query string verbatim (0048) and nothing in it distinguishes a view saved BEFORE #51, where `stage=` meant "has a job in this stage", from one saved after, where the person meant the project's phase — so a blanket `UPDATE` would silently break the second kind to fix the first. **Revisit only if somebody reports a saved view behaving oddly**, at which point it is one person's view to correct rather than a migration |
| 10 Sep | (asked as 2) What belongs in `SHARE_ALLOWED_ORIGINS`? | **Three: `hub.lofty.au`, the Vercel name, and `app.lofty.au`.** *"keep vercel, lofty and app.lofty"*, then *"hub.lofty.au is where the app is at redirected from vercel"* — so "lofty" is `hub.lofty.au`. **Netlify goes**, removed entirely on 6 September. Set to `https://hub.lofty.au,https://loftyprojectapp.vercel.app,https://app.lofty.au` — comma-separated, no spaces, no trailing slashes; the function does an exact string match on the browser's `Origin` header, so a trailing slash or `http://` fails closed and silently. **Claude cannot set it**: it is a Supabase edge-function secret (Project Settings → Edge Functions → Secrets), so this one is Amber's to paste in. Two things worth knowing about the value. Because Vercel REDIRECTS to `hub.lofty.au`, a browser on the live app always sends `https://hub.lofty.au` — the vercel.app entry is belt-and-braces for anyone who lands on the bare Vercel name before the redirect, not the origin production actually uses. And it does **not** cover preview deployments: those answer on a per-branch host like `loftyprojectapp-git-<branch>-loftygroup.vercel.app`, which is a different origin from `loftyprojectapp.vercel.app`, so share links opened from a preview will still be refused. If testing shares on a preview is ever wanted, that is a separate decision — the allowlist is exact-match with no wildcards. The records also disagreed about the starting state: this file said the secret holds three origins, `HANDOFF.md` said it is unset and the endpoint answers `503 "Sharing is not switched on."`. Either way `hub.lofty.au` was not among them, which is why sharing does not work today |
| 10 Sep | (asked as 1) Turn on leaked-password protection? | **Not yet — leave it off for now.** Supabase's HaveIBeenPwned check stays off, so nothing changes for anyone setting a password. It is one dashboard toggle whenever that changes, and it only ever affects NEW and CHANGED passwords — no existing account is touched and nobody is forced to reset. **Worth putting back in front of Amber before the app opens to the wider team**, which is the point at which the friction is cheapest to absorb and the exposure largest. The security advisor will keep flagging it meanwhile, and that is expected rather than something to silence |
| 9 Sep | (asked as 15) Exported documents: Helvetica, or the brand's new Arial? | **Neither — Montserrat.** *"exported documents in monteserat unless it has fonts embedded in it for print then it will be brand font"*. The Word file names Montserrat; the PDF embeds a WinAnsi subset of Montserrat Regular and SemiBold (~41 kB each, `scripts/build-montserrat.mjs`) since it cannot name a face that is not one of the fourteen. The "brand font when embedded" half is question 15 above, held on the licence |
| 9 Sep | Which orange carries text — the mockups' split, or `Button.jsx`? | Amber first chose **`Button.jsx`**: *"The one filled orange action inverts on hover — fill drops out, orange becomes ink and line."* Applied as drawn that is white on `#f47e63` at 2.62:1, so the follow-up put two options in front of her and she took the Button's behaviour on the pressed step (fill `#c2543c`, inverting to `#c2543c` ink and line, 4.5:1 both states) — built, probed in both themes, pushed. Then, seeing it: *"Make sure buttons are crisp orange."* **Final: Crisp Orange, as `Button.jsx` draws it.** White on `#f47e63` at rest, `#f47e63` ink and line on hover, 2.62:1 in both light states (6.1:1 on dark hover); recorded as shortfalls in `check-contrast`, never allowed to get worse. The pressed step is one line away in `theme/tokens.css` if ever wanted. The 7 Sep pressed-orange decision is superseded |
| 9 Sep | Arial as the fallback, or the style guide's "never Arial"? | **Arial** — *"Fallback order is Montserrat first, then Arial. Do not substitute Helvetica, Calibri or Aptos."* The style guide's bad example in the brand repository is the one that is wrong |
| 9 Sep | Icon count 276 or 274? | **274** plus the 14 Lofty glyphs — readme and changelog are right, `SKILL.md` in the brand repository is stale |
| 9 Sep | Is Mid Grey still a colour? | **Yes** — it is in the design project's `guidelines/colors-brand.html`. Brand only; it draws no UI and no token file declares it, which is why the mirror has no `--lofty-mid-grey` |
| 9 Sep | Board phase colour — the mockups' orange strip, the guideline's none, or the app's teal? | *"happy to do whatever looks best.. green is fine to stay"* — **the teal ramp stays**. Off the palette by name, accepted by the owner |
| 9 Sep | Rail selection and the 56/224 shell from the mockups? | *"the mockups of sidebar and shell is mainly for concepts for slideout draw with the way it presents"* — **concept only**; the app's shell, white pill and 64/232 are not asked to change |
| 9 Sep | The eight PNG-wrapped domain icons? | *"The real vectors are uploaded in the repository as well"* — **not found**: as of brand `main` @ 447b873 and the design project on 9 Sep, Design, Drawings, FloorPlan, JobHouse, JobSite, Maintenance, Projects and Reports are each an SVG wrapping a PNG. Re-check on the next sync |
| 8 Sep | (asked as 14) Which AI vendors may receive Lofty's data through Ask and MCP? | **Anthropic only**, via the Claude API — chosen with Claude on Microsoft Foundry, "any vendor" and "none yet" in front of her. The Ask box ships in Phase 1; no ChatGPT connection; the vendor sits behind one config value so a later move is a setting, not a rebuild |
| 8 Sep | (asked as 15) "Microsoft cowork": which product? | **Microsoft 365 Copilot** — a Copilot Studio agent in Teams over the MCP server |
| 8 Sep | (asked as 16) Xero: one organisation, and what does an invoice belong to? | **One organisation** → a custom connection. And the shape is purchase orders before invoices: *"Each job has many purchase orders created in SiteBook belonging to contractors that need to be linked to jobs and pushed into xero for reconciling"*, then *"Right now I just want to pull info from SiteBook but going forward we want to eventually replace SiteBook so will need to push to xero"*. So SiteBook → Hub now, Hub → Xero later and designed for from the first migration. The invoice with no purchase order is question 13 (open, below) |
| 8 Sep | (asked as 17) SiteBook: API, export, or neither? | *"They have an mcp and api but don't know details yet. This is important to know."* What Hub needs from it: *"job details, purchase order documents, contact details"*. **SiteBook moves ahead of Xero** in the phase order, because the purchase orders Xero reconciles come from it. First task of that phase: the developer documentation and a test login |
| 8 Sep | (asked as 18) Who connects an AI client, and who creates a key? | *"Only managers can connect it to approved sources but I want people to be able to connect their own email. Can this be done with a single organisation wide key. I don't want users to connect their own. This is done by superadmin."* Read as: a **superadmin connects approved sources once, organisation-wide**; **nobody connects a personal AI client**; **each person connects their own mailbox**. The single-key question is answered in the plan §3 — yes to one organisation-wide *connection*, no to one organisation-wide *identity*: the person rides through on SSO so RLS still decides row by row and the Activity tab still says who. "Managers" versus "superadmin" is question 14 (open, below) |
| 8 Sep | (asked as 19) Is Ask read-only in its first version? | **Yes** — *"Read-only first"*. Adding a comment from the phone is Phase 2 |
| 7 Sep | Should the tables stop being visible to `anon` in the GraphQL schema? | **Yes.** `0101` revokes every table privilege from `anon` in `public`, present and future. Visible was never readable — RLS held, and the proof watched it hold — but the shape was discoverable; now a read as `anon` is refused at the privilege rather than answered with zero rows. Sequences left as they were. Nothing runs as `anon`: the share endpoint and the other three edge functions hold the service role |
| 7 Sep | Bugs and Ideas came off Admin as well — is that right? | **Yes — Updates only.** Asked in chat and answered the same evening: one page at `/updates`, the stage/phase/kind/merge controls admin-only inside it. Nothing to restore; `FeedbackList.tsx` stays deleted |
| 7 Sep | "Import a document as a template" — Word, or Markdown? | **Both Word and PDF** — *"Import template as word or pdf"*, which answered the question by rejecting its premise: Markdown was never the point, and PDF had not been offered. `.docx` goes through `mammoth` and is a translation between two structures. **PDF is not**: a PDF records glyphs at coordinates, so headings are inferred from text size and paragraphs from vertical gaps, and tables are deliberately not inferred at all — column detection from spacing gets a merged cell wrong silently, and a table one column out is worse than prose somebody can see is wrong. Every import returns notes saying what it could not carry, shown before the document is created |
| 7 Sep | How should an image get into a document? | **A public bucket** — *"upload to public bucket that stores in the document only"*, chosen with the alternative in front of her. The alternative was signed URLs written into the share snapshot with the link's own expiry, which Claude recommended; the trade accepted is that **an image in a shared document stays fetchable after the link expires**. "Stores in the document only" is why there is no attachments table: the block holds the URL and the layout is the record of what a document carries. `0100`, and the way back if it is ever revisited is one flag plus signing in `compileForShare` |
| 7 Sep | Does undo work after the seam rewrite (#51)? | **"undo redo works"** — confirmed on the live app after the first version (six hand-registered sites) had failed her: *"it didn't let me undo it"* |
| 7 Sep | How many digits is a job number? | **Three** — *"the job numbers are 3 digits"*. Migration 0073 had already made it so; the toolbar's example read `1042-03` and now reads `1042-003`. Older two-digit examples remain in earlier sessions' notes and in `dictionary.ts` |
| 7 Sep | Should there be a CI check for the generated files and the responsive sweep? | **Yes** — *"ok"*. Both are jobs now; the generated-files check caught two real faults on its first day |
| 7 Sep | Filters, a number box, property columns | *"filters on jobs and projects should be same as the group ones … an advanced … enter a job number … columns should be able to add any property in the job (including project properties …)"* — **done in #51** |
| 7 Sep | Should creating a notification *type* stay with admins? | **Yes** — `0097`. Insert and delete are admin's; a manager keeps every rule and may still change an existing type's default channels, timing and active flag, which is what Settings → Automations edits. Three policies by command, not one `for all`, because `for all` would have taken that screen off managers |
| 7 Sep | What does "mark as complete" mean for the seven import sites? | **The question dissolved.** *"i don't need any jobs imported from spreadsheets. all jobs that need to be created from now on will be created from the projects in the app"* — so there is no import, no second copy, and nothing to reconcile. Phase B is closed without ever running |
| 7 Sep | What happens to the import machinery on the live database? | **Nothing — leave it.** *"everything that is in supabase now is correct. If I need to import other areas I will let you know as properties may change between now and then. No new importing for job or projects"*. The staging table, its 801 rows and the three functions stay applied and inert |
| 7 Sep | Should filled primary buttons use the pressed orange? | **Yes.** Filled buttons paint `--primary-action-color` `#c2543c` (4.54:1 with white); `--primary-color` stays `#f47e63` for focus rings, tints, accents and chart series. Hover `#9a4330` is derived here and should go back into the design project |
| 7 Sep | Text colour on Crisp Orange | **Never black on orange.** Filled orange carries Finisher White. Reversed the previous day's ink decision; the design system was updated to match |
| 7 Sep | Where do the three contrast fixes live? | Amber fixes them in the Claude Design project; Claude supplies exact hexes and re-syncs. Sync stays one-way into this repository. *Two of the three arrived on the evening sync: the dark Eco Green fill is `#20707a` (5.74:1 with white) and the dark control boundary `#807f74` (3.86:1). The placeholder did not move — question 9 above* |
| 7 Sep | PR #47 — merge, or hold? | Held as a draft while Amber looked, then **merged** (`3d218d0`). She marked it ready for review and confirmed the merge; it deployed the rebrand to `hub.lofty.au` |
| 7 Sep | Who sees Bugs and Ideas triage? | *"Only admins and super admin get to see the bug manager."* The **form** is open to everyone with app access, viewers included. Both already behaved that way. *(Later the same day the Bugs and Ideas tabs left Admin too, and Amber confirmed that is right — see the top row)* |
| 7 Sep | Is Roadmap/Changelog duplicated? | Yes — *"there is duplication on footer and other page"*. **Done:** the Admin tabs came out, the cog links to `/updates`, and `/admin/roadmap` and `/admin/changelog` forward there |
| 7 Sep | The seven colliding import sites | The app is the record; ignore those workbook rows. *(Superseded the same day by closing the import altogether — see the two rows above)* |
| 6 Sep | Primary colour | Follow the design system: **Crisp Orange**, inverting the app's previous green primary |
| 6 Sep | How much of the design system to take? | Tokens, icons and brand assets only — not the ~50 JSX components, the 276 Vibe icons, the Fieldwork fonts or the brand silhouettes |
| 6 Sep | The domain | `hub.lofty.au`, on **Vercel** |
| 6 Sep | Netlify | Remove it entirely |
| 6 Sep | `HANDOFF.md` | Split: current state at the root, the session-by-session record into `history/` |
| 6 Sep | The loose prototypes | Move to `prototypes/` and archive the dead ones |
| 4 Sep | `amberbeaumont/modules` | Out of scope. *"ignore the amberbeaumont repositry now"* |
