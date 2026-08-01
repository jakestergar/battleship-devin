# Battleship — Technical Design

Defines the shared data contract between modules so the engine, AI, UI, and
playtest harness can be built independently (including as separate parallel
Devin sessions) without stepping on each other. Written before any parallel
work starts, per the sequencing decision: **engine lands first, alone; AI,
UI, and harness are parallelized only after the engine's contract is fixed.**

## Module boundaries

| Module | Owns | Does NOT own |
|---|---|---|
| **engine** | Game state, rules, turn validation, win detection | Rendering, AI decision-making |
| **ai** | Probability-density targeting, move selection, move explanations | Game state mutation (calls engine, doesn't bypass it) |
| **ui** | Rendering the board/heatmap/confidence meter/explain-panel, click handling | Game rules — always goes through engine functions, never reimplements them |
| **harness** | Headless simulation at scale, anomaly logging, baseline stats | Rendering, browser dependency of any kind |
| **reporting** | Battle Report generation from a finished game's history | Game rules, AI internals (reads history log only) |

All modules communicate through the shared data shapes below — no module
reaches into another's internals.

## Core data shapes

```js
// A single ship on a board
Ship = {
  id: string,          // e.g. "carrier"
  length: number,       // 5, 4, 3, 3, or 2
  cells: [ {row, col} ],// occupied cells
  hits: Set<"row,col">, // cells of this ship that have been hit
  sunk: boolean
}

// One player's board (used for both the human's board and the AI's board)
Board = {
  size: number,          // 10
  ships: [ Ship ],
  shotsReceived: Set<"row,col">  // every cell that's been fired at on this board
}

// Full game state — the single source of truth, passed into every engine
// function and read by ui/ai/harness
GameState = {
  playerBoard: Board,
  aiBoard: Board,
  turn: "player" | "ai",
  status: "in_progress" | "player_won" | "ai_won",
  history: [ HistoryEntry ]
}

// One logged turn — this is what the heatmap, "explain this move," and the
// Battle Report generator all read from
HistoryEntry = {
  turnNumber: number,
  actor: "player" | "ai",
  cell: {row, col},
  result: "hit" | "miss" | "sunk",
  shipId: string | null,        // set if result is "hit" or "sunk"
  // AI-only fields, omitted for player turns:
  probabilityMapSnapshot: number[][] | null,  // the full weight grid at decision time
  confidence: number | null,                  // 0-1, normalized peak weight
  explanation: string | null                  // human-readable reasoning, generated at decision time
}
```

## Grounding in established practice (not invented from scratch)
Before finalizing the contracts below, checked prior art to validate (not
copy) the design:
- **Immutable, pure-function domain model** (engine has no hidden state,
  every function takes state in and returns new state) is the standard
  pattern for the well-known "Battleship Kata" used in TDD teaching
  (e.g. `rstraub/battleship-kata-scala`, `tansaku/battleships_mvp_sequence`)
  — confirms this architecture choice is an established best practice, not
  just a preference.
- **Non-overlapping ship placement algorithm** (used in `createGame`):
  process ships **largest-first** (reduces dead-ends), for each ship
  enumerate every legal placement (both orientations, respecting bounds and
  already-occupied cells), pick one at random, and **backtrack/restart** the
  whole placement if any ship has zero legal placements remaining. This is
  the standard, well-documented approach (see Stack Overflow: "Avoiding
  dead-ends in Battleships random placement algorithm") — more robust than
  naive trial-and-error placement, which can dead-end on the last small ship.
- **Probability-density targeting has a formal name: Bayesian Search
  Theory.** Multiple independent public implementations exist
  (`envoy1084/battleship-ai`, `kuang/battleshipAI`, `wolever/probabilistic-
  battleship`, all citing the same DataGenetics analysis), confirming this
  is a real, established technique — not just "smarter than random." **Use
  "Bayesian Search Theory" as the correct technical term in the debrief and
  in the "explain this move" copy** — it's more precise and more impressive
  than "probability-density," and it's accurate.

## Function contracts

**engine module**
- `createGame(playerFleetLayout?): GameState` — new game, both boards
  populated. The AI board is always randomly placed; the player's board is
  too unless a layout is supplied by the manual placement UI. An invalid
  layout throws rather than silently corrupting the board.
- `randomFleetLayout(size?): [{ id, length, cells }]` — a legal random
  layout in the shape `createGame` accepts (seeds/re-rolls manual placement).
- `validateFleetLayout(layout, size?): { valid, error }` — exactly the FLEET
  ships, each a straight contiguous in-bounds run of its own length, no
  overlaps. Returns a reason instead of throwing so the placement UI can
  show it.
- `cellsForPlacement(row, col, length, orientation): [cell]` — the cells a
  ship would occupy from a bow position (shared with the placement preview).
- `fireAt(state: GameState, board: "player" | "ai", cell): { newState, result }`
  — validates the shot (no-op + unchanged state if already fired upon per
  Functional Requirement 5), applies it, updates history, checks win
  condition, flips turn. Repeating a shot is a legal game event and stays a
  no-op; an unknown target board, a cell that is not an in-bounds integer
  pair, or a shot after `status` has left `"in_progress"` are caller bugs and
  **throw**, since resolving them into a plausible-looking shot would corrupt
  the board and every statistic derived from it.
- `isGameOver(state): boolean`

**ai module**
- `computeProbabilityMap(state: GameState): number[][]` — pure function,
  size x size grid of weights for the player's board (what the AI is
  targeting). No side effects, no state mutation — this is exactly what the
  heatmap overlay renders directly.
- `chooseMove(state: GameState): { cell, confidence, explanation }` — calls
  `computeProbabilityMap` internally, selects the max-weight cell
  (tie-break random), returns the cell plus the two Tier-1 creative fields
  (`confidence`, `explanation`) so `engine.fireAt` can attach them to the
  `HistoryEntry` in one pass.

**ui module**
- Renders `GameState.playerBoard` / `GameState.aiBoard` from data only —
  never computes hit/miss/win logic itself.
- Owns a **placement phase** that precedes the game: the layout under
  construction lives only in the UI, and the engine is handed the finished
  layout via `createGame(layout)`. `GameState.status` therefore has no
  "placing" value — there is no game until the fleet is confirmed.
- Fleet rosters read ship `hits`/`sunk` straight off each board. The enemy
  roster reveals hull damage only once a ship is `sunk`, matching what the
  player is actually told.
- Firing animations and audio (`src/audio.js`, Web Audio synthesis — no
  binary assets) are additive layers: every entry point is guarded so a
  failure degrades to a silent, unanimated but fully playable game.
- Visual language comes from the BATTLESTATION design system, split into
  `src/tokens.css` (palette + type scale), `src/animations.css` (motion),
  and `src/animations.js` (DOM effect helpers). `animations.js` holds no
  game state and no rules — it only positions, spawns, and cleans up
  decorative nodes, so the UI can call it freely or not at all.
- Vessels are drawn by `src/ships.js`: `shipSvg(id, length) -> string`, one
  SVG per ship class authored bow-right in a `length * 100` by `100` viewBox.
  It is pure markup generation — no DOM, no state, no rules — and returns `""`
  for an unknown id so a fleet change can't break rendering. The UI draws
  those on a `.fleet-art` overlay that is a *sibling* of the board, never a
  child: the board's children are indexed positionally as its cells. Ship
  boxes are measured off the live cell elements, and a vertically placed ship
  reuses the bow-right drawing rotated a quarter turn. The overlay sits above
  the cells but below the hit/sunk marks, so damage still reads on top of a
  hull; if any of it fails, the cell states alone still convey the board.
  Enemy vessels are drawn only once `sunk` — never before.
- On player click: resolves the shot through `engine.fireAt` first, then
  flies the missile, and only commits `state` + re-renders once the missile
  lands. The shot's outcome is therefore decided by the engine, never by
  animation timing; if the Web Animations API or the layout measurement is
  unavailable, `flyMissile` resolves immediately and the turn proceeds. Then
  (if the game isn't over) `ai.chooseMove` + `engine.fireAt` for the AI's
  turn, then re-renders.
- A shot launches from a real hull segment: the player's un-sunk ship cell
  closest to the gap between the two boards. The AI's incoming shot launches
  from the enemy board's edge on the target's row — deliberately *not* from
  an enemy ship, since that would leak the hidden layout.
- Renders the heatmap overlay directly from the latest `HistoryEntry`'s
  `probabilityMapSnapshot` — if it's `null` or malformed, the overlay
  silently doesn't render (graceful degradation per NFRs); it never blocks
  the turn loop.
- "Explain this move" panel reads `HistoryEntry.explanation` directly — no
  recomputation.

**harness module**
- `simulateGame(): GameState` — runs a full game via `engine` + `ai` only,
  no DOM/browser dependency.
- `runBatch(n: number): { results, anomalies, avgShotsToWin }` — runs `n`
  simulated games, validates invariants after every move (board state
  consistency, no illegal moves, game terminates), and collects any
  violation as a reproducible anomaly (includes a seed/full history so it
  can be replayed).
- Output feeds two things: (1) the required bug-fix documentation, and
  (2) the precomputed random-baseline average used by the Tier-1 efficiency
  benchmark (run once with a random-move AI variant for comparison).

**errors module**
- `reportError(scope, error)` / `attempt(scope, fn, fallback?)` — the single
  place a contained failure is recorded. The additive layers (audio,
  animation, heatmap, fleet art) still degrade rather than propagate per the
  NFRs, but they route through here so the failure is visible in the console
  with the scope that produced it instead of vanishing into an empty catch.
  The engine, the AI, and the turn loop deliberately do **not** contain their
  failures this way: those propagate, and the UI surfaces them on the status
  line.

**reporting module**
- `generateBattleReport(state: GameState, baselineAvgShots: number): string`
  — reads only `GameState.history` (already-resolved data) and the
  precomputed baseline; produces the narrative summary. No dependency on
  `ai` or `engine` internals beyond the history log.

## Build sequencing (ties back to `battleship-assignment-plan.md`)

1. **Engine alone, first.** Nothing else starts until `createGame`,
   `fireAt`, `isGameOver`, and the `GameState`/`HistoryEntry` shapes above
   are implemented and passing basic sanity checks.
2. **Parallel fan-out** (separate Devin cloud sessions, each given only this
   design doc + their relevant PRD sections as their brief):
   - Session A: `ai` module (probability-density targeting + explanation
     generation)
   - Session B: `ui` module (rendering, heatmap overlay, confidence meter,
     explain panel) — can be stubbed against a mock `GameState` until the
     engine PR lands, then wired to the real one
   - Session C: `harness` module (automated playtesting at scale)
3. **Integration session**: merges A/B/C against the real engine, resolves
   any drift from the contract above, runs the harness at scale, and
   produces the real bug list for the write-up. `reporting` module is small
   enough to build during integration rather than as its own parallel track.

## Open technical questions
- [ ] Exact tie-break method for equal-max probability cells (uniform random
      is the default assumption above — resolved as such in the AI brief).
- [x] **Resolved:** the random-baseline comparison function lives directly
      in the harness module (`randomChooseMove`), not as a flag on `ai.js` —
      keeps the AI module's contract clean and avoids conflating a real
      feature with a test-only comparison baseline. See
      `session-briefs/04-harness-brief.md`.
