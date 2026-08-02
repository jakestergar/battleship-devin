// Procedurally synthesized music and sound effects via the Web Audio API.
// No binary assets (the game ships as static files on GitHub Pages), and no
// game logic: every export is a no-op if Web Audio is unavailable, blocked by
// the browser's autoplay policy, or throws — audio is a purely additive
// layer and must never break gameplay (see planning/battleship-prd.md §5).

import { createChiptune } from "./chiptune.js";
import { createScore } from "./score.js";

const STORAGE_KEY = "battleship:muted";
const TRACK_KEY = "battleship:track";

// Three tracks:
//   "score" — the game's own score: a dark, slow minor progression with a
//             sub-bass drone, heartbeat pulse and sonar pings. See score.js
//             for why the three earlier attempts were wrong.
//   "chip"  — NES-style 2A03 synthesis, see chiptune.js.
//   "naval" — the original ambient sonar drone kept below.
// All three are synthesized; the project ships no audio files.
const TRACKS = ["score", "chip", "naval"];

// A minor-ish naval drone: root, fifth, minor third, octave (Hz).
const PAD_VOICES = [98, 146.83, 174.61, 196];
const BEAT_MS = 2400;

// Sonar melody over the pad, as semitone offsets from A3 (null = rest).
const MELODY = [0, 7, 3, 10, 5, 0, 8, 3];
const MELODY_ROOT = 220;

let ctx = null;
let master = null;
let musicGain = null;
let melodyTimer = null;
let melodyStep = 0;
let muted = false;
let started = false;
let chiptune = null;
let score = null;
let track = "score";

function readStoredMute() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function readStoredTrack() {
  try {
    const stored = localStorage.getItem(TRACK_KEY);
    return TRACKS.includes(stored) ? stored : "score";
  } catch {
    return "score";
  }
}

function storeTrack(value) {
  try {
    localStorage.setItem(TRACK_KEY, value);
  } catch {
    /* private mode / disabled storage — the choice just isn't remembered */
  }
}

function storeMute(value) {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    /* private mode / disabled storage — mute is just not remembered */
  }
}

function ensureContext() {
  if (ctx) return ctx;
  const Ctor =
    typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!Ctor) return null;
  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.9;

  // A limiter on the way out. The layered effects deliberately stack several
  // sources at the same instant — an explosion is a crack plus a body plus a
  // sub boom — and those peaks sum past 1.0, which digital audio renders as
  // harsh clipping rather than as loudness. A fast, high-ratio compressor
  // catches the transients so the layering can stay aggressive without
  // distorting, and every effect does not have to be hand-balanced against
  // every other one.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 4;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.18;
  master.connect(limiter).connect(ctx.destination);
  musicGain = ctx.createGain();
  musicGain.gain.value = 0.14;
  musicGain.connect(master);
  return ctx;
}

function semitone(root, steps) {
  return root * Math.pow(2, steps / 12);
}

/** One plucked sonar tone on the music bus. */
function playPadNote(freq, at, duration) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(0.5, at + 0.08);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(gain).connect(musicGain);
  osc.start(at);
  osc.stop(at + duration + 0.05);
}

function startPadDrone() {
  const now = ctx.currentTime;
  for (const freq of PAD_VOICES) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.16, now + 3);
    // Slow detune wobble so the drone breathes instead of sitting still.
    lfo.frequency.value = 0.05 + Math.random() * 0.06;
    lfoGain.gain.value = 0.6;
    lfo.connect(lfoGain).connect(osc.frequency);
    osc.connect(gain).connect(musicGain);
    osc.start(now);
    lfo.start(now);
  }
}

function stepMelody() {
  try {
    const step = MELODY[melodyStep % MELODY.length];
    melodyStep++;
    if (step !== null) {
      playPadNote(semitone(MELODY_ROOT, step), ctx.currentTime + 0.02, 1.8);
    }
  } catch {
    stopMusic();
  }
}

/**
 * Starts the background music. Must be called from a user gesture (click /
 * keypress) or the browser's autoplay policy will keep the context suspended.
 */
