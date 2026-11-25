# Code-flow diagrams

A code-flow diagram explains one endpoint or backend flow to a developer who will open the code. Columns show who acts (the client, the backend, the stores and outside services), time runs down the page, steps are numbered, an AT ONCE tag marks work that runs at the same time, every step names the function to open, a failure strip says what happens when a step fails, and a glossary explains the system's own terms. Set `data-diagram="code-flow"` on the `<svg>`; `scripts/diagram_kit.py` writes it for you. The checker applies its usual rules to this kind (text fits its box, every arrow is labelled, no arrow runs through or under a box, a facts block is present) and does not require the "Live" legend entry.

The code-flow kind was contributed by a team member on 22 October 2026.

## Contents
- How to build one
- Colours and shapes this kind adds
- The layout spec
- Finding the active path and reading it safely
- Verification and honesty

## How to build one

1. Say in one line which endpoint or flow the picture covers and who it is for. When "this endpoint" is ambiguous, state the assumption and carry on.
2. Find what the live client calls, then read the refs that run (`main`) and are coming (`staging`) with `scripts/snapshot-refs.sh`, never a working tree that may be on a stale branch.
3. Follow one real request from the client through routes, controllers, queue, worker, stores and outside services, writing down `file::function` for each hop.
4. For each step record who runs it, whether the caller waits, the data in and out, limits, retries, idempotency gates and what happens on failure. Mark it `in order` or `at the same time` from the code (a `gather`, a semaphore, separate queued jobs), never from the names.
5. Copy `assets/example-code-flow.py`, which imports `scripts/diagram_kit.py`, and replace its content. Edit the generator and run it again; never hand-edit the SVG it writes. Pass the facts to `Diagram(...)` and the kit writes the facts block.
6. Copy `scripts/verify_facts_template.py` beside the generator and add one check per claim.
7. Run the checker and the renderer, then `node scripts/slice-diagram.mjs out.svg 1300` to review a tall picture slice by slice at full size.
8. Save the SVG and PNG where the owner said, or in `docs/architecture/<endpoint>-data-flow.svg`. Link it from the box on the architecture diagram that it explains. Do not commit to a repository whose branch is stale or unrelated; say so instead.

`scripts/selftest.sh` generates the example, checks it, confirms the template matches its generator, runs the verification skeleton and, when a Chrome-family browser is present, renders and slices it.

## Colours and shapes this kind adds

The colours, shapes, text sizes and arrows are the ones in [style.md](style.md). This kind adds:

- Height may be 3,000 or more; review it in slices.
- Indigo carries "work at the same time" (the AT ONCE chip, the phase C group) as well as overview strips and phase bars. Teal carries failure and recovery strips.
- A lane that holds two kinds of part (stores and outside services) is neutral: fill `#F8FAFC`, border `#CBD5E1`; its boxes keep their own colours.
- A box may carry a fourth line at 14 px bold in the border colour, bottom-aligned, for the code pointer.
- Phase bar: full-width 36-high rounded rectangle, solid indigo, 18 px bold white text. Boundary bar: 44 high, white with an indigo outline, 18 px bold indigo text.
- AT ONCE chip: 76 by 24, indigo fill, 14 px bold white text, at the top right of a box.
- A small arrowhead (`a-<colour>-s`) for short step-to-step arrows.
- When a legend is drawn, add "Runs at the same time" with an indigo swatch whenever a chip or phase C appears.

Pitfalls found in practice:

- A phase bar over a lane makes the checker read the bar text as inside the lane and report overruns. Draw lanes per phase, beside the bars.
- A label that starts inside a group and ends outside it is reported as running past the group. Start gap labels at least 4 units after the border they leave.
- A vertical arrow through a group's title row crosses the title text. End the arrow on the group edge, or shorten the title.
- Slicing a tall PNG with image tools can crop from the centre; `scripts/slice-diagram.mjs` changes the SVG view box instead.
- Formatters may rewrite a generator after you save it; match on string literals when you patch it.

## The layout spec

Canvas 1440 wide, any height. White background. Time runs down. Build it with `scripts/diagram_kit.py`; `assets/example-code-flow.py` is a complete worked example.

### The bands, top to bottom

