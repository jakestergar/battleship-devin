// Bayesian Search Theory targeting for the AI opponent.
//
// The AI plays fair: it only ever looks at information a human opponent
// would also have — which cells it has fired at, what those shots
// returned, and the full layout of ships it has already sunk (sinking a
// ship reveals it). It never reads the `cells` of an unsunk ship, even
// though `GameState` exposes them because the engine needs them to resolve
// hits.
//
// See planning/technical-design.md for the shared data contract and
// planning/session-briefs/02-ai-brief.md for the specification.

import { FLEET, shotsBy } from "./engine.js";
import {
  buildGrid,
  cellKey,
  forEachCell,
  forEachPlacement,
  key,
  parseKey,
  pickRandom,
} from "./grid.js";

// Multiplier applied per unresolved-hit cell a candidate placement covers.
// Large enough that any placement touching a known hit dominates every
// placement that doesn't, which is what makes the AI finish off a ship it
// has found instead of wandering — without needing a separate "target mode".
export const HIT_BOOST_FACTOR = 100;

function formatCell(cell) {
  return `(${cell.row},${cell.col})`;
}

/**
 * Everything the AI is allowed to know about the board it is attacking,
 * derived from `shotsReceived`, the shot history, and sunk ships only.
 */
function gatherFairKnowledge(state) {
  const board = state.playerBoard;
  const aiShots = shotsBy(state, "ai");

  const sunkShipIds = new Set(
    aiShots.filter((h) => h.result === "sunk" && h.shipId).map((h) => h.shipId)
  );

  const sunkCells = new Set();
  const sunkLengths = [];
  for (const ship of board.ships) {
    if (!sunkShipIds.has(ship.id)) continue;
    // Fair: a sunk ship's position is public information.
    sunkLengths.push(ship.cells.length);
    for (const c of ship.cells) sunkCells.add(cellKey(c));
  }

  const missCells = new Set(
    aiShots.filter((h) => h.result === "miss").map((h) => cellKey(h.cell))
  );

  const unresolvedHits = [];
  const seen = new Set();
  for (const h of aiShots) {
    if (h.result !== "hit" && h.result !== "sunk") continue;
    const k = cellKey(h.cell);
    if (sunkCells.has(k) || seen.has(k)) continue;
    seen.add(k);
    unresolvedHits.push({ row: h.cell.row, col: h.cell.col });
  }

  // Remaining fleet lengths = full fleet minus one entry per sunk ship
  // length (two ships share length 3, so this is a multiset removal).
  const remainingLengths = FLEET.map((f) => f.length);
  for (const length of sunkLengths) {
    const idx = remainingLengths.indexOf(length);
    if (idx !== -1) remainingLengths.splice(idx, 1);
  }

  return {
    size: board.size,
    shotsReceived: board.shotsReceived,
    blocked: new Set([...missCells, ...sunkCells]),
    unresolvedHits,
    unresolvedHitKeys: seen,
    remainingLengths,
  };
}

/**
 * Enumerates every placement of every remaining ship length that is
 * consistent with the fair knowledge above, and reports each one to
 * `visit(cells, hitsCovered)`.
 */
function forEachValidPlacement(knowledge, visit) {
  const { size, blocked, unresolvedHitKeys, remainingLengths } = knowledge;

  for (const length of remainingLengths) {
    forEachPlacement(size, length, (cells) => {
      let hitsCovered = 0;
      for (const cell of cells) {
        const k = cellKey(cell);
        if (blocked.has(k)) return;
        if (unresolvedHitKeys.has(k)) hitsCovered++;
      }
      visit(cells, hitsCovered);
    });
  }
}

/**
 * Bayesian Search Theory probability density over the player's board: for
 * every cell, how much of the space of still-possible remaining-ship
 * placements passes through it, weighted heavily toward placements that
 * explain an unresolved hit.
 *
 * Pure — reads `state`, mutates nothing. This grid is exactly what the UI
 * renders as the heatmap.
 */
