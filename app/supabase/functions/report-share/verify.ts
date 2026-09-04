// The password check, on its own so that it can be TESTED.
//
// index.ts is a Deno module that calls Deno.serve() at the top level and imports from an
// `npm:` specifier, so importing it from a Node check script is not possible. Splitting
// the two pure functions out means `npm run check:share-password` exercises THE CODE THAT
// RUNS, not a second copy of it written to match — which is how a password check quietly
// stops agreeing with the hash the browser wrote.
//
// Web Crypto only, so this file is valid in Deno and in Node without a shim.

const b64ToBytes = (s: string): Uint8Array =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/**
 * Compare two byte strings in time that does not depend on where they first differ.
 *
 * `a === b` on the hashes would leak the position of the first wrong byte to anybody
 * timing the endpoint, which over enough requests recovers the hash a byte at a time.
 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Verify a typed password against the stored form written by `data/sharePassword.ts`:
 *
 *   pbkdf2$sha256$<iterations>$<salt base64>$<hash base64>
 *
 * The iteration count comes out of the stored string rather than a constant here, so
 * raising it later leaves every existing link verifiable.
 */
export async function verifyPassword(stored: string, typed: string): Promise<boolean> {
  const [scheme, hash, iterations, salt, expected] = stored.split("$");
  if (scheme !== "pbkdf2" || hash !== "sha256") return false;
  const rounds = Number(iterations);
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 5_000_000) return false;

  const expectedBytes = b64ToBytes(expected);
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(typed), "PBKDF2", false, ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: b64ToBytes(salt), iterations: rounds },
    key,
    expectedBytes.length * 8,
  );
  return timingSafeEqual(new Uint8Array(bits), expectedBytes);
}
