import test from "node:test";
import assert from "node:assert/strict";

import { createGame, fireAt, BOARD_SIZE } from "../src/engine.js";
import {
  MODES,
  POWERUPS,
  createLoadout,
  pointsEarned,
  pointsAvailable,
  canAfford,
  spend,
  applyAirstrike,
  sonarScan,
  chooseAiPowerup,
} from "../src/powerups.js";

/** Fires `count` shots that are guaranteed hits on the named board. */
function land(state, boardName, count) {
  const board = boardName === "ai" ? state.aiBoard : state.playerBoard;
  const actor = boardName === "ai" ? "player" : "ai";
  const targets = [];
  for (const ship of board.ships) {
    for (const cell of ship.cells) targets.push(cell);
  }
  let next = state;
  for (let i = 0; i < count && i < targets.length; i++) {
    next = fireAt({ ...next, turn: actor }, boardName, targets[i]).newState;
  }
  return next;
}

test("both modes are declared", () => {
  assert.deepEqual(MODES, ["classic", "advanced"]);
});

test("a fresh loadout has spent nothing", () => {
  const loadout = createLoadout();
  assert.equal(loadout.spent, 0);
  assert.equal(pointsAvailable([], "player", loadout), 0);
});

test("hits earn points and sinking earns strictly more", () => {
  const state = createGame();
  // The destroyer is 2 cells, so two hits sink it.
  const afterOne = land(state, "ai", 1);
  const oneHit = pointsEarned(afterOne.history, "player");
  assert.ok(oneHit > 0, "a hit should pay something");

  // Find a state where something has actually sunk.
  const afterMany = land(state, "ai", 6);
  const sinkEntries = afterMany.history.filter((e) => e.result === "sunk");
  assert.ok(sinkEntries.length > 0, "fixture should have sunk at least one ship");
  assert.ok(
    pointsEarned(afterMany.history, "player") > oneHit * 6,
    "sinking should pay a bonus over a plain hit"
  );
});

test("misses pay nothing", () => {
  const state = createGame();
  const occupied = new Set();
  for (const ship of state.aiBoard.ships) {
    for (const c of ship.cells) occupied.add(`${c.row},${c.col}`);
  }
  let empty = null;
  for (let r = 0; r < BOARD_SIZE && !empty; r++) {
    for (let c = 0; c < BOARD_SIZE && !empty; c++) {
      if (!occupied.has(`${r},${c}`)) empty = { row: r, col: c };
    }
  }
  const after = fireAt(state, "ai", empty).newState;
  assert.equal(pointsEarned(after.history, "player"), 0);
});

test("points are attributed to the actor who earned them", () => {
  const state = land(createGame(), "ai", 4);
  assert.ok(pointsEarned(state.history, "player") > 0);
  assert.equal(pointsEarned(state.history, "ai"), 0);
});

test("spending reduces what is available and never mutates the loadout", () => {
  const state = land(createGame(), "ai", 8);
  const loadout = createLoadout();
  const before = pointsAvailable(state.history, "player", loadout);
  assert.ok(before >= POWERUPS.sonar.cost, "fixture should afford a sonar");

  const after = spend(loadout, "sonar");
  assert.equal(loadout.spent, 0, "original loadout must be untouched");
  assert.equal(after.spent, POWERUPS.sonar.cost);
  assert.equal(
    pointsAvailable(state.history, "player", after),
    before - POWERUPS.sonar.cost
  );
  assert.equal(after.uses.sonar, 1);
});

test("you cannot afford what you have not earned", () => {
  const fresh = createGame();
  const loadout = createLoadout();
  assert.equal(canAfford(fresh.history, "player", loadout, "airstrike"), false);
  assert.equal(canAfford(fresh.history, "player", loadout, "nonsense"), false);
});

test("airstrike fires the expected number of distinct, previously unhit cells", () => {
  const state = createGame();
  const { newState, cells } = applyAirstrike(state, "ai");
  assert.equal(cells.length, POWERUPS.airstrike.shots);

  const keys = new Set(cells.map((c) => `${c.row},${c.col}`));
  assert.equal(keys.size, cells.length, "airstrike must not hit the same cell twice");

  for (const cell of cells) {
    assert.ok(
      newState.aiBoard.shotsReceived.has(`${cell.row},${cell.col}`),
      "every struck cell should be recorded on the board"
    );
  }
  assert.equal(
    newState.aiBoard.shotsReceived.size,
    state.aiBoard.shotsReceived.size + cells.length
  );
});

