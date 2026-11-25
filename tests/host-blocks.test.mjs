import assert from "node:assert/strict";
import test from "node:test";

import { HOST_BLOCK_TAGS, TYPED_WRAPPER_TAGS, typedText } from "../src/host-blocks.mjs";

// The reminder the Claude desktop app put in front of "yes, start the offline
// build" on 2026-09-20. It is copied from that prompt, not written for the test.
const REMINDER = [
  "<system-reminder>",
  "The user started your suggested background task task_c2c2c753 (\"Fix 'plan' false match in Super-outer payments library\") in a separate local session. It is running independently. You will be notified here when it ends.",
  "</system-reminder>"
].join("\n");

// The whole prompt the hook received when a background test run finished on the
// same day. Nobody typed anything. Only the output path is shortened.
const TASK_NOTIFICATION = [
  "<task-notification>",
  "<task-id>bud588pbq</task-id>",
  "<tool-use-id>toolu_019syYFSyW5n26sC6Vs7Q4vo</tool-use-id>",
  "<output-file>/private/tmp/claude-501/project/tasks/bud588pbq.output</output-file>",
  "<status>completed</status>",
  "<summary>Background command \"Run the full test suite on the untouched 5.6.0 source as a baseline\" completed (exit code 0)</summary>",
  "</task-notification>"
].join("\n");

const RISKY = "Charge the customer's card again, migrate the payments table in production and send a reminder email";

test("the reported prompt is reduced to the words that were typed", () => {
  assert.equal(typedText(`${REMINDER}\n\nyes, start the offline build`), "yes, start the offline build");
});

test("a prompt made only of app-added blocks leaves nothing", () => {
  assert.equal(typedText(TASK_NOTIFICATION), "");
  assert.equal(typedText(`${REMINDER}\n\n${TASK_NOTIFICATION}\n`), "");
});

test("every block the report asked for is handled", () => {
  for (const tag of [
    "system-reminder", "task-notification", "ci-monitor-event", "local-command-caveat",
    "command-name", "command-message", "local-command-stdout"
  ]) {
    assert.ok(HOST_BLOCK_TAGS.includes(tag), `${tag} is not removed`);
  }
  // The report listed command-args too. Its contents are typed, so only its
  // tags are removed.
  assert.deepEqual([...TYPED_WRAPPER_TAGS], ["command-args"]);
  assert.equal(HOST_BLOCK_TAGS.includes("command-args"), false);
});

test("the words typed after a slash command are kept, and its record is removed", () => {
  // The shape saved in a transcript when "/shva:shape-task lets redesign this" was typed.
  const record = "<command-message>shva:shape-task</command-message>\n<command-name>/shva:shape-task</command-name>\n<command-args>lets redesign this</command-args>";
  assert.equal(typedText(record), "lets redesign this");
  assert.equal(typedText(`${REMINDER}\n${record}`), "lets redesign this");
  const empty = "<command-message>cost</command-message>\n<command-name>/cost</command-name>\n<command-args></command-args>";
  assert.equal(typedText(empty), "");
  const output = `${empty}\n<local-command-stdout>${RISKY}</local-command-stdout>`;
  assert.equal(typedText(output), "");
  // A listed block inside the typed words is still removed.
  assert.equal(typedText(`<command-args>fix the header ${REMINDER} spacing</command-args>`), "fix the header \n spacing");
});

test("a message from a teammate agent is not the user's request", () => {
  // The opening tag is copied from a real queued prompt; the body is shortened.
  const teammate = `<agent-message from="impl-news">\nOwnership conflict on the payments telemetry task. I need a ruling before I can migrate the table.\n</agent-message>`;
  assert.equal(typedText(teammate), "");
  assert.equal(typedText(`${teammate}\n\nrename the helper`), "rename the helper");
});

// What Claude Code sent the hook on 15 October 2026 after Shiva ran
// `!claude auth login`: the command he ran and what it printed. It was routed
// CRITICAL with the authentication checklist. Copied from the queued prompt;
// only the one-time sign-in values are replaced. The output arrives with its
// angle brackets and ampersands escaped, and the command arrives as typed.
const LOGIN_ECHO = "<bash-input>claude auth login</bash-input><bash-stdout>Opening browser to sign in…\nIf the browser didn't open, visit: https://claude.com/cai/oauth/authorize?code=true&amp;client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e&amp;response_type=code&amp;redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback&amp;scope=org%3Acreate_api_key+user%3Aprofile+user%3Ainference+user%3Asessions%3Aclaude_code+user%3Amcp_servers+user%3Afile_upload+user%3Aplugins&amp;code_challenge=CHALLENGE&amp;code_challenge_method=S256&amp;state=STATE\nPaste code here if prompted &gt; Login successful.</bash-stdout><bash-stderr></bash-stderr>";

