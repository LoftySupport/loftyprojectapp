import { Heading, Text } from "@vibe/core";
import {
  PARKED, PERMISSIONS_READ_AT, PERMISSION_LADDER, PERMISSION_RULES, clears
} from "../data/permissions";
import { usePermission } from "../data/PermissionProvider";
import "../components/ui.css";

/**
 * Who may do what — read out of the policies rather than asserted.
 *
 * This was a tab on Admin showing a grid of {{permission_grants.action}} over five
 * invented objects. Lofty asked for it in Setup with the permissions that were actually
 * agreed, and both halves of that are corrections: Admin is about *people*, Setup is
 * about how the app is configured, and a permission model is configuration.
 *
 * The ladder is read left to right and each rung has everything to its left, which is
 * not decoration — `permission_level` is an ordered enum and every policy compares with
 * `>=`, so the ordering is the mechanism.
 */
export function PermissionsPage() {
  const { permission } = usePermission();

  return (
    <>
      <div className="page-head">
        <Heading type="h2" weight="bold">Permissions</Heading>
        <Text type="text2" color="secondary" ellipsis={false}>
          What each level may do. A ladder, not a set — every rung has everything to its
          left, because <code>permission_level</code> is an ordered enum and the policies
          compare against it with <code>&gt;=</code>.
        </Text>
      </div>

      <section className="panel">
        <div className="panel-head">
          <Text type="text2" weight="bold">You are signed in as {permission}</Text>
          <Text type="text3" color="secondary">
            Transcribed from the policies at migration {PERMISSIONS_READ_AT}
          </Text>
        </div>
        <Text type="text3" color="secondary" ellipsis={false}>
          Each row names the rule Postgres evaluates, so it can be checked rather than
          believed — <code>app/supabase/verify/rls.sql</code> is what proves them. The
          app's own checks only hide controls; the policy is the boundary.
          {PARKED.length > 0 && (
            <> <strong>{PARKED.join(", ")}</strong> is on the ladder but not in use yet.</>
          )}
        </Text>

        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Object</th>
                <th scope="col">Action</th>
                {PERMISSION_LADDER.map(l => (
                  <th key={l} scope="col" className={PARKED.includes(l) ? "muted" : undefined}>{l}</th>
                ))}
                <th scope="col">Enforced by</th>
              </tr>
            </thead>
            <tbody>
              {PERMISSION_RULES.map(r => (
                <tr key={r.object + r.action}>
                  <td><strong>{r.object}</strong></td>
                  <td>
                    {r.action}
                    {r.note && <div className="field-hint">{r.note}</div>}
                  </td>
                  {PERMISSION_LADDER.map(l => (
                    <td key={l} className="perm-cell">
                      {clears(l, r)
                        ? <span className="perm-yes" title={`${l} may ${r.action.toLowerCase()}`}>●</span>
                        : <span className="perm-no" aria-hidden="true">·</span>}
                      <span className="sr-only">
                        {clears(l, r) ? `${l} may` : `${l} may not`}
                      </span>
                    </td>
                  ))}
                  <td className="muted"><code>{r.enforcedBy}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
