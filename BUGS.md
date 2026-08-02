# Bugs found and how they were fixed

Required deliverable for the Cognition Battleship exercise: what broke, how it
was found, what the root cause turned out to be, and how it was fixed.

The short version: **the bugs that mattered were not found by playing the
game.** Manual play surfaced cosmetic issues. Everything below came from
either simulating thousands of games, instrumenting the live DOM, or being
handed a symptom and chasing it to a cause that was not where it looked.

---

## How bugs were found

| Method | What it caught |
|---|---|
| Headless harness — 6,000 simulated games, invariants checked after **every** move | Nothing. The engine is solid in normal play. |
| **Deliberate contract probes** — edge cases normal play never reaches | 5 real engine bugs |
| DOM instrumentation across 5 viewport sizes | Layout bug hiding 3 features |
| A user reporting one wrong number | 2 compounding statistical bugs |
| Reading a diff after a merge | 1 self-inflicted bug that threw no error |

The most useful lesson: the harness found **zero** anomalies in 6,000 normal
games and **five** bugs the moment it probed the contract's edges. Bugs do not
live where the traffic is. They live where nobody has looked.

---

## 1. Five engine bugs at the contract boundary

`planning/technical-design.md` says `fireAt` "validates the shot." It
validated exactly one thing — whether the cell had already been fired at —
and silently accepted everything else.

**How found:** `auditEngineContract()` in `scripts/harness.js` deliberately
calls `fireAt` with malformed input rather than waiting for a strategy to
produce it. None of these are reachable through the UI, which is exactly why
they survived.

| # | Bug | Consequence |
|---|---|---|
| 1 | `fireAt(state, "player", {row: -1, col: 0})` returned `"miss"` | Off-board shot recorded in `shotsReceived` and appended to history |
| 2 | `fireAt(state, "player", {row: 1.5, col: 2})` accepted | Produced key `"1.5,2"` matching no cell — **permanently** inflated the shot count, could never be cleared |
| 3 | Shots accepted after `status` was terminal | Appended to the finished history that the Battle Report and efficiency stat read, and flipped `turn` back to a live value while `status` stayed `"ai_won"` |
| 4 | No turn validation | With `turn: "player"`, firing at `"player"` damaged your **own** fleet and logged it as your shot — could hand the win to the wrong side |
| 5 | Unknown board name silently defaulted | `targetBoard === "player" ? … : …` has no third branch, so `"enemy"` was treated as `"ai"` — a typo misfired instead of failing |

**Fix:** four guard clauses at the top of `fireAt` (`src/engine.js`), each
returning the existing `"no-op"` result rather than throwing, so the engine's
contract shape is unchanged. Plus an `isValidCell` helper that checks
`Number.isInteger` as well as bounds — the integer check is what closes #2.

**Verification:** the contract audit now reports `none`. Re-ran 6,000
simulated games: still zero anomalies.

**What fixing #4 exposed:** three test fixtures that had been firing twice in
a row at the same board without the turn alternating. They passed only because
the engine was permissive. One of them — "fire at all 100 cells" — is now
*unreachable by design*, since the game ends when a fleet sinks; it was
rewritten to build the exhausted board directly, because the thing under test
was the move selector, not the turn loop.

---

## 2. Win probability: near-certainty from one lucky shot

**Symptom (user-reported):** after the AI's first hit, the "Who Is Winning"
panel showed it at ~100%.

**Reproduced:** AI with 1 shot and 1 hit read **94%**. Three hits read
**99.9%**. But investigating also surfaced something the report had not
mentioned: a completely symmetric opening position read **45.7%** for the
player, who moves first and should be slightly *ahead*.

Two independent bugs, both pushing the same direction.

### 2a. An estimate treated as a fact

The Monte Carlo drew each side's hit rate as a smoothed **point estimate**,
then ran 3,000 trials all assuming that number was exactly right. After one
shot the AI's estimate is 0.262 against the player's 0.170 — and because the
race needs ~16 successes, that gap compounds into near-certainty. The
arithmetic was correct; the *model* was wrong. It was confident because it was
never told the estimate itself was uncertain.

**Fix:** hits are Bernoulli, so each side's rate now carries a conjugate
**Beta posterior**, and every trial draws its own rate from it. Early the
posterior is wide, sampled rates overlap heavily, and the estimate sits near
even. As real evidence accumulates the posterior narrows on its own. No
hand-tuned constants.

### 2b. Timeouts silently scored as AI wins