test("a shell command the person ran, and what it printed, are not a request", () => {
  assert.equal(typedText(LOGIN_ECHO), "");
  // The command keeps its own angle brackets and ampersands.
  assert.equal(typedText("<bash-input>security find-generic-password -s \"Claude Code-credentials\" >/dev/null 2>&1 && echo present || echo missing</bash-input><bash-stdout>present</bash-stdout><bash-stderr></bash-stderr>"), "");
  // The only one of 16 distinct queued echoes with typed words beside it, copied whole.
  assert.equal(
    typedText("i have set it...how to test\n\n<bash-input>read -rs \"ANTHROPIC_API_KEY?Paste key: \" && export ANTHROPIC_API_KEY && claude</bash-input><bash-stdout>Paste key:</bash-stdout><bash-stderr></bash-stderr>"),
    "i have set it...how to test",
  );
  assert.equal(typedText(`${LOGIN_ECHO}\nrename the helper`), "rename the helper");
});

test("every listed block is removed wherever it sits, and the typed words survive", () => {
  for (const tag of HOST_BLOCK_TAGS) {
    const block = `<${tag}>\n${RISKY}\n</${tag}>`;
    assert.equal(typedText(`${block}\n\nfix a typo in the readme`), "fix a typo in the readme", `${tag} before`);
    assert.equal(typedText(`fix a typo in the readme\n\n${block}`), "fix a typo in the readme", `${tag} after`);
    assert.equal(typedText(`fix a typo\n${block}\nin the readme`), "fix a typo\n\nin the readme", `${tag} between`);
    assert.equal(typedText(block), "", `${tag} alone`);
  }
});

test("a message from another session is not the user's request", () => {
  // The opening tag is copied from the queue record of a message this session
  // received; the body is shortened.
  const peer = `<cross-session-message from="uds:/tmp/cc-socks/32407.sock" from-session="local_3e50a515-dd10-4505-9360-4f5528894b6e" from-name="Fix 'plan' false match in Super-outer payments library" from-mode="prompting">\nVersion numbers already taken: 5.6.1 changes the payments match words. Please leave the changelog, the version stamps and the digest until you have rebased. No reply is needed.\n</cross-session-message>`;
  assert.equal(typedText(peer), "");
  assert.equal(typedText(`${peer}\n\nrename the helper`), "rename the helper");
});

test("a block whose opening tag carries attributes is still removed", () => {
  assert.equal(
    typedText(`<ci-monitor-event pr="18" run="9912">\n${RISKY}\n</ci-monitor-event>\nrename the helper`),
    "rename the helper"
  );
  assert.equal(
    typedText(`<untrusted-project-content path="/repo/CLAUDE.md">${RISKY}</untrusted-project-content>rename the helper`),
    "rename the helper"
  );
});

test("a block that quotes a whole block of its own name leaves no fragment behind", () => {
  const nested = `<system-reminder>outer ${RISKY} <system-reminder>inner ${RISKY}</system-reminder> tail ${RISKY}</system-reminder>`;
  assert.equal(typedText(`${nested}\nrename the helper`), "rename the helper");
  assert.equal(typedText(`rename the helper\n${nested}`), "rename the helper");
});

test("a block that quotes its own opening tag alone is still removed whole", () => {
  // A suggested task titled after this very fault produces exactly this.
  const reminder = `<system-reminder>\nThe user started your suggested background task ("Stop <system-reminder> text deciding the payments route") in a separate local session.\n</system-reminder>`;
  assert.equal(typedText(`${reminder}\n\nyes, go ahead`), "yes, go ahead");
  const notice = `<task-notification>\n<summary>Background command "count <task-notification> blocks in the payments logs" completed</summary>\n</task-notification>`;
  assert.equal(typedText(notice), "");
  assert.equal(typedText(`${REMINDER}\n${notice}\n\nyes, go ahead`), "yes, go ahead");
});

test("typed words that mention an opening tag survive a block added after them", () => {
  const typed = "strip <system-reminder> blocks before routing";
  assert.equal(typedText(`${typed}\n\n${REMINDER}`), typed);
});

test("a block added after typed words is removed whole even when it quotes its own opening tag", () => {
  const reminder = `<system-reminder>\nThe user started your suggested background task ("Stop <system-reminder> text deciding the payments route") in a separate local session.\n</system-reminder>`;
  assert.equal(typedText(`yes, go ahead\n\n${reminder}`), "yes, go ahead");
  assert.equal(typedText(`yes, go ahead\n\n${REMINDER}\n${reminder}\n`), "yes, go ahead");
});

