import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  authorityRank,
  createRepositoryProfile,
  detectStaleSections,
  hashContent,
  hashSource,
  refreshProfile,
  resolveProfile,
  validateProfile,
} from "../src/profile.mjs";

const fixturePath = new URL("./fixtures/profiles/source-map.json", import.meta.url);

async function makeRepository() {
  const root = await mkdtemp(path.join(tmpdir(), "super-outer-profile-"));
  const sourceMap = JSON.parse(await readFile(fixturePath, "utf8"));
  for (const source of [
    sourceMap.companyAlpha.ui,
    sourceMap.companyAlpha.security,
    sourceMap.companyBeta.ui,
    sourceMap.repository.backend,
  ]) {
    await mkdir(path.dirname(path.join(root, source)), { recursive: true });
    await writeFile(path.join(root, source), `evidence:${source}\n`);
  }
  return { root, sourceMap };
}

test("creates a source-linked profile with real hashes and explicit unknowns", async () => {
  const { root, sourceMap } = await makeRepository();
  const profile = await createRepositoryProfile({
    root,
    sections: {
      ui: {
        status: "EXPLICIT",
        sources: [
          {
            path: sourceMap.companyAlpha.ui,
          },
        ],
        authority: "company-contract",
      },
      backend: {
        status: "OBSERVED",
        sources: [sourceMap.repository.backend],
        authority: "local-precedent",
      },
    },
  });

  assert.equal(validateProfile(profile).valid, true);
  assert.equal(profile.sections.ui.status, "EXPLICIT");
  assert.equal(profile.sections.backend.status, "OBSERVED");
  assert.equal(profile.sections.data.status, "UNKNOWN");
  assert.deepEqual(profile.sections.data.sources, []);
  assert.equal(
    profile.sections.ui.sources[0].sha256,
    await hashSource(root, sourceMap.companyAlpha.ui),
  );
  assert.equal(profile.sections.ui.sources[0].content, undefined);
  assert.deepEqual(Object.keys(profile).sort(), [
    "repository",
    "schema_version",
    "sections",
  ]);
  assert.deepEqual(Object.keys(profile.sections.ui.sources[0]).sort(), [
    "last_checked",
    "path",
    "sha256",
  ]);
});

test("changed source remains stale until an explicit section reread accepts it", async () => {
  const { root, sourceMap } = await makeRepository();
  const profile = await createRepositoryProfile({
    root,
    sections: {
      ui: {
        status: "EXPLICIT",
        authority: "repository-contract",
        sources: [sourceMap.companyAlpha.ui],
      },
      backend: {
        status: "OBSERVED",
        authority: "local-precedent",
        sources: [sourceMap.repository.backend],
      },
    },
  });
  await writeFile(path.join(root, sourceMap.companyAlpha.ui), "new visual rules\n");

  const freshness = await detectStaleSections(profile, { root });
  assert.deepEqual(freshness.staleSections, ["ui"]);
  assert.equal(freshness.sections.backend.stale, false);

  const stillStale = await refreshProfile(profile, { root });
  assert.deepEqual(stillStale.changedSections, []);
  assert.deepEqual(stillStale.pendingRereadSections, ["ui"]);
  assert.deepEqual(stillStale.staleSections, ["ui"]);
  assert.equal(
    stillStale.profile.sections.ui.sources[0].sha256,
    profile.sections.ui.sources[0].sha256,
  );

  const rereadCalls = [];
  const refreshed = await refreshProfile(profile, {
    root,
    rereadSection: async (request) => {
      rereadCalls.push(request);
      return {
        accepted: true,
        status: "EXPLICIT",
        authority: "repository-contract",
        summary: "The updated repository-native visual and motion contract.",
      };
    },
  });
  assert.deepEqual(refreshed.changedSections, ["ui"]);
  assert.deepEqual(refreshed.pendingRereadSections, []);
  assert.deepEqual(refreshed.staleSections, []);
  assert.equal(rereadCalls.length, 1);
  assert.equal(rereadCalls[0].sectionId, "ui");
  assert.deepEqual(
    rereadCalls[0].changedSources.map(({ path: source }) => source),
    [sourceMap.companyAlpha.ui],
  );
  assert.equal(
    refreshed.profile.sections.backend.sources[0].sha256,
    profile.sections.backend.sources[0].sha256,
  );
  assert.equal(
    refreshed.profile.sections.ui.sources[0].sha256,
    hashContent("new visual rules\n"),
  );
  assert.equal(
    refreshed.profile.sections.ui.summary,
    "The updated repository-native visual and motion contract.",
  );
});

