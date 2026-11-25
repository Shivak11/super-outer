# Changelog

## 6.6.0 public release - 2026-11-25

The complete Super-outer is now public under the MIT licence. It replaces the starter skill that this repository held before.

- The release holds the full plugin for Claude Code, Codex and Cursor: the prompt hook, the router skill and its twelve specialist modules, six review roles, four companion skills, the command-line tool, the installer, the optional learning skills, the tests and the evals.
- The optional status strip for Claude Code is not part of the public release. `npm run setup` now offers one optional part, the learning skills: use `--components skills` or `none`.
- The recorded eval results are in `evals/reports/`, each with its date and version. `npm run eval:check` checks the eval suite offline.
- The README and the five C5 views in `docs/architecture/views/` are new.
- Working notes, internal plans and private evidence history are not part of the public tree. Examples that named real projects or people now use neutral names, and test messages taken from real sessions are rewritten.
- The Claude Code marketplace in `.claude-plugin/marketplace.json` now points to this repository.

## 6.6.0 - 2026-11-18

Super-outer now asks you about every phase of every person's journey before it chooses a stack, and walks that journey again on the finished product. The owner asked for this on 18 November 2026: discovery was missing features, access rules and privacy needs because the whole journey was never laid out.

- **The journey map.** For a new product, a new kind of system or an overhaul, the agent draws one table per person: the main user, each second role, the person who runs the product, and someone misusing it. Each table goes through eleven phases, from finding the product to leaving it. A row records what happens, what the person can do there and how they can tell, where they could get stuck or what could break, the data it creates and who can see it, what the product needs, and when. A phase that does not apply is written down as such, so a skipped phase is a decision you can see.
- **The journey interview.** The agent drafts every row, then asks you about the journey phase by phase and in order, five questions at a time, each with a recommended answer. The first question settles who else uses the product or looks after it, so a person your request never named is not skipped. The questions are about the named person: what they do, what they can do and how they can tell, where they could get stuck, and what they see when something breaks. Each round names the phases still to come. You can skip at any point, and nothing is built until you have seen the result.
- **Each phase opens its failure library.** Signing up opens the sign-in library, paying opens payments, leaving opens data rights, and so on, whether or not your request used those words. Before this release a request such as "a marketplace where tutors list classes and parents book and pay" opened the payments library only.
- **Four lists from the map.** The personal data the product holds and who can see it, who can do what, the launch list, and the dependencies: every outside service, account, approval and legal page, with who must act. A waiting time is read from the provider's current page or written as "not looked up".
- **The brief holds more facts.** Accounts and sign-in, payments, uploads, sharing, messages, AI features, outside companies that receive personal data, and whether children use it. The built-in architecture pack already depended on these facts and the brief had no place for them.
- **The story walk takes its moments from the map**, so every launch phase and every person is walked, usually in 8 to 14 moments.
- **A scope change updates the map first.** A new audience gets its own table, a new device changes the phases it touches, and only the changed phases are asked about again.
- **An existing product.** When a feature is added to a product with no map, the whole map is drafted from the code once, with every row marked assumed, and only the phases the feature touches are asked about. The feature is never held up for it.
- **The finished-product walk.** When the work has a journey map, the experience review performs each launch row for each person in three states: a new account, an account that already holds data, and after the break the row names. Each row is marked passed, failed or unproved with its evidence. A row about misuse passes only when the product stops the attempt, and the reviewer tries it only in a test environment, on test accounts, at a small scale. Nothing is blocked.
- **One reminder line.** When new work is being planned and neither a journey map nor a story walk is recorded, the existing reminder names both. A repository that already has a recorded walk gets no new line. No hook event was added. Every rule is also in the skill's own text, for hosts where no hook runs. That path is not yet reliable: in a behaviour run with the routing model off, the hook did not read "I want a marketplace where tutors list classes and parents book and pay for them" as new work, and the skill text alone produced no journey map. With the routing model on, the same sentence gets the reminder.
- The main skill file stays inside its tested limits: 404 lines and 3,160 words.
- Six behaviour cases for the journey map were run with and without Super-outer, with the routing model off, for 15.47 dollars. With Super-outer, the second-person case passed both runs, and the sign-in and deletion case and the interview case each passed one run of two; none of the three passed without it. The marketplace case failed both ways, for the reason above. The new-device case passed both ways and does not tell the two apart. The to-do case failed both ways, because the agent built the small app before showing the plan, with and without Super-outer. The per-case results are in `docs/plans/super-outer-v6.6-evals-2026-11-18.json`.

## 6.5.0 - 2026-11-10

Super-outer now learns from a correction, states a finish line for every kind of work, lets an experiment stay light, remembers a permission you already gave, and looks at the live product after a release. The ideas come from Kiro's frontier engineering guide, read in full on 10 November 2026.

- **Learning from mistakes.** When you correct the agent, it fixes what you pointed at and also the instruction, file or assumption that caused the mistake. Lessons have one shape. A lesson about one project stays in that project, and a lesson for every project is shown to you before it joins the kit. `super-outer lessons check` lists lessons that are missing a line, repeated, or ready to be re-tested, and the milestone review runs it. The kit's own lessons grew from two to six.
- **A finish line for all work.** Every task states `Done when`: results another person can check, for server, data and tooling work as well as screens. Where a promise must hold for every input, the proof is a test that generates inputs. The few tests that state the product's promises from outside are named, and a rewrite must still pass them.
- **Decisions taken while you are away.** In an unattended run the agent goes ahead on a choice that is cheap to reverse, writes it down, and lists every such choice at the end with how to reverse it. Product decisions and anything irreversible still wait for you.
- **The experiment track.** Work you call a prototype, a spike or an experiment gets at most one question, no specialists and no design package, and is built in a scratch folder or a `prototype/` branch with made-up data. Keeping the result is a new request at its real depth. The track never applies to work that touches production, real people, real money, stored data, a secret or anything sent outside. The hook adds one line that points the session at the track and changes nothing else: it lowers no depth and skips no question, because whether work touches anything real is a judgement the session makes.
- **Standing answers.** A project can keep your "go ahead without asking" and "never do this" rules in one file, in your words. The agent reads it before asking, so you are not asked the same permission twice. It never replaces the approval phrase, never settles money, people's data or an irreversible action, and a file that arrived with a cloned repository is shown to you before any line in it is used.
- **After release.** At a production release the agent records what to look at in the live product, where, and two dates: the next day and a week later. A session that starts when a look is due says so in one line.
- **What the project lacks for agent work.** `super-outer inventory` now lists missing basics found from the files: a conventions file, one test command, a setup command, a secret scan, an automated review on pull requests.
- **Fewer false alarms, by a small amount.** A replay of 3,107 real requests showed 24 routed as critical through the access-control words, and none was access-control work; most used "role" for a job. Three ways of removing such phrases were built and withdrawn, each after an attack showed real access-control work falling to light care ("add a manager role that can delete users", "the hr role can change payroll", "people apply for a role and once accepted they can wipe the workspace"). A phrase inside a longer request can always sit beside real protected work. So 6.5 removes one thing only: the host's own permission switch typed as the whole message ("bypass permissions on", "approved permission"). Two past requests fall from critical, none rises, and 3,105 are unchanged. A job role keeps the higher care. All 96 attack sentences are a permanent test: each is held to the depth it had on 6.4.0, apart from the three that are the whole-message switch.
- **Jev.** Two new closed questions, "does this message change the product's scope?" and "is this a correction?", are asked about a message typed while work is under way. Jev's answers are only recorded beside the word lists' answers, and the word lists decide, until agreement is measured. They are asked only when the private record is on and only about a message short enough to be a remark. They refuse everything the route reading refuses (a paste, machine text, a host command, a secret anywhere in the message) and receive at most 200 characters.
- **Corrections from the observation log.** One rule for warnings (the large BEWARE and STOP panels are gone from every instruction), a question about what is possible gets an answer and never a build, a read the host denied is not fetched through another tool, builders keep an edit log, acceptance targets are re-derived when scope is cut, a new versioned behaviour is switched on the way the repository's recent ones are, the active account is checked before a first publish, a brief for comparison is taken without reading it from the code, and a version number shared by parallel sessions is reserved.
- The main skill file is no longer than in 6.4.0, because Claude Code keeps only the first 5,000 tokens of a skill after it shortens a long session. Every new rule is in the skill's own text and works on a host with no hook.
- **Eval cases from your own corrections.** When you correct the agent in a short message, the hook saves that correction on your machine as a candidate eval case, and the agent adds what was asked, what it did and what should have happened. Nothing runs and Super-outer sends nothing anywhere. A paste, machine text, text the host wrote, a secret or a person's contact details are never saved, whether the hook or the agent writes the candidate. `super-outer evals candidates` gives the counts only; the words are read with `--text`, in Super-outer's repository. When ten corrections are waiting, the agent drafts them into cases with private details removed, shows you the list and the expected cost, and runs them together once. A correction about how much care a request got becomes a free replay test. Set `SUPER_OUTER_EVAL_CANDIDATES=off` to stop collection.
- Ten behaviour eval cases for the new rules are on disk and were not run with this release. They wait with the collected candidates.

## 6.4.0 - 2026-10-30

A new skill, `edge-cases`, lists the common ways a change can break, ranked by how often each breaks real software and how much harm it does, with the test that would prove each one handled.

- It checks a change against 14 families of common breakage: missing data, too much, the wrong kind of input, a mishandled error, work stopping halfway, the same thing twice, two at once, coming back later, the wrong person, time and place, steps out of order, the release itself, the device, and an AI giving a wrong answer. It drops the families the change cannot meet and reports at most 10 risks, each citing a line of code.
- The families and their starting levels come from 400 bug-fix commits and 419 merged fix pull requests from the author's own repositories. Work stopping halfway caused 24 of 58 serious breakages in interview, transcription and report code, so it comes first for audio, uploads and long pipelines.
- A test counts as covering a case only when it would fail if the case broke. Where a few lines of scratch code outside the repository can show the behaviour, the skill runs them and marks the finding proven.
- It is read-only. Super-outer runs it on `FOCUSED` and deeper plans, where its top findings become the tests that must pass before the work counts as done, at the milestone sweep, and as the failure scout's checklist. Call it with `/super-outer:edge-cases` in Claude Code or `$edge-cases` in Codex.
- The live Codex check now also fails when any skill folder in the package is missing from Codex's list.

## 6.3.1 - 2026-10-28

Codex now loads Super-outer's hooks, and a casually worded feature request mid-build now counts as a change of scope.

