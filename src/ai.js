// Bayesian Search Theory targeting for the AI opponent.
//
// The AI fires at the *player's* board, so everything here is derived from
// `state.playerBoard` and the AI's own shots in `state.history`.
//
// Fair-information constraint: this module never reads `cells` of a ship
// that is not yet sunk, even though `GameState` exposes it. Only publicly
// known facts are used — which cells have been fired at, what each shot
// resulted in, and the revealed layout of ships that have already sunk.
// See planning/session-briefs/02-ai-brief.md.

import { BOARD_SIZE, FLEET } from "./engine.js";

// Multiplier applied per unresolved-hit cell a placement covers. Large
// enough that any placement explaining an existing hit dominates the
// hunt-phase signal, which is what makes the AI finish off wounded ships.
const HIT_BOOST = 100;

const ORIENTATIONS = ["horizontal", "vertical"];

function key(row, col) {
  return `${row},${col}`;
}

function cellsForPlacement(row, col, length, orientation) {
  const cells = [];
  for (let i = 0; i < length; i++) {
    cells.push(
      orientation === "horizontal" ? { row, col: col + i } : { row: row + i, col }
    );
  }
  return cells;
}

function emptyGrid(size) {
  return Array.from({ length: size }, () => new Array(size).fill(0));
}

/**
 * Everything the AI is allowed to know about the board it is attacking,
 * extracted from fair information only.
 */
function fairKnowledge(state) {
  const board = state.playerBoard;
  const size = board.size ?? BOARD_SIZE;

  const sunkShips = board.ships.filter((s) => s.sunk);
  const sunkCells = new Set();
  for (const ship of sunkShips) {
    for (const c of ship.cells) sunkCells.add(key(c.row, c.col));
  }

  // Remaining fleet lengths: full fleet minus the lengths already sunk.
  // Tracked by count, since two ships share length 3.
  const remainingLengths = FLEET.map((f) => f.length);
  for (const ship of sunkShips) {
    const i = remainingLengths.indexOf(ship.length);
    if (i !== -1) remainingLengths.splice(i, 1);
  }

  const missCells = new Set();
  const hitCells = new Set();
  for (const entry of state.history) {
    if (entry.actor !== "ai") continue;
    const k = key(entry.cell.row, entry.cell.col);
    if (entry.result === "miss") missCells.add(k);
    else if (entry.result === "hit" || entry.result === "sunk") hitCells.add(k);
  }

  // A hit is "unresolved" while it does not belong to any sunk ship.
  const unresolvedHits = new Set([...hitCells].filter((k) => !sunkCells.has(k)));

  return { board, size, remainingLengths, missCells, sunkCells, unresolvedHits };
}

/**
 * Enumerates every placement of every remaining ship length that is
 * consistent with the fair information, accumulating both the boosted
 * weight grid the heatmap renders and the raw placement counts used to
 * phrase the explanation.
 */
function analyze(state) {
  const { board, size, remainingLengths, missCells, sunkCells, unresolvedHits } =
    fairKnowledge(state);

  const weights = emptyGrid(size);
  const placementCounts = emptyGrid(size);
  const hitLinkedCounts = emptyGrid(size);
  // For each cell, which unresolved hit its hit-linked placements explain.
  const linkedHit = Array.from({ length: size }, () => new Array(size).fill(null));
  let totalPlacements = 0;

  const blocked = (k) => missCells.has(k) || sunkCells.has(k);

  for (const length of new Set(remainingLengths)) {
    const shipsOfLength = remainingLengths.filter((l) => l === length).length;

    for (const orientation of ORIENTATIONS) {
      const maxRow = orientation === "vertical" ? size - length : size - 1;
      const maxCol = orientation === "horizontal" ? size - length : size - 1;

      for (let row = 0; row <= maxRow; row++) {
        for (let col = 0; col <= maxCol; col++) {
          const cells = cellsForPlacement(row, col, length, orientation);
          if (cells.some((c) => blocked(key(c.row, c.col)))) continue;

          const covered = cells.filter((c) => unresolvedHits.has(key(c.row, c.col)));
          const weight = shipsOfLength * HIT_BOOST ** covered.length;
          totalPlacements += shipsOfLength;

          for (const c of cells) {
            weights[c.row][c.col] += weight;
            placementCounts[c.row][c.col] += shipsOfLength;
            if (covered.length > 0) {
              hitLinkedCounts[c.row][c.col] += shipsOfLength;
              if (linkedHit[c.row][c.col] === null) linkedHit[c.row][c.col] = covered[0];
            }
          }
        }
      }
    }
  }

  // Already-fired-upon cells are never worth a shot.
  for (const k of board.shotsReceived) {
    const [row, col] = k.split(",").map(Number);
    if (row >= 0 && row < size && col >= 0 && col < size) weights[row][col] = 0;
  }

  return {
    weights,
    placementCounts,
    hitLinkedCounts,
    linkedHit,
    totalPlacements,
    size,
    shotsReceived: board.shotsReceived,
  };
}

/**
 * Bayesian Search Theory probability map for the board the AI is attacking:
 * a size x size grid where each cell's weight is the number of still-valid
 * remaining-ship placements through it, with placements that explain an
 * unresolved hit boosted by HIT_BOOST per hit covered. Pure — no mutation
 * of `state`, safe to snapshot straight into a HistoryEntry.
 */
export function computeProbabilityMap(state) {
  return analyze(state).weights;
}

function describe(cell) {
  return `(${cell.row},${cell.col})`;
}

/**
 * Selects the AI's next shot: the max-weight cell on the probability map,
 * breaking ties uniformly at random.
 *
 * @returns {{ cell: {row: number, col: number}, confidence: number, explanation: string }}
 */
export function chooseMove(state) {
  const {
    weights,
    placementCounts,
    hitLinkedCounts,
    linkedHit,
    totalPlacements,
    size,
    shotsReceived,
  } = analyze(state);

  let peak = -Infinity;
  let best = [];
  let sum = 0;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const w = weights[row][col];
      sum += w;
      // Never a candidate: the engine treats a repeat shot as a no-op, so
      // it would waste the turn.
      if (shotsReceived.has(key(row, col))) continue;
      if (w > peak) {
        peak = w;
        best = [{ row, col }];
      } else if (w === peak) {
        best.push({ row, col });
      }
    }
  }

  if (best.length === 0) {
    throw new Error("chooseMove: no untargeted cells remain on the player's board");
  }

  const cell = best[Math.floor(Math.random() * best.length)];
  const confidence = sum > 0 ? peak / sum : 0;

  let explanation;
  const hit = linkedHit[cell.row][cell.col];
  if (peak > 0 && hit) {
    explanation =
      `Targeting ${describe(cell)} using Bayesian Search Theory — this cell ` +
      `completes ${hitLinkedCounts[cell.row][cell.col]} of the remaining valid ` +
      `placements for the ship hit at ${describe(hit)}.`;
  } else if (peak > 0) {
    explanation =
      `Targeting ${describe(cell)} using Bayesian Search Theory — highest-` +
      `probability cell across ${totalPlacements} possible remaining ship ` +
      `configurations (${placementCounts[cell.row][cell.col]} of them pass ` +
      `through it).`;
  } else {
    explanation =
      `Targeting ${describe(cell)} using Bayesian Search Theory — no remaining ` +
      `ship placements are consistent with the known board, so this shot is a ` +
      `uniform fallback among untargeted cells.`;
  }

  return { cell, confidence, explanation };
}
