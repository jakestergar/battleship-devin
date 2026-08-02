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
// Guards against a very low sampled hit rate producing an unbounded loop.
//
// This was originally 400 and it silently biased every estimate: sampling the
// hit rate from a Beta posterior means some trials draw a rate near 0.02, and
// clearing 17 cells at that rate needs ~850 shots. Those trials hit the cap,
// and the loop scored anything that was "not a player win" as an AI win — so
// slow trials were quietly awarded to the AI. A dead-even opening position
// read 45.7% instead of just over 50%.
//
// Two fixes, both needed: a cap high enough that timeouts are genuinely rare,
// and counting unresolved trials as unresolved rather than as a loss.
const MAX_STEPS = 3000;

function smoothedHitRate(hits, shots) {
  return (hits + RANDOM_HIT_RATE * PRIOR_WEIGHT) / (shots + PRIOR_WEIGHT);
}

// ---------------------------------------------------------------------------
// Sampling the hit rate rather than assuming it
//
// An earlier version used the smoothed point estimate directly in every
// trial, and it was badly overconfident: one lucky opening hit put the AI at
// 94%, three at 99.9%. The arithmetic was right and the model was wrong. A
// single observation gives a hit rate of 0.262 against the player's 0.170,
// and because the race needs ~16 successes, that small gap compounds into
// near-certainty — but the gap itself was almost pure noise.
//
// The fix is to treat each side's hit rate as what it actually is: an unknown
// quantity with a posterior distribution, not a number. Hits are Bernoulli, so
// the conjugate posterior is Beta(prior_hits + hits, prior_misses + misses),
// and every trial draws its own rate from that posterior. Early on the
// posterior is wide, the drawn rates overlap heavily, and the estimate sits
// near even where it belongs. As real evidence accumulates the posterior
// narrows on its own and the estimate sharpens — without any hand-tuning.
// ---------------------------------------------------------------------------

/** Box-Muller. One normal deviate per call; the second is discarded. */
function normalSample(random) {
  let u = 0;
  while (u === 0) u = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

/** Marsaglia and Tsang's gamma sampler. */
function gammaSample(shape, random) {
  if (shape < 1) {
    // Boost a sub-1 shape into the valid range, then correct.
    return gammaSample(shape + 1, random) * Math.pow(random() || Number.EPSILON, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (let guard = 0; guard < 1000; guard++) {
    let x;
    let v;
    do {
      x = normalSample(random);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
  return d; // unreachable in practice; keeps the loop bounded
}

/** Beta(a, b) as the ratio of two gamma draws. */
function betaSample(a, b, random) {
  const g1 = gammaSample(a, random);
  const g2 = gammaSample(b, random);
  const total = g1 + g2;
  return total > 0 ? g1 / total : 0.5;
}

/** Posterior parameters for one side's hit rate. */
function posterior(hits, shots) {
  return {
    alpha: RANDOM_HIT_RATE * PRIOR_WEIGHT + hits,
    beta: (1 - RANDOM_HIT_RATE) * PRIOR_WEIGHT + Math.max(0, shots - hits),
  };
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

  const playerPosterior = posterior(playerTally.hits, playerTally.shots);
  const aiPosterior = posterior(aiTally.hits, aiTally.shots);

  let playerWins = 0;
  let resolved = 0;
  for (let t = 0; t < trials; t++) {
    // Each trial commits to one plausible pair of hit rates drawn from the
    // posteriors, then plays the race out. Averaging over trials therefore
    // averages over our uncertainty about the rates as well as the dice.
    const pRate = betaSample(playerPosterior.alpha, playerPosterior.beta, random);
    const aRate = betaSample(aiPosterior.alpha, aiPosterior.beta, random);

    let p = playerNeeds;
    let a = aiNeeds;
    let playerToMove = state.turn !== "ai";
    let steps = 0;
    while (steps++ < MAX_STEPS) {
      if (playerToMove) {
        if (random() < pRate && --p <= 0) {
          playerWins++;
          resolved++;
          break;
        }
      } else if (random() < aRate && --a <= 0) {
        resolved++;
        break;
      }
      playerToMove = !playerToMove;
    }
  }

  // Divide by trials that actually finished. An unresolved trial is missing
  // information, not evidence for either side.
  const player = resolved > 0 ? playerWins / resolved : 0.5;
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