- From 4.1.0 the installed plugin carried the Agent Plugins `plugin.json`. Codex reads a plugin with that file through a loader that takes skills and MCP servers but no hooks, so Super-outer's routing, safety and scope-change reminders never ran in Codex. The file stays in the repository, the installable package leaves it out, and the package check refuses a package that carries it. `scripts/check-codex-hooks.mjs` asks an installed Codex which hook events it finds.
- Wishes, new needs, tool choices and new devices now read as scope changes: "I'd also like", "ideally", "it would be great if", "we'd need", "for the parser use", "including phones". Requests aimed at the assistant, such as "fix it if you can" or "see if you can reach it", do not. A bug report that also adds a capability gets the scope line.
- The main skill file now states the duty itself: a new capability, audience, device, file format, integration or named tool mid-build reopens each technical choice it touches against real alternatives, and the dependent work waits for the owner's ok. The procedure records the reading-library case, where research on where the parser would run never compared which parser to use.
- 6.3.1 also ships the 6.3.0 tool check, which reached main in this release.

## 6.3.0 - 2026-10-25

Super-outer now tells you when your project's packages are out of date, and which skills, connections and tools from your own vendors would help the task, before anyone builds on old versions.

- A new command, `super-outer tool-check run`, reads the project's packages and lock files and looks each public one up on npm or PyPI. It reports packages that are deprecated or behind, checks Expo projects against Expo's own version table, and names the packages an upgrade removes. For Expo 54 it says to upgrade one version at a time and names expo-av, which Expo 55 drops.
- It finds the vendors' own skills on skills.sh and their connections (MCP servers) in the MCP Registry. A skill is shown only when it still exists in its repository, no safety scanner failed it, and its instructions hold no hidden text or download-and-run commands. A scanner warning shows the skill with a note, so the vendors' own skills are not hidden by caution alone. The agent then judges fit from the skill's own text, and install counts only break ties.
- Upgrades come first in the Tools block, because a skill written for a newer version misleads the agent until the upgrade is done. The block has at most four rows, each saying why, the effort, what happens if you say no, and the exact line to paste.
- Private package names stay on the machine. Workspace, local, Git and private-registry packages are never looked up, whether the private registry is set in npm, Yarn, Bun or Python settings, in a package folder, in the home folder or in the environment. A need typed for new work is at most five plain words and never the project's name.
- The agent never installs anything. Your answers are kept: "no" stays answered, and "later" comes back after 14 days. When a session starts, Super-outer says in one line when the project was never checked, its packages changed, or an item you were shown is still waiting.
- The agent uses Parallel Search when it is connected, and says so in one line when it falls back to the host's basic web search. Nothing needs a key.

## 6.2.0 - 2026-10-22

Super-outer now ships two read-only skills that look for savings in AI work and change nothing until the owner approves an item.

- `jev-opportunities` finds LLM calls that only make a closed decision, such as a fixed label, a yes or no, a route, a rank or a judge score. For each one it recommends TypeSafe Jev, the OpenAI Decisions API, Claude structured output on `claude-haiku-5-5`, or keeping the call, with one line saying why. It reads the live TypeSafe and OpenAI docs and the claude-api skill in every run, and it never sends private input to a provider that does not already receive it.
- `caveman-opportunities` finds text that only machines read, such as subagent briefs, prompt-chain steps, raw tool output and long MCP tool descriptions. It recommends the lite or full short register for each, shows a before and after sample, and keeps quotations, figures and citations exact. Anything a person reads is left alone.
- Each skill reports at most 7 findings, lists the candidates it rejected and why, and offers each change as a separate step.
- Super-outer runs both when a plan builds or changes an agent, an LLM chain, a skill or an MCP server, and once at the milestone sweep. They never run for ordinary code.
- The skills live in Super-outer only. shva points to them and keeps no copy, because two skills with the same name hide one another without a warning.

## 6.1.0 - 2026-10-22

Other plugins, such as shva, can now ask Jev one closed question and get a single answer back.

- `super-outer jev ask --kind <slug> --options <a,b,c>` reads the typed request from stdin and prints one JSON line with the answer, where it came from and whether Jev was confident. It always exits 0.
- An answer is given only when Jev reads one option at 0.8 or more and every other option at 0.2 or less. Otherwise the calling plugin decides.
- Nothing is sent when Jev is off, when there is no key, or when the request is longer than 1,500 characters or looks like it holds a secret.
- Setup now writes `~/.super-outer/bin/super-outer`, which runs the installed version, so other plugins have one path that does not change between releases.

## 6.0.0 - 2026-10-22

Super-outer now starts a piece of work like a systems architect and carries it through like an engineer. It reads the project as well as the request, keeps the scale of the product in view, and reviews the areas nobody has looked at before a release.

- It reads the project's deploy settings before choosing what to check. A project that deploys always gets the observability check, and words about speed, latency or timeouts also bring it in. This catches a live service whose logs and traces are switched off.
- The product brief records who uses the product now and next, and a short ladder of what breaks at 100, 10,000 and 1 million users. Each step is saved in the ledger with a measured trigger.
- When a session starts, Super-outer compares the ledger's triggers with the project's latest metrics snapshot and says in one line when a trigger has fired or the snapshot is old.
- The researcher agent has a scout mode. It returns three options with monthly cost, a docs link and the date checked, ranking the vendor already in use first, then a paid managed service, then building it. A service up to Rs 5,000 a month may be chosen with the options shown; above that, the owner decides. Dated catalogues cover Cloudflare, Supabase, Vercel and the model providers, and a lessons file carries findings across projects.
- Manual work that a service already does is noticed while the work runs and kept for the milestone. Nothing interrupts the work. At the milestone each suggestion appears once, with Use it and Not now in the Claude Code status band and as a line in Codex.
- `super-outer sweep --plan` lists the areas never reviewed and the areas whose files changed since their last review, runs each review once and records a dated receipt. A second run with no changes finds nothing to do.
- Agents are sized by depth: none for QUICK, up to two scouts on Sonnet for FOCUSED, scouts, up to three builders and read-only area reviewers for FULL, and the independent verifier on Opus for CRITICAL, with at most six per task.
- Text that only agents and the coordinator read uses a short register that keeps every number, path, error and command exact. Everything shown to the owner reads as before.
- Jev answers new closed questions about which areas a request opens, how many agents run on which model, whether a suggestion is real, and what the sweep checks first. These answers are recorded and compared, and the local answer decides until agreement is measured. Jev may now receive one-line summaries of agent activity, never code, file contents, keys or customer data.
- The technical diagram skill from 5.24.0 is now the code-flow kind of `draw-system-diagram`, which draws architecture, pipeline, code-flow and one-problem diagrams. Super-outer decides which diagrams a change needs, asks Jev when the kind is unclear, and asks the owner only when Jev is unsure. The code-flow kind was contributed by a team member. Installs lose the old separate skill on upgrade.
- New run-and-operate guidance, a release replay set for AI products, and fifteen behaviour evals, eight of them replaying failures from the Personal Agent work.

## 5.24.0 - 2026-10-22

Super-outer now ships a third skill, `team-technical-diagram`, a team member's technical edition of the diagram skill. It explains one endpoint or backend flow to a teammate who has never seen the code. `draw-system-diagram` is unchanged and stays the choice for a plain-language picture of a whole product or pipeline.

- The picture is a swimlane data flow with time running down: the client, the backend and the stores and outside services are lanes. A boundary bar shows where the caller stops waiting, numbered steps run one after another, and an AT ONCE tag marks work that runs in parallel. A summary box lists both kinds in one place.
- It opens with a short guide to reading the picture and a four-move overview, so a newcomer has the whole idea before the detail. Every step carries the function to open in the code. Strips for failure and recovery, an older or fallback lane, and a glossary finish it.
- It reads the code at the live and upcoming branches (`origin/main`, `origin/staging`) with a snapshot script that leaves the checkout and local branches alone, never a checkout that may sit on a stale branch, and it decides the active path from what the shipped client calls before it reads the server routes.
- Each claim on the picture is checked against the source by a verification script the author writes from a shipped skeleton, and the report says how many checks passed and what no script could prove.
- The skill ships a small generator kit (`diagram_kit.py`) and a worked example endpoint that builds its SVG template, a script that renders a tall picture as slices so each one can be inspected, a snapshot script and a self-test.
- Its checker and renderer are the same files as in `draw-system-diagram`, so the two skills judge a picture alike. A test fails if they drift apart.
- The skill carries the plugin version on its first lines, and a test fails if that line and the plugin version differ.
- The product searches skip the skill's folder, as they do for the other two skills, and the Cursor installer installs it with them.

## 5.23.0 - 2026-10-21

The diagram skill now draws pipeline diagrams as well as architecture diagrams, or both for one system. The owner asked for this after a client demo needed a simpler picture of how its AI matches three photos, which the architecture style could not give without hosting, release and a legend the reader did not need.

- The skill takes the kind from the request. "Architecture", "components" or "deployment" gives the architecture diagram, and "how it works", "pipeline" or "processing flow" gives the pipeline. A request for both gives two diagrams with the same names, colours and facts. It asks only when the two kinds would show the person different things they need.
- A pipeline diagram names who performs each stage (a script, a model, a person or a service), labels each arrow with the data it carries, and puts work prepared once and reused in a separate band from work done for each request, as the code does it. It says whether a step reads its inputs together or one at a time, and shows branches and uncertain results only when the process has them. It has no hosting, release, legend or traced request. A new reference, `pipeline.md`, and a template cover it.
- The checker reads the kind from `data-diagram` on the SVG and leaves out the legend check for a pipeline. A legend-free copy of that demo's pipeline passes as a pipeline and fails as an architecture diagram.
- The checker now reports an arrow with no label, an arrow that runs through a box, an arrow drawn before a box that covers it, an arrow that crosses a line of text such as a band title, and text that presents a model's confidence as accuracy or says more inputs bring higher confidence. The covered-arrow check exists because the first pipeline template had that fault, and the checker passed it until the PNG showed the missing arrowhead. On the ten Personal Agent and demo diagrams these checks flag nothing new.
- With `--one-system`, the checker compares the facts of two diagrams of one system and reports a value they state differently.
- The facts block may be named `diagram-facts`. Existing `architecture-facts` blocks still pass.
- Three fresh agents each drew a sample helpdesk app from one request: architecture only, pipeline only, and both. Each picked the kind the request named, and their diagrams passed the checker and matched the code. Their reports showed gaps in the instructions, now closed: what to do with no real request to quote, no recorded release, a stub handler, a step whose result changes nothing today, too many stages for one row, and no agent instructions file. One colour rule was contradictory: a second outside service was to be drawn in teal, but teal already belongs to release and checks. It is now drawn in green and named in its box.

## 5.22.0 - 2026-10-21

Super-outer now ships a second skill, `draw-system-diagram`. It draws the light, colourful system diagram the owner chose for the Personal Agent on 20 October in place of a dark Mermaid map, and keeps it true to the code.

