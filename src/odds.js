// Win probability: who is actually ahead, and by how much.
//
// The AI confidence meter answers "how sure is the AI about THIS shot". It
// says nothing about who is winning. This module answers that instead.
//
// Approach: Monte Carlo, not a formula. Both players are racing to remove a
// known number of remaining ship cells, and each is modelled as a Bernoulli
// hit process using the hit rate they have actually demonstrated this game.
// Simulating the rest of the race a few thousand times gives a win
// probability directly, and — unlike a hand-tuned heuristic — the assumptions
// are visible and arguable rather than baked into a magic constant.
//
// Why Monte Carlo is the honest choice here: the race is not symmetric. The
// side to move matters, the remaining counts differ, and the hit rates differ.
// Getting a closed form right for all of that is fiddly; simulating it is
// three lines and obviously correct.
//
// Fairness: this reads only information the player already has on screen —
// the number of hits landed on each board and the number of shots taken. It
// never inspects unsunk ship positions, on either side.

import { BOARD_SIZE, FLEET } from "./engine.js";

/** Total ship cells in a full fleet — 17 on the standard board. */
export const FLEET_CELLS = FLEET.reduce((sum, ship) => sum + ship.length, 0);

/**
 * Hit rate a purely random searcher would achieve: fleet cells over board
 * cells. Used as the prior below so that early-game estimates are not wild.
 */
export const RANDOM_HIT_RATE = FLEET_CELLS / (BOARD_SIZE * BOARD_SIZE);

/**
 * Pseudo-count weight for the prior. With PRIOR_WEIGHT = 8, a player who has
 * fired 3 shots and hit all 3 is estimated at roughly 40%, not 100% — which
 * is the point. It decays out of the way once there is real evidence.
 */
const PRIOR_WEIGHT = 8;

const DEFAULT_TRIALS = 3000;
// A race cannot sanely exceed this many half-turns; guards against a zero
// hit rate producing an unbounded loop.
const MAX_STEPS = 400;

function smoothedHitRate(hits, shots) {
  return (hits + RANDOM_HIT_RATE * PRIOR_WEIGHT) / (shots + PRIOR_WEIGHT);
}

/**
 * Cells still afloat on a board. Derived from each ship's own hit set, which
 * is public information: every hit is already marked on screen.
 */
function cellsRemaining(board) {
  let remaining = 0;
  for (const ship of board.ships) {
    remaining += ship.cells.length - ship.hits.size;
  }
  return remaining;
}

/** Shots taken and hits landed by one actor, read from the history log. */
function tallyShots(history, actor) {
  let shots = 0;
  let hits = 0;
  for (const entry of history) {
    if (entry.actor !== actor) continue;
    shots++;
    if (entry.result === "hit" || entry.result === "sunk") hits++;
  }
  return { shots, hits };
}

/**
 * Estimates each side's chance of winning from the current position.
 *
 * Returns `null` if the state is unusable, so callers can degrade rather than
 * render a meaningless number.
 */
export function estimateWinProbability(state, options = {}) {
  if (!state || !state.playerBoard || !state.aiBoard) return null;

  const trials = options.trials ?? DEFAULT_TRIALS;
  const random = options.random ?? Math.random;

  // The player is shooting at the AI's board, so the player's race is to
  // clear whatever is left afloat there — and vice versa.
  const playerNeeds = cellsRemaining(state.aiBoard);
  const aiNeeds = cellsRemaining(state.playerBoard);

  // Terminal positions are certainties, not estimates.
  if (playerNeeds <= 0 && aiNeeds <= 0) return null;
  if (playerNeeds <= 0) {
    return finished(1, playerNeeds, aiNeeds, state);
  }
  if (aiNeeds <= 0) {
    return finished(0, playerNeeds, aiNeeds, state);
  }

  const playerTally = tallyShots(state.history, "player");
  const aiTally = tallyShots(state.history, "ai");
  const playerRate = smoothedHitRate(playerTally.hits, playerTally.shots);
  const aiRate = smoothedHitRate(aiTally.hits, aiTally.shots);

  let playerWins = 0;
  for (let t = 0; t < trials; t++) {
    let p = playerNeeds;
    let a = aiNeeds;
    let playerToMove = state.turn !== "ai";
    let steps = 0;
    while (steps++ < MAX_STEPS) {
      if (playerToMove) {
        if (random() < playerRate && --p <= 0) {
          playerWins++;
          break;
        }
      } else if (random() < aiRate && --a <= 0) {
        break;
      }
      playerToMove = !playerToMove;
    }
  }

  const player = playerWins / trials;
  return {
    player,
    ai: 1 - player,
    playerNeeds,
    aiNeeds,
    playerHitRate: playerRate,
    aiHitRate: aiRate,
    playerShots: playerTally.shots,
    aiShots: aiTally.shots,
    trials,
    settled: false,
  };
}

function finished(playerProbability, playerNeeds, aiNeeds, state) {
  const playerTally = tallyShots(state.history, "player");
  const aiTally = tallyShots(state.history, "ai");
  return {
    player: playerProbability,
    ai: 1 - playerProbability,
    playerNeeds,
    aiNeeds,
    playerHitRate: smoothedHitRate(playerTally.hits, playerTally.shots),
    aiHitRate: smoothedHitRate(aiTally.hits, aiTally.shots),
    playerShots: playerTally.shots,
    aiShots: aiTally.shots,
    trials: 0,
    settled: true,
  };
}

/** One short line of plain language describing the position. */
export function describeOdds(odds) {
  if (!odds) return "";
  if (odds.settled) {
    return odds.player === 1 ? "Enemy fleet destroyed." : "Your fleet is lost.";
  }
  const pct = Math.round(odds.player * 100);
  const lead = Math.abs(pct - 50);
  const who = pct >= 50 ? "You" : "The AI";
  if (lead < 5) return `Dead even — ${odds.playerNeeds} to sink, ${odds.aiNeeds} against you.`;
  const strength = lead > 35 ? "commanding" : lead > 18 ? "clear" : "slight";
  return `${who} hold a ${strength} advantage — ${odds.playerNeeds} to sink, ${odds.aiNeeds} against you.`;
}
