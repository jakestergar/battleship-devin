// Provable fairness: a live, in-browser demonstration that the AI is not
// peeking at the player's ships.
//
// The idea is a shuffle test. Everything the AI is *allowed* to know about
// the player's board is public: which cells have been fired at, what those
// shots returned, and the full layout of ships whose sinking has already
// been announced. Everything else — the position of every unsunk ship — is
// private. So we rebuild the board with every unsunk ship moved somewhere
// else that is still consistent with all of that public information, and
// recompute the AI's targeting map. A fair AI must produce a bit-identical
// map; a cheating one cannot.
//
// Pure module: imports only from ./engine.js and ./ai.js, touches no DOM,
// and never mutates the state handed to it. See src/fairness-ui.js for the
// rendering layer and planning/decision-log.md for the design notes.

import { enumerateLegalPlacements } from "./engine.js";
import { computeProbabilityMap } from "./ai.js";

const DEFAULT_TRIALS = 5;
// Upper bound on backtracking nodes per shuffle attempt. Late-game boards
// can be very tightly constrained; we would rather report "no consistent
// shuffle found" honestly than hang the browser searching for one.
const NODE_BUDGET = 3000;
// How many independent search attempts we make per requested trial before
// giving up on that trial.
const ATTEMPTS_PER_TRIAL = 6;
// Hard wall-clock ceiling for the whole check. This runs synchronously on
// the main thread when the player clicks the button, so it must never be
// able to freeze the tab: near the end of a game the constraints get tight
// enough that the search can grind, and "not verifiable right now" is a far
// better outcome than a stalled UI.
const TIME_BUDGET_MS = 400;

function key(row, col) {
  return `${row},${col}`;
}

/**
 * FNV-1a, 32-bit, over the flattened grid. Deterministic, synchronous, and
 * short enough to explain in one sentence — which matters more here than
 * cryptographic strength, because the hash is a display convenience: the
 * comparison itself is over grids we hold in memory.
 */
export function hashGrid(grid) {
  if (!Array.isArray(grid)) throw new TypeError("hashGrid expects number[][]");
  let hash = 0x811c9dc5;
  const feed = (str) => {
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      // hash *= 16777619, in 32-bit arithmetic without overflowing a double.
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  };
  for (const row of grid) {
    if (!Array.isArray(row)) throw new TypeError("hashGrid expects number[][]");
    feed(row.join(","));
    feed(";");
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * The public record of the player's board, derived the same way `src/ai.js`
 * derives it: from the AI's own shot history plus the layout of ships whose
 * sinking was announced. Nothing here reads an unsunk ship's cells.
 */
function publicKnowledge(state) {
  const board = state.playerBoard;
  const aiShots = state.history.filter((h) => h.actor === "ai");

  const sunkShipIds = new Set(
    aiShots.filter((h) => h.result === "sunk" && h.shipId).map((h) => h.shipId)
  );

  const sunkCells = new Set();
  for (const ship of board.ships) {
    if (!sunkShipIds.has(ship.id)) continue;
    for (const c of ship.cells) sunkCells.add(key(c.row, c.col));
  }

  const missCells = new Set(
    aiShots
      .filter((h) => h.result === "miss")
      .map((h) => key(h.cell.row, h.cell.col))
  );

  // Hit cells that no announced sinking accounts for: the shuffled layout
  // must still explain every one of them, or it would contradict what the
  // player already told the AI.
  const openHits = new Set();
  for (const h of aiShots) {
    if (h.result !== "hit" && h.result !== "sunk") continue;
    const k = key(h.cell.row, h.cell.col);
    if (sunkCells.has(k)) continue;
    openHits.add(k);
  }

  return { size: board.size, sunkShipIds, sunkCells, missCells, openHits };
}

function sameCells(a, b) {
  if (a.length !== b.length) return false;
  const set = new Set(a.map((c) => key(c.row, c.col)));
  return b.every((c) => set.has(key(c.row, c.col)));
}

function shuffled(list, random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Searches for a relocation of every unsunk ship that is consistent with
 * the public record. Returns a Map of shipId -> cells, or null if no
 * consistent relocation was found within the node budget.
 *
 * Constraints enforced on every candidate placement:
 *  - in bounds and non-overlapping (via engine.enumerateLegalPlacements);
 *  - never on a cell reported as a miss, and never on a sunk ship's cells;
 *  - never fully covered by open hits (that ship would have been announced
 *    as sunk);
 *  - strictly different from the ship's real position, so the trial really
 *    is a relocation;
 * and, on the completed layout, every open hit cell is covered by exactly
 * one ship.
 */
function findRelocation(state, knowledge, random, info = {}, deadline = Infinity) {
  const { size, sunkShipIds, sunkCells, missCells, openHits } = knowledge;
  const blocked = new Set([...sunkCells, ...missCells]);

  const unsunk = state.playerBoard.ships
    .filter((s) => !sunkShipIds.has(s.id) && !s.sunk)
    .map((s) => ({
      id: s.id,
      length: s.length ?? s.cells.length,
      original: s.cells,
    }))
    .sort((a, b) => b.length - a.length);

  if (unsunk.length === 0) return null;

  const capacityAfter = [];
  let running = 0;
  for (let i = unsunk.length - 1; i >= 0; i--) {
    capacityAfter[i] = running;
    running += unsunk[i].length;
  }

  const occupied = new Set(blocked);
  const chosen = new Map();
  let nodes = 0;

  const search = (index, uncovered) => {
    if (index === unsunk.length) return uncovered === 0;
    if (uncovered > capacityAfter[index] + unsunk[index].length) return false;
    if (nodes++ > NODE_BUDGET) return false;
    if ((nodes & 63) === 0 && Date.now() > deadline) {
      nodes = NODE_BUDGET + 1;
      return false;
    }

    const ship = unsunk[index];
    const legal = enumerateLegalPlacements(ship.length, size, occupied);

    const covering = [];
    const plain = [];
    for (const cells of legal) {
      if (sameCells(cells, ship.original)) continue;
      let hits = 0;
      for (const c of cells) if (openHits.has(key(c.row, c.col))) hits++;
      // A ship every cell of which has been hit would already be sunk.
      if (hits === ship.length) continue;
      (hits > 0 ? covering : plain).push({ cells, hits });
    }

    // Cover outstanding hits first: they are the scarce constraint, so
    // trying hit-covering placements before free-water ones keeps the
    // search from wandering through thousands of hopeless branches.
    const candidates =
      uncovered > 0
        ? [...shuffled(covering, random), ...shuffled(plain, random)]
        : [...shuffled(plain, random), ...shuffled(covering, random)];

    for (const candidate of candidates) {
      if (candidate.hits > uncovered) continue;
      for (const c of candidate.cells) occupied.add(key(c.row, c.col));
      chosen.set(ship.id, candidate.cells);
      if (search(index + 1, uncovered - candidate.hits)) return true;
      chosen.delete(ship.id);
      for (const c of candidate.cells) occupied.delete(key(c.row, c.col));
      if (nodes > NODE_BUDGET) return false;
    }
    return false;
  };

  const found = search(0, openHits.size);
  // Distinguish "searched everything, there is nothing" from "ran out of
  // budget": only the latter is worth retrying with a different shuffle.
  info.budgetHit = nodes > NODE_BUDGET;
  return found ? chosen : null;
}

/**
 * Builds an alternative GameState from a relocation. `shotsReceived`,
 * `history`, and every sunk ship are carried over untouched — they are the
 * public record and must not change. Each relocated ship's `hits` set is
 * recomputed from its new cells so the state stays internally consistent.
 */
function applyRelocation(state, knowledge, relocation) {
  const board = state.playerBoard;
  const ships = board.ships.map((ship) => {
    const cells = relocation.get(ship.id);
    if (!cells) {
      return {
        ...ship,
        cells: ship.cells.map((c) => ({ ...c })),
        hits: new Set(ship.hits),
      };
    }
    const hits = new Set(
      cells
        .map((c) => key(c.row, c.col))
        .filter((k) => knowledge.openHits.has(k))
    );
    return { ...ship, cells: cells.map((c) => ({ ...c })), hits, sunk: false };
  });

  return {
    ...state,
    playerBoard: {
      size: board.size,
      ships,
      shotsReceived: new Set(board.shotsReceived),
    },
    history: state.history.map((h) => ({ ...h })),
  };
}

function argmax(grid) {
  let best = null;
  let peak = -Infinity;
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row].length; col++) {
      if (grid[row][col] > peak) {
        peak = grid[row][col];
        best = { row, col };
      }
    }
  }
  return best;
}