1. **Title, subtitle, legend.** Title at 42 px names what the picture shows in the reader's words ("How a voice note becomes a note"). Subtitle: what it shows plus the refs and date it reflects ("App main d9679b53, backend main a6432bc, 16 Oct 2026"). Legend top right: Live, Planned or staging only, Runs at the same time.
2. **How to read this.** Three short columns, two lines each: lanes and time; arrow labels and numbered steps; the AT ONCE tag and dashed boxes.
3. **The whole thing in four moves.** Four boxes left to right, each with a title, two lines and a bold tag line `Caller waits: yes / this far only / no`. Arrows between them carry the data (`parts`, `1 job`, `done`). A reader who stops here still has the right mental model.
4. **One after another, or at the same time?** Two boxes side by side. Left lists up to three things that run in order. Right lists up to three that run together (with the AT ONCE chip).
5. **Phase A bar, then lanes.** A solid indigo bar: who drives and who waits ("A. Upload: the phone drives, one request at a time. The API answers each one fast."). Then the lanes for the calls the client waits on.
6. **Boundary bar.** White bar with an indigo outline: "The client's request ends here. Everything below runs in the background." This line does more teaching than any box.
7. **Phase B bar, then lanes.** The background job, step by step, in order.
8. **Phase C group.** Indigo group: separate jobs that start after the main work and run at the same time.
9. **Failure strip** (teal): client retries, replay-safe steps, retry policy, sweeps.
10. **Older or fallback lane** (orange, compact): one wide box describing legacy routes and what they share with the main path.
11. **Glossary** (indigo): six terms, two lines each, in the system's own words.

Drop bands that do not apply (a synchronous endpoint has no phase B), but keep 1 to 5, the boundary bar when anything runs after the reply, and the glossary.

### Lanes and geometry

