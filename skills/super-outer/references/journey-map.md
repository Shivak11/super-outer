# Journey map

Before the story walk, map what every person who touches the product does,
from the day they find it to the day they leave, and ask the owner about each
phase. The [story walk](story-walk.md) checks only the moments someone wrote
down. A phase nobody writes, such as a forgotten password, is never checked,
and the features, access rules and outside services it needs never reach the
plan. The map makes every phase a visible decision before a stack is chosen.

Contents:

- [When it runs](#when-it-runs)
- [The people](#the-people)
- [The eleven phases](#the-eleven-phases)
- [The table](#the-table)
- [The journey interview](#the-journey-interview)
- [Each phase opens its failure library](#each-phase-opens-its-failure-library)
- [What the map produces](#what-the-map-produces)
- [What the map feeds](#what-the-map-feeds)
- [An existing product](#an-existing-product)
- [When the owner changes something](#when-the-owner-changes-something)
- [Show the plan, then wait](#show-the-plan-then-wait)
- [Example: the study-buddy agent](#example-the-study-buddy-agent)

The map runs after the first facts of the [product brief](product-brief.md)
are written and before the story walk. It is saved in the brief.

## When it runs

| Work | Map |
|---|---|
| New product, new kind of system, overhaul | The whole map, for every person |
| New feature in an existing product | Only the phases the feature touches are asked about. See [an existing product](#an-existing-product) |
| Fix, regression or maintenance | Never drawn and never asked about. Read it if it exists |

## The people

Draw one table for each of these people.

- **The main user.** The person in the brief's "Who uses it" row. Give them a
  real name that fits, as the story walk does.
- **Each second role** the request or the brief names, or that this kind of
  product usually has, such as a teacher, a seller or a parent. The first
  question of the journey interview settles who they are.
- **The person who runs the product**, always. They set it up, watch what it
  costs, answer a complaint, remove an account and answer a deletion request.
- **A person misusing it**, whenever anyone other than the owner can reach
  the product. The usual three are someone with no account, someone with an
  account reaching another person's data, and someone running up the bill.

A personal tool that only its owner uses has one table. Its owner is both the
main user and the person who runs it.

## The eleven phases

1. **Finds it.** A store listing, a link, an invitation or a page.
2. **Signs up** and shows who they are.
3. **First use.** The permissions the product asks for, and what the person
   brings in: files and their formats, an import, an account they already
   have somewhere else.
4. **Main use.** The most common action in the brief.
5. **Comes back.** The next day, on another device, to unfinished work.
6. **Pays.** The first payment, a renewal, a failed payment, a refund.
7. **Shares or invites.** What the other person can see and do.
8. **Gets a message** from the product: push, email, SMS or WhatsApp.
9. **Loses access.** A forgotten password, a new number, a lost phone.
10. **Asks for help** when something goes wrong: a wrong result, a report of
    abuse, a mistake to undo.
11. **Leaves.** Cancels, takes their data out, deletes the account.

## The table

One table per person. The header row starts `| Phase for`, which is the text
Super-outer looks for in the brief and the intent records.

| Phase for <name>, <who they are> | What happens | What they can do here, and how they can tell | Where they could get stuck, or what could break | Data it creates, and who can see it | What the product needs | When |
|---|---|---|---|---|---|---|

- **What happens.** One sentence about what the person does. When the phase
  changes saved data, the sentence also says how they arrived, what they do
  next and how they back out.
- **What they can do here, and how they can tell.** The action open to the
  person at this step, and the sign that shows it is there and that it worked
  (the affordance and its signifier). For a product with no screen, the sign
  is what the product says or sends back.
- **Where they could get stuck, or what could break.** The likely wrong
  guess, the hidden action, the wait, and the fault a person is likely to
  meet at this step.
- **Data it creates, and who can see it.** Each kind of data the step creates
  or shows, and everyone who can see it, including any outside company it is
  sent to.
- **What the product needs.** The feature in plain words, and any outside
  service, account, approval or legal page. It never names a product. The
  stack recommendation names products.
- **A row for the person misusing it** is written the other way round. "What
  happens" is what they try. The third column is what the product lets them
  do and what they see when it stops them. "What the product needs" is the
  block.
- **When.** One of four entries:
  - `Launch` for a row the first release needs;
  - `Launch (question N)` for a row that waits on the owner's answer;
  - `Later, when <measured signal>` for a row a measured signal brings due;
  - `Does not apply: <reason>` for a phase this person never meets.

  A launch row is any row whose "When" starts with `Launch`. Until the owner
  confirms a row, write `assumed` after its entry, as in `Launch, assumed`. A
  phase that does not apply keeps its row: the phase in the first column,
  `Does not apply: <reason>` under "When", and the cells between left empty.

A whole map has a row for every phase of every person, so a skipped phase is
a decision the owner can see. A plain product stays small: a personal to-do
list has one person, most phases read `Does not apply`, and the map adds
nothing to what is built.

Save each person's table to the brief's `## Journey` section as soon as it is
drafted, so a session that ends early loses nothing. A feature in an existing
product saves its rows in the intent record for that surface.

## The journey interview

Draft every row first, from the request, the brief, the code and the
libraries below. Then put the journey to the owner, phase by phase and in
order, so the whole likely journey is settled before anything is built.

- For a whole map, the first question settles the people: who else uses the
  product or looks after it, besides the main user. Recommend the people this
  kind of product usually has. A feature in an existing product skips this
  question unless it adds a new kind of person.
- Ask in rounds of at most five questions. Every question carries a
  recommended answer, and a reply of "yes" accepts the round.
- For the main user, every phase that applies gets at least one question. For
  every other person, every phase in which they do something gets one.
- A phase can be asked about four things. Ask the ones the evidence did not
  settle, and never fewer than one for a phase.

  | About | A question in this form |
  |---|---|
  | What the person does | "Where will Priya first hear about it: a link from her teacher, the college portal, or an app store?" |
  | What they can do, and how they can tell | "The first time she opens it, what is the one thing she should be able to do straight away?" and "How should she know her question was received?" |
  | Where they could get stuck | "If she types her number wrong, how should she put it right?" |
  | What they see when it breaks | "If her network drops halfway through an answer, what should she see when she returns?" |

- Phases that look as if they do not apply are listed in one line for the
  owner to correct. They are not asked one by one.
- End each round by naming the phases still to come.
- Write every question about the named person, in their words, following
  [plain-English questions](plain-english-questions.md): one decision and at
  most 28 words. A question never uses design or developer vocabulary and
  never asks the owner to choose a tool.
- The owner can skip at any point. A skipped question takes its recommended
  answer, and its row is marked `assumed`.
- The interview sits outside the per-task question allowance, as the brief
  interview does.
- This interview asks more than the brief's relevance test allows elsewhere.
  Ask a question when its answer changes what the person sees or can do at
  that step, the launch list, the stack, or a rule about personal data.
- For a feature in an existing product, ask only about the phases the feature
  touches.

## Each phase opens its failure library

A phase marked `Launch` opens its libraries from
[references/archetypes](archetypes/), whether or not the request used their
words.

| Phase | Libraries |
|---|---|
| Finds it | `launch-surfaces` |
| Signs up | `authentication` |
| First use | `mobile-capture-upload` when they record or upload; `llm-feature` when an AI model reads what they bring in |
| Main use | The library for the kind of product, such as `ai-agent-product` or `llm-feature` |
| Comes back | `ai-agent-product`, for its moments over time, when the product keeps work |
| Pays | `payments-subscription` |
| Shares or invites | `teams-and-roles` |
| Gets a message | `notifications-messaging`, `email-deliverability` |
| Loses access | `authentication` |
| Asks for help | `admin-support-tools`, `help-and-release-notes` |
| Leaves | `data-rights`, `retirement` |
| The person running it | `admin-support-tools`, `product-analytics`, `new-product-setup` |

- `safe-activation`, `data-migration` and `cross-system-rollout` have no
  phase. They belong to a change in an existing product and open as before.
- Handle each opened failure mode the usual way: check the repository first,
  then mark it `now`, `decide` or `defer`. A `defer` goes to the ledger and
  is never asked.
- A `now` or `decide` mode becomes a row with its recommended answer, and is
  asked in that phase's round.
- These questions are part of the journey interview and sit outside the
  per-task question allowance. The twelve-question ceiling for a matched
  library applies to work that has no journey interview.

## What the map produces

Write these in the brief when the interview ends.

- **Facts.** Fill the brief's rows for accounts and sign-in, payments,
  uploads or recordings, sharing between people, messages the product sends,
  AI features, outside companies that receive personal data, and whether
  children use it. The built-in architecture pack reads these rows.
- **Personal data.** One line per kind of data: where it is created, who can
  see it, which outside company receives it, how long it is kept and how it
  is deleted.
- **Who can do what.** One line per person: what they can see and what they
  can change.
- **Launch list.** Every feature a `Launch` row needs, each with the row it
  comes from. A `Later` row goes to the brief's Deferred section and the
  ledger with its measured signal, as the story walk describes.
- **Dependencies.** Every outside service, account, approval and legal page
  a `Launch` row needs.

  | What | Needed for | Who acts | Waiting time |
  |---|---|---|---|

  Read a waiting time from the provider's current page on the day, or write
  "not looked up". Never write one from memory. A rule that depends on a
  country or a kind of data, such as children's data, is read from the
  regulator's current page and dated, the same way stack prices are.

The stack recommendation in the story walk must carry every line of the
launch list and the dependencies.

## What the map feeds

- **The story walk.** Its moments come from the `Launch` rows.
- **The design.** For a user-facing product, each `Launch` row's "what they
  can do here, and how they can tell" becomes a claim in the
  [intent record](product-intent.md). The design package shows it, and the
  [experience review](experience-review.md) checks it on the rendered screen.
- **The edge cases.** The `edge-cases` skill starts from each row's "where
  they could get stuck, or what could break" and names the test that proves
  each one handled.
- **The finished-product walk.** Each `Launch` row is performed on the built
  product for each person, as the experience review describes.
- **The security specialist.** It reads the personal data list and the
  who-can-do-what list before its own review.

## An existing product

- When an existing product has no map and a new feature arrives, draft the
  whole product's map from the code once. Say one line first, such as
  "Drafting the journey map from the code (about 3 minutes)." Mark every row
  `assumed`, save it, and show it. Never hold up the feature for it.
- Then ask only about the phases the feature touches.
- A later feature reads the saved map and changes only the rows it touches.

## When the owner changes something

- **A detail** gets a dated change line under the table. Rewrite the personal
  data list and the who-can-do-what list from the changed row, so the table
  and the lists agree.
- **A scope change** follows [requirement changes](requirement-changes.md). A
  new audience gets its own table. A new device or place changes the phases
  it touches. A new capability adds or changes rows.

## Show the plan, then wait

Show the owner each person's table, the launch list and the dependencies
together with the walk table and the stack. Nothing is built until the owner
replies. This holds when the owner skipped every question or asked for
defaults: defaults replace answers, never the owner's look at the plan.

## Example: the study-buddy agent

The request was "Build me a study-buddy agent that remembers each student
across the semester." The brief is in the [product brief](product-brief.md)
example.

The first round for the student:

1. Besides students, who else will use this or look after it: a teacher, a
   parent, someone in the college office? Recommended: a teacher, and you
   running it.
2. Where will Priya first hear about it: a link from her teacher, the college
   portal, or an app store? Recommended: a link from her teacher.
3. Should she sign in with a phone number or a college email? Recommended:
   phone number.
4. The first time she opens it, what is the one thing she should be able to
   do straight away? Recommended: type a question.
5. How should she know her question was received? Recommended: the answer
   starts appearing within two seconds.

> These phases look like they do not apply: Pays (the college pays) and
> Shares. Tell me if either is wrong. Still to come: coming back, messages,
> losing access, asking for help and leaving, then the teacher, you, and
> someone misusing it.

The student's table when the rounds end, shortened:

| Phase for Priya, a student | What happens | What she can do here, and how she can tell | Where she could get stuck, or what could break | Data it creates, and who can see it | What the product needs | When |
|---|---|---|---|---|---|---|
| Finds it | Her teacher posts a link in the class group | Open the link. The page says in one line what it does and shows one button, "Start" | The link opens inside the chat app's own browser, where a sign-in may not carry over | None | A page that works inside that browser; a web address | Launch |
| Signs up | Signs in with her phone number | Type her number and get a code. The screen says a code was sent and counts down to "send again" | The code arrives late or never; she types the number wrong | Phone number: Priya and the owner | Sign-in by one-time code with "send again" and "change number"; a registered SMS sender | Launch |
| Main use | Asks about recursion, then for another example | Type a question. The answer starts appearing within two seconds, and "Another example" sits under each answer | The network drops halfway through an answer | Her questions and the answers: Priya, and the AI model company | The chat; a partial answer kept when the network drops; an AI model account | Launch |
| Comes back | Opens it the next evening on a laptop | Continue where she stopped. Yesterday's session is at the top, titled with its topic | She signs in with a different number and sees nothing | A summary of each session: Priya | History that follows her account across devices | Launch |
| Pays | | | | | | Does not apply: the college pays |
| Loses access | Gets a new phone number in second year | Move her history to the new number from the sign-in screen | She no longer has the old number to receive a code | Old number, new number | A way to move history that does not need the old number | Later, when the first student asks |
| Asks for help | Reports a wrong answer | Mark an answer as wrong. The button sits beside each answer and reads "Sent to your teacher" after a tap | She cannot tell whether anyone read the report | The answer and her note: Priya and the owner | A "this is wrong" button and a list of reports for the owner | Launch |
| Leaves | Deletes her account after the semester | Delete everything. The screen lists what will be removed and asks once | Copies remain at the AI company or in backups | Everything about her | Deletion that reaches every copy | Launch |

The teacher, the owner and a person misusing the product each get a table
with the same columns. The teacher writes the marking scheme and sees which
topics the class struggles with. The owner checks the AI bill against a cap
per student, switches off an account that abuses the product and answers a
deletion request. A person misusing it scripts the sign-up form to send
thousands of codes, or types another student's number to read their history.

The launch list holds sign-in by one-time code, the chat, session history,
the scheme editor, the class view, the spending cap, the wrong-answer button,
account switch-off and deletion that reaches every copy. The dependencies are
a web address, a registered SMS sender, an AI model account with a spending
cap and a privacy page.
