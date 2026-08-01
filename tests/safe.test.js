// Tests src/safe.js — the guard every additive layer is wrapped in.
import test from "node:test";
import assert from "node:assert/strict";

import { attempt } from "../src/safe.js";

test("attempt returns the value when nothing throws", () => {
  assert.equal(attempt(() => 42), 42);
});

test("attempt swallows a throw and falls back", () => {
  const boom = () => {
    throw new Error("layer failed");
  };
  assert.equal(attempt(boom), undefined);
  assert.equal(attempt(boom, () => "fallback"), "fallback");
});