/**
 * Runs the shuffle test.
 *
 * @param {object} state  the live GameState (never mutated)
 * @param {object} [options]
 * @param {number} [options.trials=5]        how many relocations to test
 * @param {Function} [options.computeMap]    map function under test; defaults
 *                                           to ai.computeProbabilityMap.
 *                                           Injectable so the test suite can
 *                                           prove the checker catches a
 *                                           cheating implementation.
 * @param {Function} [options.random=Math.random]
 * @returns {{ok: boolean, trials: number, referenceHash: string,
 *            trialHashes: string[], chosenCell: {row: number, col: number}}}
 *
 * `trials: 0` with `ok: true` means no consistent relocation could be found
 * (possible on a tightly constrained late-game board). That is reported as
 * "not verifiable right now", never dressed up as a pass.
 */
export function verifyFairness(state, options = {}) {
  const {
    trials: requested = DEFAULT_TRIALS,
    computeMap = computeProbabilityMap,
    random = Math.random,
    timeBudgetMs = TIME_BUDGET_MS,
  } = options;
  const deadline = Date.now() + timeBudgetMs;

  const referenceGrid = computeMap(state);
  const referenceHash = hashGrid(referenceGrid);
  const knowledge = publicKnowledge(state);

  const trialHashes = [];
  for (let i = 0; i < requested; i++) {
    if (Date.now() > deadline) break;
    let relocation = null;
    for (let attempt = 0; attempt < ATTEMPTS_PER_TRIAL && !relocation; attempt++) {
      const info = {};
      relocation = findRelocation(state, knowledge, random, info, deadline);
      if (!relocation && !info.budgetHit) break; // exhaustively impossible
      if (!relocation && Date.now() > deadline) break;
    }
    if (!relocation) break;
    const alternative = applyRelocation(state, knowledge, relocation);
    trialHashes.push(hashGrid(computeMap(alternative)));
  }

  return {
    ok: trialHashes.every((h) => h === referenceHash),
    trials: trialHashes.length,
    referenceHash,
    trialHashes,
    // Determined from the reference map itself (first peak in scan order)
    // rather than via ai.chooseMove, whose tie-break is random: the claim
    // being made is about the map, and a random tie-break would make the
    // reported cell wobble for reasons that have nothing to do with fairness.
    chosenCell: argmax(referenceGrid),
  };
}
