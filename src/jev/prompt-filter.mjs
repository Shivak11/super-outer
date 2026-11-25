import { looksSecret as looksSecret580 } from "./prompt-filter-5-8-0.mjs";

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
  /\b(?:password|passcode|passphrase|pwd|secret|token|key)\s{1,4}(?:is|was|are)\s{1,4}["']?(?=[^\s"']{0,60}[0-9])[^\s"',;]{6}/i,
  // name = value and name: value, for any name that contains one of these words
  /(?:password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|credential)[A-Za-z0-9_-]{0,40}["']?\s{0,4}[:=]\s{0,4}["']?[^\s"',;}]{6}/i,
  /\bAuthorization\s{0,4}[:=]\s{0,4}["']?(?:Basic|Bearer|Token)\s{1,4}\S{8}/i,
  /\bBearer\s{1,4}[A-Za-z0-9._~+/-]{20}/i,
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
const PREFIX_ANYWHERE = new RegExp(`(?:^|[^A-Za-z0-9])(?:${PREFIXES})[A-Za-z0-9._-]{12}`);
// The prefixes that are distinctive enough to be matched with every white
// space removed and no boundary at all, so a key typed in spaced groups is
// still seen. Only prefixes that carry punctuation qualify: the bare sk-
// joined to the word before it would read risk-based as a key, and the
// letter-only prefixes AKIA, ASIA and AIza would read "the ASIA landing
// pages" as one.
const DISTINCTIVE_PREFIXES =
  "sk-or-v1-|sk-ant-|sk-proj-|sk_live_|sk_test_|rk_live_|rk_test_|pk_live_|whsec_|rzp_live_|rzp_test_|sb_secret_|glpat-|github_pat_|xox[abprs]-|xapp-|shpat_|dop_v1_";
const DISTINCTIVE_ANYWHERE = new RegExp(`(?:${DISTINCTIVE_PREFIXES})[A-Za-z0-9._-]{12}`);
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
 * 5.8.0 added word rules after two reviews found plainly worded credentials
 * sent. The review of 3cb90ab found that most of the remaining misses had two
 * causes: a word boundary does not fall after "_" or inside a camelCase name,
 * so DB_PASS and dbPassword were never read as credential words, and Unicode
 * marks, fullwidth letters and look-alike letters were not normalised. From
 * 5.8.1 the text is normalised once and names are split into words, and the
 * rules in docs/plans/super-outer-v5.8.1-jev-filter.md run on the
 * words. The gaps accepted there are an unlisted misspelling or language, a
 * value made only of letters with no credential or login word next to it, and
 * a look-alike letter outside the mapped set.
 */

// Invisible formatting characters and combining marks.
const MARKS = /[\p{Cf}\p{Mn}\p{Me}­]/gu;
// Cyrillic and Greek letters drawn like Latin ones.
const LOOK_ALIKES = new Map(Object.entries({
  "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x",
  "і": "i", "ј": "j", "ѕ": "s", "ԁ": "d", "ӏ": "l", "һ": "h", "ԝ": "w",
  "к": "k", "м": "m", "т": "t", "н": "h", "в": "b",
  "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H", "О": "O",
  "Р": "P", "С": "C", "Т": "T", "Х": "X", "Ѕ": "S", "І": "I", "Ј": "J",
  "α": "a", "ε": "e", "ι": "i", "κ": "k", "ν": "v", "ο": "o", "ρ": "p",
  "τ": "t", "υ": "u", "χ": "x",
  "Α": "A", "Β": "B", "Ε": "E", "Ζ": "Z", "Η": "H", "Ι": "I", "Κ": "K",
  "Μ": "M", "Ν": "N", "Ο": "O", "Ρ": "P", "Τ": "T", "Υ": "Y", "Χ": "X",
}));
const LOOK_ALIKE = new RegExp(`[${[...LOOK_ALIKES.keys()].join("")}]`, "gu");

/**
 * Marks removed, compatibility forms folded and look-alike letters mapped.
 * The text is decomposed first, so an accent typed as part of a letter, as
 * in "passwörd", is removed like one typed as a separate mark.
 */
export function normalise(text) {
  return String(text ?? "").normalize("NFKD").replace(MARKS, "").normalize("NFKC").replace(LOOK_ALIKE, (letter) => LOOK_ALIKES.get(letter));
}

// Names are split into words at camelCase and at every character that is not
// a letter or a digit, so DB_PASSWORD, dbPassword and pass-word give the words
// the rules look for. Punctuation stays as its own token, because the login
// and value rules read ":", "=" and "/".
const WORD = /^[\p{L}\p{N}]+$/u;
function tokensOf(value) {
  const split = value
    .replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2")
    .replace(/(\p{Lu})(\p{Lu}\p{Ll}{2,})/gu, "$1 $2")
    .toLowerCase();
  return split.match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) ?? [];
}

