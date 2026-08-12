import config from "./config";
import { NotifyOpportunityParams } from "./types";
import { stripPhoneSuffix } from "./phone";

const REQUEST_TIMEOUT_MS = 15_000;

function formatKolkataTime(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")} IST`;
}

export async function notifyOpportunity(params: NotifyOpportunityParams): Promise<void> {
  const { senderPhone, chatName, body, teamsChatId, gm } = params;

  if (!config.N8N_TEAMS_WEBHOOK_URL) {
    console.log("[teams] No N8N_TEAMS_WEBHOOK_URL configured — skipping notification.");
    return;
  }

  const cleanPhone = stripPhoneSuffix(senderPhone);
  const quoted = body && body.trim() ? body.trim() : "(no text)";
  const now = formatKolkataTime();
  const title = chatName || cleanPhone;

  // When a GM is mapped to this number, append an <at> tag at the end. Its id="0"
  // must match the entry in the `mentions` array below — together they make Teams
  // render a real, notifying @mention (plain "@Name" text does not notify). The
  // n8n workflow forwards `mentions` into the Microsoft Graph POST message call.
  const mentionTag = gm ? `<br><at id="0">${gm.name}</at>` : "";

  const content =
    `<b>💰 ${title}</b><br>` +
    `<i>"${quoted}"</i><br>` +
    `Time: ${now}` +
    mentionTag;

  const payload: {
    chat_id: string;
    message: string;
    mentions?: Array<{
      id: number;
      mentionText: string;
      mentioned: { user: { id: string; displayName: string; userIdentityType: string } };
    }>;
  } = {
    chat_id: teamsChatId,
    message: content,
  };

  if (gm) {
    payload.mentions = [
      {
        id: 0,
        mentionText: gm.name,
        mentioned: {
          user: { id: gm.aadId, displayName: gm.name, userIdentityType: "aadUser" },
        },
      },
    ];
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const resp = await fetch(config.N8N_TEAMS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!resp.ok) {
      throw new Error(`n8n webhook returned ${resp.status} ${resp.statusText}`);
    }

    const who = gm ? ` (mentioning ${gm.name})` : "";
    console.log(`[teams] Opportunity notification sent for ${cleanPhone}${who}.`);
  } catch (e) {
    console.error(`[teams] ERROR sending Teams notification:`, e);
  } finally {
    clearTimeout(timeout);
  }
}
