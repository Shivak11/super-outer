// Ported from Super-outer Experimental's jev-route-check (scripts/route-check.mjs, looksSecret and its helpers). The plain-text rules and the removal of invisible characters were added in 5.8.0.
/**
 * A prompt that looks like it holds a key, a token or a password is never
 * sent. A false alarm costs one unchecked prompt. A miss sends a secret to an
 * outside service and writes its first characters to the record, and neither
 * can be undone, so the check leans towards false alarms.
 *
 * Every pattern here runs in time proportional to the text. The whole-text
 * patterns use bounded repeats, and the rest run on one token at a time.
 */
const WHOLE_TEXT_PATTERNS = [
  /-----BEGIN [A-Z ]{0,40}PRIVATE KEY[A-Z ]{0,20}-----/,
  // "the password is hunter2hunter2": a secret word, a verb, then a value that holds a digit
  /\b(?:password|passcode|passphrase|pwd|secret|token|key)\s{1,4}(?:is|was|are)\s{1,4}["']?(?=[^\s"']{0,60}[0-9])[^\s"',;]{6,}/i,
  // name = value and name: value, for any name that contains one of these words
  /(?:password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|credential)[A-Za-z0-9_-]{0,40}["']?\s{0,4}[:=]\s{0,4}["']?[^\s"',;}]{6,}/i,
  /\bAuthorization\s{0,4}[:=]\s{0,4}["']?(?:Basic|Bearer|Token)\s{1,4}\S{8,}/i,
  /\bBearer\s{1,4}[A-Za-z0-9._~+/-]{20,}/i,
  // scheme://user:password@host
  /\b[a-z][a-z0-9+.-]{1,20}:\/\/[^\s/:@]{1,80}:[^\s/@]{1,80}@/i,
  /hooks\.slack\.com\/services\//i,
  /discord(?:app)?\.com\/api\/webhooks\//i,
];

const PREFIXES =
  "sk-|sk_live_|sk_test_|rk_live_|rk_test_|pk_live_|whsec_|rzp_live_|rzp_test_|sb_secret_|sbp_|glpat-|npm_|hf_|ya29\\.|gh[pousr]_|github_pat_|xox[abprs]-|xapp-|AKIA|ASIA|AIza|SG\\.|shpat_|dop_v1_|tsk_";
const KNOWN_PREFIX = new RegExp(`^(?:${PREFIXES})`);
// The same prefixes anywhere after a character that cannot be part of a key:
// inside a URL path, after a slash, in a file name. Tested on the text as it
// is and with line breaks (and the indentation after them) removed, so a key
// broken across two lines is still seen while the words around it stay apart.
const PREFIX_ANYWHERE = new RegExp(`(?:^|[^A-Za-z0-9])(?:${PREFIXES})[A-Za-z0-9._-]{12,}`);
// The prefixes that are distinctive enough to be matched with every white
// space removed and no boundary at all, so a key typed in spaced groups is
// still seen. Only prefixes that carry punctuation qualify: the bare sk-
// joined to the word before it would read risk-based as a key, and the
// letter-only prefixes AKIA, ASIA and AIza would read "the ASIA landing
// pages" as one.
const DISTINCTIVE_PREFIXES =
  "sk-or-v1-|sk-ant-|sk-proj-|sk_live_|sk_test_|rk_live_|rk_test_|pk_live_|whsec_|rzp_live_|rzp_test_|sb_secret_|glpat-|github_pat_|xox[abprs]-|xapp-|shpat_|dop_v1_";
const DISTINCTIVE_ANYWHERE = new RegExp(`(?:${DISTINCTIVE_PREFIXES})[A-Za-z0-9._-]{12,}`);
const JSON_WEB_TOKEN = /^eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}$/;

function entropy(token) {
  const counts = new Map();
  for (const character of token) counts.set(character, (counts.get(character) ?? 0) + 1);
  let bits = 0;
  for (const count of counts.values()) bits -= (count / token.length) * Math.log2(count / token.length);
  return bits;
}

function tokenLooksSecret(token) {
  if (token.length < 12) return false;
  if (KNOWN_PREFIX.test(token)) return true;
  if (JSON_WEB_TOKEN.test(token)) return true;
  const bare = token.replace(/-/g, "");
  if (bare.length >= 32 && /^[a-f0-9]+$/i.test(bare)) return true;
  return (
    token.length >= 24 &&
    /^[A-Za-z0-9+/=_-]+$/.test(token) &&
    /[a-z]/.test(token) &&
    /[A-Z]/.test(token) &&
    /[0-9]/.test(token) &&
    entropy(token) >= 4
  );
}

