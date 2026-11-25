#!/usr/bin/env node
// Checks a hand-written diagram SVG against the house style in
// ../references/style.md and, for a pipeline or a code-flow diagram,
// ../references/pipeline.md or ../references/code-flow.md.
// Usage: node check-diagram.mjs [--no-facts] [--one-system] file.svg ...
// Prints one line per problem and exits 1 when any file has an error. With
// --one-system, the files are diagrams of one system, and a fact that two of
// them state differently is an error.
import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Advance widths of the printable ASCII characters (space to tilde) at font
// size 100 in Helvetica Neue, measured in headless Chrome with
// getComputedTextLength. Regular is weight 400; bold is weight 700 and above.
// Any other character counts as a wide letter, so the estimate errs long.
const WIDTHS = {
  regular: [28,26,43,56,56,100,63,28,26,26,35,60,28,39,28,33,56,56,56,56,56,56,56,56,56,56,28,28,60,60,60,56,80,65,69,72,70,61,57,76,72,26,52,67,56,87,72,76,65,76,69,65,57,72,61,93,61,65,61,26,33,26,60,50,22,54,59,54,59,54,30,57,56,22,22,52,22,85,56,57,59,59,33,50,32,56,50,76,52,50,48,33,22,33,60],
  bold: [28,28,46,56,56,100,69,28,30,30,41,60,28,41,28,37,56,56,56,56,56,56,56,56,56,56,28,28,60,60,60,56,80,69,70,74,74,65,59,76,74,30,56,72,59,91,74,78,67,78,72,65,61,74,63,94,67,67,65,33,37,33,60,50,26,57,61,57,61,57,33,61,59,26,28,57,26,91,59,61,61,61,39,54,35,59,52,81,54,52,52,33,22,33,60]
};
const OTHER_WIDTH = 72;
const lineWidth = (text, size, bold) => {
  const table = bold ? WIDTHS.bold : WIDTHS.regular;
  let units = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    units += code >= 32 && code < 127 ? table[code - 32] : OTHER_WIDTH;
  }
  return (units * size) / 100;
};
// Text closer than this to a box edge touches the border at 2x.
const EDGE_GAP = 4;
const MIN_FONT_SIZE = 14;

