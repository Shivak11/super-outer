import { onPayPressed } from "./pay-submit-safe";
test("sending the same key twice charges once", async () => {
  const calls: string[] = [];
  global.fetch = (async (_u: string, init: any) => { calls.push(init.headers["Idempotency-Key"]); return { json: async () => ({ ok: true }) }; }) as any;
  await onPayPressed("u1", "pro", "k1", () => {});
  await onPayPressed("u1", "pro", "k1", () => {});
  expect(new Set(calls).size).toBe(1);
});
