// Tests the DOM-free half of src/exhibition.js. Importing the module in Node
// must not touch `document` — that's part of what these tests protect.
import test from "node:test";
import assert from "node:assert/strict";

import { BOARD_SIZE, FLEET, createGame, randomFleetLayout } from "../src/engine.js";
import {
  MAX_TURNS,
  STEP_MS,
  activeTimerCount,
  createExhibitionMatch,
  createExhibitionState,
  mirrorView,
  mountExhibition,
  runExhibitionMatch,
  shapeIntensities,
} from "../src/exhibition.js";
import { normalizeProbabilityMap } from "../src/ui.js";

const TOTAL_HULL_CELLS = FLEET.reduce((n, f) => n + f.length, 0); // 17

function snapshot(state) {
  const board = (b) => ({
    size: b.size,
    shots: [...b.shotsReceived].sort(),
    ships: b.ships.map((s) => ({
      id: s.id,
      length: s.length,
      cells: s.cells.map((c) => `${c.row},${c.col}`),
      hits: [...s.hits].sort(),
      sunk: s.sunk,
    })),
  });
  return JSON.stringify({
    playerBoard: board(state.playerBoard),
    aiBoard: board(state.aiBoard),
    turn: state.turn,
    status: state.status,
    history: state.history,
  });
}

test("a full exhibition match terminates with a valid winner and sane shot counts", () => {
  for (let i = 0; i < 12; i++) {
    const { winner, shots, log } = runExhibitionMatch();

    assert.ok(winner === "alpha" || winner === "bravo", `bad winner: ${winner}`);
    assert.equal(shots.alpha + shots.bravo, log.length);
    assert.ok(log.length < MAX_TURNS, "match hit the runaway guard");

    for (const side of ["alpha", "bravo"]) {
      assert.ok(
        shots[side] >= TOTAL_HULL_CELLS && shots[side] <= 100,
        `${side} fired ${shots[side]} shots, outside sane bounds`
      );
    }

    // The winner sank all 17 hull cells; the loser moved first or second and
    // is therefore at most one shot ahead or behind.
    assert.ok(
      Math.abs(shots.alpha - shots.bravo) <= 1,
      `turn order broke: ${shots.alpha} vs ${shots.bravo}`
    );
  }
});

test("the winner really did sink the whole enemy fleet, per the engine", () => {
  const { winner, state } = runExhibitionMatch();
  // ALPHA holds the engine's "player" seat and shoots at aiBoard.
  const sunkBoard = winner === "alpha" ? state.aiBoard : state.playerBoard;
  const survivingBoard = winner === "alpha" ? state.playerBoard : state.aiBoard;
  assert.ok(sunkBoard.ships.every((s) => s.sunk), "loser still has a ship afloat");
  assert.ok(survivingBoard.ships.some((s) => !s.sunk), "both fleets were sunk");
});

test("every shot in a match was legal — no cell fired at twice on the same board", () => {
  for (let i = 0; i < 8; i++) {
    const { log, state } = runExhibitionMatch();
    const seen = { alpha: new Set(), bravo: new Set() };

    for (const record of log) {
      const k = `${record.cell.row},${record.cell.col}`;
      assert.ok(record.cell.row >= 0 && record.cell.row < BOARD_SIZE);
      assert.ok(record.cell.col >= 0 && record.cell.col < BOARD_SIZE);
      assert.ok(
        !seen[record.side].has(k),
        `${record.side} fired at ${k} twice`
      );
      seen[record.side].add(k);
      assert.ok(["hit", "miss", "sunk"].includes(record.result));
    }

    // Each side's shot set must match the shotsReceived on the board it
    // attacked, which the engine — not this module — maintains.
    assert.deepEqual(
      [...seen.alpha].sort(),
      [...state.aiBoard.shotsReceived].sort()
    );
    assert.deepEqual(
      [...seen.bravo].sort(),
      [...state.playerBoard.shotsReceived].sort()
    );
  }
});

test("sides strictly alternate and neither reads the other's board", () => {
  const { log } = runExhibitionMatch();
  assert.equal(log[0].side, "alpha");
  for (let i = 1; i < log.length; i++) {
    assert.notEqual(log[i].side, log[i - 1].side, `two shots in a row at turn ${i}`);
  }
  // A fair AI cannot be perfect: it must waste some shots on empty water.
  for (const side of ["alpha", "bravo"]) {
    const misses = log.filter((r) => r.side === side && r.result === "miss");
    assert.ok(misses.length > 0, `${side} never missed — it is cheating`);
  }
});

test("each move carries the contract fields the heatmap renders from", () => {
  const match = createExhibitionMatch();
  for (let i = 0; i < 20; i++) {
    const nextSide = match.nextSide;
    const targetBefore = new Set(
      nextSide === "alpha"
        ? match.state.aiBoard.shotsReceived
        : match.state.playerBoard.shotsReceived
    );
    const record = match.step();
    if (!record) break;
    assert.ok(record.confidence >= 0 && record.confidence <= 1);
    assert.equal(typeof record.explanation, "string");
    assert.ok(Array.isArray(record.probabilityMap));
    assert.equal(record.probabilityMap.length, BOARD_SIZE);
    for (const row of record.probabilityMap) {
      assert.equal(row.length, BOARD_SIZE);
      for (const w of row) assert.ok(Number.isFinite(w) && w >= 0);
    }
    // The map is the grid the decision was made from, so it must zero out
    // every cell already fired at *before* this shot.
    assert.equal(record.side, nextSide);
    for (const k of targetBefore) {
      const [row, col] = k.split(",").map(Number);
      assert.equal(record.probabilityMap[row][col], 0);
    }
  }
});

