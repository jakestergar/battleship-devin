import test from "node:test";
import assert from "node:assert/strict";
import { BOARD_SIZE, FLEET, createGame, fireAt } from "../src/engine.js";
import { computeProbabilityMap } from "../src/ai.js";
import { formatCell, formatCoachReport, gradePlayerShots } from "../src/coach.js";
import { mountCoach } from "../src/coach-ui.js";

function key(row, col) {
  return `${row},${col}`;
}

// Fixed enemy layout so every assertion below is deterministic.
const AI_LAYOUT = {
  carrier: [
    { row: 0, col: 0 },
    { row: 1, col: 0 },
    { row: 2, col: 0 },
    { row: 3, col: 0 },
    { row: 4, col: 0 },
  ],
  battleship: [
    { row: 2, col: 4 },
    { row: 2, col: 5 },
    { row: 2, col: 6 },
    { row: 2, col: 7 },
  ],
  cruiser: [
    { row: 6, col: 2 },
    { row: 7, col: 2 },
    { row: 8, col: 2 },
  ],
  submarine: [
    { row: 5, col: 7 },
    { row: 5, col: 8 },
    { row: 5, col: 9 },
  ],
  destroyer: [
    { row: 9, col: 5 },
    { row: 9, col: 6 },
  ],
};

function boardFromLayout(layout) {
  return {
    size: BOARD_SIZE,
    ships: FLEET.map(({ id, length }) => ({
      id,
      length,
      cells: layout[id].map((c) => ({ ...c })),
      hits: new Set(),
      sunk: false,
    })),
    shotsReceived: new Set(),
  };
}

/** A game whose enemy board is the fixed layout above. */
function newGame() {
  const state = createGame();
  state.aiBoard = boardFromLayout(AI_LAYOUT);
  state.turn = "player";
  return state;
}

/**
 * Fires one player shot at the enemy board and keeps the turn with the
 * player — these tests grade the human, so the AI never shoots.
 */
function playerFire(state, cell) {
  const { newState } = fireAt(state, "ai", cell);
  if (newState.status === "in_progress") newState.turn = "player";
  return newState;
}

/**
 * An independent reimplementation of the per-turn knowledge reconstruction,
 * written from the contract in planning/technical-design.md rather than
 * copied from src/coach.js, so that the tests cross-check the module instead
 * of agreeing with its own bugs.
 */
function probabilityMapForPlayer(state) {
  const shotsReceived = new Set(state.aiBoard.shotsReceived);
  const mirror = {
    playerBoard: {
      size: BOARD_SIZE,
      ships: state.aiBoard.ships.map((s) => ({ ...s })),
      shotsReceived,
    },
    aiBoard: { size: BOARD_SIZE, ships: [], shotsReceived: new Set() },
    turn: "ai",
    status: "in_progress",
    history: state.history
      .filter((h) => h.actor === "player")
      .map((h) => ({ ...h, actor: "ai" })),
  };
  return computeProbabilityMap(mirror);
}

function availableCells(state) {
  const out = [];
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (!state.aiBoard.shotsReceived.has(key(row, col))) out.push({ row, col });
    }
  }
  return out;
}

/** Plays a whole game where the human picks cells by `pick(grid, cells)`. */
function playGame(pick) {
  let state = newGame();
  for (let i = 0; i < 200 && state.status === "in_progress"; i++) {
    const grid = probabilityMapForPlayer(state);
    const cells = availableCells(state);
    if (cells.length === 0) break;
    state = playerFire(state, pick(grid, cells));
  }
  return state;
}

const pickBest = (grid, cells) =>
  cells.reduce((a, b) => (grid[b.row][b.col] > grid[a.row][a.col] ? b : a));
const pickWorst = (grid, cells) =>
  cells.reduce((a, b) => (grid[b.row][b.col] < grid[a.row][a.col] ? b : a));

// ---------------------------------------------------------------------------

test("formatCell uses the board's A-J / 1-10 labels", () => {
  assert.equal(formatCell({ row: 0, col: 0 }), "A1");
  assert.equal(formatCell({ row: 5, col: 4 }), "F5");
  assert.equal(formatCell({ row: 9, col: 9 }), "J10");
});

test("a player who always fires at the peak cell scores at or near 1.0", () => {
  const state = playGame(pickBest);
  const grade = gradePlayerShots(state);

  assert.equal(state.status, "player_won");
  assert.ok(grade.totalShots > 0);
  assert.ok(grade.gradedShots > 0);
  assert.ok(
    grade.score >= 0.999,
    `optimal player should score ~1.0, got ${grade.score}`
  );
  assert.equal(grade.matchedBest, grade.gradedShots);
  for (const shot of grade.shots) {
    if (shot.graded) assert.equal(shot.rank, 1);
  }
});

