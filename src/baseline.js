// GENERATED FILE — do not edit by hand.
// Produced by `node scripts/harness.js` (see planning/session-briefs/04-harness-brief.md).
// Every number below is measured, not estimated: 2000 simulated
// board-clearing games per strategy, seeds 20240501..20242500,
// generated 2026-08-02.
//
// "avgShots" is the mean number of shots that strategy needed to sink all
// 5 enemy ships on a 10x10 board (100 cells). Measured in the harness's
// "clearing" mode so the numbers are uncensored — see scripts/harness.js.

export const BASELINE_GAMES_PER_STRATEGY = 2000;
export const BASELINE_GENERATED_AT = "2026-08-02";

/** Mean shots for a uniformly random searcher to clear the board. */
export const RANDOM_BASELINE_AVG_SHOTS = 95.3;

/** Mean shots for the shipped Bayesian Search Theory AI. */
export const AI_AVG_SHOTS = 44.9;

/** Whole-percent efficiency gain of the real AI over random search. */
export const EFFICIENCY_VS_RANDOM = 53;

/** Head-to-head stats behind the in-game Strategy Arena. */
export const ARENA_STRATEGIES = [
  {
    strategy: "random",
    label: "Random search",
    games: 2000,
    avgShots: 95.3,
    medianShots: 97,
    bestShots: 59,
    worstShots: 100,
    hitRate: 0.179,
    histogram: { binSize: 5, min: 15, counts: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 6, 17, 43, 163, 428, 1340] },
  },
  {
    strategy: "hunt-and-target",
    label: "Hunt and target",
    games: 2000,
    avgShots: 60,
    medianShots: 59,
    bestShots: 24,
    worstShots: 100,
    hitRate: 0.302,
    histogram: { binSize: 5, min: 15, counts: [0, 1, 17, 35, 95, 171, 209, 231, 242, 256, 217, 175, 126, 114, 64, 32, 15] },
  },
  {
    strategy: "bayesian",
    label: "Bayesian Search Theory",
    games: 2000,
    avgShots: 44.9,
    medianShots: 44,
    bestShots: 22,
    worstShots: 70,
    hitRate: 0.396,
    histogram: { binSize: 5, min: 15, counts: [0, 3, 69, 201, 348, 415, 359, 267, 157, 134, 44, 3, 0, 0, 0, 0, 0] },
  },
];

/**
 * Invariant violations seen during simulated play across all runs that
 * produced this file (0 means the engine held up under every in-game check).
 * Separately, `auditEngineContract()` found 5 edge-case contract
 * violation(s) that normal play never reaches — see the harness output.
 */
export const HARNESS_ANOMALY_COUNT = 0;
export const HARNESS_CONTRACT_ANOMALY_COUNT = 5;

/** Full-game (AI vs. a random-firing player) win rates, for context. */
export const DUEL_STATS = [
  {
    "strategy": "random",
    "games": 2000,
    "winRateVsRandomPlayer": 0.485,
    "avgWinningTurnNumber": 184.8
  },
  {
    "strategy": "hunt-and-target",
    "games": 2000,
    "winRateVsRandomPlayer": 0.989,
    "avgWinningTurnNumber": 118
  },
  {
    "strategy": "bayesian",
    "games": 2000,
    "winRateVsRandomPlayer": 1,
    "avgWinningTurnNumber": 88.7
  }
];
