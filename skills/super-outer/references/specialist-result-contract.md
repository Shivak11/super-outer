# Specialist result contract

Version: `1`

Every selected specialist returns one schema-valid object to the router.
Specialists do not
interview the user, mutate files, or claim delivery. Use these fields in this
order so the router can compare and deduplicate peer findings:

1. `schema_version`: exactly `1.0.0`.
2. `module`: stable router module identifier.
3. `applicable`: boolean. Include `trigger_evidence` strings when true; when
   false, include one concrete non-trigger reason.
4. `risk`: `none`, `low`, `medium`, `high`, or `critical`. Add
   `user_consequence` when risk is not `none`. Risk is not module importance.
5. `decisions`: zero or more objects with `kind`, `statement`, and optional
   `recommendation`. Classify each as `invariant`, `evidence_tradeoff`, or
   `interpretive`.
6. `benchmark_evidence`: objects containing `classification`, `source`,
   `inspected_at`, `applicability`, `limitation`, `confidence`, and
   `query_privacy`. State `none_found` honestly.
7. `existing_evidence`: objects containing `status`, `source`, and `fact` for
   repository-profile facts, code, tests, runtime signals, and precedent
   actually inspected. Preserve `EXPLICIT`, `OBSERVED`, and `UNKNOWN`; never
   promote an observation into policy.
8. `unknowns`: only gaps that could change product behavior, risk, recovery, or
   the evidence bar.
9. `proposed_questions`: zero or more schema-valid router candidates. Each has
   `why`, `question`, two or three outcome `options`, and the zero-based
   `recommended` option index. The router alone may ask them.
10. `verification`: executable checks and direct observations, including a
   negative or adversarial case and the exact surface where the claim lives.
11. `recovery`: containment, safe retry conditions, cleanup, rollback, and a
    stop condition.

## Rules

- Return `applicable: false` and `risk: none` instead of inventing work.
- Apply invariants without a ceremonial question.
- Research mechanism choices; ask only for a product or risk threshold that
  evidence cannot determine.
- Keep implementation vocabulary in evidence unless the user requests it.
- Separate source, CI, package, installation, runtime, and direct-journey proof.
- Do not lower another peer's result because this module appears earlier or
  later. Module order has no meaning.
