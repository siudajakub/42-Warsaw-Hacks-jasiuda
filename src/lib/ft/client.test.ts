import assert from "node:assert/strict";
import test from "node:test";
import { retryAction } from "@/lib/ft/client";

test("401 refreshes the token once and then fails closed", () => {
  assert.equal(retryAction(401, { auth: 0, rate: 0, server: 0 }), "refresh-token");
  assert.equal(retryAction(401, { auth: 1, rate: 0, server: 0 }), "fail");
});

test("429 retries with its dedicated rate budget and then fails", () => {
  assert.equal(retryAction(429, { auth: 0, rate: 0, server: 0 }), "retry-rate-limit");
  assert.equal(retryAction(429, { auth: 0, rate: 8, server: 0 }), "fail");
});

test("5xx retries with bounded exponential backoff and then fails", () => {
  assert.equal(retryAction(503, { auth: 0, rate: 0, server: 0 }), "retry-server");
  assert.equal(retryAction(503, { auth: 0, rate: 0, server: 4 }), "fail");
});
