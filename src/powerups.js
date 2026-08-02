// Game modes and power-ups.
//
// CLASSIC is the standard game: one shot per turn, nothing else.
// ADVANCED adds an economy — both sides earn points for landing hits and can
// spend them on two abilities.
//
// Two design decisions worth stating up front, because both could reasonably
// have gone the other way:
//
//  1. **Both sides get power-ups, not just the player.** A player-only economy
//     would make "Advanced" strictly easier than Classic, which is the wrong
//     shape for a mode with that name. Giving the AI the same budget keeps it
//     a genuine strategic layer rather than a difficulty reduction — and it
//     means the harness can measure whether the mechanic is actually balanced
//     instead of us asserting that it is.
//
//  2. **No change to the engine's contract.** Points are derived from the
//     history log rather than stored, and spending is tracked in a small
//     value object the caller owns. Airstrike goes through `engine.fireAt`
//     like any other shot, so no rule is reimplemented and the engine stays
//     unaware that power-ups exist.
//
// Fairness: `sonarScan` reads real ship positions, because revealing them is
// the entire point of the ability. Everything the AI learns from its own
// sonar is passed back through the same public channel the player sees, so
// the AI still never reads unsunk positions directly.

import { fireAt } from "./engine.js";

export const MODES = ["classic", "advanced"];

/**
 * Points awarded per outcome.
 *
 * Misses pay too. The first version paid only for hits — 2 a hit, 5 more for a
 * sink — and it made the whole economy inert: at a realistic hit rate you
 * needed roughly 35 shots to afford anything in a game that lasts about 45.
 * Measured, the mode shifted the win rate by +0.5 points, which is another way
 * of saying the mechanic never actually came into play.
 *
 * Paying a small amount for every shot fixes the pacing: the first ability is
 * reachable inside the first dozen turns, so the economy is something you use
 * during the game rather than a reward for having already won it.
 */
const POINTS = { miss: 1, hit: 3, sunk: 9 };

export const POWERUPS = {
  airstrike: {
    id: "airstrike",
    name: "Airstrike",
    cost: 18,
    shots: 5,
    description: "Fires on five random unhit cells at once.",
  },
  sonar: {
    id: "sonar",
    name: "Sonar Sweep",
    cost: 10,
    radius: 1,
    description: "Reveals which cells hold a ship in a 3x3 area.",
  },
};

/** A fresh, empty economy for one side. */
export function createLoadout() {
  return { spent: 0, uses: { airstrike: 0, sonar: 0 } };
}

/** Points earned so far by one actor, derived purely from the history log. */
export function pointsEarned(history, actor) {
  let total = 0;
  for (const entry of history) {
    if (entry.actor !== actor) continue;
    total += POINTS[entry.result] ?? 0;
  }
  return total;
}

/** Points available to spend right now. */
export function pointsAvailable(history, actor, loadout) {
  return pointsEarned(history, actor) - (loadout?.spent ?? 0);
}

export function canAfford(history, actor, loadout, powerupId) {
  const powerup = POWERUPS[powerupId];
  if (!powerup) return false;
  return pointsAvailable(history, actor, loadout) >= powerup.cost;
}

/** Records a purchase. Returns a new loadout; never mutates the input. */
export function spend(loadout, powerupId) {
  const powerup = POWERUPS[powerupId];
  if (!powerup) return loadout;
  return {
    spent: loadout.spent + powerup.cost,
    uses: { ...loadout.uses, [powerupId]: (loadout.uses[powerupId] ?? 0) + 1 },
  };
}

/** Every cell on a board that has not yet been fired upon. */
function unfiredCells(board) {
  const cells = [];
  for (let row = 0; row < board.size; row++) {
    for (let col = 0; col < board.size; col++) {
      if (!board.shotsReceived.has(`${row},${col}`)) cells.push({ row, col });
    }
  }
  return cells;
}

/**
 * Fires on several random unhit cells at once.
 *
 * Every shot goes through `engine.fireAt`, so hit detection, sinking and win
 * conditions all behave exactly as they do for a normal shot — including the
 * history entries, which is what keeps the points economy consistent.
 *
 * The engine flips the turn after each shot, so the turn is pinned back
 * between shots: an airstrike is one turn, not five.
 */
export function applyAirstrike(state, targetBoard, options = {}) {
  const random = options.random ?? Math.random;
  const count = options.shots ?? POWERUPS.airstrike.shots;
  const actor = targetBoard === "ai" ? "player" : "ai";

  const board = targetBoard === "ai" ? state.aiBoard : state.playerBoard;
  const available = unfiredCells(board);
  if (available.length === 0) return { newState: state, cells: [], results: [] };

  // Fisher-Yates over a copy, so a partial shuffle is enough for a few picks.
  const pool = [...available];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picks = pool.slice(0, Math.min(count, pool.length));

  let next = state;
  const results = [];
  for (const cell of picks) {
    if (next.status !== "in_progress") break;
    const outcome = fireAt({ ...next, turn: actor }, targetBoard, cell);
    next = outcome.newState;
    results.push({ cell, result: outcome.result });
  }

  // One turn total: hand play to the other side, unless the game just ended.
  if (next.status === "in_progress") {
    next = { ...next, turn: actor === "player" ? "ai" : "player" };
  }
  return { newState: next, cells: picks, results };
}

/**
 * Reveals whether each cell in a square around `centre` holds a ship.
 *
 * Read-only: it fires nothing, consumes no shot, and leaves the state
 * untouched. The caller decides how to display or remember the result.
 */
export function sonarScan(state, targetBoard, centre, options = {}) {
  const radius = options.radius ?? POWERUPS.sonar.radius;
  const board = targetBoard === "ai" ? state.aiBoard : state.playerBoard;

  const occupied = new Set();
  for (const ship of board.ships) {
    for (const cell of ship.cells) occupied.add(`${cell.row},${cell.col}`);
  }

  const revealed = [];
  for (let row = centre.row - radius; row <= centre.row + radius; row++) {
    for (let col = centre.col - radius; col <= centre.col + radius; col++) {
      if (row < 0 || col < 0 || row >= board.size || col >= board.size) continue;
      revealed.push({ row, col, hasShip: occupied.has(`${row},${col}`) });
    }
  }
  return revealed;
}

/**
 * The AI's power-up policy. Deliberately simple and legible — a sophisticated
 * one would be hard to explain and hard to justify as fair.
 *
 * Sonar when hunting blind: information is worth most when there is none.
 * Airstrike late, when the board is thinning and five scattered shots are
 * likely to connect. Never mid-hunt: when a ship is already wounded the AI's
 * normal targeting is far better than random scatter.
 */
export function chooseAiPowerup(state, loadout) {
  const available = pointsAvailable(state.history, "ai", loadout);
  const board = state.playerBoard;

  const hasUnresolvedHit = board.ships.some(
    (ship) => !ship.sunk && ship.hits.size > 0
  );
  if (hasUnresolvedHit) return null;

  const remaining = unfiredCells(board).length;
  const total = board.size * board.size;

  if (available >= POWERUPS.airstrike.cost && remaining < total * 0.55) {
    return "airstrike";
  }
  if (available >= POWERUPS.sonar.cost && remaining > total * 0.35) {
    return "sonar";
  }
  return null;
}
