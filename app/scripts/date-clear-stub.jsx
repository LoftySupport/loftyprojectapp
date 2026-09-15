/**
 * The two date controls, mounted on their own, for `npm run check:date-clear`.
 *
 * Not the app: no router, no Supabase, no sign-in. Both controls are prop-driven, and
 * the thing under test is whether an emptied field REACHES the caller — which is a
 * question about the control, not about the database behind it.
 *
 * State is held here and echoed to `window.saved`, so the check can assert on what the
 * caller was told rather than on what the input happens to be showing. The two are not
 * the same thing: the bug being guarded against is a control that empties on screen and
 * tells nobody, and an assertion that only reads `input.value` would have passed on it.
 */
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { DateField } from "../src/components/DateField.tsx";
import { PropertyField } from "../src/components/PropertyField.tsx";
import "../src/components/ui.css";

/** Every rung true — the check is about the control, not about who may. */
const ACCESS = { canRead: true, canCreate: true, canUpdate: true, canDelete: true };

const DEF = {
  key: "job.handover_date",
  label: "Handover date",
  format: "date",
  scope: "job",
  isActive: true
};

function Demo() {
  const [completion, setCompletion] = useState("2027-03-04");
  const [prop, setProp] = useState({ date: "2027-03-04" });

  // What each control last told its caller. `undefined` means "has not called back yet",
  // which is distinct from `null` meaning "told us it was cleared".
  const report = (which, v) => {
    window.saved = { ...(window.saved ?? {}), [which]: v };
  };

  return (
    <main style={{ padding: 24, display: "grid", gap: 24, maxWidth: 420 }}>
      <label>
        Completion date
        <DateField
          ariaLabel="Completion date"
          value={completion}
          onChange={v => { report("completion", v); setCompletion(v); }}
        />
      </label>

      <div>
        Handover date
        <PropertyField
          def={DEF}
          value={prop}
          access={ACCESS}
          onSave={async v => { report("property", v); setProp(v); }}
        />
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<Demo />);
