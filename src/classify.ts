import OpenAI from "openai";
import config from "./config";
import { ClassifyResult } from "./types";

const client = new OpenAI({
  apiKey: config.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

const SYSTEM_PROMPT = `You classify inbound WhatsApp messages for a sales team.
Respond with a strict JSON object: {"is_opportunity": boolean}.
Mark is_opportunity true if the message is a pricing question, quote request,
product/service inquiry, or expresses interest in buying/subscribing.
Mark false for support requests, complaints, casual chat, or anything unrelated to sales.`;

export async function classifyMessage(body: string): Promise<ClassifyResult> {
  if (!body || !body.trim()) {
    return { isOpportunity: false };
  }

  if (!config.OPENROUTER_API_KEY) {
    console.error("[classify] OPENROUTER_API_KEY not configured — skipping classification.");
    return { isOpportunity: false };
  }

  try {
    const resp = await client.chat.completions.create({
      model: config.OPENROUTER_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: body },
      ],
    });

    const raw = resp.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    return { isOpportunity: Boolean(parsed.is_opportunity) };
  } catch (e) {
    console.error("[classify] ERROR calling OpenRouter:", e);
    // Fail closed — a classification error should never trigger a false alert.
    return { isOpportunity: false };
  }
}
