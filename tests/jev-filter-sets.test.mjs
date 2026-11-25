// The 5.8.1 credential filter is accepted against a set frozen before it
// was built (docs/plans/super-outer-v5.8.1-jev-filter.md). C1 holds the
// variants quoted by the independent verifier on 3cb90ab. A second set was
// planned and dropped, as the plan records. Each case says whether the rule
// withholds it, sends it, or leaves it in an accepted gap; gap cases are
// counted, not scored. A failure here is reported, never fixed by editing the
// sets.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";

import { looksSecret } from "../src/jev/prompt-filter.mjs";

const FROZEN = {
  "filter-variants-c1.json": "30f060517d881d5235f7dc607470193f35efbe181b7c0d937c2f21d0a7ee01d3",
};

for (const [file, sha256] of Object.entries(FROZEN)) {
  const bytes = fs.readFileSync(new URL(`./fixtures/jev/${file}`, import.meta.url));
  const { cases } = JSON.parse(bytes);

  test(`${file} is the set frozen before the build`, () => {
    assert.equal(createHash("sha256").update(bytes).digest("hex"), sha256);
  });

  test(`every case in ${file} that the rule withholds is withheld`, () => {
    const sent = cases.filter((item) => item.expect === "withheld" && !looksSecret(item.text)).map((item) => item.text);
    assert.deepEqual(sent, []);
  });

  test(`every ordinary case in ${file} is sent`, () => {
    const withheld = cases.filter((item) => item.expect === "sent" && looksSecret(item.text)).map((item) => item.text);
    assert.deepEqual(withheld, []);
  });
}
