// Minimal stand-in for the Web Audio API surface src/audio.js uses, plus a
// fake localStorage. Enough to assert what the module builds and to force
// failures, without pulling in a dependency.

function createParam(log, name) {
  return {
    value: 0,
    setValueAtTime(value, time) {
      log.push({ param: name, method: "setValueAtTime", value, time });
      this.value = value;
    },
    linearRampToValueAtTime(value, time) {
      log.push({ param: name, method: "linearRamp", value, time });
    },
    exponentialRampToValueAtTime(value, time) {
      log.push({ param: name, method: "exponentialRamp", value, time });
    },
  };
}

export function createFakeAudioContext({ state = "running" } = {}) {
  const created = { gains: [], oscillators: [], sources: [], filters: [], buffers: [] };
  const automation = [];
  let resumed = 0;
  // Set to a message to make every node factory throw.
  let failure = null;

  function node(extra) {
    const base = {
      connect(target) {
        base.connectedTo = target;
        return target;
      },
    };
    return Object.assign(base, extra);
  }

  const ctx = {
    state,
    currentTime: 0,
    sampleRate: 44100,
    destination: node({ isDestination: true }),
    created,
    automation,
    get resumeCount() {
      return resumed;
    },
    failNodeCreation(message) {
      failure = message;
    },
    resume() {
      resumed++;
      ctx.state = "running";
    },
    createGain() {
      if (failure) throw new Error(failure);
      const gain = node({ gain: createParam(automation, "gain") });
      created.gains.push(gain);
      return gain;
    },
    createOscillator() {
      if (failure) throw new Error(failure);
      const osc = node({
        frequency: createParam(automation, "frequency"),
        started: null,
        stopped: null,
        start(at) {
          osc.started = at;
        },
        stop(at) {
          osc.stopped = at;
        },
      });
      created.oscillators.push(osc);
      return osc;
    },
    createBufferSource() {
      if (failure) throw new Error(failure);
      const source = node({
        buffer: null,
        started: null,
        start(at) {
          source.started = at;
        },
      });
      created.sources.push(source);
      return source;
    },
    createBiquadFilter() {
      if (failure) throw new Error(failure);
      const filter = node({
        type: null,
        frequency: createParam(automation, "filterFrequency"),
      });
      created.filters.push(filter);
      return filter;
    },
    createBuffer(channels, frames, sampleRate) {
      if (failure) throw new Error(failure);
      const data = new Float32Array(frames);
      const buffer = { channels, frames, sampleRate, getChannelData: () => data };
      created.buffers.push(buffer);
      return buffer;
    },
  };
  return ctx;
}

/** Installs a fake `localStorage`; `{ broken: true }` makes it throw. */
export function installFakeLocalStorage({ broken = false, initial = {} } = {}) {
  const previous = globalThis.localStorage;
  const store = new Map(Object.entries(initial));
  globalThis.localStorage = {
    getItem(key) {
      if (broken) throw new Error("storage disabled");
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      if (broken) throw new Error("storage disabled");
      store.set(key, String(value));
    },
    store,
  };
  return {
    store,
    restore() {
      globalThis.localStorage = previous;
    },
  };
}

/** Installs a fake `window` exposing the given AudioContext constructor. */
export function installFakeWindow(ctx) {
  const previous = globalThis.window;
  globalThis.window = { AudioContext: ctx === null ? undefined : function () { return ctx; } };
  return {
    restore() {
      globalThis.window = previous;
    },
  };
}
