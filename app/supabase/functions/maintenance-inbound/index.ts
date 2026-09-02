// maintenance-inbound — mail to the maintenance mailbox becomes a request or a reply (0084).
//
// Amber: intake by "manual email or phone call and forms. Think of every option". This is
// the email door. Something that watches the intake mailbox — a Graph change subscription
// on the mailbox, or a Power Automate flow on "when a new email arrives" — POSTs each
// message here as JSON; this function hands it to `receive_maintenance_email()`, which:
//
//   - matches it to a request by the request number in the subject (1042-01-M3), else
//   - to the sender's open request when the address is a known contact's, else
//   - opens a NEW request on the sender's job, when the sender is a purchaser on record;
//   - reopens a closed request when a reply lands on it;
//   - is idempotent on the Graph message id, so a redelivered webhook is one row.
//
// When none of those hold, the database refuses with "log it by hand" and this function
// answers 422 — the caller should leave the mail in the mailbox for a person. Nothing is
// guessed onto a job.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (platform), INBOUND_SECRET — the caller
// sends it as `x-inbound-secret`. Graph subscription validation (a `validationToken` query)
// is echoed back as text, which is what Graph requires to create the subscription; the
// notification itself carries only ids, so a Graph-driven caller must fetch the message
// and POST the shape below (a flow does this in one step).
//
// Deploy: `supabase functions deploy maintenance-inbound --no-verify-jwt`.

import { createClient } from "npm:@supabase/supabase-js@2";

type Inbound = {
  /** Graph's message id — the idempotency key. Required. */
  externalId: string;
  from: string;
  subject?: string | null;
  /** Plain text preferred; HTML is stripped naively. */
  body?: string | null;
  receivedAt?: string | null;
};

const env = (k: string) => Deno.env.get(k) ?? "";
const json = (status: number, payload: unknown) => new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
const stripHtml = (s: string) => s.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();

Deno.serve(async req => {
  const url = new URL(req.url);
  const validation = url.searchParams.get("validationToken");
  if (validation) return new Response(validation, { status: 200, headers: { "content-type": "text/plain" } });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (env("INBOUND_SECRET") && req.headers.get("x-inbound-secret") !== env("INBOUND_SECRET")) return json(403, { error: "forbidden" });

  let m: Inbound;
  try { m = (await req.json()) as Inbound; }
  catch { return json(400, { error: "body must be JSON: { externalId, from, subject, body, receivedAt }" }); }
  if (!m?.externalId || !m?.from) return json(400, { error: "externalId and from are required" });

  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
  const { data, error } = await db.rpc("receive_maintenance_email", {
    p_external_id: m.externalId,
    p_from_address: m.from.trim(),
    p_subject: (m.subject ?? "").trim(),
    p_body: stripHtml(m.body ?? ""),
    p_received_at: m.receivedAt ?? new Date().toISOString()
  });
  if (error) {
    if ((error.message ?? "").includes("log it by hand")) return json(422, { outcome: "unmatched", reason: error.message });
    return json(500, { error: error.message });
  }
  const r = ((data ?? []) as { maintenance_request_id: string; maintenance_request_number: string; matched_by: string }[])[0];
  return json(200, { outcome: r?.matched_by ?? "received", request: r?.maintenance_request_number ?? null, requestId: r?.maintenance_request_id ?? null });
});
