import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  fireAt,
  isGameOver,
  randomFleetLayout,
  validateFleetLayout,
  FLEET,
  BOARD_SIZE,
} from "../src/engine.js";
import { key } from "../src/grid.js";

function layoutOf(overrides = {}) {
  // A hand-built legal layout: every ship on its own row, starting at col 0.
  return FLEET.map(({ id, length }, index) => ({
    id,
    length,
    cells: Array.from({ length }, (_, i) => ({ row: index, col: i })),
    ...(overrides[id] ?? {}),
  }));
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

test("randomFleetLayout produces layouts createGame accepts", () => {
  for (let i = 0; i < 50; i++) {
    const layout = randomFleetLayout();
    assert.equal(validateFleetLayout(layout).valid, true);
    const state = createGame(layout);
    for (const { id, cells } of layout) {
      const ship = state.playerBoard.ships.find((s) => s.id === id);
      assert.deepEqual(new Set(ship.cells.map((c) => key(c.row, c.col))), new Set(cells.map((c) => key(c.row, c.col))));
    }
  }
});

test("createGame honours a manual player layout and still randomizes the AI", () => {
  const layout = layoutOf();
  const state = createGame(layout);
  const carrier = state.playerBoard.ships.find((s) => s.id === "carrier");
  assert.deepEqual(carrier.cells[0], { row: 0, col: 0 });
  assert.equal(carrier.sunk, false);
  assert.equal(carrier.hits.size, 0);
  assert.equal(state.aiBoard.ships.length, FLEET.length);
});

test("validateFleetLayout rejects illegal layouts with a reason", () => {
  const cases = {
    "off the board": layoutOf({ carrier: { cells: [{ row: 0, col: 7 }, { row: 0, col: 8 }, { row: 0, col: 9 }, { row: 0, col: 10 }, { row: 0, col: 11 }] } }),
    overlapping: layoutOf({ battleship: { cells: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }] } }),
    diagonal: layoutOf({ destroyer: { cells: [{ row: 8, col: 0 }, { row: 9, col: 1 }] } }),
    "non-contiguous": layoutOf({ destroyer: { cells: [{ row: 8, col: 0 }, { row: 8, col: 4 }] } }),
    "wrong length": layoutOf({ destroyer: { cells: [{ row: 8, col: 0 }] } }),
  };

  for (const [label, layout] of Object.entries(cases)) {
    const { valid, error } = validateFleetLayout(layout);
    assert.equal(valid, false, `${label} should be rejected`);
    assert.equal(typeof error, "string");
  }

  assert.equal(validateFleetLayout([]).valid, false);
  assert.equal(validateFleetLayout(null).valid, false);
  assert.equal(validateFleetLayout(layoutOf().slice(1)).valid, false);
  assert.throws(() => createGame(layoutOf().slice(1)), /Invalid fleet layout/);
});

test("fireAt does not mutate the input state (pure function)", () => {
  const state = createGame();
  const snapshotShots = state.aiBoard.shotsReceived.size;
  fireAt(state, "ai", { row: 5, col: 5 });
  assert.equal(state.aiBoard.shotsReceived.size, snapshotShots);
});
