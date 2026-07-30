# Devin Session Brief — AI Module (Session 2 of 4, parallel with UI + Harness)

Paste this entire brief as the initial prompt for a new Devin cloud session
at app.devin.ai. This session runs in parallel with the UI and harness
sessions, AFTER the engine module (Session 1) has already landed on `main`.

---

## Context
You are building the AI opponent for a simple, single-player Battleship
game. The engine (game state, rules, win detection) is already implemented
on `main` — read `src/engine.js` (or wherever it landed) to see the exact
`GameState`/`Board`/`Ship`/`HistoryEntry` shapes before writing any code.
Your job is ONLY the AI's targeting logic — do not modify the engine, build
UI, or touch the playtest harness; those are separate parallel workstreams.

Repo: [INSERT PUBLIC GITHUB REPO URL]
Branch: create your own branch off `main`, open a PR when done.
Stack: plain JavaScript, no framework, no new dependencies.
Target file(s): `src/ai.js` (or `src/ai/` — your call on internal layout).

## The algorithm: Bayesian Search Theory / probability-density targeting

This is a well-established technique (see public references: DataGenetics'
analysis of optimal Battleship search, and independent implementations like
`envoy1084/battleship-ai` and `kuang/battleshipAI` — read about the concept
for context, do not copy code from any external source). Implement it from
this specification:

**Critical constraint — the AI must not cheat.** It may only use publicly
known information, exactly what a human player would know: which cells have
been fired at and their results, and the full cell layout of ships that have
already been fully sunk (fair — sinking a ship reveals it). It must NOT read
the `cells` of ships that are not yet sunk directly from the board's ship
list, even though that data happens to be accessible in `GameState` (the
engine has to know real ship positions to resolve hits — the AI must not use
that shortcut). Derive everything from:
- `board.shotsReceived` (which cells have been fired at)
- `state.history` (to know which of those shots were hit/miss/sunk, and
  which ship — by id/length — was sunk by which shots)
- Sunk ships' full `cells` (fair, since sinking reveals them)

### `computeProbabilityMap(state: GameState): number[][]`

Computes a `size x size` grid of weights representing how likely each cell
is to contain part of a remaining (unsunk) ship, based only on the fair
information above. Algorithm:

1. Determine the set of **remaining unsunk ship lengths** — start from the
   full fleet (5, 4, 3, 3, 2) and remove the lengths of ships already sunk.
   (Note: two ships share length 3 — track by count, not just by id.)
2. Determine **known-miss cells** (fired upon, result was "miss") and
   **sunk-ship cells** (revealed, from sunk ships) — placements can't
   overlap either of these.
3. Determine **unresolved-hit cells** — cells with a "hit" result that do
   NOT belong to any currently-sunk ship (i.e., a hit we haven't finished
   off yet).
4. For every remaining ship length, for both orientations (horizontal,
   vertical), slide across every valid position on the board. A placement is
   **valid** if none of its cells are a known-miss or a sunk-ship cell (an
   unresolved-hit cell is fine to place over — that's exactly what we want
   to find). For every valid placement, increment the weight of **every
   cell it covers** by 1.
5. **Weight boost:** for any valid placement that covers one or more
   unresolved-hit cells, multiply that placement's contribution by a large
   factor scaling with how many unresolved-hit cells it covers (e.g.
   `100^N` where N = number of unresolved-hit cells covered) before adding
   it to the grid. This is what makes the AI aggressively finish off ships
   it's already found, rather than wandering — it's a natural consequence of
   the same weighting pass, not a separate "mode."
6. Zero out any cell already in `shotsReceived` (can't fire there again;
   also handled by the engine as a no-op, but the AI shouldn't waste a
   "confident" shot on a cell it can't legally take).
7. Return the grid.

### `chooseMove(state: GameState): { cell, confidence, explanation }`

- Call `computeProbabilityMap(state)`.
- Select the cell with the maximum weight; if there's a tie, choose
  uniformly at random among the tied cells.
- `confidence`: normalize to a 0-1 range — e.g. `peakWeight / sum(allWeights)`.
  This doesn't need to be statistically rigorous, just a reasonable,
  consistent measure of how concentrated the decision was (a hunt-phase
  shot with many similar-weight cells should read as lower confidence than
  a shot right next to a known unresolved hit).
- `explanation`: a short, plain-language string describing why this cell was
  chosen, referencing real numbers from the computation. Use "Bayesian
  Search Theory" as the named technique. Two example styles (adapt to
  actual data, don't hardcode):
  - Near an unresolved hit: `"Targeting (4,7) using Bayesian Search Theory — this cell completes 6 of the remaining valid placements for the ship hit at (4,6)."`
  - General hunt phase: `"Targeting (2,3) using Bayesian Search Theory — highest-probability cell across 214 possible remaining ship configurations."`

## Testing expectations
- Unit test `computeProbabilityMap` against small, hand-constructed board
  states where you can reason about the correct weight distribution (e.g. an
  empty board should be roughly symmetric; a board with one unresolved hit
  should heavily weight the four adjacent cells).
- Test that the AI never selects a cell already in `shotsReceived`.
- Test the "no cheating" constraint directly if possible — e.g. verify that
  `computeProbabilityMap`'s output doesn't change if you mutate an unsunk
  ship's `cells` array in a test fixture while keeping `shotsReceived`/
  `history` the same (it shouldn't be reading that field at all for unsunk
  ships).
- Test that sinking a ship correctly removes it from "remaining ship
  lengths" for subsequent probability calculations.

## Explicit boundaries — do NOT do these
- Do not modify `src/engine.js` or its contract.
- Do not build any rendering/heatmap UI — the UI session consumes your
  `probabilityMapSnapshot`/`confidence`/`explanation` output, it doesn't
  call into your internals directly beyond `chooseMove`.
- Do not build the playtest harness — separate session, though it will call
  your `chooseMove` function directly (headless), so make sure it has no
  hidden dependency on a browser/DOM environment.
- Do not add a "difficulty levels" system — one strong AI only, per PRD
  scope.

## Deliverable
- A PR against `main` with `computeProbabilityMap`, `chooseMove`, and tests.
- PR description should explain the weighting/boost approach in your own
  words (not just restate this brief) — this feeds directly into the
  interview debrief narrative around the AI's design.
- Confirm the exact return shape of `chooseMove` matches
  `{ cell: {row, col}, confidence: number, explanation: string }` since the
  engine integration and UI both depend on it exactly.
