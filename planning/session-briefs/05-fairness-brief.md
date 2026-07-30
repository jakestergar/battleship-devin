# Devin Session Brief — Provable Fairness (Session 5)

Paste this entire brief as the initial prompt for a new Devin cloud session
at app.devin.ai. Runs in parallel with Sessions 6 (exhibition) and 7 (coach).
All three run AFTER engine/ai/ui are on `main` (they are).

**Create exactly one session from this brief.** A previous round of this
project accidentally dispatched one brief to two sessions and produced two
competing PRs (see `planning/decision-log.md` Decision 17).

---

## Context
This repo is a single-player Battleship game with a Bayesian Search Theory
AI opponent. Read `planning/technical-design.md` for the shared data
contract and `AGENTS.md` for the repo rules before writing any code.

The single most common accusation levelled at a strong Battleship AI is
that it is cheating — peeking at the player's ship positions. This repo's
AI genuinely does not cheat, and that property is already enforced
structurally rather than by convention: `src/ai.js` gathers its knowledge
only from public information (shots received, its own shot history, and the
cells of ships whose sinking has already been announced). `tests/ai.test.js`
already contains a test proving that relocating every unsunk ship leaves
`computeProbabilityMap`'s output unchanged.

**That proof currently exists only in a test file. Your job is to make it
something a player can trigger and watch, live, in the browser.**

Repo: https://github.com/jakestergar/battleship-devin
Branch: create your own branch off `main`, open a PR when done.
Runtime: plain ES modules in the browser. No framework, no build step, no
new dependencies.

## What to build

### 1. `src/fairness.js` — a new, self-contained module
Export a single pure function:

```js
verifyFairness(state) -> {
  ok: boolean,              // true if all recomputed maps were identical
  trials: number,           // how many shuffled boards were tested
  referenceHash: string,    // hash of the probability map on the real board
  trialHashes: string[],    // hash from each shuffled board
  chosenCell: {row, col}    // the cell the AI selects (unchanged by shuffling)
}
```

Implementation requirements:
- Take the current `GameState`. Build N (default 5) **alternative**
  `GameState`s in which every **unsunk** player ship is relocated to a
  different legal position, while holding fixed everything the AI is
  allowed to know: `playerBoard.shotsReceived`, `state.history`, and the
  cells of every **already-sunk** ship.
- The relocation must remain consistent with public knowledge — a shuffled
  layout must not place an unsunk ship on a cell that was already fired at
  and reported as a miss, and must not contradict known hits. Reuse
  `engine.enumerateLegalPlacements` / `engine.cellsForPlacement` rather than
  writing new placement logic. If a consistent shuffle cannot be found for
  a given board state (this is possible late in a game), return
  `ok: true` with `trials: 0` and let the UI say so honestly — **do not
  fabricate a passing result**.
- For each alternative state, call `ai.computeProbabilityMap` and hash the
  result. Compare every hash to the reference hash from the real board.
- Hashing: implement a small deterministic string hash over the flattened
  numeric grid (e.g. FNV-1a or djb2) directly in this module. Do **not** add
  a dependency and do **not** use async `crypto.subtle` — this must be
  synchronous and trivially explainable.

This module must be **pure**: no DOM access, no mutation of the state passed
in, no import from `src/ui.js`. It may import from `src/engine.js` and
`src/ai.js` only.

### 2. UI surface
A **"Verify fairness"** control, available during play. When triggered it
runs `verifyFairness` on the current state and displays a short, readable
result — for example:

> Recomputed the AI's targeting map against 5 randomly relocated versions
> of your fleet. All 5 produced an identical map (hash `a3f91c2e`).
> The AI cannot see your ships.

Show the reference hash and the trial hashes so the claim is inspectable,
not just asserted. If `ok` is false, say so plainly and show the differing
hashes — a fairness checker that cannot report failure is worthless.

**Integration constraint (important — three sessions are editing this repo
in parallel):** put all of your rendering in your own module, exposing a
single `mountFairness(rootEl, getState)` entry point. You may add **at most
one import line and one call site** to `src/ui.js`, and at most one
container element to `index.html`. Do not restructure existing render
functions.

### 3. Graceful degradation
Per `planning/battleship-prd.md` Section 5, this is an additive layer. Wrap
the entry point so that any failure leaves the game fully playable — the
control simply reports that verification is unavailable. A bug here must
never block a turn or throw into the turn loop.

### 4. Tests
Add `tests/fairness.test.js` using the existing `node:test` setup (see
`tests/ai.test.js` for the pattern). At minimum:
- On a mid-game fixture, `verifyFairness` returns `ok: true` with
  `trials > 0`.
- The function does not mutate the `GameState` passed to it.
- The hash function is deterministic — same grid in, same hash out — and
  returns different hashes for grids that differ in a single cell.
- A deliberately "cheating" map function (one that reads unsunk ship
  positions) would be caught: construct the negative case explicitly so the
  test proves the checker actually has teeth.

That last test matters most. A fairness checker that passes everything is
indistinguishable from one that does nothing.

## Explicit boundaries — do NOT do these
- Do not modify `src/engine.js` or `src/ai.js` contracts. If you believe a
  change is genuinely required, flag it in the PR rather than making it.
- Do not touch `src/exhibition.js` or `src/coach.js` (other sessions own
  those files).
- Do not restructure `src/ui.js` beyond the single import and single call
  described above.
- Do not add dependencies or a build step.

## Deliverable
A PR against `main`. The description must state what the verification
actually found when you ran it — the trial count and whether hashes matched
on a real mid-game state — not just a description of the code. Append an
entry to `planning/decision-log.md` covering any non-obvious call you made
(especially how you constrained shuffles to stay consistent with public
knowledge), including an honest assessment of its weaknesses.
