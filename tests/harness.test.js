// Tests for the headless playtest harness. Importing it must not touch the
// DOM or run the entry point.
import test from "node:test";
import assert from "node:assert/strict";

import { BOARD_SIZE, createGame, fireAt } from "../src/engine.js";
import {
  MAX_MOVES,
  auditEngineContract,
  histogram,
  huntAndTargetChooseMove,
  makeRng,
  randomChooseMove,
  runBatch,
  simulateGame,
  withSeededRandom,
  STRATEGIES,
} from "../scripts/harness.js";

function key(row, col) {
  return `${row},${col}`;
}

test("makeRng is deterministic for a given seed and varies across seeds", () => {
  const a = makeRng(42);
  const b = makeRng(42);
  const c = makeRng(43);
  const seqA = [a(), a(), a()];
  const seqB = [b(), b(), b()];
  const seqC = [c(), c(), c()];
  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, seqC);
  for (const v of seqA) assert.ok(v >= 0 && v < 1);
});

test("withSeededRandom restores Math.random even when the body throws", () => {
  const original = Math.random;
  assert.throws(() =>
    withSeededRandom(1, () => {
      throw new Error("boom");
    })
  );
  assert.equal(Math.random, original);
});

test("withSeededRandom makes a whole game reproducible from its seed", () => {
  const play = () =>
    withSeededRandom(7, () =>
      simulateGame(STRATEGIES.bayesian.chooseMove, { mode: "clearing" })
    );
  const first = play();
  const second = play();
  assert.equal(first.aiShots, second.aiShots);
  assert.deepEqual(
    first.state.history.map((h) => `${h.cell.row},${h.cell.col},${h.result}`),
    second.state.history.map((h) => `${h.cell.row},${h.cell.col},${h.result}`)
  );
});

test("randomChooseMove only ever picks an unattacked cell on the target board", () => {
  let state = createGame();
  state = { ...state, turn: "ai" };
  for (let i = 0; i < 100 && state.status === "in_progress"; i++) {
    const move = randomChooseMove(state, "player");
    assert.ok(move, "ran out of moves before the board was clear");
    assert.equal(move.explanation, "random");
    assert.equal(move.confidence, null);
    assert.ok(
      !state.playerBoard.shotsReceived.has(key(move.cell.row, move.cell.col)),
      "random baseline repeated a shot"
    );
    state = fireAt(state, "player", move.cell).newState;
    if (state.status === "in_progress") state = { ...state, turn: "ai" };
  }
  assert.equal(state.status, "ai_won");
});

test("randomChooseMove returns null once every cell has been fired at", () => {
  let state = { ...createGame(), turn: "ai" };
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      state = fireAt(state, "player", { row, col }).newState;
      state = { ...state, turn: "ai" };
    }
  }
  assert.equal(randomChooseMove(state, "player"), null);
});

test("hunt-and-target fires adjacent to an unresolved hit", () => {
  // Hand-build a state with a single known hit and nothing else.
  const state = createGame();
  const ship = state.playerBoard.ships[0];
  const hit = ship.cells[0];
  const seeded = {
    ...state,
    turn: "ai",
    playerBoard: {
      ...state.playerBoard,
      shotsReceived: new Set([key(hit.row, hit.col)]),
      ships: state.playerBoard.ships.map((s) =>
        s.id === ship.id ? { ...s, hits: new Set([key(hit.row, hit.col)]) } : s
      ),
    },
    history: [
      {
        turnNumber: 1,
        actor: "ai",
        cell: { ...hit },
        result: "hit",
        shipId: ship.id,
      },
    ],
  };

  for (let i = 0; i < 20; i++) {
    const move = huntAndTargetChooseMove(seeded, "player");
    const distance = Math.abs(move.cell.row - hit.row) + Math.abs(move.cell.col - hit.col);
    assert.equal(distance, 1, `chose ${move.cell.row},${move.cell.col}, not adjacent to the hit`);
    assert.equal(move.explanation, "target: adjacent");
  }
});

