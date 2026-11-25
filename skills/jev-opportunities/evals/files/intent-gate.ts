// Fixture for the jev-opportunities evals. Runs on every message in a chat
// app, about 15,000 a day. The project already uses the Anthropic SDK and
// sends the same long policy text with every call.
import Anthropic from "@anthropic-ai/sdk";
import { POLICY_TEXT } from "./policy";

const client = new Anthropic();

export async function needsHuman(message: string): Promise<boolean> {
  const response = await client.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 1024,
    system: `${POLICY_TEXT}\n\nReply with exactly YES if a person must handle this message, otherwise NO.`,
    messages: [{ role: "user", content: message }],
  });
  const block = response.content.find((part) => part.type === "text");
  return block?.type === "text" && block.text.trim().toUpperCase().startsWith("YES");
}
