import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

import {
  AUTHORITY_ORDER,
  CONTRACT_VERSION,
  PROFILE_SECTION_IDS,
  PROFILE_STATUSES,
} from "./constants.mjs";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const clone = (value) => structuredClone(value);

function cleanRelativePath(root, candidate, label = "source") {
  if (typeof candidate !== "string" || candidate.trim() === "") {
    throw new TypeError(`${label} path must be a non-empty string`);
  }
  const normalised = candidate.replaceAll("\\", "/");
  if (path.posix.isAbsolute(normalised)) {
    throw new Error(`${label} path must be repository-relative`);
  }
  const absoluteRoot = path.resolve(root);
  const absolute = path.resolve(absoluteRoot, normalised);
  const relative = path.relative(absoluteRoot, absolute);
  if (relative === ".." || relative.startsWith(`..${path.sep}`)) {
    throw new Error(`${label} path escapes the repository root`);
  }
  return { relative: relative.split(path.sep).join("/"), absolute };
}

async function canonicalRepositoryPath(root, candidate, label = "source") {
  const lexical = cleanRelativePath(root, candidate, label);
  const canonicalRoot = await realpath(path.resolve(root));
  const canonical = await realpath(lexical.absolute);
  const relative = path.relative(canonicalRoot, canonical);
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`${label} path resolves outside the repository root`);
  }
  return { ...lexical, canonical };
}

