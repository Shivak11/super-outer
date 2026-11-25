/**
 * The skill picker: which installed skills a typed request needs, as Jev sees it.
 *
 * This file is pure. It builds Jev's questions and reads Jev's answers; the
 * network call belongs to whoever runs it, such as src/jev/client.mjs in Node.
 *
 * The method is TypeSafe's skill-suggestion cookbook
 * (docs.typesafe.ai/cookbooks/skill_suggestion): a wide request ranks every
 * skill and asks whether any skill is needed, then a narrow request re-reads
 * the best few with their descriptions and asks whether each one fits. The
 * cookbook ranks 182 skills in one question and says a larger roster is split
 * into chunks, each ranked, with the same narrow step over the winners. One
 * request asks every chunk's question at once, because Jev answers the
 * questions of a request in parallel.
 */

export const PICKER = Object.freeze({
  // A ranking question holds this many skills; the cookbook's 182 fit comfortably.
  chunkSize: 150,
  // Each chunk's best two go on to the narrow request.
  perChunk: 2,
  // The wide request's description text per skill. The cookbook's index uses about 60
  // characters; at several hundred skills a longer text multiplies the input tokens.
  wideDescription: 80,
  // The narrow request reads this much of a skill's body, when the body is known.
  excerpt: 700,
  // The mean of the three gate questions below this means no skill is needed.
  gate: 0.3,
  // A skill whose fit is below this is not picked.
  fit: 0.3,
  // The best results in the author's trials came from combinations, so up to three skills are picked.
  maxPicks: 3,
  // Drafts shorter than this are not scored. A short follow-up such as "is it done?"
  // means nothing without the conversation around it, so it gets no pick.
  minChars: 8,
  minWords: 5,
});

/**
 * Skills that the owner's instructions and hooks require at set moments. They are
 * never hidden from Claude and never counted against Jev when Claude loads one.
 * Matched on the part of the name after any plugin prefix.
 */
export const ALWAYS_ALLOWED = Object.freeze([
  "task-observer",
  "super-outer",
  "outer",
  "wiki-capture",
  "wiki-update",
  "wiki-expertise",
  "wiki-ingest",
  "wiki-synthesize",
  "wiki-query",
  "artifact-design",
  "artifact-capabilities",
  "artifact-diagramming",
  "dataviz",
  "plugin-authoring",
  "workflow-authoring",
]);

// The cookbook's gate: does this request need a documented procedure at all?
export const GATE_QUESTIONS = Object.freeze({
  acts_on_user_system:
    "Is the assistant being asked to act on the user's files, accounts, devices, or online services, rather than only to explain or advise?",
  would_follow_documented_procedure:
    "Would a careful expert answering this consult a specific documented procedure or set of commands, rather than answering from general understanding?",
  prose_suffices:
    "Could a knowledgeable generalist fully satisfy this request in prose, with no tools, no documentation, and no access to the user's files or accounts?",
});
const INVERTED = new Set(["prose_suffices"]);

export const baseName = (name) => String(name ?? "").split(":").pop();
export const isAlwaysAllowed = (name) => ALWAYS_ALLOWED.includes(baseName(name));