test("hunt-and-target extends an established line of two hits", () => {
  // A horizontal pair of hits at (4,4) and (4,5): the only sensible next
  // shots are (4,3) and (4,6).
  const state = createGame();
  const hits = [
    { row: 4, col: 4 },
    { row: 4, col: 5 },
  ];
  const seeded = {
    ...state,
    turn: "ai",
    playerBoard: {
      ...state.playerBoard,
      shotsReceived: new Set(hits.map((c) => key(c.row, c.col))),
      // Give the hits to a ship that genuinely sits there so nothing else
      // in the state is contradictory; the strategy only reads history.
      ships: state.playerBoard.ships,
    },
    history: hits.map((cell, i) => ({
      turnNumber: i + 1,
      actor: "ai",
      cell,
      result: "hit",
      shipId: "carrier",
    })),
  };

  for (let i = 0; i < 20; i++) {
    const move = huntAndTargetChooseMove(seeded, "player");
    assert.equal(move.cell.row, 4);
    assert.ok(
      move.cell.col === 3 || move.cell.col === 6,
      `chose col ${move.cell.col}; expected to extend the line to 3 or 6`
    );
    assert.equal(move.explanation, "target: extend line");
  }
});

test("hunt-and-target falls back to random search with no unresolved hits", () => {
  const state = { ...createGame(), turn: "ai" };
  const move = huntAndTargetChooseMove(state, "player");
  assert.equal(move.explanation, "hunt: random");
});

test("hunt-and-target ignores hits belonging to an already-sunk ship", () => {
  let state = { ...createGame(), turn: "ai" };
  const ship = state.playerBoard.ships.find((s) => s.length === 2);
  for (const cell of ship.cells) {
    state = fireAt(state, "player", cell).newState;
    if (state.status === "in_progress") state = { ...state, turn: "ai" };
  }
  assert.ok(state.playerBoard.ships.find((s) => s.id === ship.id).sunk);
  const move = huntAndTargetChooseMove(state, "player");
  assert.equal(move.explanation, "hunt: random", "kept poking at a ship it had already sunk");
});

test("histogram buckets values and clamps out-of-range ones into the end bins", () => {
  const bins = histogram([15, 19, 20, 1, 500], 5, 15, 100);
  assert.equal(bins.length, 17);
  assert.equal(bins[0].lo, 15);
  assert.equal(bins[0].hi, 19);
  assert.equal(bins[0].count, 3, "15, 19 and the below-range 1 belong to the first bin");
  assert.equal(bins[1].count, 1);
  assert.equal(bins[bins.length - 1].count, 1, "the above-range 500 lands in the last bin");
  assert.equal(
    bins.reduce((sum, b) => sum + b.count, 0),
    5
  );
});

test("simulateGame plays a duel to completion with no invariant violations", () => {
  const result = withSeededRandom(123, () =>
    simulateGame(STRATEGIES.bayesian.chooseMove, { mode: "duel" })
  );
  assert.deepEqual(result.anomalies, []);
  assert.notEqual(result.status, "in_progress");
  assert.ok(result.moves > 0 && result.moves <= MAX_MOVES);
  assert.equal(result.aiShots + result.playerShots, result.state.history.length);
});

test("simulateGame clearing mode sinks every player ship using only AI shots", () => {
  const result = withSeededRandom(456, () =>
    simulateGame(STRATEGIES["hunt-and-target"].chooseMove, { mode: "clearing" })
  );
  assert.deepEqual(result.anomalies, []);
  assert.equal(result.status, "ai_won");
  assert.equal(result.playerShots, 0);
  assert.ok(result.state.playerBoard.ships.every((s) => s.sunk));
  assert.ok(result.aiShots >= 17 && result.aiShots <= 100);
});

