/**
 * Lets `node` load the app's own modules.
 *
 * `src/` is written for a bundler, so its imports carry no extension —
 * `import { zip } from "./zip"`. Node's ESM resolver requires one and fails the import
 * rather than guessing. This hook adds `.ts` on the second attempt, which is the whole
 * difference between a check that runs the shipping code and a check that runs a copy
 * of it kept in step by hand.
 *
 * Node strips the types itself (22.18+), so nothing here compiles anything.
 */
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (error) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier)) {
      return await next(`${specifier}.ts`, context);
    }
    throw error;
  }
}
