// src/animations.js is pure presentation, but it still has to degrade
// gracefully (planning/battleship-prd.md §5): a browser without the Web
// Animations API must still resolve the shot. These tests run the module
// against the fake DOM in tests/helpers/fake-dom.js.
import test from "node:test";
import assert from "node:assert/strict";

import {
  computeArcKeyframes,
  fxExplosion,
  fxFire,
  hideReticle,
  klaxonFlash,
  launchMissile,
  positionReticle,
  spawnFx,
  spawnPing,
  triggerShake,
} from "../src/animations.js";
import { createElement, installFakeDocument, installFakeTimeout } from "./helpers/fake-dom.js";

function withRect(element, rect) {
  element.rect = { left: 0, top: 0, width: 0, height: 0, ...rect };
  return element;
}

const NUMBER = String.raw`-?[\d.]+(?:e[-+]?\d+)?`;

function translationOf(keyframe) {
  const match = new RegExp(
    `translate\\((${NUMBER})px, (${NUMBER})px\\) rotate\\((${NUMBER})deg\\)`
  ).exec(keyframe.transform);
  assert.ok(match, `unparseable keyframe: ${keyframe.transform}`);
  return { x: Number(match[1]), y: Number(match[2]), angle: Number(match[3]) };
}

function assertPointEqual(actual, [x, y]) {
  assert.ok(
    Math.abs(actual.x - x) < 1e-6 && Math.abs(actual.y - y) < 1e-6,
    `expected ~(${x}, ${y}), got (${actual.x}, ${actual.y})`
  );
}

test("positionReticle places the reticle at the cell's container-relative offset", () => {
  const container = withRect(createElement(), { left: 100, top: 50 });
  const cell = withRect(createElement(), { left: 130, top: 90 });
  const reticle = createElement();

  positionReticle(reticle, cell, container);

  assert.equal(reticle.style.transform, "translate(30px, 40px)");
});

test("hideReticle parks the reticle off-screen", () => {
  const reticle = createElement();
  hideReticle(reticle);
  assert.equal(reticle.style.transform, "translate(-9999px,-9999px)");
});

test("computeArcKeyframes arcs from start to end above the straight line", () => {
  const frames = computeArcKeyframes(0, 0, 100, 0, 8);

  assert.equal(frames.length, 9);
  const first = translationOf(frames[0]);
  const last = translationOf(frames[8]);
  assertPointEqual(first, [0, 0]);
  assertPointEqual(last, [100, 0]);

  const apex = translationOf(frames[4]);
  assert.equal(apex.x, 50);
  // Screen coordinates: the arc peaks at a smaller y than the endpoints.
  assert.ok(apex.y < -30, `expected an arc above the line, got y=${apex.y}`);

  // Every keyframe faces its direction of travel; the last reuses the
  // previous point since there is no next one.
  assert.ok(translationOf(frames[0]).angle < 0, "should launch upward");
  assert.ok(translationOf(frames[7]).angle > 0, "should descend before impact");
});

test("computeArcKeyframes keeps a minimum arc height for very short shots", () => {
  const frames = computeArcKeyframes(0, 0, 2, 0, 4);
  const apex = translationOf(frames[2]);
  assert.equal(apex.y, -60);
});

test("launchMissile animates a missile and cleans it up on arrival", () => {
  const dom = installFakeDocument();
  try {
    const container = withRect(createElement(), { left: 0, top: 0 });
    const source = withRect(container.appendChild(createElement()), {
      left: 10,
      top: 30,
      width: 20,
      height: 30,
    });
    const target = withRect(container.appendChild(createElement()), {
      left: 200,
      top: 100,
      width: 20,
      height: 20,
    });
    let arrived = 0;

    const animation = launchMissile(container, source, target, () => arrived++, {
      duration: 42,
    });

    const missile = container.children.find((c) => c.className === "bs-missile");
    assert.ok(missile, "missile should be appended to the container");
    assert.equal(animation.options.duration, 42);
    assert.equal(animation.options.fill, "forwards");
    assert.equal(arrived, 0, "onArrive must wait for the animation to finish");

    const start = translationOf(animation.keyframes[0]);
    const end = translationOf(animation.keyframes[animation.keyframes.length - 1]);
    assertPointEqual(start, [20, 40]);
    assertPointEqual(end, [210, 110]);

    animation.onfinish();
    assert.equal(arrived, 1);
    assert.equal(container.children.includes(missile), false);
  } finally {
    dom.restore();
  }
});

