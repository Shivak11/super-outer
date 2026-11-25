# Evaluation and variability

## Load boundary

Load for changed prompts, models, retrieval, generated decisions, structured
output, quality claims, provider/model drift, or non-deterministic behavior.

## Review

- Define task-level success, unacceptable outcome, segments, golden cases,
  adversarial cases, scorer limitations, variance, and human review.
- Validate structured output outside the model. Measure useful end behavior, not
  token similarity or builder-selected examples alone.
- Compare current and candidate on the same frozen set; record model/provider,
  configuration, date, sample size, cost, latency, and uncertainty.

## Failure probes and proof

Positive: representative cases meet the threshold. Negative: injection,
ambiguity, missing context, long input, refusal, hallucination, and format drift
stay within policy. Boundary: tone belongs jointly to product UI/content.
Repeat stochastic cases and inspect regressions, not only averages.

## Recovery

Restore the prior evaluated version or deterministic fallback, quarantine failed
outputs, update the regression set, and rerun before promotion.