- The diagram is a hand-written SVG with a PNG copy at twice the size. It has a white canvas, one colour per kind of part, solid borders for live parts and dashed for planned ones, labelled arrows, and one real request traced from start to finish. A one-problem variant adds the approaches tried and dropped and a strip that separates what was measured from what is still open.
- The SVG carries the facts it states, such as model names, limits and switches, and the skill adds a test in the repository's own runner that fails when the code changes and the picture does not.
- A checker script measures every line of text against its box, because SVG text does not wrap. Its letter widths were measured in Chrome. On the eight Personal Agent diagrams it found four arrow labels drawn across or against a border, and nothing else. A render script writes the PNG with Chrome, Chromium, Edge or Brave.
- Super-outer draws a diagram when asked. When a change alters how a product's parts connect and the repository has no such diagram, it offers once to draw one. When the repository has one, it updates it in the same commit as the change.
- The Cursor installer now installs every skill the plugin ships. Until now it copied only the main skill, so a new skill would never have reached Cursor.
- The manifest check now confirms that each skill's name matches its folder and that its description fits the 1,024-character limit.

## 5.21.0 - 2026-10-17

The status strip (shva-status 0.15.0) works with the shva plugin 0.37, which renamed three skills: brief-me is now learn-the-vocabulary, session-to-article is now turn-session-into-article, and substack-post-writer is now write-substack-post. The strip looked only for the old names, so with shva 0.37 the brief offer would have used Super-outer's own brief-me, or not appeared without it, and the article offer would not have appeared at all.

- The brief offer looks for `shva:learn-the-vocabulary` first, then `shva:brief-me` from a shva plugin before 0.37, then `super-outer-learning:brief-me`.
- The article offer needs a complete pair: `shva:write-substack-post` with `shva:turn-session-into-article`, or `shva:substack-post-writer` with `shva:session-to-article`. One new name beside one old name does not count. shva 0.36.4 already has a `write-substack-post` command beside the old session skill, and that mix is not a pair. The article agent loads the pair it found, and the new pair comes first when both are installed.
- The brief and article agents are told to follow the skills they loaded, under the names this session has.
- A person who has not updated shva keeps the brief and article offers as before.

## 5.20.1 - 2026-10-16

The route now arrives when the computer is busy. On 15 October, with eight sessions starting at once, Claude Code stopped Super-outer's prompt hook at its five-second limit in four sessions and threw the whole route away, so those sessions worked without it. The hook's steps each had a time limit of their own (Jev 2.5 seconds, the agent checklist search 1.5, the ledger search 0.8), but nothing watched their sum, and a busy computer also starts the hook late.

- Jev and the two searches now share one deadline of four seconds from the moment the hook starts. Each gets what is left, up to its own limit, and is skipped when too little is left. The word route needs none of them, so it always arrives.
- Jev keeps its 2.5-second ceiling. A call that the deadline cut short is recorded as "deadline", not as Jev's own timeout.
- When the checklist search runs out of time, the "walk these moments" notice waits for a later prompt instead of claiming that the code covers none of them.
- Claude Code, Codex and Cursor now give the prompt hook ten seconds. For a prompt, the Cursor bridge now answers one second inside Cursor's limit instead of waiting 20 seconds. Tool calls and stops keep the 20-second wait, so a late refusal still reaches Cursor.
- In a recorded run of sixteen sessions at once, half on 5.18.0 and half on this version, with a slow stand-in for Jev and a repository with a task record, 5.18.0 lost the route in 7 of 8 sessions and this version delivered it in 8 of 8, each within 4.5 seconds.
- The fix reaches a computer after the developer upgrade, `npm run -s install:cursor`, and the Hermes copy.

## 5.20.0 - 2026-10-16

The status strip (shva-status 0.14.0) keeps the glossary and meditation files current. The owner found the strip offering a glossary on browser extension development, from 8 October, in a folder where the work had since moved to how skills and plugins are built.

- The glossary row names the glossary's topic and date.
- **Refresh the glossary** starts the brief agent on this session: it reads the conversation, names the field the work is in now, keeps the old glossary's terms that still apply, and saves a new glossary that the row shows as soon as it is written.
- At the start of each session, glossaries, meditation studies and the conversation copies their agents read move to the macOS Trash once they are more than 30 days old.

## 5.19.1 - 2026-10-16

A shell command run from the prompt with `!` no longer gets a route. Claude Code sends the hook the command and what it printed, and Super-outer read both as a request. On 15 October `!claude auth login` was routed CRITICAL with the authentication checklist, because the output spoke of signing in, and the next login was folded into that task, which kept the CRITICAL route remembered for another hour. The command and its output are now removed before routing, as the app's reminders and background-task notices already were. A prompt that holds nothing else gets no route and leaves the session's remembered route and work record as they were. Words typed beside the command keep the route they would earn alone. On 5.19.0, a table migration typed beside a login echo was routed CRITICAL instead of FULL, with the authentication checklist added. On the owner's computer, 16 distinct queued prompts held a shell command. 15 held nothing else, and the one with typed words keeps them.

## 5.19.0 - 2026-10-15

Super-outer now follows the current Claude Code and Codex guidance for plugins and skills. A read of both hosts' documentation on 15 October found three problems that changed how it behaved.

- After a long session is compacted, Claude Code keeps only the first 5,000 tokens of a skill, and Super-outer's approval, warning and proof rules sat after that point. SKILL.md is now 376 lines and about 20 KB (from 499 lines and 26.9 KB), with those rules right after "Choose depth" and the seven explanatory sections moved to `references/working-method.md` behind a short summary that keeps the proof and activation rules.
- The route named files such as `skills/super-outer/references/story-walk.md`, which exist only inside this repository, and libraries as a brace pattern the Read tool does not expand. Every file is now an absolute path in the installed skill, the route names `super-outer:super-outer`, and each line states what the route includes, as hook context should; the procedures stay in the skill.
- The global guidance block that every Claude Code and Codex session loads shrinks from 32 lines to 19, in four points: when to use the skill, that ordinary work never needs approval and task records only warn, that the repository's own design system comes first, and the approval-phrase rule.
- The route lines keep their waits: "nothing is built until the owner replies", each failure mode is checked against the code before it is asked, and Jev's review-depth line has Super-outer weigh more review before any change. On the course-builder session's 40 messages the new route fires the same lines and names the same files as 5.18.0.
- Cursor's runtime folder now holds the whole skill beside the hook, so the files the route names exist there too, and the installer refuses to finish if any is missing. Cursor is told the skill's name as Cursor lists it, `super-outer`.
- In a live comparison (three build-plan runs per version on a course-builder-like project), both versions walked a customer's story, asked four or five questions and waited for the owner. 5.19.0 loaded the skill in all three runs (5.18.0 in one) and opened its files directly; 5.18.0 searched for them by name.
- The skill's description now says what it does first. References over 100 lines have contents lists. Links that left the skill folder name the benchmark researcher agent instead, and no reference sits three links deep. `/outer` keeps its description out of the skill list.

## 5.18.0 - 2026-10-15

A requirement that changes mid-build is now sorted before anything else happens. A detail, such as a colour or where a strip sits, still gets a dated line in the record and one line to the owner. A change of scope gets more, because the roadmap can move without anyone saying so: in one recorded build, a separate deployed branch and a second audience on the same route both changed what was being built and were treated as details.

- Scope means who the product serves, what it can do, the kind of system, where it runs, where its data lives or who sees it, an outside integration, or the roadmap.
- On a scope change Claude says so plainly, re-opens the interview for only the questions the change opens, and re-walks the affected moments.
- It estimates the blast radius from the code, layer by layer from the interface down to deployment, cost and tests, with any new stack each layer needs, and lists built parts that need rework.
- It revises the plan in functional and technical parts and waits for the owner's ok before building the affected parts. Other work continues, and no tool is blocked.
- Scope wording the change reader missed, such as "would also", "they too", "same route" or "deployed to", is now caught. On the course-builder session's 40 messages the line appears 6 times: 3 flagged as scope, 3 as detail.

## 5.17.2 - 2026-10-15

Super-outer's warnings on a tool call now reach Cursor. Until now the Cursor bridge answered every allowed tool call with a bare allow, so Cursor never received the 5.17.0 plan notice or any other tool warning that Claude Code and Codex show. Cursor shows the person nothing on an allowed tool call, but it passes context to its agent. The bridge therefore gives the agent each warning once, with a request to tell the person in a line of its own. The tool still runs, and a call with nothing to say gets a plain allow as before. Cursor users now see the same tool warnings as Claude Code users, relayed by the agent: the plan notice, the scope notice, the branch warning, the shared-checkout nudge and the Jev key notice.

## 5.17.1 - 2026-10-15

The strip's model and effort row now works in a session another session started. On 15 October the owner saw no recommended model in two such sessions. The strip checks only messages typed after it draws, and a started session sends its first message, the handoff brief, before that. The task check therefore never ran there. On the session's first step the strip now reads that first message from the conversation, once, and compares its kind of task with the model and effort in use. It uses only the kind of task, so nothing in another session's brief is recorded as your judgement. A typed session is checked exactly as before. The row still appears only when the setting is two steps away from what the task needs, so Opus for careful or complex work stays quiet.

## 5.17.0 - 2026-10-15

Super-outer now follows the work a session has under way, not only the message in front of it. On 15 October it guided the build plan for a course app's AI agent builder without raising what happens over time, such as a teacher returning after three days, a vague "this is not working", or "do it like my Boeing activity". The plan followed "yes same database, go ahead plan the build", which it had routed as quick work, and the story walk it suggested 31 times was never opened.

- A request to build an AI agent product now counts as new work, and the session keeps a record of it, so later short messages are read as part of that work.
- A new checklist for AI agent products asks the owner's choices over time, and a researched pack with 68 dated sources lists the failure moments and their smallest fixes. A moment counts as handled only when the code shows it.
- The brief line appears once per session. When planning starts and no walk is recorded, Super-outer names the moments nobody has checked. When a plan file is saved, the owner sees one notice. Nothing is blocked.
- A message that changes a requirement mid-build asks for the record to be updated and for one line to the owner on what changed and what it affects.
- The intent guide's opening now covers moments over time, and the story walk says where its table is saved.
- The 5.16.2 heading in this changelog had been renamed 5.16.3 by mistake; it is restored.

## 5.16.3 - 2026-10-15

The strip's brief offer now names what you are actually building. In a session about an agent harness on AI SDK 7 and Vercel Workflow, it had offered "web app development with Vercel". It read one message at a time, and it never saw the session's first message, because a session another session starts sends that message before the strip draws. The check now reads the session so far, from its first message and your last six requests, and offers nothing until it can say what is being built and with which tools. The offer can therefore come several messages in. The brief's agent gets one sentence about the build, covers every part you will direct, and reads the project's package file so the terms match the versions in use. One answer to the offer ends brief offers for that session.

## 5.16.2 - 2026-10-14

The skill chips' icons are coloured in the desktop app. 5.16.1 put ◇ and ● inside each button, and the app drew them in the button's own grey, because it ignores the colour of text inside a button. Each icon now sits just outside its button, where the app draws colour: a purple ◆ for a skill Jev suggested, a clay ● for one Claude suggested, and both for a skill both suggested. The button holds the skill's name, and a chosen skill is still the app's filled button with a ✓.

## 5.16.1 - 2026-10-14

