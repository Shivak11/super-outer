/**
 * Which diagrams a piece of work needs (plan section 12). Runs when a plan is
 * written and at the milestone sweep, from the changed files and project
 * facts. Returns the kinds in a fixed order, or { unclear: true } when the
 * files alone cannot settle it; the caller then asks Jev the diagram-kinds
 * question, and asks the owner one question if Jev is off or unsure.
 * One-problem diagrams are drawn only on request and never planned here.
 */

const ARCHITECTURE = [
  /(^|\/)(wrangler\.(toml|jsonc?)|vercel\.json|fly\.toml|netlify\.toml|Dockerfile|docker-compose\.ya?ml|render\.yaml|app\.json|eas\.json)$/i,
  /(^|\/)supabase\/config\.toml$/i,
  /(^|\/)(infra|terraform|deploy|k8s|helm)\//i,
];
const PIPELINE = [/(prompt|llm|openai|anthropic|embedding|agent|pipeline|ingest|etl|transcri|classif|summari)/i];
const CODE_FLOW = [/(^|\/)(api|routes?|handlers?|controllers?|endpoints?|server|workers?|queues?|jobs|functions|backend)\//i];

const matches = (files, patterns) => files.some((file) => patterns.some((pattern) => pattern.test(file)));

export function planDiagrams({ changedFiles = [], facts = {} } = {}) {
  const files = Array.isArray(changedFiles) ? changedFiles.filter((f) => typeof f === "string") : [];
  const known = facts && typeof facts === "object" ? facts : {};
  const kinds = [];
  if (known.partsChanged === true || matches(files, ARCHITECTURE)) kinds.push("architecture");
  if (matches(files, PIPELINE)) kinds.push("pipeline");
  if (matches(files, CODE_FLOW)) {
    if (known.maintainer === "developer") kinds.push("code-flow");
    else if (known.maintainer === undefined || known.maintainer === null) return { unclear: true };
  }
  return kinds;
}
