/**
 * The prompt hook's time plan, from 5.20.1.
 *
 * The host discards everything a prompt hook printed when the hook passes its
 * time limit, so a route that is late is lost whole. Measured on 16 October
 * 2026, the hook's steps each have a limit of their own (Jev 2.5 s, the agent
 * checklist search 1.5 s, the ledger search 0.8 s), but nothing watched their
 * sum. Under load the process also starts late: up to 0.6 s passed before the
 * hook's first line ran with sixteen sessions starting at once, against 20 ms
 * at rest. A planning prompt in a repository with a task record took 5.7 s
 * with no extra load at all.
 *
 * So the optional steps share one deadline, counted from the moment the
 * process launched (performance.now() starts there). Each step is given what
 * is left after keeping a reserve for the steps behind it, up to its own
 * limit, and is skipped when less than its floor is left. The word route needs
 * none of these steps, so it is always delivered. The deadline leaves the
 * host's limit of 10 s room for a start that the process itself cannot see.
 */

export const PROMPT_DEADLINE_MS = 4000;

/** Jev answered in 0.6 to 1.2 s in the measurements; below this a call is not worth sending. */
export const JEV_FLOOR_MS = 300;

/** Kept back from Jev for building the output and the two searches behind it. */
export const AFTER_JEV_RESERVE_MS = 300;

/** Starting `git grep` costs about 40 ms at rest; below this a search cannot finish. */
export const SEARCH_FLOOR_MS = 100;

/** Kept back from each search for writing the output. */
export const AFTER_SEARCH_RESERVE_MS = 50;

/**
 * The time a step may take: what is left before the deadline after the
 * reserve, capped by the step's own limit. Zero means there is not enough left
 * for the step to be worth starting, and the caller skips it.
 */
export function stepBudget({ elapsedMs, limitMs, reserveMs = 0, floorMs = 0, deadlineMs = PROMPT_DEADLINE_MS }) {
  const left = Math.floor(deadlineMs - elapsedMs - reserveMs);
  const granted = Math.min(limitMs, left);
  return Number.isFinite(granted) && granted >= floorMs && granted > 0 ? granted : 0;
}
