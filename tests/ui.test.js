// Tests the DOM-free helpers in src/ui.js. Importing the module in Node must
// not touch `document` — that's part of what these tests protect.
import test from "node:test";
import assert from "node:assert/strict";

import { BOARD_SIZE, createGame, fireAt } from "../src/engine.js";
import { mockChooseMove, normalizeProbabilityMap } from "../src/ui.js";

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
