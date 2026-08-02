// Tests the pure logic behind the Strategy Arena. Importing src/arena.js in
// Node must not touch `document` — that's part of what these tests protect.
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildComparison,
  efficiencyPercent,
  histogramBars,
  mountArena,
  verdictText,
} from "../src/arena.js";
import { ARENA_STRATEGIES, BASELINE_GAMES_PER_STRATEGY } from "../src/baseline.js";

const FIXTURE = [
  {
    strategy: "random",
    label: "Random search",
    games: 100,
    avgShots: 95,
    medianShots: 97,
    bestShots: 70,
    worstShots: 100,
    hitRate: 0.18,
    histogram: { binSize: 5, min: 15, counts: [0, 0, 4, 16, 80] },
  },
  {
    strategy: "hunt-and-target",
    label: "Hunt and target",
    games: 100,
    avgShots: 60,
    medianShots: 59,
    bestShots: 30,
    worstShots: 96,
    hitRate: 0.3,
    histogram: { binSize: 5, min: 15, counts: [2, 20, 40, 30, 8] },
  },
  {
    strategy: "bayesian",
    label: "Bayesian Search Theory",
    games: 100,
    avgShots: 45,
    medianShots: 44,
    bestShots: 25,
    worstShots: 70,
    hitRate: 0.39,
    histogram: { binSize: 5, min: 15, counts: [10, 50, 30, 10, 0] },
  },
];

test("efficiencyPercent measures shots saved against a reference", () => {
  assert.equal(efficiencyPercent(45, 90), 50);
  assert.equal(efficiencyPercent(90, 90), 0);
  assert.equal(efficiencyPercent(100, 50), -100);
});

test("efficiencyPercent refuses meaningless inputs instead of returning NaN", () => {
  for (const [a, b] of [
    [NaN, 90],
    [45, 0],
    [45, -1],
    [null, 90],
    [45, undefined],
    ["45", 90],
  ]) {
    assert.equal(efficiencyPercent(a, b), null);
  }
});

test("histogramBars labels each bin and scales heights against a shared max", () => {
  const bars = histogramBars({ binSize: 5, min: 15, counts: [0, 25, 50] }, 50);
  assert.equal(bars.length, 3);
  assert.deepEqual(
    bars.map((b) => [b.lo, b.hi]),
    [
      [15, 19],
      [20, 24],
      [25, 29],
    ]
  );
  assert.equal(bars[0].heightPct, 0, "an empty bin draws nothing");
  assert.equal(bars[1].heightPct, 50);
  assert.equal(bars[2].heightPct, 100);
});

test("histogramBars keeps a rare-but-nonzero bin visible", () => {
  const bars = histogramBars({ binSize: 5, min: 15, counts: [1, 1000] }, 1000);
  assert.ok(bars[0].heightPct >= 3, "a single-game bin must not round away to nothing");
});

test("histogramBars degrades to an empty list for unusable input", () => {
  for (const input of [null, undefined, {}, { counts: "nope" }, 7]) {
    assert.deepEqual(histogramBars(input, 10), []);
  }
});

test("buildComparison ranks strategies best-first and marks the winner", () => {
  const comparison = buildComparison(FIXTURE);
  assert.deepEqual(
    comparison.rows.map((r) => r.id),
    ["bayesian", "hunt-and-target", "random"]
  );
  assert.equal(comparison.rows[0].isWinner, true);
  assert.equal(comparison.rows[1].isWinner, false);
  assert.equal(comparison.rows[2].isBaseline, true);
  assert.equal(comparison.winnerLabel, "Bayesian Search Theory");
});

test("buildComparison computes efficiency against the random baseline", () => {
  const comparison = buildComparison(FIXTURE);
  const [bayes, hunt, random] = comparison.rows;
  assert.equal(bayes.efficiencyVsBaseline, 53);
  assert.equal(hunt.efficiencyVsBaseline, 37);
  assert.equal(random.efficiencyVsBaseline, null, "the baseline isn't compared to itself");
  assert.equal(comparison.vsRandom, 53);
  assert.equal(comparison.vsHunt, 25);
  assert.equal(bayes.hitRatePct, 39);
});

test("buildComparison normalises each chart to its own peak", () => {
  // A shared vertical axis would squash the good strategies flat against
  // random search's spike; the shared *horizontal* axis carries the compare.
  const comparison = buildComparison(FIXTURE);
  for (const row of comparison.rows) {
    assert.equal(
      Math.max(...row.bars.map((b) => b.heightPct)),
      100,
      `${row.id}'s tallest bin should fill its own chart`
    );
    assert.equal(row.bars.length, 5, "every chart spans the same bins");
    assert.equal(row.bars[0].lo, 15);
  }
});

test("buildComparison returns null rather than rendering garbage", () => {
  for (const input of [null, [], "nope", [{ strategy: "x" }], [{ avgShots: 0 }], [null]]) {
    assert.equal(buildComparison(input), null);
  }
  // No argument at all falls back to the real baked-in dataset.
  assert.ok(buildComparison());
});

test("buildComparison survives a single-strategy dataset", () => {
  const comparison = buildComparison([FIXTURE[2]]);
  assert.equal(comparison.rows.length, 1);
  assert.equal(comparison.rows[0].isWinner, true);
  assert.equal(comparison.rows[0].isBaseline, true);
  assert.equal(comparison.vsRandom, 0);
  assert.equal(comparison.vsHunt, null);
});

test("verdictText names the winner and both margins", () => {
  const text = verdictText(buildComparison(FIXTURE));
  assert.match(text, /Bayesian Search Theory/);
  assert.match(text, /53% fewer shots than random search/);
  assert.match(text, /25% fewer than hunt-and-target/);
  assert.equal(verdictText(null), "");
});

test("mountArena declines instead of throwing when there is no DOM", () => {
  assert.equal(mountArena(null), false);
  assert.equal(mountArena(undefined), false);
  assert.equal(mountArena({}), false, "an object with no ownerDocument is not a mount point");
});

test("the baked-in baseline data is real, complete and self-consistent", () => {
  assert.ok(BASELINE_GAMES_PER_STRATEGY >= 1000, "the arena must quote a large-sample run");
  assert.equal(ARENA_STRATEGIES.length, 3);
  for (const s of ARENA_STRATEGIES) {
    assert.ok(["random", "hunt-and-target", "bayesian"].includes(s.strategy));
    assert.ok(s.avgShots > 17 && s.avgShots <= 100, `${s.strategy} avgShots looks wrong`);
    assert.ok(s.bestShots <= s.avgShots && s.avgShots <= s.worstShots);
    assert.ok(s.bestShots >= 17, "clearing 17 hull cells cannot take fewer than 17 shots");
    assert.ok(s.worstShots <= 100, "a 100-cell board cannot take more than 100 shots");
    assert.equal(
      s.histogram.counts.reduce((a, b) => a + b, 0),
      BASELINE_GAMES_PER_STRATEGY,
      `${s.strategy}'s histogram must account for every game`
    );
  }
  const byId = Object.fromEntries(ARENA_STRATEGIES.map((s) => [s.strategy, s]));
  assert.ok(byId.bayesian.avgShots < byId["hunt-and-target"].avgShots);
  assert.ok(byId["hunt-and-target"].avgShots < byId.random.avgShots);
  assert.ok(buildComparison(ARENA_STRATEGIES));
});