test("exhibition play does not mutate a GameState passed in from outside", () => {
  const external = createGame(randomFleetLayout(BOARD_SIZE));
  const before = snapshot(external);

  const match = createExhibitionMatch({ initialState: external });
  while (!match.over) {
    if (!match.step()) break;
  }

  assert.ok(match.winner, "the match should still have completed");
  assert.equal(snapshot(external), before, "the external GameState was mutated");
  assert.notEqual(match.state, external);
});

test("mirrorView is a pure relabelling and leaves its input alone", () => {
  const state = createExhibitionState();
  const before = snapshot(state);
  const view = mirrorView(state);

  assert.equal(view.playerBoard, state.aiBoard);
  assert.equal(view.aiBoard, state.playerBoard);
  assert.equal(view.turn, state.turn === "player" ? "ai" : "player");
  assert.equal(view.status, state.status);
  assert.equal(snapshot(state), before);

  const stepped = createExhibitionMatch({ initialState: state });
  stepped.step();
  stepped.step();
  const mirrored = mirrorView(stepped.state);
  for (let i = 0; i < mirrored.history.length; i++) {
    const original = stepped.state.history[i];
    assert.equal(
      mirrored.history[i].actor,
      original.actor === "player" ? "ai" : "player"
    );
    assert.notEqual(mirrored.history[i], original, "history entries were shared");
  }
});

test("STEP_MS keeps a full match comfortably under 30 seconds", () => {
  assert.ok(STEP_MS >= 120 && STEP_MS <= 250, "step pace is outside the brief");
  let worst = 0;
  for (let i = 0; i < 20; i++) {
    worst = Math.max(worst, runExhibitionMatch().log.length);
  }
  assert.ok(
    worst * STEP_MS < 30000,
    `worst match of ${worst} shots would take ${(worst * STEP_MS) / 1000}s`
  );
});

test("shapeIntensities keeps a hit-boosted map legible instead of one bright cell", () => {
  // Play until one side lands a hit, then shape the map it decided from —
  // this is the case linear alpha renders as a black field.
  const match = createExhibitionMatch();
  let hitRecord = null;
  while (!match.over && !hitRecord) {
    const record = match.step();
    if (!record) break;
    // The hit-linked phrasing only appears once HIT_BOOST_FACTOR is in play,
    // i.e. this is a map with the pathological spike in it.
    if (record.explanation && record.explanation.includes("completes")) {
      hitRecord = record;
    }
  }
  assert.ok(hitRecord, "no hit-boosted map appeared in a whole match");

  const raw = normalizeProbabilityMap(hitRecord.probabilityMap, BOARD_SIZE);
  const shaped = shapeIntensities(raw);
  const flatRaw = raw.flat();
  const flatShaped = shaped.flat();

  assert.equal(flatShaped.length, BOARD_SIZE * BOARD_SIZE);
  for (let i = 0; i < flatShaped.length; i++) {
    assert.ok(flatShaped[i] >= 0 && flatShaped[i] <= 1);
    // Zero stays zero: an already-fired cell must never light up.
    if (flatRaw[i] === 0) assert.equal(flatShaped[i], 0);
    else assert.ok(flatShaped[i] > 0);
  }
  assert.equal(Math.max(...flatShaped), 1, "the peak should saturate");
  const visible = flatShaped.filter((v) => v >= 0.25).length;
  assert.ok(visible >= 20, `only ${visible} cells would be visible after a hit`);
});

test("shapeIntensities is monotonic and survives a degenerate flat map", () => {
  const flat = Array.from({ length: BOARD_SIZE }, () => new Array(BOARD_SIZE).fill(1));
  const shapedFlat = shapeIntensities(flat).flat();
  assert.ok(shapedFlat.every((v) => v === shapedFlat[0] && v > 0 && v <= 1));

  const ramp = Array.from({ length: BOARD_SIZE }, (_, r) =>
    Array.from({ length: BOARD_SIZE }, (_, c) => (r * BOARD_SIZE + c + 1) / 100)
  );
  const shapedRamp = shapeIntensities(ramp).flat();
  for (let i = 1; i < shapedRamp.length; i++) {
    assert.ok(shapedRamp[i] >= shapedRamp[i - 1], "shaping reordered the map");
  }
});

test("headless play schedules no timers at all", () => {
  assert.equal(activeTimerCount(), 0);
  runExhibitionMatch();
  assert.equal(activeTimerCount(), 0, "a match left a timer behind");
});

test("mountExhibition degrades to an inert controller without a DOM", () => {
  assert.equal(typeof document, "undefined", "these tests must run headlessly");
  for (const bad of [undefined, null, {}, 42, "root"]) {
    const controller = mountExhibition(bad);
    assert.equal(typeof controller.start, "function");
    assert.equal(typeof controller.stop, "function");
    assert.equal(typeof controller.destroy, "function");
    controller.start();
    controller.stop();
    controller.destroy();
    assert.equal(activeTimerCount(), 0, "the inert controller created a timer");
  }
});
