# Battleship — Bayesian Search Theory AI

A simple, single-player Battleship game (built primarily with Devin) with an
AI opponent that uses **Bayesian Search Theory / probability-density
targeting** rather than basic hunt-and-target logic — it computes, every
turn, how many valid remaining ship placements pass through each cell
(weighted heavily toward cells near unresolved hits) and fires at the
highest-probability cell.

**[Play it live](#)** _(link added once deployed to GitHub Pages)_

## Why this exists
This is a Cognition interview exercise (Account Director, Enterprise). The
full planning process — PRD, technical design, and a complete decision log
(including rejected ideas and self-corrections) — is in [`planning/`](./planning),
including the bug-fix write-up once complete.

## What makes the AI interesting
- **Bayesian Search Theory targeting** — not a claim, it's visible: toggle
  the "AI Thinking" heatmap to see its live probability calculation before
  it fires.
- **"Explain this move"** — click the AI's last shot for a plain-language
  reason, generated from the same data driving the heatmap.
- **Efficiency benchmark** — every game reports actual shots taken vs. an
  empirically measured random-search baseline (computed via an automated
  playtest harness run at scale — see `scripts/harness.js`).
- **Battle Report** — a generated post-game narrative summary.

## Playing it
- **Deploy your own fleet** — place each ship yourself on the strategy
  panel (click to drop the bow, `R` to rotate, click a deployed ship to pick
  it back up), or hit Randomize.
- **Fleet rosters** — per-ship hull strips show which of your ships are
  still afloat and how badly each is damaged; the enemy roster fills in as
  you sink them.
- **Firing feedback** — targeting reticle, splash on a miss, explosion and
  board shake on a hit, plus synthesized music and sound effects (Web Audio,
  no audio files) with a sound toggle in the header.

## Project structure
```
src/
  engine.js   — pure game state & rules
  ai.js       — Bayesian Search Theory AI
  ui.js       — rendering, placement phase, heatmap, rosters, explain panel
  audio.js    — procedurally synthesized music and sound effects
scripts/
  harness.js  — automated playtesting at scale (bug-hunting + baseline stats)
planning/     — PRD, technical design, decision log, session briefs
```

## Running locally
No build step — open `index.html` directly, or serve the repo root with any
static file server.

## Running the playtest harness
```
node scripts/harness.js
```
