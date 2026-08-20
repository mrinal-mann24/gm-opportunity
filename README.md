# GM Opportunity

## What this is

An automation that watches **1:1 WhatsApp messages** (via Periskope) on a
fixed set of **tracked GM phone numbers** and posts alerts to **Microsoft
Teams** (via an n8n webhook) that `@mention` the specific **GM (General
Manager)** assigned to that phone number. There are two independent pipelines:

| Periskope event | Pipeline | Teams title emoji |
|---|---|---|
| `message.created` | inbound message → **LLM classifies** (OpenRouter) → if it's a price query / sales opportunity → Teams | 💰 |
| `message.flagged` | a GM **manually flags** a message in Periskope → Teams **directly, no LLM** | 🚩 |

Both pipelines apply the same filters (1:1 chats only, tracked GM numbers
only, inbound only, deduped) and post to the same Teams chat — only the
emoji and the presence of the LLM step differ.

It is a sibling project to `AIA-Flagged Automation` (same parent `Projects/`
folder) and deliberately mirrors its architecture, stack, and deploy pattern
— but is a fully independent repo/deploy, not a shared codebase.

## Why it exists / origin

The user (10xkorefi@gmail.com) asked for this after describing the following
requirement verbatim: 13 specific phone numbers each correspond to a person;
any 1:1 message from one of those numbers should be passed through an LLM
layer with a classification prompt ("is this a price query / opportunity
etc.?"); if it matches, forward it to a Teams webhook, tagging the specific
GM the message came in for.

This repo was scaffolded by exploring the existing `AIA-Flagged Automation`
repo (a Periskope → Teams flagged-message forwarder with no LLM) and the
`va-bot` repo (which has a `message.created` webhook handler and a one-off
Python LLM classification script) to reuse their proven patterns rather than
design from scratch.

## How it works (end to end)

1. Periskope POSTs every webhook event to `POST /webhook`.
2. `event`/`event_type` decides the pipeline (`kind`):
   - `"message.created"` → `kind = "opportunity"` (Periskope's normal
     inbound/outbound message event)
   - `"message.flagged"` → `kind = "flagged"` (a GM flagged the message in
     Periskope; the same event AIA-Flagged Automation listens for, but that
     bot only handles `@g.us` group chats — this one only handles `@c.us`
     1:1 chats, so they don't overlap)
   - anything else → `{"status":"ignored"}`
3. The message is skipped (early `{"status":"ok"}` return, no further work) if:
   - it's outbound (`from_me: true`) — avoids reacting to the GM's own
     replies, on both pipelines (a GM flagging their own message is not
     forwarded)
   - `chat_id` doesn't end in `@c.us` — only 1:1 chats are considered, group
     chats (`@g.us`) are ignored entirely
   - `org_phone` (the GM's WhatsApp number that received the message) isn't
     one of the numbers in [src/gm.ts](src/gm.ts) — this is a strict
     allowlist, not a blocklist, so no LLM spend happens on untracked numbers
   - the message was already recorded in Supabase — Periskope is known to
     fire the same webhook event 2-3 times per delivery, so this dedup check
     runs *before* the LLM call specifically to avoid double-billing
     OpenRouter on duplicate deliveries. The dedup key is namespaced per
     pipeline (`<message_id>` for opportunity, `flagged:<message_id>` for
     flagged) so the same WhatsApp message can legitimately produce both a
     💰 and a 🚩 alert.
4. **Opportunity pipeline only:** the message body is sent to an LLM via
   OpenRouter ([src/classify.ts](src/classify.ts)) with a system prompt
   asking for strict JSON: `{"is_opportunity": boolean}`. If `is_opportunity`
   is false (or the LLM call errors — it fails closed), processing stops
   here. The flagged pipeline skips this step entirely — a manual flag is
   already a human decision.
5. The alert is posted to `N8N_TEAMS_WEBHOOK_URL` with the chat name (or
   sender phone), the quoted message, the time in IST, and a Teams-native
   `@mention` of the GM mapped to `org_phone` in [src/gm.ts](src/gm.ts).
   The title is prefixed 💰 for opportunity alerts and 🚩 for flagged alerts.
   The n8n workflow (external to this repo) forwards it into Microsoft Teams
   via Graph API.

## File map

| File | Purpose |
|---|---|
| [src/main.ts](src/main.ts) | Express app, `/webhook` route, routes `message.created` / `message.flagged` into the shared `handleMessage(kind, …)` |
| [src/classify.ts](src/classify.ts) | LLM classification call via OpenRouter (OpenAI-compatible client) |
| [src/gm.ts](src/gm.ts) | Static phone number → `{name, aadId}` map, ships with **13 placeholder entries** |
| [src/teams.ts](src/teams.ts) | Builds the Teams `@mention` payload (`<at id="0">Name</at>` + matching `mentions[]` entry) with a per-`kind` emoji (💰 / 🚩) and POSTs it |
| [src/db.ts](src/db.ts) | Supabase dedup insert against `gm_opportunity_messages`, keyed on Postgres unique-violation error code `23505`; key is namespaced per `kind` |
| [src/config.ts](src/config.ts) | Typed env var loader |
| [src/phone.ts](src/phone.ts) | Shared phone-number normalization (`stripPhoneSuffix`) |
| [src/types.ts](src/types.ts) | Shared TS interfaces |

## Design decisions made (and why)

These were explicitly chosen with the user during planning, not assumed:

- **New separate repo**, not folded into `AIA-Flagged Automation` — cleaner
  separation since it's a distinct bot with a distinct trigger event.
- **OpenRouter** as the LLM provider (not Anthropic or OpenAI directly),
  using a fast/cheap model (`openai/gpt-4o-mini` by default, configurable
  via `OPENROUTER_MODEL`) since classification is a simple yes/no task.
- **Placeholder phone→GM map** — the user did not have the real 13 numbers /
  GM names / Azure AD ids ready yet, so `src/gm.ts` ships with 13 dummy
  entries (`910000000001`...`910000000013`) that must be replaced before
  going live.
- **Reuse the same Supabase project** as `AIA-Flagged Automation` (new table
  `gm_opportunity_messages`) rather than provisioning a separate project —
  less setup, and dedup data here has no reason to be isolated from AIA's.
- **Classify on the single message body only** — no fetching of prior chat
  history for context. Simpler, faster, avoids an extra Periskope API call
  per message. Revisit if false negatives on context-dependent messages
  become a problem.
- **One shared Teams destination** (`DEFAULT_TEAMS_CHAT_ID`), with per-GM
  targeting done via `@mention` inside the message rather than routing to
  different Teams chats per number. Matches the AIA bot's pattern exactly.
- **Same tech stack as AIA-Flagged Automation**: Node 22 / TypeScript /
  Express / Supabase / Docker + Traefik — chosen so the two bots are easy to
  maintain side by side on the same host, using the same deploy playbook.

## What's still pending before this can run against real traffic

1. **Fill in the real 13 phone numbers, GM names, and Azure AD object ids**
   in [src/gm.ts](src/gm.ts) — every entry is currently a placeholder. To
   find a person's AAD object id: `GET https://graph.microsoft.com/v1.0/users/<email>`
   via Microsoft Graph, copy the `id` field (same method used for
   `CSM_AAD_IDS` in the AIA repo's `src/csm.ts`).
2. **Create a real `.env`** from `.env.example` with real Supabase,
   Periskope, n8n webhook, and OpenRouter credentials.
3. **Confirm the `OPENROUTER_MODEL` choice** and that it supports
   `response_format: json_object` (most OpenAI/Claude-family models on
   OpenRouter do; verify before relying on strict JSON parsing).
4. **Create the `gm_opportunity_messages` table** in Supabase:
   ```sql
   create table gm_opportunity_messages (
     message_id text primary key,
     sender_phone text,
     body text,
     created_at timestamptz default now()
   );
   ```
5. **Confirm the Periskope webhook is actually configured** to send both
   `message.created` **and** `message.flagged` events to this service's URL.
   (`message.flagged` for 1:1 chats must be enabled in Periskope for the 🚩
   pipeline to receive anything.)
6. **Pick a free host port for deploy** — `docker-compose.yml` currently
   maps `8002:8000` and a hostname `gm-opportunity.187-127-173-25.sslip.io`,
   chosen to avoid clashing with AIA-Flagged Automation (port 8000) and
   `va-bot` (port 8001) on the same VPS — verify 8002 is actually free
   before deploying.
7. **`git init` and first commit** — this repo has not been initialized as
   a git repository yet.
8. Local build/typecheck has been verified (`npm install && npm run build`
   completes cleanly); the live webhook path has **not** yet been
   smoke-tested end-to-end (starting the server and POSTing a simulated
   Periskope payload) — do that before considering this done.

## Local development

```
npm install
cp .env.example .env   # fill in values (dummy values are fine for a dry run
                        # of routing logic; real OPENROUTER_API_KEY and
                        # N8N_TEAMS_WEBHOOK_URL needed to test classification
                        # and Teams delivery end-to-end)
npm run dev
```

Simulate a Periskope webhook:
```
curl -X POST http://localhost:8000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event": "message.created",
    "data": {
      "unique_id": "test-1",
      "chat_id": "910000000001@c.us",
      "sender_phone": "910000000001",
      "body": "Whats the price for your premium plan?",
      "from_me": false
    }
  }'
```
Expect console logs showing the classification result and (with real
credentials) a Teams POST attempt. Re-sending the same `unique_id` should be
skipped as a duplicate. A payload from an untracked number, an outbound
message, or a group chat_id (`@g.us`) should each be skipped before any LLM
call.

Simulate a flagged message (no LLM call — goes straight to Teams with 🚩):
```
curl -X POST http://localhost:8000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event": "message.flagged",
    "data": {
      "message_id": "test-1",
      "chat_id": "919999999999@c.us",
      "sender_phone": "919999999999",
      "org_phone": "910000000001",
      "body": "Please call me back about the contract",
      "from_me": false
    }
  }'
```
Note `"message_id": "test-1"` does **not** collide with the opportunity
`"unique_id": "test-1"` above — the flagged pipeline dedups on
`flagged:test-1`.

## Deploy

Same pattern as `AIA-Flagged Automation`: `docker compose up -d --build`,
routed through the shared Traefik reverse proxy already running on the host
(TLS via Let's Encrypt, `sslip.io` hostname trick for DNS-free routing).
