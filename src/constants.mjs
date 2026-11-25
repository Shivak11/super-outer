export const SUPER_OUTER_VERSION = "6.6.0";
export const CONTRACT_VERSION = "1.0.0";

export const REPOSITORY_PROFILE_PATH =
  ".engineering/super-outer/repository-profile.json";

export const PROFILE_STATUSES = Object.freeze([
  "EXPLICIT",
  "OBSERVED",
  "UNKNOWN",
]);

export const PROFILE_SECTION_IDS = Object.freeze([
  "product",
  "ui",
  "frontend",
  "backend",
  "data",
  "security",
  "scale",
  "operations",
  "delivery",
]);

export const AUTHORITY_ORDER = Object.freeze([
  Object.freeze({
    rank: 1,
    id: "binding",
    label:
      "Binding legal, security, privacy, data-integrity, and accessibility constraints",
  }),
  Object.freeze({
    rank: 2,
    id: "company-contract",
    label: "Explicit company contracts",
  }),
  Object.freeze({
    rank: 2,
    id: "repository-contract",
    label: "Explicit repository contracts",
  }),
  Object.freeze({
    rank: 3,
    id: "official-platform",
    label: "Official platform and runtime behavior",
  }),
  Object.freeze({
    rank: 4,
    id: "evidence-backed-practice",
    label: "Evidence-backed engineering practice",
  }),
  Object.freeze({
    rank: 5,
    id: "local-precedent",
    label: "Observed local precedent",
  }),
  Object.freeze({
    rank: 6,
    id: "external-style-gap-fill",
    label: "External stylistic precedent where local direction is absent",
  }),
  Object.freeze({ rank: 7, id: "unknown", label: "Unknown authority" }),
]);

export const DECISION_KINDS = Object.freeze([
  "invariant",
  "evidence_tradeoff",
  "interpretive",
]);

export const REVIEW_MODES = Object.freeze([
  "SMALL_SAFE",
  "QUICK",
  "FOCUSED",
  "FULL",
  "CRITICAL",
]);

export const QUESTION_BUDGETS = Object.freeze({
  SMALL_SAFE: 0,
  QUICK: 2,
  FOCUSED: 4,
  FULL: 7,
  CRITICAL: 7,
});

/**
 * A greenfield archetype route raises the ceiling instead of truncating. This
 * is the one moment when asking is cheapest and a wrong assumption is most
 * expensive; cutting to seven here would drop exactly the questions worth
 * asking. The floor, the budget's binding behaviour, and the mechanical audit
 * are all unchanged.
 */
export const ARCHETYPE_QUESTION_BUDGET = 12;

/**
 * Archetypes fill an empty room rather than crowding a full one. At or above
 * this many evidence-selected specialists, anticipation is already happening
 * and bulk-adding more would unbalance routing and re-create over-asking.
 */
export const ARCHETYPE_ROOM_THRESHOLD = 3;

/**
 * Budgets alone are maxima, so zero satisfied every tier except CRITICAL — and
 * CRITICAL is unreachable for an ordinary feature or bug fix. The floor makes
 * the common tiers account for themselves.
 *
 * A floor is satisfied by a genuine question *or* by one plain disclosure that
 * no judgement call was needed. Requiring a question outright would manufacture
 * the ceremony v4.0.2 removed, relabelled from approval to interview.
 */
export const QUESTION_FLOORS = Object.freeze({
  SMALL_SAFE: 0,
  QUICK: 1,
  FOCUSED: 1,
  FULL: 1,
  CRITICAL: 1,
});

export const SCORE_DIMENSIONS = Object.freeze([
  "impact",
  "uncertainty",
  "novelty",
  "irreversibility",
  "boundaries",
  "evidenceGaps",
]);

const moduleDefinition = (id, name, triggerGroups) =>
  Object.freeze({ id, name, triggerGroups: Object.freeze(triggerGroups) });

