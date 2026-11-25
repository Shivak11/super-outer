// Ported from Super-outer Experimental's tests/jev-client.test.mjs; the key file tests moved to tests/jev-settings.test.mjs.
import assert from "node:assert/strict";
import test from "node:test";

import * as client from "../src/jev/client.mjs";
import { json, refuseRemoteFetch, startServer } from "./helpers/jev-server.mjs";

refuseRemoteFetch();

const KEY = "test-key-0123456789";

const questions = {
  surface_made: { type: "noul", instructions: "The request asks for a screen to be created.", criteria: { true: "yes", false: "no" } },
};
const cannedAnswers = { surface_made: { type: "noul", noul: 0.97 } };
const cannedBody = { model: "jev-1.13.0", answers: cannedAnswers, usage: { input_tokens: 712, output_tokens: 0 } };

test("one POST carries the bearer key, the model name, the state and the questions, and the answers come back", async () => {
  const server = await startServer((_, response) => json(response, 200, cannedBody));
  try {
    const result = await client.askJev({ key: KEY, state: "lets plan first", questions, endpoint: server.url });
    assert.equal(server.requests.length, 1);
    const [sent] = server.requests;
    assert.equal(sent.method, "POST");
    assert.equal(sent.path, "/v1/systemone");
    assert.equal(sent.headers.authorization, `Bearer ${KEY}`);
    assert.equal(sent.headers["content-type"], "application/json");
    assert.deepEqual(sent.body, { state: "lets plan first", model: "typesafe/jev-1.13", questions });
    assert.equal(result.ok, true);
    assert.deepEqual(result.answers, cannedAnswers);
    assert.equal(result.model, "jev-1.13.0");
    assert.equal(result.inputTokens, 712);
    assert.equal(typeof result.latencyMs, "number");
  } finally {
    await server.close();
  }
});

test("the endpoint, the model and the time limit are OpenRouter's System One address, typesafe/jev-1.13 and 2.5 seconds", () => {
  assert.equal(client.ENDPOINT, "https://openrouter.ai/api/v1/systemone");
  assert.equal(client.MODEL, "typesafe/jev-1.13");
  assert.equal(client.TIMEOUT_MS, 2500);
});

for (const status of [401, 422, 429, 529, 500]) {
  test(`status ${status} becomes the reason http_${status}, after one attempt, and the key is not in the result`, async () => {
    const server = await startServer((seen, response) => json(response, status, { error: `rejected ${seen.headers.authorization}` }));
    try {
      const result = await client.askJev({ key: KEY, state: "x", questions, endpoint: server.url });
      assert.equal(result.ok, false);
      assert.equal(result.reason, `http_${status}`);
      assert.equal(server.requests.length, 1, "no retry inside the hook");
      assert.equal(JSON.stringify(result).includes(KEY), false);
    } finally {
      await server.close();
    }
  });
}

test("a server that never answers ends as a timeout inside the limit", async () => {
  const server = await startServer(() => {});
  try {
    const started = Date.now();
    const result = await client.askJev({ key: KEY, state: "x", questions, endpoint: server.url, timeoutMs: 150 });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "timeout");
    assert.ok(Date.now() - started < 1500, "returned soon after the limit");
  } finally {
    await server.close();
  }
});

test("a body that is not JSON is malformed", async () => {
  const server = await startServer((_, response) => json(response, 200, "not json at all"));
  try {
    const result = await client.askJev({ key: KEY, state: "x", questions, endpoint: server.url });
    assert.deepEqual([result.ok, result.reason], [false, "malformed"]);
  } finally {
    await server.close();
  }
});

test("a JSON body with no answers is malformed", async () => {
  const server = await startServer((_, response) => json(response, 200, { model: "jev-1.13.0", usage: {} }));
  try {
    const result = await client.askJev({ key: KEY, state: "x", questions, endpoint: server.url });
    assert.deepEqual([result.ok, result.reason], [false, "malformed"]);
  } finally {
    await server.close();
  }
});

test("a port with nothing listening is a network failure", async () => {
  const server = await startServer((_, response) => json(response, 200, cannedBody));
  const deadUrl = server.url;
  await server.close();
  const result = await client.askJev({ key: KEY, state: "x", questions, endpoint: deadUrl });
  assert.deepEqual([result.ok, result.reason], [false, "network"]);
});

