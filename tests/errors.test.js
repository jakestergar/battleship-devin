import test from "node:test";
import assert from "node:assert/strict";

import { attempt, reportError } from "../src/errors.js";

function captureConsoleErrors(fn) {
  const original = console.error;
  const calls = [];
  console.error = (...args) => calls.push(args);
  try {
    fn();
  } finally {
    console.error = original;
  }
  return calls;
}

test("reportError logs the scope and the message, and never throws", () => {
  const calls = captureConsoleErrors(() => {
    reportError("audio: starting the music", new Error("no context"));
    reportError("ui: rendering", "a plain string");
    reportError("ui: rendering", undefined);
  });

  assert.equal(calls.length, 3);
  assert.match(calls[0][0], /audio: starting the music failed: no context/);
  assert.ok(calls[0][1] instanceof Error);
  assert.match(calls[1][0], /a plain string/);
  assert.ok(calls[1][1] instanceof Error, "non-Errors are wrapped");
});

test("reportError survives a console that itself throws", () => {
  const original = console.error;
  console.error = () => {
    throw new Error("console is gone");
  };
  try {
    assert.doesNotThrow(() => reportError("ui: rendering", new Error("boom")));
  } finally {
    console.error = original;
  }
});

test("attempt returns the value on success and the fallback on failure", () => {
  assert.equal(
    attempt("ui: rendering", () => 42),
    42
  );

  const boom = () => {
    throw new Error("boom");
  };
  let withFallback;
  let withoutFallback;
  const logged = captureConsoleErrors(() => {
    withFallback = attempt("ui: rendering", boom, "fallback");
    withoutFallback = attempt("ui: rendering", boom);
  });

  assert.equal(withFallback, "fallback");
  assert.equal(withoutFallback, undefined, "the fallback defaults to undefined");
  assert.equal(logged.length, 2, "contained failures are still reported");
});
