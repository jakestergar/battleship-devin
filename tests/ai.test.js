import test from "node:test";
import assert from "node:assert/strict";
import { BOARD_SIZE, FLEET, createGame, fireAt, isGameOver } from "../src/engine.js";
import { computeProbabilityMap, chooseMove } from "../src/ai.js";

function key(row, col) {
  return `${row},${col}`;
}

/**
 * Builds a GameState whose playerBoard has a chosen ship layout, then
 * replays a list of AI shots through the real engine so `shotsReceived` and
 * `history` are exactly what a real game would produce.
 */
function stateWithShots(shipLayout, shots) {
  let state = createGame();
  state = {
    ...state,
    playerBoard: {
      size: BOARD_SIZE,
      ships: shipLayout.map(({ id, length, cells }) => ({
        id,
        length,
        cells: cells.map((c) => ({ ...c })),
        hits: new Set(),
        sunk: false,
      })),
      shotsReceived: new Set(),
    },
    turn: "ai",
  };
  for (const cell of shots) {
    state = { ...state, turn: "ai" };
    state = fireAt(state, "player", cell).newState;
  }
  return { ...state, turn: "ai" };
}

// A full fleet laid out along the top rows, leaving the bottom half empty.
const FLEET_LAYOUT = [
  { id: "carrier", length: 5, cells: rowCells(0, 0, 5) },
  { id: "battleship", length: 4, cells: rowCells(1, 0, 4) },
  { id: "cruiser", length: 3, cells: rowCells(2, 0, 3) },
  { id: "submarine", length: 3, cells: rowCells(3, 0, 3) },
  { id: "destroyer", length: 2, cells: rowCells(4, 0, 2) },
];

function rowCells(row, col, length) {
  return Array.from({ length }, (_, i) => ({ row, col: col + i }));
}

test("empty board map is symmetric and peaks in the centre", () => {
  const state = stateWithShots(FLEET_LAYOUT, []);
  const map = computeProbabilityMap(state);

  assert.equal(map.length, BOARD_SIZE);
  map.forEach((row) => assert.equal(row.length, BOARD_SIZE));

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const mirroredRow = BOARD_SIZE - 1 - row;
      const mirroredCol = BOARD_SIZE - 1 - col;
      assert.equal(map[row][col], map[mirroredRow][mirroredCol], "180deg symmetric");
      assert.equal(map[row][col], map[col][row], "transpose-symmetric");
    }
  }

  // Corners are the hardest cells to cover, the centre the easiest.
  assert.ok(map[4][4] > map[0][0]);
  assert.ok(map[4][4] === Math.max(...map.flat()));
});

test("a miss zeroes its own cell and lowers its neighbours' weights", () => {
  const empty = computeProbabilityMap(stateWithShots(FLEET_LAYOUT, []));
  const afterMiss = computeProbabilityMap(
    stateWithShots(FLEET_LAYOUT, [{ row: 9, col: 9 }])
  );

  assert.equal(afterMiss[9][9], 0, "fired-upon cell is zeroed");
  assert.ok(afterMiss[9][8] < empty[9][8], "neighbour loses placements");
  assert.equal(afterMiss[0][0], empty[0][0], "far side is unaffected");
});

test("one unresolved hit heavily weights the four adjacent cells", () => {
  // (2,0) is the cruiser's left end -> a hit that does not sink it.
  const state = stateWithShots(FLEET_LAYOUT, [{ row: 2, col: 0 }]);
  const map = computeProbabilityMap(state);

  assert.equal(map[2][0], 0, "the hit cell itself is not a candidate");

  const adjacent = [map[1][0], map[3][0], map[2][1]];
  // Cells sharing the hit's row or column can still be covered by a
  // placement through the hit, so they are legitimately boosted too; compare
  // against cells that can never be part of such a placement.
  const elsewhere = [];
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (row !== 2 && col !== 0) elsewhere.push(map[row][col]);
    }
  }

  const maxElsewhere = Math.max(...elsewhere);
  for (const w of adjacent) {
    assert.ok(w > maxElsewhere * 10, "adjacent cells dominate the rest of the board");
  }

  const move = chooseMove(state);
  assert.ok(
    adjacent.includes(map[move.cell.row][move.cell.col]) && map[move.cell.row][move.cell.col] > 0,
    "the AI shoots adjacent to the unresolved hit"
  );
  assert.match(move.explanation, /Bayesian Search Theory/);
  assert.match(move.explanation, /ship hit at \(2,0\)/);
});

test("confidence is higher when finishing a hit than during the hunt phase", () => {
  const hunt = chooseMove(stateWithShots(FLEET_LAYOUT, []));
  const finishing = chooseMove(stateWithShots(FLEET_LAYOUT, [{ row: 2, col: 0 }]));

  for (const move of [hunt, finishing]) {
    assert.ok(move.confidence > 0 && move.confidence <= 1, "confidence in (0,1]");
  }
  assert.ok(finishing.confidence > hunt.confidence);
  assert.match(hunt.explanation, /possible remaining ship configurations/);
});