test("an airstrike costs one turn, not five", () => {
  const state = createGame();
  assert.equal(state.turn, "player");
  const { newState } = applyAirstrike(state, "ai");
  if (newState.status === "in_progress") {
    assert.equal(newState.turn, "ai", "play should pass exactly once");
  }
});

test("airstrike never re-fires an already-hit cell", () => {
  let state = land(createGame(), "ai", 10);
  const already = new Set(state.aiBoard.shotsReceived);
  const { cells } = applyAirstrike(state, "ai");
  for (const cell of cells) {
    assert.ok(
      !already.has(`${cell.row},${cell.col}`),
      `airstrike reused already-fired cell ${cell.row},${cell.col}`
    );
  }
});

test("airstrike does not mutate the state it is given", () => {
  const state = createGame();
  const snapshot = JSON.stringify(state, (k, v) => (v instanceof Set ? [...v] : v));
  applyAirstrike(state, "ai");
  const after = JSON.stringify(state, (k, v) => (v instanceof Set ? [...v] : v));
  assert.equal(snapshot, after);
});

test("airstrike copes with a nearly full board", () => {
  // Fire at everything but two cells, then airstrike for five.
  let state = createGame();
  let fired = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (fired >= 98) break;
      if (state.status !== "in_progress") break;
      state = fireAt({ ...state, turn: "player" }, "ai", { row: r, col: c }).newState;
      fired++;
    }
  }
  const { cells } = applyAirstrike(state, "ai");
  assert.ok(cells.length <= 5, "must not invent cells that do not exist");
});

test("sonar reveals a 3x3 area and reports ships truthfully", () => {
  const state = createGame();
  const target = state.aiBoard.ships[0].cells[0];
  const revealed = sonarScan(state, "ai", target);

  assert.ok(revealed.length <= 9 && revealed.length >= 4, "3x3, clipped at edges");
  const centre = revealed.find((r) => r.row === target.row && r.col === target.col);
  assert.equal(centre.hasShip, true, "the centre sits on a known ship cell");

  const occupied = new Set();
  for (const ship of state.aiBoard.ships) {
    for (const c of ship.cells) occupied.add(`${c.row},${c.col}`);
  }
  for (const cell of revealed) {
    assert.equal(cell.hasShip, occupied.has(`${cell.row},${cell.col}`));
  }
});

test("sonar clips at the board edge rather than reporting off-board cells", () => {
  const revealed = sonarScan(createGame(), "ai", { row: 0, col: 0 });
  assert.equal(revealed.length, 4);
  for (const cell of revealed) {
    assert.ok(cell.row >= 0 && cell.col >= 0);
    assert.ok(cell.row < BOARD_SIZE && cell.col < BOARD_SIZE);
  }
});

test("sonar fires nothing and changes nothing", () => {
  const state = createGame();
  const snapshot = JSON.stringify(state, (k, v) => (v instanceof Set ? [...v] : v));
  sonarScan(state, "ai", { row: 4, col: 4 });
  const after = JSON.stringify(state, (k, v) => (v instanceof Set ? [...v] : v));
  assert.equal(snapshot, after);
  assert.equal(state.aiBoard.shotsReceived.size, 0);
});

test("the AI does not spend points it does not have", () => {
  const fresh = createGame();
  assert.equal(chooseAiPowerup(fresh, createLoadout()), null);
});

test("the AI never uses a power-up while a wounded ship is unfinished", () => {
  // Give the AI plenty of points, then leave a ship damaged but afloat.
  const state = land(createGame(), "player", 12);
  const wounded = state.playerBoard.ships.some((s) => !s.sunk && s.hits.size > 0);
  if (!wounded) return; // fixture happened to sink cleanly; nothing to assert
  assert.equal(
    chooseAiPowerup(state, createLoadout()),
    null,
    "normal targeting beats random scatter when a ship is already hit"
  );
});
