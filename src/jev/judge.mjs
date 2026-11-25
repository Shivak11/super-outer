// The order of the checks and stateFor are ported from Super-outer Experimental's jev-route-check (scripts/run-route-check.mjs and scripts/route-check.mjs).
/**
 * Decides, for one typed prompt, whether Jev is asked, reads its answer, and
 * returns the route the session is given.
 *
 * The order of the checks is the privacy design. A SMALL_SAFE word route is
 * never sent, so a typo fix waits no longer than it does without Jev. Then
 * the settings decide whether Jev is on. Then only the words a person typed
 * may be sent, at most the first 1,500 characters, and nothing is sent when
 * the text is short, very long, a slash command, still holds a listed host
 * tag, or looks like it holds a key, a token or a password. The length is
 * checked before the secret scan, so a hostile two-megabyte prompt stays
 * inside the time limit.
 *
 * judgeRoute never throws. Whenever Jev's reading is not used, the route is
 * the word router's own.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { HOST_BLOCK_TAGS, TYPED_WRAPPER_TAGS } from "../host-blocks.mjs";
import { askJev, resolveEndpoint, resolveTimeout } from "./client.mjs";
import { combineRoute, decideV6, jevSeesNewWork, wordsDesign } from "./combine.mjs";
import { QUESTION_SET_VERSION, V6_KINDS, V6_QUESTION_SET_VERSION, buildQuestions, buildV6Questions } from "./questions.mjs";
import { readAnswers, readV6Answer } from "./reading.mjs";
import { appendRecord, pruneRecord } from "./record.mjs";
import { looksSecret, safeSummary } from "./prompt-filter.mjs";
import { loadSettings, resolveDataDir } from "./settings.mjs";

export const PROMPT_LIMITS = Object.freeze({
  minimumCharacters: 8,
  maximumCharacters: 50000,
  stateCharacters: 1500,
  promptHeadCharacters: 120,
  // The secret check covers the part that is sent and 200 characters past
  // the cut, so a key that straddles the cut is still seen. A credential
  // further on is never sent.
  checkedCharacters: 1700,
});

// A character outside the basic plane is two units long. When the cut falls
// between them, the first half is dropped as well.
const cut = (text, length) => {
  const kept = String(text ?? "").slice(0, length);
  return /[\uD800-\uDBFF]$/.test(kept) ? kept.slice(0, -1) : kept;
};

/** The text sent to Jev: the first 1,500 characters of the typed words. */
export function stateFor(typed) {
  return cut(typed, PROMPT_LIMITS.stateCharacters);
}

const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// An opening or closing tag with a listed name, in any case. Super-outer's
// own removal of host blocks deliberately leaves a lone tag that sits in the
// middle of a line, so that a person writing about a tag still gets a route.
// A prompt with such a tag left in it is not sent.
const LISTED_TAG = new RegExp(
  `</?(?:${[...HOST_BLOCK_TAGS, ...TYPED_WRAPPER_TAGS].map(escapePattern).join("|")})(?![\\w-])`,
  "i",
);

export function hasListedHostTag(text) {
  return LISTED_TAG.test(String(text ?? ""));
}

/**
 * Text a host or a tool wrote that Super-outer's removal does not know by
 * name: a block whose tag joins words with a hyphen or an underscore, as the
 * host's own blocks do (ide_opened_file, user-prompt-submit-hook,
 * teammate-message), a few known one-word blocks, and a pasted JSON object.
 * Added in 5.8.0 after a review sent such text through the hook. A request
 * that holds any of these is routed by the word lists and never sent.
 */
const HOST_STYLE_TAG = /<\/?[a-z][a-z0-9]*(?:[-_][a-z0-9]+)+(?=[\s/>])/i;
const ONE_WORD_HOST_TAG = /<\/?(?:channel|stdout|stderr|transcript|output)(?=[\s/>])/i;
const JSON_OBJECT = /[{,]\s*"[^"\n]{1,60}"\s*:/;

export function looksHostWritten(text) {
  const value = String(text ?? "");
  return HOST_STYLE_TAG.test(value) || ONE_WORD_HOST_TAG.test(value);
}

export function holdsJsonObject(text) {
  return JSON_OBJECT.test(String(text ?? ""));
}

/**
 * A host command such as /model or /super-outer:outer. A typed path such as
 * /Users/someone/app has a second slash in its first word, so it is a request
 * and may be sent.
 */
export function isSlashCommand(text) {
  return /^\s*\/[A-Za-z][\w:.-]*(?=\s|$)/.test(String(text ?? ""));
}

