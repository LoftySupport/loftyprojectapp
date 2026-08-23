/**
 * A signed-in session, for the responsive check and nothing else.
 *
 * NEVER IMPORTED BY THE APP. It lives outside `src/` on purpose, and the only thing
 * that reaches it is `scripts/vite.responsive.ts`, which is only loaded by
 * `npm run responsive`. `npm run build` does not know it exists.
 *
 * Why it has to exist: every route is behind `RequireAuth`, and rightly so — a gated
 * app that ungates itself when its configuration is missing is worse than one that
 * stops. But that means a headless browser sees the sign-in page and nothing else, so
 * there is no way to measure the board, the dictionary or a create dialog without
 * standing in for the session. This is that stand-in.
 *
 * The profile is a superadmin so the check reaches every screen, including the ones
 * `can()` hides. It is not a security decision — nothing here talks to Postgres, and
 * RLS would refuse it if it did.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";

const PROFILE: any = {
  id: "00000000-0000-0000-0000-000000000001",
  authUserId: "00000000-0000-0000-0000-000000000002",
  firstName: "Responsive",
  lastName: "Check",
  fullName: "Responsive Check",
  email: "responsive-check@example.invalid",
  permission: "superadmin",
  teams: ["design"],
  managedTeams: ["design"],
  active: true
};

const Ctx = createContext<any>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useMemo(() => ({
    status: "signed-in",
    session: { user: { id: PROFILE.authUserId } },
    profile: PROFILE,
    profileState: "linked",
    signIn: async () => {},
    signOut: async () => {},
    error: null
  }), []);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): any { return useContext(Ctx); }

export function initialsOf(p: any): string {
  return ((p?.firstName?.[0] ?? "") + (p?.lastName?.[0] ?? "")).toUpperCase();
}
