# Battleship Game — PRD

**Status:** Draft (in progress)
**Author:** [You]
**Related:** see `battleship-assignment-plan.md` for exercise context/decisions, `decision-log.md` for the full decision trail, `presentation.md` for debrief narrative.

## 1. Problem / Goal
Cognition's Battleship exercise is designed to test engineering empathy in a
non-engineering hire — not raw coding skill. The goal is to build a simple,
functioning Battleship game (with a real, working AI opponent) that (1) gives
an authentic, tellable story about the build → break → debug → fix loop for
the M1 debrief, and (2) stands out from other candidates' submissions through
deliberate, defensible differentiation — without over-scoping the build or
diluting the "simple" requirement in the prompt.

## 2. Users / Context
- **Primary audience:** the Cognition hiring panel (Sebastian, Austin,
  Patrick, and/or whoever runs the debrief) — not the general public. This is
  an evaluation artifact, not a consumer product.
- **Context of use:** most likely opened and narrated live during the ~10
  minute debrief portion of the M1 call, possibly also opened cold by a
  reviewer beforehand via the shared link. Likely desktop, likely Chrome,
  likely a short session (a few minutes, not repeat/habitual use).
- **Implication — what this means we do NOT need:** onboarding flows,
  marketing/landing copy, mobile-first responsive design, broad
  cross-browser hardening, accessibility beyond basic usability, user
  accounts, persistence across sessions, or analytics. Effort spent there
  would be effort not spent on the things actually being evaluated.
- **Secondary "user":** the automated Devin playtesting harness (Decision 7)
  — it exercises the game programmatically the same way a human would click
  through it, and is a first-class consumer of the game's logic/interfaces
  even though it's not a human.

## 3. Scope

### In scope
- Single-player Battleship: human vs. AI opponent, standard rules.
- One board size (10x10), standard 5-ship fleet (Carrier-5, Battleship-4,
  Cruiser-3, Submarine-3, Destroyer-2), no overlapping/off-board placement.
- Manual or randomized ship placement for the human player (randomized is
  acceptable as the only mode if it reduces build/debug risk — see Open
  Questions).
- AI opponent using **probability-density targeting** (Decision 5): computes
  a frequency map of valid ship placements per cell each turn, weighted
  toward cells near unresolved hits, fires at the highest-frequency cell.
- Clear win/loss state and the ability to start a new game without reloading
  the page.
- Deployed, publicly reachable link (GitHub Pages).
- An automated headless playtest harness (Decision 7) that plays many games
  programmatically and logs anomalies — this is a build deliverable, not
  just a testing tool thrown away afterward.
- Public GitHub repo containing all of the above, with a README.

### Out of scope
- Multiplayer / human-vs-human.
- Persistent accounts, saved game history, leaderboards.
- Mobile-optimized layout (should not be *broken* on mobile, but not a
  design target).
- Any live/real-time use of the Devin API inside the deployed game itself
  (Decision 6 — explicitly rejected as a poor product fit).
- Difficulty levels / multiple AI strategies (one strong AI is the target,
  not a menu of options).

## 4. Functional Requirements
1. **Board setup:** 10x10 grid for player and AI, standard 5-ship fleet,
   validated placement (no overlap, no out-of-bounds).
2. **Turn loop:** player selects a cell on the AI's board to fire; result
   (hit/miss/sunk) is displayed; AI then takes its turn on the player's
   board using probability-density targeting; repeat until one side's fleet
   is fully sunk.
3. **AI targeting algorithm:** for every unattacked cell, compute the number
   of valid remaining-ship placements that would cover that cell given the
   current board state (hits/misses/sunk ships already known); weight cells
   adjacent to unresolved hits more heavily; fire at the max-frequency cell
   (tie-break randomly among equal-max cells).
4. **Win/loss detection:** game ends immediately when either fleet is fully
   sunk; clear end-state UI with the ability to start a new game.
5. **Input handling:** clicking an already-fired-upon cell is a no-op (does
   not consume a turn or throw an error).
6. **Automated playtest harness:** a script (not requiring the browser UI)
   that can simulate full games against the AI at scale, logging any
   anomaly — illegal AI move, incorrect hit/miss/sunk detection, game not
   terminating, invalid board state — with enough detail (game seed/state)
   to reproduce the issue.
7. **Deployment:** live link served from GitHub Pages, working in a fresh/
   incognito browser session with no local setup.

## 4b. Creative / Polish Requirements
Per revised NFRs — these are hard requirements, not stretch goals, but each
must be architected as an isolated, gracefully-degrading layer (see NFRs)
so they cannot compromise core reliability. Note: at this scale (10x10
grid, plain JS) essentially nothing below risks real *performance* — the
constraint that matters is reliability/complexity, not frame rate or load
time, so "isolated and can't break the core loop" is the actual bar, not
"lightweight" for its own sake.

**Tier 1 — build first (non-negotiable, tied directly to evaluation criteria):**
1. **AI Thinking heatmap overlay:** during the AI's turn, briefly render its
   computed probability-density grid as a translucent heatmap on the board
   before it fires — makes the AI's reasoning visible, not just claimed.
