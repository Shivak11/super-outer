import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const APPROVAL_SCHEMA_VERSION = "1.0.0";
export const APPROVAL_TTL_MS = 15 * 60 * 1000;
export const APPROVAL_PREFIX = "APPROVE SUPER-OUTER ";

const TOKEN_PATTERN = /^[A-Z0-9]{6,16}$/;
const PHRASE_PATTERN = /^APPROVE SUPER-OUTER ([A-Z0-9]{6,16})$/;
const STATUSES = new Set(["PENDING", "CONFIRMED", "USED", "INVALIDATED", "EXPIRED"]);
const LOCK_ORPHAN_GRACE_MS = 1_000;
const sha256 = (value) => crypto.createHash("sha256").update(String(value ?? "")).digest("hex");
const uniqueStrings = (values) => [...new Set((Array.isArray(values) ? values : [])
  .map((value) => String(value ?? "").trim()).filter(Boolean))].sort();

const requiredString = (value, label) => {
  const result = String(value ?? "").trim();
  if (!result) throw new Error(`Approval scope requires ${label}`);
  return result;
};

const insideRoot = (root, target) => {
  const relative = path.relative(root, target);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
};

const canonicalFilesystemPath = (target) => {
  const suffix = [];
  let probe = path.resolve(target);
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) break;
    suffix.unshift(path.basename(probe));
    probe = parent;
  }
  let canonical = probe;
  try { canonical = fs.realpathSync(probe); } catch {}
  return path.join(canonical, ...suffix);
};