test("launchMissile still resolves the shot without the Web Animations API", () => {
  const dom = installFakeDocument({ animatable: false });
  try {
    const container = withRect(createElement(), {});
    const source = withRect(createElement(), {});
    const target = withRect(createElement(), {});
    let arrived = 0;

    const animation = launchMissile(container, source, target, () => arrived++);

    assert.equal(animation, null);
    assert.equal(arrived, 1, "onArrive must still fire so the turn is not stalled");
    assert.deepEqual(container.children, [], "the missile must be cleaned up");
  } finally {
    dom.restore();
  }
});

test("launchMissile tolerates a missing onArrive callback", () => {
  const dom = installFakeDocument({ animatable: false });
  try {
    const container = withRect(createElement(), {});
    assert.equal(
      launchMissile(container, withRect(createElement(), {}), withRect(createElement(), {})),
      null
    );
  } finally {
    dom.restore();
  }
});

test("fxFire builds a flash, a flame and five embers", () => {
  const dom = installFakeDocument();
  try {
    const node = fxFire();

    assert.equal(node.className, "bs-fx-fire");
    assert.equal(node.querySelectorAll("bs-fx-flash").length, 1);
    assert.equal(node.querySelectorAll("flame").length, 1);

    const embers = node.querySelectorAll("ember");
    assert.equal(embers.length, 5);
    for (const ember of embers) {
      assert.match(ember.style["--ex"], /^-?\d+(\.\d+)?px$/);
      assert.match(ember.style.animationDelay, /^\d+(\.\d+)?s$/);
      const left = Number.parseFloat(ember.style.left);
      assert.ok(left >= 46 && left <= 56, `ember drifted off the cell: ${ember.style.left}`);
    }
  } finally {
    dom.restore();
  }
});

test("fxExplosion builds a core, a shockwave and evenly fanned debris", () => {
  const dom = installFakeDocument();
  try {
    const node = fxExplosion();

    assert.equal(node.className, "bs-fx-explosion");
    assert.equal(node.querySelectorAll("core").length, 1);
    assert.equal(node.querySelectorAll("shock").length, 1);

    const debris = node.querySelectorAll("debris");
    assert.equal(debris.length, 10);
    assert.deepEqual(
      debris.map((d) => d.style["--ang"]),
      Array.from({ length: 10 }, (_, i) => `${i * 36}deg`)
    );
  } finally {
    dom.restore();
  }
});

test("spawnFx attaches the node and removes it after its lifespan", () => {
  const dom = installFakeDocument();
  const timers = installFakeTimeout();
  try {
    const cell = createElement();
    const node = fxFire();

    spawnFx(cell, node, 1234);

    assert.equal(cell.style.position, "relative");
    assert.deepEqual(cell.children, [node]);
    assert.equal(timers.pending[0].delay, 1234);

    timers.runAll();
    assert.deepEqual(cell.children, []);
  } finally {
    timers.restore();
    dom.restore();
  }
});

test("spawnPing attaches a ping and removes it after its lifespan", () => {
  const dom = installFakeDocument();
  const timers = installFakeTimeout();
  try {
    const cell = createElement();

    spawnPing(cell);

    assert.equal(cell.style.position, "relative");
    assert.equal(cell.children[0].className, "bs-ping");
    assert.equal(timers.pending[0].delay, 2000);

    timers.runAll();
    assert.deepEqual(cell.children, []);
  } finally {
    timers.restore();
    dom.restore();
  }
});

test("triggerShake re-adds the shake class so the animation restarts", () => {
  const container = createElement();
  container.classList.add("bs-shake");

  triggerShake(container);

  assert.equal(container.classList.contains("bs-shake"), true);
  assert.equal(container.classList.size, 1);
});

test("klaxonFlash appends a one-shot flash to the body and removes it", () => {
  const dom = installFakeDocument();
  const timers = installFakeTimeout();
  try {
    klaxonFlash(500);

    assert.equal(dom.body.children[0].className, "bs-klaxon-flash");
    assert.equal(timers.pending[0].delay, 500);

    timers.runAll();
    assert.deepEqual(dom.body.children, []);
  } finally {
    timers.restore();
    dom.restore();
  }
});
