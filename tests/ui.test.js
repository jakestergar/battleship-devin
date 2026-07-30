// Tests the DOM-free helpers in src/ui.js. Importing the module in Node must
// not touch `document` — that's part of what these tests protect.
import test from "node:test";
import assert from "node:assert/strict";

import { BOARD_SIZE, createGame, fireAt } from "../src/engine.js";
import { isPlacementLegal, mockChooseMove, normalizeProbabilityMap } from "../src/ui.js";

function fullGrid(value) {
  return Array.from({ length: BOARD_SIZE }, () => new Array(BOARD_SIZE).fill(value));
}

test("mockChooseMove returns the AI contract shape and never repeats a shot", () => {
  let state = createGame();
  for (let i = 0; i < 40; i++) {
    const move = mockChooseMove(state);
    assert.equal(typeof move.cell.row, "number");
    assert.equal(typeof move.cell.col, "number");
    assert.ok(move.confidence >= 0 && move.confidence <= 1);
    assert.equal(typeof move.explanation, "string");
    assert.ok(
      !state.playerBoard.shotsReceived.has(`${move.cell.row},${move.cell.col}`),
      "mock AI chose an already-fired-upon cell"
    );
    state = fireAt(state, "player", move.cell).newState;
    if (state.status !== "in_progress") break;
    state = { ...state, turn: "ai" };
  }
});

test("normalizeProbabilityMap scales weights to a 0-1 peak", () => {
  const map = fullGrid(1);
  map[3][4] = 4;
  const normalized = normalizeProbabilityMap(map);
  assert.equal(normalized[3][4], 1);
  assert.equal(normalized[0][0], 0.25);
});

test("normalizeProbabilityMap rejects unusable input instead of throwing", () => {
  const wrongSize = Array.from({ length: 3 }, () => new Array(3).fill(1));
  const raggedRow = fullGrid(1);
  raggedRow[2] = [1, 2];
  const nonNumeric = fullGrid(1);
  nonNumeric[5][5] = "high";
  const notFinite = fullGrid(1);
  notFinite[1][1] = Infinity;

  for (const input of [
    undefined,
    null,
    "nope",
    [],
    wrongSize,
    raggedRow,
    nonNumeric,
    notFinite,
    fullGrid(0),
  ]) {
    assert.equal(normalizeProbabilityMap(input), null);
  }
});

test("isPlacementLegal blocks out-of-bounds and occupied cells", () => {
  const layout = [
    { id: "carrier", length: 5, cells: [0, 1, 2, 3, 4].map((col) => ({ row: 2, col })) },
  ];

  assert.equal(isPlacementLegal(layout, [{ row: 5, col: 5 }, { row: 5, col: 6 }]), true);
  assert.equal(isPlacementLegal(layout, [{ row: 2, col: 4 }, { row: 3, col: 4 }]), false);
  assert.equal(isPlacementLegal(layout, [{ row: 0, col: 9 }, { row: 0, col: 10 }]), false);
  assert.equal(isPlacementLegal(layout, [{ row: -1, col: 0 }]), false);
  assert.equal(isPlacementLegal(layout, []), false);
  assert.equal(isPlacementLegal(layout, null), false);
});

test("isPlacementLegal ignores the ship currently being moved", () => {
  const layout = [
    { id: "carrier", length: 5, cells: [0, 1, 2, 3, 4].map((col) => ({ row: 2, col })) },
  ];
  const overlapping = [1, 2, 3, 4, 5].map((col) => ({ row: 2, col }));

  assert.equal(isPlacementLegal(layout, overlapping), false);
  assert.equal(isPlacementLegal(layout, overlapping, BOARD_SIZE, "carrier"), true);
});
