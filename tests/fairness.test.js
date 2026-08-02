import test from "node:test";
import assert from "node:assert/strict";
import { BOARD_SIZE, FLEET, createGame, fireAt } from "../src/engine.js";
import { computeProbabilityMap, chooseMove } from "../src/ai.js";
import { verifyFairness, hashGrid } from "../src/fairness.js";

function key(row, col) {
  return `${row},${col}`;
}

// Same fixed layout style as tests/ai.test.js: fleet in the bottom-left so
// the top of the board is free for hand-built shot patterns.
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

// A mid-game position: some misses, one sunk ship (its cells are public and
// must be held fixed), and one unresolved hit the shuffle has to keep
// explaining.
const MID_GAME_SHOTS = [
  { row: 0, col: 0, result: "miss" },
  { row: 2, col: 7, result: "miss" },
  { row: 3, col: 3, result: "miss" },
  { row: 5, col: 0, result: "hit", shipId: "destroyer" },
  { row: 5, col: 1, result: "sunk", shipId: "destroyer" },
  { row: 7, col: 1, result: "hit", shipId: "cruiser" },
];

function snapshot(state) {
  return JSON.stringify({
    ships: state.playerBoard.ships.map((s) => ({
      id: s.id,
      cells: s.cells,
      hits: [...s.hits].sort(),
      sunk: s.sunk,
    })),
    shotsReceived: [...state.playerBoard.shotsReceived].sort(),
    history: state.history,
    turn: state.turn,
    status: state.status,
  });
}

test("hashGrid is deterministic and sensitive to a single cell", () => {
  const a = Array.from({ length: 3 }, (_, r) =>
    Array.from({ length: 3 }, (_, c) => r * 3 + c)
  );
  const b = a.map((row) => [...row]);
  assert.equal(hashGrid(a), hashGrid(b), "same grid, same hash");

  b[1][1] += 1;
  assert.notEqual(hashGrid(a), hashGrid(b), "one changed cell changes the hash");

  // Row boundaries are part of the hashed string, so grids that flatten to
  // the same sequence but are shaped differently still differ.
  assert.notEqual(
    hashGrid([[1, 2], [3, 4]]),
    hashGrid([[1, 2, 3, 4]]),
    "row structure is hashed, not just the flat sequence"
  );
  assert.match(hashGrid(a), /^[0-9a-f]{8}$/);
});

test("mid-game state verifies: several relocations, all identical maps", () => {
  const result = verifyFairness(makeState(MID_GAME_SHOTS));

  assert.equal(result.ok, true);
  assert.ok(result.trials > 0, `expected trials > 0, got ${result.trials}`);
  assert.equal(result.trialHashes.length, result.trials);
  for (const hash of result.trialHashes) {
    assert.equal(hash, result.referenceHash);
  }
  assert.match(result.referenceHash, /^[0-9a-f]{8}$/);
  assert.equal(typeof result.chosenCell.row, "number");
  assert.equal(typeof result.chosenCell.col, "number");
});

test("the chosen cell matches the peak of the real probability map", () => {
  const state = makeState(MID_GAME_SHOTS);
  const grid = computeProbabilityMap(state);
  const peak = Math.max(...grid.flat());
  const { chosenCell } = verifyFairness(state);
  assert.equal(grid[chosenCell.row][chosenCell.col], peak);
  // And the AI's own (randomly tie-broken) pick sits at the same peak.
  const move = chooseMove(state);
  assert.equal(grid[move.cell.row][move.cell.col], peak);
});

test("verifyFairness does not mutate the state it is given", () => {
  const state = makeState(MID_GAME_SHOTS);
  const before = snapshot(state);
  verifyFairness(state, { trials: 8 });
  assert.equal(snapshot(state), before);
});

test("shuffles stay consistent with the public record", () => {
  // Instead of trusting the relocation code, inspect every board it hands to
  // the map function and assert the public record is intact on each one.
  const state = makeState(MID_GAME_SHOTS);
  const sunkCells = new Set(
    LAYOUT.destroyer.map((c) => key(c.row, c.col))
  );
  const misses = new Set(
    MID_GAME_SHOTS.filter((s) => s.result === "miss").map((s) => key(s.row, s.col))
  );
  const openHits = new Set([key(7, 1)]);

  let boards = 0;
  const spy = (candidate) => {
    boards++;
    const occupied = new Map();
    for (const ship of candidate.playerBoard.ships) {
      assert.equal(ship.cells.length, ship.length, `${ship.id} keeps its length`);
      for (const c of ship.cells) {
        const k = key(c.row, c.col);
        assert.ok(!occupied.has(k), `${ship.id} overlaps ${occupied.get(k)}`);
        occupied.set(k, ship.id);
        if (!sunkCells.has(k)) {
          assert.ok(!misses.has(k), `${ship.id} sits on a reported miss at ${k}`);
        }
      }
    }
    for (const k of sunkCells) {
      assert.equal(occupied.get(k), "destroyer", "the sunk ship never moves");
    }
    for (const k of openHits) {
      assert.ok(occupied.has(k), `open hit ${k} is still explained by some ship`);
      assert.notEqual(occupied.get(k), "destroyer");
    }
    assert.deepEqual(
      [...candidate.playerBoard.shotsReceived].sort(),
      [...state.playerBoard.shotsReceived].sort(),
      "shotsReceived is held fixed"
    );
    assert.deepEqual(candidate.history, state.history, "history is held fixed");
    if (boards > 1) {
      // Boards after the reference are relocations: every unsunk ship moved.
      for (const ship of candidate.playerBoard.ships) {
        if (ship.id === "destroyer") continue;
        assert.notDeepEqual(
          ship.cells,
          LAYOUT[ship.id],
          `${ship.id} was actually relocated`
        );
      }
    }
    return computeProbabilityMap(candidate);
  };

  const result = verifyFairness(state, { computeMap: spy });
  assert.equal(result.ok, true);
  assert.equal(boards, result.trials + 1);
});

