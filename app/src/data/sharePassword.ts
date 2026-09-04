/**
 * Hashing the optional password on a share link.
 *
 * WHY THE BROWSER DOES THIS AND NOT THE SERVER
 *
 *   Creating a link is an ordinary authenticated write through the repository seam. If
 *   the password travelled as plaintext it would sit in a request body, and from there in
 *   whatever logs the path happens to keep. Deriving here means the plaintext never
 *   leaves the tab that typed it: what is written is already a hash.
 *
 *   The viewer's password does still travel, once, to the endpoint that checks it — there
 *   is no way around that — but it is compared against a derived hash and never stored.
 *
 * WHY PBKDF2 AND NOT SOMETHING BETTER
 *
 *   bcrypt and argon2 are better and neither is in the browser. PBKDF2-SHA256 is what
 *   Web Crypto offers natively, in the browser and in Deno both, so one implementation
 *   covers the deriving side and the checking side with no dependency on either. A second
 *   library on one side is how the two ends drift until the password stops being checked.
 *
 *   The iteration count is high enough to cost real time against a hash that an attacker
 *   would have to steal the database to obtain, and low enough not to freeze a phone.
 *
 * THE ENCODED FORM
 *
 *   pbkdf2$sha256$<iterations>$<salt base64>$<hash base64>
 *
 *   Self-describing on purpose: raising the iteration count later leaves existing links
 *   verifiable, because each one carries the count it was made with.
 */

const ITERATIONS = 210_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

const b64 = (bytes: ArrayBuffer | Uint8Array): string => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary);
};

/**
 * Derive the stored form of a share password.
 *
 * @throws if the browser has no Web Crypto subtle — which means an insecure context
 *   (plain http). Refusing is right: silently storing something weaker would make the
 *   password decorative, and the caller shows the failure rather than creating the link.
 */
export async function hashSharePassword(password: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("This browser cannot hash a password on an insecure connection.");

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
    key,
    HASH_BITS,
  );
  return `pbkdf2$sha256$${ITERATIONS}$${b64(salt)}$${b64(bits)}`;
}

/**
 * A share token: 32 bytes of CSPRNG, base64url.
 *
 * Not a uuid. A uuid is 122 bits of randomness with a recognisable shape, and this is the
 * only thing standing between a URL and a document — so it is the full 256 bits, and it
 * looks like nothing in particular.
 */
export function newShareToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
