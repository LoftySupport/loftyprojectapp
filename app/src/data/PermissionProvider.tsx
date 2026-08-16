import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthProvider";
import { PERMISSION_LEVELS, atLeast, type PermissionLevel } from "./types";

/**
 * What the signed-in person is allowed to do.
 *
 * Signed in, the level is `profiles.permission` — read from the row through the
 * repository, never from the JWT. `user_metadata` on a Supabase token is editable by the
 * user it describes, so an authorization check against it can be edited by the person it
 * is meant to restrict.
 *
 * Signed out, there is no honest level to report, so the demo switcher stays: defaulting
 * to `superadmin` would quietly hide every gate in the app, which is exactly the thing
 * that needs reviewing, and defaulting to `viewer` would hide most of the app from
 * anyone looking at a deploy preview. It is visible in the header and labelled as demo,
 * and it disappears the moment a real session exists.
 *
 * Everything consuming `can()` is unchanged either way — that is the point of it being
 * one value behind one hook.
 */

interface PermissionContextValue {
  permission: PermissionLevel;
  setPermission: (p: PermissionLevel) => void;
  /** `can("manager")` — true at that rung or above. */
  can: (need: PermissionLevel) => boolean;
  /**
   * True when the level is the header switcher rather than a real profile. Drives
   * whether the switcher renders at all; nothing about authorization reads it.
   */
  isDemo: boolean;
}

const PermissionContext = createContext<PermissionContextValue | null>(null);
const KEY = "lofty-permission";

export function PermissionProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const [demoPermission, setDemoPermission] = useState<PermissionLevel>(() => {
    const saved = localStorage.getItem(KEY) as PermissionLevel | null;
    return saved && PERMISSION_LEVELS.includes(saved) ? saved : "manager";
  });

  useEffect(() => { localStorage.setItem(KEY, demoPermission); }, [demoPermission]);

  const value = useMemo(() => {
    // A session without a profile row falls back to the switcher rather than to a
    // guessed level: the 0003 trigger not having fired is a fault to see, not one to
    // paper over with an invented `viewer`.
    const isDemo = profile === null;
    const permission = profile?.permission ?? demoPermission;
    return {
      permission,
      setPermission: setDemoPermission,
      can: (need: PermissionLevel) => atLeast(permission, need),
      isDemo
    };
  }, [profile, demoPermission]);

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

export function usePermission(): PermissionContextValue {
  const ctx = useContext(PermissionContext);
  if (!ctx) throw new Error("usePermission must be used inside a PermissionProvider");
  return ctx;
}
