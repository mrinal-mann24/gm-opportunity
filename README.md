# GM Opportunity

## What this is

An automation that watches **1:1 WhatsApp messages** (via Periskope) sent from
a fixed set of **13 tracked phone numbers**. Each inbound message is classified
by an LLM (via OpenRouter) for whether it's a **price query / sales
opportunity**. If yes, an alert is posted to **Microsoft Teams** (via an n8n
webhook) that `@mentions` the specific **GM (General Manager)** assigned to
that phone number, so the right person is notified in real time.

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
2. Only events where `event`/`event_type` == `"message.created"` are handled
   (this is Periskope's normal inbound/outbound message event — different
   from `message.flagged`, which AIA-Flagged Automation listens for instead).
3. The message is skipped (early `{"status":"ok"}` return, no further work) if:
   - it's outbound (`from_me: true`) — avoids reacting to the GM's own replies
   - `chat_id` doesn't end in `@c.us` — only 1:1 chats are considered, group
     chats (`@g.us`) are ignored entirely
   - the sender's phone isn't one of the 13 numbers in [src/gm.ts](src/gm.ts)
     — this is a strict allowlist, not a blocklist, so no LLM spend happens
     on untracked senders
   - the `message_id` was already recorded in Supabase — Periskope is known
     to fire the same webhook event 2-3 times per delivery, so this dedup
     check runs *before* the LLM call specifically to avoid double-billing
     OpenRouter on duplicate deliveries
4. The message body is sent to an LLM via OpenRouter ([src/classify.ts](src/classify.ts))
   with a system prompt asking for strict JSON:
   `{"is_opportunity": boolean, "reason": string}`. If `is_opportunity` is
   false (or the LLM call errors — it fails closed), processing stops here.
5. If it's an opportunity, the alert is posted to `N8N_TEAMS_WEBHOOK_URL`
   with the message quote, sender phone, LLM's reason, and a Teams-native
   `@mention` of the GM mapped to that phone number in [src/gm.ts](src/gm.ts).
   The n8n workflow (external to this repo) forwards it into Microsoft Teams
   via Graph API.

## File map

| File | Purpose |
|---|---|
| [src/main.ts](src/main.ts) | Express app, `/webhook` route, orchestration |
| [src/classify.ts](src/classify.ts) | LLM classification call via OpenRouter (OpenAI-compatible client) |
| [src/gm.ts](src/gm.ts) | Static phone number → `{name, aadId}` map, ships with **13 placeholder entries** |
| [src/teams.ts](src/teams.ts) | Builds the Teams `@mention` payload (`<at id="0">Name</at>` + matching `mentions[]` entry) and POSTs it |
| [src/db.ts](src/db.ts) | Supabase dedup insert against `gm_opportunity_messages`, keyed on Postgres unique-violation error code `23505` |
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
5. **Confirm the Periskope webhook is actually configured** to send
   `message.created` events (not just `message.flagged`, which is what the
   AIA bot's Periskope config already listens for) to this service's URL.
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

## Deploy

Same pattern as `AIA-Flagged Automation`: `docker compose up -d --build`,
routed through the shared Traefik reverse proxy already running on the host
(TLS via Let's Encrypt, `sslip.io` hostname trick for DNS-free routing).
