// Minimal stand-in for the handful of DOM APIs src/animations.js touches.
// The repo has no build step and no dev dependencies by design, so the
// browser-facing modules are tested against this instead of a real DOM.

function createStyle() {
  const style = {
    setProperty(name, value) {
      style[name] = value;
    },
  };
  return style;
}

function createClassList(element) {
  const names = new Set();
  return {
    add: (...values) => values.forEach((v) => names.add(v)),
    remove: (...values) => values.forEach((v) => names.delete(v)),
    contains: (value) => names.has(value),
    get size() {
      return names.size;
    },
    element,
  };
}

/** A fake element. `animate` is only defined when `animatable` is true. */
export function createElement(tagName = "div", { animate = false } = {}) {
  const element = {
    tagName,
    children: [],
    parent: null,
    offsetWidth: 0,
    rect: { left: 0, top: 0, width: 0, height: 0 },
    get className() {
      return element._className ?? "";
    },
    set className(value) {
      element._className = value;
    },
    getBoundingClientRect() {
      return element.rect;
    },
    appendChild(child) {
      child.parent = element;
      element.children.push(child);
      return child;
    },
    remove() {
      if (!element.parent) return;
      element.parent.children = element.parent.children.filter((c) => c !== element);
      element.parent = null;
    },
    querySelectorAll(className) {
      return element.children.filter((c) => c.className === className);
    },
  };
  element.style = createStyle();
  element.classList = createClassList(element);
  if (animate) {
    element.animations = [];
    element.animate = (keyframes, options) => {
      const animation = { keyframes, options, onfinish: null };
      element.animations.push(animation);
      return animation;
    };
  }
  return element;
}

/**
 * Installs a fake `document` (and a matching `body`) on `globalThis` and
 * returns a restore function.
 */
export function installFakeDocument({ animatable = true } = {}) {
  const previous = globalThis.document;
  const body = createElement("body");
  globalThis.document = {
    body,
    createElement: (tagName) => createElement(tagName, { animate: animatable }),
  };
  return {
    body,
    restore() {
      globalThis.document = previous;
    },
  };
}

/**
 * Replaces `setTimeout` with a recorder so timer-driven cleanup can be run
 * on demand. Returns `{ pending, runAll, restore }`.
 */
export function installFakeTimeout() {
  const previous = globalThis.setTimeout;
  const pending = [];
  globalThis.setTimeout = (fn, delay) => {
    pending.push({ fn, delay });
    return pending.length;
  };
  return {
    pending,
    runAll() {
      const queued = pending.splice(0, pending.length);
      queued.forEach(({ fn }) => fn());
    },
    restore() {
      globalThis.setTimeout = previous;
    },
  };
}
