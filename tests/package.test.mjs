import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { buildPackage, verifyPackage } from "../scripts/build-package.mjs";

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

const extractStoredZip = (filename, destination) => {
  const archive = fs.readFileSync(filename);
  let offset = 0;
  while (offset + 30 <= archive.length && archive.readUInt32LE(offset) === 0x04034b50) {
    const size = archive.readUInt32LE(offset + 18);
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const name = archive.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    assert.ok(name.startsWith("super-outer/") && !name.split("/").includes(".."));
    const dataOffset = offset + 30 + nameLength + extraLength;
    const target = path.join(destination, ...name.split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, archive.subarray(dataOffset, dataOffset + size));
    offset = dataOffset + size;
  }
};

const sourceFixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-package-source-"));
  for (const relative of [".codex-plugin/plugin.json", ".claude-plugin/plugin.json"]) {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), JSON.stringify({ name: "super-outer", version: "6.6.0" }));
  }
  fs.mkdirSync(path.join(root, "hooks"), { recursive: true });
  fs.writeFileSync(path.join(root, "hooks/hooks.json"), "{}\n");
  fs.mkdirSync(path.join(root, "skills/super-outer"), { recursive: true });
  fs.writeFileSync(path.join(root, "skills/super-outer/SKILL.md"), "---\nname: super-outer\n---\n");
  fs.mkdirSync(path.join(root, "commands"), { recursive: true });
  fs.writeFileSync(path.join(root, "commands/outer.md"), "Use Super-outer.\n");
  fs.mkdirSync(path.join(root, ".engineering/super-outer"), { recursive: true });
  fs.writeFileSync(path.join(root, ".engineering/super-outer/task.json"), "private task state must never ship\n");
  fs.mkdirSync(path.join(root, "docs/plans"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs/plans/internal.md"), "/Users/private/local-plan\n");
  fs.writeFileSync(path.join(root, "AGENTS.md"), "repository-only instructions\n");
  return root;
};

test("two deterministic builds are byte-identical and verify against SHA256", () => {
  const root = sourceFixture();
  const first = buildPackage({ root, outputFile: path.join(os.tmpdir(), `super-outer-a-${process.pid}.zip`) });
  fs.utimesSync(path.join(root, "hooks/hooks.json"), new Date(), new Date());
  const second = buildPackage({ root, outputFile: path.join(os.tmpdir(), `super-outer-b-${process.pid}.zip`) });
  assert.equal(first.sha256, second.sha256);
  assert.deepEqual(fs.readFileSync(first.package), fs.readFileSync(second.package));
  const verified = verifyPackage({ packageFile: first.package, checksumFile: first.checksumFile });
  assert.equal(verified.valid, true);
  assert.ok(verified.entries.length >= 4);
  assert.equal(verified.entries.some((entry) => entry.name.includes(".engineering")), false);
  assert.equal(verified.entries.some((entry) => entry.name.endsWith("AGENTS.md")), false);
  assert.equal(verified.entries.some((entry) => entry.name.includes("docs/plans")), false);
});

test("package verification rejects corruption", () => {
  const built = buildPackage({ root: sourceFixture(), outputFile: path.join(os.tmpdir(), `super-outer-corrupt-${process.pid}.zip`) });
  const buffer = fs.readFileSync(built.package);
  const nameLength = buffer.readUInt16LE(26);
  const extraLength = buffer.readUInt16LE(28);
  buffer[30 + nameLength + extraLength] ^= 0xff;
  fs.writeFileSync(built.package, buffer);
  assert.throws(() => verifyPackage({ packageFile: built.package }), /Checksum mismatch|corrupt/);
});

test("Git packaging excludes ignored and untracked credentials while the extracted plugin remains self-contained", () => {
  const root = sourceFixture();
  fs.mkdirSync(path.join(root, "bin"), { recursive: true });
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src/runtime.mjs"), "export const status = 'SELF_CONTAINED';\n");
  fs.writeFileSync(path.join(root, "bin/super-outer.mjs"), "import { status } from '../src/runtime.mjs';\nprocess.stdout.write(status + '\\n');\n");
  fs.writeFileSync(path.join(root, ".gitignore"), ".env\n*.pem\n*credentials*\n");
  git(root, "init", "-b", "main");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "Test");
  git(root, "add", ".");
  git(root, "commit", "-m", "package fixture");
  fs.writeFileSync(path.join(root, ".env"), "API_TOKEN=must-not-ship\n");
  fs.writeFileSync(path.join(root, "signing-private-key.pem"), "PRIVATE KEY\n");
  fs.writeFileSync(path.join(root, "cloud-credentials.json"), "{\"secret\":true}\n");
  fs.writeFileSync(path.join(root, "untracked-note.txt"), "not part of the release\n");

  const output = path.join(os.tmpdir(), `super-outer-private-${process.pid}.zip`);
  const built = buildPackage({ root, outputFile: output });
  const verified = verifyPackage({ packageFile: built.package, checksumFile: built.checksumFile });
  const names = verified.entries.map((entry) => entry.name);
  assert.equal(names.some((name) => /(?:\.env|\.pem|credentials|untracked-note)/i.test(name)), false);
  assert.ok(names.includes("super-outer/bin/super-outer.mjs"));
  assert.ok(names.includes("super-outer/src/runtime.mjs"));

  const extracted = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-extracted-"));
  extractStoredZip(built.package, extracted);
  const result = execFileSync(process.execPath, [path.join(extracted, "super-outer/bin/super-outer.mjs")], { encoding: "utf8" });
  assert.equal(result, "SELF_CONTAINED\n");
});

