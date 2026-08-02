import assert from "node:assert/strict";
import test from "node:test";
import { parseRequestedScene } from "@/lib/scene-query";

test("scene query maps the three public scenes", () => {
  assert.equal(parseRequestedScene("1"), "shipped");
  assert.equal(parseRequestedScene("2"), "connect");
  assert.equal(parseRequestedScene("3"), "campus");
  assert.equal(parseRequestedScene("4"), null);
});
