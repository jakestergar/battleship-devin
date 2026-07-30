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
- **Fire control** — a reticle tracks whichever enemy cell you're hovering,
  and firing launches a missile on a computed arc from one of your own ships
  (the un-sunk hull segment nearest the gap between the boards). A hit lands
  as flame and embers; sinking a ship gets a full explosion, shockwave, and
  board shake. A klaxon flash across the screen edges means *you* just took a
  hit, and the scan sweep over your fleet means the AI is choosing its shot.
- **Sound** — synthesized music and effects (Web Audio, no audio files) with
  a sound toggle in the header.

## Visual design
The interface uses the BATTLESTATION design system. Two accents carry all the
meaning: **phosphor** green is live/active state (radar, hover, primary
actions) and **brass** is ownership and structure (your ships, dividers).
**Klaxon** red is reserved exclusively for hit and sunk, so red never stops
meaning "alarm". Every board state is readable without relying on colour — a
miss is a dot with a ripple, a hit is a `✕`, a sunk cell is a `☠`. Three
typefaces split by role: Big Shoulders Stencil for headers, JetBrains Mono for
coordinates and data, IBM Plex Sans for body copy. The fonts load from Google
Fonts and the effects need the Web Animations API — without either, the game
falls back to system fonts and instant shots and stays fully playable.

## Project structure
```
src/
  engine.js   — pure game state & rules
  ai.js       — Bayesian Search Theory AI
  ui.js       — rendering, placement phase, heatmap, rosters, explain panel
  audio.js    — procedurally synthesized music and sound effects
  tokens.css  — BATTLESTATION palette and type tokens
  animations.css / animations.js — motion and DOM effect helpers (no rules)
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
