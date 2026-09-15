/**
 * `FileDrop` mounted on its own, for `npm run check:file-drop`.
 *
 * Not the app: no router, no Supabase, no sign-in. The control is prop-driven and the
 * thing under test is what a DROP hands the caller, which is a question about the control.
 *
 * What it was given is echoed to `window.taken` rather than read off the screen. The two
 * are not the same: a drop zone that lists a filename it never passed on would look right
 * in a screenshot and be useless, and the failure this guards against — a file that
 * reaches nobody — is invisible from the outside.
 */
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { FileDrop } from "../src/components/FileDrop.tsx";
import "../src/components/ui.css";

function Harness() {
  const [taken, setTaken] = useState([]);
  window.taken = taken.map(f => ({ name: f.name, type: f.type }));
  return (
    <div style={{ padding: 24, maxWidth: 420 }}>
      <FileDrop ariaLabel="Attach files" onFiles={files => setTaken(t => [...t, ...files])} />
      <ul id="taken">
        {taken.map((f, i) => <li key={`${f.name}-${i}`}>{f.name}</li>)}
      </ul>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<Harness />);
