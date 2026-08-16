import { createContext, useContext, useMemo } from "react";
import { useAuth } from "./AuthProvider";
import { atLeast, type PermissionLevel } from "./types";

/**
 * What the signed-in person is allowed to do.
 *
 * `profiles.permission`, read from the row through the repository — never from the JWT.
 * `user_metadata` on a Supabase token is editable by the user it describes, so an
 * authorization check against it can be edited by the person it is meant to restrict.
 *
 * The demo switcher that used to live here is gone. It existed because there was no auth
 * and therefore no honest way to know a level; there is now. Its last hiding place was
 * "signed in but no profile row", and the gate closes that too — without a profile
 * nobody reaches the app at all, so there is no longer a state this could be asked
 * about where the answer is unknown.
 *
 * `viewer` when there is no profile: least privilege, and unreachable inside the app
 * anyway. It is here so the value is defined on `/signin`, not as a fallback anything
 * should rely on.
 */

interface PermissionContextValue {
  permission: PermissionLevel;
  /** `can("manager")` — true at that rung or above. */
  can: (need: PermissionLevel) => boolean;
}

const PermissionContext = createContext<PermissionContextValue | null>(null);

export function PermissionProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();

  const value = useMemo(() => {
    const permission = profile?.permission ?? "viewer";
    return { permission, can: (need: PermissionLevel) => atLeast(permission, need) };
  }, [profile]);

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

export function usePermission(): PermissionContextValue {
  const ctx = useContext(PermissionContext);
  if (!ctx) throw new Error("usePermission must be used inside a PermissionProvider");
  return ctx;
}
