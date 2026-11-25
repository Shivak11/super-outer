/**
 * Text the host adds to a submitted prompt, and the words a person typed.
 *
 * Claude Code and the Claude desktop app put their own text into the prompt
 * field: reminders, a notice that a background task ended, CI events, the
 * record of a slash command and the output of a local command. Each arrives
 * inside a named block. A finished background task arrives as a prompt made of
 * nothing else. None of it was typed, so none of it may decide how a request is
 * routed. On 2026-09-20 "yes, start the offline build" was routed CRITICAL with
 * the payments checklist, on words inside a reminder the app had written.
 *
 * Evidence for each name. A read of all 6,031 prompts queued on one machine up
 * to 2026-09-20 found these opening a prompt: `task-notification` (1,259),
 * `ci-monitor-event` (157), `system-reminder` (15), `agent-message` (7, from
 * teammate agents), `cross-session-message` (4, from other Claude sessions) and
 * `artifact-view-context` (1). A message from another agent or session was not
 * typed by the user either, and a peer must not be able to raise the route.
 * The report that led to this file also named the slash-command and
 * local-command blocks. None was found in a queued prompt, so they are listed
 * on request. `local-command-stderr` has the same producer as
 * `local-command-stdout`, and `untrusted-project-content` was seen only at the
 * start of message text in saved desktop transcripts.
 *
 * `bash-input`, `bash-stdout` and `bash-stderr` are what Claude Code sends when
 * a person runs a shell command with `!`: the command, then what it printed.
 * The command was typed, but it has already run and asks nothing of the
 * assistant, and the output is tool output. On 2026-10-15 the echo of
 * `claude auth login` was routed CRITICAL with the authentication checklist,
 * and the next login was folded into that task. A read of the 11,122 prompts
 * queued on one machine up to 2026-10-16 found 16 distinct prompts with these
 * blocks, always all three. 15 held nothing else. The one with typed words had
 * them before the blocks, and those words are kept.
 *
 * `command-args` is different: it holds the words a person typed after a slash
 * command, as in `<command-args>lets redesign this</command-args>`. Its tags are
 * removed and its words are kept, so that request still gets a route.
 *
 * This is for routing only. Approval reads the untouched prompt, because a
 * block can be written so that the text left after removal is a bare approval
 * phrase. See the hook.
 */
export const HOST_BLOCK_TAGS = Object.freeze([
  "system-reminder",
  "task-notification",
  "ci-monitor-event",
  "local-command-caveat",
  "command-name",
  "command-message",
  "local-command-stdout",
  "local-command-stderr",
  "artifact-view-context",
  "untrusted-project-content",
  "cross-session-message",
  "agent-message",
  "side-sessions-event",
  "bash-input",
  "bash-stdout",
  "bash-stderr"
]);

// Wrappers whose contents a person typed: the tags go and the words stay.
export const TYPED_WRAPPER_TAGS = Object.freeze(["command-args"]);

// An opening or closing tag of a listed name. An attribute value in quotes may
// hold angle brackets: a message from another session carries that session's
// title, and titles here name tags. If the attributes do not parse, anything up
// to the next angle bracket is accepted instead. Every part has a length limit,
// so a tag that never closes cannot make the search read a long prompt once for
// every tag in it.
const ATTRIBUTES = `(?:(?:\\s+[\\w:.-]{1,200}(?:\\s*=\\s*(?:"[^"]{0,2000}"|'[^']{0,2000}'|[^\\s"'<>]{1,2000}))?){0,40}\\s{0,200}|\\s[^<>]{0,4000})`;
const TAG = new RegExp(`<(/?)(${[...HOST_BLOCK_TAGS, ...TYPED_WRAPPER_TAGS].join("|")})${ATTRIBUTES}>`, "g");

// True when only spaces and tabs lie between the tag and the start of its line,
// the end of the last removed block, or the start of the prompt. Reading
// backwards stops at the first other character, so the cost stays proportional
// to the prompt however many tags it holds.
const startsLine = (text, from, index) => {
  for (let position = index - 1; position >= from; position -= 1) {
    const character = text[position];
    if (character === "\n") return true;
    if (character !== " " && character !== "\t" && character !== "\r") return false;
  }
  return true;
};

/**
 * The stretches of text to remove: each complete block, or only the two tags of
 * a wrapper whose words are kept.
 *
 * Tags of one name are paired the way brackets are, so a block that quotes a
 * whole block of its own name is removed as one piece. A block can also quote
 * its opening tag alone, as in a task titled "strip <system-reminder> blocks".
 * Pairing then gives the quoted tag the closing tag and leaves the real opening
 * tag without one. Such a tag is still taken as the start of a block, ending at
 * the next closing tag, when it starts a line, because that is where the host
 * puts its blocks. In the middle of a line a tag without a partner is left as
 * text: a person may be writing about it.
 *
 * Known limits, none of them seen in 6,031 saved prompts. A block that quotes
 * its closing tag alone leaves its tail behind. A person who types a complete
 * listed block loses the words inside it. A person who starts a line with a
 * lone opening tag loses the words up to the end of a later block of that name.
 * Each of these lowers a route or leaves it alone; when no route arrives for a
 * typed request the skill tells the assistant to run the router itself.
 */
const blockSpans = (text) => {
  const tags = [...text.matchAll(TAG)].map((match) => ({
    name: match[2],
    closing: match[1] === "/",
    start: match.index,
    end: match.index + match[0].length
  }));
  const partner = new Map();
  const open = new Map();
  for (const [index, tag] of tags.entries()) {
    const stack = open.get(tag.name) ?? open.set(tag.name, []).get(tag.name);
    if (!tag.closing) stack.push(index);
    else if (stack.length) partner.set(stack.pop(), index);
  }
  const nextClosing = new Array(tags.length).fill(-1);
  const upcoming = new Map();
  for (let index = tags.length - 1; index >= 0; index -= 1) {
    nextClosing[index] = upcoming.get(tags[index].name) ?? -1;
    if (tags[index].closing) upcoming.set(tags[index].name, index);
  }

  const spans = [];
  const wrapperEnds = new Set();
  let cursor = 0;
  for (let index = 0; index < tags.length; index += 1) {
    const tag = tags[index];
    if (tag.start < cursor) continue;
    if (tag.closing) {
      if (wrapperEnds.has(index)) { spans.push([tag.start, tag.end]); cursor = tag.end; }
      continue;
    }
    const close = partner.get(index) ?? (startsLine(text, cursor, tag.start) ? nextClosing[index] : -1);
    if (close < 0) continue;
    if (TYPED_WRAPPER_TAGS.includes(tag.name)) {
      spans.push([tag.start, tag.end]);
      cursor = tag.end;
      wrapperEnds.add(close);
      continue;
    }
    spans.push([tag.start, tags[close].end]);
    cursor = tags[close].end;
  }
  return spans;
};

/**
 * The prompt with every host block removed. Returns an empty string when only
 * white space and stray listed tags are left. Anything else a person typed is
 * returned, so "?" keeps whatever route it had before.
 */
export const typedText = (value) => {
  if (typeof value !== "string") return "";
  const kept = [];
  let cursor = 0;
  for (const [start, end] of blockSpans(value)) {
    kept.push(value.slice(cursor, start));
    cursor = end;
  }
  kept.push(value.slice(cursor));
  const text = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return text.replace(TAG, "").trim() ? text : "";
};