Three lanes, drawn once per phase (never one tall lane behind a phase bar; the checker reads the bar's text as lying inside the lane box).

| Lane | x | width | box x | box width | Colour |
|---|---|---|---|---|---|
| Client | 30 | 290 | 45 | 260 | blue |
| Backend: API, then worker | 410 | 620 | 430 | 580 | orange |
| Stores and services | 1120 | 290 | 1135 | 260 | neutral fill `#F8FAFC`, border `#CBD5E1` |

Gaps between lanes are 90 wide. Arrow labels sit in those gaps, start at least 4 units from a lane border (client gap: x 326 to 400; right gap: x 1040 to 1110) and stay under about 10 characters. Put richer detail in the box text, not on the arrow.

Inside the right lane, stores are purple boxes and outside services are green boxes; the lane itself is neutral because it holds two kinds of part.

`Diagram.mark()` before the first box and `Diagram.lanes(top, bottom, LANES, at)` after the last put the lane backgrounds under the boxes; call it once per phase with `at` and `at + 3`.

### Rows and arrows

- A row is one moment. Box heights: client boxes 84 to 104, backend boxes 104, right-lane boxes 60 to 84. Leave 24 between rows.
- Arrows are straight and horizontal between a backend box and a box in the next lane. One arrow per direction, each with its own label (`start`, `ack`, `insert`, `enqueue`).
- Two-way exchanges are two arrows: request at the upper third of the box, reply at the lower third.
- Between consecutive worker steps draw a short vertical arrow labelled `then`, using the small arrowhead (`small=True`), with 28 units between boxes.
- The arrow from the last worker step down to phase C is labelled "enqueue, no waiting".

### Step boxes

Every backend step box has:

- a title with its number and, where the system exposes progress, the progress in brackets: `3. Speech to text (10-65%)`;
- two lines of text at 16 px, at most about 66 characters each, saying what happens and the one thing a newcomer would get wrong;
- a code pointer at 14 px bold in the border colour: `module.function` or `path/file + path/file`;
- an AT ONCE chip top right only when work inside the step runs concurrently.

Client-lane boxes beside the steps show what the client sees: "Phone is free", "Screen says: Cleaning audio...", "Note is done". Map stage names to the label the client really shows, from the client code.

### Sequential versus parallel

Decide each from the code, then draw it the same way every time:

| In the code | On the picture |
|---|---|
| `await a(); await b()` | Numbered steps, `then` arrows |
| `asyncio.gather`, `Promise.all`, a thread pool, a semaphore with more than one slot | AT ONCE chip on the step, and a line in the "at the same time" box |
| Several jobs enqueued, none awaited | Phase C group, chip on each job that has parallel work inside it |
| A background ticker or heartbeat beside the main call | AT ONCE chip, and say what runs beside what |
| Many users' work sharing a worker pool | Not a chip: a line in "Limits" or the summary box ("up to 8 jobs per worker") |

A step the caller does not wait for is not "parallel"; it is "after the boundary bar". Keep those two ideas apart.

### Phase C and below

- Phase C boxes: title, three lines, code pointer. Dashed for jobs that exist but are not used for new work.
- Failure strip: four boxes (retries, replay-safe steps, no automatic retry, sweeps). Use real numbers from the code (`5 s to 60 s backoff`, `max_tries 1`, `idle 15 min, 3 tries`).
- Older lane: one wide box, one title, two lines. Say what is older, when it is used, and where it rejoins the main path ("then steps 4 to 9").

### Sizing text

SVG does not wrap. About 8 units per character at 16 px, about 12.5 per character for a 21 px bold title, about 7 for 14 px. A box 580 wide takes about 66 characters per line; a 260-wide box takes about 28. `check-diagram.mjs` measures every line; fix what it reports by splitting a line or shortening, never by shrinking below 14 px.

### Mistakes to avoid

- Drawing every route the server has instead of the path the client takes.
- A tall lane behind a phase bar (false "touches border" errors); draw lanes per phase.
- Arrow labels longer than the gap; move detail into the box.
- Calling work "parallel" because it is asynchronous. Asynchronous only means the caller does not wait.
- Putting a number on the picture that no code or measurement supports.
- Putting staging-only parts in solid. Dashed means "not in the live release", and the subtitle names the refs.

## Finding the active path and reading it safely

A diagram of the wrong path is worse than no diagram. This method exists because the first draft of the voice-note diagram showed the wrong main path: the server still had per-piece chunk routes, the shipped app had moved to a single file uploaded in parts, and the checkout on disk was 19 commits behind.

### Read refs, not the working tree

1. Find the refs that matter: the live branch (usually `main`) and the upcoming one (`staging`). Check what the checkout is on and how far behind it is:

   ```bash
   git -C <repo> branch --show-current
   git -C <repo> rev-list --count HEAD..origin/staging
   git -C <repo> log -1 --format='%h %ad %s' --date=short origin/main
   ```

2. Snapshot only the directories you need. The script leaves the working tree, the index and local branches alone; its `git fetch` updates remote-tracking refs inside `.git` and needs the network (`SNAPSHOT_NO_FETCH=1` skips it):

   ```bash
   scripts/snapshot-refs.sh <repo> origin/main    /tmp/scratch/be-main    api controllers workers utils config
   scripts/snapshot-refs.sh <repo> origin/staging /tmp/scratch/be-staging api controllers workers utils config
   diff -rq /tmp/scratch/be-main /tmp/scratch/be-staging
   ```

   The `diff -rq` is the list of what staging adds. Those parts are drawn dashed.
3. For a second repository (the app, the web client) use `git show <ref>:<path>` for single files and `git ls-tree -r --name-only <ref> <dir>` to see whether a feature exists at that ref.
4. Never write into the working tree to investigate. Scratch output goes in a scratch directory outside the repository; the script refuses an `<out-dir>` inside it.

"Live" means the release branch unless you have checked the deployment. If you did not check the deploy, say "main" on the picture and in the report, not "production".

### Client first

1. List every call the shipped client makes to the endpoint family. Grep the client for the route prefix and for the API wrapper's function names.
2. For each call, find where it is triggered: which screen, which state, which fallback. Read the capture or send code, not only the wrapper.
3. Decide which calls are **primary**, which are **fallbacks the client really uses** (live, draw solid and small), and which are **legacy** (still present, used only for older stored data; draw small and labelled). A route that no client calls is not on the picture except as a one-line note.
4. Compare the client at `main` with the client at `staging`. A staging-only screen or call is a dashed box.

### Walk the server

For the primary path, follow the request in this order and stop at each boundary:

1. **Route**: path, method, rate limit, auth dependency, what it returns and when. Does the request wait for the heavy work, or does it enqueue and answer?
2. **Controller or service**: the sequence of awaits. Note every `gather`, `create_task`, thread pool, semaphore and queue enqueue: that is where "at the same time" lives. Everything else is in order.
3. **Queue**: the job name, the job id (does it dedupe?), the timeout, retry count, per-worker concurrency, cron sweeps that recover stuck work.
4. **Worker steps**: the order of calls, the progress fields written between them, what each step reads and writes.
5. **Outside services**: which model or API, which fallback, which timeout, what it returns that the next step needs.
6. **Fan-out**: what is enqueued after the main work finishes and what each side job does alone.
7. **Failure**: what the request does on error, what the job does on error, what the sweeps do later.

### What to record at every hop

Write one line per hop in a scratch note; the picture is built from these lines.

```
step | who | caller waits? | in order / at once | data in -> data out | limits, timeout, retry | idempotency gate | file::function | verified by
```

### Signs you have the wrong path

- The route exists but you cannot find a client call for it.
- The client comments say "legacy", "v3", "deprecated" or "kept for older versions".
- The server has two routes that look alike (`/chunk` and `/upload/.../part`).
- The checkout's last commit is older than the release branch.
- A constant such as a chunk length is exported but referenced nowhere.

When any of these appears, go back to "Client first".

### Things you cannot learn from code

State these as unverified rather than guessing:

- Which commit the deployment actually runs.
- Environment variable values in production (two env files may disagree; say "set per environment").
- Behaviour that depends on a token's contents, a device, or a provider's response, unless you ran it.
- Timings and costs you did not measure.

## Verification and honesty

A diagram teaches whatever it states. If it states something the code does not do, it teaches the wrong system with confidence. This file says how to keep it true and how to report what you could not prove.

### The facts block

Pass a `facts` dict to `Diagram(...)`; the kit writes it into `<metadata id="diagram-facts">`. Put in it every value the picture states that the code also states:

- names of parts that come from code (jobs, queues, stores, functions);
- limits, timeouts, retry counts, concurrency, rate limits, part sizes, thresholds;
- model names and which one is the fallback;
- progress values written between steps and the labels the client shows for them;
- whether each part is live (`"deployed": false` for dashed parts);
- the refs the picture reflects (`"appMain": "d9679b53"`, `"backendMain": "a6432bc"`).

Leave out anything the code does not state. A colour or a box count is style, not a fact.

### The verification script

Copy `scripts/verify_facts_template.py` next to the generator, rename it `verify_facts.py`, and add one `check(name, condition)` per claim. Run it with the snapshot directories:

```bash
python3 verify_facts.py diagram.svg --main /tmp/scratch/be-main --staging /tmp/scratch/be-staging
```

It prints `ok` or `FAIL` per claim and exits non-zero on any failure. Keep it outside the repository unless the owner wants a test there, and never add it to a repository on a stale or unrelated branch.

### What a check should look like

| Claim on the picture | Check |
|---|---|
| A constant (timeout, size, limit) | The literal appears in the source, and equals the fact |
| "Step B waits for step A" | Both calls appear in one function body, in ascending position |
| "Runs at the same time" | The concurrency primitive is present (`gather`, `Semaphore(n)`, a thread pool) |
| "Runs in order" | No such primitive wraps those calls |
| "Live" | The route, function or file exists at the live ref |
| "Staging only" | Present at the staging ref, absent at the live ref |
| "The client calls X" | The client source at its live ref contains the call |
| "The client shows label L for stage S" | The client's mapping contains the pair |
| A code pointer `module.function` | The function exists in that module |
| A rate limit on a route | The decorator sits directly above that route |

A check that cannot fail proves nothing. Break one fact on purpose, confirm the check fails, then restore it.

### Evidence classes

Keep these apart in your head and in the report:

1. **Source read**: you read the code at a named ref.
2. **Script verified**: a check compared a claim with the code (report the count).
3. **Test or CI**: the project's own tests or pipeline passed (usually not run for a diagram).
4. **Deployed**: you checked what the deployment actually runs.
5. **Observed**: you ran the flow on a device or in an environment and saw it.

A diagram normally reaches class 2. Say so. Never write "live" for something you only know is on the release branch; write "main".

### Reporting

Report in this order, plainly:

1. What the picture lets a new teammate understand.
2. What is verified: the number of checks and what they covered.
3. What is not verified, one line each, with the reason (deploy not checked, behaviour not run, environment values disagree, behaviour depends on a token or provider you could not exercise).
4. Where the files are and whether anything was committed.
5. Any earlier picture or note this one corrects. Say so even when the earlier picture was yours.

If you find your own earlier claim was wrong, fix the picture first, then say what changed and why. Correcting is part of the work.

### When to redraw

Redraw in the same change as the code when:

- a step is added, removed, reordered or renamed;
- a step becomes parallel or sequential;
- an outside service, model or fallback changes;
- a limit, timeout or retry count changes;
- a dashed part goes live, or a live part is switched off;
- the client changes which routes it calls or when;
- a release changes the refs the subtitle names.

After redrawing: update the facts block, run the verification script, run the checker, render, slice and look.
