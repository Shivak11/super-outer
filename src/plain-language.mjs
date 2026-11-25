import {
  ARCHETYPE_QUESTION_BUDGET,
  DECISION_KINDS,
  QUESTION_BUDGETS,
  QUESTION_FLOORS,
  REVIEW_MODES,
} from "./constants.mjs";
import { auditQuestion, auditDisclosure } from "./question-audit.mjs";

const TECHNICAL_SELECTION_PATTERN =
  /\b(?:framework|library|vendor|sdk|queue|cache|database (?:engine|mechanism)|animation primitive|tracing (?:tool|vendor|provider)|code shape|message broker|react|vue|angular|postgres(?:ql)?|mysql|redis|kafka|rabbitmq|datadog|sentry|jwt|json web token|opaque session token|oauth(?: 2(?:\.0)?)?(?: grant)?|oidc|saml|jwe|jws|(?:rs|hs|es)\d{3,4}|eddsa|argon2|bcrypt|scrypt|pbkdf2)\b/i;

// These terms are valid in the evidence layer, but not in a question or
// consequence shown to the user. Rejecting them here forces the router to
// translate mechanisms into behavior, risk, recovery, cost, or confidence.
const USER_FACING_JARGON_PATTERN =
  /\b(?:idempotenc(?:e|y)|mutex|semaphore|race condition|eventual consistency|transaction isolation|schema migration|backfill|p\d{2}|fan-?out|message broker|cache invalidation|retry budget|circuit breaker|dead[- ]letter queue|observability|telemetry|distributed trace|worktree|merge base|sha(?:-?256)?|content hash|orm|serialization|deserialization|hydration|memoization|dependency injection|container orchestration|kubernetes|terraform|jwt|json web token|oauth(?: 2(?:\.0)?)?(?: grant)?|oidc|saml|jwe|jws|(?:rs|hs|es)\d{3,4}|eddsa)\b/i;

const normaliseKey = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const asArray = (value) => (Array.isArray(value) ? value : []);

function flattenDecisions(findings) {
  const decisions = [];
  for (const finding of asArray(findings)) {
    if (finding?.questions || finding?.askUser || finding?.interview) {
      throw new Error(
        "Specialists cannot interview the user directly; return decisions to the router",
      );
    }
    for (const decision of asArray(finding?.decisions)) {
      // Advanced callers may attach router-decision fields to a decision. Plain
      // schema decisions containing only a statement remain evidence, not a
      // user question.
      if (decision.prompt || decision.options) {
        decisions.push({ ...decision, specialistId: finding.specialistId });
      }
    }
    for (const [index, proposal] of asArray(
      finding?.proposed_questions,
    ).entries()) {
      const options = asArray(proposal.options).map((option) => {
        const text = String(option);
        const split = text.match(/^(.+?)\s+(?:—|-)\s+(.+)$/);
        return split
          ? { label: split[1].trim(), consequence: split[2].trim() }
          : { label: text, consequence: text };
      });
      decisions.push({
        id: `${finding.module ?? finding.specialistId ?? "specialist"}-${index}`,
        kind: "interpretive",
        topic: proposal.question,
        prompt: proposal.question,
        why: proposal.why,
        options,
        recommended: options[proposal.recommended]?.label,
        priority: proposal.priority ?? 0,
        specialistId: finding.module ?? finding.specialistId,
      });
    }
  }
  return decisions;
}

function normaliseOption(option) {
  if (typeof option === "string") {
    return { label: option, consequence: "" };
  }
  return {
    label: String(option?.label ?? "").trim(),
    consequence: String(option?.consequence ?? "").trim(),
  };
}