test("a redirect is not followed, so the prompt is never posted to a second address", async () => {
  const second = await startServer((_, response) => json(response, 200, cannedBody));
  const first = await startServer((_, response) => {
    response.writeHead(307, { location: second.url });
    response.end();
  });
  try {
    const result = await client.askJev({ key: KEY, state: "lets plan first", questions, endpoint: first.url });
    assert.deepEqual([result.ok, result.reason], [false, "http_307"]);
    assert.equal(first.requests.length, 1);
    assert.equal(second.requests.length, 0);
  } finally {
    await first.close();
    await second.close();
  }
});

test("a model name with an author prefix and a release suffix, as OpenRouter returns it, is kept", async () => {
  const server = await startServer((_, response) => json(response, 200, { ...cannedBody, model: "typesafe/jev-1.13-20260917" }));
  try {
    const result = await client.askJev({ key: KEY, state: "x", questions, endpoint: server.url });
    assert.equal(result.ok, true);
    assert.equal(result.model, "typesafe/jev-1.13-20260917");
  } finally {
    await server.close();
  }
});

test("a model name is an OpenRouter id: a path, a URL, punctuation or a key-shaped string is dropped", async () => {
  const cases = [
    ["typesafe/jev-1.13-20260917", "typesafe/jev-1.13-20260917"],
    ["~typesafe/jev-latest", "~typesafe/jev-latest"],
    ["typesafe/jev-1.13:free", "typesafe/jev-1.13:free"],
    ["jev-1.13.0", "jev-1.13.0"],
    ["../../etc/passwd", ""],
    ["http://evil.test/x", ""],
    ["::::", ""],
    ["~", ""],
    ["/", ""],
    ["a/b/c", ""],
    [`sk-or-v1-${"0123456789abcdef".repeat(4)}`, ""],
  ];
  for (const [given, kept] of cases) {
    const server = await startServer((_, response) => json(response, 200, { ...cannedBody, model: given }));
    try {
      const result = await client.askJev({ key: KEY, state: "x", questions, endpoint: server.url });
      assert.equal(result.ok, true, given);
      assert.equal(result.model, kept, given);
    } finally {
      await server.close();
    }
  }
});

test("a model string is kept only when it reads as a model name, so the key cannot come back inside it", async () => {
  const server = await startServer((seen, response) => json(response, 200, { ...cannedBody, model: `jev-1.13.0 ${seen.headers.authorization}` }));
  try {
    const result = await client.askJev({ key: KEY, state: "x", questions, endpoint: server.url });
    assert.equal(result.ok, true);
    assert.equal(result.model, "");
    assert.equal(JSON.stringify(result).includes(KEY), false);
  } finally {
    await server.close();
  }
});

test("a model name that is the key itself is dropped, although it reads as a model name", async () => {
  const server = await startServer((_, response) => json(response, 200, { ...cannedBody, model: KEY }));
  try {
    const result = await client.askJev({ key: KEY, state: "x", questions, endpoint: server.url });
    assert.deepEqual([result.ok, result.model], [true, ""]);
    assert.equal(JSON.stringify(result).includes(KEY), false);
  } finally {
    await server.close();
  }
});

test("an answer set that repeats the key is malformed, so the key never comes back in a result", async () => {
  const server = await startServer((seen, response) =>
    json(response, 200, { ...cannedBody, answers: { surface_made: { type: "noul", noul: 0.9, note: seen.headers.authorization } } }),
  );
  try {
    const result = await client.askJev({ key: KEY, state: "x", questions, endpoint: server.url });
    assert.deepEqual([result.ok, result.reason], [false, "malformed"]);
    assert.equal(JSON.stringify(result).includes(KEY), false);
  } finally {
    await server.close();
  }
});

// ------------------------------------------------------- endpoint and time limit