/**
 * The array is a registry, not a priority list. Routing ranks candidates by
 * evidence score and uses the stable module id only to break exact ties.
 */
export const SPECIALIST_MODULES = Object.freeze([
  moduleDefinition("product-ui-ux-motion", "Product UI/UX and Motion", {
    visible: [
      "ui",
      "ux",
      "screen",
      "interface",
      "visual",
      "interaction",
      "navigation",
      "copy",
      "content",
      "gesture",
      "accessibility",
    ],
    motion: ["animation", "motion", "transition", "reduce motion", "haptic"],
  }),
  moduleDefinition("frontend-client", "Frontend and Client Engineering", {
    client: [
      "frontend",
      "client",
      "react",
      "mobile",
      "ios",
      "android",
      "browser",
      "component",
      "render",
      "state management",
      "account state",
      "optimistic state",
      "reconnect",
      "backgrounding",
      "static label",
      "password reset",
      "biometric unlock",
      "offline",
    ],
  }),
  moduleDefinition("backend-api", "Backend and API Engineering", {
    service: [
      "backend",
      "api",
      "service",
      "endpoint",
      "server",
      "worker",
      "webhook",
      "business rule",
      "background job",
      "api request",
      "external call",
      "dependency timeout",
      "same request",
      "token validation",
      "password reset",
      "admin impersonation",
    ],
  }),
  moduleDefinition("data-migrations", "Data and Migrations", {
    storage: [
      "database",
      "schema",
      "migration",
      "backfill",
      "table",
      "record",
      "records",
      "store",
      "storing",
      "persist",
      "stored data",
      "retention",
      "data store",
      "read query",
      "dataset",
      "data-shape",
      "key storage",
    ],
  }),
  moduleDefinition("security-privacy-abuse", "Security, Privacy and Abuse", {
    trust: [
      "authentication",
      "authenticated",
      "authorization",
      "permission",
      "secret",
      "privacy",
      "sensitive data",
      "payment",
      "hostile input",
      "abuse",
      "identity",
      "privileged",
      "oauth",
      "password",
      "passkey",
      "multi-factor",
      "mfa",
      "two-factor",
      "2fa",
      "single sign-on",
      "sso",
      "access token",
      "refresh token",
      "dependency token",
      "biometric unlock",
      "admin impersonation",
      "public endpoint",
      "public read endpoint",
      "tenant id",
      "cross-tenant",
      "encryption key",
      "certificate rotation",
      "cert rotation",
    ],
  }),
  moduleDefinition("scale-performance-cost", "Scale, Performance and Cost", {
    capacity: [
      "high volume",
      "high-volume",
      "throughput",
      "latency",
      "concurrency",
      "fan-out",
      "queue",
      "performance",
      "capacity",
      "saturation",
      "cost",
      "expensive",
      "quota",
    ],
  }),
  moduleDefinition("reliability-recovery", "Reliability and Recovery", {
    failure: [
      "reliability",
      "recovery",
      "retry",
      "timeout",
      "failure",
      "degradation",
      "rollback",
      "availability",
      "external dependency",
      "asynchronous",
      "restart",
      "resumes",
      "checkpoint",
      "stop threshold",
      "process dies",
    ],
  }),
  moduleDefinition(
    "architecture-maintainability",
    "Architecture and Maintainability",
    {
      structure: [
        "architecture",
        "refactor",
        "shared foundation",
        "abstraction",
        "coupling",
        "maintainability",
        "module boundary",
        "dependency direction",
        "shared helper",
        "helper",
        "wrapper",
        "state ownership",
      ],
    },
  ),
  moduleDefinition(
    "compatibility-integrations",
    "Compatibility and Integrations",
    {
      integration: [
        "integration",
        "sdk",
        "protocol",
        "third party",
        "third-party",
        "version support",
        "compatibility",
        "contract drift",
        "mixed version",
        "upgrade",
        "fallback",
        "provider drift",
        "provider version",
        "against the provider",
      ],
    },
  ),
  moduleDefinition(
    "observability-operations",
    "Observability and Operations",
    {
      operations: [
        "observability",
        "telemetry",
        "logging",
        "metrics",
        "alert",
        "runbook",
        "production service",
        "operations",
        "incident",
        "hard to trace",
        "latency",
        "performance",
        "slow",
        "p95",
        "p99",
        "timeout",
        "timed out",
        "correlation",
      ],
    },
  ),
  moduleDefinition("ai-llm", "AI and LLM Systems", {
    model: [
      "ai",
      "llm",
      "model",
      "agent",
      "prompt",
      "retrieval",
      "embedding",
      "generated output",
      "inference",
      "generate a draft",
      "structured output",
    ],
  }),
  moduleDefinition("delivery-release", "Delivery and Release", {
    release: [
      "delivery",
      "release",
      "deploy",
      "deployment",
      "ci",
      "build pipeline",
      "install",
      "branch",
      "worktree",
      "package",
      "environment",
      "production",
      "promotion",
    ],
  }),
]);