/** The name of the folder holding the nearest .git above cwd, or else of cwd. */
function repositoryName(cwd) {
  const start = path.resolve(String(cwd || "."));
  for (let current = start; ; current = path.dirname(current)) {
    if (fs.existsSync(path.join(current, ".git"))) return path.basename(current);
    if (path.dirname(current) === current) return path.basename(start);
  }
}

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

/**
 * Why typed text may not be sent to Jev, or null when it may. One rule for the
 * route reading and for the recorded readings of a mid-build message, so that
 * neither sends a paste, machine text, a host command or a secret the other
 * refuses.
 */
export function typedRefusal(text) {
  if (typeof text !== "string") return "too_short";
  if (text.length < PROMPT_LIMITS.minimumCharacters) return "too_short";
  if (text.length > PROMPT_LIMITS.maximumCharacters) return "too_long";
  if (isSlashCommand(text)) return "host_command";
  if (hasListedHostTag(text) || looksHostWritten(text)) return "host_markup";
  if (holdsJsonObject(text)) return "machine_text";
  // Checked as typed and with white space collapsed, the form the record keeps.
  if (looksSecret(cut(text, PROMPT_LIMITS.checkedCharacters))
    || looksSecret(cut(text.replace(/\s+/g, " "), PROMPT_LIMITS.checkedCharacters))) return "secret_pattern";
  return null;
}

/** A message longer than this is a paste or a brief, never a mid-build remark. */
export const MID_BUILD_CHARACTERS = 600;

/**
 * The one line sent for a recorded reading of a mid-build message, or null
 * when nothing may be sent. The whole message passes the same refusals as the
 * route reading before any of it is cut, so a secret past the cut still stops
 * the call. Only a message short enough to be a remark is read.
 */
export function midBuildSummary(typed) {
  const text = typeof typed === "string" ? typed.trim() : "";
  if (typedRefusal(text) || text.length > MID_BUILD_CHARACTERS) return null;
  return safeSummary(cut(text.replace(/\s+/g, " "), 200));
}

/**
 * Returns { route, design, lines, status, reason, settingsState, model,
 * latencyMs, timeoutMs }. The status is "skipped" when nothing was sent,
 * "failed" when the call or its answers failed, and "used" when Jev's reading
 * decided the design line.
 *
 * `budgetMs` is the time the prompt hook can still spare (see
 * src/hook-deadline.mjs). It can shorten the call, never lengthen it past
 * Jev's own limit of 2.5 seconds. A call that the shorter budget cut off is
 * recorded with the reason "deadline", not "timeout", so a busy computer does
 * not read as a slow Jev in the record.
 */
export async function judgeRoute({ typed, route, env = process.env, cwd = process.cwd(), now = new Date(), budgetMs } = {}) {
  const ownLimit = resolveTimeout(env);
  const timeoutMs = Number.isFinite(budgetMs) && budgetMs > 0 ? Math.min(ownLimit, Math.floor(budgetMs)) : ownLimit;
  let settings = { key: null, keySource: null, state: "no_key", record: false };
  try {
    settings = loadSettings({ env });
  } catch {
    // loadSettings catches its own errors. This catch stays so that
    // judgeRoute cannot throw even if that changes.
  }
  const text = typeof typed === "string" ? typed.trim() : "";
  const fromWords = () => {
    try {
      return combineRoute({ route, reading: null, text });
    } catch {
      return { route, design: { shown: false, source: "words", jev: null, words: false, guard: false }, lines: [] };
    }
  };
  const result = (combined, status, reason, { model = null, latencyMs = null, newWork = false } = {}) => ({
    timeoutMs,
    route: combined.route,
    design: combined.design,
    lines: combined.lines,
    newWork,
    status,
    reason,
    settingsState: settings.state,
    model,
    latencyMs,
  });

  // Old record files go on every judged prompt, also after the record is
  // switched off, so no row outlives 30 days.
  pruneRecord({ dataDir: resolveDataDir(env), now });

  try {
    const skip = (reason) => result(fromWords(), "skipped", reason);
    if (!route || typeof route !== "object") return skip("no_route");
    if (route.mode === "SMALL_SAFE") return skip("small_safe");
    if (settings.state !== "on") return skip(settings.state);
    const refused = typedRefusal(text);
    if (refused) return skip(refused);

    // The test guard inside askJev reads the process's own environment, so a
    // test that builds its own env cannot switch the guard off.
    const answer = await askJev({
      key: settings.key,
      state: stateFor(text),
      questions: buildQuestions({ record: settings.record }),
      ...(settings.model ? { model: settings.model } : {}),
      endpoint: resolveEndpoint(env),
      timeoutMs,
    });

    let combined;
    let status;
    let reason;
    let reading = null;
    let model = null;
    if (!answer.ok) {
      const cutByHook = answer.reason === "timeout" && timeoutMs < ownLimit;
      [combined, status, reason] = [fromWords(), "failed", cutByHook ? "deadline" : answer.reason];
    } else {
      model = answer.model;
      reading = readAnswers(answer.answers, { record: settings.record });
      if (reading) [combined, status, reason] = [combineRoute({ route, reading, text }), "used", null];
      else [combined, status, reason] = [fromWords(), "failed", "malformed"];
    }

    // A row is written only for a prompt that was sent. The test guard, a
    // refused address and a connection that could not be opened send nothing,
    // so they leave no row.
    if (settings.record && !["test_network_refused", "endpoint_refused", "network"].includes(answer.reason)) {
      try {
        appendRecord({
          dataDir: resolveDataDir(env),
          key: settings.key,
          now,
          row: {
            ts: now.toISOString(),
            repo: repositoryName(cwd),
            prompt_head: cut(text.replace(/\s+/g, " "), PROMPT_LIMITS.promptHeadCharacters),
            prompt_sha256: sha256(text),
            question_set: QUESTION_SET_VERSION,
            status,
            reason,
            model,
            latency_ms: answer.latencyMs,
            input_tokens: answer.ok ? answer.inputTokens : null,
            words: {
              mode: route.mode,
              design: wordsDesign(route),
              libraries: (route.archetypes ?? []).map(({ id }) => id),
            },
            jev: reading,
            decided: {
              design_shown: combined.design.shown,
              source: combined.design.source,
              guard: combined.design.guard,
              mode: combined.route.mode,
              question_budget: combined.route.question_budget,
            },
            lines: combined.lines.map(({ name }) => name),
          },
        });
      } catch {
        // The record is an aid. Failing to write it never changes the route.
      }
    }
    return result(combined, status, reason, {
      model,
      latencyMs: answer.latencyMs,
      newWork: status === "used" && jevSeesNewWork(reading),
    });
  } catch {
    return result(fromWords(), "failed", "internal_error");
  }
}

