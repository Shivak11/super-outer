import OpenAI from "openai";
const client = new OpenAI();
export async function summarise(transcript: string) {
  const reply = await client.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: `Summarise as JSON {"title","points"}: ${transcript}` }] });
  return JSON.parse(reply.choices[0].message.content!);
}
