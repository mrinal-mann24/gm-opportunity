export interface PeriskopeMessageData {
  // message.flagged events carry the flagged message's id here; message.created uses unique_id.
  message_id?: string;
  unique_id?: string;
  id?: { id?: string };
  chat_id?: string;
  sender_phone?: string;
  author?: string | null;
  org_phone?: string;
  body?: string;
  message_type?: string;
  from_me?: boolean;
  timestamp?: string;
}

export interface PeriskopeWebhookPayload {
  event_type?: string;
  event?: string;
  data?: PeriskopeMessageData;
}

// Which pipeline produced the alert. "opportunity" = message.created → LLM → Teams (💰).
// "flagged" = message.flagged → Teams directly, no LLM (🚩).
export type AlertKind = "opportunity" | "flagged";

export interface RecordMessageParams {
  messageId: string;
  kind: AlertKind;
  senderPhone: string;
  body: string;
}

// The GM to @mention in the Teams alert, resolved from the receiving org_phone (which GM's WhatsApp number got the message).
export interface GmMention {
  name: string;
  aadId: string;
}

export interface ClassifyResult {
  isOpportunity: boolean;
}

export interface NotifyParams {
  kind: AlertKind;
  senderPhone: string;
  chatName: string | null;
  body: string;
  teamsChatId: string;
  gm: GmMention | null;
}