export function computeProbabilityMap(state) {
  const knowledge = gatherFairKnowledge(state);
  const grid = buildGrid(knowledge.size);

  forEachValidPlacement(knowledge, (cells, hitsCovered) => {
    const weight = HIT_BOOST_FACTOR ** hitsCovered;
    for (const c of cells) grid[c.row][c.col] += weight;
  });

  // Never spend a "confident" shot on a cell that can't legally be fired at.
  for (const k of knowledge.shotsReceived) {
    const { row, col } = parseKey(k);
    if (grid[row] !== undefined) grid[row][col] = 0;
  }

  return grid;
}

/**
 * Per-cell placement statistics used only to phrase the explanation in
 * terms of real counts (rather than raw boosted weights, which are not
 * meaningful to a human).
 */
function computePlacementStats(knowledge) {
  const { size } = knowledge;
  const placementsThroughCell = buildGrid(size);
  const hitLinkedThroughCell = buildGrid(size);
  let totalPlacements = 0;

  forEachValidPlacement(knowledge, (cells, hitsCovered) => {
    totalPlacements++;
    for (const c of cells) {
      placementsThroughCell[c.row][c.col]++;
      if (hitsCovered > 0) hitLinkedThroughCell[c.row][c.col]++;
    }
  });

  return { placementsThroughCell, hitLinkedThroughCell, totalPlacements };
}

function nearestUnresolvedHit(cell, unresolvedHits) {
  let best = null;
  let bestDistance = Infinity;
  for (const hit of unresolvedHits) {
    const distance = Math.abs(hit.row - cell.row) + Math.abs(hit.col - cell.col);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = hit;
    }
  }
  return best;
}

function buildExplanation(cell, knowledge, stats) {
  const hitLinked = stats.hitLinkedThroughCell[cell.row][cell.col];
  if (hitLinked > 0) {
    const hit = nearestUnresolvedHit(cell, knowledge.unresolvedHits);
    return (
      `Targeting ${formatCell(cell)} using Bayesian Search Theory — this cell ` +
      `completes ${hitLinked} of the remaining valid placements for the ship ` +
      `hit at ${formatCell(hit)}.`
    );
  }
  if (stats.totalPlacements > 0) {
    return (
      `Targeting ${formatCell(cell)} using Bayesian Search Theory — ` +
      `highest-probability cell across ${stats.totalPlacements} possible ` +
      `remaining ship configurations.`
    );
  }
  return (
    `Targeting ${formatCell(cell)} using Bayesian Search Theory — no ship ` +
    `placement is consistent with the shots so far, so firing at an ` +
    `unexplored cell.`
  );
}

function unattackedCells(knowledge) {
  const cells = [];
  forEachCell(knowledge.size, (row, col) => {
    if (!knowledge.shotsReceived.has(key(row, col))) cells.push({ row, col });
  });
  return cells;
}

/**
 * Picks the AI's next shot: the maximum-density cell from
 * `computeProbabilityMap`, breaking ties uniformly at random.
 *
 * Returns `{ cell: {row, col}, confidence: number, explanation: string,
 * probabilityMap: number[][] }`. `confidence` is the peak weight as a share
 * of the whole grid's weight — a consistent 0-1 measure of how concentrated
 * the decision was, not a rigorous posterior probability. `probabilityMap`
 * is the exact grid the decision was made from (also available standalone
 * via `computeProbabilityMap`) — this is what the UI renders as the
 * heatmap overlay and attaches to the HistoryEntry (see
 * `planning/decision-log.md`, Decision 15).
 */
export function chooseMove(state) {
  const knowledge = gatherFairKnowledge(state);
  const grid = computeProbabilityMap(state);

  let peak = 0;
  let total = 0;
  let candidates = [];
  forEachCell(knowledge.size, (row, col) => {
    const weight = grid[row][col];
    total += weight;
    if (weight <= 0) return;
    if (weight > peak) {
      peak = weight;
      candidates = [{ row, col }];
    } else if (weight === peak) {
      candidates.push({ row, col });
    }
  });

  // Degenerate case (every remaining ship sunk, or a state no placement can
  // explain): still return a legal shot rather than nothing.
  if (candidates.length === 0) candidates = unattackedCells(knowledge);
  if (candidates.length === 0) return null;

  const cell = pickRandom(candidates);
  const stats = computePlacementStats(knowledge);

  return {
    cell,
    confidence: total > 0 ? peak / total : 0,
    explanation: buildExplanation(cell, knowledge, stats),
    probabilityMap: grid,
  };
}
