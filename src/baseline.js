// GENERATED FILE — do not edit by hand.
// Produced by `node scripts/harness.js` (see planning/session-briefs/04-harness-brief.md).
// Every number below is measured, not estimated: 1000 simulated
// board-clearing games per strategy, seeds 20240501..20241500,
// generated 2026-08-02.
//
// "avgShots" is the mean number of shots that strategy needed to sink all
// 5 enemy ships on a 10x10 board (100 cells). Measured in the harness's
// "clearing" mode so the numbers are uncensored — see scripts/harness.js.

export const BASELINE_GAMES_PER_STRATEGY = 1000;
export const BASELINE_GENERATED_AT = "2026-08-02";

/** Mean shots for a uniformly random searcher to clear the board. */
export const RANDOM_BASELINE_AVG_SHOTS = 95.3;

/** Mean shots for the shipped Bayesian Search Theory AI. */
export const AI_AVG_SHOTS = 45.1;

/** Whole-percent efficiency gain of the real AI over random search. */
export const EFFICIENCY_VS_RANDOM = 53;

/** Head-to-head stats behind the in-game Strategy Arena. */
export const ARENA_STRATEGIES = [
  {
    strategy: "random",
    label: "Random search",
    games: 1000,
    avgShots: 95.3,
    medianShots: 97,
    bestShots: 64,
    worstShots: 100,
    hitRate: 0.179,
    histogram: { binSize: 5, min: 15, counts: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 10, 21, 79, 217, 671] },
  },
  {
    strategy: "hunt-and-target",
    label: "Hunt and target",
    games: 1000,
    avgShots: 60.5,
    medianShots: 60,
    bestShots: 26,
    worstShots: 100,
    hitRate: 0.3,
    histogram: { binSize: 5, min: 15, counts: [0, 0, 8, 15, 47, 82, 105, 120, 114, 120, 110, 86, 63, 70, 32, 18, 10] },
  },
  {
    strategy: "bayesian",
    label: "Bayesian Search Theory",
    games: 1000,
    avgShots: 45.1,
    medianShots: 44,
    bestShots: 22,
    worstShots: 70,
    hitRate: 0.394,
    histogram: { binSize: 5, min: 15, counts: [0, 2, 28, 96, 178, 217, 168, 133, 86, 68, 22, 2, 0, 0, 0, 0, 0] },
  },
];

/**
 * Invariant violations seen during simulated play across all runs that
 * produced this file (0 means the engine held up under every in-game check).
 * Separately, `auditEngineContract()` found 0 edge-case contract
 * violation(s) that normal play never reaches — see the harness output.
 */
export const HARNESS_ANOMALY_COUNT = 0;
export const HARNESS_CONTRACT_ANOMALY_COUNT = 0;

/** Full-game (AI vs. a random-firing player) win rates, for context. */
export const DUEL_STATS = [
  {
    "strategy": "random",
    "games": 1000,
    "winRateVsRandomPlayer": 0.472,
    "avgWinningTurnNumber": 184.8
  },
  {
    "strategy": "hunt-and-target",
    "games": 1000,
    "winRateVsRandomPlayer": 0.989,
    "avgWinningTurnNumber": 117.8
  },
  {
    "strategy": "bayesian",
    "games": 1000,
    "winRateVsRandomPlayer": 1,
    "avgWinningTurnNumber": 88.3
  }
];
