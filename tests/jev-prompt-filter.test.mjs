// Ported from Super-outer Experimental's tests/route-check.test.mjs (every looksSecret test).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { looksSecret } from "../src/jev/prompt-filter.mjs";

// Super-outer's package build refuses a file that holds a literal GitHub
// token, Stripe live key, AWS key id, Slack token or private key header, and
// GitHub scans pushes for the same shapes. So every string below that looks
// like a real key is put together from parts when the test runs.
const joined = (...parts) => parts.join("");
const AWS_SESSION_PREFIX = joined("AS", "IA");
const OPENROUTER_64 = joined("sk-or-v1-", "0123456789abcdef".repeat(4));
const OPENROUTER_32 = joined("sk-or-v1-", "0123456789abcdef".repeat(2));

const secretExamples = [
  ["a private key header", joined("here it is -----BEGIN RSA ", "PRIVATE KEY----- MIIEow")],
  ["a key with the sk- prefix", joined("use sk-ant-", "api03-EXAMPLEEXAMPLEEXAMPLEEXAMPLE for the call")],
  ["a GitHub token", joined("token gh", "p_", "EXAMPLEEXAMPLEEXAMPLEEXAMPLE012345")],
  ["a fine-grained GitHub token", joined("github", "_pat_", "EXAMPLE0123456789EXAMPLE0123456789")],
  ["a Slack token", joined("xo", "xb-", "0000000000-EXAMPLEEXAMPLE")],
  ["an AWS access key id", joined("AK", "IA", "IOSFODNN7EXAMPLE is the id")],
  ["a Google API key", joined("AI", "za", "EXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPLE")],
  ["a JSON web token", joined("eyJhbGciOiJIUzI1NiJ9", ".eyJzdWIiOiJleGFtcGxlIn0", ".c2lnbmF0dXJlZXhhbXBsZQ")],
  ["a bearer header", joined("Authorization: Bearer ", "EXAMPLEEXAMPLEEXAMPLE0123456789")],
  ["a password assignment", "password = hunter2hunter2"],
  ["an api key assignment", "API_KEY: EXAMPLE-VALUE-0001"],
];
for (const [name, text] of secretExamples) {
  test(`a prompt holding ${name} is treated as secret`, () => {
    assert.equal(looksSecret(text), true);
  });
}

test("a request that talks about keys without holding one is not treated as secret", () => {
  assert.equal(looksSecret("rotate the token for the staging server and update the policy page"), false);
  assert.equal(looksSecret("lets implement this in the experimental version. lets plan first if needed"), false);
});

