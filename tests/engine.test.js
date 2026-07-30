import test from "node:test";
import assert from "node:assert/strict";
import { createGame, fireAt, isGameOver, FLEET, BOARD_SIZE } from "../src/engine.js";

function key(row, col) {
  return `${row},${col}`;
}

test("createGame places all ships without overlap or out-of-bounds cells, repeatedly", () => {
  for (let i = 0; i < 200; i++) {
    const state = createGame();
    for (const board of [state.playerBoard, state.aiBoard]) {
      assert.equal(board.ships.length, FLEET.length);
      const occupied = new Set();
      for (const ship of board.ships) {
        assert.equal(ship.cells.length, ship.length);
        for (const c of ship.cells) {
          assert.ok(c.row >= 0 && c.row < BOARD_SIZE, "row in bounds");
          assert.ok(c.col >= 0 && c.col < BOARD_SIZE, "col in bounds");
          const k = key(c.row, c.col);
          assert.ok(!occupied.has(k), "no overlap between ships");
          occupied.add(k);
        }
      }
    }
  }
});

test("firing at a cell twice is a no-op the second time", () => {
  let state = createGame();
  const cell = { row: 0, col: 0 };
  const first = fireAt(state, "ai", cell);
  assert.notEqual(first.result, "no-op");
  const second = fireAt(first.newState, "ai", cell);
  assert.equal(second.result, "no-op");
  assert.equal(second.newState, first.newState, "state is unchanged on no-op");
});

test("no-op does not flip the turn", () => {
  let state = createGame();
  const cell = { row: 0, col: 0 };
  const first = fireAt(state, "ai", cell);
  const turnAfterFirst = first.newState.turn;
  const second = fireAt(first.newState, "ai", cell);
  assert.equal(second.newState.turn, turnAfterFirst);
});

test("hitting every cell of a ship marks it sunk and reports 'sunk' on the final hit", () => {
  let state = createGame();
  // Force a known ship layout by targeting the AI board via direct fireAt
  // calls against the actual (randomly placed) destroyer for determinism-
  // free coverage: hit every cell of every ship on the AI board and confirm
  // each becomes sunk exactly once all its cells are hit.
  let current = state;
  const board = current.aiBoard;
  for (const ship of board.ships) {
    let sunkResult = null;
    for (const cell of ship.cells) {
      const { newState, result } = fireAt(current, "ai", cell);
      current = newState;
      sunkResult = result;
    }
    assert.equal(sunkResult, "sunk");
    const updatedShip = current.aiBoard.ships.find((s) => s.id === ship.id);
    assert.equal(updatedShip.sunk, true);
  }
});

test("isGameOver / status agree once a full fleet is sunk", () => {
  let current = createGame();
  for (const ship of current.aiBoard.ships) {
    for (const cell of ship.cells) {
      current = fireAt(current, "ai", cell).newState;
    }
  }
  assert.equal(isGameOver(current), true);
  assert.equal(current.status, "player_won");
});

test("fireAt does not mutate the input state (pure function)", () => {
  const state = createGame();
  const snapshotShots = state.aiBoard.shotsReceived.size;
  fireAt(state, "ai", { row: 5, col: 5 });
  assert.equal(state.aiBoard.shotsReceived.size, snapshotShots);
});
