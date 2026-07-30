# Devin Session Brief — Post-Game Coach (Session 7)

Paste this entire brief as the initial prompt for a new Devin cloud session
at app.devin.ai. Runs in parallel with Sessions 5 (fairness) and 6
(exhibition).

**Create exactly one session from this brief.** A previous round of this
project accidentally dispatched one brief to two sessions and produced two
competing PRs (see `planning/decision-log.md` Decision 17).

---

## Context
This repo is a single-player Battleship game with a Bayesian Search Theory
AI opponent. Read `planning/technical-design.md` for the shared data
contract and `AGENTS.md` for the repo rules before writing any code.

The game currently shows how well the AI played. This feature grades how
well the **human** played, by replaying the player's own shots through the
same probability engine the AI uses and reporting where they diverged from
optimal.

The output should read as an assessment a person would find genuinely
interesting — "you played at 61% of Bayesian-optimal, and here are your
three costliest shots" — not as a wall of statistics.

Repo: https://github.com/jakestergar/battleship-devin
Branch: create your own branch off `main`, open a PR when done.
Runtime: plain ES modules in the browser. No framework, no build step, no
new dependencies.

## What to build

### 1. `src/coach.js` — a new, self-contained module
Export a pure function:

```js
gradePlayerShots(state) -> {
  shots: [ {
    turnNumber, cell, result,
    probability,        // normalised 0-1 weight of the cell the player chose
    bestProbability,    // normalised weight of the best available cell
    bestCell,           // {row, col} the engine would have chosen
    rank                // 1 = player picked the best available cell
  } ],
  score: number,        // 0-1, player's efficiency vs Bayesian-optimal
  totalShots: number,
  worstShots: [ ... ]   // the 3 most costly choices, same shape as `shots`
}
```

Implementation requirements:
- Read only `state.history` (already-resolved data) plus the board state.
  This runs **after** the game ends.
- Replay the player's shots in order. Before each one, reconstruct the
  knowledge state that was available **at that moment** and call
  `ai.computeProbabilityMap` against the *AI's* board to find what the
  optimal choice would have been. Critically: the reconstruction must use
  only information the player legitimately had at that turn — do not leak
  later knowledge backwards. This is the hard part of the feature and the
  place a subtle bug is most likely; call it out explicitly in your PR.
- Define `score` clearly and document the definition in a comment. A
  defensible choice is the mean of `probability / bestProbability` across
  all shots, but if you pick something else, justify it. Whatever you
  choose, the number must be **honest** — a scoring function that flatters
  every player is worthless.
- Skip shots where the board offered no meaningful choice (e.g. only one
  unattacked cell remains) rather than counting them as failures.

This module must be **pure**: no DOM access, no mutation of the state
passed in, no import from `src/ui.js`. It may import from `src/engine.js`
and `src/ai.js` only.

### 2. A readable summary
Also export `formatCoachReport(grade) -> string` producing a short,
plain-language summary suitable for display, e.g.:

> You fired 47 shots and played at 61% of Bayesian-optimal.
> Your costliest shot was turn 12 at A1 — a 3% cell when F5 offered 24%.
> You matched the optimal target on 9 of 47 turns.

Prose, not a table dump. Three or four sentences.

### 3. UI surface
Render the report on the **end-of-game screen**. Note that `src/ui.js`
already exports `renderBattleReport(text)` and `renderEfficiencyStat(text)`
as mount points for related post-game output — read those first and follow
the same pattern rather than inventing a third mechanism.

**Integration constraint (three sessions are editing this repo in
parallel):** keep rendering inside your own module with a single
`mountCoach(rootEl, getState)` entry point. You may add **at most one
import line and one call site** to `src/ui.js`, and at most one container
element to `index.html`. Do not restructure existing render functions.

### 4. Graceful degradation
Per `planning/battleship-prd.md` Section 5, this is an additive layer.
Wrap the entry point so any failure leaves the end screen and the "new
game" control fully functional. A player must never be trapped on a broken
end screen — that would be worse than having no coach at all.

### 5. Tests
Add `tests/coach.test.js` using the existing `node:test` setup (see
`tests/ai.test.js` for the pattern). At minimum:
- A player who fires at the highest-probability cell every turn scores at
  or very near 1.0.
- A player who fires at the lowest-probability available cell every turn
  scores markedly lower. Assert the gap explicitly.
- `gradePlayerShots` does not mutate the `GameState` passed to it.
- The reconstruction does not leak future knowledge: a shot's
  `bestProbability` must be computable from only the turns preceding it.
  Construct this case deliberately — it is the failure mode most likely to
  slip through unnoticed.

## Explicit boundaries — do NOT do these
- Do not modify `src/engine.js` or `src/ai.js` contracts.
- Do not touch `src/fairness.js` or `src/exhibition.js` (other sessions own
  those files).
- Do not restructure `src/ui.js` beyond the single import and single call
  described above.
- Do not add dependencies or a build step.
- Do not make the coach flattering. If the player played badly, the report
  should say so plainly.

## Deliverable
A PR against `main`. The description must include a **real sample report**
generated from an actual played game, plus the scores your tests produced
for the optimal and worst-case players. Append an entry to
`planning/decision-log.md` covering how you reconstructed per-turn
knowledge and how you defined `score`, with an honest assessment of the
weaknesses in both.
