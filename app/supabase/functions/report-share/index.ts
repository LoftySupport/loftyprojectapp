// report-share — hand one shared document to somebody with no Lofty login.
//
// WHAT THIS DOES NOT DO, AND WHY THAT IS THE DESIGN
//
//   It does not read jobs. It does not read properties, people, teams or processes. It
//   holds the service role, so every one of those reads would run with RLS switched off,
//   and one forgotten filter would hand somebody the whole book of work. The first draft
//   of this file had a `loadViewerContext()` for exactly that, and its own comment called
//   it "the single most likely serious bug in an endpoint of this kind".
//
//   So the document is compiled BEFORE it gets here — in the author's browser, under the
//   author's session and therefore the author's RLS — and stored as a snapshot (0095).
//   This function looks up one row by token, checks the expiry and the password, and
//   returns the snapshot verbatim. There is no query here that could be scoped wrongly,
//   because there is no query here that reads anything but the one row asked for.
//
// Written for Supabase Edge Functions (Deno).

import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/**
 * Which origins may call this, as a comma-separated secret rather than a constant.
 *
 * Configuration and not code, because the answer differs per deployment — the production
 * domain `hub.lofty.au`, the `loftyprojectapp.vercel.app` name it also answers on, and a
 * per-PR preview URL somebody is testing on — and none of those should need a commit and
 * a redeploy.
 *
 * EMPTY IS STILL THE SAFE DEFAULT. With the secret unset the function refuses every
 * browser, so deploying it before deciding gets an endpoint that answers nothing. A
 * wildcard would be the wrong default for a URL whose entire job is to leave Lofty.
 */
const ALLOWED_ORIGINS = (Deno.env.get("SHARE_ALLOWED_ORIGINS") ?? "")
  .split(",").map((o) => o.trim()).filter(Boolean);

const cors = (origin: string | null): Record<string, string> => ({
  "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.includes(origin) ? origin : "null",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});

const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      "content-type": "application/json",
      // A shared document is somebody's client correspondence. It must not sit in a
      // shared cache, and it must not be indexed if a link ever reaches a crawler.
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });

import { verifyPassword } from "./verify.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = cors(origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405, headers);

  // The refusal that makes a deploy-before-deciding inert.
  if (!ALLOWED_ORIGINS.length) {
    return json({ error: "Sharing is not switched on." }, 503, headers);
  }
  // CORS headers tell a BROWSER not to read the response; they do not stop the request
  // being made or answered. So the origin is checked here too, where it actually refuses.
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return json({ error: "This link cannot be opened from here." }, 403, headers);
  }

  let token: unknown;
  let password: unknown;
  try {
    ({ token, password } = await req.json());
  } catch {
    return json({ error: "That request could not be read." }, 400, headers);
  }
  if (typeof token !== "string" || !token) {
    return json({ error: "This link is not valid." }, 400, headers);
  }

  const { data, error } = await supabase
    .from("report_documents")
    .select(
      "report_document_title, report_document_share_snapshot, report_document_share_expires_at, report_document_share_password_hash",
    )
    .eq("report_document_share_token", token)
    .maybeSingle();

  // One sentence for "no such link" and "revoked". Telling them apart would tell somebody
  // probing tokens which of the two they hit, which is the half of the answer they want.
  if (error || !data || !data.report_document_share_snapshot) {
    return json({ error: "This link is not valid." }, 404, headers);
  }

  if (new Date(data.report_document_share_expires_at) < new Date()) {
    return json({ error: "This link has expired." }, 410, headers);
  }

  if (data.report_document_share_password_hash) {
    if (typeof password !== "string" || !password) {
      return json({ needsPassword: true }, 401, headers);
    }
    const ok = await verifyPassword(data.report_document_share_password_hash, password);
    if (!ok) return json({ needsPassword: true, error: "That password is not right." }, 401, headers);
  }

  // The snapshot, and the title, and nothing else. Not the job id, not the project id,
  // not who wrote it, not when it was last edited — none of which the page renders and
  // all of which say something about Lofty to somebody outside it.
  return json({
    title: data.report_document_title,
    snapshot: data.report_document_share_snapshot,
  }, 200, headers);
});
