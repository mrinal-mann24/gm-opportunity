import OpenAI from "openai";
import config from "./config";
import { ClassifyResult } from "./types";

const client = new OpenAI({
  apiKey: config.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

const SYSTEM_PROMPT = `You classify inbound WhatsApp messages for a sales team.
Respond with a strict JSON object: {"is_opportunity": boolean, "type": "now" | "time" | "message"}.
Mark is_opportunity true if the message is any sales-relevant signal, including:
- a pricing question, quote request, or product/service inquiry
- expressing interest in buying/subscribing
- a decline or objection after pricing was discussed (e.g. "too costly", "not in our budget",
  "not interested", "we'll pass", "too expensive for us")
- a timing or scheduling reply tied to the sales conversation (e.g. "around 1pm", "call me
  tomorrow", "let's connect next week", "give me a day or two", "Let’s connect at 8 pm ?", "yes we can connect now", "4:30 evening?? Will it be fine?", "10:30 Pm" )
- a request to escalate or involve someone else (e.g. "let me check with my manager", "loop
  in my partner", "can someone call me back", "connect me to your senior")
These decline/objection, timing/scheduling, and escalation messages matter just as much as the
original inquiry — the sales manager needs to see how the opportunity progressed or was lost,
not just that it started.
Mark false only for support requests, complaints, casual chat, or anything unrelated to sales.
Set "type" based on the message, checked in this order:
1. "now" — the lead wants to connect immediately or within about 30 minutes (e.g. "now",
   "right now", "can we talk now", "in 10 mins", "in 15 minutes", "in 30 mins", "give me
   5 min", "asap", "call me in a bit").
2. "time" — the lead proposes or confirms a specific clock time, date, or a window further
   out than ~30 minutes (e.g. "around 1pm", "tomorrow morning", "4:30 evening??", "next
   week", "10:30 Pm", "give me a day or two").
3. "message" — every other case, including when is_opportunity is false.`;

export async function classifyMessage(body: string): Promise<ClassifyResult> {
  if (!body || !body.trim()) {
    return { isOpportunity: false, type: "message" };
  }

  if (!config.OPENROUTER_API_KEY) {
    console.error("[classify] OPENROUTER_API_KEY not configured — skipping classification.");
    return { isOpportunity: false, type: "message" };
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
    const type = parsed.type === "now" || parsed.type === "time" ? parsed.type : "message";
    return {
      isOpportunity: Boolean(parsed.is_opportunity),
      type,
    };
  } catch (e) {
    console.error("[classify] ERROR calling OpenRouter:", e);
    // Fail closed — a classification error should never trigger a false alert.
    return { isOpportunity: false, type: "message" };
  }
}