export function startMusic() {
  try {
    if (!ensureContext()) return;
    if (ctx.state === "suspended") ctx.resume();
    if (started) return;
    started = true;
    // musicGain's 0.14 was tuned for the ambient drone, which is a continuous
    // bed sitting under everything. The score and the chiptune are foreground
    // music and need considerably more level.
    try {
      musicGain.gain.value = track === "naval" ? 0.14 : 0.45;
    } catch {
      /* gain node gone; the track will still play at whatever level it has */
    }
    if (track === "score") {
      if (!score) score = createScore(ctx, musicGain);
      score.start();
    } else if (track === "chip") {
      if (!chiptune) chiptune = createChiptune(ctx, musicGain);
      chiptune.start();
    } else {
      startPadDrone();
      stepMelody();
      melodyTimer = setInterval(stepMelody, BEAT_MS);
    }
  } catch {
    started = false;
  }
}

export function stopMusic() {
  try {
    if (melodyTimer) clearInterval(melodyTimer);
    if (chiptune) chiptune.stop();
    if (score) score.stop();
  } catch {
    /* nothing to clean up */
  }
  melodyTimer = null;
}

export function getMusicTrack() {
  return track;
}

/**
 * Switches tracks. The sonar drone's oscillators run for the lifetime of the
 * context and cannot be torn down cleanly, so switching away from "naval"
 * only silences its scheduler — a full teardown would need the drone rebuilt
 * as a disposable graph, which is not worth it for a two-track toggle.
 */
export function setMusicTrack(next) {
  if (!TRACKS.includes(next)) return track;
  if (next === track) return track;
  stopMusic();
  track = next;
  storeTrack(track);
  started = false;
  startMusic();
  return track;
}

export function toggleMusicTrack() {
  return setMusicTrack(track === "chip" ? "naval" : "chip");
}

/**
 * Noise burst shaped by a filter — the basis of splashes and explosions.
 *
 * `delay` lets one effect be built from several bursts arriving in sequence
 * (a cannon is a crack, then a body, then a sub thump), and `attack` keeps a
 * burst from clicking when it is meant to swell rather than snap.
 */
function playNoise({
  duration,
  peak,
  filter,
  frequency,
  sweepTo,
  q = 1,
  delay = 0,
  attack = 0.002,
  shape = "decay",
}) {
  const at = ctx.currentTime + delay;
  const frames = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    const t = i / frames;
    // "decay" is a straight fade for transients; "boom" holds the body
    // briefly before falling away, which is what makes an explosion read as
    // an explosion rather than as a click.
    const envelope = shape === "boom" ? Math.pow(1 - t, 1.7) : 1 - t;
    data[i] = (Math.random() * 2 - 1) * envelope;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const biquad = ctx.createBiquadFilter();
  biquad.type = filter;
  biquad.frequency.setValueAtTime(frequency, at);
  biquad.Q.value = q;
  if (typeof sweepTo === "number") {
    biquad.frequency.exponentialRampToValueAtTime(sweepTo, at + duration);
  }
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(peak, at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  source.connect(biquad).connect(gain).connect(master);
  source.start(at);
}

/**
 * The shell in flight: a descending whistle with a little vibrato, band-passed
 * so it reads as air rather than as a synth tone. Swells in and fades out so
 * it sits under the cannon's tail instead of interrupting it.
 */
function playWhistle({ from = 2100, to = 620, duration = 0.5, peak = 0.1, delay = 0 }) {
  const at = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const band = ctx.createBiquadFilter();
  const vibrato = ctx.createOscillator();
  const vibratoDepth = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(to, at + duration);

  vibrato.frequency.value = 11;
  vibratoDepth.gain.value = 18;
  vibrato.connect(vibratoDepth).connect(osc.frequency);

  band.type = "bandpass";
  band.frequency.setValueAtTime(from, at);
  band.frequency.exponentialRampToValueAtTime(to, at + duration);
  band.Q.value = 2.2;

  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(peak, at + duration * 0.25);
  gain.gain.setValueAtTime(peak, at + duration * 0.6);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);

  osc.connect(band).connect(gain).connect(master);
  osc.start(at);
  vibrato.start(at);
  osc.stop(at + duration + 0.05);
  vibrato.stop(at + duration + 0.05);
}

