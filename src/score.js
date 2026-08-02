// The game's score: a dark, slow, tense underwater bed.
//
// Three earlier attempts were wrong and it is worth recording why, because the
// reasoning is the design:
//
//   1. An ambient sonar drone — atmosphere, but not music. Nothing happened.
//   2. An NES chiptune — energetic, but it fought a dark tactical UI and read
//      as a different game entirely.
//   3. A brass march ("Anchors Aweigh") — thematically naval but tonally
//      wrong: ceremonial and cheerful over a screen about hunting and sinking,
//      and a 2:43 march loops audibly.
//
// What this is instead: a slow minor progression under a sub-bass drone, with
// a heartbeat pulse and occasional sonar pings. It is deliberately in the
// background — the job of score in a turn-based strategy game is to create
// pressure and then get out of the way, not to be hummed.
//
// Structure: a 32-second loop of four 8-second chords, i – VI – iv – V in D
// minor. The V (A major, with its raised third) is what creates the pull back
// to the tonic, so the loop never sounds like it has simply stopped and
// restarted — the seam is the most important part of a loop.
//
// Everything is synthesized. No binary assets, so nothing to license, nothing
// to download, and the whole score is a few hundred bytes of code.

const LOOKAHEAD_MS = 60;
const SCHEDULE_AHEAD = 1.5; // seconds; long, because events are slow
const CHORD_SECONDS = 8;
const PULSE_SECONDS = 2;

// D minor: i – VI – iv – V. Voiced low and close, the way a string section
// would sit, rather than as spread synth pads.
const PROGRESSION = [
  { name: "Dm", root: 73.42, tones: [146.83, 174.61, 220.0] }, // D2 · D3 F3 A3
  { name: "Bb", root: 58.27, tones: [116.54, 174.61, 233.08] }, // Bb1 · Bb2 F3 Bb3
  { name: "Gm", root: 49.0, tones: [146.83, 196.0, 233.08] }, // G1 · D3 G3 Bb3
  { name: "A", root: 55.0, tones: [138.59, 164.81, 220.0] }, // A1 · C#3 E3 A3
];

// Sonar pings sit high above the harmony, on a D minor pentatonic so they are
// always consonant with whatever chord is underneath.
const PING_PITCHES = [587.33, 698.46, 880.0, 1046.5];

