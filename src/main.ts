import express, { Request, Response } from "express";
import config from "./config";
import { recordMessage } from "./db";
import { gmForPhone, isTrackedNumber } from "./gm";
import { classifyMessage } from "./classify";
import { notifyTeams } from "./teams";
import { getChatName } from "./periskope";
import { AlertKind, PeriskopeMessageData, PeriskopeWebhookPayload } from "./types";

const app = express();
app.use(express.json());

app.post("/webhook", async (req: Request, res: Response) => {
  const payload = req.body as PeriskopeWebhookPayload;
  console.log("=== Incoming Periskope event ===");
  console.log(payload);

  const eventType = payload.event_type ?? payload.event;

  // Two pipelines share the same filters and Teams destination:
  //   message.created → LLM classification → Teams (💰 opportunity)
  //   message.flagged → Teams directly, no LLM   (🚩 flagged)
  let kind: AlertKind;
  if (eventType === "message.created") {
    kind = "opportunity";
  } else if (eventType === "message.flagged") {
    kind = "flagged";
  } else {
    return res.status(200).json({ status: "ignored" });
  }

  const result = await handleMessage(kind, payload.data ?? {});
  return res.status(200).json(result);
});

async function handleMessage(kind: AlertKind, msg: PeriskopeMessageData): Promise<{ status: string }> {
  const messageId = (msg.message_id || msg.unique_id || msg.id?.id || "").trim();
  const chatId = (msg.chat_id || "").trim();
  const senderPhone = msg.sender_phone || msg.author || "";
  const orgPhone = msg.org_phone || "";
  const body = msg.body || "";

  console.log(`[msg] kind=${kind} message_id=${JSON.stringify(messageId)} chat=${chatId} sender=${senderPhone} org_phone=${orgPhone}`);

  if (msg.from_me) {
    console.log(`[msg] Outbound message — skipping.`);
    return { status: "ok" };
  }

  if (!chatId.endsWith("@c.us")) {
    console.log(`[msg] chat_id '${chatId}' is not a 1:1 chat — skipping.`);
    return { status: "ok" };
  }

  if (!isTrackedNumber(orgPhone)) {
    console.log(`[msg] org_phone '${orgPhone}' is not one of the tracked GM numbers — skipping.`);
    return { status: "ok" };
  }

  const proceed = await recordMessage({ messageId, kind, senderPhone, body });
  if (!proceed) {
    console.log(`[msg] Already processed message_id=${JSON.stringify(messageId)} — skipping.`);
    return { status: "ok" };
  }

  // A manual flag is an explicit human decision — forward it as-is. Only
  // message.created events go through the LLM.
  if (kind === "opportunity") {
    const { isOpportunity } = await classifyMessage(body);
    if (!isOpportunity) {
      console.log(`[msg] Not an opportunity — skipping.`);
      return { status: "ok" };
    }
  }

  const teamsChatId = config.DEFAULT_TEAMS_CHAT_ID;
  if (!teamsChatId) {
    console.log(`[msg] No Teams destination configured — nothing to notify.`);
    return { status: "ok" };
  }

  const gm = gmForPhone(orgPhone);
  const chatName = await getChatName(chatId, orgPhone);

  console.log(`[msg] Alerting Teams (${kind}) for ${senderPhone}${gm ? ` — mentioning ${gm.name}` : ""}.`);
  await notifyTeams({ kind, senderPhone, chatName, body, teamsChatId, gm });

  return { status: "ok" };
}

app.listen(config.PORT, () => {
  console.log(`GM opportunity webhook listening on port ${config.PORT}`);
});
