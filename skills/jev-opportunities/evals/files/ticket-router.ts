// Fixture for the jev-opportunities evals. Runs on every incoming support
// ticket, about 40,000 a day. The project already uses the OpenAI SDK.
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM = `You route support tickets for an online shop.
Read the ticket and answer only with one word: billing, technical, shipping or other.
Do not explain your answer.`;

export async function routeTicket(text: string): Promise<string> {
  const response = await client.chat.completions.create({
    model: "gpt-5-mini",
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: text },
    ],
  });
  const word = (response.choices[0].message.content ?? "").trim().toLowerCase();
  if (["billing", "technical", "shipping"].includes(word)) return word;
  return "other";
}