The skill chips in the shva-status strip now show who suggested each skill and which ones are chosen. In the desktop app they had looked like plain grey buttons reading "Choose ui-ux-pro-max", because the app draws a button's label alone and drops what is inside it. The chips now carry no separate label, so the app draws their own text: ◇ for Jev, ● for Claude, and the skill's name. A chosen chip is drawn as the app's filled primary button, with a ✓.

## 5.16.0 - 2026-10-14

The shva-status Skills row now offers skills before a request is sent, and nothing asks for marks afterwards. The owner found marking after the answer unworkable: Claude's skills arrive late, and by then the owner has moved on and forgets to mark them. He also found the pane and its "5 of 73 marked" line confusing, and asked for one count with a target of 100.

While the owner types, Jev and Claude's Haiku each read the draft when typing pauses and suggest up to three skills. Each skill shows once as a chip, marked ◇ for Jev and ● for Claude. The owner taps the skills they want, and Claude gets one added line naming them, asking it to load them before it answers. The row's only number is "N of 100 chosen", the count of requests sent with at least one tapped skill. After 100, the suggester whose skills the owner tapped more often can start choosing on its own. `/skill-picks` replies with the count and how many chosen skills each side suggested. The marking boxes, Undo, "N to mark" and the Skill picks pane are removed.

Haiku is asked through OpenRouter on Jev's key, with its thinking off, a fixed answer shape and the skill list cached. On 15 real requests from the unseen evaluation set, each call read about 51,000 tokens, answered in 1.7 s typically and 2.6 s at the slowest, and cost about $0.0009. With thinking on, about 4 of 15 answers came back empty. Asking Haiku through Claude Code's own model call was rejected, because each pause would count about 51,000 tokens against the owner's usage limit.

A shell loop that reads `$k/SKILL.md` no longer records a skill called "k", which the strip had shown as Claude's skill.

## 5.15.0 - 2026-10-14

Every learning page the shva-status strip asks for is now an HTML page in a StyleRef style, written in OUTER English. This covers Brief me and Meditate, the two buttons whose output is for the owner to learn from. Before this release, Brief me saved its glossary as Markdown and showed it as text in the pane, and Meditate chose its look without a rule.

The mod draws a random number for each page and passes it to the agent. The agent searches StyleRef with three queries that describe the page's layout, keeps the styles that suit a page of text, tables and diagrams, sorts them by slug and takes the one the number picks. Thus the style differs from page to page, and the agent cannot replace the random pick with a favourite. The style's name and link go in the agent's reply, not on the page. When StyleRef is not connected, the page uses a plain design and the reply says so.

The agent reads `~/.claude/output-styles/outer-english.md` when it is installed and also gets the hard rules in its task: the sentence rules of ASD-STE100 without its restricted dictionary, no em dash or en dash, and full sentences that keep their verbs. Output styles do not reach subagents, so this is the only way the rules apply to these pages.

Brief me saves an HTML page and, beside it, the terms as Markdown for the vocabulary coach. Show the glossary opens the HTML page when it exists. The briefer and meditation-writer agents get StyleRef's tools and ToolSearch only when the session lists StyleRef, and register again when StyleRef connects after the session starts. The article, taste and wiki buttons do not change.

## 5.14.0 - 2026-10-13

Everyday uses of the payments and sign-in words no longer raise the route. In 5.12.1 "git checkout main" and "never commit in the main checkout" routed CRITICAL with the payments checklist, "login with bitwarden mcp" and "claude mcp login openrouter" routed CRITICAL as sign-in work, and "purchase order template" routed FULL with the payments checklist. Each now routes QUICK. The router removes a word only when the words next to it show its everyday sense: a git checkout ("git checkout", "checkout main", "the main checkout"), signing in to a developer tool or asking the assistant to sign in ("bw login", "login with bitwarden mcp", "open dataforseo for login"), or a payment word in a named document such as a PDF, a proposal or a purchase order when nothing in the request names software or moves money. "Pay the invoices in the attached pdf" keeps its route and asks. The protected patterns, the specialists and the failure-mode libraries all read the request after that removal, so the three agree.

A word that could mean either the product's own payments or sign-in or everyday wording now keeps the higher route and asks. The owner approved this release on 13 October 2026 with the rule that in doubt Super-outer keeps the higher care and asks. "update checkout", "change the login", "login with github" and "payment should be 50 percent before and 50 after" keep the depth, allowance and libraries 5.12.1 gave them. The route tells the assistant to ask the owner one plain question first, such as "Is this about how customers pay in your product, or about something else, such as a document or a git checkout?", to treat the request at the higher depth until the owner answers, and which depth applies if the owner says it is everyday wording. A missing word never lowers a route. Real requests such as "add a checkout page with Stripe", "build the login screen", "add password reset" and "the checkout page is broken on Safari" keep CRITICAL and do not ask.

A short message typed in the middle of a task now belongs to that task. When a session has a FOCUSED, FULL or CRITICAL route from the last hour, a message of up to 30 words whose own route is no deeper, adds no protected domain or library, is not new work and gets no design line, new-work reading or added line from Jev is handed to the assistant as part of that task, with no new question allowance and no new approach stage. Anything else is routed afresh, and the same request sent again gets its full route again. Only the mode, the library and protected-domain ids, a hash of the request and a time are kept, never the typed words.

"Move" counts as tidy-up work only when no stored data follows it in the same clause, so "Move every recording to the new storage format and backfill the owner" now matches the data-migration library, while "move the save button 8px to the left" stays tidy-up.

Measured with Jev off on the 46 audit sentences of observation 55 and on 1,849 prompts typed between August and October 2026, rebuilt from transcripts by the observation's recipe: 12 routes went down, all of them git checkouts or sign-ins to tools, none went up, and 6 that keep their route now ask. Requests that touch roles or permissions still route CRITICAL, as before; they account for most CRITICAL routes in that set and this release leaves them alone.

The skill text gains the batch staged on 13 October 2026 from task-observer observations 73, 74, 118, 175, 184, 211, 212, 216 and 220: a reversed decision is searched for in every shipped text file before release, each recorded decision that touches a surface is marked keep or propose change, the design package covers every surface the owner named, the experience review uses the release environment's content and checks each screen sentence of the plan, replay proof includes a committed write with a lost response, a quiet fallback is proved by running the staged copy, a deadline wrapper is timed end to end, the activation question can be scoped to records created from now on, and the agent reads every contributor file before writing. To keep SKILL.md within its 500-line limit, the guidance for explaining and asking the activation question now lives in `references/safe-activation.md`.

"store passwords with bcrypt" and other requests that name passwords in the plural now route CRITICAL with the sign-in checklist. In 5.12.1 the sign-in pattern matched only the singular "password", so they reached FULL.

## 5.13.0 - 2026-10-13

The skill picker in the shva-status strip (shva-status 0.11.0) is redesigned so that marking takes one press at the moment the answer is clear. In 5.12.1 the strip used three rows for the picker: Jev's chips, Claude's chips, and a question whose buttons sat on a different row from the skills they named. The question appeared only after Claude's turn was over, and a new message ended it, so most requests went unmarked.

The strip now has one Skills row. Jev's picks and Claude's skills each sit in a box, and pressing a box marks that side. Jev's box and No skill work as soon as Jev has read the request, while Claude is still answering; Claude's box opens when the turn is over, because its list can still grow until then. After a press the chosen box shows a green tick and Undo takes the mark back. The pane shows up to three requests at once, newest first, with the latest outlined, and every card can be marked directly.

Claude's side of the record now counts a skill Claude loads by reading its SKILL.md file, through Read or a shell command, as well as a Skill tool call. Before this change only Skill tool calls counted: one session on 13 October had 10 typed requests, no Skill tool calls and 28 SKILL.md reads, and Claude's side showed a skill on 5 of 83 recorded requests. A command that writes to a SKILL.md does not count. The wording check no longer shows a row for a clean reply.

## 5.12.1 - 2026-10-13

Fixes from a second independent review of the skill picker in shva-status (0.10.1). A request typed while Claude was still answering could be offered for marking before Claude had answered it, so a press of "Claude's skills" saved an incomplete record. Each request is now tied to the turn that answers it, named by the turn's start, and is offered only after that turn ends; a request delivered into a running turn without a turn of its own is held until a second turn ends. The pane says when there is nothing to mark until Claude finishes. A prompt the mod or another source sends now ends the strip's question, as a typed message does. Skip moves on from a request that Other… or Change put first, and skipped and focused requests no longer carry into a new session. When Claude and Jev chose the same skills, one button marks both. `/skill-picks` counts as the strip and the pane do.

## 5.12.0 - 2026-10-13

The skill picker in the shva-status strip (shva-status 0.10.0) is redrawn so that marking which skills a request should have used takes one press. In 5.11.0 the strip showed one grey line of skill names, and the review pane counted how often Claude and Jev "matched your call" without saying that the call meant the owner's own marks, which nothing had asked him to make.

While the owner types, the strip shows Jev's picks as chips. In the desktop app each chip's fill shows Jev's fit score and the score is printed on it; a skill the request named is outlined and marked "named". After the request is sent, a second line shows the skills Claude loaded for it, and a skill both chose is green on both lines. When Claude's turn is over, the strip asks which skills the request should have used, with Claude's, Jev's, Both, No skill, Other… and Later; a button whose side chose no skill is left out. It asks after every request, including when both chose no skill, when Jev did not answer, and while the owner types the next message, when it names what each side chose. The question sits with the picker's own rows, so it never takes one of the strip's two decision places. A slash command or a new request ends the question, and the unmarked request waits in the pane. After a press the strip says what was marked, built from the saved record, with Undo. There are no number keys in the strip, because a bare digit in an empty prompt box would answer the strip, and the owner answers Claude's numbered questions with digits.

The Skill picks pane shows one request at a time, newest first: the request, Claude's skills beside Jev's, and Claude's skills, Jev's skills, Both and No skill on keys 1 to 4, with a box for other skill names and a Skip button. A request Claude is still answering is offered once its turn is over, so a mark sees every skill Claude loaded. Below it the pane counts, in the marked requests, how often each side agreed with the owner's mark ("Jev agreed with your mark: 6 of 7"): a side agrees when it chose at least one skill the owner marked, or none when the owner marked no skill. The pane lists the marked requests with Change.

The strip now works in a narrow window. With an artifact open in the desktop app, the usage row stopped at 5-hour and hid Weekly, because it could not wrap; it now wraps. A decision row's marker is part of its sentence's text, so it no longer sits alone on a line when the row wraps.

Jev's fit score for each pick is kept in the verdict and in each record row. Rows saved by 5.11.0 have no scores and show none.

## 5.11.0 - 2026-10-13

Jev can now say which installed skills a typed request needs. The method is TypeSafe's skill-suggestion recipe: one request ranks every skill and asks whether any skill is needed, and a second re-reads the best few and asks whether each one fits. With several hundred skills installed, the roster is ranked in chunks of 150 within one request, because Jev answers a request's questions in parallel. Up to three skills are picked, and a skill the request names, such as `/hero-ui` for heroui-react, is always picked. Short follow-ups such as "is it done?" get no pick.

