import config from "./config";

const REQUEST_TIMEOUT_MS = 8_000;

// Looks up the saved WhatsApp contact/chat name for a 1:1 chat.
// orgPhone identifies which of our connected numbers owns the chat (required by
// Periskope as the x-phone header). Returns null on any failure — callers should
// fall back to showing the phone number.
export async function getChatName(chatId: string, orgPhone: string): Promise<string | null> {
  if (!config.PERISKOPE_API_KEY || !chatId || !orgPhone) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const resp = await fetch(`${config.PERISKOPE_BASE_URL}/chats/${encodeURIComponent(chatId)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.PERISKOPE_API_KEY}`,
        "x-phone": orgPhone,
      },
      signal: controller.signal,
    });

    if (!resp.ok) {
      console.error(`[periskope] getChatName failed: ${resp.status} ${resp.statusText}`);
      return null;
    }

    const data = (await resp.json()) as { chat_name?: string | null };
    const name = data.chat_name?.trim();
    return name ? name : null;
  } catch (e) {
    console.error(`[periskope] ERROR fetching chat name:`, e);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
