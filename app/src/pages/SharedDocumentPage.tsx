/**
 * What a client sees when they open a share link.
 *
 * OUTSIDE THE AUTH GATE, deliberately and narrowly. This is the only route in the app
 * that renders anything to somebody with no Lofty account, and the only thing it can
 * render is one document that somebody inside Lofty chose to send.
 *
 * IT DOES NOT TOUCH THE REPOSITORY. There is no `useRepository()` here and there must
 * never be one: the repository talks to Supabase as the signed-in person, and there is no
 * signed-in person on this page. Everything comes from the `report-share` endpoint, which
 * returns a stored snapshot and nothing else — no jobs, no properties, no people.
 *
 * SO THE PAGE CANNOT LEAK WHAT IT CANNOT FETCH. The snapshot was compiled in the author's
 * browser under the author's RLS (0095). By the time it reaches here it is already only
 * what they could see and chose to send, and this file has no way to ask for more.
 */

import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button, Heading, Loader, Text, TextField } from "@vibe/core";
import { ReportDocument } from "../features/reports/index.js";
import type { CompiledReport } from "../features/reports/index.js";
import { supabaseKey, supabaseUrl } from "../data/supabaseEnv";
import "../features/reports/reports.css";

type Snapshot = { report: CompiledReport; theme?: unknown };

type State =
  | { kind: "loading" }
  | { kind: "password"; message: string | null }
  | { kind: "ready"; title: string; snapshot: Snapshot }
  | { kind: "gone"; message: string };

/**
 * One sentence for every way a link can fail to open, except the two worth telling apart:
 * "this needs a password" and "this one expired". Distinguishing "no such token" from
 * "revoked" would tell somebody guessing tokens which half they got right.
 */
const NOT_VALID = "This link is not valid. Ask whoever sent it for a new one.";

export function SharedDocumentPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(false);

  const open = useCallback(
    async (withPassword?: string) => {
      if (!token) return setState({ kind: "gone", message: NOT_VALID });
      if (!supabaseUrl) {
        // The honest failure. Not "this link is not valid" — the link may be perfectly
        // good and this build simply has no backend configured.
        return setState({ kind: "gone", message: "This site is not configured to open shared documents." });
      }
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/report-share`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            // The publishable key, which is public by design. It identifies the project,
            // not a person: there is no session here and the endpoint expects none.
            ...(supabaseKey ? { apikey: supabaseKey } : {})
          },
          body: JSON.stringify({ token, password: withPassword })
        });
        const body = await res.json().catch(() => ({}));

        if (res.status === 401 || body?.needsPassword) {
          return setState({ kind: "password", message: body?.error ?? null });
        }
        if (res.status === 410) {
          return setState({ kind: "gone", message: "This link has expired. Ask whoever sent it for a new one." });
        }
        if (!res.ok || !body?.snapshot?.report) return setState({ kind: "gone", message: NOT_VALID });

        setState({ kind: "ready", title: body.title ?? "", snapshot: body.snapshot });
      } catch {
        // A network failure is not a dead link, and saying so would send somebody back to
        // ask for a replacement that works exactly as badly.
        setState({ kind: "gone", message: "This document could not be loaded. Check your connection and try again." });
      }
    },
    [token]
  );

  useEffect(() => { void open(); }, [open]);

  // Nothing here should ever be indexed, and a share link in a forwarded email thread is
  // exactly how a crawler would find one. The endpoint sends the header too; this covers
  // the page itself.
  useEffect(() => {
    const tag = document.createElement("meta");
    tag.name = "robots";
    tag.content = "noindex, nofollow";
    document.head.appendChild(tag);
    return () => { tag.remove(); };
  }, []);

  useEffect(() => {
    if (state.kind === "ready" && state.title) document.title = `${state.title} — Lofty`;
  }, [state]);

  if (state.kind === "loading") {
    return (
      <main className="shared-doc shared-doc-centred">
        <Loader size="medium" />
        <Text type="text2" color="secondary">Opening this document…</Text>
      </main>
    );
  }

  if (state.kind === "gone") {
    return (
      <main className="shared-doc shared-doc-centred">
        <Heading type="h2">This document is not available</Heading>
        <Text type="text1" color="secondary">{state.message}</Text>
      </main>
    );
  }

  if (state.kind === "password") {
    return (
      <main className="shared-doc shared-doc-centred">
        <Heading type="h2">This document is password protected</Heading>
        <Text type="text2" color="secondary">
          Whoever sent you the link will have the password.
        </Text>
        <form
          className="shared-doc-form"
          onSubmit={async e => {
            e.preventDefault();
            if (!password || checking) return;
            setChecking(true);
            await open(password);
            setChecking(false);
          }}
        >
          <TextField
            type="password"
            title="Password"
            placeholder="Password"
            value={password}
            onChange={setPassword}
            validation={state.message ? { status: "error", text: state.message } : undefined}
          />
          <Button type="submit" disabled={!password || checking} loading={checking}>Open</Button>
        </form>
      </main>
    );
  }

  return (
    <main className="shared-doc">
      <div className="shared-doc-sheet">
        <ReportDocument report={state.snapshot.report} theme={state.snapshot.theme ?? null} />
      </div>
      {/* Said once, at the bottom, because a client reading a September progress report in
          December should know which it is. The snapshot cannot answer "is this current"
          for itself — that is the trade the design makes. */}
      <p className="shared-doc-foot">
        This document was prepared and sent by Lofty. It shows the information as at the
        time it was shared.
      </p>
    </main>
  );
}
