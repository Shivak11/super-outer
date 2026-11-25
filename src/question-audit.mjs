/**
 * Mechanical audit of a drafted question, run at the router's render boundary.
 *
 * This is the borrowed STE-100 mechanism: the rules bind because they are
 * checked *separately from authorship*. "Reread it as a product leader" is the
 * same model reflecting on its own output in the same pass, and a pass that can
 * argue with itself is not a check. Code cannot argue.
 *
 * Two tiers, and the split matters more than either rule:
 *
 * - `blocking` findings are countable and near-zero false positive. A question
 *   that trips one is genuinely malformed, so dropping it loses nothing.
 * - `advisory` findings are heuristic. They travel with the question and never
 *   remove it, because a false positive here would delete a good question and
 *   replace it with an apology — exactly the silence v4.1 exists to prevent.
 */

export const QUESTION_LIMITS = Object.freeze({
  promptWords: 28,
  whyWords: 28,
  optionLabelWords: 9,
  consequenceWords: 20,
  // STE-100 caps chained nouns at three. A fourth content word with no function
  // word to break it up is where "the async-safe idempotent retry-queue
  // reconciliation policy" starts.
  nounRun: 3,
});

/**
 * Words that break a noun chain. Deliberately broad: over-listing here makes
 * the heuristic quieter, which is the safe direction for an advisory check.
 */
const FUNCTION_WORDS = new Set([
  "a","an","the","and","or","but","nor","so","yet","if","then","than","that",
  "this","these","those","there","here","when","where","while","because","as",
  "of","to","in","on","at","by","for","with","from","into","onto","over",
  "under","after","before","during","about","against","between","through",
  "up","down","out","off","again","once","any","some","no","not","only",
  "is","are","was","were","be","been","being","am","do","does","did","done",
  "have","has","had","having","can","could","may","might","must","shall",
  "should","will","would","let","lets",
  "i","you","he","she","it","we","they","them","us","him","her","its","their",
  "our","your","my","his","who","whom","whose","which","what","how","why",
  "people","someone","anyone","everyone","user","users",
  "see","show","keep","make","made","take","give","get","go","goes","come",
  "want","need","say","says","said","feel","look","looks","stay","stays",
  "more","most","less","least","many","much","few","other","another","same",
  "each","every","all","both","either","neither","one","two","three",
  "briefly","clearly","still","also","just","even","really","very","too",
]);

const words = (text) =>
  String(text ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

const wordCount = (text) => words(text).length;

const bare = (word) => word.replace(/[^a-z0-9-]/gi, "").toLowerCase();

/**
 * Longest run of consecutive content words. A hyphenated compound counts as one
 * word, which is deliberate: `retry-queue` is one noun, and it is the *run* of
 * such nouns that hurts readability.
 */
export function longestNounRun(text) {
  let longest = 0;
  let current = 0;
  for (const raw of words(text)) {
    const word = bare(raw);
    // Punctuation that ends a clause also ends a chain.
    const breaks = /[.,;:!?—–()]/.test(raw);
    if (!word || FUNCTION_WORDS.has(word)) {
      current = 0;
      continue;
    }
    current += 1;
    if (current > longest) longest = current;
    if (breaks) current = 0;
  }
  return longest;
}

const COMPOUND_PATTERNS = Object.freeze([
  /\band also\b/i,
  /\bas well as\b/i,
  /\badditionally\b/i,
  /\band whether\b/i,
  /\bplus whether\b/i,
]);

/**
 * One decision per question, mapped from STE-100's one instruction per
 * sentence. A consolidated interview already bundles decisions into one call;
 * this keeps each individual question from re-bundling them.
 */
function compoundFindings(prompt) {
  const findings = [];
  if ((String(prompt).match(/\?/g) ?? []).length > 1) {
    findings.push({ rule: "one_decision_per_question", detail: "two questions in one prompt" });
  }
  if (String(prompt).includes(";")) {
    findings.push({ rule: "one_decision_per_question", detail: "a semicolon joins two asks" });
  }
  if (COMPOUND_PATTERNS.some((pattern) => pattern.test(prompt))) {
    findings.push({ rule: "one_decision_per_question", detail: "two decisions joined in one prompt" });
  }
  return findings;
}

export function auditQuestion(question, limits = QUESTION_LIMITS) {
  const blocking = [];
  const advisory = [];
  const prompt = String(question?.prompt ?? "");
  const why = String(question?.why ?? "");
  const options = Array.isArray(question?.options) ? question.options : [];

  for (const finding of compoundFindings(prompt)) blocking.push(finding);

  if (wordCount(prompt) > limits.promptWords) {
    blocking.push({ rule: "question_too_long", detail: `${wordCount(prompt)} words` });
  }
  if (wordCount(why) > limits.whyWords) {
    blocking.push({ rule: "question_too_long", detail: `consequence is ${wordCount(why)} words` });
  }
  for (const option of options) {
    if (wordCount(option?.label) > limits.optionLabelWords) {
      blocking.push({ rule: "option_too_long", detail: `"${option.label}"` });
    }
    if (wordCount(option?.consequence) > limits.consequenceWords) {
      blocking.push({ rule: "option_too_long", detail: `consequence of "${option.label}"` });
    }
  }

  // Advisory only. Prefer verbs over stacked nouns, but never lose a question
  // over a heuristic that cannot tell a noun from an adjective.
  for (const [field, text] of [["question", prompt], ["consequence", why]]) {
    const run = longestNounRun(text);
    if (run > limits.nounRun) {
      advisory.push({ rule: "noun_cluster", detail: `${run} chained words in the ${field}` });
    }
  }
  for (const option of options) {
    const run = longestNounRun(option?.label);
    if (run > limits.nounRun) {
      advisory.push({ rule: "noun_cluster", detail: `${run} chained words in "${option.label}"` });
    }
  }

  return { blocking, advisory, usable: blocking.length === 0 };
}

/**
 * The disclosure is user-facing prose too. Holding questions to a length cap
 * while exempting our own sentence is the kind of inconsistency a reader
 * notices, so the same caps apply.
 */
export function auditDisclosure(text, limits = QUESTION_LIMITS) {
  return {
    blocking:
      wordCount(text) > limits.promptWords + limits.whyWords
        ? [{ rule: "disclosure_too_long", detail: `${wordCount(text)} words` }]
        : [],
  };
}
