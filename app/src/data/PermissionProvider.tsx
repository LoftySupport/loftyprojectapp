import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { PERMISSION_LEVELS, atLeast, type PermissionLevel } from "./types";

/**
 * Who you are signed in as, until Supabase Auth is wired.
 *
 * With no auth there is no honest way to know a permission level, and defaulting to
 * "superadmin" would quietly hide every gate in the app — which is exactly the thing
 * that needs reviewing. So it is switchable, and the switch is visible in the header.
 *
 * When auth lands this provider reads `profiles.permission` for the signed-in user and
 * the switcher disappears. Everything that consumes `useCan()` stays as it is.
 */

interface PermissionContextValue {
  permission: PermissionLevel;
  setPermission: (p: PermissionLevel) => void;
  /** `can("manager")` — true at that rung or above. */
  can: (need: PermissionLevel) => boolean;
}

const PermissionContext = createContext<PermissionContextValue | null>(null);
const KEY = "lofty-permission";

export function PermissionProvider({ children }: { children: React.ReactNode }) {
  const [permission, setPermission] = useState<PermissionLevel>(() => {
    const saved = localStorage.getItem(KEY) as PermissionLevel | null;
    return saved && PERMISSION_LEVELS.includes(saved) ? saved : "manager";
  });

  useEffect(() => { localStorage.setItem(KEY, permission); }, [permission]);

  const value = useMemo(
    () => ({ permission, setPermission, can: (need: PermissionLevel) => atLeast(permission, need) }),
    [permission]
  );

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

export function usePermission(): PermissionContextValue {
  const ctx = useContext(PermissionContext);
  if (!ctx) throw new Error("usePermission must be used inside a PermissionProvider");
  return ctx;
}