/**
 * Asks one 6.0.0-r2 or 6.5.0-r3 closed question. The input is a typed request or a
 * one-line activity summary, passed through safeSummary first. The result
 * always decides with the local answer (recorded-only); Jev's reading, when
 * one arrives, is written to the private record for comparison. Never throws.
 */
export async function askV6({ kind, summary, local, env = process.env, cwd = process.cwd(), now = new Date(), budgetMs, onlyWhenRecorded = false } = {}) {
  const done = (status, reason, reading = null, extra = {}) => ({ ...decideV6({ kind, local, reading }), status, reason, ...extra });
  try {
    if (!V6_KINDS.includes(kind)) return done("skipped", "unknown_kind");
    const state = safeSummary(summary);
    if (state === null) return done("skipped", "unsafe_summary");
    let settings;
    try {
      settings = loadSettings({ env });
    } catch {
      return done("skipped", "no_key");
    }
    if (settings.state !== "on") return done("skipped", settings.state);
    // A recorded-only answer that nobody would record is not worth a call.
    if (onlyWhenRecorded && !settings.record) return done("skipped", "record_off");
    const ownLimit = resolveTimeout(env);
    const timeoutMs = Number.isFinite(budgetMs) && budgetMs > 0 ? Math.min(ownLimit, Math.floor(budgetMs)) : ownLimit;
    const answer = await askJev({
      key: settings.key,
      state,
      questions: buildV6Questions(kind),
      ...(settings.model ? { model: settings.model } : {}),
      endpoint: resolveEndpoint(env),
      timeoutMs,
    });
    const reading = answer.ok ? readV6Answer(kind, answer.answers) : null;
    const outcome = done(reading ? "recorded" : "failed", reading ? null : answer.ok ? "malformed" : answer.reason, reading, { latencyMs: answer.latencyMs });
    if (settings.record && !["test_network_refused", "endpoint_refused", "network"].includes(answer.reason)) {
      try {
        appendRecord({
          dataDir: resolveDataDir(env),
          key: settings.key,
          now,
          row: {
            ts: now.toISOString(),
            repo: repositoryName(cwd),
            prompt_head: cut(state, PROMPT_LIMITS.promptHeadCharacters),
            prompt_sha256: sha256(state),
            question_set: V6_QUESTION_SET_VERSION,
            kind,
            status: outcome.status,
            reason: outcome.reason,
            model: answer.ok ? answer.model : null,
            latency_ms: answer.latencyMs,
            local: outcome.decided,
            jev: outcome.jev,
            agrees: outcome.agrees,
          },
        });
      } catch {
        // The record never changes the decision.
      }
    }
    return outcome;
  } catch {
    return done("failed", "internal_error");
  }
}
