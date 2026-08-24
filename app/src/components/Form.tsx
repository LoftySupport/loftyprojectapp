import type { ReactNode } from "react";
import { Text } from "@vibe/core";
import "./ui.css";

/**
 * The three pieces every form in this app is built from.
 *
 * They existed twice, in `CreateDialogs` and in `UserDialogs`, and the two copies had
 * drifted into different markup: the create forms rendered `.field-row / .field-label /
 * .field-control`, which `ui.css` styles, and the user forms rendered `.create-field /
 * .create-label / .create-hint`, which it does not style at all. That is the whole
 * explanation for why "Edit Amber Beaumont" looked broken — every label sat hard against
 * the control above it, because no rule was ever written for those class names.
 *
 * A second copy of a component is not the bug; a second copy that no stylesheet agrees
 * with is. So there is one now, and both files import it.
 */

export function Field({
  label,
  hint,
  required,
  children
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="field-row">
      <div className="field-label">
        {/* `ellipsis={false}`: Vibe's Text clamps to one line, and a label like
            "Microsoft sign-in address" wraps rather than being cut in a 460px panel. */}
        <Text type="text2" ellipsis={false}>
          {label}
          {required && <span className="field-required" aria-hidden="true"> *</span>}
        </Text>
        {hint && <div className="field-hint">{hint}</div>}
      </div>
      <div className="field-control">{children}</div>
    </div>
  );
}

/**
 * The error is shown verbatim rather than replaced with "Something went wrong".
 * Postgres messages here are the ones worth reading — a permission denied from RLS, a
 * check constraint naming itself — and hiding them would mean the person cannot tell a
 * missing field from a missing permission.
 */
export function Problem({ children }: { children: ReactNode }) {
  return (
    <div className="create-problem" role="alert">
      <Text type="text2" element="span" ellipsis={false}>{children}</Text>
    </div>
  );
}

export function Result({ children }: { children: ReactNode }) {
  return (
    <div className="create-result" role="status">
      <Text type="text1" ellipsis={false}>{children}</Text>
    </div>
  );
}
