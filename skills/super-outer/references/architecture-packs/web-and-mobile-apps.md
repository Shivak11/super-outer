# Architecture pack: web and mobile apps

Researched: 2026-10-12. Revisit by: 2028-04-12 (18 months, a stable area).
Confidence: medium to high. Most rows rest on current official platform
documentation. Rows marked "judgement" have no sourced number, and the reason
is given in the row.

Contents:

- [Kind of system](#kind-of-system)
- [Known designs (designs)](#known-designs-designs)
- [Known failure moments (failure_moments)](#known-failure-moments-failuremoments)
- [Decide now or later (now_and_later)](#decide-now-or-later-nowandlater)
- [Stack options (stack_options)](#stack-options-stackoptions)
- [Sources](#sources)

This pack is read by the [story walk](../story-walk.md). Its sections match
the architecture-mode output of the
benchmark researcher agent (`super-outer:benchmark-researcher`), so a
project pack researched later has the same shape. Source numbers in square
brackets refer to the Sources table. Prices are never recorded here; read the
pricing pages listed under stack options at decision time.

## Kind of system

Products that people use through a web browser or a phone app: a login, data
they create and come back to, perhaps uploads, payments, live updates or AI
features. Examples are a marketplace, a booking app, a dashboard, a chat app
and a course platform. Agents with long-term memory, multiplayer games and
simulations need their own packs.

## Known designs (`designs`)

Simplest first. Each later design adds parts to the one above it.

1. **One managed app and one managed database.** The hosting provider runs
   copies of the app as traffic grows and spreads requests across them [1][14].
   This is the baseline.
2. **Baseline plus file storage behind a CDN**, when customers upload files.
3. **Baseline plus a managed live-update service**, when one person's action
   must appear on another person's screen without a refresh.
4. **Baseline plus background jobs**, when work is slower than a request
   should be, or calls email, image processing or an AI model.
5. **A larger database, then shared caching, then read copies of the
   database**, each added only when a measured signal in the later rows
   appears.
6. **Self-run servers behind a load balancer**, only when the budget or the
   law rules out managed hosting.
7. **A split database or several regions**, only after measurement shows the
   largest single database is near its limits, or a law requires it [28][29].

## Known failure moments (`failure_moments`)

| Moment for the customer | What goes wrong with the baseline | Smallest fix | Why | Sources |
|---|---|---|---|---|
| Uploads a 20 MB photo or document | Requests to app functions are capped at 4.5 MB, and files written to an app server's disk are lost on restart and invisible to other copies | The phone or browser uploads straight to file storage through a short-lived signed link; files above about 6 MB use resumable upload; files are served through the CDN | The app never carries the file, and the CDN serves it from near the customer | [1][13][15][10][4] |
| Sends a chat message that a friend should see at once | Each live connection stays on the copy of the app that accepted it, so a message reaches only people connected to the same copy; connections also close at the function's time limit | A managed live-update service, or a shared message channel that every copy publishes to and listens on, with automatic reconnect in the client | Every connected person receives the message, whichever copy holds their connection | [2][34] |
| Hundreds of people sign in during the evening rush | The app serves thousands of requests at once, and each copy opens its own database connections, while the smallest managed databases accept about 60 direct connections | The database provider's connection pooler, in the mode meant for short-lived functions | Many copies share a small, steady set of connections | [1][3][6][7] |
| Someone scripts the sign-up or OTP form | Each OTP SMS costs money, and automated requests can run up the bill in minutes, including SMS pumping fraud | Rate limits per account, phone number and network address; a spending cap at the SMS provider; the provider's fraud protection | The bill is capped, and real customers can still sign in | [20][22][19] |
| Guesses passwords on someone's account | Unlimited attempts let an attacker try leaked password lists | Limit consecutive failed attempts per account, then slow down or lock with recovery through email | Guessing stops before it succeeds | [18][19] |
| Pastes long text into an AI feature again and again | Each AI call is billed by use, so one person can run up the cost for everyone | Per-user quotas and rate limits on AI calls, and a monthly ceiling at the AI provider | Spending stays inside the owner's budget | [21][20] |
| Double-taps Pay, or the gateway sends the same payment notice twice | The order or the charge can happen twice; a gateway such as Razorpay delivers each notice at least once and expects a reply within 5 seconds | Send a unique key with every charge request; record each payment notice's event ID once and skip repeats; reply at once and finish the work in a background job | The customer is charged once and the order is made once | [16][17] |
| Signs up and waits for a welcome email or a PDF receipt | The page hangs while slow work runs inside the request | A background job; the page confirms at once and the work finishes shortly after | Requests stay under about half a second, and customers stop waiting on outside services | [12][27] |
| A bad change deletes customer data at 3 pm | Daily backups restore yesterday's data, so a day of work is lost | Point-in-time recovery, which restores to within about two minutes | Only minutes of work are lost | [9] |
| Opens the app on a phone network in India | The app and database sit in the provider's default region in another country | Choose the app's region and the database's region next to the customers when the project is created | Every request travels a shorter distance, and the database and stored files stay in that country | [5][11] |
| A bug ships in the phone app | Customers keep the broken version until a new store build is approved and installed | Over-the-air updates for screens and text; a store build only for native changes | Most fixes reach phones without waiting for store review | [33] |

## Decide now or later (`now_and_later`)

### Decide now, each conditioned on a fact in the brief

| If the brief says | Add now | Sources |
|---|---|---|
| Customers upload files | File storage with signed upload links, served through a CDN | [1][4][10][13][15] |
| Anything updates live on another person's screen | A managed live-update service or a shared message channel | [2][34] |
| There are accounts, OTP sign-in or paid AI features | Rate limits on sign-up, login, OTP and AI calls, and spending caps at each paid provider | [18][19][20][21][22] |
| OTP or other SMS goes to Indian numbers | Register the business, the sender name and each message template on a DLT platform before launch; operators block unregistered senders | [23] |
| The product takes payments | Charge-once protection: a unique key per charge and each payment notice handled once | [16][17] |
| Data must stay in a country | Choose that region for the app, the database and file storage at creation; Vercel and Supabase both have a Mumbai region | [5][11][24][25][26] |
| Some work is slower than about one second, or sends email, processes images or calls an AI model the customer does not watch | A background job | [12][27] |
| The app runs on serverless functions and uses a database | The database provider's connection pooler | [3][6][7] |
| Acceptable data loss is minutes | Point-in-time recovery; a free plan has no automatic daily backup | [9] |

For India: the DPDP Act, 2023 allows personal data to leave India except to
countries the central government restricts by notification, and the DPDP
Rules, 2025 were notified on 14 November 2025 with an 18-month phased
timeline [24][25]. Payment system operators must store payment data only in
India [26], so check whether the product is one before deciding the region.

### Later, each with a measured trigger

| Add later | When | Source of the threshold |
|---|---|---|
| A larger database | Database CPU stays above 70% | Supabase's guidance [8] |
| Shared caching of responses that are the same for everyone | That response is read far more often than it changes, and either database CPU stays above 70% or responses regularly take one second or longer | Judgement, built on [8] and [12]. Static files are cached by the CDN from day one [4] |
| Read copies of the database | At least about 80% of the load is reads and the database is already at its largest size, or a large group of customers is on another continent, or heavy reports must not slow the app | [8] |
| A load balancer | Only when the product runs on self-run servers and needs more than one | Managed hosts balance traffic themselves [1][14] |
| A split database | The largest single database is near its limits on CPU, writes or routine maintenance | Judgement. Figma and Notion split theirs only at that point, and neither gives a general number [28][29] |
| Several regions | A law requires it, or measured response times for a large customer group far from the region miss the owner's target after caching | Judgement. No source gives a general number |

### The baseline row

| Brief | Design |
|---|---|
| A plain product with no uploads, no live updates, no payments and demand within the limits above | One managed app and one managed database, nothing else yet |

Most small products end at this row. This is a judgement drawn from the limits
above: managed hosting runs more copies of the app by itself [1][14], the
smallest managed databases accept about 200 pooled clients [7], and the first
database step is a larger size, triggered by sustained CPU [8].

## Stack options (`stack_options`)

When the project already has a stack, keep it unless a walk failure requires a
change. For a new product, the options below are listed in order of fit to
this pack's fixes.

| Option | Fits when | Trade-off | Pricing pages |
|---|---|---|---|
| A React web app with Next.js on Vercel, a managed Postgres database from Supabase with its sign-in, file storage and live updates, and Expo for a phone app | Most products in this pack, including uploads, live updates and an Indian region [10][11][34][35] | Function time limits and connection pooling must be respected [1][6]. Postgres data exports with standard tools [9]. React, Next.js and PostgreSQL are among the most used tools [30], and AI coding agents write well-represented languages and tools more correctly [31] | vercel.com/pricing, supabase.com/pricing, expo.dev/pricing |
| One long-running server app on Render with a managed Postgres database | Long-running work, many live connections held by one server, or a team already using a server framework | No function time limit, and Render balances traffic across copies [14]. Sign-in, file storage and live updates must be added as separate pieces | render.com/pricing |

React Native's own documentation recommends starting a new phone app with a
framework such as Expo [32]. Popularity ranks these options; it is never the
evidence that a design is correct.

## Sources

Every row was read on 2026-10-12. Grades use the classifications in the
benchmark researcher's contract.

| # | Source | Date | Grade | Limitation |
|---|---|---|---|---|
| 1 | Vercel, Vercel Functions limits, vercel.com/docs/functions/limitations | updated 2026-08-24 | official_platform | One host's limits |
| 2 | Vercel, Do Vercel Functions support WebSocket connections?, vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections | updated 2026-10-01 | official_platform | WebSockets on Vercel are in public beta |
| 3 | Vercel, Connection pooling with functions, vercel.com/kb/guide/connection-pooling-with-functions | updated 2026-07-23 | official_platform | One host |
| 4 | Vercel, CDN cache, vercel.com/docs/caching/cdn-cache | updated 2026-09-14 | official_platform | One host |
| 5 | Vercel, Global network and regions, vercel.com/docs/regions | updated 2026-08-11 | official_platform | Lists bom1, Mumbai |
| 6 | Supabase, Connecting to Postgres, supabase.com/docs/guides/database/connecting-to-postgres | read 2026-10-12 | official_platform | No page date |
| 7 | Supabase, Compute and disk, supabase.com/docs/guides/platform/compute-and-disk | read 2026-10-12 | official_platform | Connection figures for the smallest sizes |
| 8 | Supabase, Read replicas, supabase.com/docs/guides/platform/read-replicas | read 2026-10-12 | official_platform | One provider's scaling advice |
| 9 | Supabase, Database backups, supabase.com/docs/guides/platform/backups | read 2026-10-12 | official_platform | One provider |
| 10 | Supabase, Standard uploads, supabase.com/docs/guides/storage/uploads/standard-uploads | read 2026-10-12 | official_platform | One provider |
| 11 | Supabase, Available regions, supabase.com/docs/guides/platform/regions | read 2026-10-12 | official_platform | Lists ap-south-1, Mumbai |
| 12 | Heroku Dev Center, Worker dynos, background jobs and queueing, devcenter.heroku.com/articles/background-jobs-queueing | updated 2026-01-28 | evidence_backed_practice | Vendor guidance: 500 ms ideal, investigate at one second |
| 13 | Heroku Dev Center, Dynos and the dyno manager, devcenter.heroku.com/articles/dynos | updated 2026-08-21 | official_platform | Describes Heroku's disk |
| 14 | Render, Scaling, render.com/docs/scaling | read 2026-10-12 | official_platform | No page date |
| 15 | AWS, Download and upload objects with presigned URLs, docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html | read 2026-10-12 | official_platform | One storage provider |
| 16 | Stripe, Idempotent requests, docs.stripe.com/api/idempotent_requests | read 2026-10-12 | official_platform | One gateway |
| 17 | Razorpay, Webhook best practices, razorpay.com/docs/webhooks/best-practices | read 2026-10-12 | official_platform | One gateway; 5-second reply window |
| 18 | NIST SP 800-63B-4, section 3.2.2, pages.nist.gov/800-63-4/sp800-63b.html | 2025 | evidence_backed_practice | Binding only on US federal systems; at most 100 consecutive failures |
| 19 | OWASP, Authentication cheat sheet, cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html | read 2026-10-12 | evidence_backed_practice | Guidance |
| 20 | OWASP API Security Top 10, API4:2023, api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption | 2023 | evidence_backed_practice | Guidance |
| 21 | OWASP Top 10 for LLM applications, LLM10:2025, genai.owasp.org/llmrisk/llm102025-unbounded-consumption | 2025 | evidence_backed_practice | Guidance |
| 22 | Twilio, SMS Fraud Guard, twilio.com/docs/verify/preventing-toll-fraud/sms-fraud-guard | updated 2026-10-08 | official_platform | One SMS provider |
| 23 | MSG91, DLT FAQs, msg91.com/help/dlt-registration-in-india/dlt-faqs | read 2026-10-12 | official_platform | Provider documentation; TRAI's own text was not read |
| 24 | Digital Personal Data Protection Act, 2023, section 16, gazette text hosted by PRS Legislative Research, prsindia.org/files/bills_acts/bills_parliament/2023/Digital_Personal_Data_Protection_Act,_2023.pdf | 2023-08-11 | binding_or_normative | Stricter sector laws still apply under section 16(2) |
| 25 | Press Information Bureau, Government notifies DPDP Rules, pib.gov.in PRID 2190014 | 2025-11-14 | binding_or_normative | Press release; the operative date of the transfer rule was not confirmed |
| 26 | Reserve Bank of India, Storage of payment system data, RBI/2017-18/153, rbi.org.in/Scripts/NotificationUser.aspx?Id=11244 | 2018-04-06 | binding_or_normative | Binds payment system operators |
| 27 | Nielsen Norman Group, Response times: the 3 important limits, nngroup.com/articles/response-times-3-important-limits | 1993, updated 2014 | evidence_backed_practice | 0.1, 1 and 10 second limits for attention |
| 28 | Figma, How Figma's databases team lived to tell the scale, figma.com/blog/how-figmas-databases-team-lived-to-tell-the-scale | 2024-03-14 | evidence_backed_practice | One company's scale |
| 29 | Notion, Herding elephants: lessons learned from sharding Postgres at Notion, notion.com/blog/sharding-postgres-at-notion | 2021-10-06 | evidence_backed_practice | One company's scale |
| 30 | Stack Overflow Developer Survey 2025, Technology, survey.stackoverflow.co/2025/technology | 2025 | evidence_backed_practice | Usage data that ranks options only; the 2026 survey also puts PostgreSQL first |
| 31 | Cassano et al., Knowledge transfer from high-resource to low-resource programming languages for Code LLMs, arxiv.org/abs/2308.09895 | revised 2024-09-22 | evidence_backed_practice | Measures languages, not frameworks |
| 32 | React Native, Get started, reactnative.dev/docs/environment-setup | updated 2026-08-12 | official_platform | Recommends a framework such as Expo |
| 33 | Expo, EAS Update introduction, docs.expo.dev/eas-update/introduction | read 2026-10-12 | official_platform | Native changes still need a store build |
| 34 | Supabase, Realtime, supabase.com/docs/guides/realtime | read 2026-10-12 | official_platform | One provider |
| 35 | Supabase, Auth, supabase.com/docs/guides/auth | read 2026-10-12 | official_platform | Phone sign-in goes through a separate SMS provider |