// From the 5.8.0 review: an override that is not this machine used to fall
// back to the real service, so a mistyped test address could send a prompt.
// It now gives null, and the call sends nothing.
test("the endpoint is OpenRouter's System One address, and an override must point at this machine", async () => {
  assert.equal(client.resolveEndpoint({}), "https://openrouter.ai/api/v1/systemone");
  assert.equal(client.resolveEndpoint({ SUPER_OUTER_JEV_ENDPOINT: "http://127.0.0.1:4010/v1/systemone" }), "http://127.0.0.1:4010/v1/systemone");
  assert.equal(client.resolveEndpoint({ SUPER_OUTER_JEV_ENDPOINT: "http://localhost:4010/v1/systemone" }), "http://localhost:4010/v1/systemone");
  assert.equal(client.resolveEndpoint({ SUPER_OUTER_JEV_ENDPOINT: "http://[::1]:4010/v1/systemone" }), "http://[::1]:4010/v1/systemone");
  for (const wrong of ["https://collector.example.com/v1/systemone", "https://api.typesafe.ai/v1/systemone", "http://127.0.0.1.example.com/v1", "http://0.0.0.0:4010/v1", "http://localhost.:4010/v1", "not a url"]) {
    assert.equal(client.resolveEndpoint({ SUPER_OUTER_JEV_ENDPOINT: wrong }), null, wrong);
  }
  const refused = await client.askJev({ key: "k", state: "s", questions: {}, endpoint: null, env: {} });
  assert.deepEqual(refused, { ok: false, reason: "endpoint_refused", latencyMs: 0 });
});

test("the time limit can be shortened from the environment and never lengthened", () => {
  assert.equal(client.resolveTimeout({}), 2500);
  assert.equal(client.resolveTimeout({ SUPER_OUTER_JEV_TIMEOUT_MS: "300" }), 300);
  assert.equal(client.resolveTimeout({ SUPER_OUTER_JEV_TIMEOUT_MS: "9000" }), 2500);
  assert.equal(client.resolveTimeout({ SUPER_OUTER_JEV_TIMEOUT_MS: "soon" }), 2500);
  assert.equal(client.resolveTimeout({ SUPER_OUTER_JEV_TIMEOUT_MS: "-5" }), 2500);
});

// ---------------------------------------------------------- the test guard

/**
 * Replaces fetch with a counter for the length of one test. The counter
 * answers like Jev would, so a missing guard shows up as a successful call
 * and never as traffic.
 */
const countingFetch = (t) => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    return new Response(JSON.stringify(cannedBody), { status: 200, headers: { "content-type": "application/json" } });
  };
  t.after(() => {
    globalThis.fetch = original;
  });
  return calls;
};

// Without the guard, askJev would call the counter: the result would be
// { ok: true } and the counter would hold one call, so both assertions below
// fail. A temporary copy of client.mjs with the guard removed was run against
// this file on 7 October 2026, and this test and the next one failed.
test("under the test runner a call to any address other than this machine is refused before fetch is called", async (t) => {
  const calls = countingFetch(t);
  for (const endpoint of [client.ENDPOINT, "https://collector.example.com/v1/systemone", "not a url"]) {
    const result = await client.askJev({ key: KEY, state: "x", questions, endpoint, env: { NODE_TEST_CONTEXT: "child-v8" } });
    assert.deepEqual(result, { ok: false, reason: "test_network_refused", latencyMs: 0 }, endpoint);
  }
  assert.equal(calls.length, 0);
});

test("the guard reads the process's own environment by default, which the test runner sets", async (t) => {
  if (!process.env.NODE_TEST_CONTEXT) return t.skip("NODE_TEST_CONTEXT is set only when this file runs under node --test");
  const calls = countingFetch(t);
  const result = await client.askJev({ key: KEY, state: "x", questions, endpoint: client.ENDPOINT });
  assert.equal(result.reason, "test_network_refused");
  assert.equal(calls.length, 0);
});

test("outside a test run the same call reaches fetch, which shows the guard is what refuses it", async (t) => {
  const calls = countingFetch(t);
  for (const env of [{}, { NODE_TEST_CONTEXT: "" }]) {
    const result = await client.askJev({ key: KEY, state: "x", questions, endpoint: client.ENDPOINT, env });
    assert.equal(result.ok, true);
  }
  assert.deepEqual(calls, [client.ENDPOINT, client.ENDPOINT]);
});

test("under the test runner a call to this machine is still made", async () => {
  const server = await startServer((_, response) => json(response, 200, cannedBody));
  try {
    const result = await client.askJev({ key: KEY, state: "x", questions, endpoint: server.url, env: { NODE_TEST_CONTEXT: "child-v8" } });
    assert.equal(result.ok, true);
    assert.equal(server.requests.length, 1);
  } finally {
    await server.close();
  }
});
