// Headless playtest harness — a dev tool, NOT part of the deployed game.
//
// Two jobs (see planning/session-briefs/04-harness-brief.md):
//   1. Bug-hunting at scale. Every move of every simulated game is checked
//      against the engine's invariants; any violation is recorded as a
//      *reproducible* anomaly (seed + full move history), never swallowed.
//   2. Efficiency baselines. Measures how many shots each targeting strategy
//      needs to clear a board, and writes the numbers to src/baseline.js so
//      the deployed game can quote them without recomputing anything.
//
// Three strategies are compared:
//   - random            : uniform over unattacked cells (the floor).
//   - hunt-and-target   : classic random search, then adjacent-cell mop-up.
//                         This is what most public Battleship AIs do.
//   - bayesian          : the real src/ai.js (Bayesian Search Theory).
//
// Reproducibility: every game runs inside `withSeededRandom(seed, ...)`, which
// swaps `Math.random` for a seeded PRNG for the duration of that game. Both
// the engine's fleet placement and the AI's tie-breaking therefore become
// deterministic functions of the seed, so any anomaly can be replayed with
//   node scripts/harness.js --repro <seed> --strategy <name> [--mode duel]

import {
  BOARD_SIZE,
  createGame,
  fireAt,
  isGameOver,
} from "../src/engine.js";
import { chooseMove as bayesianChooseMove } from "../src/ai.js";

const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;
// "Flag anything exceeding 2x the board's cell count as a probable
// infinite-loop bug rather than letting it hang forever."
export const MAX_MOVES = 2 * CELL_COUNT;

function key(row, col) {
  return `${row},${col}`;
}

// ---------------------------------------------------------------------------
// Seeded randomness
// ---------------------------------------------------------------------------

/** mulberry32 — small, fast, good enough for playtesting. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Runs `fn` with `Math.random` replaced by a PRNG seeded from `seed`, then
 * restores the original unconditionally. This is what makes every anomaly
 * replayable: the engine's placement and the AI's tie-breaks both go through
 * `Math.random`, and neither module needs to know we did this.
 */
