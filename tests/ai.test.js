import test from "node:test";
import assert from "node:assert/strict";
import { BOARD_SIZE, FLEET, createGame, fireAt } from "../src/engine.js";
import { computeProbabilityMap, chooseMove } from "../src/ai.js";

function key(row, col) {
  return `${row},${col}`;
}

// Fixed fleet layout in the bottom-left, so the top of the board is free
// for hand-constructed shot patterns.
const LAYOUT = {
  carrier: [
    { row: 9, col: 0 },
    { row: 9, col: 1 },
    { row: 9, col: 2 },
    { row: 9, col: 3 },
    { row: 9, col: 4 },
  ],
  battleship: [
    { row: 8, col: 0 },
    { row: 8, col: 1 },
    { row: 8, col: 2 },
    { row: 8, col: 3 },
  ],
  cruiser: [
    { row: 7, col: 0 },
    { row: 7, col: 1 },
    { row: 7, col: 2 },
  ],
  submarine: [
    { row: 6, col: 0 },
    { row: 6, col: 1 },
    { row: 6, col: 2 },
  ],
  destroyer: [
    { row: 5, col: 0 },
    { row: 5, col: 1 },
  ],
};

/**
 * Builds a GameState whose playerBoard (the board the AI attacks) reflects
 * the given AI shots. `shots` entries are { row, col, result, shipId }.
 */
function makeState(shots = []) {
  const ships = FLEET.map((f) => ({
    id: f.id,
    length: f.length,
    cells: LAYOUT[f.id].map((c) => ({ ...c })),
    hits: new Set(),
    sunk: false,
  }));
  const byId = new Map(ships.map((s) => [s.id, s]));

  const shotsReceived = new Set();
  const history = shots.map((shot, i) => {
    shotsReceived.add(key(shot.row, shot.col));
    if (shot.shipId) {
      const ship = byId.get(shot.shipId);
      ship.hits.add(key(shot.row, shot.col));
      if (shot.result === "sunk") ship.sunk = true;
    }
    return {
      turnNumber: i + 1,
      actor: "ai",
      cell: { row: shot.row, col: shot.col },
      result: shot.result,
      shipId: shot.shipId ?? null,
      probabilityMapSnapshot: null,
      confidence: null,
      explanation: null,
    };
  });

  return {
    playerBoard: { size: BOARD_SIZE, ships, shotsReceived },
    aiBoard: { size: BOARD_SIZE, ships: [], shotsReceived: new Set() },
    turn: "ai",
    status: "in_progress",
    history,
  };
}

test("empty board map is symmetric and favours the centre over the edges", () => {
  const grid = computeProbabilityMap(makeState());

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      assert.equal(
        grid[row][col],
        grid[BOARD_SIZE - 1 - row][BOARD_SIZE - 1 - col],
        "map is symmetric under 180-degree rotation"
      );
      assert.equal(grid[row][col], grid[col][row], "map is symmetric across the diagonal");
    }
  }

  assert.ok(grid[4][4] > grid[0][0], "centre is more likely than a corner");
  assert.ok(grid[4][4] > grid[0][4], "centre is more likely than an edge");
});

test("an unresolved hit dominates the map at its four neighbours", () => {
  const hit = { row: 4, col: 6 };
  const grid = computeProbabilityMap(
    makeState([{ ...hit, result: "hit", shipId: "carrier" }])
  );

  const neighbours = [
    { row: 3, col: 6 },
    { row: 5, col: 6 },
    { row: 4, col: 5 },
    { row: 4, col: 7 },
  ];
  const neighbourKeys = new Set(neighbours.map((c) => key(c.row, c.col)));
  const weakestNeighbour = Math.min(...neighbours.map((c) => grid[c.row][c.col]));

  assert.equal(grid[hit.row][hit.col], 0, "the hit cell itself is not re-targeted");
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (neighbourKeys.has(key(row, col))) continue;
      assert.ok(
        grid[row][col] < weakestNeighbour,
        `neighbours of the hit outweigh (${row},${col})`
      );
    }
  }
});

test("cells already fired at are zeroed out", () => {
  const shots = [
    { row: 0, col: 0, result: "miss" },
    { row: 3, col: 3, result: "miss" },
    { row: 4, col: 6, result: "hit", shipId: "carrier" },
  ];
  const grid = computeProbabilityMap(makeState(shots));
  for (const shot of shots) {
    assert.equal(grid[shot.row][shot.col], 0);
  }
});

test("chooseMove returns the documented shape and a legal, in-bounds cell", () => {
  const move = chooseMove(makeState([{ row: 4, col: 6, result: "hit", shipId: "carrier" }]));

  assert.equal(typeof move.cell.row, "number");
  assert.equal(typeof move.cell.col, "number");
  assert.equal(typeof move.confidence, "number");
  assert.equal(typeof move.explanation, "string");
  assert.ok(move.confidence > 0 && move.confidence <= 1);
  assert.match(move.explanation, /Bayesian Search Theory/);
  assert.deepEqual(Object.keys(move).sort(), ["cell", "confidence", "explanation"]);
});

