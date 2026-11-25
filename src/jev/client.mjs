// Ported from Super-outer Experimental's jev-route-check (scripts/jev-client.mjs).
/**
 * Jev: the one network call.
 *
 * One POST to OpenRouter's System One endpoint, one attempt, a hard time
 * limit. OpenRouter serves TypeSafe's model Jev with the same request and
 * answer shape as TypeSafe's own endpoint, billed to the key a person placed
 * for Super-outer. Every failure becomes a short reason code. The key never
 * appears in a returned value, because returned values reach the private
 * record and the hook's probe file.
 */

export const ENDPOINT = "https://openrouter.ai/api/v1/systemone";
export const MODEL = "typesafe/jev-1.13";
export const TIMEOUT_MS = 2500;

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const isLocal = (address) => {
  try {
    return LOCAL_HOSTS.has(new URL(address).hostname);
  } catch {
    return false;
  }
};

/**
 * Tests may point the call at this machine, and nowhere else. An override
 * that names any other address gives null, and askJev then sends nothing,
 * so a mistyped test address never reaches the real service.
 */
export function resolveEndpoint(env = process.env) {
  const override = env?.SUPER_OUTER_JEV_ENDPOINT;
  if (!override) return ENDPOINT;
  return isLocal(override) ? override : null;
}

/** The limit can be shortened, for tests. It can never be lengthened. */
export function resolveTimeout(env = process.env) {
  const asked = Number(env?.SUPER_OUTER_JEV_TIMEOUT_MS);
  return Number.isFinite(asked) && asked > 0 && asked < TIMEOUT_MS ? asked : TIMEOUT_MS;
}

// OpenRouter names the model with its author and a release date, as in
// typesafe/jev-1.13-20260917; an alias may start with a tilde and a variant
// may follow a colon. A path, a URL, punctuation alone or a long random
// string is not a model name.
export const MODEL_NAME = /^~?(?:[a-z0-9][a-z0-9._-]{0,40}\/)?[a-z0-9][a-z0-9._-]{0,60}(?::[a-z0-9-]{1,20})?$/i;

/**
 * Node's test runner sets NODE_TEST_CONTEXT in every test process, and a test
 * process on this machine can inherit a real key. While it is set, a call to
 * any address other than this machine is refused before anything is sent.
 */
const underTest = (env) => typeof env?.NODE_TEST_CONTEXT === "string" && env.NODE_TEST_CONTEXT !== "";

export async function askJev({ key, state, questions, model = MODEL, endpoint = ENDPOINT, timeoutMs = TIMEOUT_MS, env = process.env } = {}) {
  if (endpoint === null) return { ok: false, reason: "endpoint_refused", latencyMs: 0 };
  if (underTest(env) && !isLocal(endpoint)) return { ok: false, reason: "test_network_refused", latencyMs: 0 };

  const started = performance.now();
  const failed = (reason) => ({ ok: false, reason, latencyMs: Math.round(performance.now() - started) });
  const timedOut = (error) => error?.name === "TimeoutError" || error?.name === "AbortError";
  const holdsKey = (value) => typeof key === "string" && key !== "" && JSON.stringify(value).includes(key);

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ state, model, questions }),
      // A redirect would post the prompt again to an address nobody checked.
      // It is left unfollowed and reported as its status code.
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    return failed(timedOut(error) ? "timeout" : "network");
  }
  if (!response.ok) return failed(`http_${response.status}`);

  let body;
  try {
    body = await response.json();
  } catch (error) {
    return failed(timedOut(error) ? "timeout" : "malformed");
  }
  if (!body || typeof body.answers !== "object" || body.answers === null) return failed("malformed");
  // An answer set that repeats the key is not used, so the key cannot reach
  // the record or the probe file inside it.
  if (holdsKey(body.answers)) return failed("malformed");
  return {
    ok: true,
    // The record keeps this string, so anything that does not read as a model name is dropped.
    model: typeof body.model === "string" && MODEL_NAME.test(body.model) && !holdsKey(body.model) ? body.model : "",
    answers: body.answers,
    inputTokens: Number.isFinite(body.usage?.input_tokens) ? body.usage.input_tokens : null,
    latencyMs: Math.round(performance.now() - started),
  };
}
