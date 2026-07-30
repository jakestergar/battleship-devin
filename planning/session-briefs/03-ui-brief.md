# Devin Session Brief — UI Module (Session 3 of 4, parallel with AI + Harness)

Paste this entire brief as the initial prompt for a new Devin cloud session
at app.devin.ai. Runs in parallel with the AI and harness sessions, AFTER
the engine module (Session 1) has landed on `main`.

---

## Context
You are building the browser UI for a simple, single-player Battleship
game. The engine (game state, rules) is already implemented on `main` —
read `src/engine.js` before writing code. The AI module (`src/ai.js`,
providing `chooseMove`) is being built in parallel by a separate session and
may or may not be merged yet when you start.

**Do not block on that.** Build and test against a local mock that matches
the AI's contract exactly (see below), and wire to the real `ai.js` via a
single, clearly-marked integration point once it's available — leave a
`// TODO(integration): swap mock for real ai.chooseMove` comment at that
exact call site so it's a one-line change later.

Repo: [INSERT PUBLIC GITHUB REPO URL]
Branch: create your own branch off `main`, open a PR when done.
Stack: plain HTML/CSS/JavaScript, no framework, no new dependencies, no
build step — this must run by opening `index.html` directly / via GitHub
Pages, nothing else.
Target files: `index.html`, `src/style.css` (or similar), `src/ui.js` (or
`src/ui/` — your call on internal layout).

## Data contract you're consuming (already defined, do not change)

```js
GameState = {
  playerBoard: Board,   // { size, ships: [Ship], shotsReceived: Set<string> }
  aiBoard: Board,
  turn: "player" | "ai",
  status: "in_progress" | "player_won" | "ai_won",
  history: [ HistoryEntry ]
}

HistoryEntry = {
  turnNumber, actor: "player"|"ai", cell: {row,col},
  result: "hit"|"miss"|"sunk", shipId: string|null,
  probabilityMapSnapshot: number[][] | null,  // AI turns only
  confidence: number | null,                  // AI turns only, 0-1
  explanation: string | null                  // AI turns only
}
```

Engine functions you call directly: `createGame()`, `fireAt(state, board, cell)`,
`isGameOver(state)`. AI function you call (real or mock): `chooseMove(state)`
returning `{ cell, confidence, explanation }`.

**Local mock for `chooseMove`** (use until the real AI module lands): pick
any unattacked cell at random on the player's board, return a plausible
`confidence` (e.g. random 0.3-0.9) and a placeholder `explanation` string.
This lets you build and demo the full UI independently.

## What to build

1. **Board rendering:** two 10x10 grids (player's board showing their own
   ships + incoming AI shots; the AI's board showing only the player's shots
   against it — never reveal AI ship positions before they're hit/sunk).
2. **Turn loop:** on a player click on an unattacked cell of the AI's board,
   call `fireAt`, re-render, then (if game not over) call `chooseMove` +
   `fireAt` for the AI's turn against the player's board, re-render again.
   Clicking an already-fired-upon cell must visibly do nothing (per engine's
   no-op behavior) — don't add your own guard that duplicates engine logic,
   just don't break when the engine returns a no-op.
3. **AI Thinking heatmap overlay:** when rendering the AI's turn, briefly
   display `probabilityMapSnapshot` from the latest AI `HistoryEntry` as a
   translucent heatmap over the player's board (higher weight = more
   intense), then let it fade or clear before/as the shot result shows.
   **Must degrade gracefully:** if `probabilityMapSnapshot` is `null`,
   malformed, or rendering throws, silently skip the overlay — never let
   this crash or block the turn loop. Wrap this rendering call in a
   try/catch.
4. **Live confidence meter:** display the AI's `confidence` value from its
   latest move (e.g. a small percentage/bar next to the AI board). Same
   graceful-degradation rule if the value is missing.
5. **"Explain this move" panel:** clicking the AI's most recent shot marker
   shows its `explanation` string in a small panel/tooltip. Same
   graceful-degradation rule.
6. **Win/loss end screen:** clear visual state when `status` is
   `"player_won"` or `"ai_won"`, with a "New Game" button that calls
   `createGame()` and resets the UI. Include a designated, empty container
   element (e.g. `<div id="battle-report"></div>` and
   `<div id="efficiency-stat"></div>`) that a later integration step will
   populate — you don't need to generate this content, just leave clearly
   labeled hooks/render functions (e.g. `renderBattleReport(text)`,
   `renderEfficiencyStat(text)`) that accept a string and insert it.
7. **Naval visual theme:** clean, cohesive styling (not default browser
   form elements) — this is a real requirement, not optional polish (see
   PRD NFRs — polish is explicitly evaluated, not secondary to reliability).
   Keep it CSS-based; no canvas/WebGL/animation libraries needed for this.

## Explicit boundaries — do NOT do these
- Do not modify `src/engine.js`'s contract.
- Do not implement the actual `computeProbabilityMap`/`chooseMove` logic —
  use the mock described above until the real module is available.
- Do not implement the Battle Report or efficiency-benchmark *generation*
  logic — just the rendering hooks described in step 6. Generation happens
  in the integration pass.
- Do not add a build step, bundler, or framework dependency.
- Do not build mobile-first responsive design — should not be broken on
  mobile, but it's not the design target (desktop/live-demo context).

## Testing expectations
- Manually verify a full game can be played start to finish with the mock
  AI, including a win and a loss path.
- Verify clicking an already-fired-upon cell does nothing visible and
  doesn't consume a turn.
- Verify the heatmap/confidence/explain features never break the game even
  when fed missing/malformed data (test this deliberately — e.g. temporarily
  force `probabilityMapSnapshot` to `undefined` and confirm no crash).

## Deliverable
- A PR against `main` with the full UI, using the mock AI.
- PR description noting the exact integration point (file + line) where the
  mock should be swapped for the real `ai.chooseMove` once that PR lands.
