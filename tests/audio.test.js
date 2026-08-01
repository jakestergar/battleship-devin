// src/audio.js is a purely additive layer: every export must be a no-op when
// Web Audio (or localStorage) is unavailable or throws, and must never let a
// failure escape into the turn loop (planning/battleship-prd.md §5).
//
// The module caches a single AudioContext for the life of the process, so
// these tests are ordered: the "no Web Audio" case runs before any context
// can be created, and the shared context is installed once after it.
import test from "node:test";
import assert from "node:assert/strict";

import {
  initAudio,
  isMuted,
  playEffect,
  setMuted,
  startMusic,
  stopMusic,
  toggleMuted,
} from "../src/audio.js";
import {
  createFakeAudioContext,
  installFakeLocalStorage,
  installFakeWindow,
} from "./helpers/fake-audio.js";

const EFFECT_NAMES = [
  "fire",
  "miss",
  "hit",
  "sunk",
  "place",
  "rotate",
  "invalid",
  "victory",
  "defeat",
];

function installFakeIntervals() {
  const previousSet = globalThis.setInterval;
  const previousClear = globalThis.clearInterval;
  const timers = new Map();
  let nextId = 1;
  globalThis.setInterval = (fn, delay) => {
    const id = nextId++;
    timers.set(id, { fn, delay });
    return id;
  };
  globalThis.clearInterval = (id) => timers.delete(id);
  return {
    timers,
    tick() {
      [...timers.values()].forEach(({ fn }) => fn());
    },
    restore() {
      globalThis.setInterval = previousSet;
      globalThis.clearInterval = previousClear;
    },
  };
}

test("every export is a no-op when Web Audio is unavailable", () => {
  const win = installFakeWindow(null);
  const storage = installFakeLocalStorage();
  const intervals = installFakeIntervals();
  try {
    assert.equal(initAudio(), false);
    startMusic();
    assert.equal(intervals.timers.size, 0, "no music loop without an AudioContext");
    for (const name of EFFECT_NAMES) playEffect(name);
    stopMusic();
  } finally {
    intervals.restore();
    storage.restore();
    win.restore();
  }
});

test("initAudio restores the persisted mute preference, defaulting to unmuted", () => {
  const storage = installFakeLocalStorage({ initial: { "battleship:muted": "true" } });
  try {
    assert.equal(initAudio(), true);
    assert.equal(isMuted(), true);
  } finally {
    storage.restore();
  }

  const empty = installFakeLocalStorage();
  try {
    assert.equal(initAudio(), false);
    assert.equal(isMuted(), false);
  } finally {
    empty.restore();
  }
});

test("mute state survives storage that throws", () => {
  const storage = installFakeLocalStorage({ broken: true });
  try {
    assert.equal(initAudio(), false);
    assert.equal(setMuted(true), true);
    assert.equal(isMuted(), true);
    assert.equal(toggleMuted(), false);
    assert.equal(isMuted(), false);
  } finally {
    storage.restore();
  }
});

// From here on a single fake AudioContext backs the module, matching how the
// real module caches one context for the page's lifetime.
const ctx = createFakeAudioContext({ state: "suspended" });
const win = installFakeWindow(ctx);
const storage = installFakeLocalStorage();
test.after(() => {
  stopMusic();
  storage.restore();
  win.restore();
});

test("startMusic builds the drone and melody loop exactly once", () => {
  const intervals = installFakeIntervals();
  try {
    initAudio();
    startMusic();

    // Four pad voices, each with an LFO, plus the first melody note.
    assert.equal(ctx.created.oscillators.length, 9);
    assert.equal(ctx.resumeCount, 1, "a suspended context must be resumed");
    assert.equal(intervals.timers.size, 1);
    assert.equal([...intervals.timers.values()][0].delay, 2400);

    startMusic();
    assert.equal(ctx.created.oscillators.length, 9, "startMusic must be idempotent");

    intervals.tick();
    assert.equal(ctx.created.oscillators.length, 10, "each beat plays one melody note");

    stopMusic();
    assert.equal(intervals.timers.size, 0);
    stopMusic();
  } finally {
    intervals.restore();
  }
});

test("the melody loop stops itself instead of throwing when a note fails", () => {
  const intervals = installFakeIntervals();
  try {
    startMusic();
    ctx.failNodeCreation("oscillator pool exhausted");
    intervals.tick();
    assert.equal(intervals.timers.size, 0, "a failed note must tear the loop down");
  } finally {
    ctx.failNodeCreation(null);
    stopMusic();
    intervals.restore();
  }
});

test("every named effect synthesizes something and unknown names are ignored", () => {
  setMuted(false);
  for (const name of EFFECT_NAMES) {
    const before = {
      oscillators: ctx.created.oscillators.length,
      sources: ctx.created.sources.length,
    };
    playEffect(name);
    assert.ok(
      ctx.created.oscillators.length > before.oscillators ||
        ctx.created.sources.length > before.sources,
      `effect "${name}" produced no audio nodes`
    );
  }

  const before = ctx.created.oscillators.length + ctx.created.sources.length;
  playEffect("no-such-effect");
  playEffect(undefined);
  assert.equal(ctx.created.oscillators.length + ctx.created.sources.length, before);
});

test("noise effects fill a decaying buffer through a swept filter", () => {
  setMuted(false);
  const before = ctx.created.buffers.length;
  playEffect("miss");

  assert.equal(ctx.created.buffers.length, before + 1);
  const buffer = ctx.created.buffers[before];
  assert.equal(buffer.frames, Math.floor(ctx.sampleRate * 0.5));
  const data = buffer.getChannelData(0);
  assert.ok(data.some((sample) => sample !== 0), "the noise buffer should be filled");
  assert.ok(
    Math.abs(data[data.length - 1]) < 1e-3,
    "the noise envelope should decay to silence"
  );

  const filter = ctx.created.filters[ctx.created.filters.length - 1];
  assert.equal(filter.type, "lowpass");
  assert.deepEqual(
    ctx.automation
      .filter((entry) => entry.param === "filterFrequency")
      .slice(-2)
      .map((entry) => entry.value),
    [1400, 220]
  );
});

test("muting silences the master bus and skips effect synthesis", () => {
  assert.equal(setMuted(true), true);
  assert.equal(isMuted(), true);
  const master = ctx.created.gains[0];
  assert.equal(master.gain.value, 0);

  const before = ctx.created.oscillators.length;
  playEffect("hit");
  assert.equal(ctx.created.oscillators.length, before, "muted effects must not synthesize");

  assert.equal(toggleMuted(), false);
  assert.equal(master.gain.value, 0.9);
  playEffect("hit");
  assert.ok(ctx.created.oscillators.length > before);
});

test("a failing effect never escapes into the turn loop", () => {
  setMuted(false);
  ctx.failNodeCreation("audio hardware unplugged");
  try {
    for (const name of EFFECT_NAMES) playEffect(name);
  } finally {
    ctx.failNodeCreation(null);
  }
});