The first use is a review record in the shva-status strip (shva-status 0.9.0). A line shows Jev's pick while the owner types, and `/skill-picks` lists each request with what Claude loaded, what Jev picked and the owner's call. Nothing changes what Claude sees or loads in this release. Hiding the skill list from Claude waits until the owner's reviews show Jev picks well.

`scripts/jev-picker-eval.mjs` measures the picker against what Claude loaded in the last 60 days of transcripts. A set of 570 requests was frozen as held out before any run, but its first rows were read while the picker was fixed, so the clean measure of this version is 160 requests outside that set that were never read or tuned on. On those, with 796 skills installed, Jev's picks included a skill Claude loaded on 30 of 80 requests, and on 16 of 61 when the request did not name the skill. Jev picked nothing on 18 of 80 requests where Claude loaded nothing. Claude's own loads are a weak answer key, because Claude loaded a skill on only 207 of 1,853 typed requests, so the owner's reviews are the measure that decides. Each pick took about 1.2 seconds and 27,000 input tokens, about $0.001.

## 5.10.2 - 2026-10-13

With Super-outer installed in both Claude Code and Cursor, an extremely critical action approved in Cursor can now go ahead. Cursor runs Claude Code's plugin hooks by default, so the shared hook ran twice for every Cursor prompt, tool call and stop, and Cursor lets a refusal from either copy win. The Claude Code copy keeps its approvals under its own name and never sees the assistant's text in Cursor, so it refused every such action that the person had approved through the Cursor bridge. From 5.10.2 the Cursor bridge handles every Cursor event, and the Claude Code copy returns nothing when Cursor's own settings run the bridge for the same event. A Cursor bridge from before 5.10.1 sent the route in a field Cursor ignores, so with one of those the Claude Code copy still gives the route and leaves tool calls and stops to the bridge. Without the bridge, the Claude Code copy is the only copy in Cursor and keeps every event; on a prompt it now reads the project from Cursor's workspace folder, where it used to look in its own plugin folder and miss the project's brief and ledger. It still cannot bind an approval phrase in Cursor, so an extremely critical action there needs the bridge (`npm run install:cursor`). The fix lives in the Claude Code copy, so a Claude Code copy older than 5.10.2 keeps refusing until it is updated.

## 5.10.1 - 2026-10-13

A Cursor install now gives Cursor's agent the route by itself, and with Super-outer installed in both Claude Code and Cursor the route arrives once per prompt. Until now the Cursor bridge sent the route in a field Cursor reads only when a tool call is denied, so the bridge's copy never reached the agent. On a computer with Super-outer in Claude Code as well, the agent still received the route, because Cursor runs Claude Code's plugin hooks by default and accepts their context. A Cursor-only install never received it. The bridge now uses the field Cursor reads when a prompt is sent, which Cursor's documentation leaves out but the Cursor agent CLI 2026.10.01 and the desktop app 3.23.12 both read, and cuts the route to 10,000 characters, the length above which the CLI discards it. When the shared hook runs twice for one Cursor prompt, the copy that runs first gives the route and the other gives none and skips its call to Jev, so a Cursor prompt with Jev switched on sends one request to OpenRouter instead of two. Until both copies are on 5.10.1, the route can still arrive twice; `npm run setup` does not update Cursor, so run `npm run install:cursor` as well.

## 5.10.0 - 2026-10-12

Before building something new, Super-outer now walks one named customer through the simplest design that could work and adds a part only where that customer's experience fails without it, using the method strong teams use for that failure. The method comes from Sanjay Kumar's walk-through of agent memory and applies to any kind of system: web and mobile apps, agents, games, simulations and screens. Each part is marked for now or for later, and a later part names the measured signal that makes it necessary, so a plain to-do app stays one box while a chat app for 50,000 people gets live delivery and abuse limits from the start. The owner is asked about customers, money and moments, never about mechanisms, and the stack arrives as one recommendation and a runner-up with the trade-off between them. Nothing is built until the owner has seen the plan, also when the owner asked for defaults.

The answers live in a product brief at `.engineering/super-outer/product-brief.md`, written once per repository and read by every later task, so nothing is asked twice. Each fact is marked decided or assumed. The interview runs in rounds of at most five questions, each with a recommended answer that "yes" accepts, has no round limit, asks only what changes the design, the stack or a now-or-later part, and never runs for a fix. In an existing repository the brief is drafted from the code, saved, and the interview is offered once; a plain new feature is never held up by it. When there is no architecture pack for the kind of system, the benchmark researcher (contract 1.1.0) researches one in a new architecture mode. One pack ships, for web and mobile apps, with dated and graded sources and its unsourced thresholds marked as judgement.

A part marked for later can now come due because of a number. A ledger entry may carry `measuredWhen`, such as the database passing 60% busy at peak, and `super-outer ledger check --metrics <file>` compares it with numbers the owner or a CI job supplies. A metric nobody supplied is reported as not checked, never as fine. Routing now runs the repository search half of that check by itself, so when a deferred part has come due, the assistant is told once per session in one line beside the route and asked to tell the owner. Parts that wait on numbers share one line saying how many wait, parts still waiting say nothing, and a ledger that cannot be read says so without costing the route. The check adds about a tenth of a second to a routed prompt in a repository with a ledger and stops at 800 ms.

Before a change a customer will see, Super-outer now lists its assumptions in one block and asks the owner to reply "ok" or correct a line, where it used to label them and build. The block counts as one question.

Plain words now reach the right specialists. A chat app for 50k users, an app getting slow, a launch-day spike and a multiplayer game for 200 students all routed to the lightest review with no specialist in 5.9.0; stated demand now brings in scale and backend, something that updates live adds reliability, an agent that remembers people adds stored data, and rate limiting adds security. A filter, empty state, form, tab or onboarding step added to a page brings in the product specialist. These rules read sentence structure: a kind of system counts when a build verb comes before it, a user count needs at least 1,000 or a unit, and a request that reports a problem, names a routine task or describes a cosmetic detail ("make the chat app icon bigger", "the 50k users banner text is cut off") starts nothing new. Triggers match their plurals, except "agent" and "client".

Jev now also finds new work the word lists miss. On 40 requests frozen before the run, Jev's existing answers under a rule frozen with the set found 17 of 20 pieces of new work with no fix wrongly flagged; the word lists, changed the same day, now find 10 and flag none, and the two together find 19. Jev may add the brief line and never removes one, and never adds it to work the word lists read as a fix or maintenance. `SUPER_OUTER_JEV_MODEL` names another decision model on the same OpenRouter endpoint. Microsoft-Decision-1 and GPT-6 Luna Decisions were compared with Jev on Jev's held-out design sets: Jev chose the design line correctly on 118 of 120, Luna Decisions on 117 and Decision-1 on 108, so Jev stays.

The skill no longer claims that a mechanical audit checks every drafted question; the audit code runs in tests over the lifecycle archetype questions. An interview with nothing to ask no longer says the person's code answered everything, and a route that matched a checklist keeps its allowance of 12 questions.

## 5.9.0 - 2026-10-08

Super-outer can now install two optional parts, and the person installing chooses the learning skills, the status mod, both or neither. The learning skills are Brief me, which gives the vocabulary of a field with each term's source page and an example request, and Meditate, which turns a finished stretch of work into a visual study. They install for Claude Code and Codex. The status mod draws a strip above the Claude Code prompt and is not offered to Codex, which has no mods. A row of the strip whose skill, MCP server or account is missing on a computer never appears there. The core plugin does not change and still depends on no separately installed skill; the optional parts ship as separate plugins in the same packaged marketplace, and their files never enter the core payload.

`Install Super-outer.command` asks for the choice before the YES prompt, and `npm run setup -- --components skills,mod` takes it from a clone. A first install with no choice brings both parts. The choice is saved in `~/.super-outer/components.json`, so an update with no choice keeps it, and rollback restores the file. Choosing differently later removes this package's copy of a part no longer chosen. Choosing the mod replaces a `shva-status` installed from another marketplace, so only one strip draws, and rollback puts that copy back. Verification checks each chosen part is installed once with the packaged version and contents, and that no unchosen part from this package is still active.

Verification now ignores the files Claude Code writes into a plugin folder it has installed: the `.in_use` list of sessions using the plugin, and the type files and `tsconfig.json` it lays beside a mod each time it loads one. Before this, Verify reported a correct install as needing attention whenever a session was open, and a re-run reinstalled everything. The installed 5.8.2 folder on the development Mac, holding two such session files, now matches its pinned digest. An unreadable saved choice stops an update with a message instead of installing both parts, `--components` with no value is refused, another copy's folder is backed up only when it sits in Claude Code's plugin cache, and a computer without Claude Code is told the status mod needs it.

Meditate now opens its study with a map of how the built thing works, places the person's own decisions on the parts they changed, asks them to predict what would happen if a key part changed before showing the answer, and ties its glossary to the boxes and arrows on the map.

## 5.8.2 - 2026-10-08

The filter now withholds cred followed by a value, as it does for token and seed, so `DB_CRED=Summer2024`, `cred: letmein` and `my cred is letmein` are no longer sent, while "add CRED pay as a payment option at checkout" still is. 5.8.0 and 5.8.1 sent all three. A new test covers the reach of the check on the collapsed text, the one deliberate change the third review of 5.8.1 found unguarded. The 5.8.1 plan's wording about cred and the removed onetime pairs is corrected.

## 5.8.1 - 2026-10-07

The filter that decides whether a request may go to Jev now normalises the text before its word rules run. It folds fullwidth letters and digits, removes invisible characters and combining marks, maps Cyrillic and Greek look-alike letters, and splits names such as `DB_PASSWORD`, `dbPassword` and `pass-word` into words. A request is withheld when it mentions a password, pass, a passcode, a PIN, credentials, a secret, a one-time code, a card number or any key; when a login word, a code, a token or a seed is followed within a few words by a value; when a name ending in a credential word, such as `DBPASS`, is given a value; or when it holds a card number or a key in a known shape. The 5.8.0 filter also still runs, so 5.8.1 never sends a form 5.8.0 withheld from the part that is sent. A misspelling or another language that the filter does not list, a value made only of letters with no credential word next to it, or a look-alike letter that the filter does not map can still be sent. The independent verifier had found 93 of its 154 variants sent by 5.8.0. In a set frozen before the build from the variants it quoted, all 79 requests the new rule withholds are withheld and all 13 ordinary requests are sent. The check covers the first 1,700 characters, the 1,500 that are sent and 200 more. A 50,000-character request that took 7 seconds to check now takes at most about 150 milliseconds. Six of the 612 labelled requests are withheld, none of them labelled for the design path. Requests such as "make the tests pass" or "show the pin entry screen" now also get the 5.7.0 route.

## 5.8.0 - 2026-10-07

