/**
 * Agents by depth and model by job (plan section 8). Pure; no I/O.
 * QUICK none. FOCUSED up to 2 scouts on sonnet. FULL scouts on sonnet, up to
 * 3 builders that inherit the session model, sweep reviewers on sonnet (opus
 * when risk is high). CRITICAL adds the independent verifier on opus.
 * Hard cap 6. The internal register applies from FOCUSED.
 */

export const AGENT_CAP = 6;
const clamp = (value, low, high, fallback) => (Number.isInteger(value) ? Math.max(low, Math.min(high, value)) : fallback);

export function planAgents({ depth, task = {} } = {}) {
  const t = task && typeof task === "object" ? task : {};
  const agents = [];
  const add = (role, model, count) => { for (let i = 0; i < count; i += 1) agents.push({ role, model }); };
  if (depth === "FOCUSED") add("scout", "sonnet", clamp(t.scouts, 1, 2, 1));
  if (depth === "FULL" || depth === "CRITICAL") {
    const reserved = depth === "CRITICAL" ? 1 : 0;
    add("scout", "sonnet", clamp(t.scouts, 1, 2, 1));
    add("builder", "inherit", clamp(t.builders, 1, 3, 1));
    const reviewerModel = depth === "CRITICAL" || t.risk === "high" ? "opus" : "sonnet";
    add("reviewer", reviewerModel, clamp(t.reviewers, 0, AGENT_CAP, 1));
    agents.splice(AGENT_CAP - reserved);
    if (depth === "CRITICAL") agents.push({ role: "independent-verifier", model: "opus" });
  }
  return { depth: depth ?? null, agents, cap: AGENT_CAP, internalRegister: ["FOCUSED", "FULL", "CRITICAL"].includes(depth) };
}
