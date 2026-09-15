/**
 * When the app is ahead of its database, say so in those words.
 *
 * 10 September, twice in one afternoon: two PRs merged, Vercel deployed the code, and the
 * migrations they needed were never applied. The app asked for `documents.document_url`
 * and `report_documents.report_document_published_at`, PostgREST answered "column does not
 * exist", and the Documents panel rendered that sentence to somebody who had no way to act
 * on it. Amber: *"it is borkne i can't use documents now"*.
 *
 * The database was fixed in minutes. What took the time was that nothing in the app said
 * WHAT was wrong — a raw Postgres error naming a column reads as a bug in the code, so the
 * first place anybody looks is the code.
 *
 * WHY THIS IS AT THE SEAM AND NOT ON THE SCREENS
 *
 *   Every screen reads through `repository.ts`, and there are dozens. A translation added
 *   per screen is a promise each future screen has to remember to keep, and this repo has
 *   already learned what that is worth: undo was registered by hand at six call sites, the
 *   app had fifty places that write, and it looked broken because the seventh was never
 *   added. So this wraps the repository once, the same way `withUndo` does.
 *
 * WHAT IT DOES NOT DO
 *
 *   It does not prevent the deploy. Prevention is `npm run check:migrations`, which
 *   compares the repo's migrations against the live database before anything ships. This
 *   is the second line: when prevention has failed anyway, the person looking at the
 *   screen learns the cause instead of a column name.
 */

/**
 * The two shapes PostgREST uses for "that column is not there", and they are different
 * enough to be worth naming both.
 *
 * `42703` is Postgres itself, on a READ: the select list named a column the table does not
 * have. `PGRST204` is PostgREST on a WRITE, and it comes from the SCHEMA CACHE rather than
 * the database — which is its own trap, because it also appears for a few seconds after a
 * migration IS applied and before the cache reloads. The message says so.
 */
const MISSING_COLUMN_CODES = new Set(["42703", "PGRST204"]);

/** `relation "public.x" does not exist` — a whole table missing, not just a column. */
const MISSING_TABLE_CODE = "42P01";

interface Postgrestish {
  code?: string;
  message?: string;
}

/** The column or table the database was asked for, when the message names one. */
function subjectOf(message: string): string | null {
  // Postgres: column x.y does not exist / column "y" of relation "x" does not exist
  const col = message.match(/column ["']?([\w.]+)["']?(?: of relation ["']?([\w.]+)["']?)? does not exist/i);
  if (col) return col[2] ? `${col[2]}.${col[1]}` : col[1];
  // PostgREST's schema-cache wording.
  const cached = message.match(/Could not find the ['"]([\w.]+)['"] column of ['"]([\w.]+)['"]/i);
  if (cached) return `${cached[2]}.${cached[1]}`;
  const rel = message.match(/relation ["']?([\w.]+)["']? does not exist/i);
  if (rel) return rel[1];
  return null;
}

/**
 * Is this the app asking for something the database has not got yet?
 *
 * Deliberately narrow. A permission error, a constraint violation and a network failure all
 * stay exactly as they are: dressing an unrelated fault up as "run the migrations" would
 * send the next person down the wrong path, which is the fault this file exists to fix
 * rather than to repeat in the other direction.
 */
export function isSchemaDrift(error: unknown): boolean {
  const e = error as Postgrestish | null;
  if (!e || typeof e !== "object") return false;
  const code = typeof e.code === "string" ? e.code : "";
  return MISSING_COLUMN_CODES.has(code) || code === MISSING_TABLE_CODE;
}

/**
 * The same error, rewritten so a person can act on it.
 *
 * Keeps the original message at the end rather than replacing it: whoever is debugging
 * still needs the column name, and a friendly sentence that hides the fault is how a real
 * problem gets ignored for a week.
 */
export function describeSchemaDrift(error: unknown): Error {
  const e = error as Postgrestish;
  const subject = subjectOf(e.message ?? "") ?? "something";
  const cached = e.code === "PGRST204";
  const out = new Error(
    `The app is ahead of the database. It asked for ${subject}, which is not there yet — ` +
    (cached
      ? "either a migration has not been applied, or one was applied moments ago and the API's schema cache has not caught up. "
      : "a migration has been deployed in the code but not applied to the database. ") +
    "Nothing you did caused this and nothing has been lost. Whoever looks after the database " +
    "can apply the outstanding migrations; `npm run check:migrations` lists them. " +
    `(${e.message ?? "no detail"})`
  );
  // Carried through so a caller that branches on the code still can, and so this is not a
  // one-way door: the original is recoverable.
  (out as Error & { code?: string; cause?: unknown }).code = e.code;
  (out as Error & { cause?: unknown }).cause = error;
  return out;
}

/**
 * Every method on the repository, with schema drift translated.
 *
 * A Proxy rather than a hand-written wrapper per method: the seam has over a hundred
 * methods and a list of them here would be a list to keep in step. Non-function properties
 * (`name`, `wired`) pass straight through.
 */
export function withSchemaDriftNotice<T extends object>(repo: T): T {
  return new Proxy(repo, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        try {
          const result = (value as (...a: unknown[]) => unknown).apply(target, args);
          // Async is the normal case; the `.catch` has to be attached rather than awaited,
          // or this wrapper would turn every synchronous method into a promise.
          if (result && typeof (result as Promise<unknown>).catch === "function") {
            return (result as Promise<unknown>).catch((err: unknown) => {
              throw isSchemaDrift(err) ? describeSchemaDrift(err) : err;
            });
          }
          return result;
        } catch (err) {
          throw isSchemaDrift(err) ? describeSchemaDrift(err) : err;
        }
      };
    }
  });
}
