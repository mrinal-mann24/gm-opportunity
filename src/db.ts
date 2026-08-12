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
  const { messageId, senderPhone, body } = params;

  if (!messageId) {
    // No id to dedup on — allow it through rather than lose the alert.
    return true;
  }

  const { error } = await supabase.from("gm_opportunity_messages").insert({
    message_id: messageId,
    sender_phone: stripPhoneSuffix(senderPhone),
    body,
  });

  if (error) {
    if (error.code === DUPLICATE_KEY_ERROR_CODE) {
      console.log(`[db] Message ${messageId} already processed — skipping.`);
    } else {
      console.error(`[db] ERROR inserting message ${messageId}: ${error.message}`);
    }
    return false;
  }

  return true;
}