function assessDecision(decision) {
  if (!DECISION_KINDS.includes(decision.kind)) {
    return { usable: false, reason: "unknown_decision_kind" };
  }
  if (decision.kind === "invariant") {
    return { usable: false, reason: "invariant_applied_without_question" };
  }
  if (decision.resolved === true || decision.needsUserDecision === false) {
    return { usable: false, reason: "already_resolved" };
  }

  const prompt = String(decision.prompt ?? "").trim();
  const topic = String(decision.topic ?? decision.id ?? "").trim();
  const why = String(decision.why ?? "").trim();
  const options = asArray(decision.options).map(normaliseOption);
  const recommended = String(decision.recommended ?? "").trim();
  const technicalChoiceText = [
    prompt,
    topic,
    ...options.map(({ label }) => label),
  ].join(" ");
  const userFacingText = [
    prompt,
    why,
    ...options.flatMap(({ label, consequence }) => [label, consequence]),
  ].join(" ");

  if (TECHNICAL_SELECTION_PATTERN.test(technicalChoiceText)) {
    return { usable: false, reason: "technical_implementation_choice" };
  }
  if (decision.implementationChoice === true) {
    return { usable: false, reason: "technical_implementation_choice" };
  }
  if (USER_FACING_JARGON_PATTERN.test(userFacingText)) {
    return { usable: false, reason: "developer_jargon_not_translated" };
  }
  if (!prompt || !why) {
    return { usable: false, reason: "missing_plain_language_context" };
  }
  if (
    options.length < 2 ||
    options.length > 3 ||
    options.some(({ label, consequence }) => !label || !consequence)
  ) {
    return { usable: false, reason: "missing_options_or_consequences" };
  }
  if (!recommended || !options.some(({ label }) => label === recommended)) {
    return { usable: false, reason: "missing_recommended_default" };
  }
  if (decision.kind === "evidence_tradeoff" && decision.researched !== true) {
    return { usable: false, reason: "tradeoff_not_researched" };
  }

  // The mechanical audit runs last, on the assembled question rather than on
  // the raw decision, because it checks the text the user would actually read.
  const audit = auditQuestion({ prompt, why, options });
  if (!audit.usable) {
    return { usable: false, reason: audit.blocking[0].rule, detail: audit.blocking[0].detail };
  }

  return {
    usable: true,
    question: {
      id: String(decision.id ?? normaliseKey(topic)).trim(),
      kind: decision.kind,
      topic,
      prompt,
      why,
      options,
      recommended,
      // Advisories travel with the question instead of removing it. A heuristic
      // that deleted a good question would reintroduce the silence v4.1 fixed.
      advisory: audit.advisory,
      priority: Number.isFinite(decision.priority) ? decision.priority : 0,
    },
  };
}

function deduplicate(questions) {
  const byTopic = new Map();
  for (const question of questions) {
    const key = normaliseKey(question.topic || question.prompt);
    const current = byTopic.get(key);
    if (!current || question.priority > current.priority) {
      byTopic.set(key, question);
    }
  }
  return [...byTopic.values()];
}

export function questionBudgetFor(mode) {
  if (!REVIEW_MODES.includes(mode)) {
    throw new Error(`Unknown review mode: ${mode}`);
  }
  return QUESTION_BUDGETS[mode];
}

export function questionFloorFor(mode) {
  if (!REVIEW_MODES.includes(mode)) {
    throw new Error(`Unknown review mode: ${mode}`);
  }
  return QUESTION_FLOORS[mode];
}

// Rejection reasons are evidence-layer vocabulary. The disclosure is shown to
// the owner, so it has to survive the same translation rule every question does.
const OMISSION_IN_PLAIN_ENGLISH = Object.freeze({
  developer_jargon_not_translated:
    "one was written in developer vocabulary and could not be translated in time",
  technical_implementation_choice:
    "one asked you to pick a mechanism, which is mine to choose",
  missing_options_or_consequences:
    "one arrived without real alternatives to weigh",
  missing_recommended_default: "one arrived without a safe recommendation",
  missing_plain_language_context: "one arrived without a stated consequence",
  tradeoff_not_researched: "one was not researched before being raised",
  already_resolved: "one was already settled by evidence",
  invariant_applied_without_question:
    "one is a rule I applied rather than a choice",
  unknown_decision_kind: "one arrived in a shape I could not read",
  question_budget: "one was held back to keep this short",
  one_decision_per_question: "one bundled two separate decisions together",
  question_too_long: "one ran too long to read at a glance",
  option_too_long: "one had choices too long to compare quickly",
});

/**
 * The floor's second branch. Zero questions stays a valid outcome; an
 * unexplained zero does not.
 */
function buildDisclosure({ mode, omitted, considered }) {
  if (questionFloorFor(mode) === 0) return null;

  // Nothing was weighed against the code here, so claiming the code answered
  // everything would be a statement nobody checked.
  if (considered === 0) {
    return "✅ Nothing needed you this time.";
  }

  const reasons = [
    ...new Set(
      omitted
        .map(({ reason }) => OMISSION_IN_PLAIN_ENGLISH[reason])
        .filter(Boolean),
    ),
  ];

  if (reasons.length === 0) {
    return "✅ Nothing needed you this time.";
  }

  // Held to the same caps the questions are. Listing every reason would make
  // this longer than anything it is apologising for, and a tool that exempts
  // its own prose from its own rule is not worth trusting on the rule.
  const shown = reasons.slice(0, 2);
  const rest = reasons.length - shown.length;
  const tail = rest > 0 ? `, and ${rest} more` : "";
  const disclosure = `💡 Nothing reached you: ${shown.join("; ")}${tail}. Say so if you wanted that call.`;

  if (auditDisclosure(disclosure).blocking.length > 0) {
    return "💡 Nothing reached you — a few candidates were too unclear to ask. Say so if you wanted that call.";
  }
  return disclosure;
}

