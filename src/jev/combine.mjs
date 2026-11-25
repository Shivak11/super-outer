// The library, protected and depth lines are adapted from Super-outer Experimental's jev-route-check (scripts/route-check.mjs, compare and buildLine).
/**
 * The combining rule: how Jev's reading and the word router's route become the
 * one route the session is given.
 *
 * The hook, the tests and the care comparison all import this module, so no
 * script keeps a second copy of the rule.
 *
 * - Jev decides the design line in both directions, as the study froze it:
 *   the line appears when surface_made is 0.5 or more and the other four
 *   design answers are each below 0.5. One guard is added: Jev reads
 *   "rebuild" literally, so a routine rebuild such as "rebuild the app" sets
 *   Jev's "yes" aside, as 5.7.0 does.
 * - A "yes" also brings what the word router gives a new feature: the product
 *   UI specialist, the new-feature change shape with the Safe Activation
 *   question, and a depth floor of FOCUSED. These only add care. The floor
 *   never touches SMALL_SAFE or CRITICAL and never replaces a higher floor.
 * - A "no" hides the line and changes nothing else.
 * - The word lists alone decide the libraries. Jev may add lines that ask for
 *   more care, and never changes the route through them.
 * - Jev never decides a SMALL_SAFE route. The hook does not ask Jev about one,
 *   and a reading passed with one is not used.
 */

import { ACTIVATION_SHAPES, applyDepthFloor, isRoutineRebuildOnly } from "../change-shape.mjs";
import { ARCHETYPE_QUESTION_BUDGET, QUESTION_BUDGETS } from "../constants.mjs";
import { DEPTHS } from "./questions.mjs";

export const DESIGN_SHAPES = Object.freeze(["new_feature", "major_overhaul", "replacement", "coordinated_cross_system_change"]);

/** Every number the rule decides with, in one place. */
export const LIMITS = Object.freeze({
  designAtLeast: 0.5,
  libraryFalseMatchAtOrBelow: 0.2,
  protectedAtOrAbove: 0.8,
  depthConfidenceAtOrAbove: 0.8,
  depthSteps: 2,
});

/**
 * Which of the two care lines are shown. Either ships switched off in 5.8.0
 * if the live run finds it would appear on more than 5 of the 105 calm
 * sentences.
 */
export const CARE_LINES = Object.freeze({ protected: true, depth: true });

const DESIGN_SPECIALIST = "product-ui-ux-motion";
const DESIGN_FLOOR = "FOCUSED";

/** True when Jev's five design answers show the design line. */
export function jevDesign(reading) {
  const design = reading?.design;
  if (!design) return false;
  return (
    design.surface_made >= LIMITS.designAtLeast &&
    design.small_adjustment < LIMITS.designAtLeast &&
    design.screens_unchanged < LIMITS.designAtLeast &&
    design.developer_artefact < LIMITS.designAtLeast &&
    design.code_only < LIMITS.designAtLeast
  );
}

/**
 * True when Jev's existing answers say a request starts new work: a depth of
 * FULL or CRITICAL read with confidence of at least 0.5, while the request is
 * neither a small adjustment nor a change to code alone. The prompt hook uses
 * it to point new work without a product brief at the story walk. It may only
 * add that line, never remove one the word lists give. The rule was frozen with
 * its held-out set on 2026-10-12 (tests/fixtures/jev/new-work-heldout.json),
 * before Jev saw any of the forty requests.
 */
export function jevSeesNewWork(reading) {
  const depth = reading?.depth;
  const design = reading?.design;
  if (!depth || !design) return false;
  return (
    ["FULL", "CRITICAL"].includes(depth.choice) &&
    depth.confidence >= 0.5 &&
    design.small_adjustment < LIMITS.designAtLeast &&
    design.code_only < LIMITS.designAtLeast
  );
}

/** True when the word router's route shows the design line, as in 5.7.0. */
export function wordsDesign(route) {
  return Boolean(
    Array.isArray(route?.selected_modules) &&
      route.selected_modules.includes(DESIGN_SPECIALIST) &&
      DESIGN_SHAPES.includes(route?.change_shape?.shape),
  );
}

const budgetFor = (mode, archetypes) =>
  archetypes.length > 0 && mode !== "SMALL_SAFE"
    ? Math.max(QUESTION_BUDGETS[mode], ARCHETYPE_QUESTION_BUDGET)
    : QUESTION_BUDGETS[mode];

/** What the word router gives a new feature, added to a copy of the route. */
function withDesign(route) {
  const next = structuredClone(route);
  if (!Array.isArray(next.selected_modules)) next.selected_modules = [];
  if (!next.scores || typeof next.scores !== "object") next.scores = {};
  if (!next.selected_modules.includes(DESIGN_SPECIALIST)) next.selected_modules.push(DESIGN_SPECIALIST);
  if (!Object.hasOwn(next.scores, DESIGN_SPECIALIST)) {
    next.scores[DESIGN_SPECIALIST] = { score: 0, reasons: ["inferred:jev_design"] };
  }
  next.signals = [...new Set([...(next.signals ?? []), "surface:visibleProduct", "jev:design"])].sort();
  if (!Object.hasOwn(ACTIVATION_SHAPES, next.change_shape?.shape ?? "")) {
    next.change_shape = {
      shape: "new_feature",
      activation: true,
      depth_floor: DESIGN_FLOOR,
      reasons: [...(route.change_shape?.reasons ?? []), "jev_design"],
    };
  }
  next.mode = applyDepthFloor(route.mode, DESIGN_FLOOR);
  next.material = next.mode !== "SMALL_SAFE";
  next.question_budget = budgetFor(next.mode, next.archetypes ?? []);
  return next;
}

