// deliver-notifications — the outbox worker (0083).
//
// Drains `notification_deliveries` for one channel at a time: claims due rows through
// `claim_notification_deliveries()` (FOR UPDATE SKIP LOCKED, so two invocations never send
// the same row), sends each, and reports back through `complete_notification_delivery()`,
// which re-queues a failure with backoff and gives up after five tries.
//
// Channels:
//   email  — Microsoft Graph, sent from a Lofty mailbox so replies land in Outlook.
//   teams  — Microsoft Graph, a chat message to the person (Teams later widens to channels).
//   sms    — no provider yet (Amber, 2 Sep: "to be setup later"). Rows stay queued; this
//            worker skips the channel and says so in its response.
//
// Digests: rows held for a person's digest time become due together; the worker groups
// what is due per person and channel into ONE message rather than twenty.
//
// Runs on a schedule (pg_cron → pg_net POST every minute, or the Supabase dashboard's
// function schedule) and on demand. It uses the service role, which is the only role
// granted the two RPCs — a browser session cannot drain the outbox.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   provided by the platform
//   MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET   an app registration with Mail.Send and
//                                                  Chat.ReadWrite.All application permissions
//   MS_SENDER_MAILBOX                           e.g. notifications@lofty.com.au
//   APP_BASE_URL                                e.g. https://app.lofty.com.au, for the links
//   DELIVER_SECRET                              a shared secret the scheduler sends as
//                                              `x-deliver-secret`, so nobody else can trigger sends
//
// Deploy: `supabase functions deploy deliver-notifications --no-verify-jwt`, then set the
// secrets, then schedule. Nothing here is live until those three steps are done, and the
// app says so in Setup → Notifications until the first delivery is marked sent.

import { createClient } from "npm:@supabase/supabase-js@2";

type Claimed = {
  notification_delivery_id: number;
  notification_id: number;
  notification_delivery_channel: "email" | "teams" | "sms";
  notification_delivery_address: string | null;
  notification_delivery_attempts: number;
  profile_id: string;
  profile_full_name: string;
  notification_type_id: string;
  notification_title: string;
  notification_body: string | null;
  notification_href: string | null;
  notification_created_at: string;
};

const env = (k: string) => Deno.env.get(k) ?? "";
const APP = env("APP_BASE_URL").replace(/\/$/, "");

