import { createClient, SupabaseClient } from "@supabase/supabase-js";
import config from "./config";
import { RecordMessageParams } from "./types";
import { stripPhoneSuffix } from "./phone";

export const supabase: SupabaseClient = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_SERVICE_ROLE_KEY
);

const DUPLICATE_KEY_ERROR_CODE = "23505";

export async function recordMessage(params: RecordMessageParams): Promise<boolean> {
  const { messageId, kind, senderPhone, body } = params;

  if (!messageId) {
    // No id to dedup on — allow it through rather than lose the alert.
    return true;
  }

  // Namespace the key per pipeline so the same WhatsApp message can produce both a
  // 💰 opportunity alert (LLM) and a 🚩 flagged alert (manual flag) without one
  // blocking the other, while Periskope's duplicate webhook deliveries are still
  // collapsed within each pipeline. Opportunity keys stay bare for backward
  // compatibility with rows already in the table.
  const dedupKey = kind === "opportunity" ? messageId : `${kind}:${messageId}`;

  const { error } = await supabase.from("gm_opportunity_messages").insert({
    message_id: dedupKey,
    sender_phone: stripPhoneSuffix(senderPhone),
    body,
  });

  if (error) {
    if (error.code === DUPLICATE_KEY_ERROR_CODE) {
      console.log(`[db] Message ${dedupKey} already processed — skipping.`);
    } else {
      console.error(`[db] ERROR inserting message ${dedupKey}: ${error.message}`);
    }
    return false;
  }

  return true;
}
