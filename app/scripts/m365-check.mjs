/**
 * `npm run check:m365` — the decisions in the Microsoft 365 modules that are pure.
 *
 * WHY THIS EXISTS AS ITS OWN CHECK
 *
 *   Almost everything in `supabase/functions/_shared/` needs a tenant: a folder copy needs
 *   SharePoint, a channel post needs a webhook, reading mail needs a mailbox that does not
 *   exist yet. Four things do not, and all four are the kind that fail silently and late:
 *
 *   1. **Where a forwarded email goes.** `routeMessage` decides which job an email lands on.
 *      Wrong, and somebody's private conversation about a variation is on the wrong house's
 *      record — visible to the wrong people, in a system Lofty is being asked to trust with
 *      one copy of everything. The subject-line fallback is the dangerous half: it reads a
 *      number out of text a person typed.
 *
 *   2. **That the address the app SHOWS is the address the receiver UNDERSTANDS.** The two
 *      live in different functions (`addressForRecord`, `routingFromAddress`) and nothing
 *      but this makes them agree. If they drift, the app shows a click-to-copy address on
 *      every job that silently routes nothing, and the failure looks like "email is broken"
 *      rather than like a bug with a location.
 *
 *   3. **That a folder name SharePoint will refuse never reaches SharePoint.** "Lot 3/5
 *      Corner Street" is an ordinary South Australian address and an illegal folder name.
 *      That one fails loudly. The quiet one is a trailing space or dot, which SharePoint
 *      accepts and then trims, so the folder is not found by the name it was created with.
 *
 *   4. **That a Teams @mention resolves.** A card's text and its `msteams.entities` are two
 *      halves of one thing; out of step, Teams renders the literal `<at>Name</at>` and the
 *      person is not notified. It looks like a formatting bug and is a delivery failure.
 *
 *   None of it needs a browser, a database or a network. It is a few milliseconds, and it is
 *   the part of the integration that can be true before Lofty's tenant is configured at all.
 *
 * Each assertion here was watched failing — the function mutated, the check run, the report
 * read — before it was committed. CLAUDE.md: a check nobody has watched fail is not evidence.
 */
import { routeMessage, routingFromAddress, addressForRecord } from "../supabase/functions/_shared/mail.ts";
import { safeFolderName } from "../supabase/functions/_shared/sharepoint.ts";
import { card, redact } from "../supabase/functions/_shared/teams.ts";