// Rule 1: a word that mentions a credential, whatever follows it.
const MENTION_WORDS = new Set([
  "password", "passwords", "passwd", "pwd", "pswd", "passwrd", "pasword", "passw0rd", "pw",
  "pass", "passcode", "passcodes", "passphrase", "passphrases", "pin", "pins",
  "credential", "credentials", "creds", "secret", "secrets",
  "otp", "otps", "totp", "totps", "2fa", "mfa", "cvv", "cvvs", "cvc", "cvcs", "key", "keys", "apikey", "apikeys",
  "passwort", "senha", "contraseña", "contrasena",
]);
// The same inside a longer name that has no separator, such as PGPASSWORD.
const MENTION_STEMS = ["password", "passwd", "passcode", "passphrase", "credential", "apikey", "secretkey", "privatekey", "accesskey"];
const CODE_KINDS = ["verification", "security", "auth", "sms", "access", "backup", "recovery", "confirmation", "login"];
const MENTION_PAIRS = new Set([
  "pass word", "pass code", "pass phrase", "card number", "card numbers", "card no",
  ...CODE_KINDS.flatMap((kind) => [`${kind} code`, `${kind} codes`]),
]);
const MENTION_TRIPLES = new Set([
  "mot de passe",
  ...["code", "codes", "password", "passwords", "pin", "passcode"].map((what) => `one time ${what}`),
]);
const SPELLED_PASSWORD = /(?<![\p{L}\p{N}])p[a@4]?[s$5]{1,2}w[o0]?r?d(?![\p{L}\p{N}])/u;
const SLASHED_PW = /(?<![\p{L}\p{N}])p ?\/ ?w(?![\p{L}\p{N}])/u;
const SCRIPT_WORDS = ["पासवर्ड"].map((word) => normalise(word));

// Rule 2: a login word followed by ":" or "=", by two values joined by "/" or
// ":" within five words, or by a word holding letters and digits within three.
// A value may be quoted or start with a symbol, as in 'letmein' or #letmein.
const LOGIN_WORDS = new Set(["login", "logon", "signin"]);
const LOGIN_PAIRS = new Set(["log in", "log on", "sign in"]);
const LETTERS_AND_DIGITS = (word) => /\p{L}/u.test(word) && /\p{N}/u.test(word);
function loginGivesValue(tokens, words, last) {
  const end = words[last][1];
  if (tokens[end + 1] === ":" || tokens[end + 1] === "=") return true;
  const stop = last + 5 < words.length ? words[last + 5][1] : tokens.length - 1;
  for (let k = end + 1; k <= stop; k += 1) {
    if (tokens[k] !== "/" && tokens[k] !== ":") continue;
    const before = tokens.slice(Math.max(end + 1, k - 3), k).some((token) => WORD.test(token));
    const after = tokens.slice(k + 1, k + 4).some((token) => WORD.test(token));
    if (before && after) return true;
  }
  for (let n = 1; n <= 3 && last + n < words.length; n += 1) if (LETTERS_AND_DIGITS(words[last + n][0])) return true;
  return false;
}

// Rule 3: the word code followed within three words by 4 to 8 digits, which
// may be split by spaces, dots or dashes.
const DIGITS = /^\p{N}+$/u;
function codeGivesDigits(tokens, words, index) {
  for (let n = 1; n <= 3 && index + n < words.length; n += 1) {
    const [word, at] = words[index + n];
    if (!DIGITS.test(word)) continue;
    let digits = word;
    let k = at;
    for (;;) {
      let next = k + 1;
      if (tokens[next] === "-" || tokens[next] === ".") next += 1;
      if (next < tokens.length && DIGITS.test(tokens[next])) {
        digits += tokens[next];
        k = next;
      } else break;
    }
    return digits.length >= 4 && digits.length <= 8;
  }
  return false;
}