/**
 * Specialists supply unresolved decision records. Only this router-owned
 * boundary turns them into user questions.
 */
export function consolidateQuestions({ route, findings = [] }) {
  if (
    !route ||
    (!route.schema_version && route.interviewer !== "router") ||
    (route.schema_version && !Array.isArray(route.selected_modules))
  ) {
    throw new Error("A router decision is required to build an interview");
  }
  // The tier budget is a hard ceiling, except on a route that matched an
  // archetype: the router raises that allowance to anticipate the archetype's
  // questions, and capping it back at the tier would silently drop them.
  const ceiling = questionCeilingFor(route);
  const routeBudget = route.question_budget ?? route.questionBudget;
  const budget = Number.isFinite(routeBudget)
    ? Math.min(Math.max(0, routeBudget), ceiling)
    : ceiling;
  const omitted = [];
  const usable = [];

  for (const decision of flattenDecisions(findings)) {
    const assessed = assessDecision(decision);
    if (assessed.usable) usable.push(assessed.question);
    else {
      omitted.push({
        id: decision.id ?? null,
        reason: assessed.reason,
        ...(assessed.detail ? { detail: assessed.detail } : {}),
      });
    }
  }

  const ranked = deduplicate(usable).sort(
    (left, right) =>
      right.priority - left.priority || left.id.localeCompare(right.id),
  );
  const questions = ranked.slice(0, budget).map(({ priority, ...question }) => question);
  for (const question of ranked.slice(budget)) {
    omitted.push({ id: question.id, reason: "question_budget" });
  }

  const floor = questionFloorFor(route.mode);
  const disclosure =
    questions.length > 0
      ? null
      : buildDisclosure({
          mode: route.mode,
          omitted,
          considered: usable.length + omitted.length,
        });

  // Advisories are evidence-layer notes for the router to act on when it
  // rewrites, never text shown to the user.
  const advisories = questions.flatMap((question) =>
    (question.advisory ?? []).map((finding) => ({ id: question.id, ...finding })),
  );

  return {
    interviewer: "router",
    mode: route.mode,
    questionBudget: budget,
    questionCeiling: ceiling,
    advisories,
    floor,
    // A floored mode must account for itself one way or the other. Silence is
    // only legitimate where the floor is zero.
    floorSatisfiedBy:
      questions.length > 0 ? "question" : disclosure ? "disclosure" : "none",
    disclosure,
    interviewCount: questions.length > 0 ? 1 : 0,
    questions,
    omitted,
  };
}

function questionCeilingFor(route) {
  const tier = questionBudgetFor(route.mode);
  const matchedArchetype = Array.isArray(route.archetypes) && route.archetypes.length > 0;
  return matchedArchetype && tier > 0 ? Math.max(tier, ARCHETYPE_QUESTION_BUDGET) : tier;
}

export function assertQuestionBudget(interview) {
  const allowed = interview.questionCeiling ?? questionBudgetFor(interview.mode);
  if (interview.questions.length > allowed) {
    throw new Error(
      `${interview.mode} allows ${allowed} questions, received ${interview.questions.length}`,
    );
  }
  if (interview.interviewCount > 1) {
    throw new Error("Questions must be presented in one consolidated interview");
  }
  if (
    interview.questions.length === 0 &&
    questionFloorFor(interview.mode) > 0 &&
    !interview.disclosure
  ) {
    throw new Error(
      `${interview.mode} requires a question or a plain disclosure, received neither`,
    );
  }
  return interview;
}

export function renderConsolidatedInterview(interview) {
  assertQuestionBudget(interview);
  if (interview.questions.length === 0) {
    return interview.disclosure ?? "";
  }

  const heading =
    interview.mode === "CRITICAL"
      ? "Before this protected change, I need your judgement on:"
      : "I need your judgement on:";
  const blocks = interview.questions.map((question, index) => {
    const options = question.options
      .map(
        (option) =>
          `   - ${option.label}: ${option.consequence}${
            option.label === question.recommended ? " (Recommended)" : ""
          }`,
      )
      .join("\n");
    return `${index + 1}. ${question.prompt}\n   Why it matters: ${question.why}\n${options}`;
  });
  return `${heading}\n\n${blocks.join("\n\n")}`;
}

export const plainLanguagePolicy = Object.freeze({
  interviewer: "router",
  budgets: QUESTION_BUDGETS,
  prohibitedTechnicalSelectionPattern: TECHNICAL_SELECTION_PATTERN,
  prohibitedUserFacingJargonPattern: USER_FACING_JARGON_PATTERN,
});
