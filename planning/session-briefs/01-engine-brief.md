# Devin Session Brief — Engine Module (Session 1 of 4, build FIRST, alone)

Paste this entire brief as the initial prompt for a new Devin cloud session
at app.devin.ai. This session must complete and land before any other
session (AI, UI, harness) starts, since they all depend on the data
contract this session implements.

---

## Context
You are building the core game engine for a simple, single-player
Battleship game (human vs. AI). This is one of several independent, parallel
workstreams building this game — your job is ONLY the engine: game state,
rules, and validation. Do not build any UI, AI decision-making, or rendering
— those are separate sessions that will build against the exact interface
you produce here.

Repo: https://github.com/jakestergar/battleship-devin
Stack: plain HTML/CSS/JavaScript, no framework, no build tooling, no backend.
Target file(s): `src/engine.js` (or equivalent — use clean ES module
structure, your call on exact file layout within `src/engine/`).

## What to build

Implement a pure, immutable game engine using the following exact data
shapes and function signatures — these are load-bearing; other workstreams
depend on this exact contract, so do not rename fields or change shapes
without a very good reason (and if you do, document it clearly in your PR
description).

### Data shapes

```js
// A single ship on a board
Ship = {
  id: string,             // e.g. "carrier", "battleship", "cruiser", "submarine", "destroyer"
  length: number,          // 5, 4, 3, 3, 2 respectively
  cells: [ {row, col} ],   // occupied cells, 0-indexed
  hits: Set<string>,       // "row,col" keys of this ship's cells that have been hit
  sunk: boolean
}

// One player's board
Board = {
  size: number,                 // 10
  ships: [ Ship ],
  shotsReceived: Set<string>    // every "row,col" fired at on this board
}

// Full game state — single source of truth
GameState = {
  playerBoard: Board,
  aiBoard: Board,
  turn: "player" | "ai",
  status: "in_progress" | "player_won" | "ai_won",
  history: [ HistoryEntry ]
}

// One logged turn
HistoryEntry = {
  turnNumber: number,
  actor: "player" | "ai",
  cell: {row, col},
  result: "hit" | "miss" | "sunk",
  shipId: string | null,
  probabilityMapSnapshot: number[][] | null,  // leave null — AI session fills this in
  confidence: number | null,                  // leave null — AI session fills this in
  explanation: string | null                  // leave null — AI session fills this in
}
```

### Required functions

- `createGame(): GameState` — creates a new game with both boards randomly
  populated with the standard 5-ship fleet (Carrier-5, Battleship-4,
  Cruiser-3, Submarine-3, Destroyer-2), turn starts as `"player"`, status
  `"in_progress"`, empty history.

  **Ship placement algorithm (use this specific approach, not naive
  trial-and-error):** place ships **largest-first**. For each ship,
  enumerate every legal placement (both horizontal and vertical
  orientations, respecting board bounds and cells already occupied by
  previously-placed ships), pick one placement uniformly at random from the
  legal set, and mark those cells occupied. If any ship has zero legal
  placements remaining, restart the entire placement process for that
  board. This is more robust than naive retry-per-ship, which can dead-end
  on small ships late in placement.

- `fireAt(state: GameState, targetBoard: "player" | "ai", cell: {row, col}): { newState: GameState, result: "hit" | "miss" | "sunk" | "no-op" }`
  - `targetBoard` is whichever board is being fired upon (if it's the
    player's turn, they fire at `"ai"`'s board, and vice versa).
  - If `cell` has already been fired upon (already in that board's
    `shotsReceived`), this is a **no-op**: return the state unchanged
    (do not mutate history, do not flip turn, do not throw an error) and
    `result: "no-op"`.
  - Otherwise: mark the cell in `shotsReceived`, determine hit/miss, update
    the relevant `Ship.hits` if hit, mark `Ship.sunk = true` if all of that
    ship's cells are now hit, append a `HistoryEntry` (leave the three
    AI-only fields as `null` — later sessions populate them), check for a
    win (`isGameOver`), update `status` accordingly, and flip `turn` (unless
    the game just ended).
  - Must be a pure function: return a new `GameState`, do not mutate the
    input.

- `isGameOver(state: GameState): boolean` — true if either board's fleet is
  fully sunk.

## Testing expectations
Write this test-first / test-alongside, not as an afterthought — this
mirrors the classic "Battleship Kata" TDD approach and the resulting test
suite is itself part of what's being evaluated (engineering rigor, not just
a working demo). At minimum, cover:
- Ship placement never overlaps, never goes out of bounds, and always
  successfully places all 5 ships (run this many times / fuzz it — a rare
  placement failure is exactly the kind of subtle bug this exercise cares
  about).
- Firing at a cell twice is a no-op the second time (no state change, no
  turn consumed).
- Hitting all cells of a ship marks it `sunk`.
- `isGameOver` correctly detects a win the moment the last ship of a fleet
  is sunk, not before.
- Turn correctly flips after a valid shot and does NOT flip after a no-op.

## Explicit boundaries — do NOT do these
- Do not build any DOM/rendering/UI.
- Do not implement AI move selection (`chooseMove`) — a separate session
  owns that. It's fine if there's no AI-turn logic at all yet; `fireAt`
  should work symmetrically for `"player"` and `"ai"` as the `targetBoard`
  regardless of who's calling it.
- Do not implement the playtest harness or reporting module — separate
  sessions.
- Do not add any dependencies/frameworks beyond what's needed for
  testing (if you want a test runner, prefer something minimal — this
  project has no build step otherwise, keep it that way for the game code
  itself).

## Deliverable
- A PR against `main` with the engine implementation + tests, and a clear
  PR description explaining any implementation choices (per project
  convention — this feeds directly into the interview debrief narrative,
  so explain your reasoning, not just what changed).
- Confirm in the PR description that `createGame`, `fireAt`, and
  `isGameOver` match the signatures above exactly, since three other
  sessions will build against this interface without seeing your code
  directly.