// The written forms of a key, a token or a password that the route check's
// first filter missed, from the judge's review of 20 September 2026.
const missedSecrets = [
  ["the TypeSafe key's own variable name", joined("put TYPESAFE_API_KEY=ts", "k_live_", "abcdef0123456789 into jev.env and run the probe")],
  ["the OpenRouter key's own variable name", joined("put OPENROUTER_API_KEY=", OPENROUTER_32, " into jev.env")],
  ["an OpenRouter key on its own", joined("here is the key ", OPENROUTER_64)],
  ["an OpenRouter key inside a URL path", joined("open https://openrouter.ai/api/v1/keys/", OPENROUTER_64, " and revoke it")],
  ["an OpenRouter key after a slash", joined("the row is openrouter/", OPENROUTER_64, " in the ledger")],
  ["an OpenRouter key in a file name", joined("delete ~/Downloads/", OPENROUTER_64, ".txt")],
  ["an OpenRouter key broken across two lines", joined("the key is sk-\nor-v1-", "0123456789abcdef".repeat(4), ", please rotate it")],
  ["an OpenRouter key typed in spaced groups", joined("please rotate sk-or-v1- ", "01234567 89abcdef ".repeat(4).trimEnd())],
  ["a Stripe key inside a URL fragment", joined("see https://dashboard.example.com/keys#sk", "_live_", "4eC39HqLyjWDarjtT1zdp7dc for the one to revoke")],
  ["a prefixed password variable", "DB_PASSWORD=hunter2hunter2 is what staging uses"],
  ["a prefixed secret variable", "STRIPE_SECRET_KEY=abcdef0123456789abcdef in the env file"],
  ["a client secret with a colon", "client_secret: abcdef0123456789abcdef"],
  ["a password inside JSON", 'the login body is {"password": "hunter2hunter2"}'],
  ["a token query parameter", "call /export?token=abcdef0123456789 to fetch it"],
  ["a Stripe live key", joined("stripe key sk", "_live_", "51Habcdefghijklmnop0123456789")],
  ["a Stripe restricted key", joined("rk", "_live_", "51Habcdefghijklmnop0123456789")],
  ["a webhook signing secret", joined("wh", "sec_", "abcdefghijklmnop0123456789abcdef")],
  ["a Razorpay live key", joined("rzp", "_live_", "abcdefghij0123")],
  ["a Supabase secret key", joined("sb_", "secret_", "abcdefghijklmnop0123456789")],
  ["a GitLab token", joined("gl", "pat-", "abcdefghij0123456789")],
  ["an npm token", joined("npm", "_", "abcdefghijklmnopqrstuvwxyz0123456789")],
  ["a Hugging Face token", joined("hf", "_", "abcdefghijklmnopqrstuvwxyz012345")],
  ["a Google OAuth access token", joined("ya29", ".", "a0AfH6SMBabcdefghijklmnop0123456789")],
  ["a temporary AWS key id", joined(AWS_SESSION_PREFIX, "IOSFODNN7EXAMPLE is the session key")],
  ["a database URL with a password", "postgres://admin:S3cretPassw0rd@db.internal:5432/app"],
  ["an https URL with a password", "https://deploy:S3cretPassw0rd@git.internal/repo.git"],
  ["a Slack webhook URL", joined("https://hooks.slack.com/", "services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX")],
  ["a basic authorization header", "Authorization: Basic dXNlcjpwYXNzd29yZGV4YW1wbGU="],
  ["a long random string with no known prefix", "the value is aZ3kQ9mT7xR2vB8nL5pW1cY6dF4hJ0sG"],
  ["a 40 character hex digest", "use 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b as the secret"],
  ["a UUID used as a key", "the key is 123e4567-e89b-12d3-a456-426614174000"],
  ["a password stated in a sentence", "the admin password is hunter2hunter2, use it for the migration"],
  ["a Slack app token", joined("xa", "pp-", "1-A0000000000-0000000000000-EXAMPLEEXAMPLE")],
  ["a PGP private key block", joined("-----BEGIN PGP ", "PRIVATE KEY BLOCK-----")],
];
for (const [name, text] of missedSecrets) {
  test(`a prompt holding ${name}, a form the first filter missed, is treated as secret`, () => {
    assert.equal(looksSecret(text), true, text);
  });
}

const ordinaryPrompts = [
  "write the risk-based-assessment-checklist section and the task-management-overview page",
  `Add the ${AWS_SESSION_PREFIX} region to the pricing dropdown and the settings page`,
  `translate the EMEA and ${AWS_SESSION_PREFIX} landing pages into Hindi`,
  "A KIA dealership website needs a booking form for test drives",
  "wire the AI zap to the dashboard and the settings page",
  "Sort the tsk_ prefixed tasks in the list view by due date",
  "lets implement this in the experimental version of super-router that you created. lets plan first if needed",
  "open /Users/someone/Python Projects/Super-outer-Experimental-worktrees/jev-route-check/docs/plans/2026-09-20-jev-route-check.md",
  "rename super-outer-experimental-worktrees-jev-route-check-plan to something shorter",
  "commit 9605f11 added the amendments, and the ledger id is 20260920T101502Z-3fa9",
  "set question_budget: 12 only when a library matched",
  "the function getUserAuthenticationProviderConfiguration is too long",
  "the token is expired after an hour, so refresh it",
];
for (const text of ordinaryPrompts) {
  test(`an ordinary prompt is not treated as secret: ${text.slice(0, 48)}`, () => {
    assert.equal(looksSecret(text), false, text);
  });
}

test("a very long run of key-like text is checked in well under a second", () => {
  const hostile = "eyJabcdefghij-".repeat(3500);
  const started = Date.now();
  looksSecret(hostile);
  assert.ok(Date.now() - started < 500, `took ${Date.now() - started} ms`);
});

// 5.8.0 withholds more than the route check did, so the comparison only
// requires that nothing the route check withheld is sent, and that ordinary
// requests with no credential word get the same answer from both.
test("the ported filter withholds everything the route check's own filter withheld, when that filter is on this machine", async (t) => {
  const source = path.join(
    os.homedir(),
    "Python Projects",
    "Super-outer-Experimental",
    "super-outer-experimental",
    "skills",
    "jev-route-check",
    "scripts",
    "route-check.mjs",
  );
  if (!fs.existsSync(source)) return t.skip(`Super-outer Experimental's route-check.mjs is not at ${source}, so only the copied examples above are checked`);
  const { looksSecret: original } = await import(pathToFileURL(source).href);
  const examples = [
    ...secretExamples.map(([, text]) => text),
    ...missedSecrets.map(([, text]) => text),
    ...ordinaryPrompts,
    "design the empty state screen for first-time users",
    "Build a new settings screen and add a toggle for weekly summaries",
  ];
  for (const text of examples) {
    if (original(text)) assert.equal(looksSecret(text), true, text);
  }
  for (const text of ordinaryPrompts) assert.equal(looksSecret(text), original(text), text);
});