/** Lines that ask for more care. They never change the route. */
function linesFor(route, reading, enabled) {
  const lines = [];
  const mode = route.mode;
  const critical = mode === "CRITICAL";
  if (!critical) {
    for (const archetype of route.archetypes ?? []) {
      const libraryReading = reading.libraries?.[archetype.id];
      if (typeof libraryReading !== "number" || libraryReading > LIMITS.libraryFalseMatchAtOrBelow) continue;
      const words = (archetype.matchedOn ?? []).map((matched) => `"${matched}"`).join(", ");
      lines.push({
        name: "library_false_match",
        text: [
          `Jev reads the ${archetype.name} checklist as a likely false match for this request (${libraryReading.toFixed(2)}).`,
          ...(words ? [`The word lists matched it on ${words}.`] : []),
          "The request is read before any question is spent on it.",
        ].join(" "),
      });
    }
  }
  if (enabled.protected && !critical && reading.protected >= LIMITS.protectedAtOrAbove) {
    lines.push({
      name: "protected_missed",
      text: `Jev reads this request as touching payments, sign-in or secrets, production delivery, stored data that cannot be restored, or git history (${reading.protected.toFixed(2)}), and the route is ${mode}. That boundary is checked before any change.`,
    });
  }
  const steps = DEPTHS.indexOf(reading.depth.choice) - DEPTHS.indexOf(mode);
  if (enabled.depth && reading.depth.confidence >= LIMITS.depthConfidenceAtOrAbove && steps >= LIMITS.depthSteps) {
    lines.push({
      name: "depth_higher",
      text: `Jev reads this request as needing ${reading.depth.choice} review (confidence ${reading.depth.confidence.toFixed(2)}), above the ${mode} route. Super-outer weighs whether the work needs more review than the route gives it before any change.`,
    });
  }
  return lines;
}

/**
 * Returns { route, design: { shown, source, jev, words, guard }, lines }.
 * The route passed in is never changed; the result holds a copy.
 */
export function combineRoute({ route, reading = null, text = "", careLines: enabled = CARE_LINES } = {}) {
  const words = wordsDesign(route);
  const fromWords = () => ({
    route: route && typeof route === "object" ? structuredClone(route) : route,
    design: { shown: words, source: "words", jev: null, words, guard: false },
    lines: [],
  });
  if (!reading || !route || typeof route !== "object" || route.mode === "SMALL_SAFE") return fromWords();

  const guard = isRoutineRebuildOnly(text);
  const jev = jevDesign(reading);
  const shown = jev && !guard;
  const combined = shown ? withDesign(route) : structuredClone(route);
  return {
    route: combined,
    design: { shown, source: "jev", jev, words, guard },
    lines: linesFor(combined, reading, { ...CARE_LINES, ...enabled }),
  };
}

/**
 * A diagram-kinds reading decides only when every kind is answered with at
 * least this probability one way or the other.
 */
export const DIAGRAM_CONFIDENCE = 0.8;

/** The kinds Jev chose, or null when any answer sits between the thresholds. */
function confidentDiagramKinds(reading) {
  const kinds = reading?.kinds;
  if (!kinds || typeof kinds !== "object") return null;
  const values = Object.entries(kinds);
  if (values.some(([, p]) => p > 1 - DIAGRAM_CONFIDENCE && p < DIAGRAM_CONFIDENCE)) return null;
  // One-problem is drawn only when the person asks, never from a reading.
  return values.filter(([id, p]) => p >= DIAGRAM_CONFIDENCE && id !== "one-problem").map(([id]) => id);
}

/**
 * 6.0.0-r2 and 6.5.0-r3 decisions are recorded only: the local answer decides, and Jev's
 * reading is kept beside it with a flag saying whether the two agree. The
 * exception is diagram-kinds (plan section 12): a confident Jev answer
 * decides, and when neither the local plan nor Jev is clear the result asks
 * the owner one question ({ ask: true }).
 */
export function decideV6({ kind, local, reading = null } = {}) {
  if (kind === "diagram-kinds") {
    const jev = reading ? confidentDiagramKinds(reading) : null;
    const localKinds = Array.isArray(local) ? [...local].sort() : null;
    const agrees = Boolean(jev && localKinds) && JSON.stringify([...jev].sort()) === JSON.stringify(localKinds);
    if (jev) return { decided: jev, source: "jev", recordedOnly: false, jev, agrees };
    if (!localKinds) return { decided: null, source: "none", recordedOnly: false, jev: null, agrees: false, ask: true };
    return { decided: local, source: "local", recordedOnly: true, jev: null, agrees: false };
  }
  let jev = null;
  if (reading) {
    if (kind === "suggestion_real") jev = reading.real >= 0.5;
    else if (kind === "dimensions") jev = Object.keys(reading.dimensions ?? {}).filter((id) => reading.dimensions[id] >= 0.5).sort();
    else if (kind === "agents") jev = reading.count;
    else if (kind === "sweep_order") jev = reading.first;
    else if (kind === "scope_change" || kind === "owner_correction") jev = reading.yes >= 0.5;
  }
  const comparable = (value) => {
    if (kind === "dimensions" && Array.isArray(value)) return JSON.stringify([...value].sort());
    if (kind === "agents" && value && typeof value === "object") return JSON.stringify(Array.isArray(value.agents) ? value.agents.length : value.count ?? null);
    if (kind === "sweep_order" && Array.isArray(value)) return JSON.stringify(value[0] ?? null);
    return JSON.stringify(value ?? null);
  };
  return { decided: local, source: "local", recordedOnly: true, jev, agrees: reading ? comparable(local) === comparable(jev) : false };
}