export const canonicalApprovalPath = (value, repository) => {
  const raw = requiredString(value, "a non-empty allowed path");
  if (raw.includes("\0")) throw new Error("Approval paths cannot contain NUL bytes");
  const root = canonicalFilesystemPath(requiredString(repository, "repository"));
  const wildcard = raw.endsWith("/**");
  const unwrapped = (wildcard ? raw.slice(0, -3) : raw).replace(/^['\"]|['\"]$/g, "");
  const absolute = canonicalFilesystemPath(path.resolve(root, unwrapped || "."));
  if (!insideRoot(root, absolute)) throw new Error(`Approval path escapes repository: ${raw}`);
  const relative = path.relative(root, absolute).split(path.sep).join("/") || ".";
  return `${wildcard ? "prefix" : "exact"}:${relative}`;
};

export const normalizeApprovalScope = (scope = {}) => {
  const repository = canonicalFilesystemPath(requiredString(scope.repository, "repository"));
  const actions = uniqueStrings(scope.actions);
  const paths = uniqueStrings(scope.paths).map((value) => canonicalApprovalPath(value, repository)).sort();
  const destinations = uniqueStrings(scope.destinations).map((value) => value.toLowerCase());
  if (!actions.length) throw new Error("Approval scope requires at least one action");
  if (!paths.length) throw new Error("Approval scope requires at least one allowed path");
  if (!destinations.length) throw new Error("Approval scope requires at least one destination, including 'none'");
  return {
    client: requiredString(scope.client, "client").toLowerCase(),
    user: requiredString(scope.user, "user"),
    session: requiredString(scope.session, "session"),
    repository,
    branch: requiredString(scope.branch, "branch"),
    task: requiredString(scope.task, "task"),
    actions,
    paths,
    destinations,
    environment: requiredString(scope.environment, "environment").toLowerCase(),
    repositoryState: requiredString(scope.repositoryState, "repository state")
  };
};

const scopeHashes = (scope) => {
  const normalized = normalizeApprovalScope(scope);
  const result = {
    client_hash: sha256(`client:${normalized.client}`),
    user_hash: sha256(`user:${normalized.user}`),
    session_hash: sha256(`session:${normalized.session}`),
    repository_hash: sha256(`repository:${normalized.repository}`),
    branch_hash: sha256(`branch:${normalized.branch}`),
    task_hash: sha256(`task:${normalized.task}`),
    actions_hash: sha256(`actions:${JSON.stringify(normalized.actions)}`),
    paths_hash: sha256(`paths:${JSON.stringify(normalized.paths)}`),
    destinations_hash: sha256(`destinations:${JSON.stringify(normalized.destinations)}`),
    environment_hash: sha256(`environment:${normalized.environment}`)
  };
  return {
    hashes: result,
    scope_digest: sha256(JSON.stringify({ ...result, repository_state_hash: sha256(normalized.repositoryState) }))
  };
};

export const approvalBindings = (scope) => ({ ...scopeHashes(scope).hashes, scope_digest: scopeHashes(scope).scope_digest });

export const approvalPhrase = (token = "") => {
  const candidate = String(token || crypto.randomBytes(5).toString("hex")).toUpperCase();
  if (!TOKEN_PATTERN.test(candidate)) throw new Error("Approval token must contain 6-16 uppercase letters or digits");
  return `${APPROVAL_PREFIX}${candidate}`;
};

export const isApprovalPhrase = (value) => PHRASE_PATTERN.test(String(value ?? "").trim());
export const approvalPhraseHash = (value) => sha256(`super-outer-approval:${String(value ?? "").trim()}`);

const stateRoot = (directory) => path.resolve(directory || process.env.SUPER_OUTER_STATE_DIR || path.join(os.tmpdir(), "super-outer-state"));
const stateKey = (bindings) => sha256([
  bindings.client_hash, bindings.user_hash, bindings.session_hash,
  bindings.repository_hash, bindings.branch_hash, bindings.task_hash
].join(":"));
// Any user message in the same host session cancels every pending approval,
// even if the user moved to another branch, repository, or task meanwhile.
const stableBindingKeys = ["client_hash", "user_hash", "session_hash"];

export const approvalStatePath = ({ scope, stateDir }) => {
  const bindings = approvalBindings(scope);
  const root = stateRoot(stateDir);
  const key = stateKey(bindings);
  return { root, file: path.join(root, `${key}.json`), statusFile: path.join(root, `${key}.status`), bindings };
};

const validateEnvelope = (envelope) => {
  const required = [
    "schema_version", "token_digest", "client_hash", "user_hash", "session_hash",
    "repository_hash", "branch_hash", "task_hash", "actions_hash", "paths_hash",
    "destinations_hash", "environment_hash", "scope_digest", "created_at", "expires_at",
    "turn_index", "used"
  ];
  if (!envelope || Object.keys(envelope).sort().join("\0") !== required.sort().join("\0")) throw new Error("Approval envelope shape is invalid");
  for (const key of required.filter((key) => key.endsWith("hash") || key.endsWith("digest"))) {
    if (!/^[a-f0-9]{64}$/.test(envelope[key])) throw new Error(`Approval envelope has invalid ${key}`);
  }
  return envelope;
};

const atomicWrite = (filename, data) => {
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  fs.chmodSync(path.dirname(filename), 0o700);
  const temporary = `${filename}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(temporary, data, { mode: 0o600, flag: "wx" });
  fs.renameSync(temporary, filename);
  fs.chmodSync(filename, 0o600);
};

const lockSnapshot = (lockFile) => {
  const before = fs.statSync(lockFile);
  const raw = fs.readFileSync(lockFile, "utf8");
  const after = fs.statSync(lockFile);
  if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs) return null;
  let owner = null;
  try { owner = JSON.parse(raw); } catch {}
  return { raw, owner, dev: after.dev, ino: after.ino, size: after.size, mtimeMs: after.mtimeMs };
};

const sameLockSnapshot = (left, right) => Boolean(left && right
  && left.dev === right.dev && left.ino === right.ino && left.size === right.size
  && left.mtimeMs === right.mtimeMs && left.raw === right.raw);

const processIsAlive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error?.code !== "ESRCH"; }
};

const recoverOrphanedLock = (lockFile, now = Date.now()) => {
  let observed;
  try { observed = lockSnapshot(lockFile); }
  catch (error) { if (error?.code === "ENOENT") return true; throw error; }
  if (!observed) return false;
  const createdAt = Date.parse(observed.owner?.created_at);
  const hasIdentity = typeof observed.owner?.owner_id === "string" && observed.owner.owner_id
    && Number.isInteger(observed.owner?.pid) && Number.isFinite(createdAt);
  const age = Number(now) - (hasIdentity ? createdAt : observed.mtimeMs);
  const orphaned = hasIdentity
    ? age >= LOCK_ORPHAN_GRACE_MS && !processIsAlive(observed.owner.pid)
    : age >= APPROVAL_TTL_MS;
  if (!orphaned) return false;
  let current;
  try { current = lockSnapshot(lockFile); }
  catch (error) { if (error?.code === "ENOENT") return true; throw error; }
  if (!sameLockSnapshot(observed, current)) return false;
  fs.unlinkSync(lockFile);
  return true;
};

const withStateLock = (location, operation) => {
  const lockFile = `${location.file}.lock`;
  const owner = {
    owner_id: crypto.randomUUID(),
    pid: process.pid,
    created_at: new Date().toISOString()
  };
  let descriptor;
  fs.mkdirSync(location.root, { recursive: true, mode: 0o700 });
  fs.chmodSync(location.root, 0o700);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      descriptor = fs.openSync(lockFile, "wx", 0o600);
      fs.writeFileSync(descriptor, `${JSON.stringify(owner)}\n`);
      fs.fsyncSync(descriptor);
      break;
    } catch (error) {
      if (descriptor !== undefined) { try { fs.closeSync(descriptor); } catch {} descriptor = undefined; }
      if (error?.code !== "EEXIST") throw error;
      if (attempt === 0 && recoverOrphanedLock(lockFile)) continue;
      throw new Error("Approval is already being consumed by another operation");
    }
  }
  try {
    return operation();
  } finally {
    try {
      const descriptorState = fs.fstatSync(descriptor);
      const current = lockSnapshot(lockFile);
      if (current?.dev === descriptorState.dev && current?.ino === descriptorState.ino && current.owner?.owner_id === owner.owner_id) {
        fs.unlinkSync(lockFile);
      }
    } catch {}
    try { fs.closeSync(descriptor); } catch {}
  }
};

const writeEnvelope = (location, envelope, status) => {
  validateEnvelope(envelope);
  if (!STATUSES.has(status)) throw new Error("Approval status is invalid");
  atomicWrite(location.file, `${JSON.stringify(envelope)}\n`);
  atomicWrite(location.statusFile, `${status}\n`);
};

const invalidateLocation = (location) => withStateLock(location, () => {
  const envelope = validateEnvelope(JSON.parse(fs.readFileSync(location.file, "utf8")));
  const status = fs.readFileSync(location.statusFile, "utf8").trim();
  if (["PENDING", "CONFIRMED"].includes(status)) writeEnvelope(location, envelope, "INVALIDATED");
  return { status: ["PENDING", "CONFIRMED"].includes(status) ? "INVALIDATED" : status };
});

const readCurrent = ({ scope, stateDir, now = Date.now() }) => {
  const location = approvalStatePath({ scope, stateDir });
  let envelope;
  let status;
  try {
    envelope = validateEnvelope(JSON.parse(fs.readFileSync(location.file, "utf8")));
    status = fs.readFileSync(location.statusFile, "utf8").trim();
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error("No approval envelope exists for this task scope");
    throw error;
  }
  if (!STATUSES.has(status)) throw new Error("Approval status is invalid");
  if (envelope.scope_digest !== location.bindings.scope_digest) {
    writeEnvelope(location, envelope, "INVALIDATED");
    throw new Error("Approval scope drifted after the envelope was issued");
  }
  if (Number(now) > Date.parse(envelope.expires_at)) {
    writeEnvelope(location, envelope, "EXPIRED");
    throw new Error("Approval envelope expired");
  }
  return { location, envelope, status };
};

const relatedActiveApprovals = ({ scope, stateDir }) => {
  const expected = approvalBindings(scope);
  const root = stateRoot(stateDir);
  let filenames = [];
  try { filenames = fs.readdirSync(root).filter((filename) => filename.endsWith(".json")); }
  catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const matches = [];
  for (const filename of filenames) {
    const file = path.join(root, filename);
    const statusFile = file.replace(/\.json$/, ".status");
    try {
      const envelope = validateEnvelope(JSON.parse(fs.readFileSync(file, "utf8")));
      const status = fs.readFileSync(statusFile, "utf8").trim();
      if (!["PENDING", "CONFIRMED"].includes(status)) continue;
      if (stableBindingKeys.every((key) => envelope[key] === expected[key])) {
        matches.push({ file, statusFile, root, bindings: expected, envelope, status });
      }
    } catch {}
  }
  return matches;
};

const relatedTokenApprovals = ({ scope, stateDir, tokenDigest }) => {
  const expected = approvalBindings(scope);
  const root = stateRoot(stateDir);
  let filenames = [];
  try { filenames = fs.readdirSync(root).filter((filename) => filename.endsWith(".json")); }
  catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const matches = [];
  for (const filename of filenames) {
    const file = path.join(root, filename);
    const statusFile = file.replace(/\.json$/, ".status");
    try {
      const envelope = validateEnvelope(JSON.parse(fs.readFileSync(file, "utf8")));
      const status = fs.readFileSync(statusFile, "utf8").trim();
      if (!STATUSES.has(status)) continue;
      if (envelope.token_digest === tokenDigest
        && stableBindingKeys.every((key) => envelope[key] === expected[key])) {
        matches.push({ file, statusFile, root, bindings: expected, envelope, status });
      }
    } catch {}
  }
  return matches;
};

const tokenIssueLock = (location, tokenDigest) => ({
  root: location.root,
  file: path.join(location.root, `.approval-token-${sha256([
    ...stableBindingKeys.map((key) => location.bindings[key]),
    tokenDigest
  ].join(":"))}`)
});

export const issueApproval = ({ scope, stateDir, token, now = Date.now(), turnIndex = 0 }) => {
  const phrase = approvalPhrase(token);
  const location = approvalStatePath({ scope, stateDir });
  const createdAt = new Date(Number(now));
  const tokenDigest = approvalPhraseHash(phrase);
  return withStateLock(tokenIssueLock(location, tokenDigest), () => {
    const driftedReplay = relatedTokenApprovals({ scope, stateDir, tokenDigest })
      .find((entry) => entry.file !== location.file);
    if (driftedReplay) throw new Error("This approval phrase has already been issued and cannot be replayed after the task context changed");
    return withStateLock(location, () => {
      try {
        const existing = validateEnvelope(JSON.parse(fs.readFileSync(location.file, "utf8")));
        const status = fs.readFileSync(location.statusFile, "utf8").trim();
        if (existing.token_digest === tokenDigest) {
          const expired = Number(now) > Date.parse(existing.expires_at);
          if (status === "PENDING" && !existing.used && !expired) {
            return { phrase, envelope: existing, expiresAt: Date.parse(existing.expires_at), file: location.file, replayed: true };
          }
          throw new Error("This approval phrase has already been issued and cannot be replayed");
        }
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
      const envelope = {
        schema_version: APPROVAL_SCHEMA_VERSION,
        token_digest: tokenDigest,
        ...location.bindings,
        created_at: createdAt.toISOString(),
        expires_at: new Date(createdAt.getTime() + APPROVAL_TTL_MS).toISOString(),
        turn_index: Number.isInteger(turnIndex) && turnIndex >= 0 ? turnIndex : 0,
        used: false
      };
      writeEnvelope(location, envelope, "PENDING");
      return { phrase, envelope, expiresAt: Date.parse(envelope.expires_at), file: location.file, replayed: false };
    });
  });
};

export const invalidateApproval = ({ scope, stateDir, now = Date.now() }) => {
  const location = approvalStatePath({ scope, stateDir });
  return withStateLock(location, () => {
    const current = readCurrent({ scope, stateDir, now });
    if (!new Set(["USED", "EXPIRED"]).has(current.status)) writeEnvelope(current.location, current.envelope, "INVALIDATED");
    return { status: "INVALIDATED" };
  });
};

export const confirmApproval = ({ phrase, scope, stateDir, now = Date.now(), turnIndex } = {}) => {
  const location = approvalStatePath({ scope, stateDir });
  return withStateLock(location, () => {
    const current = readCurrent({ scope, stateDir, now });
    if (current.status !== "PENDING") {
      if (current.status === "CONFIRMED") writeEnvelope(current.location, current.envelope, "INVALIDATED");
      throw new Error(`Approval is ${current.status.toLowerCase()}, not pending`);
    }
    const candidate = String(phrase ?? "").trim();
    if (!isApprovalPhrase(candidate) || approvalPhraseHash(candidate) !== current.envelope.token_digest) {
      writeEnvelope(current.location, current.envelope, "INVALIDATED");
      throw new Error("Approval phrase did not match; the pending envelope is now invalid");
    }
    if (turnIndex !== undefined && (!Number.isInteger(turnIndex) || turnIndex <= current.envelope.turn_index)) {
      writeEnvelope(current.location, current.envelope, "INVALIDATED");
      throw new Error("Approval turn did not follow the issued envelope");
    }
    writeEnvelope(current.location, current.envelope, "CONFIRMED");
    return { status: "CONFIRMED", expiresAt: Date.parse(current.envelope.expires_at) };
  });
};

export const recordUserTurn = ({ message, scope, stateDir, now = Date.now(), turnIndex } = {}) => {
  const value = String(message ?? "").trim();
  const currentLocation = approvalStatePath({ scope, stateDir });
  const active = relatedActiveApprovals({ scope, stateDir });
  const current = active.find((entry) => entry.file === currentLocation.file);
  const drifted = active.filter((entry) => entry.file !== currentLocation.file);

  for (const entry of drifted) invalidateLocation(entry);
  if (!current) {
    if (isApprovalPhrase(value) && drifted.length) throw new Error("Approval scope changed before the phrase was confirmed");
    return { status: drifted.length ? "INVALIDATED" : "MISSING_OR_INVALID" };
  }
  if (isApprovalPhrase(value)) return confirmApproval({ phrase: value, scope, stateDir, now, turnIndex });
  invalidateLocation(current);
  return { status: "INVALIDATED" };
};

export const consumeApproval = ({ scope, stateDir, now = Date.now() }) => {
  const location = approvalStatePath({ scope, stateDir });
  return withStateLock(location, () => {
    const current = readCurrent({ scope, stateDir, now });
    if (current.status === "USED" || current.envelope.used) throw new Error("Approval envelope has already been used");
    if (current.status !== "CONFIRMED") throw new Error(`Approval is ${current.status.toLowerCase()}, not confirmed`);
    const envelope = { ...current.envelope, used: true };
    writeEnvelope(current.location, envelope, "USED");
    return { status: "USED", usedAt: Number(now) };
  });
};

export const inspectApproval = ({ scope, stateDir, now = Date.now() }) => {
  try {
    const current = readCurrent({ scope, stateDir, now });
    return { status: current.status, expiresAt: Date.parse(current.envelope.expires_at), used: current.envelope.used };
  } catch (error) {
    return { status: "MISSING_OR_INVALID", error: error.message };
  }
};

export const approvalAllows = ({ scope, action, paths = [], destinations = [], environment } = {}) => {
  const normalized = normalizeApprovalScope(scope);
  const failures = [];
  if (!normalized.actions.includes(String(action || ""))) failures.push("action-outside-scope");
  const requestedPaths = Array.isArray(paths) ? paths : [];
  if (!requestedPaths.length) failures.push("path-outside-scope");
  for (const candidate of requestedPaths) {
    let target;
    try { target = canonicalApprovalPath(candidate, normalized.repository).replace(/^prefix:/, "exact:"); }
    catch { failures.push("path-outside-repository"); continue; }
    const value = target.slice("exact:".length);
    const allowed = normalized.paths.some((rule) => rule === target || rule === "exact:." || (rule.startsWith("prefix:") && (rule === "prefix:." || value === rule.slice(7) || value.startsWith(`${rule.slice(7)}/`))));
    if (!allowed) failures.push("path-outside-scope");
  }
  const allowedDestinations = new Set(normalized.destinations);
  const requestedDestinations = Array.isArray(destinations) ? destinations : [];
  if (!requestedDestinations.length) failures.push("destination-outside-scope");
  for (const destination of requestedDestinations) if (!allowedDestinations.has(String(destination).trim().toLowerCase())) failures.push("destination-outside-scope");
  const requestedEnvironment = String(environment ?? "").trim().toLowerCase();
  if (!requestedEnvironment || requestedEnvironment !== normalized.environment) failures.push("environment-outside-scope");
  return { allowed: failures.length === 0, failures: [...new Set(failures)] };
};