test("a reread must explicitly reclassify changed evidence", async () => {
  const { root, sourceMap } = await makeRepository();
  const profile = await createRepositoryProfile({
    root,
    sections: {
      backend: {
        status: "OBSERVED",
        authority: "local-precedent",
        summary: "Old observed behavior.",
        sources: [sourceMap.repository.backend],
      },
    },
  });
  await writeFile(path.join(root, sourceMap.repository.backend), "changed api\n");

  await assert.rejects(
    refreshProfile(profile, {
      root,
      rereadSection: async () => ({ accepted: true }),
    }),
    /must classify its status/,
  );
  const refreshed = await refreshProfile(profile, {
    root,
    rereadSection: async () => ({
      accepted: true,
      status: "OBSERVED",
      authority: "local-precedent",
    }),
  });
  assert.equal(refreshed.profile.sections.backend.status, "OBSERVED");
  assert.equal(refreshed.profile.sections.backend.summary, undefined);
});

test("explicit evidence requires named authority and observation cannot masquerade as policy", async () => {
  const { root, sourceMap } = await makeRepository();
  await assert.rejects(
    createRepositoryProfile({
      root,
      sections: {
        ui: {
          status: "EXPLICIT",
          sources: [sourceMap.companyAlpha.ui],
        },
      },
    }),
    /EXPLICIT section requires an explicit authority/,
  );
  await assert.rejects(
    createRepositoryProfile({
      root,
      sections: {
        backend: {
          status: "OBSERVED",
          authority: "company-contract",
          sources: [sourceMap.repository.backend],
        },
      },
    }),
    /OBSERVED evidence cannot claim policy authority/,
  );

  const profile = await createRepositoryProfile({
    root,
    sections: {
      backend: {
        status: "OBSERVED",
        authority: "local-precedent",
        sources: [sourceMap.repository.backend],
      },
    },
  });
  const contradictoryExplicit = structuredClone(profile);
  contradictoryExplicit.sections.backend.status = "EXPLICIT";
  contradictoryExplicit.sections.backend.authority = "unknown";
  assert.equal(validateProfile(contradictoryExplicit).valid, false);
  assert.match(
    validateProfile(contradictoryExplicit).errors.join("\n"),
    /EXPLICIT evidence requires a named non-unknown authority/,
  );

  const contradictoryObserved = structuredClone(profile);
  contradictoryObserved.sections.backend.authority = "binding";
  assert.equal(validateProfile(contradictoryObserved).valid, false);
  assert.match(
    validateProfile(contradictoryObserved).errors.join("\n"),
    /OBSERVED evidence cannot claim policy authority binding/,
  );
});

test("a profile cannot hide an engineering area by omitting its section", async () => {
  const { root } = await makeRepository();
  const profile = await createRepositoryProfile({ root });
  delete profile.sections.security;
  profile.sections.unlisted = {
    status: "UNKNOWN",
    authority: "unknown",
    sources: [],
  };

  const validation = validateProfile(profile);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join("\n"), /missing profile section: security/);
  assert.match(validation.errors.join("\n"), /unknown profile section: unlisted/);
});

test("a missing source stays stale and is never silently accepted", async () => {
  const { root, sourceMap } = await makeRepository();
  const profile = await createRepositoryProfile({
    root,
    sections: {
      security: {
        status: "EXPLICIT",
        authority: "company-contract",
        sources: [sourceMap.companyAlpha.security],
      },
    },
  });
  const missingPath = path.join(root, sourceMap.companyAlpha.security);
  const { rm } = await import("node:fs/promises");
  await rm(missingPath);

  const result = await refreshProfile(profile, { root });
  assert.deepEqual(result.changedSections, []);
  assert.deepEqual(result.staleSections, ["security"]);
  assert.deepEqual(result.missingSources, [
    { sectionId: "security", path: sourceMap.companyAlpha.security },
  ]);
  assert.equal(
    result.profile.sections.security.sources[0].sha256,
    profile.sections.security.sources[0].sha256,
  );
});

test("resolves company inheritance and keeps observed evidence observed", async () => {
  const { root, sourceMap } = await makeRepository();
  const company = await createRepositoryProfile({
    root,
    sections: {
      ui: {
        status: "EXPLICIT",
        authority: "company-contract",
        sources: [sourceMap.companyAlpha.ui],
      },
      security: {
        status: "OBSERVED",
        authority: "local-precedent",
        sources: [sourceMap.companyAlpha.security],
      },
    },
  });
  const companyPath = "profiles/company-alpha.json";
  await mkdir(path.dirname(path.join(root, companyPath)), { recursive: true });
  await writeFile(path.join(root, companyPath), JSON.stringify(company));
  const repository = await createRepositoryProfile({
    root,
    extends: companyPath,
    sections: {
      backend: {
        status: "EXPLICIT",
        authority: "repository-contract",
        sources: [sourceMap.repository.backend],
      },
    },
  });

  const resolved = await resolveProfile(repository, { root });
  assert.equal(resolved.sections.ui.status, "EXPLICIT");
  assert.equal(resolved.sections.security.status, "OBSERVED");
  assert.equal(resolved.sections.backend.status, "EXPLICIT");
  assert.equal(resolved.extends, undefined);
});

