/**
 * `super-outer jev ask`: one closed question that another plugin asks Jev.
 *
 * The plugin passes a kind and two to eight options on the command line and
 * the typed request on stdin. The result is always one of four shapes:
 * a confident answer from Jev ("jev"), no answer because Jev was asked and
 * did not give one confident option ("local"), no answer because Jev is
 * switched off or has no key ("off"), and no answer because the arguments or
 * the text were refused ("refused"). Nothing is sent in the last two cases.
 * askChoice never throws.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { askJev, resolveEndpoint, resolveTimeout } from "./client.mjs";
import { DIAGRAM_CONFIDENCE } from "./combine.mjs";
import { ASK_OPTIONS, ASK_QUESTION_SET_VERSION, ASK_SLUG, askKey, buildAskQuestions } from "./questions.mjs";
import { looksSecret } from "./prompt-filter.mjs";
import { appendRecord } from "./record.mjs";
import { loadSettings, resolveDataDir } from "./settings.mjs";

export const ASK_TEXT_LIMIT = 1500;

const result = (answer, source) => ({ answer, source, confident: source === "jev" });

/** Reads --kind and --options from argv, or returns null when either is invalid. */
export function parseAskArguments(argv = []) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (name !== "--kind" && name !== "--options") return null;
    const value = argv[index + 1];
    if (typeof value !== "string" || Object.hasOwn(values, name)) return null;
    values[name] = value;
    index += 1;
  }
  const kind = values["--kind"];
  if (!ASK_SLUG.test(kind ?? "")) return null;
  const options = String(values["--options"] ?? "").split(",");
  if (options.length < ASK_OPTIONS.minimum || options.length > ASK_OPTIONS.maximum) return null;
  if (!options.every((option) => ASK_SLUG.test(option))) return null;
  if (new Set(options.map(askKey)).size !== options.length) return null;
  return { kind, options };
}

/** The text that may be sent, or null. */
export function safeRequest(text) {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (trimmed === "" || trimmed.length > ASK_TEXT_LIMIT) return null;
  if (looksSecret(trimmed)) return null;
  return trimmed;
}

/** The one option Jev read at 0.8 or more while every other reads at 0.2 or less, or null. */
export function confidentOption(options, raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const readings = [];
  for (const option of options) {
    const value = Object.hasOwn(raw, askKey(option)) ? raw[askKey(option)]?.noul : null;
    if (typeof value !== "number" || value < 0 || value > 1) return null;
    readings.push([option, value]);
  }
  if (readings.some(([, p]) => p > 1 - DIAGRAM_CONFIDENCE && p < DIAGRAM_CONFIDENCE)) return null;
  const chosen = readings.filter(([, p]) => p >= DIAGRAM_CONFIDENCE);
  return chosen.length === 1 ? chosen[0][0] : null;
}

function repositoryName(cwd) {
  const start = path.resolve(String(cwd || "."));
  for (let current = start; ; current = path.dirname(current)) {
    if (fs.existsSync(path.join(current, ".git"))) return path.basename(current);
    if (path.dirname(current) === current) return path.basename(start);
  }
}

export async function askChoice({ argv = [], text, env = process.env, cwd = process.cwd(), now = new Date() } = {}) {
  try {
    const parsed = parseAskArguments(argv);
    if (!parsed) return result(null, "refused");
    const settings = loadSettings({ env });
    if (settings.state !== "on") return result(null, "off");
    const state = safeRequest(text);
    if (state === null) return result(null, "refused");
    const answer = await askJev({
      key: settings.key,
      state,
      questions: buildAskQuestions(parsed.kind, parsed.options),
      ...(settings.model ? { model: settings.model } : {}),
      endpoint: resolveEndpoint(env),
      timeoutMs: resolveTimeout(env),
      env,
    });
    const chosen = answer.ok ? confidentOption(parsed.options, answer.answers) : null;
    const outcome = chosen ? result(chosen, "jev") : result(null, "local");
    if (settings.record && !["test_network_refused", "endpoint_refused"].includes(answer.reason)) {
      appendRecord({
        dataDir: resolveDataDir(env),
        key: settings.key,
        now,
        row: {
          ts: now.toISOString(),
          repo: repositoryName(cwd),
          prompt_head: state.slice(0, 120),
          prompt_sha256: createHash("sha256").update(state).digest("hex"),
          question_set: ASK_QUESTION_SET_VERSION,
          kind: `ask:${parsed.kind}`,
          options: parsed.options,
          status: answer.ok ? "recorded" : "failed",
          reason: answer.ok ? null : answer.reason,
          model: answer.ok ? answer.model : null,
          latency_ms: answer.latencyMs,
          answer: outcome.answer,
          source: outcome.source,
          recorded: true,
        },
      });
    }
    return outcome;
  } catch {
    return result(null, "local");
  }
}