Jev, TypeSafe's decision model, now decides whether a request builds or remakes something people use, and so whether the route names the design path, for anyone who switches it on with an OpenRouter key placed for Super-outer. Five yes-or-no answers are combined in code as a labelled study froze them. On 120 requests written and frozen before the runs that tested them, Jev chose correctly 118 times and the 5.7.0 word lists 84 times; on the 40 written for this release, many of them browser extensions, apps inside AI assistants and desktop apps, the counts were 40 and 20. No labelled request loses the activation question, depth or question allowance it had in 5.7.0. A "yes" also brings the product UI specialist and at least FOCUSED depth; a "no" removes only the design line. Jev never lowers depth or the question allowance and never chooses checklists. It may add a line that asks for more care when a checklist looks like a false match, when it reads a protected boundary the word lists missed, or when it reads the work two depth steps higher. A routine rebuild such as "rebuild the app" keeps the 5.7.0 answer, because Jev reads "rebuild" literally.

Only the typed words go to OpenRouter and TypeSafe, at most the first 1,500 characters, after the host's own blocks are removed. Nothing is sent for a request that mentions a password, a passcode, credentials, a one-time code, a card number or a key, or looks like it holds a token or a PIN, for a slash command, a request shorter than 8 or longer than 50,000 characters, or a request routed SMALL_SAFE. The call has one attempt and a 2.5-second limit, and any failure gives the 5.7.0 route. Jev is off until `SUPER_OUTER_OPENROUTER_KEY` is set in the environment or in `~/.config/super-outer/jev.env`, which must be readable only by its owner; a general `OPENROUTER_API_KEY` never switches it on. `SUPER_OUTER_JEV=off` switches it off without a release. Until one of the two is set, Super-outer says once per session, with the first tool call, how to add the key. `SUPER_OUTER_JEV_RECORD=on` keeps a private 30-day record on the computer of Jev's readings and the first 120 typed characters, and `super-outer jev domains` counts four candidate domains in it: MCP servers and AI connectors, plugins and skills for AI coding tools, scheduled jobs and automatic posting, and streaks, reminders and habit loops. `super-outer jev status` reports what is switched on.

The engineering approach stage from Super-outer Experimental is now part of Super-outer. For FOCUSED work and above, the route line names it, and it writes three lines before the build: what can be checked first, what stops the work, and how many agents build and check it. `super-outer inventory` lists the checks a repository already has. The design path's first question now asks about the recurring interaction in the words of the product's main job, after the benchmark researcher has looked at the best products built for it.

Tests and the installers' own checks never send a prompt: every test that starts the hook removes key variables and switches Jev off unless it points the call at a local server, both installers run their checks with Jev off, and the client refuses any non-local address while `node --test` runs and any test address that is not this machine. Cursor's installer now copies the modules the hook loads while it runs, so Jev runs in Cursor too.

A review before release found that plainly worded credentials passed the key filter ported from Experimental, such as "the password for the staging db is hunter2", and that some host-written text could be sent. The filter now also withholds a credential word followed by a value, long passphrases, one-time codes, card numbers and keys with invisible characters, and the hook withholds requests holding unknown host-style blocks or a JSON object. A second review found shorter forms still sent, such as "pass hunter2", "pin 4821" and passwords made only of letters, so any request that mentions a password, a passcode, credentials, a one-time code, a card number or a key is now withheld and routed by the word lists. That withholds 4 of the 612 labelled requests, such as "Password reset emails end up in spam", and none of the 4 is labelled for the design path.

## 5.7.0 - 2026-10-07

Super-outer is now an end-to-end, plain-language coding kit for people who do not write code, covering a product's surfaces from setup to retirement. For a user-facing new feature or redesign it records the product intent, asks only the design questions that change the outcome, renders the main working screen in a design package before building, gives each builder a brief tied to that package, and reviews the built screens against the intent before the work can be called done. Six references hold this method, with a rendered example package for a writing app.

Two new roles carry it. The design-prototyper writes only inside the design package folder. The read-only experience-reviewer operates the built screens, with agent-browser when it is installed. The new `task design` command records whether a task needs a design package and pins the package and intent versions. When a package is required, the task cannot close as proved until a rendered review against the intent and the owner's acceptance are both recorded. Nothing is blocked while they are missing, and the check runs only at closure.

A request that builds or redesigns a screen, page, editor, dashboard, panel, view, inbox, home page, app or website now brings in the product design specialist and a conditional line naming the design path; "Build a new writing editor" previously selected no specialist. Requests worded as "I want a page where", "make a screen for", "build me an app that" or with plural surfaces count too. A request that says the screens stay as they are, such as "backend only", "with no UI changes" or "leave the screens unchanged", keeps the design specialist out.

Maintenance is now judged one clause at a time. "Build a new onboarding screen and add tests for it" counts as building a screen, and "update the docs to describe the redesign" stays maintenance. Rebuilding a bundle, an index, an image or the docs, and a screen redrawing when its data changes, no longer count as an overhaul. A Django view, a dashboard API, a Grafana dashboard and other developer meanings of the new nouns are not treated as screens people use. Rebuilding a named screen or page, such as "Rebuild the web app dashboard for coaches", still counts as an overhaul, and a mention of something already built, such as "the new dashboard crashes", no longer counts as building it.

Nine archetypes cover the rest of a product's life: starting with no code, analytics, admin and support tools, people's rights over their data, public pages and store listings, help and release notes, email delivery, teams and roles, and retirement. They match phrases that name a product feature, and tests hold everyday sentences that must not match them, including "retire this feature flag", "shut down my app server", "add the crate to the workspace members" and "build an app for the simulator".

The search for work a repository already handles no longer finds Super-outer's own vendored files or records, `RLS` no longer matches inside "URLs", and "format" and "comment" count as maintenance only when they describe code edits. The route schema now describes the router's real output. The parallel-agent rules now say to pause every running agent whose brief includes an action before that action is put to the owner as a decision.

## 5.6.4 - 2026-09-23

Skill guidance now checks installed source lineage before selecting a release base, inventories existing platform capabilities before adding a provider, and checks whether proposed options can be executed. It requires sibling-worktree collision checks, recorded component inputs and independently expected replay results. Claude and Codex review roles carry the same requirements.

Version updates use explicitly identified current stamps. Four comments again name the historical 5.5.0 change they describe. Router classifications and approval rules are unchanged. This release includes the previously local 5.6.3 host-notification fix.

## 5.6.3 - 2026-09-20

The owner typed "yes, start the offline build". The Claude desktop app had put a
reminder in front of it, about a background task named "Fix 'plan' false match
in Super-outer payments library". Super-outer routed the two together as
CRITICAL, with twelve questions, three specialists and the payments and
notifications checklists. The typed words alone route as QUICK with two
questions. CRITICAL is the route that can lead to a request for an approval
phrase, and the words that produced it were written by the app.

The host puts its own text into the prompt field inside named blocks:
reminders, a notice that a background task ended, CI events, the record of a
slash command, the output of a local command, and messages from another session
or a teammate agent. A finished background task arrives as a prompt made of
nothing but such a block. The hook passed the whole field to the router, and the
block names themselves contain "notification" and "reminder". The word lists
tightened in 5.6.1 and 5.6.2 did not change this: on those lists the reported
prompt still routes CRITICAL and a bare task notice still routes FULL.

The hook now removes those blocks before it routes, and routes what is left. A
prompt with nothing typed in it gets no route. The words typed after a slash
command arrive inside a block of their own, so that block's tags are removed and
its words are kept. A replay of the 6,045 prompts queued on one machine, on the
5.6.2 word lists, showed the size of the fault. All 1,433 prompts with nothing
typed had been given a route: 966 FULL, 368 CRITICAL, 84 FOCUSED and 15 QUICK.
Now none of them gets one. In 7 of the 118 prompts that mixed typed words with
host text, the host text had raised the route, and in none had it lowered it.
None of the 4,494 prompts that held only typed words changes route.

Approval is unchanged, and it deliberately does not use the cleaned text. An
approval phrase counts only when it is the whole submitted prompt, so text the
host adds can never complete an approval. If blocks were removed first, a block
could be written so that the bare phrase is what remains, and the assistant,
which issues the token, can influence what such blocks say. The cost is one that
already existed: a phrase that arrives beside host text is refused, and a
background task that ends while an approval is waiting cancels it. In both cases
a fresh phrase is needed.

An independent review of the first version found that a hostile two-megabyte
prompt made the block search take 23 seconds. The host stops the hook after
five, so the turn would have gone unrecorded and a pending approval would have
outlived it. The search now takes 0.1 seconds on that prompt, and the route is
worked out after the turn is recorded, so slow routing can no longer delay the
approval bookkeeping. A second session checked the block list against every
saved prompt. It found that messages from teammate agents were missing, and that
the list the owner had given included the one block whose contents a person types.

The skill now says that a turn made only of host text arrives with no route, and
that the assistant must not route such text by hand.

Two known limits were not found in any saved prompt: a block that quotes its own
closing tag leaves its tail in the routed text, and a person who types a
complete listed block loses the words inside it. A third was found. One plugin
starts headless sessions with a machine-written prompt that has no block around
it, 2,381 of the saved prompts, and the router rates 2,022 of them CRITICAL.
This release cannot recognise them, and whether the hook runs in those sessions
has not been checked.

## 5.6.2 - 2026-09-20

The fault that 5.6.1 repaired in the payments library was present in six others.
An audit aimed 36 everyday sentences at those libraries and all 36 matched, each
with the twelve-question allowance. "do not push without asking" read as
notification work, "write this post in my voice" as recording work, "summarise
what you found in the repo" as a model feature, "add FAQ schema markup" as a
change to stored data, and "rebuild the package" as a rollout across the app and
the server.

The lists were then measured against 1,094 prompts that the owner typed over 45
days. Under the original lists 181 of them matched some library, which is 16.5
per cent. 5.6.1 brought that to 146. Under these lists it is 53, which is 4.8
per cent, and what remains is mostly payments, sign-in and "LLM" wording. None
of the twelve prompts that matched on "push" was about push messages, and ten
were about git. None of the thirteen that matched on "agent" asked for an agent
feature; they were about coding agents, skills and course content. None of the
ten that matched the rollout library described a change the app and the server
make together; they concerned dashboards, end to end testing, design mockups
and a branch name.

Each bare everyday word now has to arrive inside a phrase that names the product
feature. "push" became "push message" and "send a push". "reminder" became
"reminder email" and "send a reminder". "voice" became "voice recording" and
"voice memo". "schema" became "database schema" and "schema change". "rebuild"
became "rebuild the app" and "full rebuild". Words that are specific to a
feature stay as they were, among them "notification", "LLM", "RAG",
"transcription", "microphone", "recorder", "backfill", "mailer" and
"newsletter". In the sign-in library only "sign up" changed, because a
newsletter sign up form is not account work.

"notification" stays as a single word on purpose. Both real prompts that matched
it were about product notifications. The false matches on that word came from
the host's task-notification wrapper. The repair for that belongs in the hook,
and it is being made separately.