const EFFECTS = {
  // A cannon is three sounds inside 400ms: the crack of the charge, the body
  // of the report, and the sub-bass thump you feel. Layering them is what
  // separates a gun from a beep. The whistle follows the shell into the air
  // and is timed to run out roughly as the missile animation lands.
  fire: () => {
    playNoise({ duration: 0.05, peak: 0.45, filter: "highpass", frequency: 2600, attack: 0.001 });
    playNoise({
      duration: 0.34,
      peak: 0.5,
      filter: "lowpass",
      frequency: 900,
      sweepTo: 90,
      shape: "boom",
      attack: 0.004,
    });
    playTone({ type: "sine", from: 130, to: 38, duration: 0.4, peak: 0.42 });
    playWhistle({ from: 2000, to: 640, duration: 0.5, peak: 0.09, delay: 0.13 });
  },

  // Splash: the plunk of displacement, then the burst of water, then spray.
  miss: () => {
    playTone({ type: "sine", from: 440, to: 120, duration: 0.13, peak: 0.22 });
    playNoise({
      duration: 0.34,
      peak: 0.42,
      filter: "bandpass",
      frequency: 900,
      sweepTo: 220,
      q: 0.9,
    });
    playNoise({
      duration: 0.5,
      peak: 0.16,
      filter: "highpass",
      frequency: 2400,
      delay: 0.05,
    });
  },

  // Explosion: crack, body, sub boom, then debris. The debris is what stops
  // it sounding like a single filtered noise burst.
  hit: () => {
    playNoise({ duration: 0.05, peak: 0.5, filter: "highpass", frequency: 3200, attack: 0.001 });
    playNoise({
      duration: 0.85,
      peak: 0.62,
      filter: "lowpass",
      frequency: 1900,
      sweepTo: 70,
      shape: "boom",
      attack: 0.005,
    });
    playTone({ type: "sine", from: 115, to: 28, duration: 0.75, peak: 0.5 });
    for (let i = 0; i < 5; i++) {
      playNoise({
        duration: 0.05,
        peak: 0.1,
        filter: "bandpass",
        frequency: 900 + Math.random() * 2200,
        q: 3,
        delay: 0.12 + Math.random() * 0.45,
      });
    }
  },

  // Sinking is the same explosion, bigger, plus the groan of a hull going
  // under — a slow detuned fall well below the explosion's own tail.
  sunk: () => {
    playNoise({ duration: 0.06, peak: 0.55, filter: "highpass", frequency: 3000, attack: 0.001 });
    playNoise({
      duration: 1.3,
      peak: 0.68,
      filter: "lowpass",
      frequency: 2200,
      sweepTo: 50,
      shape: "boom",
      attack: 0.006,
    });
    playTone({ type: "sine", from: 100, to: 22, duration: 1.2, peak: 0.55 });
    playTone({ type: "sawtooth", from: 190, to: 32, duration: 1.6, peak: 0.16, delay: 0.25 });
    for (let i = 0; i < 8; i++) {
      playNoise({
        duration: 0.06,
        peak: 0.1,
        filter: "bandpass",
        frequency: 700 + Math.random() * 2600,
        q: 3,
        delay: 0.15 + Math.random() * 0.9,
      });
    }
  },

  place: () => playTone({ type: "triangle", from: 520, to: 700, duration: 0.1, peak: 0.16 }),
  rotate: () => playTone({ type: "triangle", from: 380, to: 520, duration: 0.08, peak: 0.13 }),
  invalid: () => playTone({ type: "square", from: 200, to: 140, duration: 0.16, peak: 0.14 }),
  victory: () => {
    [0, 4, 7, 12].forEach((step, i) =>
      playTone({
        type: "triangle",
        from: semitone(330, step),
        to: semitone(330, step),
        duration: 0.5,
        peak: 0.2,
        delay: i * 0.16,
      })
    );
  },
  defeat: () => {
    [0, -3, -7, -12].forEach((step, i) =>
      playTone({
        type: "sawtooth",
        from: semitone(220, step),
        to: semitone(220, step),
        duration: 0.6,
        peak: 0.18,
        delay: i * 0.22,
      })
    );
  },
};

/** Fires a named one-shot effect. Unknown names and failures are ignored. */
export function playEffect(name) {
  try {
    if (muted || !ensureContext()) return;
    if (ctx.state === "suspended") ctx.resume();
    const effect = EFFECTS[name];
    if (effect) effect();
  } catch {
    /* additive layer — a failed effect must never interrupt a turn */
  }
}

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = Boolean(value);
  storeMute(muted);
  try {
    if (master) master.gain.value = muted ? 0 : 0.9;
  } catch {
    /* gain node gone — nothing else to do */
  }
  return muted;
}

export function toggleMuted() {
  return setMuted(!muted);
}

/** Restores the persisted mute preference. Safe to call before any audio. */
export function initAudio() {
  muted = readStoredMute();
  track = readStoredTrack();
  return muted;
}