test("chooseMove returns the exact contract shape", () => {
  const move = chooseMove(stateWithShots(FLEET_LAYOUT, [{ row: 5, col: 5 }]));

  assert.deepEqual(Object.keys(move).sort(), ["cell", "confidence", "explanation"]);
  assert.deepEqual(Object.keys(move.cell).sort(), ["col", "row"]);
  assert.equal(typeof move.cell.row, "number");
  assert.equal(typeof move.cell.col, "number");
  assert.equal(typeof move.confidence, "number");
  assert.equal(typeof move.explanation, "string");
  assert.ok(move.explanation.length > 0);
});

test("chooseMove never selects a cell already in shotsReceived", () => {
  let state = createGame();
  state = { ...state, turn: "ai" };

  for (let i = 0; i < BOARD_SIZE * BOARD_SIZE - 1; i++) {
    if (isGameOver(state)) break;
    const { cell } = chooseMove(state);
    assert.ok(
      !state.playerBoard.shotsReceived.has(key(cell.row, cell.col)),
      `turn ${i}: AI re-fired at ${key(cell.row, cell.col)}`
    );
    state = { ...fireAt(state, "player", cell).newState, turn: "ai" };
  }

  assert.ok(isGameOver(state), "the AI finishes the board well within 100 shots");
  assert.equal(state.status, "ai_won");
});

test("the map ignores unsunk ships' real positions (no cheating)", () => {
  const shots = [
    { row: 2, col: 0 },
    { row: 9, col: 9 },
    { row: 0, col: 7 },
  ];
  const honest = computeProbabilityMap(stateWithShots(FLEET_LAYOUT, shots));

  // Same shot history and results, but every unsunk ship's `cells` array is
  // mutated to a different (bogus) location afterwards. A cheating AI would
  // read those and produce a different map.
  const tampered = stateWithShots(FLEET_LAYOUT, shots);
  for (const ship of tampered.playerBoard.ships) {
    assert.equal(ship.sunk, false);
    ship.cells = rowCells(7, 0, ship.length);
  }

  assert.deepEqual(computeProbabilityMap(tampered), honest);
});

test("sinking a ship removes its length from the remaining fleet", () => {
  // Sink the destroyer at (4,0)-(4,1) and nothing else.
  const state = stateWithShots(FLEET_LAYOUT, [
    { row: 4, col: 0 },
    { row: 4, col: 1 },
  ]);
  const destroyer = state.playerBoard.ships.find((s) => s.id === "destroyer");
  assert.equal(destroyer.sunk, true);

  const map = computeProbabilityMap(state);
  assert.equal(map[4][0], 0, "revealed sunk cells are worthless");
  assert.equal(map[4][1], 0);

  // No unresolved hits remain, so the map is a pure hunt-phase map for the
  // 5/4/3/3 fleet: every weight must be a plain placement count, with no
  // boosted (>= 100) cell anywhere.
  assert.ok(Math.max(...map.flat()) < 100, "no unresolved-hit boost remains");

  // Compare against the same board where the destroyer is only damaged: the
  // remaining fleet then still includes a length-2 ship, and the hit is
  // unresolved, so cells next to it are boosted instead of zeroed.
  const damaged = computeProbabilityMap(stateWithShots(FLEET_LAYOUT, [{ row: 4, col: 0 }]));
  assert.ok(damaged[4][1] > 100, "an unresolved hit boosts its neighbour");

  const move = chooseMove(state);
  assert.match(move.explanation, /possible remaining ship configurations/);
});

test("computeProbabilityMap is pure", () => {
  const state = stateWithShots(FLEET_LAYOUT, [{ row: 3, col: 3 }]);
  const snapshot = JSON.stringify({
    shots: [...state.playerBoard.shotsReceived].sort(),
    history: state.history,
    ships: state.playerBoard.ships.map((s) => ({ ...s, hits: [...s.hits].sort() })),
  });

  computeProbabilityMap(state);
  chooseMove(state);

  assert.equal(
    JSON.stringify({
      shots: [...state.playerBoard.shotsReceived].sort(),
      history: state.history,
      ships: state.playerBoard.ships.map((s) => ({ ...s, hits: [...s.hits].sort() })),
    }),
    snapshot
  );
});

test("the AI beats a random searcher on average shots to clear the board", () => {
  const shotsToWin = (pick) => {
    let state = { ...createGame(), turn: "ai" };
    let shots = 0;
    while (!isGameOver(state)) {
      state = { ...fireAt(state, "player", pick(state)).newState, turn: "ai" };
      shots++;
    }
    return shots;
  };

  const randomPick = (state) => {
    const open = [];
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (!state.playerBoard.shotsReceived.has(key(row, col))) open.push({ row, col });
      }
    }
    return open[Math.floor(Math.random() * open.length)];
  };

  const games = 20;
  let ai = 0;
  let random = 0;
  for (let i = 0; i < games; i++) {
    ai += shotsToWin((state) => chooseMove(state).cell);
    random += shotsToWin(randomPick);
  }

  assert.ok(ai / games < random / games, `ai ${ai / games} vs random ${random / games}`);
  assert.ok(ai / games < 60, `expected well under 60 shots on average, got ${ai / games}`);
});

test("the map has no hidden DOM/browser dependency", () => {
  assert.equal(typeof globalThis.document, "undefined");
  assert.equal(typeof globalThis.window, "undefined");
  assert.equal(FLEET.length, 5);
  assert.ok(computeProbabilityMap(stateWithShots(FLEET_LAYOUT, [])).length === BOARD_SIZE);
});