async function graphToken(): Promise<string> {
  const res = await fetch(`https://login.microsoftonline.com/${env("MS_TENANT_ID")}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("MS_CLIENT_ID"),
      client_secret: env("MS_CLIENT_SECRET"),
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials"
    })
  });
  if (!res.ok) throw new Error(`Graph token: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

/** One person's due rows on one channel as a single message body. */
function compose(rows: Claimed[]): { subject: string; html: string; text: string } {
  const first = rows[0];
  const single = rows.length === 1;
  const subject = single ? first.notification_title : `${rows.length} things need you at Lofty`;
  const items = rows.map(r => {
    const link = r.notification_href ? `${APP}${r.notification_href}` : APP;
    return {
      html: `<li><a href="${escapeHtml(link)}"><strong>${escapeHtml(r.notification_title)}</strong></a>${r.notification_body ? `<br>${escapeHtml(r.notification_body)}` : ""}</li>`,
      text: `• ${r.notification_title}${r.notification_body ? `\n  ${r.notification_body}` : ""}\n  ${link}`
    };
  });
  const greeting = `Hi ${first.profile_full_name.split(" ")[0]},`;
  const html = `<p>${escapeHtml(greeting)}</p><ul>${items.map(i => i.html).join("")}</ul><p style="color:#666;font-size:12px">You are getting this because of your notification settings in the Lofty app. Change them at <a href="${escapeHtml(APP)}/settings">${escapeHtml(APP)}/settings</a>.</p>`;
  const text = `${greeting}\n\n${items.map(i => i.text).join("\n\n")}\n\nChange what you receive at ${APP}/settings`;
  return { subject, html, text };
}

async function sendEmail(token: string, to: string, rows: Claimed[]): Promise<string> {
  const { subject, html } = compose(rows);
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(env("MS_SENDER_MAILBOX"))}/sendMail`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: "HTML", content: html },
        toRecipients: [{ emailAddress: { address: to } }]
      },
      saveToSentItems: true
    })
  });
  if (!res.ok) throw new Error(`Graph sendMail: ${res.status} ${await res.text()}`);
  // sendMail returns 202 with no body; the request id is the closest thing to a receipt.
  return res.headers.get("request-id") ?? "accepted";
}

async function sendTeams(token: string, userPrincipalName: string, rows: Claimed[]): Promise<string> {
  // A one-to-one chat from the sending account to the person, created (or found) then posted to.
  const { text } = compose(rows);
  const me = env("MS_SENDER_MAILBOX");
  const chatRes = await fetch("https://graph.microsoft.com/v1.0/chats", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      chatType: "oneOnOne",
      members: [me, userPrincipalName].map(u => ({
        "@odata.type": "#microsoft.graph.aadUserConversationMember",
        roles: ["owner"],
        "user@odata.bind": `https://graph.microsoft.com/v1.0/users('${u}')`
      }))
    })
  });
  if (!chatRes.ok) throw new Error(`Graph chats: ${chatRes.status} ${await chatRes.text()}`);
  const chat = (await chatRes.json()) as { id: string };
  const msgRes = await fetch(`https://graph.microsoft.com/v1.0/chats/${chat.id}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ body: { contentType: "text", content: text } })
  });
  if (!msgRes.ok) throw new Error(`Graph chat message: ${msgRes.status} ${await msgRes.text()}`);
  return ((await msgRes.json()) as { id: string }).id;
}

Deno.serve(async req => {
  if (env("DELIVER_SECRET") && req.headers.get("x-deliver-secret") !== env("DELIVER_SECRET")) {
    return new Response("forbidden", { status: 403 });
  }
  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
  const summary: Record<string, { sent: number; failed: number; skipped?: string }> = {};

  for (const channel of ["email", "teams", "sms"] as const) {
    summary[channel] = { sent: 0, failed: 0 };
    if (channel === "sms") { summary.sms.skipped = "no provider configured (Amber, 2 Sep: later)"; continue; }
    if (!env("MS_TENANT_ID")) { summary[channel].skipped = "Microsoft Graph secrets not set"; continue; }

    const { data, error } = await db.rpc("claim_notification_deliveries", { p_channel: channel, p_limit: 100 });
    if (error) { summary[channel].skipped = `claim failed: ${error.message}`; continue; }
    const rows = (data ?? []) as Claimed[];
    if (!rows.length) continue;

    let token: string;
    try { token = await graphToken(); }
    catch (e) {
      for (const r of rows) await db.rpc("complete_notification_delivery", { p_id: r.notification_delivery_id, p_ok: false, p_error: String(e) });
      summary[channel].failed += rows.length;
      continue;
    }

    // Group by person: one email per person per run, however many rows became due.
    const byPerson = new Map<string, Claimed[]>();
    for (const r of rows) {
      const k = r.notification_delivery_address ?? r.profile_id;
      (byPerson.get(k) ?? byPerson.set(k, []).get(k)!).push(r);
    }
    for (const [address, group] of byPerson) {
      try {
        if (!group[0].notification_delivery_address) throw new Error("no address on file for this person");
        const id = channel === "email" ? await sendEmail(token, address, group) : await sendTeams(token, address, group);
        for (const r of group) await db.rpc("complete_notification_delivery", { p_id: r.notification_delivery_id, p_ok: true, p_external_id: id });
        summary[channel].sent += group.length;
      } catch (e) {
        for (const r of group) await db.rpc("complete_notification_delivery", { p_id: r.notification_delivery_id, p_ok: false, p_error: String(e) });
        summary[channel].failed += group.length;
      }
    }
  }
  return new Response(JSON.stringify(summary), { headers: { "content-type": "application/json" } });
});
