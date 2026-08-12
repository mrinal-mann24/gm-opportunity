export interface PeriskopeMessageData {
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

export interface RecordMessageParams {
  messageId: string;
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

export interface NotifyOpportunityParams {
  senderPhone: string;
  chatName: string | null;
  body: string;
  teamsChatId: string;
  gm: GmMention | null;
}
