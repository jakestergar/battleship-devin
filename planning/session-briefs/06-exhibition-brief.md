# Devin Session Brief — AI vs AI Exhibition Match (Session 6)

Paste this entire brief as the initial prompt for a new Devin cloud session
at app.devin.ai. Runs in parallel with Sessions 5 (fairness) and 7 (coach).

**Create exactly one session from this brief.** A previous round of this
project accidentally dispatched one brief to two sessions and produced two
competing PRs (see `planning/decision-log.md` Decision 17).

---

## Context
This repo is a single-player Battleship game with a Bayesian Search Theory
AI opponent. Read `planning/technical-design.md` for the shared data
contract and `AGENTS.md` for the repo rules before writing any code.

The AI's strength is currently something the player infers. This feature
makes it something they can watch: **two instances of the AI playing each
other at speed, with both probability-density heatmaps rendered side by
side**, converging on each other's fleets.

The purpose is demonstration, not gameplay. Someone who watches this for
eight seconds should understand how the targeting algorithm works without
anyone explaining it.

Repo: https://github.com/jakestergar/battleship-devin
Branch: create your own branch off `main`, open a PR when done.
Runtime: plain ES modules in the browser. No framework, no build step, no
new dependencies.

## What to build

### 1. `src/exhibition.js` — a new, self-contained module
An exhibition mode that plays a full AI-vs-AI game using **only**
`engine.js` and `ai.js`. It must not reimplement any game rule — every shot
goes through `engine.fireAt`, exactly as the human game does.

Export:
```js
mountExhibition(rootEl) -> { start(), stop(), destroy() }
```

Behaviour:
- Both sides use `ai.chooseMove`. Both fleets are placed with
  `engine.randomFleetLayout`.
- Renders **two boards side by side**, each with its opponent's live
  probability map as a translucent heatmap overlay — so the viewer watches
  both AIs' reasoning simultaneously, not just the shots.
- Steps at a watchable pace (roughly 120-250ms per shot, tunable via one
  named constant). A full match should complete in well under 30 seconds.
- Displays a running shot count per side, and on completion announces the
  winner and each side's shot total.
- `stop()` halts cleanly mid-match; `destroy()` removes listeners and
  timers. **No timer may survive leaving the mode** — a stray `setInterval`
  running behind the real game is the most likely bug in this feature, so
  guard against it deliberately.

The probability map is available from `ai.chooseMove`, which returns
`{ cell, confidence, explanation, probabilityMap }`. Use the returned map;
do not recompute it separately. For heatmap rendering, `src/ui.js` already
exports `normalizeProbabilityMap(map, size)` — reuse it rather than writing
a second normalisation.

### 2. Entry point and integration constraint
Add a way to enter exhibition mode (e.g. a control on the launch/end
screen) and a way to leave it and return to the normal game.

**Three sessions are editing this repo in parallel.** Keep your rendering
entirely inside your own module and its own container element. You may add
**at most one import line and one call site** to `src/ui.js`, and at most
one container element to `index.html`. Do not restructure existing render
functions. Do not reuse the human game's board containers — build your own
inside your container, so the two cannot interfere.

### 3. Graceful degradation
Per `planning/battleship-prd.md` Section 5, this is an additive layer. If
exhibition mode fails to start or throws mid-match, the failure must be
contained: the control reports the mode is unavailable and the normal game
remains fully playable. Exhibition mode must never mutate the human game's
state — it owns its own `GameState` instances entirely.

### 4. Tests
Add `tests/exhibition.test.js` using the existing `node:test` setup (see
`tests/ui.test.js` for how DOM-adjacent code is tested here — keep the
testable logic separable from rendering so it can run headlessly). At
minimum:
- A full exhibition match runs to completion and terminates, with a valid
  winner and both shot counts within sane bounds (neither side should need
  more than 100 shots).
- Every shot taken during a match was legal — no cell fired at twice on the
  same board.
- Exhibition play does not mutate any `GameState` object passed in from
  outside the module.

## Explicit boundaries — do NOT do these
- Do not modify `src/engine.js` or `src/ai.js` contracts.
- Do not touch `src/fairness.js` or `src/coach.js` (other sessions own
  those files).
- Do not restructure `src/ui.js` beyond the single import and single call
  described above.
- Do not add dependencies, a build step, or any animation/game library.
- Do not add sound. Audio already exists in `src/audio.js` and is owned by
  the main game; an autoplaying exhibition match must stay silent.

## Deliverable
A PR against `main`. The description must report what actually happened
when you ran it: typical match length in shots per side, wall-clock
duration, and confirmation that no timers leak when leaving the mode.
Append an entry to `planning/decision-log.md` covering any non-obvious call
you made, with an honest assessment of its weaknesses.
