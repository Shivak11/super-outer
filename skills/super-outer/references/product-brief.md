# Product brief

The product brief holds the facts that every later decision about a product
depends on: who uses it, how many, what must never go wrong, and what the owner
can spend. It is written once per repository, at
`.engineering/super-outer/product-brief.md`, and every later task reads it
instead of asking again. The [journey map](journey-map.md), the
[story walk](story-walk.md) and their results are saved in the same file.

Contents:

- [When it runs](#when-it-runs)
- [What the file holds](#what-the-file-holds)
- [Facts](#facts)
- [Story](#story)
- [Walk](#walk)
- [Design](#design)
- [Stack](#stack)
- [Deferred](#deferred)
- [The interview](#the-interview)
- [How later work uses it](#how-later-work-uses-it)
- [Anchors and the scale ladder](#anchors-and-the-scale-ladder)
- [Question bank](#question-bank)
- [Example: the study-buddy agent](#example-the-study-buddy-agent)
- [Facts](#facts)
- [Story](#story)

## When it runs

| Work | Brief |
|---|---|
| New product, new feature, overhaul or new subsystem | Write the brief, or add to it, before the journey map and the story walk |
| Fix, regression or maintenance | Never written and never asked about. Read it if it exists |

- In an empty repository, start from the owner's request and run the
  interview below.
- In an existing repository, draft the brief from what the code already shows:
  the hosting and database in use, sign-in, payments, uploads, the languages
  and currencies on screen, and any region settings. Mark every drafted fact
  `assumed`, show the draft, and offer the interview. Never block the work on
  the interview. If the owner does not take the interview, continue on the draft. Save the
  draft to the brief file either way, so the offer is made once per repository.
- When the owner asks for a brief to compare the existing build against, or
  for a design from scratch, keep the interview blind: do not draft from the
  code, do not skip a question because the repository answers it, and
  recommend answers from general practice. Afterwards score the build in two
  lists: what any competent build must meet, and what the interview set. The
  build is not marked down against requirements it was never given.
- When a brief exists, read it first. Ask only about facts the new work needs
  and the brief does not hold, then add the answers to the brief.

## What the file holds

The file starts with a short header that Super-outer's prompt hook reads,
followed by the facts and the result of the story walk.

```markdown
---
schema: super-outer-product-brief/1
kind: <open label for the kind of system, such as "long-running agent with per-user memory">
daily_users: <integer for a normal day; omit if unknown>
launch_spike: <true or false; omit if unknown>
updated: <YYYY-MM-DD>
---

# Product brief: <product>

## Facts
| Fact | Value | Status |
|---|---|---|
| Who uses it | | decided <date> or assumed: <reason> |
| Device | | |
| Where they are | | |
| Now anchor | | |
| Next anchor | | |
| Users on a normal day: now, at launch, in 12 months | | |
| Launch day or campaign spike | | |
| Most common action | | |
| Must never go wrong | | |
| Acceptable data loss | | |
| Budget per month | | |
| Sensitive data | | |
| Data must stay in | | |
| Accounts and sign-in | | |
| Payments | | |
| Uploads or recordings | | |
| Sharing between people | | |
| Messages the product sends | | |
| AI features | | |
| Outside companies that receive personal data | | |
| Children use it | | |

## People
## Journey
## Personal data
## Who can do what
## Launch list
## Dependencies
## Story
## Walk
## Design
## Stack
## Deferred
```

- Mark every fact `decided` when the owner said it, with the date, or
  `assumed` when the agent chose it, with the reason.
- Keep the four header fields in step with the facts below them.
  `daily_users` holds the largest of the three normal-day figures, which is
  usually the one for 12 months ahead. The `daily_users` and `launch_spike`
  values carry their `decided` or `assumed` marking in the Facts table, never
  in the header.
- The hook reads only the header. It adds a line asking for the scale
  specialist on requests that touch the busiest paths when `daily_users` is above 10,000 or `launch_spike` is
  `true`. It shows its brief line only when the file is missing and the work is
  a new product, feature, overhaul or new kind of system.
- The Story, Walk, Design, Stack and Deferred sections follow the formats in
  [story walk](story-walk.md). Stack names one recommendation, one runner-up
  and the reason for the choice.
- The People, Journey, Personal data, Who can do what, Launch list and
  Dependencies sections follow [journey map](journey-map.md). The last eight
  rows of the Facts table are filled from the map, and the built-in
  architecture pack reads them.

## The interview

- Ask in rounds of at most five questions. Each question carries a recommended
  answer, and a reply of "yes" accepts every recommendation in the round.
- Put the round's questions in the last message of the turn, after any
  research has returned, so the owner answers from one place. A choice the
  owner would see, such as how long memory is kept or who can see it, is asked
  with its recommendation, never decided silently.
- There is no limit on the number of rounds. Stop when no fact the customer
  would see or feel is still `assumed`.
- The owner can skip at any point. A skipped question takes its recommended
  answer and stays `assumed`.
- Skipping the questions never skips the plan. "Don't ask me anything" or
  "use your defaults" means take every recommended answer; it does not mean
  build without showing the plan. Write the brief, draw the journey map, run
  the story walk, show each person's journey table, the launch list, the
  dependencies, the walk table, the now-and-later parts and the stack with its
  runner-up, and build nothing until the owner replies.
- Apply the relevance test to every question before asking it. Ask only when
  the answer changes the design, the stack, or whether a fix is built now or
  later. Otherwise take the recommended answer, mark it `assumed`, and do not
  ask. This test keeps an interview with no round limit from turning into a
  survey. The [journey interview](journey-map.md#the-journey-interview) asks
  more: it also asks when the answer changes what the person sees or can do
  at a step.
- Write each question about customers, money or moments. Never ask the owner
  to choose a tool or a mechanism. Each question follows
  [plain-English questions](plain-english-questions.md) and its audit: one
  decision and at most 28 words.
- The interview sits outside the per-task question allowance. A `QUICK`
  route's limit of one or two questions does not apply to it.
- Write the brief as soon as the interview ends, before the journey map and
  the story walk start.

## How later work uses it

- A later task never asks a question the brief already answers. It cites the
  fact instead.
- The intent record in [product intent](product-intent.md) takes who the user
  is and which device they use from the brief.
- The assumption-confirmation block in product intent leaves out anything the
  brief already holds.
- The repository profile's product and scale sections cite the brief.
- When a later answer changes a fact, update the fact, its status, its date and
  the header's `updated` field.

## Anchors and the scale ladder

Purpose and scale come first. Before any dimension interview, the brief
records two anchors: where the product is now and the next step it is heading
for, for example "now: 1 owner; next: 100 users in weeks". Write them in the
Facts table as `Now anchor` and `Next anchor`, each with its status.

- Build for the next anchor only. Work for a later step is written down, with
  its trigger, and is not built.
- A personal tool still gets both anchors. Draft them from the evidence, such
  as "now: 1 owner; next: 1 owner", and confirm them with the owner in one
  question with the draft as the recommended answer.
- Write a scale ladder at 100, 10,000 and 1,000,000 users. For each step, say
  what breaks with the current design and what to adopt at that step, such as
  per-user cost limits, sign-in, a queue or a managed workflow service. Read
  [lessons](lessons.md) and the stack's [catalogue](catalogue/) first, so the
  adoption fits the stack the project already uses.
- Write each ladder step that the product has not reached to the ledger as a
  deferral with a `ladder` field naming the stage (`100`, `10000` or
  `1000000`) and a `measuredWhen` condition on a number the platform measures,
  such as active users a day, messages a day, p95 reply time or monthly cost.
  When the trigger fires, the scout runs the research again at that time,
  instead of locking in today's choice.

```json
{
  "id": "ladder-10000-queue",
  "prompt": "Move background replies onto a managed queue when messages pass 20,000 a day",
  "why": "Polling from the request path stops keeping up; 20,000 is a judgement",
  "status": "DEFERRED",
  "ladder": "10000",
  "revisitWhen": ["queue consumer"],
  "measuredWhen": [
    { "metric": "messages_per_day", "comparison": ">=", "threshold": 20000,
      "says": "messages pass 20,000 a day" }
  ],
  "recorded_at": "2026-10-22"
}
```

The [dimensions by phase](dimension-phases.md) table says which dimensions
each step opens.

## Question bank

Each row is a universal fact, a sample question, and the usual recommended
answer. Adjust the wording to the product, and drop any row that fails the
relevance test.

| Fact | Question | Usual recommendation |
|---|---|---|
| Who | Who is the person who will use this most often? | The person the request describes |
| Device | Will most people use it on a phone or on a computer? | A phone, unless the request implies desk work |
| Where | Where will most of your customers be? | The country the request names |
| Normal day | In the first month, about how many people will use it on a normal day? | A few hundred |
| In 12 months | If it goes well, how many people will use it on a normal day a year from now? | Ten times the first month |
| Launch | Will a launch day or campaign bring many people at the same moment? | No |
| Most common action | What will people do most often each time they open it? | The action the request leads with |
| Never wrong | What is the one thing that must never go wrong for a customer? | Losing what they saved, or paying twice |
| Data loss | If the server failed, could customers lose the last few minutes of their work, or nothing at all? | A few minutes |
| Budget | What is the most you can spend each month on hosting and services at launch? | The owner names a ceiling |
| Sensitive data | Will it store health details, payment details, or information about children? | No |
| Data location | Does any customer or law require their data to stay inside one country? | No legal need, and host near the customers |
| Who changes it | Will someone other than a developer need to change prices, text or rules? | Not at launch |
| Deletion | When a customer deletes their account, should everything about them be removed? | Yes |

## Example: the study-buddy agent

The owner asked: "Build me a study-buddy agent that remembers each student
across the semester."

```markdown
---
schema: super-outer-product-brief/1
kind: long-running agent with per-student memory
daily_users: 2000
launch_spike: true
updated: 2026-10-12
---

# Product brief: study buddy

## Facts
| Fact | Value | Status |
|---|---|---|
| Who uses it | College students revising for exams | decided 2026-10-12 |
| Device | Phone browser | assumed: students revise on phones between classes |
| Where they are | India | decided 2026-10-12 |
| Users on a normal day | 300 now, 2,000 at launch, 2,000 in 12 months | decided 2026-10-12 |
| Launch day or campaign spike | Yes: exam week, with 800 students online at 9 pm | decided 2026-10-12 |
| Most common action | Ask a question about a topic and ask for another example | decided 2026-10-12 |
| Must never go wrong | One student sees another student's history | decided 2026-10-12 |
| Acceptable data loss | The last few minutes of a session | assumed: recommended answer accepted |
| Budget per month | AI spend per student capped by the owner (question 4) | decided 2026-10-12 |
| Sensitive data | Students' names and study history | assumed: no health or payment data |
| Data must stay in | No legal requirement; hosted in India, near the students | assumed: recommended answer accepted |

## Story
Priya, a second-year student, asks for help with recursion, asks for another
example, comes back the next evening during exam week with 800 others online,
says she learns better with diagrams, and later finds an answer that does not
follow the marking scheme.
```

The Walk, Design, Stack and Deferred sections for this brief are shown in the
[story walk](story-walk.md) example.
