// report-share — a shared document, for somebody with no Lofty login.
//
// ⚠️  NOT DEPLOYED, AND NOT CALLED. See README.md beside this file. Two things are
//     deliberately left empty so that deploying it by accident achieves nothing:
//     ALLOWED_ORIGINS (so every browser is refused) and loadViewerContext() (so no job
//     data is returned). Both are decisions for Lofty rather than defaults to guess.
//
// WHY THIS EXISTS AT ALL
//
//   A share link is opened by somebody with no session, so it cannot go through RLS.
//   Serving it from the browser would mean granting `anon` a SELECT policy on
//   report_documents, which exposes every other document in that table to anybody
//   holding any link. This runs with the service role instead, checks the token, and
//   returns one row and only the viewer-safe parts of it.
//
// Written for Supabase Edge Functions (Deno).

import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/**
 * Which origins may call this.
 *
 * EMPTY ON PURPOSE. With nothing here every browser request is refused, so deploying
 * this function without making a decision gets you an endpoint that answers nothing.
 * A wildcard would be the wrong default for a URL whose whole job is to leave Lofty.
 */
const ALLOWED_ORIGINS: string[] = [];

const cors = (origin: string | null): Record<string, string> => ({
  "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.includes(origin) ? origin : "null",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});

const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "content-type": "application/json" },
  });

/**
 * The data a shared document's live blocks resolve against.
 *
 * NOT IMPLEMENTED, and this is the security-critical part. Two rules, both load-bearing:
 *
 * 1. SCOPE EVERY QUERY to the one record the document is about. A query that forgets its
 *    filter returns Lofty's whole book of work to anybody holding one link. This is the
 *    single most likely serious bug in an endpoint of this kind.
 *
 * 2. STRIP WHAT A CLIENT MAY NOT SEE. `property_values` includes restricted properties,
 *    margins among them; `profiles` includes people's email addresses. RLS is what
 *    normally removes those, and RLS is exactly what is not running here.
 *
 * Returning an empty context is the honest placeholder: the document's prose and its
 * typed tables render, and every live block says it has nothing to show — which is
 * visibly incomplete rather than quietly wrong.
 */
async function loadViewerContext(_doc: { job_id: string | null; project_id: number | null }) {
  return {
    projects: [], jobs: [], teams: [], stageNames: [], people: [], processes: [],
    propertyDefs: [], propertyValues: [], propertyOptions: [],
    sections: [], subject: null,
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = cors(origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405, headers);

  // The refusal that makes an accidental deploy inert.
  if (!ALLOWED_ORIGINS.length) {
    return json({ error: "Sharing is not switched on." }, 503, headers);
  }

  let token: string | undefined;
  let password: string | undefined;
  try {
    ({ token, password } = await req.json());
  } catch {
    return json({ error: "That request could not be read." }, 400, headers);
  }
  if (!token) return json({ error: "This link is not valid." }, 400, headers);

  const { data, error } = await supabase
    .from("report_documents")
    .select(
      "report_document_id, report_document_title, report_document_layout, job_id, project_id, report_document_share_expires_at, report_document_share_password_hash",
    )
    .eq("report_document_share_token", token)
    .maybeSingle();

  // One sentence for "no such link", "expired" and "wrong password" would be friendlier
  // and would also tell somebody probing tokens which of the three they hit. It does not.
  if (error || !data) return json({ error: "This link is not valid." }, 404, headers);

  if (new Date(data.report_document_share_expires_at) < new Date()) {
    return json({ error: "This link has expired." }, 410, headers);
  }

  if (data.report_document_share_password_hash) {
    if (!password) return json({ needsPassword: true }, 401, headers);
    // REPLACE-ME when this is turned on: a real constant-time verify against whatever
    // hashed it. Refusing outright is the right placeholder — a comparison written in a
    // hurry here is the bug that makes the password decorative.
    return json({ error: "Password-protected links are not switched on." }, 503, headers);
  }

  return json({
    id: data.report_document_id,
    title: data.report_document_title,
    layout: data.report_document_layout,
    ctx: await loadViewerContext(data),
    // Never the hash, never the token, never the expiry — a viewer needs none of them.
    hasPassword: false,
  }, 200, headers);
});