This release gives something up. A bug report in the middle of a task, such as
"one recording got corrupted and is not being sent", no longer matches the
recording library, because it names no feature phrase. The lists favour the
wording people use when they start a feature. Specialists are unaffected,
because they are selected from engineering words in a separate step.

Two things were left alone and reported. "checkout" still matches the payments
library and the protected payments rule, so "git checkout main" routes as
CRITICAL, and six of the seven real prompts that matched it were about git. The
word "move" counts as tidy-up work and switches the libraries off, so "Move
every recording to the new storage format and backfill the owner" matches
nothing.

## 5.6.1 - 2026-09-20

The owner typed "lets plan first" and Super-outer routed it as FULL, with twelve
questions, four specialists and an instruction to work through double charges
and failed renewals. The payments library listed "plan" and "pay" as match words
on their own. "plan" was meant as a subscription plan, and it also matched every
request that mentioned planning. "pay" matched "pay attention to the header
spacing" and "pay down the tech debt". One such word was enough to select all
four of the library's specialists, because a library adds its specialists
whenever fewer than three have been selected, and to raise the question
allowance to twelve.

Both words now match only inside a phrase that names something people pay for
or a way of paying: "paid plan", "free plan", "pro plan", "premium plan",
"pricing plan", "subscription plan", "billing plan", "plan upgrade", "plan
downgrade", "upgrade their plan" and "upgrade your plan", and "pay with", "pay
for", "pay by", "pay via", "pay using", "pay through", "pay now", "pay later",
"pay online", "pay button", "Apple Pay" and "Google Pay". "lets plan first" now
routes as FOCUSED with four questions, no specialists and no payments checklist.
"Add a paid plan with monthly billing" and "let users upgrade their subscription
plan" still reach the library. "payload" was never affected, because matching is
on whole words.

Reviewing the list showed the opposite fault in the same library. "Handle in-app
purchases on Android" routed QUICK with no specialists, while "Handle an in-app
purchase" routed FULL. The plural helper reduces "purchases" to "purcha" and
leaves "purchase" whole, so the two never matched. The list now names
"purchases" and "in-app purchases", as it already did for payments and refunds.

Six of the other seven libraries contain everyday words of the same kind, among
them "push", "digest", "prompt", "agent", "voice", "schema" and "rebuild". The
seventh, safe activation, has no match words. They were reviewed and reported,
and this release leaves them unchanged.

## 5.6.0 - 2026-09-12

Tasks can now record the intended user, client, environment, action and observable
result as a completion contract. Closing a task as PROVED checks current evidence
for every recorded requirement. Source tests cannot satisfy a hosted-client,
runtime or publication requirement. Changed target context, changed evidence and
expired observations require another check.

The command, repository verification and Stop hook share this evaluation. Ordinary
tools and commit work remain available. Older tasks without a contract remain
readable and explicitly report that the user outcome has not been verified.

Existing decision-proof checks now run at completion. A changed decision, a later
failed test run or an edited proof file invalidates its previous proof. Records
retain their limitation: they bind supplied evidence but cannot authenticate its
observer or detect an external change that was never checked.

## 5.5.1 - 2026-08-29

Installing 5.5.0 for Cursor exposed two faults, one of them introduced by 5.5.0
itself.

The Cursor runtime is staged from a hand-written file list, and 5.5.0 gave the
hook a new import the list did not name. The staged hook then died on import
while the installer still reported INSTALLED. The list is now derived by
walking the hook's real imports, the anticipation libraries it reads at runtime
travel with it, and the installer runs the staged hook before claiming success.

The second fault is older. The documentation has always said the skill lands at
`~/.cursor/skills/super-outer`, and the installer never put it there. The copy
on this machine was placed by hand in August and still announced 4.0.3 while the
hooks ran 5.5.0. The installer now installs the skill and refuses to report
success unless the installed copy announces this version.

Both were found by installing and looking, not by reading the receipt.

## 5.5.0 - 2026-08-25

The owner noticed that Super-outer interviews were narrow, and asked whether that was
imagined. It was not. The tool computes a question allowance for every
task, and across twenty realistic requests it allocated twelve questions nine
times and four twice. Four was what the owner kept receiving.

Two causes, both fixed.

**Nothing ran the router.** It was a command an assistant had to remember to
invoke, so depth and allowance were recalled from a table rather than computed,
and recall settles on the middle row. The session hook now computes the route
on every prompt and hands it over as working material for the assistant. It is
not shown to the reader: a line that appears every turn carries no information
for a person. It runs whether or not a task record exists, because a missing
record is ordinary and anticipation must not depend on optional bookkeeping.
Claude Code and Codex receive it as additional context; Cursor receives it as an
agent message.

**A full room switched anticipation off.** Archetypes were suppressed entirely
once three specialists had been selected. The intent was to stop them
bulk-adding specialists and unbalancing routing, but suppressing the match also
buried the known failure modes and held the allowance at the tier ceiling. That
inverted the purpose: a task worded in enough engineering vocabulary to select
three specialists is usually the task whose edge cases matter most. "Migrate the
recordings table and backfill it" selected four specialists, matched the
migration library on three separate words, and asked none of its six questions.
Specialist balance and question anticipation are now separate concerns. A full
room still declines the bulk-add; the failure modes always apply.

**Three new anticipation libraries**, taking the set from five to eight and the
known failure modes from twenty-seven to forty-five:

- changing information already stored: reversibility, partial state, silent
  loss, ownership, interruption, older app versions;
- a change the app and server must make together: release order, switching off
  without a release, people midway through the old journey, keeping results
  separable, who tests first, and one agreed measure of success;
- messages the product sends to people: wrong recipient, duplicate sends,
  consent, timing across timezones, silent failure, and weekly volume.

Measured on the same twenty requests, allowances of twelve rose from eight to
nine, and the two cases that previously fell through now route with their full
libraries attached.

## 5.4.2 - 2026-08-25

A developer cloned the repository, ran the only installation command the
documentation mentioned, and was told the tool refuses to touch their real
account settings. They concluded, reasonably, that installation was blocked on
purpose and stopped. It was not blocked. The command that switches Super-outer
on lived inside a packaged zip that no document named, so the working door was
unreachable and the visible door was a test rig.

**One command.** `npm run setup`, from a fresh clone, switches Super-outer on
for whichever of Claude Code and Codex is present. It builds the developer
package, unpacks it, and installs it, so the artifact it installs is
byte-identical to the one a released zip carries and both routes prove the same
thing. `npm run setup:verify` reports what is actually on;
`npm run setup:rollback` restores every file the install changed. Super-outer
has no dependencies, so a clone is ready to run with nothing installed first.
The staging command's refusal message now names the real installer instead of
reading as a locked door.

**Labels that cannot go stale.** The package shipped as 5.4.1 while every line
its reader saw said 4.0.3. Assets now carry a token the build substitutes, and
a test refuses any asset that types a version by hand. The packaged manifest
recorded a commit from the 4.0.3 era; it records the real one now.

**The instruction files say what is actually installed.** The installer wrote a
frozen v4-era guidance section into `~/.claude/CLAUDE.md` and
`~/.codex/AGENTS.md` while running 5.4.1 code. It now writes the managed block,
which states the installed version, replaces only what it owns, and removes the
old frozen section so the takeover is clean rather than refused. The block
regained the design-system authority and bookkeeping-warning lines it had lost.
A reader's own `## Super-outer — my own additions` no longer blocks it; only a
heading claiming to be the guidance does, and that refusal is now a visible
note rather than a rolled-back installation.

**The session-start notice about an unrelated branch is gone.** A development
task record was committed to this repository during 4.0.3 and left ACTIVE,
naming a branch that no longer exists. The marketplace checkout is a clone of
this repository, so every user received that record, and every session opened
inside the checkout with a notice comparing the current branch against a
historical one. The record is removed, live records are now ignored by Git, and
a test refuses any future one. Nothing was wrong with the notice itself: a
stale recorded context is exactly what it exists to report. The record simply
should never have travelled.

**Linux in fact, not only in the README.** The installer accepts macOS and
Linux and refuses Windows, and host lookup no longer depends on
`/usr/bin/which`.

**The installer is now covered by the gate that guards everything else.** Its
tests lived beside it and ran nowhere; `npm run verify` and CI now run them.
`npm run sync:digest` keeps the pinned payload digest honest, and a test fails
on drift rather than leaving it to surface inside someone's install.

## 5.4.1 - 2026-08-15

- Prompt submission is silent. Bookkeeping notices arrived there, ahead of any
  work, and the host labels every line of that event's output with the event
  name — so a one-line notice reached the owner wearing a paragraph of machinery.
  The same notices already travel with the first tool call, beside the action
  they are about, and the shared-checkout nudge moved with them rather than
  being lost. Turn recording and genuine approval failures are unchanged.

## 5.4.0 - 2026-08-15

Deploying code and switching it on are two decisions. Super-outer now treats
them that way — and stops shouting while it does.

**Safe activation.** A new feature, a substantial overhaul, a replacement, or
coordinated work across app and server now earns one plain question: should the
revision replace the current behaviour, or should both run together while
selected people test it? It explains, before asking, that both versions can
live in the same deployed service and that a switch returns everyone to the
current one without a revert or a redeploy. Terms like branch-by-abstraction
and canary stay out of it unless the technical detail is asked for.

The eight decisions it carries — activation mode, who may switch it on,
current-path fidelity, cache and data isolation, kill switch, app/server
coordination, what gets recorded, and migration compatibility — each name where
to look in the repository first, so anything already answered is reported
settled instead of asked. Each carries a sequencing class and the proof that
would settle it.

**A change-shape classifier, deliberately separate from archetypes.** Archetypes
are skipped once evidence has already chosen three specialists. Routing
activation through that path would have dropped the question on exactly the
large coordinated features that most need it, so it runs on its own.
Maintenance is checked first and wins outright: adding a test, renaming a flag,
updating docs, fixing formatting, and comment-only work never invoke it.

**A voice worth reading.**

- Severity is one emoji-led line — 💡 Heads up, ⚠️ Worth a look, 🛑 Stopping
  here — instead of five rows of block letters. The letters existed so the
  signal survived a terminal that strips colour; an emoji does that too.
- The advisory notice is said once per session, then silent. It used to fire on
  every mutating call, which is how a notice stops being read.
- Disclosures are warmer: "Nothing needed you this time — your own code had
  already answered everything."
