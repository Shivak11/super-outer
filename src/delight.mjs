/**
 * The parts of Super-outer that are pleasant to meet.
 *
 * One rule holds the whole file together: **delight must be earned.** A line
 * that appears every time carries no information and becomes wallpaper within a
 * week — exactly what happened to the advisory notice this release removed. So
 * every line here is tied to something that actually happened, and the caller
 * shows each at most once per session.
 *
 * Tone: warm and dry. A senior colleague who likes their job. It has to read
 * well to a tired developer at 2am, and it has to age.
 */

const plural = (count, one, many) => (count === 1 ? one : many);

/**
 * The scoreboard. Suppression is Super-outer's cleverest behaviour and nobody
 * has ever seen it happen — it silently drops questions the repository already
 * answers. Saying so is the best delight-per-word in the system: it proves the
 * tool read your code, and it respects the reader's time.
 */
export function scoreboard({ settled = 0, asked = 0 } = {}) {
  if (settled === 0 && asked === 0) return "";
  if (settled === 0) {
    return `🔍 ${asked} ${plural(asked, "question", "questions")} for you.`;
  }
  if (asked === 0) {
    return `🔍 Checked ${settled} ${plural(settled, "thing", "things")} your code already handles. Nothing needs you.`;
  }
  return `🔍 Checked ${settled} ${plural(settled, "thing", "things")} your code already handles. ${asked} ${plural(asked, "needs", "need")} you.`;
}

/**
 * Milestones celebrate *proof*, not activity — the belief the whole tool is
 * built on. Each fires only on a real transition, never on a timer.
 */
export const MILESTONES = Object.freeze({
  first_proof: ({ decision } = {}) =>
    `🎉 First proof recorded. "${decision}" is no longer an opinion — a test says so, and it will keep saying so.`,
  ledger_woke: ({ item, since } = {}) =>
    `🔔 Remember this? You deferred ${item}${since ? ` in ${since}` : ""} until a condition came true. It just did.`,
  nothing_to_ask: () =>
    `✅ Nothing needed you this time — your own code had already answered everything.`,
  proof_rotted: ({ count } = {}) =>
    `🧭 ${count} ${plural(count, "proof has", "proofs have")} gone stale. The test that vouched for it changed.`,
  all_proved: ({ count } = {}) =>
    `🟢 All ${count} recorded ${plural(count, "decision has", "decisions have")} a live test behind ${plural(count, "it", "them")}.`,
});

export function milestone(name, context = {}) {
  const render = MILESTONES[name];
  return render ? render(context) : "";
}

/**
 * An opener earns trust in one line: it shows the tool recognised the kind of
 * work before being told. Archetypes supply their own; this is the fallback.
 */
export function opener(archetype) {
  if (!archetype) return "";
  if (archetype.opener) return archetype.opener;
  const count = archetype.failureModes?.length ?? 0;
  if (!count) return "";
  return `🧭 ${archetype.name} — I know this one. Let me check which of its ${count} usual problems you have already handled.`;
}

/**
 * Facts are curated and verifiable, never generated.
 *
 * A tool whose entire purpose is "claim only what is proven" must not invent a
 * statistic to be charming. Each line is written and checked by hand alongside
 * the failure mode it belongs to, and travels with it — so it is relevant,
 * which is what makes it land rather than interrupt.
 */
export function factFor(failureMode) {
  const fact = failureMode?.fact;
  return fact ? `💡 While we're here: ${fact}` : "";
}

/**
 * Everything above is earned. This is the gate that keeps it that way: a line
 * is shown once per session per key, and never at all when nothing happened.
 */
export function earnedOnce(shown, key, line) {
  if (!line || shown.has(key)) return "";
  shown.add(key);
  return line;
}

export const delightPolicy = Object.freeze({
  earnedOnly: true,
  oncePerSession: true,
  generatedFacts: false,
  tone: "warm-and-dry",
});
