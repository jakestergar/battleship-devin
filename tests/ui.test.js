// Tests the DOM-free helpers in src/ui.js. Importing the module in Node must
// not touch `document` — that's part of what these tests protect.
import test from "node:test";
import assert from "node:assert/strict";

import { BOARD_SIZE, createGame, fireAt } from "../src/engine.js";
import {
  isHorizontal,
  isPlacementLegal,
  mockChooseMove,
  normalizeProbabilityMap,
  renderBattleReport,
  renderEfficiencyStat,
} from "../src/ui.js";

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

test("mockChooseMove zeroes already-attacked cells in its heatmap", () => {
  let state = createGame();
  const target = { row: 4, col: 4 };
  state = fireAt(state, "player", target).newState;

  const move = mockChooseMove({ ...state, turn: "ai" });
  assert.equal(move.probabilityMap.length, BOARD_SIZE);
  assert.equal(move.probabilityMap[target.row][target.col], 0);
  assert.ok(move.probabilityMap.flat().some((weight) => weight > 0));
});

test("mockChooseMove degrades to a null move when the board is exhausted", () => {
  const state = createGame();
  const shotsReceived = new Set();
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) shotsReceived.add(`${row},${col}`);
  }

  const move = mockChooseMove({ ...state, playerBoard: { ...state.playerBoard, shotsReceived } });

  assert.equal(move.cell, undefined);
  assert.equal(move.explanation, null);
  assert.equal(move.probabilityMap, null);
});

test("isHorizontal reads a ship's axis, treating a single cell as horizontal", () => {
  const horizontal = { cells: [0, 1, 2].map((col) => ({ row: 3, col })) };
  const vertical = { cells: [0, 1, 2].map((row) => ({ row, col: 3 })) };

  assert.equal(isHorizontal(horizontal), true);
  assert.equal(isHorizontal(vertical), false);
  assert.equal(isHorizontal({ cells: [{ row: 7, col: 7 }] }), true);
});

test("the battle report and efficiency hooks are inert before the DOM exists", () => {
  renderBattleReport("Fleet destroyed in 42 shots.");
  renderEfficiencyStat("2.3x better than random search.");
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