2. **Battle Report generator:** after each game, generate a short narrative
   summary from the game log (shots taken, efficiency vs. a random-search
   baseline, key turning points like first contact/sinking a ship) — turns
   raw game data into a business-readable story, directly demonstrating the
   "connect technical work to business impact" skill from the M1 objective.
3. **"Explain this move":** clicking the AI's last shot shows a plain-
   language reason pulled from the heatmap data already computed for that
   turn (e.g. "Fired at C4: 3 of 4 remaining valid ship placements pass
   through this cell after the hit at C5"). Pure text render over existing
   data — the AE narrative skill made literal, near-zero build cost.
4. **Live AI confidence meter:** a %, derived from the peak value in the
   probability map already computed each turn — one extra derived number,
   no new computation.
5. **Efficiency benchmark vs. random-search baseline:** precompute the
   random-AI average shot count (~95 on a 10x10 board) once, offline, using
   the same playtest harness from Decision 7. After each game, show e.g.
   "This game: 51 shots. Random baseline: ~95. 46% more efficient." Directly
   repurposes the harness's output into a second visible payoff.

**Tier 2 — build if time allows, after Tier 1 is solid:**
6. **Replay/timelapse mode:** replays a finished game turn-by-turn in ~2
   seconds. Operates only on an already-completed, already-validated game
   log, so it cannot introduce new gameplay bugs.
7. **Shareable result card:** a generated text/emoji grid summary of the
   match (Wordle-style), copy-pastable. Pure string formatting over existing
   data.
8. **Genuine visual/theme polish:** a cohesive naval visual theme (not
   default browser styling), tasteful hit/miss/sink animation.

**Tier 3 — pure garnish, lowest priority, cut first if time-constrained:**
9. Tiny Web-Audio-synthesized sonar/hit tones (no audio files), wrapped so a
   failure/autoplay block silently no-ops.
10. Naval-themed flavor text/copy pass.
11. Full keyboard navigation / clean semantic markup — low effort, genuinely
    uncommon for a candidate to think of, signals a different kind of care.

**Explicitly deprioritized (not for this build):** full WebGL shaders,
particle systems, complex animation/audio libraries — disproportionate
effort for zero evaluation payoff, and each dependency is one more thing to
be able to explain if asked in the debrief.

## 5. Non-Functional Requirements
- **Reliability AND creative polish are both hard requirements — not a
  sequential trade-off.** (Revised: an earlier draft of this PRD deprioritized
  polish under "reliability over polish" — that was my assumption, not
  grounded in actual guidance. Direct input from Sebastian (Cognition) is
  that polish/creativity is genuinely being evaluated, not a nice-to-have.
  The bar is now: nothing is allowed to break the core game, but the build
  should show real creative/visual investment, not just functional
  correctness.)
- **Architectural implication of the above:** to hold both bars at once,
  creative/visual features must be built as **additive, isolated layers**
  that degrade gracefully and can never compromise core gameplay — e.g. a
  visual effect or heatmap overlay that fails should silently no-op, never
  crash the turn loop or block input. Core game logic stays simple and
  bulletproof; creative layers sit on top of it, not entangled with it.
- **Readability of code/history:** since the debrief may involve someone
  looking at the repo, structure and commit history should be legible enough
  for a non-trivial technical reviewer to follow, even though the primary
  audience isn't grading code quality line-by-line.
- **Performance:** AI move computation (probability-density pass over a
  10x10 grid) must resolve well under 1 second — this is cheap enough
  computationally that this should never be a real constraint, but it's
  worth stating explicitly since it's a live-demo requirement (no
  awkward pauses while presenting).
- **No backend/server required:** static site only, keeping deployment and
  failure surface minimal.

## 6. Success Criteria / Acceptance Criteria
- A reviewer can open the live link cold and complete a full game against
  the AI without encountering a broken state.
- The AI opponent visibly plays smarter than random guessing (this should be
  qualitatively obvious within a single game, not just provable in
  aggregate stats).
- The automated playtest harness has been run at meaningful scale (hundreds+
  of games) and produced at least some real findings that feed the required
  bug-fix documentation.
- The public GitHub repo is complete, public, and includes a README + bug
  doc (or link to it).
- The candidate (you) can narrate the build process, the AI algorithm, and
  at least 2-3 concrete bugs with root causes confidently, without relying
  on notes verbatim.

## 7. Open Questions
- [ ] Manual ship placement vs. randomized-only for the human player — worth
      the added UI complexity, or does randomized-only reduce risk without
      meaningfully hurting the demo? (Leaning: randomized-only for v1, add
      manual placement only if time allows — lower risk, still a complete
      game.)
- [ ] Visual theme/polish level — how much time (if any) to spend beyond
      functional UI, given "reliability over polish" in the NFRs.
- [ ] Exact scale for the automated playtest harness (hundreds vs. thousands
      of games) — balance thoroughness against build/runtime time.