test("a player who always fires at the weakest cell scores markedly lower", () => {
  const optimal = gradePlayerShots(playGame(pickBest));
  const worst = gradePlayerShots(playGame(pickWorst));

  assert.ok(worst.gradedShots > 10, "worst-case game should have gradeable turns");
  assert.ok(
    worst.score < 0.1,
    `worst-case player should score near zero, got ${worst.score}`
  );
  // The explicit gap the brief asks for.
  assert.ok(
    optimal.score - worst.score > 0.85,
    `expected a wide gap; optimal=${optimal.score} worst=${worst.score}`
  );
  assert.ok(worst.matchedBest < worst.gradedShots);
  assert.equal(worst.worstShots.length, 3);
});

test("gradePlayerShots does not mutate the state it is given", () => {
  const state = playGame(pickBest);

  const snapshot = (s) =>
    JSON.stringify({
      status: s.status,
      turn: s.turn,
      history: s.history,
      boards: [s.playerBoard, s.aiBoard].map((b) => ({
        size: b.size,
        shots: [...b.shotsReceived].sort(),
        ships: b.ships.map((sh) => ({
          id: sh.id,
          cells: sh.cells,
          hits: [...sh.hits].sort(),
          sunk: sh.sunk,
        })),
      })),
    });

  const before = snapshot(state);
  const grade = gradePlayerShots(state);
  assert.equal(snapshot(state), before);

  // And the returned cells are copies, not aliases into the history.
  grade.shots[0].cell.row = 99;
  assert.notEqual(state.history[0].cell.row, 99);
});

test("reconstruction does not leak future knowledge: turn 1 sees a virgin board", () => {
  // The finished state's aiBoard.shotsReceived holds every shot of the whole
  // game. If any of that leaked into turn 1's map, the grade would differ
  // from the map computed on a board nobody has fired at yet.
  const state = playGame(pickBest);
  const grade = gradePlayerShots(state);

  const fresh = probabilityMapForPlayer(newGame());
  let total = 0;
  let best = 0;
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      total += fresh[row][col];
      best = Math.max(best, fresh[row][col]);
    }
  }

  const first = grade.shots[0];
  assert.equal(first.choicesAvailable, 100);
  assert.ok(
    Math.abs(first.bestProbability - best / total) < 1e-12,
    `turn 1 bestProbability leaked later shots: ${first.bestProbability} vs ${best / total}`
  );
  const chosen = fresh[first.cell.row][first.cell.col];
  assert.ok(Math.abs(first.probability - chosen / total) < 1e-12);
});

test("reconstruction does not leak future knowledge: grades are prefix-invariant", () => {
  // Grade a full game, then grade the same game truncated after k shots.
  // Every shot in the prefix must receive an identical grade, because a shot
  // may only be judged on the turns that preceded it.
  const full = playGame(pickBest);
  const grade = gradePlayerShots(full);

  const shots = full.history.filter((h) => h.actor === "player");
  for (const k of [1, 3, 7, 12, Math.min(20, shots.length)]) {
    if (k > shots.length) continue;
    let truncated = newGame();
    for (let i = 0; i < k; i++) truncated = playerFire(truncated, shots[i].cell);

    const partial = gradePlayerShots(truncated);
    assert.equal(partial.shots.length, k);
    for (let i = 0; i < k; i++) {
      assert.deepEqual(
        partial.shots[i],
        grade.shots[i],
        `shot ${i} changed when later turns were removed (k=${k})`
      );
    }
  }
});

test("reconstruction does not leak a sink that happens on a later turn", () => {
  // Fire at four of the five carrier cells, then the fifth (which sinks it).
  // While grading the 4th shot, the carrier is NOT yet sunk, so its cells must
  // still be live in the map. A leak would zero them out and change the grade.
  const carrier = AI_LAYOUT.carrier;
  let state = newGame();
  for (const c of carrier) state = playerFire(state, c);

  const grade = gradePlayerShots(state);

  assert.equal(state.aiBoard.ships.find((s) => s.id === "carrier").sunk, true);
  // Grading the 5th shot may only see the first four. Four unresolved hits sat
  // in a line, so the engine's best cell is the open end at A5/(4,0) — and the
  // carrier must still be treated as afloat. If the final sink leaked
  // backwards, its cells would be "blocked" and the best cell would move.
  assert.deepEqual(grade.shots[4].bestCell, carrier[4]);
  assert.equal(grade.shots[4].rank, 1);
  assert.ok(grade.shots[4].bestProbability > 0.5);
  // Same logic one turn earlier: three unresolved hits, open end at (3,0).
  assert.deepEqual(grade.shots[3].bestCell, carrier[3]);
});