test("simulateGame reports an anomaly when a strategy repeats a shot", () => {
  // A deliberately broken strategy that always fires at (0,0).
  const stuck = () => ({ cell: { row: 0, col: 0 }, confidence: null, explanation: "stuck" });
  const result = withSeededRandom(1, () => simulateGame(stuck, { mode: "clearing" }));
  const types = new Set(result.anomalies.map((a) => a.type));
  assert.ok(types.has("strategy-repeated-shot"), "did not flag the repeated shot");
  assert.ok(types.has("did-not-terminate"), "did not flag the non-terminating game");
  assert.ok(
    result.anomalies.every((a) => Array.isArray(a.history)),
    "anomalies must carry the move history so they can be reproduced"
  );
});

test("simulateGame reports an anomaly for an out-of-bounds or missing move", () => {
  const offBoard = () => ({ cell: { row: 12, col: 3 }, confidence: null, explanation: "bad" });
  const offResult = withSeededRandom(1, () => simulateGame(offBoard, { mode: "clearing" }));
  assert.ok(offResult.anomalies.some((a) => a.type === "move-out-of-bounds"));

  const noMove = () => null;
  const noneResult = withSeededRandom(1, () => simulateGame(noMove, { mode: "clearing" }));
  assert.ok(noneResult.anomalies.some((a) => a.type === "no-move-returned"));
});

test("simulateGame flags a confidence value outside 0-1", () => {
  const overconfident = (state) => ({
    ...randomChooseMove(state, "player"),
    confidence: 4.2,
  });
  const result = withSeededRandom(9, () => simulateGame(overconfident, { mode: "clearing" }));
  assert.ok(result.anomalies.some((a) => a.type === "confidence-out-of-range"));
});

test("runBatch tags every anomaly with a seed so it can be replayed", () => {
  const stuck = () => ({ cell: { row: 0, col: 0 }, confidence: null, explanation: "stuck" });
  const batch = runBatch(3, stuck, { mode: "clearing", baseSeed: 900, strategy: "stuck" });
  assert.equal(batch.games, 3);
  assert.ok(batch.anomalies.length > 0);
  for (const a of batch.anomalies) {
    assert.equal(a.strategy, "stuck");
    assert.ok(a.seed >= 900 && a.seed < 903);
    assert.equal(typeof a.message, "string");
  }
});

test("runBatch reports clean stats for a real strategy", () => {
  const batch = runBatch(12, STRATEGIES.bayesian.chooseMove, {
    mode: "clearing",
    baseSeed: 2024,
    strategy: "bayesian",
  });
  assert.deepEqual(batch.anomalies, []);
  assert.equal(batch.aiWins, 12);
  assert.equal(batch.winRate, 1);
  assert.ok(batch.avgAiShotsToWin > 17 && batch.avgAiShotsToWin < 100);
  assert.ok(batch.bestAiShotsToWin <= batch.medianAiShotsToWin);
  assert.ok(batch.medianAiShotsToWin <= batch.worstAiShotsToWin);
  assert.equal(
    batch.histogram.reduce((sum, b) => sum + b.count, 0),
    12
  );
});

test("the Bayesian AI beats hunt-and-target, which beats random search", () => {
  const run = (name) =>
    runBatch(30, STRATEGIES[name].chooseMove, {
      mode: "clearing",
      baseSeed: 555,
      strategy: name,
    }).avgAiShotsToWin;

  const random = run("random");
  const hunt = run("hunt-and-target");
  const bayes = run("bayesian");
  assert.ok(bayes < hunt, `bayesian ${bayes} should beat hunt-and-target ${hunt}`);
  assert.ok(hunt < random, `hunt-and-target ${hunt} should beat random ${random}`);
});

test("auditEngineContract returns fully reproducible findings", () => {
  const findings = auditEngineContract();
  assert.ok(Array.isArray(findings));
  for (const f of findings) {
    assert.equal(typeof f.type, "string");
    assert.ok(f.message.length > 20, "an anomaly must say what actually happened");
    assert.equal(typeof f.repro, "string");
  }
});