export const SPECIALIST_BY_ID = Object.freeze(
  Object.fromEntries(SPECIALIST_MODULES.map((module) => [module.id, module])),
);

export const PROTECTED_DOMAIN_PATTERNS = Object.freeze([
  Object.freeze({
    id: "authentication",
    pattern:
      /\b(?:auth(?:entication)?|authenticated|login|sign[ -]?in|oauth|passwords?(?: reset)?|passkey|multi-factor|mfa|two-factor|2fa|single sign-on|sso|access token|refresh token|session token|biometric unlock|(?:disable|skip|bypass|turn off|remove) (?:all )?(?:auth(?:entication)?|login checks?))\b/i,
  }),
  // Noun heads carry an optional plural. "Handle refunds" and "Add a payments
  // screen" previously failed the trailing word boundary and routed as ordinary
  // work with no security specialist — and the plural is the form people
  // actually use. `s?` keeps `secretary` from matching `secret`, because the
  // boundary still has to land after the optional s.
  Object.freeze({
    id: "authorization",
    pattern:
      /\b(?:authorizations?|access controls?|permissions?|roles?|privileged|admin impersonation|impersonat(?:e|ion)|elevated access)\b/i,
  }),
  Object.freeze({
    id: "payments",
    pattern: /\b(?:payments?|billing|checkouts?|cardholders?|refunds?|subscriptions?|invoices?)\b/i,
  }),
  Object.freeze({
    id: "sensitive_data",
    pattern:
      /\b(?:sensitive data|personal data|private data|health data|financial data|secrets?|credentials?|pii|encryption keys?|signing keys?|private keys?|dependency tokens?)\b/i,
  }),
  Object.freeze({
    id: "destructive_migration",
    pattern:
      /\b(?:destructive migration|drop (?:a )?(?:table|column)|delete all|irreversible migration|truncate)\b/i,
  }),
  Object.freeze({
    id: "production_infrastructure",
    pattern:
      /\b(?:(?:production|prod) (?:infrastructure|database|cluster|environment)|infrastructure as code)\b/i,
  }),
  Object.freeze({
    id: "irreversible_action",
    pattern:
      /\b(?:irreversible|cannot be undone|permanent deletion|delete (?:a |the )?(?:customer|user) account|account deletion|erase (?:all )?(?:customer|user) data|(?:purge|wipe|remove all(?: rows? from)?) (?:all |the )?(?:(?:customer|user|account)s?(?: data| records?)?|(?:customer|user|account)s? table|table (?:data|rows?|records?)|database))\b/i,
  }),
  Object.freeze({
    id: "credential_rotation",
    pattern:
      /\b(?:(?:certificate|cert|tls certificate|credential|secret|encryption key|signing key) (?:rotation|renewal)|rotat(?:e|ing) (?:a |the )?(?:tls )?(?:certificate|cert|credential|secret|encryption key|signing key))\b/i,
  }),
]);