test("separate inheritance calls cannot leak one company's design evidence", async () => {
  const { root, sourceMap } = await makeRepository();
  const alpha = await createRepositoryProfile({
    root,
    sections: {
      ui: {
        status: "EXPLICIT",
        authority: "company-contract",
        sources: [sourceMap.companyAlpha.ui],
      },
    },
  });
  const beta = await createRepositoryProfile({
    root,
    sections: {
      ui: {
        status: "EXPLICIT",
        authority: "company-contract",
        sources: [sourceMap.companyBeta.ui],
      },
    },
  });
  await mkdir(path.join(root, "profiles"), { recursive: true });
  await writeFile(path.join(root, "profiles/alpha.json"), JSON.stringify(alpha));
  await writeFile(path.join(root, "profiles/beta.json"), JSON.stringify(beta));
  const alphaRepo = await createRepositoryProfile({
    root,
    extends: "profiles/alpha.json",
  });
  const betaRepo = await createRepositoryProfile({
    root,
    extends: "profiles/beta.json",
  });

  const [resolvedAlpha, resolvedBeta] = await Promise.all([
    resolveProfile(alphaRepo, { root }),
    resolveProfile(betaRepo, { root }),
  ]);
  assert.deepEqual(
    resolvedAlpha.sections.ui.sources.map(({ path: source }) => source),
    [sourceMap.companyAlpha.ui],
  );
  assert.deepEqual(
    resolvedBeta.sections.ui.sources.map(({ path: source }) => source),
    [sourceMap.companyBeta.ui],
  );
});

test("observed repository precedent cannot downgrade an explicit company contract", async () => {
  const { root, sourceMap } = await makeRepository();
  const company = await createRepositoryProfile({
    root,
    sections: {
      ui: {
        status: "EXPLICIT",
        authority: "company-contract",
        summary: "Company policy text.",
        sources: [sourceMap.companyAlpha.ui],
      },
    },
  });
  await writeFile(path.join(root, "company.json"), JSON.stringify(company));
  const repository = await createRepositoryProfile({
    root,
    extends: "company.json",
    sections: {
      ui: {
        status: "OBSERVED",
        authority: "local-precedent",
        summary: "Observed repository pattern.",
        sources: [sourceMap.companyBeta.ui],
      },
    },
  });
  const resolved = await resolveProfile(repository, { root });
  assert.equal(resolved.sections.ui.status, "EXPLICIT");
  assert.equal(resolved.sections.ui.authority, "company-contract");
  assert.equal(resolved.sections.ui.summary, "Company policy text.");
  assert.deepEqual(
    resolved.sections.ui.sources.map(({ path: source }) => source),
    [sourceMap.companyAlpha.ui],
  );
});

test("canonical containment rejects source and inheritance symlinks outside the repository", async () => {
  const { root } = await makeRepository();
  const outside = await mkdtemp(path.join(tmpdir(), "super-outer-profile-outside-"));
  await writeFile(path.join(outside, "secret.txt"), "private evidence\n");
  await symlink(path.join(outside, "secret.txt"), path.join(root, "linked-secret.txt"));

  await assert.rejects(
    createRepositoryProfile({
      root,
      sections: {
        security: {
          status: "EXPLICIT",
          authority: "repository-contract",
          sources: ["linked-secret.txt"],
        },
      },
    }),
    /resolves outside the repository root/,
  );

  const externalParent = await createRepositoryProfile({ root: outside });
  await writeFile(path.join(outside, "parent.json"), JSON.stringify(externalParent));
  await symlink(path.join(outside, "parent.json"), path.join(root, "linked-parent.json"));
  const child = await createRepositoryProfile({ root, extends: "linked-parent.json" });
  await assert.rejects(
    resolveProfile(child, { root }),
    /extends path resolves outside the repository root/,
  );
});

test("rejects traversal and inheritance cycles", async () => {
  const { root } = await makeRepository();
  await assert.rejects(
    createRepositoryProfile({
      root,
      sections: {
        ui: {
          status: "EXPLICIT",
          authority: "repository-contract",
          sources: ["../secret"],
        },
      },
    }),
    /escapes the repository root/,
  );

  const first = await createRepositoryProfile({ root, extends: "second.json" });
  const second = await createRepositoryProfile({ root, extends: "first.json" });
  await writeFile(path.join(root, "first.json"), JSON.stringify(first));
  await writeFile(path.join(root, "second.json"), JSON.stringify(second));
  await assert.rejects(resolveProfile(first, { root }), /inheritance cycle/);

  const malicious = structuredClone(first);
  malicious.extends = "../outside.json";
  assert.equal(validateProfile(malicious).valid, false);
  assert.match(validateProfile(malicious).errors.join("\n"), /repository root/);
});

test("authority ranks implement the documented order", () => {
  assert.ok(authorityRank("binding") < authorityRank("company-contract"));
  assert.ok(authorityRank("company-contract") < authorityRank("official-platform"));
  assert.ok(authorityRank("local-precedent") < authorityRank("external-style-gap-fill"));
  assert.equal(authorityRank("not-real"), Number.POSITIVE_INFINITY);
});
