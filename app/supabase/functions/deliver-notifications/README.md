# deliver-notifications

The outbox worker for notifications (migration `0083`). The database writes one
`notification_deliveries` row per channel per notification; this function drains the
`email` and `teams` rows through Microsoft Graph and reports back. `in_app` rows are sent
the moment they are written and never reach this function. `sms` rows are written and
left queued until a provider is chosen (Amber, 2 September: later).

Nothing sends until the three steps below are done, and Setup → Notifications says so
until the first email is marked sent.

## 1. An app registration in Entra ID

Application (not delegated) permissions, admin-consented:

| Permission | For |
|---|---|
| `Mail.Send` | sending from the notifications mailbox |
| `Chat.ReadWrite.All` and `Chat.Create` | one-to-one Teams messages |

Restrict `Mail.Send` to the one mailbox with an Exchange application access policy, so
the app can send as `notifications@lofty.com.au` and nobody else.

## 2. Secrets

```
supabase secrets set MS_TENANT_ID=… MS_CLIENT_ID=… MS_CLIENT_SECRET=… \
  MS_SENDER_MAILBOX=notifications@lofty.com.au \
  APP_BASE_URL=https://app.lofty.com.au \
  DELIVER_SECRET=$(openssl rand -hex 24)
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by the platform. The service
role is the only role granted `claim_notification_deliveries()` and
`complete_notification_delivery()`; a browser session cannot drain the outbox.

## 3. Deploy and schedule

```
supabase functions deploy deliver-notifications --no-verify-jwt
```

Then schedule a POST every minute with the header `x-deliver-secret: <DELIVER_SECRET>` —
from the Supabase dashboard's function schedules, or from pg_cron with pg_net enabled:

```sql
select cron.schedule('deliver_notifications', '* * * * *', $$
  select net.http_post(
    url := 'https://<project>.supabase.co/functions/v1/deliver-notifications',
    headers := jsonb_build_object('x-deliver-secret', '<DELIVER_SECRET>'))
$$);
```

Every run claims what is due (`for update skip locked`, so overlapping runs never send the
same row), groups a person's due rows into one message, sends, and marks each row sent or
re-queues it with backoff (5, 25, 125 minutes; failed after five tries). The response is a
per-channel count, which is what to look at first when something seems not to arrive.

## What it does not do yet

- SMS. The channel exists end to end except the send; pick a provider and add a `sendSms`
  beside `sendEmail`.
- Teams channel posts. Rules can name a team; delivery is still one-to-one chats to each
  member. A channel webhook per team is the next step.
- Reply handling. Replies to the notifications mailbox land in Outlook; nothing reads them.
  The maintenance batch's inbound mail is where that starts.