// ---------------------------------------------------------------------------
// The test that gives the checker teeth.
// ---------------------------------------------------------------------------

/**
 * A deliberately cheating targeting function: it starts from the honest map
 * and then adds weight on the cells of the player's *unsunk* ships — exactly
 * the information a fair AI must not read. If verifyFairness cannot catch
 * this, it is worthless.
 */
function cheatingMap(state) {
  const grid = computeProbabilityMap(state);
  for (const ship of state.playerBoard.ships) {
    if (ship.sunk) continue;
    for (const c of ship.cells) {
      if (!state.playerBoard.shotsReceived.has(key(c.row, c.col))) {
        grid[c.row][c.col] += 1e6;
      }
    }
  }
  return grid;
}

test("a cheating map function is caught: ok false, hashes differ", () => {
  const state = makeState(MID_GAME_SHOTS);
  const result = verifyFairness(state, { computeMap: cheatingMap });

  assert.ok(result.trials > 0, "the shuffle test actually ran");
  assert.equal(result.ok, false, "peeking at unsunk ships must be detected");
  assert.ok(
    result.trialHashes.some((h) => h !== result.referenceHash),
    "at least one relocated board produces a different map"
  );
});

test("a subtler cheat — one extra point on a single unsunk cell — is caught", () => {
  const state = makeState(MID_GAME_SHOTS);
  const sneaky = (s) => {
    const grid = computeProbabilityMap(s);
    const carrier = s.playerBoard.ships.find((x) => x.id === "carrier");
    const bow = carrier.cells[0];
    grid[bow.row][bow.col] += 1;
    return grid;
  };
  const result = verifyFairness(state, { computeMap: sneaky });
  assert.equal(result.ok, false);
});

test("an early-game board (no shots at all) still verifies", () => {
  const result = verifyFairness(makeState([]));
  assert.equal(result.ok, true);
  assert.ok(result.trials > 0);
});

test("reports trials: 0 honestly when no consistent relocation exists", () => {
  // Fire at every cell except the two the destroyer occupies: nothing can be
  // relocated anywhere, so the checker must decline rather than claim a pass.
  const shots = [];
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const k = key(row, col);
      const ship = Object.entries(LAYOUT).find(([, cells]) =>
        cells.some((c) => key(c.row, c.col) === k)
      );
      if (ship && ship[0] === "destroyer") continue;
      shots.push(
        ship
          ? { row, col, result: "hit", shipId: ship[0] }
          : { row, col, result: "miss" }
      );
    }
  }
  // Mark the four non-destroyer ships as fully sunk on their last cell.
  for (const id of ["carrier", "battleship", "cruiser", "submarine"]) {
    const last = LAYOUT[id][LAYOUT[id].length - 1];
    const entry = shots.find((s) => s.row === last.row && s.col === last.col);
    entry.result = "sunk";
  }

  const result = verifyFairness(makeState(shots));
  assert.equal(result.trials, 0);
  assert.equal(result.trialHashes.length, 0);
  assert.equal(result.ok, true, "vacuously true — the UI must say 'not verified'");
  assert.match(result.referenceHash, /^[0-9a-f]{8}$/);
});

test("verifies across real, self-played mid-game positions", () => {
  let verified = 0;
  let declined = 0;
  for (let game = 0; game < 5; game++) {
    let state = { ...createGame(), turn: "ai" };
    for (let move = 0; move < 30 && state.status === "in_progress"; move++) {
      const { cell } = chooseMove(state);
      state = { ...fireAt(state, "player", cell).newState, turn: "ai" };
      if (move % 6 !== 0) continue;
      const result = verifyFairness(state, { trials: 3 });
      assert.equal(result.ok, true, `fairness failed at move ${move}`);
      if (result.trials > 0) verified++;
      else declined++;
    }
  }
  assert.ok(verified > declined, `verified ${verified}, declined ${declined}`);
});