function checkedAt(options) {
  const value = options.now?.() ?? new Date();
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

export function hashContent(content) {
  return createHash("sha256").update(content).digest("hex");
}

export async function hashSource(root, sourcePath, options = {}) {
  const safePath = await canonicalRepositoryPath(root, sourcePath);
  return hashContent(await (options.readFile ?? readFile)(safePath.canonical));
}

export function authorityRank(authorityId) {
  return (
    AUTHORITY_ORDER.find((entry) => entry.id === authorityId)?.rank ??
    Number.POSITIVE_INFINITY
  );
}

function validDateTime(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function classificationError(status, authority) {
  if (status === "EXPLICIT" && authority === "unknown") {
    return "EXPLICIT evidence requires a named non-unknown authority";
  }
  if (
    status === "OBSERVED" &&
    ["binding", "company-contract", "repository-contract"].includes(authority)
  ) {
    return `OBSERVED evidence cannot claim policy authority ${authority}`;
  }
  return null;
}

/** Validate the exact shape owned by schemas/repository-profile.schema.json. */
export function validateProfile(profile) {
  const errors = [];
  if (!isObject(profile)) {
    return { valid: false, errors: ["profile must be an object"] };
  }
  const allowedTopLevel = new Set([
    "schema_version",
    "repository",
    "extends",
    "sections",
  ]);
  for (const key of Object.keys(profile)) {
    if (!allowedTopLevel.has(key)) errors.push(`unknown profile property: ${key}`);
  }
  if (profile.schema_version !== CONTRACT_VERSION) {
    errors.push(`schema_version must be ${CONTRACT_VERSION}`);
  }
  if (typeof profile.repository !== "string" || profile.repository.length === 0) {
    errors.push("repository must be a non-empty string");
  }
  if (
    profile.extends !== undefined &&
    profile.extends !== null &&
    typeof profile.extends !== "string"
  ) {
    errors.push("extends must be a repository-relative string or null");
  }
  if (typeof profile.extends === "string") {
    const candidate = profile.extends.replaceAll("\\", "/");
    if (
      path.posix.isAbsolute(candidate) ||
      path.posix.normalize(candidate) === ".." ||
      path.posix.normalize(candidate).startsWith("../")
    ) {
      errors.push("extends must stay within the repository root");
    }
  }
  if (!isObject(profile.sections) || Object.keys(profile.sections).length === 0) {
    errors.push("sections must be a non-empty object");
    return { valid: false, errors };
  }

  const sectionIds = new Set(Object.keys(profile.sections));
  for (const sectionId of PROFILE_SECTION_IDS) {
    if (!sectionIds.has(sectionId)) errors.push(`missing profile section: ${sectionId}`);
  }
  for (const sectionId of sectionIds) {
    if (!PROFILE_SECTION_IDS.includes(sectionId)) {
      errors.push(`unknown profile section: ${sectionId}`);
    }
  }

  for (const [sectionId, section] of Object.entries(profile.sections)) {
    if (!isObject(section)) {
      errors.push(`sections.${sectionId} must be an object`);
      continue;
    }
    const allowedSection = new Set(["status", "authority", "summary", "sources"]);
    for (const key of Object.keys(section)) {
      if (!allowedSection.has(key)) {
        errors.push(`unknown sections.${sectionId} property: ${key}`);
      }
    }
    if (!PROFILE_STATUSES.includes(section.status)) {
      errors.push(`sections.${sectionId}.status is not recognised`);
    }
    if (!AUTHORITY_ORDER.some((entry) => entry.id === section.authority)) {
      errors.push(`sections.${sectionId}.authority is not recognised`);
    }
    const contradiction = classificationError(section.status, section.authority);
    if (contradiction) errors.push(`sections.${sectionId}: ${contradiction}`);
    if (section.summary !== undefined && typeof section.summary !== "string") {
      errors.push(`sections.${sectionId}.summary must be a string`);
    }
    if (!Array.isArray(section.sources)) {
      errors.push(`sections.${sectionId}.sources must be an array`);
      continue;
    }
    if (section.status !== "UNKNOWN" && section.sources.length === 0) {
      errors.push(`sections.${sectionId} needs evidence for ${section.status}`);
    }
    for (const [index, source] of section.sources.entries()) {
      if (
        !isObject(source) ||
        Object.keys(source).some(
          (key) => !["path", "sha256", "last_checked"].includes(key),
        )
      ) {
        errors.push(`sections.${sectionId}.sources[${index}] has invalid fields`);
        continue;
      }
      if (typeof source.path !== "string" || source.path.length === 0) {
        errors.push(`sections.${sectionId}.sources[${index}] needs a path`);
      } else {
        const candidate = source.path.replaceAll("\\", "/");
        if (
          path.posix.isAbsolute(candidate) ||
          path.posix.normalize(candidate) === ".." ||
          path.posix.normalize(candidate).startsWith("../")
        ) {
          errors.push(
            `sections.${sectionId}.sources[${index}] escapes the repository root`,
          );
        }
      }
      if (!SHA256_PATTERN.test(source.sha256 ?? "")) {
        errors.push(`sections.${sectionId}.sources[${index}] needs a SHA-256 hash`);
      }
      if (!validDateTime(source.last_checked)) {
        errors.push(`sections.${sectionId}.sources[${index}] needs last_checked`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

export function assertValidProfile(profile) {
  const result = validateProfile(profile);
  if (!result.valid) {
    throw new Error(`Invalid repository profile: ${result.errors.join("; ")}`);
  }
  return profile;
}

async function prepareSection(root, input, options) {
  const section = isObject(input) ? input : {};
  const status = section.status ?? "UNKNOWN";
  if (status === "EXPLICIT" && section.authority === undefined) {
    throw new Error("EXPLICIT section requires an explicit authority");
  }
  const authority =
    section.authority ??
    (status === "OBSERVED" ? "local-precedent" : "unknown");
  if (!PROFILE_STATUSES.includes(status)) throw new Error(`Unknown status: ${status}`);
  if (!AUTHORITY_ORDER.some((entry) => entry.id === authority)) {
    throw new Error(`Unknown authority: ${authority}`);
  }
  const contradiction = classificationError(status, authority);
  if (contradiction) throw new Error(contradiction);
  const sources = [];
  for (const sourceInput of section.sources ?? []) {
    const source = typeof sourceInput === "string" ? { path: sourceInput } : sourceInput;
    if (!isObject(source)) throw new TypeError("profile sources must be path records");
    const safePath = await canonicalRepositoryPath(root, source.path);
    sources.push({
      path: safePath.relative,
      sha256:
        source.sha256 ??
        hashContent(await (options.readFile ?? readFile)(safePath.canonical)),
      last_checked: source.last_checked ?? checkedAt(options),
    });
  }
  sources.sort((left, right) => left.path.localeCompare(right.path));
  return {
    status,
    authority,
    ...(typeof section.summary === "string" ? { summary: section.summary } : {}),
    sources,
  };
}

export async function createRepositoryProfile(options) {
  const root = path.resolve(options.root);
  const sections = {};
  for (const sectionId of PROFILE_SECTION_IDS) {
    sections[sectionId] = await prepareSection(
      root,
      options.sections?.[sectionId],
      options,
    );
  }
  const profile = {
    schema_version: CONTRACT_VERSION,
    repository: String(options.repository ?? path.basename(root)),
    ...(options.extends !== undefined ? { extends: options.extends } : {}),
    sections,
  };
  return assertValidProfile(profile);
}

export async function detectStaleSections(profile, options) {
  assertValidProfile(profile);
  const root = path.resolve(options.root);
  const reader = options.readFile ?? readFile;
  const sections = {};
  const staleSections = [];
  for (const [sectionId, section] of Object.entries(profile.sections)) {
    const sources = [];
    for (const source of section.sources) {
      try {
        const safePath = await canonicalRepositoryPath(root, source.path);
        const actualHash = hashContent(await reader(safePath.canonical));
        sources.push({
          path: source.path,
          expectedHash: source.sha256,
          actualHash,
          stale: actualHash !== source.sha256,
          reason: actualHash === source.sha256 ? null : "hash_changed",
        });
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
        sources.push({
          path: source.path,
          expectedHash: source.sha256,
          actualHash: null,
          stale: true,
          reason: "source_missing",
        });
      }
    }
    const stale = sources.some((source) => source.stale);
    if (stale) staleSections.push(sectionId);
    sections[sectionId] = { stale, sources };
  }
  return { staleSections, sections };
}

export async function refreshProfile(profile, options) {
  assertValidProfile(profile);
  const refreshed = clone(profile);
  const freshness = await detectStaleSections(profile, options);
  const missingSources = [];
  const pendingRereadSections = [];
  const refreshedSections = [];
  const lastChecked = checkedAt(options);
  for (const [sectionId, section] of Object.entries(freshness.sections)) {
    const missing = section.sources.filter(
      (source) => source.reason === "source_missing",
    );
    const changed = section.sources.filter(
      (source) => source.reason === "hash_changed",
    );
    missingSources.push(
      ...missing.map((source) => ({ sectionId, path: source.path })),
    );

    // A partially missing section cannot be revalidated safely. Retain all of
    // its previous hashes and classifications so it remains visibly stale.
    if (missing.length > 0) continue;

    if (changed.length > 0) {
      if (typeof options.rereadSection !== "function") {
        pendingRereadSections.push(sectionId);
        continue;
      }
      const reread = await options.rereadSection({
        sectionId,
        previousSection: clone(profile.sections[sectionId]),
        changedSources: changed.map((source) => ({
          path: source.path,
          previous_sha256: source.expectedHash,
          current_sha256: source.actualHash,
        })),
      });
      if (!isObject(reread) || reread.accepted !== true) {
        pendingRereadSections.push(sectionId);
        continue;
      }
      if (!PROFILE_STATUSES.includes(reread.status)) {
        throw new Error(`Reread of ${sectionId} must classify its status`);
      }
      if (!AUTHORITY_ORDER.some((entry) => entry.id === reread.authority)) {
        throw new Error(`Reread of ${sectionId} must classify its authority`);
      }
      const contradiction = classificationError(reread.status, reread.authority);
      if (contradiction) throw new Error(`Reread of ${sectionId}: ${contradiction}`);
      refreshed.sections[sectionId].status = reread.status;
      refreshed.sections[sectionId].authority = reread.authority;
      if (typeof reread.summary === "string") {
        refreshed.sections[sectionId].summary = reread.summary;
      } else {
        // Do not let a summary of the old content survive the hash change.
        delete refreshed.sections[sectionId].summary;
      }
      refreshedSections.push(sectionId);
    }

    for (const [index, source] of section.sources.entries()) {
      refreshed.sections[sectionId].sources[index].sha256 = source.actualHash;
      refreshed.sections[sectionId].sources[index].last_checked = lastChecked;
    }
  }
  return {
    profile: refreshed,
    changedSections: refreshedSections,
    refreshedSections,
    pendingRereadSections,
    staleSections: [...new Set([
      ...pendingRereadSections,
      ...missingSources.map(({ sectionId }) => sectionId),
    ])],
    missingSources,
  };
}

const STATUS_PRECEDENCE = Object.freeze({ EXPLICIT: 1, OBSERVED: 2, UNKNOWN: 3 });

function mergeSection(parent, child) {
  if (!parent) return clone(child);
  if (!child || (child.status === "UNKNOWN" && child.sources.length === 0)) {
    return clone(parent);
  }
  if (parent.status === "UNKNOWN" && parent.sources.length === 0) {
    return clone(child);
  }

  const parentPrecedence = STATUS_PRECEDENCE[parent.status];
  const childPrecedence = STATUS_PRECEDENCE[child.status];
  if (parentPrecedence !== childPrecedence) {
    // Classification provenance is indivisible: lower-authority observed text
    // and sources must never be presented under an inherited EXPLICIT label.
    return clone(parentPrecedence < childPrecedence ? parent : child);
  }

  const childWins = authorityRank(child.authority) <= authorityRank(parent.authority);
  const selected = childWins ? child : parent;
  const fallback = childWins ? parent : child;
  const sources = new Map();
  for (const source of [...parent.sources, ...child.sources]) {
    sources.set(`${source.path}:${source.sha256}`, clone(source));
  }
  return {
    status: selected.status,
    authority: selected.authority,
    ...(selected.summary !== undefined
      ? { summary: selected.summary }
      : fallback.summary !== undefined
        ? { summary: fallback.summary }
        : {}),
    sources: [...sources.values()].sort((left, right) =>
      left.path.localeCompare(right.path),
    ),
  };
}

function mergeSections(parentSections, childSections) {
  const merged = {};
  for (const sectionId of new Set([
    ...Object.keys(parentSections ?? {}),
    ...Object.keys(childSections ?? {}),
  ])) {
    merged[sectionId] = mergeSection(
      parentSections?.[sectionId],
      childSections?.[sectionId],
    );
  }
  return merged;
}

async function defaultProfileLoader(profilePath) {
  return JSON.parse(await readFile(profilePath, "utf8"));
}

/** Resolve inheritance per call, with no cross-repository global cache. */
export async function resolveProfile(profile, options) {
  const root = path.resolve(options.root);
  const loadProfile = options.loadProfile ?? defaultProfileLoader;
  const maximumDepth = options.maximumDepth ?? 8;
  const seen = new Set();
  async function visit(current, depth) {
    assertValidProfile(current);
    if (depth > maximumDepth) {
      throw new Error("Profile inheritance exceeds the maximum depth");
    }
    if (!current.extends) return clone(current);
    const reference = await canonicalRepositoryPath(root, current.extends, "extends");
    if (seen.has(reference.canonical)) {
      throw new Error(`Profile inheritance cycle at ${reference.relative}`);
    }
    seen.add(reference.canonical);
    const parent = await visit(await loadProfile(reference.canonical), depth + 1);
    return {
      schema_version: CONTRACT_VERSION,
      repository: current.repository,
      sections: mergeSections(parent.sections, current.sections),
    };
  }
  return assertValidProfile(await visit(profile, 0));
}

export const profileContract = Object.freeze({
  schema_version: CONTRACT_VERSION,
  sectionIds: PROFILE_SECTION_IDS,
  statuses: PROFILE_STATUSES,
  authorityOrder: AUTHORITY_ORDER,
});
