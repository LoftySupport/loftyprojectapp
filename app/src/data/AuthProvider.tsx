import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useRepository } from "./DataProvider";
import { supabase } from "./supabaseRepository";
import type { Profile } from "./types";

/**
 * Who is signed in, and how they got there.
 *
 * Sign-in is Microsoft Entra through Supabase Auth — Azure OAuth, not SAML SSO. The
 * directory is single-tenant, so only a Lofty account reaches the consent screen at all;
 * everything past that point is Supabase's session and this app's `profiles` row.
 *
 * The gate itself lives in `RequireAuth` in App.tsx, not here — this provider only
 * reports what is true. It deliberately **does not read `permission` from the JWT**: the
 * level comes from the `profiles` row through the repository. Entra's token carries
 * `user_metadata`, which is user-editable, so an authorization check against it can be
 * edited by the person it is meant to restrict.
 *
 * None of this is the security boundary. RLS is: every read policy is gated on
 * `is_active_user()`, which needs an active `profiles` row whose `auth_user_id` matches
 * the session. Those rows are created by hand — signing in only links to one. So an
 * Entra account nobody added to the app authenticates fine and reads nothing, and the
 * gate below is the polite version of that, not the mechanism.
 */

export type AuthStatus =
  /** Still asking Supabase whether a session is in local storage. */
  | "loading"
  /** No session. RequireAuth sends every route to /signin. */
  | "signed-out"
  /** Session established. `profile` follows a moment later. */
  | "signed-in"
  /** No Supabase client at all — the VITE_ vars are missing from this build. */
  | "unavailable";

interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  /** The `profiles` row for the signed-in user, once `profileState` is "linked". */
  profile: Profile | null;
  /**
   * Whether this Microsoft account is on Lofty's staff list.
   *
   * "unlinked" is the load-bearing one: a valid Entra session with no `profiles` row.
   * Anyone in the directory can authenticate, but only a person somebody created in the
   * app has a row, and without one every RLS policy denies. Distinguished from "loading"
   * so the gate can say "not set up" without flashing it at everyone mid-load.
   */
  profileState: "loading" | "linked" | "unlinked";
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Last sign-in failure, for display. Cleared on the next attempt. */
  error: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const repo = useRepository();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileState, setProfileState] = useState<"loading" | "linked" | "unlinked">("loading");
  const [status, setStatus] = useState<AuthStatus>(supabase ? "loading" : "unavailable");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let cancelled = false;

    // getSession() reads what is already in local storage; onAuthStateChange covers the
    // redirect back from Entra, a sign-out in another tab, and the periodic token
    // refresh. Both are needed — the first alone misses the redirect that just happened,
    // the second alone misses the session that was already there on a cold load.
    void client.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setStatus(data.session ? "signed-in" : "signed-out");
    });

    const { data: sub } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setStatus(next ? "signed-in" : "signed-out");
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // The profile comes through the repository rather than off the client here, so this
  // provider obeys the same seam as every screen: it asks for `currentProfile()` and
  // does not know or care that the answer is a Postgres row.
  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setProfileState("loading");
      return;
    }
    let cancelled = false;
    setProfileState("loading");
    repo
      .currentProfile()
      .then(p => {
        if (cancelled) return;
        setProfile(p);
        setProfileState(p ? "linked" : "unlinked");
      })
      // A failed lookup is treated as unlinked, not as linked-with-no-data. Failing
      // closed is the only safe direction for the value the gate reads.
      .catch(() => {
        if (cancelled) return;
        setProfile(null);
        setProfileState("unlinked");
      });
    return () => { cancelled = true; };
  }, [repo, userId]);

  const signIn = useCallback(async () => {
    const client = supabase;
    if (!client) return;
    setError(null);
    const { error: err } = await client.auth.signInWithOAuth({
      provider: "azure",
      options: {
        // `email` is required — Supabase Auth rejects a sign-in with no email address,
        // and `profiles.email` is not null. `openid profile` come with it so the token
        // carries `given_name` and `family_name`: without them the 0014 trigger has only
        // a display name to split, and splitting is a guess.
        scopes: "openid profile email",
        // BASE_URL rather than a literal path, so `base` in vite.config.ts stays the
        // single place the app's location is decided. Landing on a path the app does
        // not serve is a 404 with a valid session behind it, which reads like auth
        // failing when it did not.
        redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`
      }
    });
    if (err) setError(err.message);
  }, []);

  const signOut = useCallback(async () => {
    setError(null);
    await supabase?.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, session, profile, profileState, signIn, signOut, error }),
    [status, session, profile, profileState, signIn, signOut, error]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside an <AuthProvider>");
  return ctx;
}

/** Initials for the header avatar. Two letters, or one when there is no surname. */
export function initialsOf(profile: Profile): string {
  const first = profile.preferredName?.trim() || profile.firstName;
  return ((first[0] ?? "") + (profile.lastName[0] ?? "")).toUpperCase();
}
