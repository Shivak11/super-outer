import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CORE_GLOSSARY_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../skills/super-outer/references/glossary.md",
);

const normaliseTerm = (value) => String(value ?? "").trim().toLowerCase();

/**
 * Parse the pipe table in the core glossary. Deliberately strict: a row that
 * does not carry both a term and a phrasing is skipped rather than guessed at,
 * because a half-parsed dictionary is worse than a missing one.
 */
function parseCore(text) {
  const entries = new Map();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) continue;
    const cells = trimmed.slice(1, -1).split("|").map((cell) => cell.trim());
    if (cells.length !== 2) continue;
    const [term, plain] = cells;
    if (!term || !plain) continue;
    if (normaliseTerm(term) === "term") continue; // header
    if (/^-+$/.test(term)) continue; // separator
    entries.set(normaliseTerm(term), { term, plain, source: "core" });
  }
  return entries;
}

function parseVaultEntry(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const frontmatter = match[1];
  const term = frontmatter.match(/^term:\s*(.+)$/m)?.[1]?.trim();
  const plain = frontmatter.match(/^plain:\s*(.+)$/m)?.[1]?.trim();
  if (!term || !plain) return null;
  return { term, plain, source: "vault" };
}

/**
 * Deterministic, path-based enrichment. The vault is also indexed for semantic
 * search, but a question-phrasing gate must return the same phrasing for the
 * same term on every run, so this reads files directly and never queries the
 * index.
 */
function loadVaultEntries(vaultGlossaryDirectory) {
  const entries = new Map();
  let names;
  try {
    if (!statSync(vaultGlossaryDirectory).isDirectory()) return entries;
    names = readdirSync(vaultGlossaryDirectory);
  } catch {
    // An unreachable vault is the ordinary case under Codex, Cursor, CI, and
    // any install that is not the author's laptop. Degrade silently.
    return entries;
  }

  for (const name of names.sort()) {
    if (!name.endsWith(".md")) continue;
    let parsed;
    try {
      parsed = parseVaultEntry(readFileSync(join(vaultGlossaryDirectory, name), "utf8"));
    } catch {
      continue;
    }
    if (parsed) entries.set(normaliseTerm(parsed.term), parsed);
  }
  return entries;
}

export function loadGlossary({ vaultGlossaryDirectory = null, corePath = CORE_GLOSSARY_PATH } = {}) {
  const core = parseCore(readFileSync(corePath, "utf8"));
  if (!vaultGlossaryDirectory) {
    return { entries: core, vaultLoaded: false, vaultTermCount: 0 };
  }
  const vault = loadVaultEntries(vaultGlossaryDirectory);
  // The vault wins: it is the copy the owner maintains as they work.
  const entries = new Map([...core, ...vault]);
  return { entries, vaultLoaded: vault.size > 0, vaultTermCount: vault.size };
}

export function plainPhraseFor(term, glossary) {
  return glossary.entries.get(normaliseTerm(term))?.plain ?? null;
}

export const glossaryPolicy = Object.freeze({
  lookup: "deterministic-exact-term",
  enrichment: "path-based",
  semanticSearch: false,
  writesToVault: false,
});