export function withSeededRandom(seed, fn) {
  const original = Math.random;
  Math.random = makeRng(seed);
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------

function unattackedCells(board) {
  const cells = [];
  for (let row = 0; row < board.size; row++) {
    for (let col = 0; col < board.size; col++) {
      if (!board.shotsReceived.has(key(row, col))) cells.push({ row, col });
    }
  }
  return cells;
}

function pickRandom(cells) {
  return cells[Math.floor(Math.random() * cells.length)];
}

/**
 * Baseline strategy: uniformly random among unattacked cells on the board the
 * caller is targeting. Lives here, in the harness, on purpose — src/ai.js is
 * not given a "dumb mode".
 */
export function randomChooseMove(state, targetBoard = "player") {
  const board = targetBoard === "player" ? state.playerBoard : state.aiBoard;
  const open = unattackedCells(board);
  if (open.length === 0) return null;
  return { cell: pickRandom(open), confidence: null, explanation: "random" };
}

/** The player's side of a duel. Same thing, aimed the other way. */
export function randomPlayerMove(state) {
  return randomChooseMove(state, "ai");
}

/**
 * The information a fair attacker has about the board it is shooting at:
 * which cells it has fired at, and which of its hits belong to a ship that is
 * already sunk (sinking a ship reveals its whole hull — that is public).
 * Derived from history, exactly like src/ai.js does it, so hunt-and-target
 * cannot cheat either.
 */
function attackerKnowledge(state, targetBoard) {
  const board = targetBoard === "player" ? state.playerBoard : state.aiBoard;
  const actor = targetBoard === "player" ? "ai" : "player";
  const shots = state.history.filter((h) => h.actor === actor);

  const sunkIds = new Set(
    shots.filter((h) => h.result === "sunk" && h.shipId).map((h) => h.shipId)
  );
  const sunkCells = new Set();
  for (const ship of board.ships) {
    if (!sunkIds.has(ship.id)) continue;
    for (const c of ship.cells) sunkCells.add(key(c.row, c.col));
  }

  const unresolvedHits = [];
  const unresolvedKeys = new Set();
  for (const h of shots) {
    if (h.result !== "hit" && h.result !== "sunk") continue;
    const k = key(h.cell.row, h.cell.col);
    if (sunkCells.has(k) || unresolvedKeys.has(k)) continue;
    unresolvedKeys.add(k);
    unresolvedHits.push({ row: h.cell.row, col: h.cell.col });
  }

  return { board, unresolvedHits, unresolvedKeys };
}

const DIRECTIONS = [
  { dr: -1, dc: 0 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
  { dr: 0, dc: 1 },
];

/**
 * Classic "hunt and target": fire at random until something is hit, then work
 * the cells adjacent to the unresolved hit(s) until that ship goes down,
 * preferring to extend an already-established line of two or more hits.
 *
 * This is the algorithm the majority of public Battleship implementations
 * use, which is why it is here: it is the honest comparison point for the
 * Bayesian AI, in a way that pure random is not.
 */
export function huntAndTargetChooseMove(state, targetBoard = "player") {
  const { board, unresolvedHits, unresolvedKeys } = attackerKnowledge(
    state,
    targetBoard
  );

  let best = [];
  let bestScore = 0;
  for (const hit of unresolvedHits) {
    for (const { dr, dc } of DIRECTIONS) {
      const row = hit.row + dr;
      const col = hit.col + dc;
      if (row < 0 || row >= board.size || col < 0 || col >= board.size) continue;
      if (board.shotsReceived.has(key(row, col))) continue;
      // Extending a known line of hits beats poking a lone hit's neighbour.
      const opposite = key(hit.row - dr, hit.col - dc);
      const score = unresolvedKeys.has(opposite) ? 2 : 1;
      if (score > bestScore) {
        bestScore = score;
        best = [{ row, col }];
      } else if (score === bestScore) {
        best.push({ row, col });
      }
    }
  }

  if (best.length > 0) {
    return {
      cell: pickRandom(best),
      confidence: null,
      explanation: bestScore === 2 ? "target: extend line" : "target: adjacent",
    };
  }

  const open = unattackedCells(board);
  if (open.length === 0) return null;
  return { cell: pickRandom(open), confidence: null, explanation: "hunt: random" };
}

export const STRATEGIES = {
  random: { label: "Random search", chooseMove: (s) => randomChooseMove(s, "player") },
  "hunt-and-target": {
    label: "Hunt and target",
    chooseMove: (s) => huntAndTargetChooseMove(s, "player"),
  },
  bayesian: { label: "Bayesian Search Theory", chooseMove: bayesianChooseMove },
};

// ---------------------------------------------------------------------------
// Invariant checking
// ---------------------------------------------------------------------------

function snapshotBoard(board) {
  return {
    shots: new Set(board.shotsReceived),
    ships: board.ships.map((s) => ({
      id: s.id,
      hits: new Set(s.hits),
      sunk: s.sunk,
    })),
  };
}

function snapshotState(state) {
  return {
    player: snapshotBoard(state.playerBoard),
    ai: snapshotBoard(state.aiBoard),
    historyLength: state.history.length,
    status: state.status,
  };
}

function serializeHistory(history) {
  return history.map(
    (h) => `${h.turnNumber}:${h.actor}@${h.cell.row},${h.cell.col}=${h.result}`
  );
}

/** Static, per-board consistency checks that must hold at all times. */
function checkBoardConsistency(board, name, report) {
  for (const ship of board.ships) {
    const allHit = ship.cells.every((c) => ship.hits.has(key(c.row, c.col)));
    if (ship.sunk && !allHit) {
      report(
        "sunk-ship-missing-hits",
        `${name}Board: ${ship.id} is marked sunk but only ${ship.hits.size}/${ship.cells.length} of its cells are in hits`
      );
    }
    if (!ship.sunk && allHit) {
      report(
        "fully-hit-ship-not-sunk",
        `${name}Board: every cell of ${ship.id} is hit but sunk is false`
      );
    }
    for (const k of ship.hits) {
      if (!ship.cells.some((c) => key(c.row, c.col) === k)) {
        report(
          "hit-outside-ship",
          `${name}Board: ${ship.id} has a hit at ${k} which is not one of its cells`
        );
      }
      if (!board.shotsReceived.has(k)) {
        report(
          "hit-not-in-shots",
          `${name}Board: ${ship.id} has a hit at ${k} that is not in shotsReceived`
        );
      }
    }
  }
}

/**
 * Checks everything that must be true immediately after one `fireAt` call.
 * `report(type, message)` records an anomaly; this function never throws.
 */
function checkMove(before, after, ctx, report) {
  const {
    targetBoard,
    cell,
    result,
    wasAlreadyFired,
    stateIdentityUnchanged,
  } = ctx;
  const cellKey = key(cell.row, cell.col);
  const fired = targetBoard === "player" ? "player" : "ai";
  const other = fired === "player" ? "ai" : "player";

  // 1. Legality / no-op contract.
  if (wasAlreadyFired) {
    if (result !== "no-op") {
      report(
        "repeat-shot-not-noop",
        `Refiring at ${cellKey} on the ${fired} board returned "${result}" instead of "no-op"`
      );
    }
    if (!stateIdentityUnchanged) {
      report(
        "repeat-shot-changed-state",
        `Refiring at ${cellKey} on the ${fired} board returned a new state object instead of the unchanged one`
      );
    }
    if (after.historyLength !== before.historyLength) {
      report(
        "repeat-shot-logged",
        `Refiring at ${cellKey} appended a history entry (${before.historyLength} -> ${after.historyLength})`
      );
    }
    return;
  }

  if (result === "no-op") {
    report(
      "fresh-shot-rejected",
      `Firing at the never-before-targeted cell ${cellKey} on the ${fired} board returned "no-op"`
    );
    return;
  }

  // 2. shotsReceived only ever grows, by exactly the cell we fired at, and
  //    only on the board we fired at.
  for (const k of before[fired].shots) {
    if (!after[fired].shots.has(k)) {
      report("shots-shrank", `${fired}Board lost shotsReceived entry ${k}`);
    }
  }
  if (!after[fired].shots.has(cellKey)) {
    report("shot-not-recorded", `${fired}Board has no shotsReceived entry for ${cellKey}`);
  }
  if (after[fired].shots.size !== before[fired].shots.size + 1) {
    report(
      "shots-size-jump",
      `${fired}Board shotsReceived went ${before[fired].shots.size} -> ${after[fired].shots.size} on a single shot`
    );
  }
  if (after[other].shots.size !== before[other].shots.size) {
    report(
      "wrong-board-mutated",
      `Firing at the ${fired} board changed the ${other} board's shotsReceived`
    );
  }

  // 3. Hits never disappear; a ship never un-sinks.
  for (const beforeShip of before[fired].ships) {
    const afterShip = after[fired].ships.find((s) => s.id === beforeShip.id);
    if (!afterShip) {
      report("ship-vanished", `${fired}Board lost ship ${beforeShip.id}`);
      continue;
    }
    for (const k of beforeShip.hits) {
      if (!afterShip.hits.has(k)) {
        report("hits-shrank", `${fired}Board: ${beforeShip.id} lost hit ${k}`);
      }
    }
    if (beforeShip.sunk && !afterShip.sunk) {
      report("ship-unsunk", `${fired}Board: ${beforeShip.id} went from sunk back to afloat`);
    }
  }

  // 4. The reported result matches what the board says happened.
  const hitShip = after[fired].ships.find((s) => s.hits.has(cellKey));
  if ((result === "hit" || result === "sunk") && !hitShip) {
    report(
      "result-hit-without-ship",
      `Shot at ${cellKey} reported "${result}" but no ship on the ${fired} board records a hit there`
    );
  }
  if (result === "miss" && hitShip) {
    report(
      "result-miss-on-ship",
      `Shot at ${cellKey} reported "miss" but ${hitShip.id} records a hit there`
    );
  }
  if (result === "sunk" && hitShip && !hitShip.sunk) {
    report("result-sunk-not-marked", `Shot at ${cellKey} reported "sunk" but ${hitShip.id}.sunk is false`);
  }
  if (result === "hit" && hitShip && hitShip.sunk) {
    report(
      "result-hit-but-sunk",
      `Shot at ${cellKey} reported "hit" but it was the shot that sank ${hitShip.id}`
    );
  }

  // 5. Exactly one history entry, correctly numbered and attributed.
  if (after.historyLength !== before.historyLength + 1) {
    report(
      "history-length",
      `history went ${before.historyLength} -> ${after.historyLength} on a single resolved shot`
    );
  }
}

/** Checks that must hold of a whole state, at any time. */
function checkStateConsistency(state, report) {
  checkBoardConsistency(state.playerBoard, "player", report);
  checkBoardConsistency(state.aiBoard, "ai", report);

  const over = isGameOver(state);
  const statusSaysOver = state.status !== "in_progress";
  if (over !== statusSaysOver) {
    report(
      "gameover-status-disagree",
      `isGameOver() returned ${over} while status is "${state.status}"`
    );
  }

  const playerWiped = state.playerBoard.ships.every((s) => s.sunk);
  const aiWiped = state.aiBoard.ships.every((s) => s.sunk);
  if (state.status === "ai_won" && !playerWiped) {
    report("status-ai-won-early", "status is ai_won but the player still has ships afloat");
  }
  if (state.status === "player_won" && !aiWiped) {
    report("status-player-won-early", "status is player_won but the AI still has ships afloat");
  }
  if (state.status === "in_progress" && (playerWiped || aiWiped)) {
    report(
      "fleet-wiped-but-in-progress",
      `a fleet is fully sunk (player=${playerWiped}, ai=${aiWiped}) but status is still in_progress`
    );
  }

  for (const [i, h] of state.history.entries()) {
    if (h.turnNumber !== i + 1) {
      report("history-numbering", `history[${i}].turnNumber is ${h.turnNumber}, expected ${i + 1}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

/**
 * One full game to completion, using only engine.js plus the supplied move
 * functions. Both sides need a move source to run headlessly, so the player
 * side gets a plain random mover — this harness tests engine+AI correctness,
 * not human play.
 *
 * `mode`:
 *   "duel"     — the real alternating game (this is `simulateGame`'s job).
 *   "clearing" — the AI fires every turn at the player's board until it is
 *                clear. Between engine calls the harness pins `state.turn`
 *                back to "ai"; no rule is reimplemented, every shot still
 *                goes through `engine.fireAt`. This exists because duel-mode
 *                shot counts are censored (a lucky random player can end the
 *                game before a slow strategy finishes), which would flatter
 *                weak strategies in the head-to-head comparison.
 */
export function simulateGame(chooseMoveFn, options = {}) {
  const {
    mode = "duel",
    playerMoveFn = randomPlayerMove,
    onAnomaly = null,
    maxMoves = MAX_MOVES,
    probeRepeatShots = true,
  } = options;

  const anomalies = [];
  let state = createGame();
  if (mode === "clearing") state = { ...state, turn: "ai" };

  let moveIndex = 0;
  let terminatedCleanly = false;
  let lastAiCell = null;

  const report = (type, message) => {
    const record = {
      type,
      message,
      moveIndex,
      history: serializeHistory(state.history),
    };
    anomalies.push(record);
    if (onAnomaly) onAnomaly(record);
  };

  checkStateConsistency(state, report);

  while (moveIndex < maxMoves) {
    if (isGameOver(state)) {
      terminatedCleanly = true;
      break;
    }

    const actor = mode === "clearing" ? "ai" : state.turn;
    const targetBoard = actor === "ai" ? "player" : "ai";
    const move = actor === "ai" ? chooseMoveFn(state) : playerMoveFn(state);

    if (!move || !move.cell) {
      report(
        "no-move-returned",
        `${actor}'s move function returned no cell while the game was still in progress`
      );
      break;
    }
    const { cell } = move;
    if (
      !Number.isInteger(cell.row) ||
      !Number.isInteger(cell.col) ||
      cell.row < 0 ||
      cell.row >= BOARD_SIZE ||
      cell.col < 0 ||
      cell.col >= BOARD_SIZE
    ) {
      report(
        "move-out-of-bounds",
        `${actor} chose (${cell.row},${cell.col}), which is not a cell on a ${BOARD_SIZE}x${BOARD_SIZE} board`
      );
      break;
    }

    if (
      move.confidence !== null &&
      move.confidence !== undefined &&
      !(Number.isFinite(move.confidence) && move.confidence >= 0 && move.confidence <= 1)
    ) {
      report(
        "confidence-out-of-range",
        `${actor}'s move reported confidence=${move.confidence}, which is not a finite value in [0,1]`
      );
    }

    const targetBoardObj = targetBoard === "player" ? state.playerBoard : state.aiBoard;
    const wasAlreadyFired = targetBoardObj.shotsReceived.has(key(cell.row, cell.col));
    if (wasAlreadyFired) {
      report(
        "strategy-repeated-shot",
        `${actor}'s move function chose (${cell.row},${cell.col}), which had already been fired at`
      );
    }

    const before = snapshotState(state);
    const { newState, result } = fireAt(state, targetBoard, cell);
    const after = snapshotState(newState);

    checkMove(before, after, {
      targetBoard,
      cell,
      result,
      wasAlreadyFired,
      stateIdentityUnchanged: newState === state,
    }, report);
    checkStateConsistency(newState, report);

    if (!wasAlreadyFired) {
      const entry = newState.history[newState.history.length - 1];
      if (!entry || entry.actor !== actor) {
        report(
          "history-actor",
          `history entry for move ${moveIndex} is attributed to "${entry && entry.actor}", expected "${actor}"`
        );
      }
      if (entry && (entry.cell.row !== cell.row || entry.cell.col !== cell.col)) {
        report(
          "history-cell",
          `history entry for move ${moveIndex} logs (${entry.cell.row},${entry.cell.col}) but we fired at (${cell.row},${cell.col})`
        );
      }
      if (entry && entry.result !== result) {
        report(
          "history-result",
          `history entry logs "${entry.result}" but fireAt returned "${result}"`
        );
      }
    }

    // Actively probe the "already-fired cells are a no-op" contract instead
    // of waiting for a strategy to happen to violate it. The probe's result
    // is discarded, so it cannot influence the game.
    if (probeRepeatShots && !wasAlreadyFired) {
      const probeBefore = snapshotState(newState);
      const probe = fireAt(newState, targetBoard, cell);
      const probeAfter = snapshotState(probe.newState);
      checkMove(probeBefore, probeAfter, {
        targetBoard,
        cell,
        result: probe.result,
        wasAlreadyFired: true,
        stateIdentityUnchanged: probe.newState === newState,
      }, report);
    }

    state = newState;
    if (actor === "ai") lastAiCell = cell;
    if (mode === "clearing" && state.status === "in_progress" && state.turn !== "ai") {
      state = { ...state, turn: "ai" };
    }
    moveIndex++;
  }

  if (!terminatedCleanly && !isGameOver(state)) {
    report(
      "did-not-terminate",
      `game was still in progress after ${moveIndex} moves (limit ${maxMoves} = 2x cell count) — probable infinite loop`
    );
  }

  const aiShots = state.history.filter((h) => h.actor === "ai");
  const playerShots = state.history.filter((h) => h.actor === "player");
  const winningShot = state.status === "ai_won" ? aiShots[aiShots.length - 1] : null;

  return {
    state,
    anomalies,
    mode,
    moves: moveIndex,
    aiShots: aiShots.length,
    playerShots: playerShots.length,
    aiHits: aiShots.filter((h) => h.result === "hit" || h.result === "sunk").length,
    status: state.status,
    aiWon: state.status === "ai_won",
    winningTurnNumber: winningShot ? winningShot.turnNumber : null,
    lastAiCell,
  };
}

function mean(values) {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export const HISTOGRAM_BIN_SIZE = 5;
export const HISTOGRAM_MIN = 15;

/** Bucketed distribution of shots-to-clear, for the in-game arena display. */
export function histogram(values, binSize = HISTOGRAM_BIN_SIZE, min = HISTOGRAM_MIN, max = 100) {
  const bins = [];
  for (let lo = min; lo < max; lo += binSize) {
    bins.push({ lo, hi: lo + binSize - 1, count: 0 });
  }
  for (const v of values) {
    let idx = Math.floor((v - min) / binSize);
    if (idx < 0) idx = 0;
    if (idx >= bins.length) idx = bins.length - 1;
    bins[idx].count++;
  }
  return bins;
}

/**
 * Runs `n` games, validating every move of every one of them.
 * Returns `{ results, anomalies, avgShotsToWin, ... }`.
 *
 * `avgShotsToWin` is the brief's definition: over games the AI won, the mean
 * `turnNumber` of the winning shot. In "clearing" mode every game is an AI
 * win and every turn is an AI shot, so it is simply the mean shots to clear
 * a board — which is the number the in-game arena quotes.
 */
export function runBatch(n, chooseMoveFn, options = {}) {
  const { baseSeed = 1, strategy = "custom", ...gameOptions } = options;
  const results = [];
  const anomalies = [];

  for (let i = 0; i < n; i++) {
    const seed = baseSeed + i;
    const result = withSeededRandom(seed, () =>
      simulateGame(chooseMoveFn, gameOptions)
    );
    result.seed = seed;
    result.gameIndex = i;
    results.push(result);
    for (const a of result.anomalies) {
      anomalies.push({ ...a, seed, gameIndex: i, strategy, mode: result.mode });
    }
  }

  const wins = results.filter((r) => r.aiWon);
  const winShotCounts = wins.map((r) => r.aiShots);

  return {
    strategy,
    games: n,
    results,
    anomalies,
    avgShotsToWin: mean(wins.map((r) => r.winningTurnNumber)),
    aiWins: wins.length,
    winRate: n > 0 ? wins.length / n : null,
    avgAiShotsToWin: mean(winShotCounts),
    medianAiShotsToWin: median(winShotCounts),
    bestAiShotsToWin: winShotCounts.length ? Math.min(...winShotCounts) : null,
    worstAiShotsToWin: winShotCounts.length ? Math.max(...winShotCounts) : null,
    hitRate: mean(results.map((r) => (r.aiShots ? r.aiHits / r.aiShots : 0))),
    histogram: histogram(winShotCounts),
    shotCounts: winShotCounts,
  };
}

/** Replays one game from its seed, printing every move. */
export function reproduce(seed, strategyName, mode = "clearing") {
  const strategy = STRATEGIES[strategyName];
  if (!strategy) throw new Error(`Unknown strategy "${strategyName}"`);
  const result = withSeededRandom(seed, () =>
    simulateGame(strategy.chooseMove, { mode })
  );
  return result;
}

// ---------------------------------------------------------------------------
// Engine contract audit
// ---------------------------------------------------------------------------

/**
 * Deliberate edge-case probes against `engine.fireAt`.
 *
 * Random and semi-smart play never produces these inputs, so 6,000 clean
 * simulated games say nothing about them — but planning/technical-design.md
 * says `fireAt` "validates the shot", and callers other than the current UI
 * (a keyboard entry mode, a replay loader, a future networked opponent) very
 * plausibly could. Each probe below is a *found bug*, reported like any other
 * anomaly rather than worked around.
 *
 * Every probe is deterministic — no seed needed, just run this function.
 */
export function auditEngineContract() {
  const anomalies = [];
  const add = (type, message, repro) =>
    anomalies.push({
      type,
      message,
      repro,
      seed: null,
      strategy: "contract-audit",
      mode: "audit",
      moveIndex: null,
      history: [],
    });

  // A1 — off-board coordinates are accepted as ordinary misses.
  {
    const state = createGame();
    const { newState, result } = fireAt(state, "player", { row: -1, col: 0 });
    if (result !== "no-op" || newState !== state) {
      add(
        "oob-shot-accepted",
        `fireAt(state, "player", {row:-1, col:0}) returned "${result}" and recorded "-1,0" in shotsReceived (size ${newState.playerBoard.shotsReceived.size}), appending a history entry and flipping the turn. Off-board shots are neither rejected nor no-ops.`,
        'fireAt(createGame(), "player", { row: -1, col: 0 })'
      );
    }
  }

  // A2 — non-integer coordinates poison shotsReceived with unmatchable keys.
  {
    const state = createGame();
    const { newState, result } = fireAt(state, "player", { row: 1.5, col: 2 });
    if (result !== "no-op" || newState !== state) {
      add(
        "fractional-shot-accepted",
        `fireAt(state, "player", {row:1.5, col:2}) returned "${result}" and inserted the key "1.5,2" into shotsReceived. That key matches no cell, so it silently inflates the shot count forever and can never be cleared.`,
        'fireAt(createGame(), "player", { row: 1.5, col: 2 })'
      );
    }
  }

  // A3 — the engine keeps accepting shots after the game is already decided.
  {
    let state = { ...createGame(), turn: "ai" };
    outer: for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        state = fireAt(state, "player", { row, col }).newState;
        if (state.status !== "in_progress") break outer;
        state = { ...state, turn: "ai" };
      }
    }
    const finishedStatus = state.status;
    const finishedHistory = state.history.length;
    const { newState, result } = fireAt(state, "ai", { row: 0, col: 0 });
    if (result !== "no-op" || newState !== state) {
      add(
        "shot-accepted-after-game-over",
        `With status="${finishedStatus}" and isGameOver()===true, fireAt(state, "ai", {row:0,col:0}) returned "${result}", appended history entry #${newState.history.length} (was ${finishedHistory}) and flipped turn to "${newState.turn}". Post-game shots therefore corrupt the finished game's history — which is exactly what the Battle Report and the efficiency stat read — while status stays terminal.`,
        "clear one board, then call fireAt again on the finished state"
      );
    }
  }

  // A4 — no turn/target validation, and an unrecognised board name silently
  //      resolves to the AI's board.
  {
    const state = createGame(); // turn === "player"
    const { newState, result } = fireAt(state, "player", { row: 0, col: 0 });
    if (result !== "no-op") {
      const entry = newState.history[newState.history.length - 1];
      add(
        "no-turn-validation",
        `With turn="player", fireAt(state, "player", ...) fired at the player's OWN board and logged it as actor="${entry.actor}". The engine never checks that the target board is the one the current actor should be shooting at, so a caller bug damages the wrong fleet and can even hand the win to the wrong side.`,
        'fireAt(createGame(), "player", { row: 0, col: 0 }) // turn is "player"'
      );
    }
  }
  {
    const state = createGame();
    const { newState } = fireAt(state, "enemy", { row: 0, col: 0 });
    if (newState.aiBoard.shotsReceived.size === 1) {
      add(
        "unknown-target-board-silently-defaults",
        `fireAt(state, "enemy", ...) — "enemy" is not a valid board name — was silently treated as "ai" (the \`targetBoard === "player" ? ... : ...\` ternary has no third branch) and fired at the AI's board. A typo'd board name misfires instead of throwing.`,
        'fireAt(createGame(), "enemy", { row: 0, col: 0 })'
      );
    }
  }

  return anomalies;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function round(value, places = 1) {
  if (value === null || value === undefined) return null;
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

function summarize(batch) {
  return {
    strategy: batch.strategy,
    label: STRATEGIES[batch.strategy] ? STRATEGIES[batch.strategy].label : batch.strategy,
    games: batch.games,
    avgShots: round(batch.avgAiShotsToWin),
    medianShots: round(batch.medianAiShotsToWin),
    bestShots: batch.bestAiShotsToWin,
    worstShots: batch.worstAiShotsToWin,
    hitRate: round(batch.hitRate, 3),
    // Compact form: counts[i] covers shots [min + i*binSize, min + (i+1)*binSize).
    histogram: {
      binSize: HISTOGRAM_BIN_SIZE,
      min: HISTOGRAM_MIN,
      counts: batch.histogram.map((b) => b.count),
    },
  };
}

function formatSummary(s) {
  return `  {
    strategy: ${JSON.stringify(s.strategy)},
    label: ${JSON.stringify(s.label)},
    games: ${s.games},
    avgShots: ${s.avgShots},
    medianShots: ${s.medianShots},
    bestShots: ${s.bestShots},
    worstShots: ${s.worstShots},
    hitRate: ${s.hitRate},
    histogram: { binSize: ${s.histogram.binSize}, min: ${s.histogram.min}, counts: [${s.histogram.counts.join(", ")}] },
  }`;
}

function baselineFile(summaries, duelStats, meta) {
  const random = summaries.find((s) => s.strategy === "random");
  const bayes = summaries.find((s) => s.strategy === "bayesian");
  const efficiency = Math.round((1 - bayes.avgShots / random.avgShots) * 100);

  return `// GENERATED FILE — do not edit by hand.
// Produced by \`node scripts/harness.js\` (see planning/session-briefs/04-harness-brief.md).
// Every number below is measured, not estimated: ${meta.gamesPerStrategy} simulated
// board-clearing games per strategy, seeds ${meta.baseSeed}..${meta.baseSeed + meta.gamesPerStrategy - 1},
// generated ${meta.generatedAt}.
//
// "avgShots" is the mean number of shots that strategy needed to sink all
// ${meta.fleetSize} enemy ships on a 10x10 board (100 cells). Measured in the harness's
// "clearing" mode so the numbers are uncensored — see scripts/harness.js.

export const BASELINE_GAMES_PER_STRATEGY = ${meta.gamesPerStrategy};
export const BASELINE_GENERATED_AT = ${JSON.stringify(meta.generatedAt)};

/** Mean shots for a uniformly random searcher to clear the board. */
export const RANDOM_BASELINE_AVG_SHOTS = ${random.avgShots};

/** Mean shots for the shipped Bayesian Search Theory AI. */
export const AI_AVG_SHOTS = ${bayes.avgShots};

/** Whole-percent efficiency gain of the real AI over random search. */
export const EFFICIENCY_VS_RANDOM = ${efficiency};

/** Head-to-head stats behind the in-game Strategy Arena. */
export const ARENA_STRATEGIES = [
${summaries.map(formatSummary).join(",\n")},
];

/**
 * Invariant violations seen during simulated play across all runs that
 * produced this file (0 means the engine held up under every in-game check).
 * Separately, \`auditEngineContract()\` found ${meta.contractAnomalyCount} edge-case contract
 * violation(s) that normal play never reaches — see the harness output.
 */
export const HARNESS_ANOMALY_COUNT = ${meta.anomalyCount};
export const HARNESS_CONTRACT_ANOMALY_COUNT = ${meta.contractAnomalyCount};

/** Full-game (AI vs. a random-firing player) win rates, for context. */
export const DUEL_STATS = ${JSON.stringify(duelStats, null, 2)};
`;
}

function printBatch(batch) {
  const s = summarize(batch);
  console.log(
    `  ${s.label.padEnd(24)} avg ${String(s.avgShots).padStart(5)} | median ${String(
      s.medianShots
    ).padStart(5)} | best ${String(s.bestShots).padStart(3)} | worst ${String(
      s.worstShots
    ).padStart(3)} | hit rate ${(s.hitRate * 100).toFixed(1)}% | anomalies ${batch.anomalies.length}`
  );
}

function printAnomalies(anomalies) {
  if (anomalies.length === 0) {
    console.log("  none");
    return;
  }
  const byType = new Map();
  for (const a of anomalies) {
    if (!byType.has(a.type)) byType.set(a.type, []);
    byType.get(a.type).push(a);
  }
  for (const [type, list] of byType) {
    const first = list[0];
    console.log(`  [${type}] x${list.length}`);
    console.log(`    e.g. strategy=${first.strategy} mode=${first.mode} seed=${first.seed} move=${first.moveIndex}`);
    console.log(`    ${first.message}`);
    console.log(`    repro: node scripts/harness.js --repro ${first.seed} --strategy ${first.strategy} --mode ${first.mode}`);
    console.log(`    history: ${first.history.slice(-12).join(" ")}`);
  }
}

async function main(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) args.set(argv[i].slice(2), argv[i + 1]);
  }

  if (args.has("repro")) {
    const seed = Number(args.get("repro"));
    const strategy = args.get("strategy") || "bayesian";
    const mode = args.get("mode") || "clearing";
    console.log(`Replaying seed ${seed} (${strategy}, ${mode})\n`);
    const result = reproduce(seed, strategy, mode);
    for (const h of result.state.history) {
      console.log(`  ${String(h.turnNumber).padStart(3)} ${h.actor.padEnd(6)} (${h.cell.row},${h.cell.col}) -> ${h.result}${h.shipId ? ` [${h.shipId}]` : ""}`);
    }
    console.log(`\n  status=${result.status} aiShots=${result.aiShots} anomalies=${result.anomalies.length}`);
    for (const a of result.anomalies) console.log(`  ANOMALY [${a.type}] ${a.message}`);
    return;
  }

  const games = Number(args.get("games") || 1000);
  const baseSeed = Number(args.get("seed") || 20240501);
  const order = ["random", "hunt-and-target", "bayesian"];

  console.log(`Battleship playtest harness`);
  console.log(`  board ${BOARD_SIZE}x${BOARD_SIZE} (${CELL_COUNT} cells), move cap ${MAX_MOVES}`);
  console.log(`  ${games} games per strategy, base seed ${baseSeed}`);
  console.log(`  AI module: src/ai.js (real Bayesian Search Theory implementation)\n`);

  const allAnomalies = [];

  console.log("Board-clearing runs (uncensored shots-to-clear):");
  const clearing = {};
  for (const name of order) {
    const started = Date.now();
    const batch = runBatch(games, STRATEGIES[name].chooseMove, {
      mode: "clearing",
      baseSeed,
      strategy: name,
    });
    clearing[name] = batch;
    allAnomalies.push(...batch.anomalies);
    printBatch(batch);
    console.log(`    (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  }

  console.log("\nFull duel runs (strategy vs. a random-firing player):");
  const duels = {};
  for (const name of order) {
    const batch = runBatch(games, STRATEGIES[name].chooseMove, {
      mode: "duel",
      baseSeed: baseSeed + 500000,
      strategy: name,
    });
    duels[name] = batch;
    allAnomalies.push(...batch.anomalies);
    console.log(
      `  ${STRATEGIES[name].label.padEnd(24)} win rate ${(batch.winRate * 100)
        .toFixed(1)
        .padStart(5)}% | avgShotsToWin (turnNumber) ${String(round(batch.avgShotsToWin)).padStart(
        5
      )} | anomalies ${batch.anomalies.length}`
    );
  }

  const randomAvg = clearing.random.avgAiShotsToWin;
  const bayesAvg = clearing.bayesian.avgAiShotsToWin;
  const huntAvg = clearing["hunt-and-target"].avgAiShotsToWin;
  console.log(
    `\nReal AI: ${bayesAvg.toFixed(1)} avg shots | Hunt-and-target: ${huntAvg.toFixed(
      1
    )} | Random baseline: ${randomAvg.toFixed(1)} | ${Math.round(
      (1 - bayesAvg / randomAvg) * 100
    )}% more efficient than random, ${Math.round((1 - bayesAvg / huntAvg) * 100)}% more efficient than hunt-and-target`
  );

  console.log(`\nAnomalies across all ${games * order.length * 2} simulated games:`);
  printAnomalies(allAnomalies);

  const auditAnomalies = auditEngineContract();
  console.log(`\nDeliberate engine-contract probes (edge cases normal play never reaches):`);
  if (auditAnomalies.length === 0) {
    console.log("  none");
  } else {
    for (const a of auditAnomalies) {
      console.log(`  [${a.type}]`);
      console.log(`    ${a.message}`);
      console.log(`    repro: ${a.repro}`);
    }
  }

  const summaries = order.map((name) => summarize(clearing[name]));
  const duelStats = order.map((name) => ({
    strategy: name,
    games: duels[name].games,
    winRateVsRandomPlayer: round(duels[name].winRate, 3),
    avgWinningTurnNumber: round(duels[name].avgShotsToWin),
  }));

  const { writeFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, resolve } = await import("node:path");
  const here = dirname(fileURLToPath(import.meta.url));
  const outPath = resolve(here, "../src/baseline.js");
  writeFileSync(
    outPath,
    baselineFile(summaries, duelStats, {
      gamesPerStrategy: games,
      baseSeed,
      generatedAt: new Date().toISOString().slice(0, 10),
      anomalyCount: allAnomalies.length,
      contractAnomalyCount: auditAnomalies.length,
      fleetSize: 5,
    })
  );
  console.log(`\nWrote ${outPath}`);
}

const isEntryPoint =
  typeof process !== "undefined" &&
  process.argv[1] &&
  import.meta.url === `file://${process.argv[1]}`;

if (isEntryPoint) {
  main(process.argv.slice(2));
}
