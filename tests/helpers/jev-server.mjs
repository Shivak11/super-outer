// Ported from Super-outer Experimental's tests/helpers/local-server.mjs.
// A real HTTP server on 127.0.0.1 that stands in for OpenRouter in the Jev
// tests. It records every request it receives, so a test can assert on what
// the code under test actually sent, or that it sent nothing.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function startServer(respond) {
  const requests = [];
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let body = null;
      try {
        body = JSON.parse(raw);
      } catch {
        body = raw;
      }
      const seen = { method: request.method, path: request.url, headers: request.headers, body };
      requests.push(seen);
      respond(seen, response);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}/v1/systemone`,
        requests,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections();
            server.close(() => done());
          }),
      });
    });
  });
}

export const json = (response, status, value) => {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(typeof value === "string" ? value : JSON.stringify(value));
};

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "jev");

/** A recorded answer body from tests/fixtures/jev, as a fresh object. */
export const answerFixture = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), "utf8"));

/**
 * Replaces the global fetch with one that refuses every address other than
 * this machine, and returns a function that puts the original back. The Jev
 * client already refuses those addresses under the test runner; this keeps a
 * test file safe when it is run directly with node, outside the runner.
 */
export function refuseRemoteFetch() {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const address = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (address.hostname !== "127.0.0.1" && address.hostname !== "localhost") {
      throw new TypeError(`A test tried to reach ${address.hostname}; only this machine may be reached during tests.`);
    }
    return original(input, init);
  };
  return () => {
    globalThis.fetch = original;
  };
}
