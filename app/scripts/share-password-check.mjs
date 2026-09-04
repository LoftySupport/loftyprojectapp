// Do the two ends of a share password agree?
//
// The browser derives the stored hash (src/data/sharePassword.ts). The endpoint checks a
// typed password against it (supabase/functions/report-share/verify.ts). They are written
// in different runtimes, deployed separately, and nothing else makes them agree — so if
// they ever stop agreeing, the symptom is a password-protected link that refuses the
// right password, or worse, one that accepts the wrong one.
//
// Both real modules are imported. Nothing here reimplements either side.

import { hashSharePassword, newShareToken } from "../src/data/sharePassword.ts";
import { verifyPassword } from "../supabase/functions/report-share/verify.ts";

let failed = 0;
const ok = (msg) => console.log(`  ok   ${msg}`);
const fail = (msg) => { failed++; console.error(`  FAIL ${msg}`); };
const is = (actual, expected, msg) => (actual === expected ? ok(msg) : fail(`${msg} — got ${actual}, wanted ${expected}`));

console.log("\nshare passwords: the browser hashes, the endpoint checks\n");

const stored = await hashSharePassword("28 Corner Street");

is(await verifyPassword(stored, "28 Corner Street"), true, "the right password is accepted");
is(await verifyPassword(stored, "28 corner street"), false, "a different case is refused");
is(await verifyPassword(stored, "28 Corner Street "), false, "a trailing space is refused");
is(await verifyPassword(stored, ""), false, "an empty password is refused");
is(await verifyPassword(stored, "28 Corner Stree"), false, "a prefix of the password is refused");

// The encoded form is what the column holds and what a future change would break.
const [scheme, hash, iterations, salt, digest] = stored.split("$");
is(scheme, "pbkdf2", "the stored form names its scheme");
is(hash, "sha256", "the stored form names its hash");
is(Number(iterations) >= 210_000, true, "the iteration count is at least 210,000");
is(atob(salt).length, 16, "the salt is 16 bytes");
is(atob(digest).length, 32, "the digest is 32 bytes (256 bits)");

// Two hashes of the same password must differ, or the salt is not doing anything and
// identical passwords across documents become visible to anyone reading the table.
const again = await hashSharePassword("28 Corner Street");
is(again === stored, false, "the same password hashes differently twice (the salt is random)");
is(await verifyPassword(again, "28 Corner Street"), true, "and the second hash still verifies");

// The iteration count is read from the stored string, so a link made at a lower count
// keeps working when the constant is raised. Proved by hand-building one.
const lowRounds = ["pbkdf2", "sha256", "1000", salt, digest].join("$");
is(await verifyPassword(lowRounds, "28 Corner Street"), false,
   "a hash claiming the wrong iteration count does not verify");

// Malformed stored values must be refused rather than throwing — a row that somehow holds
// junk should lock the link, not 500 the endpoint.
for (const junk of ["", "notahash", "bcrypt$sha256$1$a$b", "pbkdf2$sha512$1000$c2FsdA==$aGFzaA==",
                    "pbkdf2$sha256$0$c2FsdA==$aGFzaA==", "pbkdf2$sha256$abc$c2FsdA==$aGFzaA=="]) {
  let threw = false, result = null;
  try { result = await verifyPassword(junk, "anything"); } catch { threw = true; }
  if (threw) fail(`a malformed stored value threw instead of refusing: ${JSON.stringify(junk)}`);
  else is(result, false, `a malformed stored value is refused: ${JSON.stringify(junk) || '""'}`);
}

// The token is the only thing between a URL and a document, so its size is load-bearing.
const token = newShareToken();
is(/^[A-Za-z0-9_-]+$/.test(token), true, "a share token is URL-safe with no padding");
is(token.length >= 43, true, "a share token carries 256 bits");
is(newShareToken() === newShareToken(), false, "two tokens differ");

console.log(failed ? `\n${failed} FAILED\n` : "\nboth ends agree, and a malformed hash locks the link rather than breaking it\n");
process.exit(failed ? 1 : 0);
