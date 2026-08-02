// Procedurally synthesized music and sound effects via the Web Audio API.
// No binary assets (the game ships as static files on GitHub Pages), and no
// game logic: every export is a no-op if Web Audio is unavailable, blocked by
// the browser's autoplay policy, or throws — audio is a purely additive
// layer and must never break gameplay (see planning/battleship-prd.md §5).

import { createChiptune } from "./chiptune.js";

const STORAGE_KEY = "battleship:muted";
const TRACK_KEY = "battleship:track";

// "chip" is the NES-style 2A03 track (see chiptune.js); "naval" is the
// original ambient sonar drone kept below. Chip is the default because the
// drone was atmosphere rather than a tune, and this is a game.
const TRACKS = ["chip", "naval"];

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
let track = "chip";

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
    return TRACKS.includes(stored) ? stored : "chip";
  } catch {
    return "chip";
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
  master.connect(ctx.destination);
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
    if (track === "chip") {
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

/** Noise burst shaped by a filter — the basis of splashes and explosions. */
function playNoise({ duration, peak, filter, frequency, sweepTo }) {
  const now = ctx.currentTime;
  const frames = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const biquad = ctx.createBiquadFilter();
  biquad.type = filter;
  biquad.frequency.setValueAtTime(frequency, now);
  if (typeof sweepTo === "number") {
    biquad.frequency.exponentialRampToValueAtTime(sweepTo, now + duration);
  }
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(peak, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  source.connect(biquad).connect(gain).connect(master);
  source.start(now);
}

function playTone({ type, from, to, duration, peak, delay = 0 }) {
  const at = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(to, at + duration);
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(peak, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(gain).connect(master);
  osc.start(at);
  osc.stop(at + duration + 0.05);
}

const EFFECTS = {
  fire: () => playTone({ type: "sawtooth", from: 900, to: 120, duration: 0.28, peak: 0.22 }),
  miss: () =>
    playNoise({ duration: 0.5, peak: 0.3, filter: "lowpass", frequency: 1400, sweepTo: 220 }),
  hit: () => {
    playNoise({ duration: 0.7, peak: 0.55, filter: "lowpass", frequency: 900, sweepTo: 90 });
    playTone({ type: "square", from: 180, to: 40, duration: 0.5, peak: 0.2 });
  },
  sunk: () => {
    playNoise({ duration: 1.1, peak: 0.6, filter: "lowpass", frequency: 700, sweepTo: 60 });
    playTone({ type: "sawtooth", from: 220, to: 35, duration: 1.2, peak: 0.24 });
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