const failures = [];
const check = (what, condition, detail = "") => {
  if (!condition) failures.push(`${what}${detail ? ` — ${detail}` : ""}`);
};
const eq = (what, got, want) =>
  check(what, JSON.stringify(got) === JSON.stringify(want), `expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);

const MAILBOX = "hub@lofty.com.au";

// ───────────────────────────────────────────────── 1. reading a plus address

eq("a job address routes to the job", routingFromAddress("hub+1042-001@lofty.com.au"), {
  kind: "job", jobId: "1042-001", via: "address",
});
eq("a community-title job keeps its c", routingFromAddress("hub+1042-001c@lofty.com.au"), {
  kind: "job", jobId: "1042-001c", via: "address",
});
eq("SHOUTED addresses route the same", routingFromAddress("Hub+1042-001C@Lofty.com.au"), {
  kind: "job", jobId: "1042-001c", via: "address",
});
eq("a project address routes to the project", routingFromAddress("hub+1042@lofty.com.au"), {
  kind: "project", projectId: 1042, via: "address",
});
eq("ordinary mail routes nowhere", routingFromAddress("amber@lofty.com.au"), { kind: "none" });
eq("a plus tag that is not a number routes nowhere", routingFromAddress("hub+newsletter@lofty.com.au"), { kind: "none" });
eq("a job past 999 still routes", routingFromAddress("hub+1042-1001@lofty.com.au"), {
  kind: "job", jobId: "1042-1001", via: "address",
});

// ─────────────────────────────── 2. what the app shows is what the receiver reads
//
// The round trip, over the shapes `job_number()` in migration 0120 actually builds. This is
// the one assertion that would catch either side being changed on its own.
for (const tag of ["1042", "1042-001", "1042-001c", "20261", "1042-1001", "20261-014c"]) {
  const shown = addressForRecord(MAILBOX, tag);
  const read = routingFromAddress(shown);
  const backToTag = read.kind === "job" ? read.jobId : read.kind === "project" ? String(read.projectId) : "(nothing)";
  eq(`the address the app shows for ${tag} routes back to ${tag}`, backToTag, tag);
}

// ───────────────────────────────────────── 3. routing a whole message, not an address

const message = (over = {}) => ({
  subject: "Slab booked",
  toRecipients: [{ emailAddress: { address: "hub@lofty.com.au" } }],
  ccRecipients: [],
  ...over,
});

eq("the address on To: wins", routeMessage(message({
  toRecipients: [{ emailAddress: { address: "hub+1042-001@lofty.com.au" } }],
  subject: "FW: 9999-999 something else entirely",
})), { kind: "job", jobId: "1042-001", via: "address" });

eq("a job address on Cc: is read too", routeMessage(message({
  ccRecipients: [{ emailAddress: { address: "hub+1042-002@lofty.com.au" } }],
})), { kind: "job", jobId: "1042-002", via: "address" });

eq("a forwarded subject is the fallback", routeMessage(message({
  subject: "FW: 1042-001 slab inspection Thursday",
})), { kind: "job", jobId: "1042-001", via: "subject" });

// The guard. A bare number in a subject is a price, a lot, a year or a phone number far
// more often than it is a project, and putting somebody's email on the wrong project is
// worse than leaving it in the inbox for a person to place.
eq("a bare number in a subject routes NOWHERE", routeMessage(message({
  subject: "Re: quote came back at 1042 per square",
})), { kind: "none" });

// The other half of that guard, and the reason there are two patterns rather than one.
// A single loose pattern read "the 2024-2025 budget" as job 2024 sequence 2025 and filed
// a finance email onto a house. The subject pattern insists on a three-digit sequence.
eq("a year range in a subject routes NOWHERE", routeMessage(message({
  subject: "Re: the 2024-2025 budget",
})), { kind: "none" });

eq("nor does a date range", routeMessage(message({ subject: "Site meeting 2026-09 or 15-16 Sept" })), { kind: "none" });

eq("an ordinary email routes nowhere", routeMessage(message()), { kind: "none" });

// But the thousandth job in a project is still routable the deliberate way.
eq("a four-digit sequence routes by address, which is where it is typed on purpose",
  routingFromAddress("hub+1042-1001@lofty.com.au"), { kind: "job", jobId: "1042-1001", via: "address" });

// ────────────────────────────────────────────── 4. names SharePoint will accept

eq("a slash in an address becomes a dash", safeFolderName("1042-001 - GOLDEN GROVE, Lot 3/5 Corner Street"),
  "1042-001 - GOLDEN GROVE, Lot 3-5 Corner Street");
eq("the characters SharePoint refuses are dropped", safeFolderName('1042 - A"B*C:D<E>F?G|H'), "1042 - ABCDEFGH");
eq("a trailing dot is removed", safeFolderName("1042 - GOLDEN GROVE, 28 Corner St."), "1042 - GOLDEN GROVE, 28 Corner St");
eq("a trailing space is removed", safeFolderName("1042 - GOLDEN GROVE  "), "1042 - GOLDEN GROVE");
eq("runs of whitespace collapse", safeFolderName("1042  -   GOLDEN\tGROVE"), "1042 - GOLDEN GROVE");
check("a name left with nothing in it is refused, not silently emptied", (() => {
  try { safeFolderName(" ... "); return false; } catch { return true; }
})());
check("a very long name is cut to something SharePoint accepts", safeFolderName("x".repeat(400)).length <= 250);

// ──────────────────────────────────────────────── 5. a Teams mention resolves

const posted = card({
  title: "1042-001 moved to Construction",
  body: "Deanna moved it this morning.",
  href: "https://hub.lofty.au/jobs/1042-001",
  facts: [{ name: "Project", value: "1042 — 28 Corner Street" }],
  mentions: [{ id: "ketan@lofty.com.au", name: "Ketan" }],
});
const content = posted.attachments[0].content;
const texts = content.body.filter(b => b.type === "TextBlock").map(b => b.text);
const entities = content.msteams.entities;

check("a mention is written into the card's text", texts.some(t => t.includes("<at>Ketan</at>")));
eq("and named in msteams.entities, spelled identically", entities.map(e => e.text), ["<at>Ketan</at>"]);
eq("pointing at somebody Teams can resolve", entities[0].mentioned.id, "ketan@lofty.com.au");
check("the card carries the link as its one action",
  content.actions.length === 1 && content.actions[0].url === "https://hub.lofty.au/jobs/1042-001");
check("a post with nobody to mention carries no mention block",
  card({ title: "1043 created" }).attachments[0].content.msteams.entities.length === 0);

// ────────────────────────────────────── 6. a webhook URL never reaches an error

const WEBHOOK =
  "https://prod-12.australiasoutheast.logic.azure.com:443/workflows/abc123/triggers/manual/paths/invoke" +
  "?api-version=2016-06-01&sig=THIS_IS_THE_CREDENTIAL_AND_MUST_NOT_BE_LOGGED";
const hidden = redact(WEBHOOK);
check("the signature is not in a redacted webhook URL", !hidden.includes("THIS_IS_THE_CREDENTIAL_AND_MUST_NOT_BE_LOGGED"), hidden);
check("nor is any query string at all", !hidden.includes("?"), hidden);
check("but enough is left to tell two webhooks apart", hidden.includes("logic.azure.com"), hidden);
check("an unparseable URL does not throw on its way into an error message",
  redact("not a url at all").length > 0);

// ───────────────────────────────────────────────────────────────────── report

if (failures.length) {
  console.error(`✗ ${failures.length} of the Microsoft 365 decisions are wrong:\n`);
  for (const f of failures) console.error(`  · ${f}`);
  console.error("");
  process.exit(1);
}
console.log("✓ m365: routing, the address round trip, folder names, mentions and webhook redaction all hold");