const attrs = (tag) => {
  const out = {};
  for (const [, key, value] of tag.matchAll(/([\w:-]+)="([^"]*)"/g)) out[key] = value;
  return out;
};
const num = (value, fallback = NaN) => (value === undefined ? fallback : Number.parseFloat(value));
const isWhite = (fill = "") => /^(#fff|#ffffff|white)$/i.test(fill.trim());
// The kind is set on the root element; a diagram without it is an architecture diagram.
const KINDS = ["architecture", "pipeline", "code-flow", "one-problem"];
const FACTS_BLOCK = /<metadata id="(?:diagram|architecture)-facts">([\s\S]*?)<\/metadata>/;

// Points of a path drawn with straight moves only; null when it has curves.
function pathPoints(d) {
  if (/[cCsSqQtTaA]/.test(d)) return null;
  const points = [];
  let x = 0;
  let y = 0;
  for (const [, cmd, args] of d.matchAll(/([MLHVZmlhvz])([^MLHVZmlhvz]*)/g)) {
    const n = (args.match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number);
    const rel = cmd === cmd.toLowerCase();
    const c = cmd.toUpperCase();
    if (c === "M" || c === "L") for (let i = 0; i + 1 < n.length; i += 2) { x = rel ? x + n[i] : n[i]; y = rel ? y + n[i + 1] : n[i + 1]; points.push([x, y]); }
    else if (c === "H") for (const v of n) { x = rel ? x + v : v; points.push([x, y]); }
    else if (c === "V") for (const v of n) { y = rel ? y + v : v; points.push([x, y]); }
  }
  return points;
}

// Claims a diagram must not make, because the source cannot show them.
const CLAIMS = [
  [/confiden[a-z]*.{0,40}\baccura|\baccura[a-z]*.{0,40}confiden/i, "presents the model's confidence as measured accuracy; say what the confidence is (the model's own estimate) or show a measured result with its date"],
  [/\b(more|extra|additional|another)\b.{0,40}\b(raises?|increases?|higher|boosts?|guarantees?)\b.{0,20}confiden/i, "says more inputs bring higher confidence; extra inputs can also add contradictions, so describe what each input adds"]
];

const decode = (text) => text.replace(/<[^>]+>/g, "").replace(/&(amp|lt|gt|quot|apos|#\d+);/g, "x").replace(/\s+/g, " ").trim();

export function checkDiagram(svg, { facts = true } = {}) {
  const errors = [];
  const warnings = [];
  const root = /<svg\b[^>]*>/.exec(svg)?.[0];
  if (!root) return { errors: ["no <svg> element"], warnings };
  const rootAttrs = attrs(root);
  const box = /^0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)$/.exec(rootAttrs.viewBox ?? "");
  if (!box) {
    errors.push('the <svg> needs viewBox="0 0 WIDTH HEIGHT"');
    return { errors, warnings };
  }
  const [width, height] = [Number(box[1]), Number(box[2])];
  const kind = rootAttrs["data-diagram"] ?? "architecture";
  if (!KINDS.includes(kind)) errors.push(`data-diagram="${kind}" is not a kind this checker knows; use ${KINDS.join(", ")}`);
  if (width !== 1440) warnings.push(`the canvas is ${width} wide; the house width is 1440`);
  const baseSize = num(rootAttrs["font-size"], 16);

  const rects = [...svg.matchAll(/<rect\b[^>]*>/g)].map(([tag]) => attrs(tag));
  const canvas = rects.find((r) => num(r.width) === width && num(r.height) === height && num(r.x, 0) === 0 && num(r.y, 0) === 0);
  if (!canvas || !isWhite(canvas.fill)) errors.push(`the first layer needs <rect width="${width}" height="${height}" fill="#FFFFFF"/> so the picture reads the same in light and dark themes`);

  for (const [pattern, name] of [[/<script\b/i, "<script>"], [/<image\b/i, "<image>"], [/<foreignObject\b/i, "<foreignObject>"], [/@import/i, "@import"], [/\son\w+="/i, "an event attribute"], [/href="(https?:)?\/\//i, "an outside link"]]) {
    if (pattern.test(svg)) errors.push(`remove ${name}: GitHub and most viewers show the SVG as an image, and the picture must not load anything`);
  }
  if (!/<title\b[^>]*>[^<]+<\/title>/.test(svg)) errors.push("add a <title> naming the system");
  if (!/<desc\b[^>]*>[^<]{40,}<\/desc>/.test(svg)) errors.push("add a <desc> of at least one sentence saying what the picture shows, for screen readers");

  const texts = [...svg.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)].map(([, tag, body]) => ({ ...attrs(`<t ${tag}>`), content: decode(body) }));
  const allText = texts.map((t) => t.content).join("\n");
  // A pipeline or a code-flow diagram needs no legend; dashed parts still say what they are.
  if (!["pipeline", "code-flow"].includes(kind) && !/^Live$/m.test(allText)) errors.push('the legend needs an entry "Live" for solid borders');
  if (/stroke-dasharray/.test(svg) && !/planned|proposed|not built/i.test(allText)) errors.push("dashed borders appear, so the picture needs a line that names them as planned or proposed");
  for (const t of texts) {
    for (const [pattern, why] of CLAIMS) if (pattern.test(t.content)) errors.push(`"${t.content}" ${why}`);
  }

  if (facts) {
    const block = FACTS_BLOCK.exec(svg)?.[1];
    if (block === undefined) errors.push('add <metadata id="diagram-facts"> (or the older id "architecture-facts") with the values the picture states, so a test can compare them with the source');
    else {
      try {
        const parsed = JSON.parse(block);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) errors.push("the facts block must hold one JSON object");
      } catch (error) {
        errors.push(`the facts block is not valid JSON: ${error.message}`);
      }
    }
  }

  const shapes = rects.filter((r) => r !== canvas && !Number.isNaN(num(r.width)) && !Number.isNaN(num(r.height)))
    .map((r) => ({ x: num(r.x, 0), y: num(r.y, 0), w: num(r.width), h: num(r.height) }));
  for (const t of texts) {
    // Rotated or moved text has no simple box to measure against.
    if (!t.content || t.transform) continue;
    const size = num(t["font-size"], baseSize);
    const x = num(t.x);
    const y = num(t.y);
    if (Number.isNaN(x) || Number.isNaN(y)) continue;
    if (size < MIN_FONT_SIZE) errors.push(`"${t.content}" is ${size}px; text below ${MIN_FONT_SIZE} cannot be read at README width`);
    const bold = Number.parseInt(t["font-weight"] ?? "400", 10) >= 600 || t["font-weight"] === "bold";
    const span = lineWidth(t.content, size, bold);
    const anchor = t["text-anchor"] ?? "start";
    const left = anchor === "middle" ? x - span / 2 : anchor === "end" ? x - span : x;
    const right = left + span;
    // The innermost box that holds the start of the line is the one it must fit.
    const holder = shapes.filter((s) => x >= s.x && x <= s.x + s.w && y - size * 0.7 >= s.y && y <= s.y + s.h)
      .sort((a, b) => a.w * a.h - b.w * b.h)[0];
    const limitLeft = holder ? holder.x + EDGE_GAP : 0;
    const limitRight = holder ? holder.x + holder.w - EDGE_GAP : width;
    if (right > limitRight || left < limitLeft) {
      const where = holder ? `its box at x=${holder.x}, width ${holder.w}` : "the canvas";
      errors.push(`"${t.content}" runs past ${where} by about ${Math.ceil(Math.max(right - limitRight, limitLeft - left))} units; SVG text does not wrap, so split the line or widen the box`);
      continue;
    }
    // A label in a gap between groups must not touch the border of any box it sits beside.
    const touched = shapes.find((s) => s !== holder && y - size * 0.7 <= s.y + s.h && y >= s.y &&
      [s.x, s.x + s.w].some((edge) => left < edge + EDGE_GAP && right > edge - EDGE_GAP));
    if (touched) errors.push(`"${t.content}" touches the border of the box at x=${touched.x}, width ${touched.w}; move it into the gap or shorten it`);
  }

  // Arrows: each one is labelled and none passes through a box it does not start or end at.
  const leaves = shapes.filter((r) => !(r.x === 0 && r.y === 0 && r.w >= width) &&
    !shapes.some((s) => s !== r && s.x >= r.x && s.y >= r.y && s.x + s.w <= r.x + r.w && s.y + s.h <= r.y + r.h));
  // Filled boxes in drawing order: one drawn after an arrow hides the part of it underneath.
  const painted = [...svg.matchAll(/<rect\b[^>]*>/g)].map((match) => ({ at: match.index, ...attrs(match[0]) }))
    .filter((r) => r.fill && r.fill !== "none" && !(num(r.x, 0) === 0 && num(r.y, 0) === 0 && num(r.width) >= width))
    .map((r) => ({ at: r.at, x: num(r.x, 0), y: num(r.y, 0), w: num(r.width), h: num(r.height) }));
  for (const match of svg.matchAll(/<path\b[^>]*marker-end[^>]*>/g)) {
    const tag = match[0];
    const d = attrs(tag).d ?? "";
    const points = pathPoints(d);
    if (!points || points.length < 2) continue;
    const segments = points.slice(1).map((end, i) => [points[i], end]);
    // A label is bold text at 16 or less beside one of the arrow's segments.
    const labelled = texts.some((t) => {
      if (!(Number.parseInt(t["font-weight"] ?? "400", 10) >= 600) || num(t["font-size"], baseSize) > 16) return false;
      const [tx, ty] = [num(t.x), num(t.y)];
      return segments.some(([[x1, y1], [x2, y2]]) => {
        const nearestX = Math.max(Math.min(tx, Math.max(x1, x2)), Math.min(x1, x2));
        return Math.abs(tx - nearestX) < 120 && ty >= Math.min(y1, y2) - 30 && ty <= Math.max(y1, y2) + 46;
      });
    });
    if (!labelled) errors.push(`the arrow "${d}" has no label; add one at 14, weight 700, saying what moves`);
    for (const [[x1, y1], [x2, y2]] of segments) {
      for (const r of leaves) {
        const outside = (x, y) => x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h;
        const crosses = y1 === y2
          ? y1 > r.y + 3 && y1 < r.y + r.h - 3 && Math.max(x1, x2) > r.x + 3 && Math.min(x1, x2) < r.x + r.w - 3
          : x1 === x2 && x1 > r.x + 3 && x1 < r.x + r.w - 3 && Math.max(y1, y2) > r.y + 3 && Math.min(y1, y2) < r.y + r.h - 3;
        if (outside(x1, y1) && outside(x2, y2) && crosses) errors.push(`the arrow "${d}" runs through the box at x=${r.x}, y=${r.y}; route it around`);
      }
    }
    const hidden = painted.find((r) => r.at > match.index && segments.some(([[x1, y1], [x2, y2]]) =>
      y1 === y2
        ? y1 > r.y + 1 && y1 < r.y + r.h - 1 && Math.max(x1, x2) > r.x + 1 && Math.min(x1, x2) < r.x + r.w - 1
        : x1 === x2 && x1 > r.x + 1 && x1 < r.x + r.w - 1 && Math.max(y1, y2) > r.y + 1 && Math.min(y1, y2) < r.y + r.h - 1));
    if (hidden) errors.push(`the arrow "${d}" is drawn before the box at x=${hidden.x}, y=${hidden.y}, which covers part of it; move the arrow after that box in the file`);
    // An arrow drawn across a line of text makes both hard to read.
    for (const t of texts) {
      if (!t.content || t.transform) continue;
      const size = num(t["font-size"], baseSize);
      const [tx, ty] = [num(t.x), num(t.y)];
      if (Number.isNaN(tx) || Number.isNaN(ty)) continue;
      const bold = Number.parseInt(t["font-weight"] ?? "400", 10) >= 600 || t["font-weight"] === "bold";
      const span = lineWidth(t.content, size, bold);
      const anchor = t["text-anchor"] ?? "start";
      const left = anchor === "middle" ? tx - span / 2 : anchor === "end" ? tx - span : tx;
      const [top, bottom] = [ty - size * 0.72, ty + size * 0.2];
      const crosses = segments.some(([[x1, y1], [x2, y2]]) => y1 === y2
        ? y1 > top && y1 < bottom && Math.max(x1, x2) > left && Math.min(x1, x2) < left + span
        : x1 === x2 && x1 > left && x1 < left + span && Math.max(y1, y2) > top && Math.min(y1, y2) < bottom);
      if (crosses) errors.push(`the arrow "${d}" crosses the text "${t.content}"; route the arrow around it or move the text`);
    }
    const atShape = ([x, y]) => shapes.some((r) => x >= r.x - 8 && x <= r.x + r.w + 8 && y >= r.y - 8 && y <= r.y + r.h + 8);
    if (!atShape(points[0]) || !atShape(points[points.length - 1])) warnings.push(`the arrow "${d}" starts or ends away from any box; check in the PNG that it reaches its part`);
  }
  return { errors, warnings, kind };
}

/** Facts that two diagrams of the same system state differently. */
export function compareFacts(files) {
  const seen = new Map();
  const problems = [];
  for (const [file, svg] of files) {
    let facts;
    try {
      facts = JSON.parse(FACTS_BLOCK.exec(svg)?.[1] ?? "null");
    } catch {
      continue;
    }
    if (!facts || typeof facts !== "object") continue;
    for (const [key, value] of Object.entries(facts)) {
      const text = JSON.stringify(value);
      const earlier = seen.get(key);
      if (earlier && earlier.text !== text) problems.push(`"${key}" is ${earlier.text} in ${earlier.file} and ${text} in ${file}; the diagrams describe one system, so make them agree`);
      else if (!earlier) seen.set(key, { file, text });
    }
  }
  return problems;
}

// Node loads the script by its real path, so compare real paths: run through a
// symlinked skill folder, a plain comparison never matches and nothing is checked.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const facts = !args.includes("--no-facts");
  const oneSystem = args.includes("--one-system");
  const files = args.filter((a) => a !== "--no-facts" && a !== "--one-system");
  if (!files.length) {
    console.error("Usage: node check-diagram.mjs [--no-facts] [--one-system] file.svg ...");
    process.exit(2);
  }
  let failed = false;
  const read = [];
  for (const file of files) {
    let svg;
    try {
      svg = readFileSync(file, "utf8");
    } catch (error) {
      console.error(`${file}: cannot read (${error.code ?? error.message})`);
      failed = true;
      continue;
    }
    read.push([file, svg]);
    const { errors, warnings } = checkDiagram(svg, { facts });
    for (const w of warnings) console.log(`${file}: note: ${w}`);
    for (const e of errors) console.log(`${file}: error: ${e}`);
    if (errors.length) failed = true;
    else console.log(`${file}: passes`);
  }
  for (const problem of oneSystem ? compareFacts(read) : []) {
    console.log(`error: ${problem}`);
    failed = true;
  }
  process.exit(failed ? 1 : 0);
}
