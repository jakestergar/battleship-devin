# Devin Session Brief — Playtest Harness (Session 4 of 4, parallel with AI + UI)

Paste this entire brief as the initial prompt for a new Devin cloud session
at app.devin.ai. Runs in parallel with the AI and UI sessions, AFTER the
engine module (Session 1) has landed on `main`.

---

## Context
You are building an automated, headless playtesting harness for a
single-player Battleship game. This is a **dev-tool script, not part of the
deployed game** — the deployed game itself is a static site with no backend
and no build step, but this harness runs separately (via Node.js) to
stress-test the engine and AI at scale. It has two purposes:

1. **Bug-hunting at scale** — play hundreds/thousands of automated games and
   catch anomalies a few manual playtests would never surface. This directly
   produces the required bug-fix documentation for this exercise.
2. **Efficiency baseline** — compute how many shots a purely random AI takes
   on average, so the real AI's performance can be benchmarked against it
   in-game ("46% more efficient than random search").

The engine (`src/engine.js`) is already on `main` — read it before writing
code. The real AI module (`src/ai.js`, providing `chooseMove`) is being
built in parallel and may not be merged yet when you start.

**Do not block on that.** Build against a local mock `chooseMove` matching
the real contract (pick a random unattacked cell, return a plausible
`confidence`/`explanation`) until the real module is available, with a
clearly marked integration point to swap it in.

Repo: [INSERT PUBLIC GITHUB REPO URL]
Branch: create your own branch off `main`, open a PR when done.
Runtime: Node.js (no DOM/browser dependency — the engine and AI modules
must not require one either; if you find they do, flag it in your PR, don't
silently work around it).
Target file(s): `scripts/harness.js` (or `scripts/harness/` — your call).

## What to build

### 1. `simulateGame(chooseMoveFn): GameState`
Runs one full game to completion using only `engine.js` functions plus the
given `chooseMoveFn` (real or mock) for the AI's moves. The **player's**
side of the game also needs a move source for this to run headlessly —
implement a simple random-move function for the player side too (this
harness isn't testing human play, just engine+AI correctness end to end).

### 2. `randomChooseMove(state): { cell, confidence, explanation }`
A trivial baseline AI: picks uniformly at random among unattacked cells on
the target board. `confidence`/`explanation` can be simple placeholders
(e.g. `confidence: null`, `explanation: "random"`) — this function exists
purely as a comparison baseline, not a real feature. Implement this
directly in the harness; do not modify `src/ai.js` to add a "dumb mode."

### 3. `runBatch(n: number, chooseMoveFn): { results, anomalies, avgShotsToWin }`
Runs `n` simulated games (via `simulateGame`) and, after every single move
in every game, validates these invariants:
- The move was legal (target cell was not already in that board's
  `shotsReceived` before this move — if it was, the engine should have
  returned a no-op; verify it actually did).
- Board state stays internally consistent (e.g. a `Ship` marked `sunk` has
  all of its cells in `hits`; `shotsReceived` only grows, never shrinks).
- The game actually terminates within a sane number of moves (e.g. flag
  anything exceeding 2x the board's cell count as a probable infinite-loop
  bug rather than letting it hang forever).
- `isGameOver` and `status` never disagree.

Any violation is recorded as an **anomaly**: capture enough detail to
reproduce it exactly — the random seed if you're using one, or at minimum
the full sequence of moves/`GameState.history` up to the point of failure.
Do not just log "something went wrong" — the whole point is a reproducible
bug report.

Also compute and return `avgShotsToWin` (games where the AI wins, average
`turnNumber` of the winning shot) across the batch — this is what feeds the
efficiency benchmark.

### 4. A runnable entry point
`node scripts/harness.js` (or similar) should, at minimum:
- Run a batch (e.g. 1,000 games) with the **real AI** (or mock if not yet
  available — clearly log which one is in use) and print/save:
  - Total anomalies found, with enough detail to investigate each one.
  - `avgShotsToWin`.
- Run a batch with `randomChooseMove` to get the random baseline
  `avgShotsToWin` for comparison.
- Print a clear summary: e.g. `"Real AI: 51.2 avg shots | Random baseline: 94.8 avg shots | 46% more efficient"`.
- Write the baseline number somewhere reusable by the actual game (e.g. a
  small JSON/JS constant file) so the deployed game's efficiency-benchmark
  feature (built during integration) doesn't need to recompute it live.

## Explicit boundaries — do NOT do these
- Do not modify `src/engine.js` or `src/ai.js` contracts.
- Do not build any UI/rendering — this is a Node script, no browser
  involved.
- Do not silently swallow anomalies — if something is invariant-violating,
  it must show up in the harness's output, not just be worked around.

## Deliverable
- A PR against `main` with the harness script(s).
- The PR description must include the **actual results** of a real run:
  how many games were simulated, how many anomalies were found (and a
  summary of what they were, if any), and the real vs. random
  `avgShotsToWin` numbers. This output is directly what feeds the required
  bug-fix write-up and the in-game efficiency benchmark — don't just
  describe the code, report what it found.
