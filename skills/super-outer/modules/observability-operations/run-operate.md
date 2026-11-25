# Run and operate

Module ID: `observability-operations` (run-and-operate guidance)

A product keeps needing work after it ships. This guidance covers the routine
checks that stop a live product from breaking quietly. It loads at the first
deploy and at each milestone sweep. Answers come from evidence first: the
deploy config, the platform's dashboards and the provider pages in the
[catalogue](../../references/catalogue/). The owner is asked only a threshold that
evidence cannot set, such as a monthly cost limit.

## Model deprecations

- List every model name the code calls and where it is set.
- Read each provider's deprecation page and record the retirement date of any
  model in use. A model retiring within 90 days is a release blocker for the
  next milestone.
- Keep the model name in one configuration place, so a replacement is one
  change followed by the AI evaluation replay set.

## Secret age

- List each secret the product uses, where it is stored and when it was last
  rotated. Never record the secret's value.
- Mark a secret older than 12 months, or one that has appeared in a log, a
  trace or a URL, for rotation. Read [lessons](../../references/lessons.md)
  for secrets that platforms record by default.

## Backup and restore drills

- Name the backup feature for each data store and how far back it reaches,
  such as D1 Time Travel or Supabase daily backups.
- Run a restore on a copy, never on production, and record the date, the
  restore point and how long it took. A backup that has never been restored
  is unproved.

## Cost alarms

- Set a spending alert on each paid provider at the monthly budget in the
  product brief, and a per-user limit on model calls once outside users
  arrive.
- Record each alert's threshold and who receives it.

## Incident handling

- Write one page: how to see that the product is broken, who is told, how to
  switch off the failing feature, and how to roll back the last release.
- After an incident, add a lesson to the lessons file when the cause would
  recur in another project.

## Result

Return findings in the [specialist result
contract](../../references/specialist-result-contract.md), with one
`existing_evidence` row per check above and its date.
