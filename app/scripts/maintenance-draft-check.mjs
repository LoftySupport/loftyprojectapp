/**
 * `npm run check:maintenance-draft` — the half-filled form, kept and kept safely.
 *
 * Amber, 14 September: *"ensure the form persists on job drawer when pulling out"*.
 * Reproduced first: one stray click on the scrim, or one Escape, unmounted the drawer and
 * took every field with it — with a pasted list of twelve issues, the whole entry.
 *
 * The persistence itself is wiring and is checked in a browser. What is checked HERE is
 * the part that can put a defect on the wrong house, which deserves a guard that runs in
 * a second and cannot be skipped for being slow:
 *
 *   - a drawer opened for a job restores only a draft naming THAT job;
 *   - an untouched form never overwrites a real draft;
 *   - a stale draft is not resurrected;
 *   - a browser that refuses to store anything does not break the form.
 *
 * `localStorage` is stubbed because Node has none. That is the whole of the fake: the
 * module under test is the shipping one.
 */
const store = new Map();
let throwOnUse = false;
globalThis.localStorage = {
  getItem: (k) => { if (throwOnUse) throw new Error("blocked"); return store.has(k) ? store.get(k) : null; },
  setItem: (k, v) => { if (throwOnUse) throw new Error("blocked"); store.set(k, String(v)); },
  removeItem: (k) => { if (throwOnUse) throw new Error("blocked"); store.delete(k); }
};

const { readDraft, writeDraft, clearDraft, draftIsEmpty } = await import("../src/data/maintenanceDraft.ts");

let failures = 0;
const ok = (name, condition, detail = "") => {
  if (condition) console.log(`  ok   ${name}`);
  else { failures += 1; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};

const issue = (over = {}) => ({
  summary: "", description: "", assigneeKind: "internal",
  assigneeProfileId: null, assignedCompanyId: null, fileNames: [], ...over
});
const draft = (over = {}) => ({
  job: null, identifiedOn: "2026-09-14", identifiedAt: null, reportedBy: null,
  issues: [issue()], dump: "", ...over
});

// ---- what counts as empty ------------------------------------------------------
// The date defaults to today, so a form nobody has touched still carries one. Counting
// that as content would mean every glance at the drawer saved a draft over a real one.
ok("an untouched form is empty, even though the date defaults to today",
  draftIsEmpty(draft()));
ok("one typed issue is not empty", !draftIsEmpty(draft({ issues: [issue({ summary: "Tap leaking" })] })));
ok("a pasted list alone is not empty", !draftIsEmpty(draft({ dump: "Tap leaking" })));
ok("a chosen repairer alone is not empty",
  !draftIsEmpty(draft({ issues: [issue({ assignedCompanyId: "abc" })] })));
ok("an attached file alone is not empty",
  !draftIsEmpty(draft({ issues: [issue({ fileNames: ["IMG_0042.jpg"] })] })));

// ---- the wrong-house guard -----------------------------------------------------
clearDraft();
writeDraft("1042-01", draft({ job: "1042-01", issues: [issue({ summary: "Ensuite tap leaking" })] }));
ok("a draft restores into the drawer it was written in",
  readDraft("1042-01")?.issues[0].summary === "Ensuite tap leaking");
// Scoped by key: a draft written from 1042-01's drawer belongs to that drawer alone.
ok("it is not offered to the unscoped drawer, which has its own draft",
  readDraft(null) === null);
// The one that matters. A defect logged against somebody else's house looks normal.
ok("a draft for 1042-01 does NOT restore into 1055-01's drawer",
  readDraft("1055-01") === null, JSON.stringify(readDraft("1055-01")));
// The second fault the checks caught: opening the wrong drawer used to start blank and
// then save that blank form over the stored draft, destroying work that had not been lost.
writeDraft("1055-01", draft({ job: null, issues: [issue()] }));   // what an untouched drawer writes
ok("opening another job's drawer does not destroy the first draft",
  readDraft("1042-01")?.issues[0].summary === "Ensuite tap leaking");

clearDraft("1042-01");
writeDraft(null, draft({ job: null, issues: [issue({ summary: "Written with no job in mind" })] }));
// Caught by the browser check when the guard was first written too loosely: a jobless
// draft passed into a job's drawer, which is text written about one house on another.
ok("a draft with no job does not restore into a job's drawer either",
  readDraft("1055-01") === null, JSON.stringify(readDraft("1055-01")));
ok("but it does restore where it was written", readDraft(null) !== null);
ok("and a drawer for a job it does not name gets nothing", readDraft("1055-01") === null);

// ---- housekeeping ---------------------------------------------------------------
clearDraft(null);
ok("a cleared draft is gone", readDraft(null) === null);

writeDraft(null, draft({ issues: [issue({ summary: "Tap leaking" })] }));
ok("an empty form does not overwrite a real draft", (writeDraft(null, draft()), readDraft(null) === null),
  "writing an empty draft should REMOVE it, leaving nothing to restore");

// Stale. A fortnight is the cut; a month-old draft reappearing is a draft nobody wants.
store.set("lofty.maintenance.draft.v1:none", JSON.stringify({
  ...draft({ issues: [issue({ summary: "Last month" })] }),
  savedAt: Date.now() - 30 * 24 * 60 * 60 * 1000
}));
ok("a draft older than the keep-for window is not resurrected", readDraft(null) === null);

// Nonsense in storage — somebody's extension, an older shape, a truncated write.
store.set("lofty.maintenance.draft.v1:none", "{not json");
ok("unreadable storage is treated as no draft, not as a crash", readDraft(null) === null);
store.set("lofty.maintenance.draft.v1:none", JSON.stringify({ job: null, savedAt: Date.now() }));
ok("a draft with no issues array is refused", readDraft(null) === null);

// A private window, or a browser set to block site data. The form must still open.
throwOnUse = true;
ok("storage that throws reads as no draft rather than breaking the drawer", readDraft(null) === null);
ok("and writing to it does not throw either",
  (() => { try { writeDraft(null, draft({ issues: [issue({ summary: "x" })] })); return true; } catch { return false; } })());
throwOnUse = false;

console.log(failures ? `\n${failures} failed` : "\nok — the draft is kept, and never on the wrong house");
process.exit(failures ? 1 : 0);