test("chooseMove never selects a cell that has already been fired at", () => {
  // Fire at every cell except a handful, then confirm the AI only ever picks
  // from what's left, across many randomised draws.
  const shots = [];
  const open = new Set([key(2, 2), key(2, 3), key(7, 8), key(9, 9)]);
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (!open.has(key(row, col))) shots.push({ row, col, result: "miss" });
    }
  }
  const state = makeState(shots);

  for (let i = 0; i < 200; i++) {
    const { cell } = chooseMove(state);
    assert.ok(open.has(key(cell.row, cell.col)), "chose an unattacked cell");
  }
});

test("chooseMove stays legal across a full self-played game", () => {
  for (let game = 0; game < 20; game++) {
    let state = createGame();
    state = { ...state, turn: "ai" };
    let moves = 0;
    while (state.status === "in_progress" && moves < BOARD_SIZE * BOARD_SIZE) {
      const before = new Set(state.playerBoard.shotsReceived);
      const move = chooseMove(state);
      assert.ok(!before.has(key(move.cell.row, move.cell.col)), "shot is legal");
      const { newState, result } = fireAt(state, "player", move.cell);
      assert.notEqual(result, "no-op");
      state = { ...newState, turn: "ai" };
      moves++;
    }
    assert.equal(state.status, "ai_won", "the AI finishes the board");
    assert.ok(moves < BOARD_SIZE * BOARD_SIZE, "and does so without exhausting every cell");
  }
});

test("the AI does not read unsunk ships' positions", () => {
  const shots = [
    { row: 0, col: 0, result: "miss" },
    { row: 4, col: 6, result: "hit", shipId: "carrier" },
    { row: 5, col: 0, result: "hit", shipId: "destroyer" },
    { row: 5, col: 1, result: "sunk", shipId: "destroyer" },
  ];
  const before = computeProbabilityMap(makeState(shots));

  // Move every still-unsunk ship somewhere completely different, keeping
  // shotsReceived and history identical. A fair AI can't notice.
  const state = makeState(shots);
  for (const ship of state.playerBoard.ships) {
    if (ship.id === "destroyer") continue;
    ship.cells = ship.cells.map((c, i) => ({ row: 0, col: i }));
  }
  const after = computeProbabilityMap(state);

  assert.deepEqual(after, before);
});

test("sinking a ship removes its length from later probability calculations", () => {
  // Two states with identical blocked cells: in one the destroyer is sunk
  // there, in the other those cells were plain misses.
  const sunkDestroyer = makeState([
    { row: 5, col: 0, result: "hit", shipId: "destroyer" },
    { row: 5, col: 1, result: "sunk", shipId: "destroyer" },
  ]);
  const twoMisses = makeState([
    { row: 5, col: 0, result: "miss" },
    { row: 5, col: 1, result: "miss" },
  ]);

  const withoutDestroyer = computeProbabilityMap(sunkDestroyer);
  const withDestroyer = computeProbabilityMap(twoMisses);

  let strictlyLowerSomewhere = false;
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      assert.ok(
        withoutDestroyer[row][col] <= withDestroyer[row][col],
        `(${row},${col}) cannot gain weight from a sunk ship`
      );
      if (withoutDestroyer[row][col] < withDestroyer[row][col]) strictlyLowerSomewhere = true;
    }
  }
  assert.ok(strictlyLowerSomewhere, "the sunk ship's placements are gone");
});

test("a fully sunk fleet leaves no probability mass", () => {
  const shots = [];
  for (const f of FLEET) {
    LAYOUT[f.id].forEach((c, i) => {
      shots.push({
        ...c,
        result: i === LAYOUT[f.id].length - 1 ? "sunk" : "hit",
        shipId: f.id,
      });
    });
  }
  const grid = computeProbabilityMap(makeState(shots));
  assert.equal(grid.flat().reduce((a, b) => a + b, 0), 0);
});

test("confidence is more concentrated next to a hit than during the hunt", () => {
  const hunt = chooseMove(makeState());
  const chase = chooseMove(makeState([{ row: 4, col: 6, result: "hit", shipId: "carrier" }]));
  assert.ok(chase.confidence > hunt.confidence);
});

test("explanations cite the unresolved hit when finishing a ship off", () => {
  const move = chooseMove(makeState([{ row: 4, col: 6, result: "hit", shipId: "carrier" }]));
  assert.match(move.explanation, /valid placements for the ship hit at \(4,6\)/);

  const hunting = chooseMove(makeState());
  assert.match(hunting.explanation, /highest-probability cell across \d+ possible/);
});
