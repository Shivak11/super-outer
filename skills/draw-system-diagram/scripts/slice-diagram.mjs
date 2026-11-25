#!/usr/bin/env node
// Renders a tall diagram as several PNG slices so each can be inspected at full
// size. Usage: node slice-diagram.mjs file.svg [sliceHeight=1300]
// Writes file-slice-1.png, file-slice-2.png ... next to the SVG, each at 2x, and
// prints their paths. Review every slice: a tall picture hides problems when it is
// shrunk to fit one screen. Uses the same browsers as render-diagram.mjs (set CHROME
// to override). The slices are throwaway review copies; the SVG stays the source.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/microsoft-edge",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
];

const file = process.argv[2];
const sliceHeight = Number(process.argv[3] ?? 1300);
if (!file || !Number.isFinite(sliceHeight) || sliceHeight < 400) {
  console.error("Usage: node slice-diagram.mjs file.svg [sliceHeight>=400]");
  process.exit(2);
}
const browser = process.env.CHROME && existsSync(process.env.CHROME) ? process.env.CHROME : CANDIDATES.find((p) => existsSync(p));
if (!browser) {
  console.error("No Chrome, Chromium, Edge or Brave was found. Install one, or set CHROME to its path.");
  process.exit(2);
}
const svgPath = resolve(file);
if (!/\.svg$/i.test(svgPath)) {
  console.error(`${file}: the input must be an .svg file (the slices are written beside it as .png, and must never overwrite the source)`);
  process.exit(2);
}
// Remove slices from an earlier run so a shorter picture does not leave stale ones behind.
const stem = basename(svgPath).replace(/\.svg$/i, "");
for (const name of readdirSync(dirname(svgPath))) {
  if (name.startsWith(`${stem}-slice-`) && name.endsWith(".png")) unlinkSync(join(dirname(svgPath), name));
}
const svg = readFileSync(svgPath, "utf8");
const box = /viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(svg);
if (!box) {
  console.error(`${file}: no viewBox="0 0 WIDTH HEIGHT"`);
  process.exit(2);
}
const width = Math.ceil(Number(box[1]));
const height = Math.ceil(Number(box[2]));
const dir = mkdtempSync(join(tmpdir(), "slice-diagram-"));
let failed = false;
try {
  const overlap = 40; // each slice repeats a little of the one above so nothing is cut in half unseen
  let n = 0;
  for (let top = 0; top < height; top += sliceHeight - overlap) {
    n += 1;
    const h = Math.min(sliceHeight, height - top);
    const slice = svg.replace(/<svg\b[^>]*>/, (tag) =>
      tag.replace(/viewBox="[^"]*"/, `viewBox="0 ${top} ${width} ${h}"`).replace(/width="[^"]*"/, `width="${width}"`).replace(/height="[^"]*"/, `height="${h}"`));
    const tmp = join(dir, `slice-${n}.svg`);
    writeFileSync(tmp, slice);
    const png = svgPath.replace(/\.svg$/i, `-slice-${n}.png`);
    const before = existsSync(png) ? statSync(png).mtimeMs : 0;
    const run = spawnSync(browser, [
      "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=2",
      `--window-size=${width},${h}`, `--screenshot=${png}`, pathToFileURL(tmp).href
    ], { encoding: "utf8", timeout: 60_000 });
    if (run.status !== 0 || !existsSync(png) || statSync(png).mtimeMs === before) {
      console.error(`slice ${n}: the browser did not write ${png}${run.stderr ? `\n${run.stderr.trim()}` : ""}`);
      failed = true;
      break;
    }
    console.log(`${png}  (y ${top} to ${top + h})`);
    if (top + h >= height) break;
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