Once rates are *sampled*, some trials draw a rate near 0.02 — and clearing 17
cells at that rate needs ~850 shots. The trial cap was 400 half-turns, and the
loop counted anything that was "not a player win" as an AI win. Slow trials
were quietly awarded to the AI.

**Fix:** raised the cap so timeouts are genuinely rare, and unresolved trials
are now excluded from the denominator. An unresolved trial is missing
information, not evidence for either side.

| Position | Before | After |
|---|---|---|
| Symmetric opening | 45.7% player | **51.0%** (player moves first) |
| AI: 1 shot, 1 hit | 94% AI | **72%** |
| AI: 3 hits | 99.9% AI | 91.4% |
| Player landed 14/17 | 100% | 100% (correct — it really is over) |

Three regression tests added, each run repeatedly to check for flake.

---

## 3. A four-pixel shortfall that hid three features

**Symptom:** the page scrolled. Sounds cosmetic.

**How found:** rather than eyeball it, the live DOM was instrumented — element
positions measured against the viewport across five screen sizes. That turned
"a bit long" into: the page was **477px taller than the viewport**, and the AI
confidence meter, the explain-this-move panel and the shot counter were all
**below the fold**. Three of the five features the build exists to showcase
were invisible to anyone opening the link cold.

**Root cause:** two board panels plus the console's `min-width: 240px` needed
~1,184px. `.frame` capped width at **1,180px**. Missing by four pixels made
`flex-wrap` drop the console onto a second row.

**Fix:** replaced the wrapping flex row with an explicit three-column grid —
so the intent is structural rather than emergent — widened the frame, let the
console flow into multiple columns when it has spare width, and scaled cell
size to viewport height.

**Verification:** 0px overflow at 1440×700, 1512×780, 1728×910, 1920×940 and
1280×620, with every panel visible.

---

## 4. Bugs I introduced myself

Worth recording, because both were invisible and both were caught by
measurement rather than by looking.

**A merge that dropped a closing brace.** Resolving a CSS conflict by keeping
both sides consumed the `}` closing a `@media` block. That silently disabled
**every rule after it**, including all the responsive fixes from §3. Nothing
threw. Nothing logged. The only symptom was 65px of overflow at one viewport
size. Found by counting braces after the CSS behaved as though it were not
there. Now checked with a brace-balance count after every merge.

**A verification harness serving stale files.** The headless-Chrome checks
cache-busted the HTML but not the ES module imports, so a round of "verified"
results was measured against a cached `ui.js` from before the changes. This
produced a *false* bug report — features that appeared not to mount actually
mounted fine. Fixed by setting `Network.setCacheDisabled` in every CDP driver.
Sobering: for a while the tooling was less trustworthy than the code.

---

## 5. A hypothesis that was wrong

Ship graphics appeared to be missing. The theory was that the art measures
cell positions while the board is still `hidden`, so every ship computes as
zero-width and gets skipped — plausible, and the graceful-degradation wrapper
would have hidden the failure.

It was wrong. Reading `startBattle` showed the board is unhidden *before*
`render()` runs. Driving a real browser confirmed five ship figures at correct
sizes (212×40 for the 5-cell carrier, and so on).

Recorded because a confident, plausible, wrong diagnosis is a normal part of
debugging — and because it cost less to disprove it in a browser than to
"fix" something that was never broken.

---

## Known issues, not yet fixed

Listed honestly rather than omitted.

- **AI confidence meter is low-signal.** It reports peak weight as a share of
  total grid weight, which on a 100-cell board is ~1% early and rises sharply
  only after a hit. Mathematically correct, but it does not convey much. A
  better metric is how many times more likely the chosen cell is than average.
- **One flaky test.** `shapeIntensities keeps a hit-boosted map legible` in
  `tests/exhibition.test.js` failed once in a full-suite run and passed 3/3 in
  isolation. It is random-dependent and needs a seeded fixture.
- **`src/baseline.js` is generated but committed**, so it will drift if
  `ai.js` changes and nothing regenerates it.
- **ADVANCED mode is weakly tuned.** Measured over 600 games per mode, the
  power-up economy shifts the player win rate by only +0.5 points. It does not
  break balance, but it does not add much either. Measured, not assumed — see
  `scripts/balance.js`.

---

## Reproducing any of this

```bash
npm test                    # 147 tests
node scripts/harness.js     # 6,000 games + contract audit
node scripts/balance.js 600 # classic vs advanced balance
```
