import test from "node:test";
import assert from "node:assert/strict";

import { createGame, fireAt } from "../src/engine.js";
import {
  estimateWinProbability,
  describeOdds,
  FLEET_CELLS,
  RANDOM_HIT_RATE,
} from "../src/odds.js";

/** Removes `count` cells from a board by firing at its ships directly. */
function damage(state, boardName, count) {
  const board = boardName === "ai" ? state.aiBoard : state.playerBoard;
  const targets = [];
  for (const ship of board.ships) {
    for (const cell of ship.cells) {
      if (!board.shotsReceived.has(`${cell.row},${cell.col}`)) targets.push(cell);
    }
  }
  // The actor must match the board being shot at: shots landing on the AI's
  // board are the player's, and shots landing on the player's board are the
  // AI's. Getting this backwards makes the history claim one side fired the
  // other's shots, which is exactly what the hit-rate estimate reads.
  const actor = boardName === "ai" ? "player" : "ai";
  let next = state;
  for (let i = 0; i < count && i < targets.length; i++) {
    next = fireAt({ ...next, turn: actor }, boardName, targets[i]).newState;
  }
  return { ...next, turn: "player" };
}

test("a standard fleet is 17 cells and random search hits 17% of the time", () => {
  assert.equal(FLEET_CELLS, 17);
  assert.ok(Math.abs(RANDOM_HIT_RATE - 0.17) < 1e-9);
});

test("probabilities are complementary and within [0,1]", () => {
  const odds = estimateWinProbability(createGame(), { trials: 500 });
  assert.ok(odds.player >= 0 && odds.player <= 1);
  assert.ok(Math.abs(odds.player + odds.ai - 1) < 1e-9);
});

test("a fresh game is close to even", () => {
  const odds = estimateWinProbability(createGame(), { trials: 4000 });
  // Player moves first, so a slight edge is expected and correct.
  assert.ok(
    odds.player > 0.45 && odds.player < 0.72,
    `fresh game should be near even, got ${odds.player}`
  );
});

test("being far ahead on damage raises the player's odds", () => {
  const base = createGame();
  const ahead = damage(base, "ai", 14); // player has landed 14 of 17
  const behind = damage(base, "player", 14); // AI has landed 14 of 17

  const aheadOdds = estimateWinProbability(ahead, { trials: 4000 });
  const behindOdds = estimateWinProbability(behind, { trials: 4000 });

  assert.ok(aheadOdds.player > 0.8, `expected strong lead, got ${aheadOdds.player}`);
  assert.ok(behindOdds.player < 0.2, `expected clear deficit, got ${behindOdds.player}`);
  assert.ok(aheadOdds.player > behindOdds.player);
});

test("odds move monotonically as the player lands more hits", () => {
  const base = createGame();
  let previous = -1;
  for (const hits of [0, 5, 10, 15]) {
    const odds = estimateWinProbability(damage(base, "ai", hits), { trials: 4000 });
    assert.ok(
      odds.player > previous - 0.05,
      `odds should not fall as damage rises: ${hits} hits gave ${odds.player}, previous ${previous}`
    );
    previous = odds.player;
  }
});

test("a cleared enemy fleet is a settled win, not an estimate", () => {
  const won = damage(createGame(), "ai", FLEET_CELLS);
  const odds = estimateWinProbability(won, { trials: 100 });
  assert.equal(odds.player, 1);
  assert.equal(odds.settled, true);
  assert.equal(odds.playerNeeds, 0);
});

test("a cleared own fleet is a settled loss", () => {
  const lost = damage(createGame(), "player", FLEET_CELLS);
  const odds = estimateWinProbability(lost, { trials: 100 });
  assert.equal(odds.player, 0);
  assert.equal(odds.settled, true);
  assert.equal(odds.aiNeeds, 0);
});

test("estimation does not mutate the state it is given", () => {
  const state = damage(createGame(), "ai", 6);
  const before = JSON.stringify(state, (k, v) => (v instanceof Set ? [...v] : v));
  estimateWinProbability(state, { trials: 500 });
  const after = JSON.stringify(state, (k, v) => (v instanceof Set ? [...v] : v));
  assert.equal(before, after);
});

test("results are reproducible with an injected RNG", () => {
  const state = damage(createGame(), "ai", 4);
  const seeded = () => {
    let s = 12345;
    return () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
  };
  const a = estimateWinProbability(state, { trials: 800, random: seeded() });
  const b = estimateWinProbability(state, { trials: 800, random: seeded() });
  assert.equal(a.player, b.player);
});

test("the hit-rate prior stops tiny samples producing absurd estimates", () => {
  // One shot, one hit must not imply a 100% hit rate.
  let state = createGame();
  const target = state.aiBoard.ships[0].cells[0];
  state = fireAt(state, "ai", target).newState;
  const odds = estimateWinProbability(state, { trials: 500 });
  assert.ok(
    odds.playerHitRate < 0.45,
    `a single lucky hit should not imply near-certainty, got ${odds.playerHitRate}`
  );
});

test("returns null rather than a meaningless number for unusable input", () => {
  for (const bad of [null, undefined, {}, { playerBoard: {} }]) {
    assert.equal(estimateWinProbability(bad), null);
  }
});

test("describeOdds reports the leader and the cells still needed", () => {
  const ahead = estimateWinProbability(damage(createGame(), "ai", 15), { trials: 2000 });
  const text = describeOdds(ahead);
  assert.match(text, /You hold a .* advantage/);
  assert.match(text, /to sink/);
  assert.equal(describeOdds(null), "");
});
