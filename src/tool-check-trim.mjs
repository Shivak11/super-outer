/**
 * `super-outer tool-check trim <source>`: cuts a raw registry response down to
 * the fields the tool check needs, so the agent never reads the raw JSON.
 *
 * The agent fetches a source itself and pipes the response in. This module
 * reads that text only: it makes no network call and writes nothing. Each
 * trimmer returns plain lines; an unreadable response returns one line saying
 * so, and nothing throws.
 *
 * Sizes measured on 25 October 2026: one MCP Registry search for "cloudflare"
 * was 34 KB with one official server among 30 rows; npm's latest record for
 * expo was 7.5 KB, of which the check needs two fields.
 */

import { readAliases } from "./stack-facts.mjs";
import { auditVerdict, mcpOwnership } from "./tool-check.mjs";

export const SOURCES = Object.freeze(["skills-search", "skills-audit", "mcp-registry", "npm", "pypi"]);

const parse = (text) => {
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
};

const ownerOf = (url) => {
  const match = String(url ?? "").match(/github\.com[/:]([^/]+)\//i);
  return match ? match[1].toLowerCase() : null;
};

/**
 * Whether an MCP Registry server name is in the publisher's own namespace:
 * `io.github.<publisher>/...`, or one of the vendor's domains listed in
 * catalogue/vendor-aliases.json. Names under shared hosting domains
 * (`app.vercel`, `dev.workers` and others in that file) never count. `super-outer tool-check run` applies the same rule with the
 * vendor's own domains (src/tool-check.mjs, mcpOwnership).
 */
export function inPublisherNamespace(name, publisher) {
  const aliases = readAliases();
  return mcpOwnership(name, publisher, { sharedHosts: aliases.sharedHosts ?? [], domains: aliases.domains?.[String(publisher ?? "").toLowerCase()] ?? [] }) === "official";
}

const TRIMMERS = {
  "skills-search": (data) => {
    const skills = Array.isArray(data.skills) ? data.skills : null;
    if (!skills) return null;
    if (skills.length === 0) return [`skills.sh: no skills for "${data.query ?? ""}"`];
    return skills.map((skill) => `${skill.source} ${skill.skillId ?? skill.name} ${skill.installs ?? 0}`);
  },
  "skills-audit": (data) => {
    const audits = Array.isArray(data.audits) ? data.audits : null;
    if (!audits) return null;
    const lines = audits.map((audit) => `${audit.provider}: ${audit.status}${audit.riskLevel ? ` (${audit.riskLevel})` : ""}`);
    lines.push(`verdict: ${auditVerdict(audits)}`);
    return lines;
  },
  "mcp-registry": (data, { publisher } = {}) => {
    const servers = Array.isArray(data.servers) ? data.servers : null;
    if (!servers) return null;
    const latest = new Map();
    for (const entry of servers) {
      const server = entry?.server ?? entry;
      if (!server?.name) continue;
      const meta = entry?._meta?.["io.modelcontextprotocol.registry/official"];
      if (meta && meta.isLatest === false) continue;
      latest.set(server.name, server);
    }
    const kept = [...latest.values()].filter((server) => !publisher
      || inPublisherNamespace(server.name, publisher)
      || ownerOf(server.repository?.url) === String(publisher).toLowerCase());
    const lines = kept.map((server) => {
      const official = publisher && inPublisherNamespace(server.name, publisher) ? " namespace=publisher" : "";
      return `${server.name} ${server.version ?? ""} ${server.repository?.url ?? "no-repository"}${official}`.replace(/\s+/g, " ").trim();
    });
    const dropped = latest.size - kept.length;
    if (publisher && dropped > 0) lines.push(`${dropped} other servers outside ${publisher}'s namespace dropped`);
    if (lines.length === 0) lines.push("MCP Registry: no servers");
    return lines;
  },
  npm: (data) => {
    if (typeof data.name !== "string" || typeof data.version !== "string") return null;
    const repository = typeof data.repository === "string" ? data.repository : data.repository?.url;
    const owner = ownerOf(repository);
    const line = `${data.name} latest=${data.version}${owner ? ` owner=${owner}` : ""} repo=${repository ?? "none"}`;
    return data.deprecated ? [line, `deprecated: ${String(data.deprecated).slice(0, 200)}`] : [line];
  },
  pypi: (data) => {
    const info = data.info;
    if (!info || typeof info.name !== "string") return null;
    const urls = info.project_urls ?? {};
    const source = urls.Source ?? urls.Repository ?? urls.Homepage ?? info.home_page ?? null;
    const owner = ownerOf(source);
    const lines = [`${info.name} latest=${info.version}${owner ? ` owner=${owner}` : ""} repo=${source ?? "none"}`];
    if (info.yanked) lines.push(`yanked: ${info.yanked_reason || "yes"}`);
    if (/inactive|deprecated/i.test((info.classifiers ?? []).join(" "))) lines.push("classifier: inactive or deprecated");
    return lines;
  },
};

/** The kept lines for `source`, given the raw response text. */
export function trim(source, text, options = {}) {
  const trimmer = TRIMMERS[source];
  if (!trimmer) return [`unknown source "${source}"; use one of ${SOURCES.join(", ")}`];
  const data = parse(text);
  const lines = data ? trimmer(data, options) : null;
  return lines ?? [`${source}: response was not the expected JSON`];
}
