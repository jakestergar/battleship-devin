// NES-style chiptune engine.
//
// The original console's sound came from the 2A03 APU: two pulse channels with
// four selectable duty cycles, one triangle channel (bass, fixed volume), and
// one noise channel (percussion). Everything here is synthesized to that same
// four-voice constraint rather than "a square wave and some reverb", because
// the constraint is what makes it sound like an NES instead of generic 8-bit.
//
// Two details that matter for authenticity:
//
//  * Web Audio's "square" oscillator is a 50% duty pulse only. The NES's
//    characteristic thin, reedy lead is 12.5% or 25%. Those are built here as
//    PeriodicWaves from the Fourier series of a pulse train, which is the only
//    way to get them without an AudioWorklet.
//  * The APU had 4-bit volume and no filters, so notes are stepped and dry.
//    Envelopes are deliberately blunt — a fast attack and a flat decay, not
//    the smooth exponential curves used elsewhere in this project.
//
// No binary assets: the game ships as static files on GitHub Pages. Like the
// rest of the audio layer, every entry point is wrapped and a failure here
// leaves the game silent rather than broken.

const LOOKAHEAD_MS = 25;   // how often the scheduler wakes
const SCHEDULE_AHEAD = 0.12; // seconds of audio queued in advance
const BPM = 132;
const STEPS_PER_BEAT = 4;  // 16th notes
const STEP_SECONDS = 60 / BPM / STEPS_PER_BEAT;

/** MIDI-ish note name -> frequency. A4 = 440Hz = "A4". */
const NOTE_OFFSETS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function noteToFreq(name) {
  if (!name) return null;
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) return null;
  const [, letter, accidental, octave] = m;
  let semis = NOTE_OFFSETS[letter];
  if (accidental === "#") semis += 1;
  if (accidental === "b") semis -= 1;
  // MIDI note number, then standard equal-temperament conversion.
  const midi = (Number(octave) + 1) * 12 + semis;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * A pulse wave of the given duty cycle, as a PeriodicWave.
 *
 * Fourier series of a pulse train: the nth harmonic has amplitude
 * (2 / (n*pi)) * sin(n * pi * duty). At duty 0.5 the even harmonics vanish,
 * which is exactly the standard square wave — a useful sanity check.
 */