test("tracked credential files and private-key content stop packaging", () => {
  const root = sourceFixture();
  git(root, "init", "-b", "main");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "Test");
  fs.writeFileSync(path.join(root, "auth.json"), "{}\n");
  git(root, "add", ".");
  assert.throws(() => buildPackage({ root, outputFile: path.join(root, "credential.zip") }), /looks sensitive/);

  fs.unlinkSync(path.join(root, "auth.json"));
  git(root, "add", "-u");
  const privateKeyMarker = ["-----BEGIN", "PRIVATE KEY-----"].join(" ");
  fs.writeFileSync(path.join(root, "README.md"), `${privateKeyMarker}\nnot-a-real-key\n`);
  git(root, "add", "README.md");
  assert.throws(() => buildPackage({ root, outputFile: path.join(root, "private-key.zip") }), /private-key material/);
});

test("tracked credentials are rejected by content even under an ordinary filename", () => {
  const credentials = [
    ["GitHub", ["ghp", "_", "A".repeat(36)].join("")],
    ["GitHub", ["github", "_pat_", "A".repeat(70)].join("")],
    ["Stripe", ["sk", "_live_", "a".repeat(24)].join("")],
    ["AWS", ["AK", "IA", "A".repeat(16)].join("")],
    ["AWS", ["AWS_SECRET_ACCESS", "_KEY=", "a".repeat(40)].join("")],
    ["Slack", ["xox", "b-", "1234567890-abcdefghij"].join("")],
  ];

  for (const [provider, credential] of credentials) {
    const root = sourceFixture();
    fs.writeFileSync(path.join(root, "notes.txt"), `ordinary release notes\n${credential}\n`);
    git(root, "init", "-b", "main");
    git(root, "config", "user.email", "test@example.com");
    git(root, "config", "user.name", "Test");
    git(root, "add", ".");
    assert.throws(
      () => buildPackage({ root, outputFile: path.join(root, "credential.zip") }),
      new RegExp(provider, "i"),
    );
  }
});

test("credential examples and redaction placeholders do not trigger the package scanner", () => {
  const root = sourceFixture();
  fs.writeFileSync(
    path.join(root, "examples.txt"),
    [
      ["ghp", "_<redacted>"].join(""),
      ["sk", "_live_<redacted>"].join(""),
      ["AK", "IA<16-more-characters>"].join(""),
      ["xox", "b-<redacted>"].join(""),
      "AWS_SECRET_ACCESS_KEY=<redacted>",
      "",
    ].join("\n"),
  );
  git(root, "init", "-b", "main");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "Test");
  git(root, "add", ".");
  assert.doesNotThrow(() =>
    buildPackage({ root, outputFile: path.join(root, "redacted-examples.zip") }),
  );
});
