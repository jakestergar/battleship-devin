import test from "node:test";
import assert from "node:assert/strict";

import { noteToFreq, pulseCoefficients, TRACK } from "../src/chiptune.js";

test("noteToFreq anchors on A4 = 440Hz", () => {
  assert.equal(Math.round(noteToFreq("A4")), 440);
});

test("noteToFreq doubles every octave", () => {
  assert.ok(Math.abs(noteToFreq("A5") - 880) < 0.001);
  assert.ok(Math.abs(noteToFreq("A3") - 220) < 0.001);
  assert.ok(Math.abs(noteToFreq("A2") - 110) < 0.001);
});

test("noteToFreq handles accidentals and known reference pitches", () => {
  // Middle C is ~261.63Hz; C#4 is one equal-tempered semitone above it.
  assert.ok(Math.abs(noteToFreq("C4") - 261.6256) < 0.001);
  assert.ok(Math.abs(noteToFreq("C#4") - noteToFreq("C4") * Math.pow(2, 1 / 12)) < 1e-9);
  // Enharmonic equivalence must hold.
  assert.ok(Math.abs(noteToFreq("Db4") - noteToFreq("C#4")) < 1e-9);
});

test("noteToFreq returns null for rests and malformed input", () => {
  for (const bad of [null, undefined, "", "H4", "A", "A#", "4A"]) {
    assert.equal(noteToFreq(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test("a 50% duty pulse is a square wave: every even harmonic vanishes", () => {
  const imag = pulseCoefficients(0.5, 24);
  for (let n = 2; n <= 24; n += 2) {
    assert.ok(Math.abs(imag[n]) < 1e-6, `harmonic ${n} should be ~0, got ${imag[n]}`);
  }
  // ...and the odd ones must not.
  for (let n = 1; n <= 23; n += 2) {
    assert.ok(Math.abs(imag[n]) > 1e-3, `harmonic ${n} should be non-zero`);
  }
});

test("a 12.5% duty pulse nulls every 8th harmonic and keeps the rest", () => {
  // For duty d, harmonic n has amplitude proportional to sin(n*pi*d), so the
  // nulls land on multiples of 1/d. At d = 1/8 that is harmonics 8, 16, 24 —
  // and crucially NOT the even harmonics in between, which is what gives the
  // narrow pulse its reedy, un-square timbre.
  const imag = pulseCoefficients(0.125, 24);
  for (const n of [8, 16, 24]) {
    assert.ok(Math.abs(imag[n]) < 1e-6, `harmonic ${n} should be a null, got ${imag[n]}`);
  }
  for (const n of [2, 4, 6, 10, 12, 14]) {
    assert.ok(Math.abs(imag[n]) > 1e-3, `harmonic ${n} should survive, got ${imag[n]}`);
  }
});

test("all four channels are the same length and loop cleanly", () => {
  const { LEAD, HARMONY, BASS, DRUMS, TOTAL_STEPS } = TRACK;
  assert.equal(LEAD.length, TOTAL_STEPS);
  assert.equal(HARMONY.length, TOTAL_STEPS);
  assert.equal(BASS.length, TOTAL_STEPS);
  assert.equal(DRUMS.length, TOTAL_STEPS);
  // Two bars of 4/4 at 16th-note resolution.
  assert.equal(TOTAL_STEPS % 16, 0);
});

test("every pitched note in the track is parseable", () => {
  for (const channel of ["LEAD", "HARMONY", "BASS"]) {
    for (const note of TRACK[channel]) {
      if (note === null) continue;
      assert.ok(
        typeof noteToFreq(note) === "number",
        `${channel} contains unparseable note ${JSON.stringify(note)}`
      );
    }
  }
});

test("drum channel only uses known voices", () => {
  for (const hit of TRACK.DRUMS) {
    if (hit === null) continue;
    assert.ok(["K", "S", "h"].includes(hit), `unknown drum voice ${JSON.stringify(hit)}`);
  }
});

test("bass stays below the lead so the mix does not collide", () => {
  const pitched = (a) => a.filter(Boolean).map(noteToFreq);
  const maxBass = Math.max(...pitched(TRACK.BASS));
  const minLead = Math.min(...pitched(TRACK.LEAD));
  assert.ok(maxBass < minLead, `bass peak ${maxBass}Hz should sit under lead floor ${minLead}Hz`);
});

test("tempo constant is a sane 16th-note duration", () => {
  // 132 BPM -> a 16th note is ~0.1136s. Guard against an accidental 10x.
  assert.ok(TRACK.STEP_SECONDS > 0.05 && TRACK.STEP_SECONDS < 0.25);
});
