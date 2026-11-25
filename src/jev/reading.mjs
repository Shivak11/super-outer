// Adapted from Super-outer Experimental's jev-route-check (scripts/route-check.mjs, readAnswers).
/**
 * Reads Jev's raw answers into one plain record after checking each answer.
 *
 * Whatever a response holds may reach the private record, so only the
 * expected answers are read, and only as plain numbers and the depth's name.
 * A missing or invalid answer rejects the whole set, and the route then comes
 * from the word lists alone.
 */

import { AREAS, DEPTHS, DESIGN_KEYS, DOMAINS, LIBRARIES, V6_DIAGRAM_KINDS, V6_DIMENSIONS, areaKey, diagramKey, domainKey, libraryKey, v6Key } from "./questions.mjs";

const probability = (value) => (typeof value === "number" && value >= 0 && value <= 1 ? value : null);

export function readAnswers(raw, { record = false } = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const answer = (key) => {
    const value = Object.hasOwn(raw, key) ? raw[key] : null;
    return value && typeof value === "object" ? value : null;
  };
  const yesOrNo = (key) => probability(answer(key)?.noul);
  const everyOne = (ids, keyOf) => {
    const readings = {};
    for (const id of ids) {
      const reading = yesOrNo(keyOf(id));
      if (reading === null) return null;
      readings[id] = reading;
    }
    return readings;
  };

  const design = everyOne(DESIGN_KEYS, (key) => key);
  if (!design) return null;
  const protectedReading = yesOrNo("protected");
  if (protectedReading === null) return null;
  const depth = answer("depth");
  if (!depth || !DEPTHS.includes(depth.choice)) return null;
  const confidence = probability(depth.confidence);
  if (confidence === null) return null;
  const libraries = everyOne(LIBRARIES.map(([id]) => id), libraryKey);
  if (!libraries) return null;

  const reading = { design, protected: protectedReading, depth: { choice: depth.choice, confidence }, libraries };
  if (!record) return reading;

  const maintenance = yesOrNo("maintenance");
  if (maintenance === null) return null;
  const areas = everyOne(AREAS.map(({ id }) => id), areaKey);
  if (!areas) return null;
  const domains = everyOne(DOMAINS.map(([id]) => id), domainKey);
  if (!domains) return null;
  return { ...reading, maintenance, areas, domains };
}

const V6_COUNTS = Object.freeze({ NONE: 0, TWO: 2, FOUR: 4, SIX: 6 });

/** Reads one 6.5.0-r3 answer set. Any invalid value rejects the set (null). */
export function readV6Answer(kind, raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const get = (key) => (Object.hasOwn(raw, key) && raw[key] && typeof raw[key] === "object" ? raw[key] : null);
  const yes = (key) => probability(get(key)?.noul);
  if (kind === "suggestion_real") {
    const real = yes("v6_suggestion_real");
    return real === null ? null : { real };
  }
  if (kind === "dimensions") {
    const dimensions = {};
    for (const id of V6_DIMENSIONS) {
      const value = yes(v6Key(`dim_${id}`));
      if (value === null) return null;
      dimensions[id] = value;
    }
    return { dimensions };
  }
  if (kind === "agents") {
    const count = get("v6_agent_count")?.choice;
    const reviewer = get("v6_reviewer_model")?.choice;
    if (!Object.hasOwn(V6_COUNTS, count) || !["sonnet", "opus"].includes(reviewer)) return null;
    return { count: V6_COUNTS[count], reviewerModel: reviewer };
  }
  if (kind === "diagram-kinds") {
    const kinds = {};
    for (const id of V6_DIAGRAM_KINDS) {
      const value = yes(diagramKey(id));
      if (value === null) return null;
      kinds[id] = value;
    }
    return { kinds };
  }
  if (kind === "scope_change" || kind === "owner_correction") {
    const value = yes(`v6_${kind}`);
    return value === null ? null : { yes: value };
  }
  if (kind === "sweep_order") {
    const first = get("v6_sweep_first")?.choice;
    return V6_DIMENSIONS.includes(first) ? { first } : null;
  }
  return null;
}
