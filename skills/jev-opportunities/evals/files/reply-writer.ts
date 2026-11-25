// Fixture for the jev-opportunities evals. Writes the reply a customer reads.
// The output is free text, so this call should stay as it is.
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function draftReply(ticket: string, orderSummary: string): Promise<string> {
  const response = await client.chat.completions.create({
    model: "gpt-5",
    messages: [
      { role: "system", content: "Write a short, warm reply to this customer. Use the order details." },
      { role: "user", content: `Ticket:\n${ticket}\n\nOrder:\n${orderSummary}` },
    ],
  });
  return response.choices[0].message.content ?? "";
}