// Added in 5.8.0 after the failure scout found plainly worded credentials that
// the ported checks let through. Key-shaped strings are assembled at run time.
const plainCredentials = [
  ["words between the noun and the verb", "build a login page; the password for the staging db is hunter2"],
  ["a long passphrase with no digit", "add a settings screen, my admin password is correcthorsebatterystaple"],
  ["pw shorthand", "set up the dashboard, login demo pw hunter22"],
  ["pass= shorthand", "fix the deploy screen, pass=Hunter2024"],
  ["creds phrasing", "creds for the admin panel are admin / Summer2024!"],
  ["a one-time code", "the verification code is 482913, add a sign in page"],
  ["a TOTP seed", joined("add 2fa screen, the totp seed is ", "JBSWY3DPEHPK3PXP")],
  ["an invisible character inside a key prefix", joined("build the billing page with key s​", "k-or-v1-", "a8f3c9d2e1b0a7f6c5d4e3b2a1908f7e")],
  ["a key split after its prefix", joined("add a page, use ", "sk-or-v1- ", "a8f3c9d2e1b0a7f6c5d4e3b2a1908f7e")],
  ["a card number", "add a checkout page, test with my card 4539 1488 0343 6467 exp 09/28 cvv 123"],
  ["an ssh password in prose", "build a server status page, ssh root@10.0.0.4 with password Tr0ub4dor"],
  ["a database password in prose", "add a reports screen; db is postgres at 10.0.0.5 user admin password S3cretPass"],
  ["a secret holding slashes", joined("add an upload screen, aws secret ", "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY")],
];
for (const [name, text] of plainCredentials) {
  test(`a prompt holding ${name} is treated as secret`, () => {
    assert.equal(looksSecret(text), true, text);
  });
}
// Added after the second review, which found one-word variants that the rules
// above still sent. Any mention of a password, a passcode, credentials, a
// one-time code, a card number or a key now withholds the request.
const shortCredentials = [
  ["pass and a value", "pass hunter2 for the test account"],
  ["otp and a code", "otp 482913 add a login page"],
  ["a bare PIN", "pin 4821"],
  ["a PIN beside a PIN screen request", "my pin 4821, add a pin screen"],
  ["a passcode and a number", "passcode 9911 for the door screen"],
  ["a password made of letters", "password letmein"],
  ["a login pair made of letters", "login: admin / letmein"],
  ["a username and password made of letters", "username admin password admin"],
  ["a passphrase of plain words", "password is correct horse battery staple"],
  ["an invisible separator inside a key prefix", joined("use the key s\u2062", "k-or-v1-", "a8f3c9d2e1b0a7f6c5d4e3b2a1908f7e")],
];
for (const [name, text] of shortCredentials) {
  test(`a prompt holding ${name} is treated as secret`, () => {
    assert.equal(looksSecret(text), true, text);
  });
}
// These hold no credential, but they mention one, so they are withheld and
// the word lists route them as in 5.7.0. The cost is Jev's opinion on them.
for (const text of [
  "add a login page with password reset",
  "the password must be at least 8 characters",
  "fix the password reset page so the token expires after an hour",
  "rotate the api key for the staging server and update the password policy page",
  "Password reset emails end up in spam",
  // From 5.8.1 pass, PIN, secret and any key are mentions too.
  "pass the user id to the profile page",
  "the tests pass now, add a settings tab",
  "show the pin entry screen with four boxes",
]) {
  test(`a request that mentions a credential is withheld even with no value in it: ${text}`, () => {
    assert.equal(looksSecret(text), true, text);
  });
}
for (const text of [
  "the error code is 404, fix the empty state",
  "add a login page with Google",
  "build a new settings page where people edit their profile",
]) {
  test(`an ordinary prompt about credentials is still sent: ${text}`, () => {
    assert.equal(looksSecret(text), false, text);
  });
}
// A bare bearer token in lower case is caught only by the Bearer rule, so this
// fails if that rule is removed.
test("a bare lower-case bearer token is treated as secret", () => {
  assert.equal(looksSecret(joined("call it with Bearer ", "abcdefghijklmnopqrstuvwxy")), true);
});