- New earned moments, each shown at most once and only when something actually
  happened: a scoreboard that makes suppression visible ("Checked 7 things your
  code already handles. One needs you."), milestones that celebrate proof
  rather than activity, archetype openers, and curated facts. Facts are written
  and checked by hand, never generated — a tool that claims only what is proven
  must not invent a statistic to be charming.
- Every one of these lines is held to the same plain-language limits as a
  question, by test.

**The version ambiguity is gone.** The installer now owns a marked block in
`~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md` that reports the installed
runtime version. Everything outside the markers is preserved byte-for-byte, an
unmanaged same-name section is refused rather than overwritten, and removal
restores the author's file. A test proves the source, the managed block and the
running hook all report one version. The state directory drops its major
version from its name.

**A defect that hid the noise.** `SUPER_OUTER_ENFORCEMENT=advisory` made the
hook emit a message on every mutating call that fifteen tests asserted was
absent — so the suite failed for anyone running advisory mode while CI, which
never sets the variable, stayed green. Tests now decide the mode instead of
inheriting it, and both modes are covered.

## 5.3.0 - 2026-08-08

The author of a test is not its witness; the witness is the recorded run.

- **Proof candidates.** Each open obligation drafts into a candidate — the
  scenario from `provenBy`, the decision it protects, a suggested test path.
  A candidate guides the coding agent to write the real test in the target
  repository's own stack; Super-outer does not generate runnable test code,
  because a wrong generated test that passes is an overstated proof with extra
  steps. Drafting never changes obligation status.
- **Run-attested promotion.** An obligation reaches `PROVED` only through a
  recorded run: the test file must exist inside the repository, the command
  must name it, and the exit code must be zero. A failing run is recorded as an
  attempt — honest history, never proof. The attestation stores the test file's
  content hash together with the honest limitation that already governs source
  evidence: a hash binds the artifact, it does not authenticate its producer.
- **Proof rot.** Proof is a state, not an event. A proved test that later
  changes or disappears demotes its obligation to `STALE`, reported by the
  delivery gate exactly as unproven is.
- **Say-so is named as say-so.** The v5.2 string path still works but records
  `attested: false`; the gate distinguishes run-attested proof from evidence
  that was merely named.

## 5.2.0 - 2026-08-08

Sequencing (v5.1) and proof obligations (v5.2), shipped together.

### Sequence by the cost of changing your mind

- Every archetype failure mode carries a class: `now` (ruinous to retrofit —
  data shape, ownership, idempotency on anything irreversible, consent),
  `decide` (cheap later only if a decision now keeps the door open — offline,
  caching, multi-device), or `defer` (genuinely additive later).
- The interview orders `now` before `decide`; when a budget truncates, the
  survivors are the questions whose wrong answer costs most to discover late.
- It is not "auth first": a login screen defers freely, the ownership column
  does not. Consent is `now` because it cannot be obtained retroactively.

### The deferral ledger

- `defer` items never spend interview budget. They are recorded in
  `.engineering/super-outer/ledger.json` with `revisitWhen` — where in the
  repository to look to see whether the deferral has expired. Triggers are
  repository conditions, never dates: "revisit rate limiting when a public
  endpoint exists" stays checkable; "revisit later" rots.
- This is the v5.0 suppression engine pointed the other way: `lookFor`
  suppresses asking, `revisitWhen` resumes it. Same evidence engine, and
  re-triggering rides along with routing instead of relying on memory.
- Past ten open entries the ledger says plainly it has become a wishlist.

### Considered is not proven

- Each answered archetype question carries `provenBy` — the check that would
  demonstrate the answer holds — and becomes a proof obligation in
  `.engineering/super-outer/proof-obligations.json`, status `UNPROVEN` until
  named evidence exists. "It works" is not evidence; marking proved requires
  naming a test file, CI run, or recorded journey.
- Open obligations are reported with every delivery claim, visible and advisory
  for ordinary work, exactly as independent-review gaps already are.
- Deliberately no auto-generated proof code: an overstated proof is worse than
  an open obligation.

## 5.0.0 - 2026-08-08

Super-outer stops waiting to be told what kind of work this is.

Measured on 4.2.0, "Build a voice recording pipeline for the app" selected
**zero specialists**. Not the wrong questions — nobody in the room to have an
opinion. `triggerGroups` matches engineering vocabulary (`retry`,
`idempotency`) that nobody types when asking for a feature.

- **Archetypes.** A kind of work — mobile capture with background upload,
  sign-in, payments and subscriptions, an AI-backed feature — brings in the
  specialists that always matter for it and the failure modes that recur every
  time. They match product nouns, which is what people actually say. Core
  library ships in-repo at `skills/super-outer/references/archetypes/` and is
  enriched from the Obsidian vault by exact key, degrading silently when absent
  — the same shape the v4.1 glossary uses.
- **Look before asking.** Every failure mode records where in the repository to
  check whether it is already handled. What the repository answers is reported
  as settled through the v4.1 disclosure instead of being asked. Without this
  an archetype over-asks by construction.
- **Fill an empty room, don't crowd a full one.** Archetypes apply only where
  evidence has not already assembled a panel, so balanced routing is unchanged
  on tasks that were already routing well.
- **A greenfield archetype route earns a larger interview** (12) rather than
  truncating to seven. Before the thing exists is when asking is cheapest and a
  wrong assumption is most expensive.
- **Maintenance never summons an archetype** — rename, typo, reformat. A
  protected domain outranks that exemption.
- **Plural fix (security-relevant).** Protected-domain patterns matched
  `\bpayment\b`, so "payments" failed the word boundary. "Handle refunds"
  routed QUICK with zero specialists while "Handle a refund" routed CRITICAL.
  Noun heads now carry an optional plural, verified not to make `secretary`
  match `secret`.
- Explicit negation outranks an archetype: "without a model" still suppresses
  the AI specialist.

## 4.2.0 - 2026-08-07

Completes the language layer 4.1.0 started. The glossary shipped then; the
mechanical checks ship now.

- **Questions are checked by code before they are shown.** "Reread it as a
  product leader" is the same pass judging its own work, and a pass that can
  argue with itself is not a check. `src/question-audit.mjs` runs at the render
  boundary and binds.
- **One decision per question** — two question marks, a semicolon, or "and also"
  joining two asks blocks the question. A consolidated interview already bundles
  decisions into one call; an individual question must not re-bundle them.
- **Length caps** — 28 words for the question and its consequence, 9 for an
  option label, 20 for an option's consequence.
- **Noun clustering is advisory, never blocking.** More than three content words
  in a row is flagged for the router to rewrite, but never removes the question:
  a heuristic that cannot tell an adjective from a noun must not delete a good
  question and replace it with an apology.
- A blocked question is dropped with its reason translated into ordinary English
  and surfaced through the 4.1.0 disclosure, so a drop is never silent.
- The disclosure is held to the same caps as the questions and summarises extra
  reasons instead of listing them all.
- Fixes a live 4.1.0 bug: `references/plain-english-questions.md` still said
  "QUICK 0–2" after the floor shipped, and 4.1.0 links that file on every route.

## 4.1.0 - 2026-08-07

Restores the question phase, which collapsed at v4.0.0 and was never a stated
goal of the v4 line. See `docs/plans/super-outer-v4.1.md`.

- Engagement triggers again name bug fixes, defects, regressions, and refactors,
  and trigger when the change is described without coding vocabulary. Measured
  cause: `skillUsage` shows OUTER 2.1 at 32 engagements against v4 at 8.
- `QUICK`, `FOCUSED`, and `FULL` gain a question floor alongside their ceiling.
  It is satisfied by a genuine question **or** by one plain line stating no
  judgement call was needed — never by silence, and never by a manufactured
  question.
- An interview that would have rendered empty now discloses what was dropped and
  why, translated into ordinary English. Eight filters could previously discard
  every candidate silently.
- `SKILL.md` links the question-design references directly, so a route that
  selects no specialist still opens them.
- Ships a spec-conformant root `plugin.json` for Agent Plugins v1.0.0 alongside
  the existing host manifests, which are unchanged.
- No change to approval behaviour: ordinary reversible work still continues
  without an approval phrase, and `CRITICAL` routing is byte-identical.

## 4.0.4 - 2026-08-04

- Add a native Cursor adapter that reuses the shared Claude/Codex hook through
  `adapters/cursor/bridge.mjs`.
- Install globally with `node scripts/install-cursor.mjs` / `npm run install:cursor`,
  staging runtime files under `~/.super-outer/cursor-runtime` and merging
  `~/.cursor/hooks.json` without removing unrelated hooks.
- Recognise Cursor file tools (`StrReplace`, `Delete`, `EditNotebook`) as local
  edits in the shared hook.
- Keep warn-first behaviour: ordinary reversible work continues; only an
  extremely critical consequence denies a tool. Cursor Stop cannot hard-block
  completion, so a critical Stop becomes a follow-up message.

## 4.0.3 - 2026-08-04

- Promote Super-outer to the sole active enforcement owner by removing legacy
  OUTER v3 hooks from Claude settings and Codex's actual hooks file while
  retaining the v3 skill files and rollback snapshot.
- Replace recognised global OUTER v3 instruction blocks with the v4 warn-first
  rule so ordinary work no longer requests `APPROVE OUTER-...`.
- Render ordinary `BEWARE` panels in bright orange; retain red `STOP` and one
  exact approval only for a concrete super-critical action.
- Preserve unrelated hooks, global instructions, and Cursor configuration.
- Move retained OUTER 2.1 and v3 skill copies out of Claude/Codex discovery into
  separately hashed archives; keep exact rollback and delete neither version.

## 4.0.2 - 2026-08-04

- Remove Super-outer approval prompts from ordinary reversible code changes,
  video and document analysis, temporary evidence files, tests, builds, routine
  Git delivery, and CI reruns.
- Let unfamiliar tools continue quietly unless a concrete extremely critical
  consequence is detected.
- Keep exact, one-use approval only for production, protected-data, authority,
  financial, destructive-infrastructure, protected-history, and safety-control
  boundaries.
- Add regression coverage from the reported video-review and red-CI workflows.

## 4.0.1 - 2026-08-03

- Make stale branch context a visible warning for ordinary work instead of a
  blanket tool block.
- Reserve blocking for explicitly recognised, extremely critical actions.
- Make separate review advisory outside critical production delivery while
  retaining exact source proof and disclosing review gaps.
- Add large colour-aware ASCII `BEWARE` and rare `STOP` notices with a plain
  fallback for hosts that do not render colour.
- Keep macOS as the primary platform, Linux supported, and Windows unsupported.

## 4.0.0 - 2026-08-03

- Rebuild OUTER as a native Claude Code and Codex plugin.
- Add balanced progressive routing across twelve peer engineering specialists.
- Add source-linked company and repository profiles.
- Add task-bound approval, exact Git/CI evidence, isolated installation,
  deterministic packaging, migration, and rollback.
- Make the user-facing product an explicit English-to-senior-developer
  translation layer while keeping full technical depth in the evidence layer.
- Add adversarial enforcement for destructive shell variants, concurrent and
  drifted approvals, protected-task routing, secret-safe packaging, linked-path
  containment, fresh host proof, interrupted installs, and live CI evidence.
- Add native Codex reviewer-role installation, canonical profile containment,
  provenance-safe inheritance, content-level credential scanning, exact-source
  hook binding, durable source-evidence limits, and live CI rereading at task
  closure.
- Preserve OUTER v3 until v4 completes cross-host verification.
