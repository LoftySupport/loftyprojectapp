// maintenance-accept — the contractor's accept link (0084).
//
// A contractor gets an offer email with one link: this function, `?t=<token>`. No login
// (Amber, 2 Sep: "yes but needs to be logged"). GET shows the item and two choices; POST
// records the answer through `answer_maintenance_offer()`, which verifies the token's hash,
// refuses expired or spent links, spends the token, writes the answer into the request's
// thread, and stamps the audit row with origin `accept_link`. The token never lands in a
// log line here: it stays in the query string and the form body only.
//
// Service role, because the RPC is granted to nobody else; nothing in this function reads
// or writes anything but that one call. Deploy with `--no-verify-jwt` — the link is public.

import { createClient } from "npm:@supabase/supabase-js@2";

const env = (k: string) => Deno.env.get(k) ?? "";
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Lofty maintenance</title>
<style>
  body{font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#f6f5f2;color:#1f2328}
  main{max-width:520px;margin:6vh auto;background:#fff;border-radius:12px;padding:28px 24px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
  h1{font-size:20px;margin:0 0 4px}.sub{color:#5b6068;margin:0 0 20px}
  label{display:block;font-weight:600;margin:14px 0 4px}input,textarea{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #c9ccd1;border-radius:8px;font:inherit}
  .row{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}button{font:inherit;font-weight:600;padding:10px 16px;border-radius:8px;border:1px solid transparent;cursor:pointer}
  .accept{background:#0f7b4f;color:#fff}.decline{background:#fff;border-color:#c9ccd1;color:#1f2328}
  .ok{color:#0f7b4f}.no{color:#b3261e}
</style></head><body><main>${body}</main></body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}

Deno.serve(async req => {
  const url = new URL(req.url);
  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

  if (req.method === "GET") {
    const t = url.searchParams.get("t") ?? "";
    if (!/^[0-9a-f]{48}$/.test(t)) return page("Not a link we sent", `<h1>This is not a link we sent</h1><p class="sub">Check the email from Lofty and open the link from there.</p>`, 404);
    // The form carries the token; nothing is looked up until the answer is posted, so a
    // crawler fetching the page does not spend anybody's link.
    return page("Maintenance offer", `
<h1>A maintenance item from Lofty</h1>
<p class="sub">The details are in the email this link came from. Tell us whether you can take it.</p>
<form method="post">
  <input type="hidden" name="t" value="${esc(t)}">
  <label for="when">When could you attend? <span style="font-weight:400;color:#5b6068">(leave blank if you are not sure yet)</span></label>
  <input id="when" name="when" type="datetime-local">
  <label for="note">Anything we should know</label>
  <textarea id="note" name="note" rows="3" placeholder="Access, parts, a better day…"></textarea>
  <div class="row">
    <button class="accept" name="answer" value="accept">Accept</button>
    <button class="decline" name="answer" value="decline">Decline</button>
  </div>
</form>`);
  }

  if (req.method === "POST") {
    const form = await req.formData();
    const t = String(form.get("t") ?? "");
    const accept = String(form.get("answer") ?? "") === "accept";
    const when = String(form.get("when") ?? "").trim();
    const note = String(form.get("note") ?? "").trim() || null;
    if (!/^[0-9a-f]{48}$/.test(t)) return page("Not a link we sent", `<h1>This is not a link we sent</h1>`, 404);
    // datetime-local has no zone; the contractor is in Adelaide, and so is the office.
    const scheduled = accept && when ? new Date(when + (when.length === 16 ? ":00" : "")).toISOString() : null;
    const { data, error } = await db.rpc("answer_maintenance_offer", { p_token: t, p_accept: accept, p_scheduled_for: scheduled, p_note: note });
    if (error) {
      const m = error.message ?? "";
      const friendly = m.includes("not one we sent") ? "This is not a link we sent."
        : m.includes("expired") ? "This link has expired. Ask Lofty to send a new one."
        : m.includes("already been answered") ? "This offer has already been answered."
        : "Something went wrong recording your answer. Ring Lofty and we will note it by hand.";
      return page("Could not record that", `<h1 class="no">Could not record that</h1><p class="sub">${esc(friendly)}</p>`, 400);
    }
    const r = ((data ?? []) as { maintenance_request_number: string; item_description: string; job_address: string | null; outcome: string }[])[0];
    const outcome = r?.outcome ?? (accept ? "accepted" : "declined");
    return page("Thank you", `
<h1 class="${accept ? "ok" : ""}">${accept ? "Thanks — that is booked in" : "Thanks for letting us know"}</h1>
<p class="sub">${esc(r?.maintenance_request_number ?? "")}${r?.job_address ? ` · ${esc(r.job_address)}` : ""}</p>
<p><strong>${esc(r?.item_description ?? "The item")}</strong> — ${esc(outcome)}${scheduled ? ` for ${esc(new Date(scheduled).toLocaleString("en-AU", { timeZone: "Australia/Adelaide", dateStyle: "full", timeStyle: "short" }))}` : ""}.</p>
<p class="sub">Lofty has been told. This link has now been used and will not work again.</p>`);
  }

  return new Response("method not allowed", { status: 405 });
});
