// _shared/teams.ts — putting a notification into a Teams channel.
//
// WHY A WEBHOOK AND NOT GRAPH
//
//   Posting a channel message with an application token needs `Teamwork.Migrate.All`, which
//   Microsoft grants for importing history and refuses for ordinary posting. The supported
//   route for "a system posts into a channel" is an incoming webhook, and that is what this
//   module speaks. The same reasoning is why `deliver-notifications` marks its one-to-one
//   Teams chat path UNPROVEN: it asks for exactly the thing app-only tokens cannot do.
//
// THE CORRECTION OF 15 SEPTEMBER
//
//   The design record first said private channels cannot be posted into. That is true of the
//   classic Office 365 connector and false of what Teams now offers, which is a Power
//   Automate **Workflows** flow — "post to a channel when a webhook request is received".
//   A flow posts wherever its creator can post, private channels included. Amber proved it.
//
//   What survives is the fragility, and it is the thing to design around: a flow runs AS the
//   person who created it, so it stops when that person leaves, loses their licence or has
//   their password reset. Every flow should therefore be created by one long-lived owner, so
//   a broken notification path is one thing to fix instead of eleven people's flows to chase.
//
// A WEBHOOK URL IS A CREDENTIAL
//
//   It carries a `sig=` that lets whoever holds it post into that channel as the flow's
//   owner. It belongs in a secret, it must never be committed, and it must never reach a log
//   or an error message — which is what `redact` below is for, and why every throw in this
//   file goes through it. Two of Lofty's were pasted into a chat on 15 September and should
//   be regenerated.
//
// 202 IS NOT DELIVERY
//
//   Power Automate accepts the request and runs the flow afterwards, so a 202 means "the
//   flow was started", not "the message is in the channel". A flow whose owner has left
//   still answers 202 and posts nothing. Nothing here can tell the difference; the only
//   honest check is a person looking at the channel, which is what the design log says.

/** A webhook URL with its signature removed, safe to put in an outbox row's error. */
export function redact(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname.split("/").slice(0, 4).join("/")}/…`;
  } catch {
    return "(an unparseable webhook URL)";
  }
}

/** Somebody to @mention in a card. `id` is their Entra object id or their UPN. */
export type Mention = { id: string; name: string };

export type Post = {
  /** "1042-001 moved to Construction" — the line people scan. */
  title: string;
  /** The detail under it. Optional; a title-only post is a fine post. */
  body?: string | null;
  /** Full URL into the app, already absolute. The card's one button. */
  href?: string | null;
  /** The button's words. "Open job 1042-001" beats "Open". */
  hrefLabel?: string;
  /** Short name/value pairs shown as a facts table — who did it, when, which project. */
  facts?: { name: string; value: string }[];
  /** People to @mention. Their names are appended to the body as Teams mention chips. */
  mentions?: Mention[];
};

/**
 * An Adaptive Card body for a post.
 *
 * `msteams.entities` is how a card mentions somebody: the text carries `<at>Name</at>` and
 * the entity says who that resolves to. Get the pair out of step and Teams renders the
 * literal `<at>` tags, which is the usual way this looks broken.
 */
export function card(post: Post): unknown {
  const mentions = post.mentions ?? [];
  const blocks: unknown[] = [
    { type: "TextBlock", text: post.title, weight: "Bolder", size: "Medium", wrap: true },
  ];
  if (post.body) blocks.push({ type: "TextBlock", text: post.body, wrap: true });
  if (mentions.length) {
    blocks.push({ type: "TextBlock", wrap: true, text: mentions.map(m => `<at>${m.name}</at>`).join(" ") });
  }
  if (post.facts?.length) {
    blocks.push({ type: "FactSet", facts: post.facts.map(f => ({ title: f.name, value: f.value })) });
  }

  return {
    type: "message",
    attachments: [{
      contentType: "application/vnd.microsoft.card.adaptive",
      content: {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        type: "AdaptiveCard",
        version: "1.4",
        body: blocks,
        actions: post.href
          ? [{ type: "Action.OpenUrl", title: post.hrefLabel ?? "Open in Lofty Hub", url: post.href }]
          : [],
        msteams: {
          width: "Full",
          entities: mentions.map(m => ({
            type: "mention",
            text: `<at>${m.name}</at>`,
            mentioned: { id: m.id, name: m.name },
          })),
        },
      },
    }],
  };
}

/**
 * Post into the channel behind a webhook URL.
 *
 * Throws with the URL redacted. The caller is an outbox row, so a throw is a retry with
 * backoff rather than a lost notification.
 */
export async function postToChannel(webhookUrl: string, post: Post): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(card(post)),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`Teams webhook ${redact(webhookUrl)} answered ${res.status}: ${detail}`);
  }
  await res.body?.cancel();
}

/**
 * The same post as plain text, for the route that needs no flow at all.
 *
 * Every Teams channel has its own email address — General's is a `…@au.teams.ms` one — and
 * mail sent to it appears as a post. It is the third way into a channel and the only one
 * that cannot break when somebody leaves, because there is no flow and no owner: the app
 * already holds `Mail.Send`. The cost is that an email renders plainer than a card and
 * arrives slower. Held as the fallback if the flows prove fragile; see the design log.
 */
export function asEmail(post: Post): { subject: string; text: string } {
  const lines = [post.title];
  if (post.body) lines.push("", post.body);
  for (const f of post.facts ?? []) lines.push(`${f.name}: ${f.value}`);
  if (post.href) lines.push("", post.href);
  return { subject: post.title, text: lines.join("\n") };
}