export function createScore(ctx, destination) {
  const bus = ctx.createGain();
  bus.gain.value = 0.0001;
  bus.connect(destination);

  // A gentle high cut over everything: the score should feel like it is
  // coming through a hull, not sitting on top of the interface.
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 2600;
  tone.Q.value = 0.4;
  tone.connect(bus);

  // Long echo for the pings only — the pads stay dry so the mix does not turn
  // to mud at this tempo.
  const delay = ctx.createDelay(2.0);
  delay.delayTime.value = 0.66;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.36;
  const echoLevel = ctx.createGain();
  echoLevel.gain.value = 0.5;
  delay.connect(feedback).connect(delay);
  delay.connect(echoLevel).connect(tone);

  let timer = null;
  let running = false;
  let chordIndex = 0;
  let nextChordTime = 0;
  let pulseIndex = 0;
  let nextPulseTime = 0;
  let nextPingTime = 0;
  const persistent = [];

  /** Continuous sub-bass. Started once and left running for the session. */
  function startSub() {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const now = ctx.currentTime;

    osc.type = "sine";
    osc.frequency.value = 36.71; // D1 — felt more than heard
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.5, now + 6);

    // Very slow swell so the floor breathes instead of sitting flat.
    lfo.type = "sine";
    lfo.frequency.value = 0.045;
    lfoGain.gain.value = 0.18;
    lfo.connect(lfoGain).connect(gain.gain);

    osc.connect(gain).connect(tone);
    osc.start(now);
    lfo.start(now);
    persistent.push(osc, lfo);
  }

  /** Filtered noise, barely audible — the sound of being inside something. */
  function startWash() {
    const seconds = 4;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Rough pink-ish noise: a running average of white noise rolls off the
    // harshest top end without needing a steep filter.
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 420;
    filter.Q.value = 0.6;
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.09, now + 8);
    source.connect(filter).connect(gain).connect(tone);
    source.start(now);
    persistent.push(source);
  }

  /** One sustained chord tone with a long swell in and out. */
  function padVoice(freq, at, duration, peak) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = "sawtooth";
    // A few cents flat, alternating, so stacked voices beat slowly against
    // each other instead of sounding like one synthetic tone.
    osc.detune.value = (Math.random() - 0.5) * 14;
    osc.frequency.value = freq;

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(500, at);
    filter.frequency.linearRampToValueAtTime(1300, at + duration * 0.45);
    filter.frequency.linearRampToValueAtTime(520, at + duration);
    filter.Q.value = 1.6;

    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(peak, at + duration * 0.35);
    gain.gain.setValueAtTime(peak, at + duration * 0.6);
    gain.gain.linearRampToValueAtTime(0, at + duration);

    osc.connect(filter).connect(gain).connect(tone);
    osc.start(at);
    osc.stop(at + duration + 0.1);
  }

  function scheduleChord(index, at) {
    const chord = PROGRESSION[index % PROGRESSION.length];
    // Overlap chords slightly so one bleeds into the next — no gaps at the
    // boundary, which is where a loop gives itself away.
    const duration = CHORD_SECONDS * 1.25;
    padVoice(chord.root, at, duration, 0.12);
    for (const freq of chord.tones) {
      padVoice(freq, at, duration, 0.055);
    }
  }

  /** Low heartbeat. Strong on the downbeat, softer between. */
  function schedulePulse(index, at) {
    const strong = index % 2 === 0;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(strong ? 82 : 68, at);
    osc.frequency.exponentialRampToValueAtTime(strong ? 41 : 36, at + 0.22);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(strong ? 0.34 : 0.18, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.34);
    osc.connect(gain).connect(tone);
    osc.start(at);
    osc.stop(at + 0.4);
  }

  /** Sparse sonar ping, echoed. The only bright sound in the score. */
  function schedulePing(at) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = PING_PITCHES[Math.floor(Math.random() * PING_PITCHES.length)];
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.085, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.6);
    osc.connect(gain);
    gain.connect(tone);
    gain.connect(delay);
    osc.start(at);
    osc.stop(at + 1.7);
  }

  function tick() {
    try {
      const horizon = ctx.currentTime + SCHEDULE_AHEAD;
      while (nextChordTime < horizon) {
        scheduleChord(chordIndex++, nextChordTime);
        nextChordTime += CHORD_SECONDS;
      }
      while (nextPulseTime < horizon) {
        schedulePulse(pulseIndex++, nextPulseTime);
        nextPulseTime += PULSE_SECONDS;
      }
      while (nextPingTime < horizon) {
        schedulePing(nextPingTime);
        // Irregular spacing so the ping never becomes a metronome.
        nextPingTime += 9 + Math.random() * 8;
      }
    } catch {
      stop();
    }
  }

  function start() {
    if (running) return;
    running = true;
    const now = ctx.currentTime;
    // Fade the whole bus in: the score should arrive, not start.
    bus.gain.cancelScheduledValues(now);
    bus.gain.setValueAtTime(0.0001, now);
    bus.gain.exponentialRampToValueAtTime(0.9, now + 4);

    if (persistent.length === 0) {
      startSub();
      startWash();
    }
    chordIndex = 0;
    pulseIndex = 0;
    nextChordTime = now + 0.3;
    nextPulseTime = now + 0.3;
    nextPingTime = now + 6;
    tick();
    timer = setInterval(tick, LOOKAHEAD_MS);
  }

  function stop() {
    running = false;
    if (timer) clearInterval(timer);
    timer = null;
    try {
      const now = ctx.currentTime;
      bus.gain.cancelScheduledValues(now);
      bus.gain.setValueAtTime(bus.gain.value, now);
      bus.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
    } catch {
      /* context gone */
    }
  }

  return { start, stop, isRunning: () => running };
}

/** Exposed for testing without an AudioContext. */
export const SCORE_SHAPE = { PROGRESSION, PING_PITCHES, CHORD_SECONDS, PULSE_SECONDS };