test("turns with no meaningful choice are skipped, not counted as failures", () => {
  // Sweep the whole board so the tail of the game genuinely offers no choice:
  // by the end every ship is sunk (the engine has no opinion left) and the
  // final shot has exactly one legal target. A real game stops the moment the
  // last ship sinks, so this state is built deliberately.
  let state = newGame();
  for (const c of availableCells(state)) {
    state = playerFire(state, c);
    state.status = "in_progress";
    state.turn = "player";
  }
  state.status = "player_won";

  const grade = gradePlayerShots(state);
  assert.equal(grade.totalShots, 100);
  const last = grade.shots[99];
  assert.equal(last.choicesAvailable, 1);
  assert.equal(last.graded, false);
  // Once every ship is sunk the map is uniformly zero — also not gradeable.
  assert.ok(grade.shots.some((s) => !s.graded && s.bestProbability === 0));
  assert.ok(grade.gradedShots < grade.totalShots);
  assert.ok(grade.gradedShots > 0);
  assert.ok(grade.shots.every((s) => s.graded === false || s.choicesAvailable > 1));
});

test("empty and shot-less states degrade instead of throwing", () => {
  const fresh = newGame();
  const grade = gradePlayerShots(fresh);
  assert.equal(grade.totalShots, 0);
  assert.equal(grade.shots.length, 0);
  assert.match(formatCoachReport(grade), /No shots to grade/);

  assert.doesNotThrow(() => gradePlayerShots(null));
  assert.doesNotThrow(() => gradePlayerShots({}));
  assert.equal(typeof formatCoachReport(undefined), "string");
});

test("formatCoachReport is prose: three or four sentences, no table dump", () => {
  const grade = gradePlayerShots(playGame(pickWorst));
  const text = formatCoachReport(grade);

  assert.equal(text.includes("\n"), false);
  assert.match(text, /You fired \d+ shots and played at .+ of Bayesian-optimal\./);
  assert.match(text, /costliest shot was turn \d+ at [A-J]\d+/);
  assert.match(text, /matched the optimal target on \d+ of/);
  const sentences = text.split(/(?<=\.)\s+/).filter(Boolean);
  assert.ok(
    sentences.length >= 3 && sentences.length <= 4,
    `expected 3-4 sentences, got ${sentences.length}: ${text}`
  );
});

test("worstShots are the three costliest graded choices, in order", () => {
  const grade = gradePlayerShots(playGame(pickWorst));
  assert.equal(grade.worstShots.length, 3);
  for (let i = 1; i < grade.worstShots.length; i++) {
    assert.ok(grade.worstShots[i - 1].cost >= grade.worstShots[i].cost);
  }
  const maxCost = Math.max(
    ...grade.shots.filter((s) => s.graded).map((s) => s.cost)
  );
  assert.equal(grade.worstShots[0].cost, maxCost);
});

// ---------------------------------------------------------------------------
// Graceful degradation of the render surface (PRD Section 5). There is no DOM
// in node, so these use minimal stand-ins — the point is that no input can
// make `mountCoach` throw and strand the player on a broken end screen.
// ---------------------------------------------------------------------------

function fakeNode(tag) {
  const node = {
    tagName: tag,
    id: "",
    className: "",
    textContent: "",
    style: {},
    children: [],
    attributes: {},
    ownerDocument: null,
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    setAttribute(k, v) {
      this.attributes[k] = v;
    },
    querySelector() {
      return null;
    },
  };
  return node;
}

function fakeDocument() {
  const doc = { createElement: (tag) => {
    const n = fakeNode(tag);
    n.ownerDocument = doc;
    return n;
  } };
  return doc;
}

function fakeEndScreen() {
  const doc = fakeDocument();
  const container = doc.createElement("div");
  container.id = "coach-report";
  const root = doc.createElement("div");
  root.querySelector = (sel) => (sel === "#coach-report" ? container : null);
  return { root, container };
}

test("mountCoach renders the coach panel into the end-screen container", () => {
  const { root, container } = fakeEndScreen();
  const state = playGame(pickBest);

  mountCoach(root, () => state);

  const panel = container.children[0];
  assert.ok(panel, "expected a coach panel");
  assert.equal(panel.className, "coach-panel");
  const prose = panel.children.find((c) => c.className === "coach-prose");
  assert.match(prose.textContent, /of Bayesian-optimal/);
});

test("mountCoach clears itself while a game is still in progress", () => {
  const { root, container } = fakeEndScreen();
  container.textContent = "stale";
  mountCoach(root, () => newGame());
  assert.equal(container.textContent, "");
  assert.equal(container.children.length, 0);
});

test("mountCoach never throws, whatever it is handed", () => {
  const finished = playGame(pickBest);
  const hostile = {
    querySelector() {
      throw new Error("DOM exploded");
    },
  };
  assert.doesNotThrow(() => mountCoach(null, () => finished));
  assert.doesNotThrow(() => mountCoach(undefined, undefined));
  assert.doesNotThrow(() => mountCoach({}, () => finished));
  assert.doesNotThrow(() => mountCoach(hostile, () => finished));
  assert.doesNotThrow(() =>
    mountCoach(fakeEndScreen().root, () => {
      throw new Error("state getter exploded");
    })
  );
  assert.doesNotThrow(() => mountCoach(fakeEndScreen().root, () => ({ status: "player_won" })));
});
