#!/usr/bin/env node
// Writes a PNG at twice the SVG's size next to each SVG named, using Chrome,
// Chromium, Edge or Brave without a window. Usage: node render-diagram.mjs file.svg ...
// Set CHROME to the browser binary when it is installed somewhere else.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
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

const findBrowser = () => {
  if (process.env.CHROME) {
    if (existsSync(process.env.CHROME)) return process.env.CHROME;
    console.error(`CHROME is set to ${process.env.CHROME}, which does not exist.`);
    process.exit(2);
  }
  return CANDIDATES.find((path) => existsSync(path));
};

const files = process.argv.slice(2);
if (!files.length) {
  console.error("Usage: node render-diagram.mjs file.svg ...");
  process.exit(2);
}
const browser = findBrowser();
if (!browser) {
  console.error("No Chrome, Chromium, Edge or Brave was found. Install one, or set CHROME to its path, then run this again.");
  console.error("Do not use the macOS Quick Look preview (qlmanage) instead: it moves centred SVG text and misleads the check.");
  process.exit(2);
}

let failed = false;
for (const file of files) {
  const svg = resolve(file);
  const viewBox = /viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(readFileSync(svg, "utf8"));
  if (!viewBox) {
    console.error(`${file}: no viewBox="0 0 WIDTH HEIGHT", so the window size is unknown`);
    failed = true;
    continue;
  }
  const [width, height] = [Math.ceil(Number(viewBox[1])), Math.ceil(Number(viewBox[2]))];
  const png = svg.replace(/\.svg$/i, ".png");
  const before = existsSync(png) ? statSync(png).mtimeMs : 0;
  const run = spawnSync(browser, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=2",
    `--window-size=${width},${height}`, `--screenshot=${png}`, pathToFileURL(svg).href
  ], { encoding: "utf8", timeout: 60_000 });
  if (run.status !== 0 || !existsSync(png) || statSync(png).mtimeMs === before) {
    console.error(`${file}: the browser did not write ${png}${run.stderr ? `\n${run.stderr.trim()}` : ""}`);
    failed = true;
    continue;
  }
  console.log(`Wrote ${png} from ${file} (${width}x${height} at 2x)`);
}
process.exit(failed ? 1 : 0);
