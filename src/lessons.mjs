/**
 * Read-only check of lesson files against the shape in
 * skills/super-outer/references/learning-loop.md. It reads the kit's lessons
 * and a project's `.engineering/super-outer/lessons.md`, and lists lessons that
 * are missing a line, lessons that repeat a heading or a trigger, and lessons
 * that carry a Retire when line. It writes nothing and calls no network.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REQUIRED = Object.freeze(["Learned", "Trigger", "What goes wrong", "What to do"]);
export const OPTIONAL = Object.freeze(["Assumption", "Retire when"]);
export const LIMIT = 40;
export const PROJECT_LESSONS = path.join(".engineering", "super-outer", "lessons.md");
export const KIT_LESSONS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "skills", "super-outer", "references", "lessons.md");

const MAX_BYTES = 512 * 1024;
const FIELD = new RegExp(`^- (${[...REQUIRED, ...OPTIONAL].join("|")}):\\s*(.*)$`);
const squeeze = (text) => String(text).replace(/\s+/g, " ").trim();
// Letters and digits of any script, so two lessons titled in Hindi are not read as one.
const comparable = (text) => squeeze(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Splits a lessons file into its lessons. A lesson starts at a second-level heading. */
export function parseLessons(text) {
  const lessons = [];
  let lesson = null;
  let field = null;
  let fenced = false;
  String(text ?? "").split(/\r?\n/).forEach((line, index) => {
    if (/^```/.test(line)) fenced = !fenced;
    if (fenced) return;
    const heading = /^## (.+)$/.exec(line);
    if (heading) {
      lesson = { heading: squeeze(heading[1]), line: index + 1, fields: {}, parts: {} };
      lessons.push(lesson);
      field = null;
      return;
    }
    if (!lesson) return;
    const start = FIELD.exec(line);
    if (start) {
      field = start[1];
      lesson.parts[field] = [start[2]];
    } else if (field && /^ {2,}\S/.test(line)) {
      // Collected and joined once, so a long field costs time in proportion to its length.
      lesson.parts[field].push(line);
    } else if (line.trim() !== "") {
      field = null;
    }
  });
  for (const entry of lessons) {
    for (const [name, parts] of Object.entries(entry.parts)) entry.fields[name] = squeeze(parts.join(" "));
    delete entry.parts;
  }
  return lessons;
}

/** Checks one lessons text. Never throws. */
export function checkLessons(text) {
  const lessons = parseLessons(text);
  const malformed = [];
  const duplicates = [];
  const retirable = [];
  const seen = new Map();
  for (const lesson of lessons) {
    const missing = REQUIRED.filter((name) => !lesson.fields[name]);
    if (lesson.fields.Assumption && !lesson.fields["Retire when"]) missing.push("Retire when");
    if (missing.length > 0) malformed.push({ heading: lesson.heading, line: lesson.line, missing });
    for (const key of [`heading:${comparable(lesson.heading)}`, lesson.fields.Trigger ? `trigger:${comparable(lesson.fields.Trigger)}` : null]) {
      if (!key) continue;
      if (seen.has(key)) duplicates.push({ heading: lesson.heading, line: lesson.line, repeats: seen.get(key), on: key.startsWith("heading:") ? "heading" : "trigger" });
      else seen.set(key, lesson.heading);
    }
    if (lesson.fields["Retire when"]) retirable.push({ heading: lesson.heading, line: lesson.line, retire_when: lesson.fields["Retire when"] });
  }
  return { count: lessons.length, over_limit: lessons.length > LIMIT, malformed, duplicates, retirable };
}

const readQuietly = (file) => {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > MAX_BYTES) return null;
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
};

/** Checks the kit's lessons and the project's. `valid` is false when any lesson is malformed. */
export function checkLessonFiles(directory = process.cwd(), { kitFile = KIT_LESSONS } = {}) {
  const projectFile = path.join(path.resolve(directory), PROJECT_LESSONS);
  const files = [];
  for (const [scope, file] of [["kit", kitFile], ["project", projectFile]]) {
    const text = readQuietly(file);
    files.push(text === null ? { scope, file, present: false } : { scope, file, present: true, ...checkLessons(text) });
  }
  const total = (name) => files.reduce((sum, entry) => sum + (entry[name]?.length ?? 0), 0);
  const parts = [];
  for (const entry of files) parts.push(entry.present ? `${entry.scope}: ${entry.count} ${entry.count === 1 ? "lesson" : "lessons"}` : `${entry.scope}: no lessons file`);
  if (total("malformed") > 0) parts.push(`${total("malformed")} missing a line`);
  if (total("duplicates") > 0) parts.push(`${total("duplicates")} repeated`);
  if (total("retirable") > 0) parts.push(`${total("retirable")} with a Retire when line to re-test`);
  if (files.some((entry) => entry.over_limit)) parts.push(`a file holds more than ${LIMIT} lessons, so propose merges or removals before adding another`);
  return { valid: total("malformed") === 0, files, summary: parts.join("; ") };
}