test("an opening tag whose attributes hold quotes and angle brackets is still recognised", () => {
  // A message from another session carries that session's title as an attribute.
  const titled = `<cross-session-message from="uds:/tmp/cc-socks/1.sock" from-name="Stop <system-reminder> text deciding the payments route" from-mode="prompting">\n${RISKY}\n</cross-session-message>`;
  assert.equal(typedText(titled), "");
  assert.equal(typedText(`${titled}\n\nrename the helper`), "rename the helper");
  const apostrophes = `<cross-session-message from-name="Fix 'plan' false match" from-mode='prompting'>${RISKY}</cross-session-message>`;
  assert.equal(typedText(apostrophes), "");
  // Attributes that do not parse fall back to "anything up to the next bracket".
  const loose = `<agent-message from="impl "news"" urgent>${RISKY}</agent-message>rename the helper`;
  assert.equal(typedText(loose), "rename the helper");
});

test("typed text that only mentions a tag is kept", () => {
  const typed = "strip <system-reminder> blocks from the prompt before routing";
  assert.equal(typedText(typed), typed);
  const closing = "the hook leaves a stray </task-notification> in the prompt";
  assert.equal(typedText(closing), closing);
});

test("tags the app does not add are kept, because a person may have typed them", () => {
  const typed = "<context>We charge cards through Razorpay.</context>\nAdd refunds.";
  assert.equal(typedText(typed), typed);
  // A longer name that merely starts like a listed one is a different tag.
  const lookalike = "<command-name-list>deploy</command-name-list>";
  assert.equal(typedText(lookalike), lookalike);
});

test("white space and stray listed tags are not a request, and anything else typed is", () => {
  assert.equal(typedText(`${REMINDER}\n\n \t\n${TASK_NOTIFICATION}\n`), "");
  // A closing tag left over from a block that quoted one is not a request.
  assert.equal(typedText("<task-notification>the log ends with </task-notification></task-notification>"), "");
  assert.equal(typedText("</task-notification>\n</system-reminder>"), "");
  // A person does send these, and they keep whatever route they had before.
  for (const typed of ["?", "??", "...", "\u{1F44D}", "हाँ", "2"]) {
    assert.equal(typedText(typed), typed);
    assert.equal(typedText(`${REMINDER}\n\n${typed}`), typed);
  }
});

test("anything that is not text leaves nothing", () => {
  for (const value of [undefined, null, 0, {}, []]) assert.equal(typedText(value), "");
  assert.equal(typedText("   \n\t  "), "");
});

test("Windows line endings inside a block do not stop it being removed", () => {
  assert.equal(typedText(`<system-reminder>\r\n${RISKY}\r\n</system-reminder>\r\n\r\nrename the helper`), "rename the helper");
});

test("a very large block is removed without stalling the hook", { timeout: 10_000 }, () => {
  const large = `<local-command-stdout>${`${RISKY}\n`.repeat(20_000)}</local-command-stdout>`;
  assert.ok(large.length > 2_000_000);
  assert.equal(typedText(`${large}\nrename the helper`), "rename the helper");
  // Opening tags that never close, or that all wait on one closing tag at the
  // very end, are the slow cases for a careless search.
  const unclosed = "<system-reminder> ".repeat(50_000);
  assert.equal(typedText(`${unclosed}rename the helper`), `${unclosed}rename the helper`);
  assert.equal(typedText(`${unclosed}</system-reminder>\nrename the helper`), "rename the helper");
  const noBracket = "<system-reminder ".repeat(50_000);
  assert.equal(typedText(`${noBracket}rename the helper`), `${noBracket}rename the helper`);
});

test("hostile prompts are handled in well under the five seconds the host allows", { timeout: 20_000 }, () => {
  const block = "<system-reminder>x</system-reminder>";
  const hostile = [
    // A review measured 19 seconds on this one before the scan read backwards.
    `${block}${" ".repeat(1_000_000)}${"<system-reminder> ".repeat(50_000)}rename the helper`,
    `${block}${"\n".repeat(500_000)}${"<system-reminder>\n".repeat(50_000)}rename the helper`,
    `${"<system-reminder a=\"x ".repeat(60_000)}rename the helper`,
    `${"<agent-message from='".repeat(60_000)}rename the helper`,
    `<system-reminder ${"a=b ".repeat(300_000)}rename the helper`,
    `${"</task-notification>".repeat(80_000)}rename the helper`,
    `${"<command-args>".repeat(40_000)}rename the helper${"</command-args>".repeat(40_000)}`
  ];
  for (const [index, prompt] of hostile.entries()) {
    const started = process.hrtime.bigint();
    const typed = typedText(prompt);
    const milliseconds = Number(process.hrtime.bigint() - started) / 1e6;
    assert.ok(typed.includes("rename the helper"), `input ${index} lost the typed words`);
    assert.ok(milliseconds < 1500, `input ${index} took ${Math.round(milliseconds)} ms`);
  }
});