// Rule 4: token, seed or cred followed by ":" or "=", by is or was and a value, or
// within three words by a word holding letters and digits. A word that states
// the token's condition, as in "the token is expired", is not a value.
const STATE_WORDS = new Set([
  "expired", "invalid", "valid", "missing", "wrong", "empty", "null", "undefined", "revoked", "stale",
  "required", "set", "unset", "used", "correct", "incorrect", "broken", "gone", "sent", "stored", "saved",
  "refreshed", "rotated", "generated", "created", "cached", "shown", "hidden", "visible", "needed",
  "optional", "the", "a", "an",
]);
function tokenGivesValue(tokens, words, index) {
  const at = words[index][1];
  if (tokens[at + 1] === ":" || tokens[at + 1] === "=") return true;
  const verb = words[index + 1]?.[0];
  const after = words[index + 2]?.[0];
  if ((verb === "is" || verb === "was") && after !== undefined && !STATE_WORDS.has(after)) return true;
  for (let n = 1; n <= 3 && index + n < words.length; n += 1) if (LETTERS_AND_DIGITS(words[index + n][0])) return true;
  return false;
}

// Rule 7: a name that ends in a credential word, followed by "=" or ":", such
// as DBPASS=hunter2 or OPENAIKEY: value, where nothing separates the words.
const NAME_ENDINGS = ["pass", "pw", "pwd", "key", "keys", "secret", "token", "pin"];
const namesCredential = (word) => NAME_ENDINGS.some((ending) => word.length > ending.length && word.endsWith(ending));

function holdsCredentialWords(value) {
  const lower = value.toLowerCase();
  if (SPELLED_PASSWORD.test(lower) || SLASHED_PW.test(lower)) return true;
  if (SCRIPT_WORDS.some((word) => lower.includes(word))) return true;
  const tokens = tokensOf(value);
  const words = [];
  tokens.forEach((token, at) => {
    if (WORD.test(token)) words.push([token, at]);
  });
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index][0];
    const next = words[index + 1]?.[0];
    const third = words[index + 2]?.[0];
    if (MENTION_WORDS.has(word) || MENTION_STEMS.some((stem) => word.includes(stem))) return true;
    if (next !== undefined && MENTION_PAIRS.has(`${word} ${next}`)) return true;
    if (third !== undefined && MENTION_TRIPLES.has(`${word} ${next} ${third}`)) return true;
    if (LOGIN_WORDS.has(word) && loginGivesValue(tokens, words, index)) return true;
    if (next !== undefined && LOGIN_PAIRS.has(`${word} ${next}`) && loginGivesValue(tokens, words, index + 1)) return true;
    if ((word === "code" || word === "codes") && codeGivesDigits(tokens, words, index)) return true;
    if ((word === "token" || word === "seed" || word === "cred") && tokenGivesValue(tokens, words, index)) return true;
    const following = tokens[words[index][1] + 1];
    if ((following === "=" || following === ":") && namesCredential(word)) return true;
  }
  return false;
}

// Rule 5: a card number, 13 to 19 digits, which may be split by up to three
// spaces, dots or dashes of any kind, including the minus sign.
const CARD_NUMBER = /(?<!\p{N})(?:\p{N}[\s.\p{Pd}\u2212]{0,3}){12,18}\p{N}(?!\p{N})/u;

// The 5.8.0 filter runs on the first 2,000 characters, so 5.8.1 never sends
// a form the installed release withheld. It is slow on long text, and the
// judge never passes it more than 1,700 characters.
const RELEASED_FILTER_CHARACTERS = 2000;

export function looksSecret(text) {
  if (looksSecret580(String(text ?? "").slice(0, RELEASED_FILTER_CHARACTERS))) return true;
  const value = normalise(text);
  if (holdsCredentialWords(value)) return true;
  if (CARD_NUMBER.test(value)) return true;
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

/** One-line activity summaries sent to Jev (approved 22 October 2026). */
export const SUMMARY_LIMIT = 200;

/** Returns the summary when it is one short line with no secret, otherwise null. */
export function safeSummary(text) {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (trimmed === "" || trimmed.length > SUMMARY_LIMIT || /[\r\n]/.test(trimmed)) return null;
  if (looksSecret(trimmed)) return null;
  return trimmed;
}
