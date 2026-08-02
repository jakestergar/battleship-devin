// Tests the pure copy logic behind the title screen. Importing src/title.js
// in Node must not touch `document` — that's part of what these tests
// protect, and `mountTitle` must degrade instead of throwing.
import test from "node:test";
import assert from "node:assert/strict";

import {
  groupThousands,
  hookLine,
  mountTitle,
  statsNote,
  titleStats,
} from "../src/title.js";
import {
  AI_AVG_SHOTS,
  BASELINE_GAMES_PER_STRATEGY,
  EFFICIENCY_VS_RANDOM,
  RANDOM_BASELINE_AVG_SHOTS,
} from "../src/baseline.js";

test("groupThousands formats with thousands separators", () => {
  assert.equal(groupThousands(2000), "2,000");
  assert.equal(groupThousands(999), "999");
  assert.equal(groupThousands(1234567), "1,234,567");
});

test("groupThousands returns empty string for non-finite input", () => {
  assert.equal(groupThousands(Number.NaN), "");
  assert.equal(groupThousands(Infinity), "");
  assert.equal(groupThousands("2000"), "");
});

test("titleStats defaults come from the measured baseline, not hardcoded copy", () => {
  const stats = titleStats();
  assert.equal(stats.length, 3);
  assert.equal(stats[0].value, String(AI_AVG_SHOTS));
  assert.equal(stats[1].value, String(RANDOM_BASELINE_AVG_SHOTS));
  assert.equal(stats[2].value, `${EFFICIENCY_VS_RANDOM}%`);
  assert.deepEqual(
    stats.map((s) => s.key),
    ["ai", "random", "gain"]
  );
});

test("titleStats is overridable for testing without touching the baseline", () => {
  const stats = titleStats({ aiAvgShots: 40, randomAvgShots: 90, efficiency: 56 });
  assert.equal(stats[0].value, "40");
  assert.equal(stats[1].value, "90");
  assert.equal(stats[2].value, "56%");
});

test("hookLine quotes the measured efficiency gain", () => {
  assert.match(hookLine(), new RegExp(`${EFFICIENCY_VS_RANDOM}% fewer shots`));
  assert.match(hookLine({ efficiency: 12 }), /12% fewer shots/);
});

test("statsNote cites sample size and both averages", () => {
  const note = statsNote();
  assert.match(note, new RegExp(groupThousands(BASELINE_GAMES_PER_STRATEGY)));
  assert.match(note, new RegExp(String(AI_AVG_SHOTS)));
  assert.match(note, new RegExp(String(RANDOM_BASELINE_AVG_SHOTS)));
});

test("mountTitle returns false instead of throwing when there is no DOM", () => {
  assert.equal(mountTitle(null), false);
  assert.equal(mountTitle(undefined, {}), false);
  assert.equal(mountTitle({}), false);
});

test("mountTitle survives an element whose queries fail", () => {
  const broken = {
    ownerDocument: {
      createElement() {
        throw new Error("nope");
      },
    },
    querySelector() {
      throw new Error("nope");
    },
  };
  assert.equal(mountTitle(broken, { onStart() {} }), false);
});