const unquote = (value) => value.trim().replace(/^(['"])([\s\S]*)\1$/, "$2");

/**
 * Name, description and the start of the body from a SKILL.md, reading only as
 * much YAML as a skill header needs: an inline, quoted, folded or literal
 * description, continued on indented lines. Null when there is no header.
 */
export function parseSkillMd(text, fallbackName) {
  const match = String(text ?? "").match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;
  const lines = (match[1] ?? "").split(/\r?\n/);
  const field = (key) => {
    const at = lines.findIndex((line) => line.startsWith(`${key}:`));
    if (at === -1) return "";
    const head = (lines[at] ?? "").slice(key.length + 1).trim();
    const rest = [];
    for (const line of lines.slice(at + 1)) {
      if (!/^\s+\S/.test(line)) break;
      rest.push(line.trim());
    }
    const parts = /^[|>][-+]?$/.test(head) ? rest : [head, ...rest];
    return unquote(parts.join(" "));
  };
  return {
    name: field("name") || fallbackName,
    description: field("description"),
    body: (match[2] ?? "").trim().slice(0, PICKER.excerpt),
  };
}

/**
 * The skill names in Claude Code's skill listing, one `- name` or
 * `- name: description` line each. With many skills installed the listing
 * carries names alone, so descriptions come from elsewhere.
 */
export function parseListing(text) {
  const names = [];
  for (const line of String(text ?? "").split("\n")) {
    const entry = line.match(/^- (\S+?)(?::(?:\s|$)|\s*$|\s+\()/);
    if (entry?.[1]) names.push(entry[1].replace(/:$/, ""));
  }
  return names;
}

/**
 * The roster: every listed skill, with the best description known for it.
 * The listing decides which skills exist; `described` supplies descriptions and
 * bodies, matched on the full name first and then on the name after any prefix.
 * With no listing, the described skills are the roster.
 */
export function mergeRoster(described, listedNames = []) {
  const byName = new Map();
  for (const skill of described) {
    if (!byName.has(skill.name)) byName.set(skill.name, skill);
    if (!byName.has(baseName(skill.name))) byName.set(baseName(skill.name), skill);
  }
  if (listedNames.length === 0) return dedupe(described);
  return dedupe(
    listedNames.map((name) => {
      const found = byName.get(name) ?? byName.get(baseName(name));
      return { name, description: found?.description ?? "", body: found?.body ?? "" };
    }),
  );
}

function dedupe(skills) {
  const seen = new Set();
  return skills.filter((skill) => (seen.has(skill.name) ? false : (seen.add(skill.name), true)));
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const squash = (text) => String(text).toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Skills the person named in the request. A slash and a name count anywhere in
 * the text, as in "use /design-taste and /heroui-react". A bare name counts
 * only when it is hyphenated or carries a plugin prefix, so the word "design"
 * in a sentence does not name the skill called design.
 */
export function namedSkills(text, roster) {
  const words = String(text ?? "");
  const found = [];
  // A slashed word that matches no skill exactly may be a short form, as "/design-taste" for
  // design-taste-frontend or "/hero-ui" for heroui-react: it names the shortest skill whose
  // name, without hyphens, starts with it.
  const slashed = [...words.matchAll(/(?:^|[\s(`'"])\/([a-z0-9][a-z0-9:_-]{2,})/gi)].map((match) => match[1]);
  for (const skill of roster) {
    const names = new Set([skill.name, baseName(skill.name)]);
    for (const name of names) {
      const slashed = new RegExp(`(^|[\\s(\`'"])/${escape(name)}(?![\\w-])`, "i");
      const bare = new RegExp(`(^|[^\\w/-])${escape(name)}(?![\\w-])`, "i");
      const distinctive = name.includes("-") || name.includes(":");
      if (slashed.test(words) || (distinctive && bare.test(words))) {
        found.push(skill.name);
        break;
      }
    }
  }
  for (const word of slashed) {
    const key = squash(word);
    if (key.length < 4 || found.some((name) => squash(baseName(name)) === key || squash(name) === key)) continue;
    const candidates = roster
      .filter((skill) => squash(baseName(skill.name)).startsWith(key) || squash(skill.name).startsWith(key))
      .sort((a, b) => a.name.length - b.name.length);
    if (candidates[0] && !found.includes(candidates[0].name)) found.push(candidates[0].name);
  }
  return found;
}

export const chunksOf = (roster, size = PICKER.chunkSize) => {
  const chunks = [];
  for (let at = 0; at < roster.length; at += size) chunks.push(roster.slice(at, at + size));
  return chunks;
};

export const stateFor = (text) => ({ request: String(text ?? ""), recent_context: "" });

/** The wide request: one ranking question per chunk, and the gate. */
export function wideQuestions(roster) {
  const questions = {};
  chunksOf(roster).forEach((chunk, index) => {
    questions[`which::${index}`] = {
      type: "choice",
      instructions: "Which of these skills, if any, is the right one to load to help with the user's latest request?",
      criteria: Object.fromEntries(
        chunk.map((skill) => [skill.name, skill.description.slice(0, PICKER.wideDescription) || skill.name]),
      ),
    };
  });
  for (const [key, instructions] of Object.entries(GATE_QUESTIONS)) {
    questions[`gate::${key}`] = { type: "noul", instructions };
  }
  return questions;
}

export function gateOf(answers) {
  const values = Object.entries(answers ?? {})
    .filter(([key]) => key.startsWith("gate::"))
    .map(([key, answer]) => {
      const value = Number(answer?.noul ?? 0);
      return INVERTED.has(key.slice("gate::".length)) ? 1 - value : value;
    });
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Reads the wide answers. `ranked` holds every chunk's probabilities, best
 * first; probabilities from different chunks are not on one scale, so the
 * shortlist takes each chunk's best few rather than the best overall.
 */
export function readWide(answers, roster) {
  const chunks = chunksOf(roster);
  const ranked = [];
  const shortlist = [];
  chunks.forEach((chunk, index) => {
    const probabilities = answers?.[`which::${index}`]?.probabilities ?? {};
    const inChunk = chunk
      .map((skill) => ({ name: skill.name, probability: Number(probabilities[skill.name] ?? 0) }))
      .sort((a, b) => b.probability - a.probability);
    ranked.push(...inChunk);
    shortlist.push(...inChunk.slice(0, PICKER.perChunk).filter((entry) => entry.probability > 0));
  });
  ranked.sort((a, b) => b.probability - a.probability);
  return { gate: gateOf(answers), ranked: ranked.slice(0, 12), shortlist: shortlist.map((entry) => entry.name) };
}

/** The narrow request: one choice among the shortlist, and a fit question for each. */
export function narrowQuestions(shortlist, roster) {
  const byName = new Map(roster.map((skill) => [skill.name, skill]));
  const skills = shortlist.map((name) => byName.get(name)).filter(Boolean);
  const questions = {
    which: {
      type: "choice",
      instructions:
        "Which one of these skills is the best one to load for the user's latest request? Read what each actually does, not just its name.",
      criteria: Object.fromEntries(
        skills.map((skill) => [skill.name, `${skill.description}${skill.body ? ` — ${skill.body}` : ""}` || skill.name]),
      ),
    },
  };
  for (const skill of skills) {
    questions[`fits::${skill.name}`] = {
      type: "noul",
      instructions: `Does the skill '${skill.name}' do the specific thing the user's request asks for? It is described as: ${skill.description || skill.name}`,
    };
  }
  return questions;
}

/** The picks: every shortlisted skill whose fit clears the bar, best first, at most three. */
export function readNarrow(answers, shortlist) {
  const fits = Object.fromEntries(shortlist.map((name) => [name, Number(answers?.[`fits::${name}`]?.noul ?? 0)]));
  const picks = Object.entries(fits)
    .filter(([, value]) => value >= PICKER.fit)
    .sort((a, b) => b[1] - a[1])
    .slice(0, PICKER.maxPicks)
    .map(([name]) => name);
  return { fits, picks, choice: typeof answers?.which?.choice === "string" ? answers.which.choice : null };
}

/**
 * The whole pick, given a function that asks Jev one request and resolves its
 * answers, or null when Jev could not answer. A failure at any step returns
 * `ok: false`, and the caller carries on as if no picker were installed.
 */
export async function pickSkills(text, roster, ask) {
  const started = Date.now();
  // A skill the person named is always picked, ahead of Jev's own picks.
  const named = namedSkills(text, roster);
  const withNamed = (picks) => [...named, ...picks.filter((name) => !named.includes(name))];
  const empty = { ok: true, gate: 0, ranked: [], fits: {}, picks: named, named, ms: 0 };
  const trimmed = String(text ?? "").trim();
  if (roster.length === 0 || trimmed.length < PICKER.minChars || trimmed.split(/\s+/).length < PICKER.minWords) return empty;
  const state = stateFor(text);
  const wide = await ask(state, wideQuestions(roster));
  if (wide === null) return { ...empty, ok: false, ms: Date.now() - started };
  const { gate, ranked, shortlist } = readWide(wide, roster);
  if (gate < PICKER.gate || shortlist.length === 0) return { ...empty, gate, ranked, ms: Date.now() - started };
  const narrow = await ask(state, narrowQuestions(shortlist, roster));
  if (narrow === null) return { ...empty, ok: false, gate, ranked, ms: Date.now() - started };
  const { fits, picks } = readNarrow(narrow, shortlist);
  return { ok: true, gate, ranked, fits, picks: withNamed(picks), named, ms: Date.now() - started };
}

/** The one line a hook adds for Codex or Hermes, or null when there is no pick. */
export function suggestionLine(picks, roster) {
  if (picks.length === 0) return null;
  const byName = new Map(roster.map((skill) => [skill.name, skill]));
  const named = picks.map((name) => {
    const path = byName.get(name)?.path;
    return path ? `${name} (${path})` : name;
  });
  return `Jev suggests these skills for this request: ${named.join(", ")}. Load them if they fit what was asked; ignore them if they do not.`;
}
