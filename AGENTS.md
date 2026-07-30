# AGENTS.md — Battleship (Bayesian Search Theory AI)

This repo is a Cognition interview exercise: a simple, single-player
Battleship game with a genuinely smart AI opponent, built primarily through
Devin. Full planning history — PRD, technical design, and a complete
decision log (including rejected ideas and self-corrections) — lives in
`planning/`. Read `planning/technical-design.md` before touching any code;
it defines the shared data contract every module depends on.

## Architecture
- `src/engine.js` — pure, immutable game state and rules. No DOM, no AI
  logic, no rendering.
- `src/ai.js` — Bayesian Search Theory targeting (`computeProbabilityMap`,
  `chooseMove`). Must only use publicly fair information (see
  `planning/session-briefs/02-ai-brief.md` — no reading unsunk ships'
  real positions).
- `src/ui.js` + `index.html` + `src/style.css` — rendering only. Never
  reimplements game rules; always goes through `engine.js`.
- `scripts/harness.js` — headless Node script for automated playtesting at
  scale and computing the random-search efficiency baseline. Not part of
  the deployed game.

## Rules
- No framework, no build step, no backend — plain HTML/CSS/JS, deployed via
  GitHub Pages.
- Creative/visual features (heatmap overlay, confidence meter, explain-this-
  move panel) must degrade gracefully — a failure in any of them must never
  break core gameplay. See `planning/battleship-prd.md` Section 5 (NFRs).
- Do not modify another module's contract without updating
  `planning/technical-design.md` and flagging it clearly in the PR.
- Log meaningful decisions in `planning/decision-log.md` as they're made,
  including the reasoning and an honest assessment (good/risky/bad), not
  just the outcome.