// From the independent verifier's review of 5.8.1 at 8d7c5e9. Each input is
// quoted from its report, and each was sent by that head.
const reviewedAt8d7c5e9 = [
  ["an acronym with a plural s", "the OTPs are 482913 and 551230"],
  ["PINs in capitals", "the PINs are 4821 and 9911"],
  ["CVVs in capitals", "the CVVs are 123 and 456"],
  ["PINs joined to the word before", "myPINs are 4821 and 9911"],
  ["an accent typed as part of a letter", "passwörd letmein"],
  ["an accented PIN", "pín 4821 for the staging box"],
  ["a quoted login value", "login admin / 'letmein'"],
  ["a login value starting with a symbol", "login admin / #letmein"],
  ["cred and a value", "cred: Summer2024"],
  ["a code several words after the word code", "the code we texted you is 482913"],
  ["a token value after now", "the token is now hunterhunter"],
  ["a card number with spaced dashes", "4111 - 1111 - 1111 - 1111"],
  ["a card number with en dashes", "4111–1111–1111–1111"],
  ["a card number with minus signs", "4111−1111−1111−1111"],
  ["a name with no separator", "DBPASS=hunter2"],
  ["a key name with no separator", "OPENAIKEY=abcdefgh"],
];
for (const [name, text] of reviewedAt8d7c5e9) {
  test(`a prompt holding ${name} is treated as secret`, () => {
    assert.equal(looksSecret(text), true, text);
  });
}
test("onetime and CRED on their own are ordinary, and a onetime code is withheld", () => {
  assert.equal(looksSecret("add a onetime setup wizard for new users"), false);
  assert.equal(looksSecret("add CRED pay as a payment option at checkout"), false);
  assert.equal(looksSecret("onetime code 482913"), true);
});

// Each of these is caught by one step only, so removing that step fails the
// test. The verifier found seven steps that no test guarded.
const caughtByOneStep = [
  ["splitting camelCase names", "myPin 4821"],
  ["splitting camelCase names before a mention", "the userSecret is set"],
  ["removing combining marks", "passẃord letmein"],
  ["the letters and digits condition of the login rule", "sign in admin Summer2024"],
  ["joining digits split by spaces in the code rule", "the code is 48 21 99"],
  ["a quoted value before the slash in the login rule", "login 'admin' / 'letmein'"],
  ["a colon joining two login values", "login admin:letmein"],
  ["the token and seed rule", "my seed is now apple banana cherry"],
];
for (const [step, text] of caughtByOneStep) {
  test(`${step} withholds: ${text}`, () => {
    assert.equal(looksSecret(text), true, text);
  });
}

test("every request the 5.8.0 filter withholds is withheld", async () => {
  const { looksSecret: released } = await import("../src/jev/prompt-filter-5-8-0.mjs");
  const read = (file) => JSON.parse(fs.readFileSync(new URL(file, import.meta.url), "utf8"));
  const texts = [
    ...read("./fixtures/routing/labelled-sentences.json").sentences.map((item) => item.text),
    ...read("./fixtures/jev/filter-variants-c1.json").cases.map((item) => item.text),
    ...reviewedAt8d7c5e9.map(([, text]) => text),
    "the login for staging is admin Summer2024",
    "the seed for the test wallet is Apple2024",
    "the cred is Zq7Summer24",
  ];
  const weaker = texts.filter((text) => released(text) && !looksSecret(text));
  assert.deepEqual(weaker, []);
});

// The 5.8.0 filter runs on the first 2,000 characters. This form is withheld
// only by it, so shortening that reach fails the test.
test("a form only the 5.8.0 filter catches is withheld 1,600 characters in", () => {
  const filler = "design the empty state screen for first-time users ".repeat(32).slice(0, 1600);
  assert.equal(looksSecret(`${filler} the code we texted you is 482913`), true);
});

// 5.8.2: cred followed by a value is withheld, as token and seed are, while
// the payments app CRED on its own is still sent.
for (const text of ["DB_CRED=Summer2024", "cred: letmein", "my cred is letmein"]) {
  test(`cred followed by a value is treated as secret: ${text}`, () => {
    assert.equal(looksSecret(text), true, text);
  });
}
test("CRED as a product name is still sent", () => {
  assert.equal(looksSecret("add CRED pay as a payment option at checkout"), false);
});