function pulseWave(ctx, duty, harmonics = 24) {
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  for (let n = 1; n <= harmonics; n++) {
    imag[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

// ---------------------------------------------------------------------------
// The track: 32 steps (two bars of 4/4 at 16th-note resolution) over an
// Am - F - C - G loop. Written as arrays so the whole song is readable and
// editable in one place. `null` is a rest; a note sustains until the next
// entry, so repeated notes are re-struck explicitly.
// ---------------------------------------------------------------------------

// Lead: the hook. Sparse on purpose — NES leads breathe.
const LEAD = [
  "A4", null, "C5", null,  "E5", null, "D5", null,
  "C5", null, "A4", null,  null, null, "G4", null,
  "F4", null, "A4", null,  "C5", null, "B4", null,
  "G4", null, "E4", null,  "G4", null, null, null,
];

// Counter-line / arpeggio, one octave down and off the beat.
const HARMONY = [
  null, "E4", null, "A4",  null, "C5", null, "A4",
  null, "E4", null, "G4",  null, "C5", null, "G4",
  null, "C4", null, "F4",  null, "A4", null, "F4",
  null, "D4", null, "G4",  null, "B4", null, "G4",
];

// Triangle bass: roots and fifths, the harmonic floor.
const BASS = [
  "A2", null, null, "A2",  "E3", null, "A2", null,
  "A2", null, null, "A2",  "E3", null, "G2", null,
  "F2", null, null, "F2",  "C3", null, "F2", null,
  "G2", null, null, "G2",  "D3", null, "G2", null,
];

// Noise percussion. K = kick-ish (low, short), S = snare (bright burst),
// h = closed hat (very short, quiet).
const DRUMS = [
  "K", "h", "h", "h",  "S", "h", "h", "K",
  "K", "h", "h", "h",  "S", "h", "h", "h",
  "K", "h", "h", "h",  "S", "h", "h", "K",
  "K", "h", "h", "h",  "S", "h", "K", "S",
];

const TOTAL_STEPS = LEAD.length;

/** Exposed so the track can be validated without an AudioContext. */
export const TRACK = { LEAD, HARMONY, BASS, DRUMS, TOTAL_STEPS, STEP_SECONDS };

/**
 * The imaginary Fourier coefficients of a pulse train, exported for testing.
 * At duty 0.5 every even harmonic must vanish (that is the definition of a
 * square wave) — a cheap, decisive check that the maths is right.
 */
export function pulseCoefficients(duty, harmonics = 24) {
  const imag = new Float32Array(harmonics + 1);
  for (let n = 1; n <= harmonics; n++) {
    imag[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
  }
  return imag;
}

/**
 * Builds a chiptune player bound to an existing AudioContext and destination
 * node, so it shares the caller's master gain and mute handling.
 */
export function createChiptune(ctx, destination) {
  const bus = ctx.createGain();
  bus.gain.value = 0.5;
  bus.connect(destination);

  const waves = {
    lead: pulseWave(ctx, 0.25),   // 25% — the classic NES lead
    harmony: pulseWave(ctx, 0.125), // 12.5% — thinner, sits behind the lead
  };

  // One shared noise buffer, re-used by every drum hit. Generating this per
  // hit was measurably wasteful at 16th notes.
  const noiseSeconds = 0.4;
  const noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * noiseSeconds), ctx.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1;

  let timer = null;
  let step = 0;
  let nextStepTime = 0;
  let running = false;

  /** A pulse-channel voice: blunt attack, flat-ish decay, no filtering. */
  function pulse(waveName, freq, at, duration, peak) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.setPeriodicWave(waves[waveName]);
    osc.frequency.setValueAtTime(freq, at);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(peak, at + 0.005);
    gain.gain.setValueAtTime(peak, at + duration * 0.6);
    gain.gain.linearRampToValueAtTime(0, at + duration);
    osc.connect(gain).connect(bus);
    osc.start(at);
    osc.stop(at + duration + 0.02);
  }

  /** Triangle bass. The NES triangle had no volume control at all. */
  function triangle(freq, at, duration, peak) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, at);
    gain.gain.setValueAtTime(peak, at);
    gain.gain.setValueAtTime(peak, at + duration * 0.85);
    gain.gain.linearRampToValueAtTime(0, at + duration);
    osc.connect(gain).connect(bus);
    osc.start(at);
    osc.stop(at + duration + 0.02);
  }

  function drum(kind, at) {
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    let duration;
    let peak;
    if (kind === "K") {
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(220, at);
      duration = 0.11;
      peak = 0.5;
    } else if (kind === "S") {
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(1900, at);
      duration = 0.13;
      peak = 0.32;
    } else {
      filter.type = "highpass";
      filter.frequency.setValueAtTime(7000, at);
      duration = 0.035;
      peak = 0.14;
    }
    gain.gain.setValueAtTime(peak, at);
    gain.gain.linearRampToValueAtTime(0, at + duration);
    source.connect(filter).connect(gain).connect(bus);
    source.start(at, 0, duration + 0.01);
  }

  function scheduleStep(index, at) {
    const lead = noteToFreq(LEAD[index]);
    if (lead) pulse("lead", lead, at, STEP_SECONDS * 1.8, 0.16);

    const harmony = noteToFreq(HARMONY[index]);
    if (harmony) pulse("harmony", harmony, at, STEP_SECONDS * 0.9, 0.075);

    const bass = noteToFreq(BASS[index]);
    if (bass) triangle(bass, at, STEP_SECONDS * 1.6, 0.3);

    const hit = DRUMS[index];
    if (hit) drum(hit, at);
  }

  function tick() {
    try {
      while (nextStepTime < ctx.currentTime + SCHEDULE_AHEAD) {
        scheduleStep(step % TOTAL_STEPS, nextStepTime);
        step++;
        nextStepTime += STEP_SECONDS;
      }
    } catch {
      stop();
    }
  }

  function start() {
    if (running) return;
    running = true;
    step = 0;
    // Small offset so the first notes aren't scheduled in the past.
    nextStepTime = ctx.currentTime + 0.08;
    tick();
    timer = setInterval(tick, LOOKAHEAD_MS);
  }

  function stop() {
    running = false;
    if (timer) clearInterval(timer);
    timer = null;
  }

  function setVolume(value) {
    try {
      bus.gain.value = Math.max(0, Math.min(1, value));
    } catch {
      /* node gone */
    }
  }

  return { start, stop, setVolume, isRunning: () => running };
}