/**
 * Added in 5.8.0, after a separate review found that plainly worded
 * credentials passed the ported checks: "the password for the staging db is
 * hunter2", "pw hunter22", "creds are admin / Summer2024!", a one-time code,
 * a card number, and a key with an invisible character inside its prefix.
 * The second review then found one-word variants still sent ("pass hunter2",
 * "otp 482913", "pin 4821") and passwords made only of letters. So a request
 * that mentions a password, a passcode, credentials, a one-time code, a card
 * number or a key is never sent, whatever follows the word; the rules below
 * catch the shorter forms. A false alarm only means that request is routed by
 * the word lists. On the 612 labelled requests the mention rule withholds 4,
 * none of which needs the design path.
 */
const CREDENTIAL_MENTION = /\b(?:passwords?|passwd|passcodes?|passphrases?|pwd|pw|creds|credentials?|otps?|totp|one[- ]time (?:code|password)s?|verification codes?|2fa codes?|cvv|cvc|card numbers?|api[ _-]?keys?|private[ _-]?keys?|access[ _-]?keys?|secret[ _-]?keys?|client[ _-]?secrets?)\b/i;
// Every invisible formatting character, such as a zero-width space or an
// invisible separator, is removed before the checks run.
const INVISIBLE = /[\p{Cf}\u00AD]/gu;
const CREDENTIAL_WORD = "(?:password|passwd|passcode|passphrase|pwd|pw|creds?|credentials?|secret|seed|otp|totp|pin|login)";
const PLAIN_TEXT_PATTERNS = [
  // A credential word, then within the same line a value holding a letter and a digit or symbol.
  new RegExp(`\\b${CREDENTIAL_WORD}\\b[^\\n]{0,60}?(?<![\\w@./-])(?=[^\\s"',;]*[A-Za-z])(?=[^\\s"',;]*[0-9!@#$%^&*])[^\\s"',;]{4,}`, "i"),
  // A long passphrase after "password is", which holds no digit.
  /\b(?:password|passphrase|passcode|pwd|pw|secret)\b[^.\n]{0,40}?\b(?:is|was|=|:)\s*["']?[a-z]{16,}\b/i,
  // A one-time code: "the verification code is 482913".
  /\b(?:code|otp|pin)\b[^.\n]{0,20}?(?:\bis\b|[:=])\s*\d{4,8}\b/i,
  // A PIN or code given straight after the word: "pin 4821", "otp 482913".
  /\b(?:pin|otp|passcode)s?\s{0,2}[:=#]?\s{0,2}\d{4,8}\b/i,
  // pass followed by a value holding a digit or symbol: "pass hunter2".
  /\bpass\s{1,2}(?=[^\s"',;]*[0-9!@#$%^&*])[^\s"',;]{4,}/i,
  // login: user / value.
  /\blogin\s{0,2}[:=]\s{0,2}\S+\s{0,2}\/\s{0,2}\S{3,}/i,
  // A card number: 13 to 19 digits, grouped or not.
  /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/,
  // pass=value and pass: value.
  /\bpass\s{0,2}[:=]\s{0,2}\S{4,}/i,
];

export function looksSecret(text) {
  const original = String(text ?? "");
  const value = original.replace(INVISIBLE, "");
  if (CREDENTIAL_MENTION.test(value)) return true;
  if (PLAIN_TEXT_PATTERNS.some((pattern) => pattern.test(value))) return true;
  if (WHOLE_TEXT_PATTERNS.some((pattern) => pattern.test(value))) return true;
  if (PREFIX_ANYWHERE.test(value) || PREFIX_ANYWHERE.test(value.replace(/\r?\n[ \t]*/g, ""))) return true;
  if (DISTINCTIVE_ANYWHERE.test(value.replace(/\s+/g, ""))) return true;
  for (const piece of value.split(/[\s"'`()[\]{},;<>]+/)) {
    const token = piece.replace(/[.:!?]+$/, "");
    if (tokenLooksSecret(token)) return true;
    const afterAssignment = token.slice(Math.max(token.lastIndexOf("="), token.lastIndexOf(":")) + 1);
    if (afterAssignment !== token && tokenLooksSecret(afterAssignment)) return true;
  }
  return false;
}
