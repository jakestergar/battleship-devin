# Decision Log — Battleship Exercise

Every meaningful decision made during planning/execution, logged as it
happens. Format: **Decision → Rationale → Assessment (my qualification) →
Outcome** (filled in once known).

---

### 1. Use Devin as the primary build tool (not Windsurf/manual coding)
- **Rationale:** User has little coding background; a first-hand Devin build
  story is directly useful material for the real M1 demo/pitch.
- **Assessment: Good decision.** Directly serves both the assignment's real
  goal (engineering empathy via Devin) and gives authentic material for the
  actual sales pitch later.
- **Outcome:** Pending.

### 2. Stack: plain HTML/CSS/JS, no framework
- **Rationale:** No coding background — simplest to read/explain, zero build
  tooling to debug.
- **Assessment: Good decision** for this context. Would flag as suboptimal if
  the goal were to showcase modern engineering practices to a technical
  panel, but that's not the eval criteria here — engineering empathy and
  storytelling are.
- **Outcome:** Pending.

### 3. Hosting: GitHub Pages (not Vercel/Netlify)
- **Rationale:** A public GitHub repo is already required; hosting from it
  directly avoids a second platform.
- **Assessment: Good decision.** Simpler, one less thing to break or explain.
- **Outcome:** Pending.

### 4. Search the web/GitHub for existing public Battleship implementations
- **Rationale:** Check whether reference implementations could de-risk the
  build or simplify decisions (e.g. AI algorithm design), before committing
  to a from-scratch approach.
- **Assessment: Good decision to search — but qualify how the results get
  used (see Decision 5 below).** Research before building is a real
  engineering habit, not a shortcut; searching itself is not the risky part.
- **Outcome:** Found several public repos (GEOFARL/battleship,
  Datrinon/battleships, ArqamWaheed/battleship, jernestmyers/battleship,
  Daze-bot/battleship, madany01/battleship, frarosset/battleship,
  jayaganeshk/battleship) plus a DEV.to writeup on hunt-and-target AI, and a
  DataGenetics analysis of a more advanced **probability-density targeting**
  algorithm. Notably, several of these are explicitly **The Odin Project**
  curriculum solutions — meaning near-identical Battleship clones are common
  and searchable.

### 5. How to use the research findings: reference for algorithm design only, not code reuse
- **Rationale:** Weigh "de-risk the build" against "stand out" and "push
  boundaries" priorities.
- **Assessment: Directly copying/adapting code from these repos would be a
  BAD decision.** Reasons:
  1. Undermines the "stand out" and "creativity" goals — several of these are
     literally bootcamp-curriculum solutions; a near-duplicate is the
     opposite of standing out, and is a plausible pattern-match risk if an
     evaluator has seen similar submissions before.
  2. Borderline conflict with the assignment's spirit (even though the
     literal rule only bans *another person* writing/editing code) — the
     point is to demonstrate your own build process with Devin, not port
     someone else's finished implementation.
  3. Doesn't showcase Devin's actual capability, which is priority #3 of this
     exercise.

  **Using the research as conceptual input to our own spec is a GOOD
  decision** — specifically, using the **probability-density targeting**
  algorithm (computing a per-cell frequency map of possible ship placements,
  weighting cells near existing hits) as the AI opponent's design basis is a
  stronger, more technically sophisticated differentiator than the
  hunt-and-target approach that's already common in nearly every public
  example. This becomes a PRD/technical-design input, not a code source —
  Devin implements it fresh, from our own spec, for this repo.
- **Outcome:** Decision made; carried into PRD's AI opponent requirement.
  Devin will be instructed to build the probability-density approach
  from a written description of the algorithm, not from any specific repo.

### 6. Explored: have a live Devin agent be the actual in-game AI opponent (via API, per-move)
- **Rationale:** Pushed on "what's the most boundary-pushing use of Devin
  possible" — considered wiring the deployed game to call a live Devin
  session for each AI move, rather than static game logic.
- **Assessment: BAD decision — rejected.** Technically possible via Devin's
  session API, but wrong tool for the job: (1) latency mismatch — Devin
  sessions are full agentic sessions built for multi-minute engineering
  tasks, not sub-second game decisions; (2) cost mismatch — burns real
  compute for what's functionally one decision; (3) product-fit mismatch —
  Devin is an autonomous software engineer, not a low-latency inference
  engine. Forcing this in would look like a misunderstanding of the product,
  not a strength.
- **Outcome:** Rejected. Replaced with approaches that play to Devin's real
  strengths instead (see Decision 7).

### 7. Chosen alternative: Devin as autonomous playtesting/QA agent at scale
- **Rationale:** Wanted the strongest available "wow" moment that's also
  technically legitimate and produces a required deliverable (the bug-fix
  writeup).
- **Assessment: Good decision — headline differentiator.** Have a Devin
  session write and run a script that plays hundreds/thousands of automated
  games against the AI opponent, headless, logging anomalies (crashes,
  invalid states, illegal moves, win-condition failures). This is squarely
  within Devin's actual capability (write code, run it, interpret results,
  iterate) and directly produces substantive material for the required bug
  documentation, rather than relying on a handful of manual playtest quirks.
- **Outcome:** Pending — to be executed as one of the parallel Devin
  workstreams. Documented in `presentation.md` as the headline debrief story.

### 8. Correction: "reliability over polish" was my unfounded assumption — polish is a real, evaluated requirement
- **Rationale:** I had set an NFR deprioritizing visual/creative polish based
  on my own inference about the evaluation context, not on actual guidance.
  User corrected this: Sebastian (Cognition contact) directly indicated that
  polish/creativity is genuinely being evaluated.
- **Assessment: My original assumption was a mistake, not a defensible
  scoping call — flagging it as such rather than quietly revising it.**
  Reliability is still non-negotiable (a broken game undermines everything),
  but it is not a justification for deprioritizing polish; they are both
  hard requirements to be held simultaneously via architecture (isolated,
  gracefully-degrading creative layers), not by trading one off the other.
- **Outcome:** PRD Section 5 (NFRs) revised; new Section 4b (Creative/Polish
  Requirements) added, formalizing the AI Thinking heatmap, Battle Report
  generator, and genuine visual/theme polish as required — not stretch —
  work, prioritized in that order.

### 9. Creative differentiation: "AI Thinking" heatmap + auto-generated "Battle Report" over decorative effects (shaders/particles/sound)
- **Rationale:** Explored where real creative differentiation should come
  from — decorative effects (WebGL shaders, particle explosions, sound
  design) vs. making the AI's actual reasoning/output visible and legible.
- **Assessment: Good decision.** The heatmap and battle report are both (a)
  low-risk (read-only rendering/summary layers on top of data the engine
  already produces, can't break core gameplay), and (b) directly aligned
  with what's being evaluated — the heatmap makes the probability-density AI
  claim demonstrable, the battle report is a literal instance of "connect
  technical work to business impact" from the M1 objective list. Full
  WebGL/shader work was considered and explicitly deprioritized: high
  effort/bug-risk relative to payoff, and doesn't map to any evaluation
  criterion — reconsidered only as later time-permitting polish, not a
  headline differentiator.
- **Outcome:** Formalized in PRD Section 4b, prioritized above general
  visual theme polish.

### 10. Expanded creative differentiation into a tiered feature set
- **Rationale:** Pushed further on "how can this stand out without
  jeopardizing performance" — reframed "performance" correctly: at this
  scale (10x10 grid, plain JS) real performance risk is near-zero regardless
  of feature choice; the actual constraint is reliability/complexity, which
  the isolated-layer architecture (NFRs) already handles.
- **Assessment: Good decision.** Locked in a tiered list, prioritized by
  alignment to evaluation criteria and build cost, not by visual flashiness:
  Tier 1 (non-negotiable) — AI Thinking heatmap, Battle Report generator,
  "Explain this move," live AI confidence meter, efficiency-vs-random-
  baseline benchmark. Tier 2 (time-permitting) — replay/timelapse mode,
  shareable result card, naval visual theme. Tier 3 (garnish, cut first) —
  synthesized audio cues, flavor text, accessibility polish. Full WebGL/
  particle/audio-library work remains explicitly out — disproportionate
  effort for zero evaluation payoff.
- **Outcome:** Formalized in PRD Section 4b with explicit tiers.

### 11. Researched engine/AI best practices before writing the technical design
- **Rationale:** Before locking the engine's data contract and algorithms,
  checked prior art for the ship-placement algorithm and validated the
  AI-targeting approach against established technique, same "reference not
  reuse" principle as Decisions 4/5.
- **Assessment: Good decision.** Found: (1) the "Battleship Kata" TDD
  pattern validates the immutable/pure-function engine architecture as an
  established best practice; (2) a well-documented largest-ships-first,
  enumerate-and-backtrack algorithm for non-overlapping ship placement,
  more robust than naive trial-and-error; (3) multiple independent public
  implementations of the same targeting approach we chose, confirming it's
  a real technique with a formal name — **Bayesian Search Theory** — which
  is more precise and more credible to use in the debrief than the informal
  "probability-density" framing.
- **Outcome:** `technical-design.md` updated with the grounded algorithm and
  terminology. `presentation.md` and future copy should use "Bayesian
  Search Theory" as the primary technical term.

### 12. All four session briefs written (engine, AI, UI, harness)
- **Rationale:** Needed self-contained, written briefs for each parallel
  cloud session per `technical-design.md`'s sequencing plan, since parallel
  sessions won't share this conversation's context.
- **Assessment: Good decision to write these fully before starting any
  cloud session** — each brief locks the shared data contract, states
  explicit boundaries (what NOT to build) to prevent scope collision between
  sessions, includes graceful-degradation requirements so the creative/UI
  features can never break core reliability, and specifies real testing
  expectations rather than leaving verification to chance. Also resolved
  the one open technical question (random-baseline lives in the harness,
  not `ai.js`).
- **Outcome:** `session-briefs/01-engine-brief.md` through
  `04-harness-brief.md` complete. Ready to execute: engine session first
  and alone, then AI/UI/harness in parallel once it lands. Each brief still
  needs `[INSERT PUBLIC GITHUB REPO URL]` filled in once the repo exists.

### 13. Created the actual public GitHub repo and built the engine module directly
- **Rationale:** User clarified the expectation directly: build this, don't
  just plan it. Created the real repo (`gh` was already authenticated as
  `jakestergar`) with the planning docs committed into `planning/`, filled
  in the repo URL across all four session briefs, then implemented and
  merged the engine module (Session 1) myself in this CLI session rather
  than only handing it off as a brief.
- **Assessment: Good decision, with one accuracy note.** Building the
  engine directly in this CLI session is real, working code — not a
  simulation — but it is *this* session doing the work, not a cloud Devin
  session. The AI/UI/harness briefs are still written for genuine parallel
  cloud sessions (per Decision 7's product-fit reasoning), and that
  distinction should stay accurate in the debrief narrative: engine was
  built directly, AI/UI/harness are where the parallel-cloud-session story
  actually applies.
- **Outcome:** Repo live at https://github.com/jakestergar/battleship-devin.
  `engine` PR (#1) opened, reviewed against its own brief's acceptance
  criteria, and merged to `main` — 6/6 tests passing (fleet placement
  fuzzed over 200 games, no-op behavior, sunk detection, isGameOver/status
  agreement, purity). AI/UI/harness sessions are now unblocked.

### 14. AI module built with a single weighting pass instead of a hunt/target mode
- **Rationale:** `02-ai-brief.md` specifies the boost for placements covering
  unresolved hits as part of the same enumeration pass rather than a separate
  "target mode." Implemented it that way: every valid remaining-ship
  placement contributes `100^N` (N = unresolved-hit cells it covers) to each
  cell it passes through, so a placement that explains a known hit outweighs
  every placement that doesn't, and the AI switches from hunting to finishing
  a ship off with no mode flag, no state, and no extra branch to get wrong.
- **Also decided:** the "no cheating" constraint is enforced structurally,
  not by convention. All AI input goes through one `gatherFairKnowledge`
  helper that reads only `playerBoard.shotsReceived`, `state.history`
  (filtered to the AI's own shots), and the `cells` of ships whose `sunk`
  result appears in that history. A test proves it: relocating every unsunk
  ship in a fixture leaves `computeProbabilityMap`'s output byte-identical.
  Note the AI deliberately does not read `ship.sunk` either — it derives
  which ships are sunk from history, which is strictly public information.
- **Assessment: Good decision.** Cost: three enumeration passes per move
  (map, stats for the explanation, knowledge) instead of one. That's ~300
  placements on a 10x10 board, so it's irrelevant in practice, and keeping
  `computeProbabilityMap` a pure function the UI can call independently is
  worth more than the cycles. Honest risk: the `100^N` factor is a magic
  number — it works because the board is small, and it would need revisiting
  (e.g. log-space weights) for a much larger board.
- **Outcome:** `src/ai.js` with `computeProbabilityMap` + `chooseMove`, 11
  new tests. Measured over 200 self-played games: **43.9 average shots to
  clear the board** (worst case 68 of 100 cells). The harness session will
  produce the official random baseline, but a uniform-random searcher needs
  ~95 shots, so this is roughly a 54% improvement — real, measured, and
  reportable in the debrief rather than asserted.

### 15. UI attaches the AI's decision metadata to the engine's HistoryEntry
- **Rationale:** `technical-design.md` says `engine.fireAt` attaches
  `probabilityMapSnapshot`/`confidence`/`explanation` to the `HistoryEntry`,
  but the shipped engine (correctly) knows nothing about the AI module and
  logs those three fields as `null`. Rather than widen `fireAt`'s signature
  (the UI brief forbids changing the engine's contract) the UI writes those
  fields onto the just-logged AI turn immediately after calling `fireAt`, so
  the heatmap/confidence/explain layers still read them out of `history`
  exactly as the contract specifies.
- **Assessment: Good decision, with a small risk to resolve at integration.**
  It keeps the engine pure and the contract's *shape* intact, and it's one
  small function (`annotateAiMove`) wrapped in try/catch so a failure can't
  stop a turn. The risk: the write happens after the engine's clone, so it
  mutates the new state's newest entry — safe today (only the UI holds that
  state) but the integration pass should decide the permanent home for this
  (either a `fireAt` metadata argument or an explicit engine helper).
- **Related gap:** `ai.chooseMove` returns `{cell, confidence, explanation}` —
  no probability grid — so nothing in the current contract actually supplies
  `probabilityMapSnapshot` for the heatmap. The UI reads an optional
  `probabilityMap` off the `chooseMove` result (the mock provides one); at
  integration, `ai.js` should either include it or expose
  `computeProbabilityMap` for the UI to call at the single integration point.
- **Outcome:** `index.html`, `src/ui.js`, `src/style.css` built against the
  mock AI, with one marked integration point
  (`// TODO(integration): swap mock for real ai.chooseMove`). Confirmed
  against the now-merged `src/ai.js`: `chooseMove` returns only
  `{cell, confidence, explanation}`, but `computeProbabilityMap` is exported,
  so the integration pass can call it at that same call site for the heatmap.

### 16. Integration: extended `ai.chooseMove` to return `probabilityMap`, wired UI to the real AI
- **Rationale:** Decision 15 flagged the real gap the UI session found — no
  module actually supplied `HistoryEntry.probabilityMapSnapshot`. Since
  `chooseMove` already computed the grid internally, added it to the
  return value (`probabilityMap`) as a backward-compatible extension
  rather than changing the engine's contract.
- **Assessment: Good decision.** Small, additive, and unblocks the
  heatmap/confidence/explain layers immediately instead of waiting for a
  dedicated integration session. Updated `tests/ai.test.js`'s exact-shape
  assertion to include the new field and added a sanity check that the
  chosen cell holds the map's peak weight.
- **Outcome:** `src/ui.js`'s marked TODO (`takeAiTurn`) now calls the real
  `ai.chooseMove` instead of the mock. 20/20 tests passing after the change.
  Verified manually in a live browser preview.

### 17. Duplicate AI session discovered and closed (PR #2 vs. #3)
- **Rationale:** The `02-ai-brief.md` prompt was apparently sent to two
  separate cloud sessions, producing two independent implementations (PR #2
  and PR #3). Only #3 was reported and reviewed at the time; #2 surfaced
  later, already `CONFLICTING` against `main` since #3 had been merged and
  further extended (Decision 16) in the meantime.
- **Assessment: Not a bad decision, just a process gap — worth guarding
  against for the harness session.** Closed #2 without merging: no
  functional gap it covered that #3 didn't (same algorithm class, ~44 shots
  either way), and merging it would have overwritten already-verified,
  already-integrated work for no benefit. Before dispatching the harness
  brief, confirm only one session is created per brief.
- **Outcome:** PR #2 closed with an explanatory comment, branch deleted.
  `main` is unaffected — still the #3 + Decision 16 implementation.

### 18. Manual fleet placement, fleet rosters, firing animations, synthesized audio
- **Rationale:** Playtest feedback (with reference screenshots of the classic
  HTML5 Battleship) flagged four gaps against the PRD's "feels like a real
  game" bar: the player couldn't choose where their ships go, there was no
  readable view of which of their ships were still afloat, no feedback when
  a target was selected, and no sound. Kept the fixes in their own layers:
  the placement layout lives only in `src/ui.js` and is handed to the engine
  as `createGame(layout)`, so `GameState` gains no "placing" status and the
  engine stays a pure rules module.
- **Assessment: Good decision, with one deliberate trade-off.** Music and
  effects are synthesized with the Web Audio API rather than shipped as
  audio files — it keeps the repo asset-free and GitHub Pages-friendly and
  avoids licensing questions, at the cost of an ambient drone rather than a
  scored soundtrack. Every audio and animation entry point is guarded, so a
  browser without Web Audio (or with autoplay blocked) still plays a fully
  functional, silent game. Manual placement is click-to-place plus rotate /
  randomize / clear rather than drag-and-drop: fewer failure modes on touch
  and with the keyboard, and it matches the reference panel's controls.
- **Outcome:** New `src/audio.js`; engine gained `randomFleetLayout`,
  `validateFleetLayout`, and the optional `createGame(layout)` argument;
  `src/ui.js` gained the placement phase, per-ship hull rosters for both
  fleets, and reticle/splash/explosion animations. 25/25 tests passing,
  verified end-to-end in a live browser preview.

---

*(New decisions get appended below as they're made.)*

### 16. Frame boards with shared coordinate axes and hull-shaped segments

The UI now wraps each board in a shared `.board-frame` rather than adding
coordinate labels into the board's 100-cell grid. This keeps labels aligned
with the existing cell and gap dimensions, while framing the player
`.board-stack` preserves the heatmap's absolute overlay relationship. Ship
segments use directional classes from the existing UI helper, with CSS-only
metallic/deployment hull treatments so hidden enemy ships remain untouched.

**Assessment: Good decision.** The labels are structural siblings of each
board, so the grid's cell indexing and event handling remain unchanged. The
only visual risk is narrow-screen overflow, which matches the existing fixed
cell sizing and can be addressed separately if responsive behavior is needed.

### 17. Adopt the BATTLESTATION design system for the whole visual layer

Replaced the improvised blue/teal palette with the supplied BATTLESTATION
system: `src/tokens.css` for the abyss/hull/phosphor/brass/klaxon palette and
the three type roles (Big Shoulders Stencil headers, JetBrains Mono for
coordinates and data, IBM Plex Sans for body copy), `src/animations.css` for
motion, and `src/animations.js` for the effect helpers. The system's two-accent
rule is the reason it works: **phosphor** means live/active (radar, hover,
primary actions), **brass** means ownership and structure (your ships,
dividers), and **klaxon** is reserved *exclusively* for hit and sunk, so red
never stops meaning "alarm". Every board state is legible without colour —
miss is a dot with a ripple, hit is a `✕`, sunk is a `☠`.

The supplied package's `SPEC.md` lists `tokens.css`, `tokens.json`, and
`animations.css` as included files, but the archive only contained `SPEC.md`,
`animations.js`, and `reference.html`. The token values and keyframes were
extracted from the inline styles in `reference.html` rather than invented, so
the vendored files match the reference exactly.

The fire-control chain is the one place this touched turn flow. A shot now
resolves through `engine.fireAt` *before* the missile flies, but the resulting
state is only committed once the missile lands. That ordering matters: the
engine still decides the outcome, animation timing can't change it, and a
browser without `Element.animate()` gets an instant shot instead of a stalled
turn (`launchMissile` invokes its arrival callback immediately, and
`flyMissile` additionally guards with a timeout backstop).

**Assessment: Good decision, one deliberate deviation.** Per SPEC, a shot
originates from a real hull segment on your own board — the un-sunk ship cell
closest to the gap between the boards — not a floating launcher. The AI's
incoming missile could not do the same thing: launching it from an enemy ship
cell would leak the hidden enemy layout, which the AI brief explicitly forbids.
It launches from the enemy board's edge on the target's row instead, which
reads correctly and reveals nothing. The other deviation is that ships stay
hull silhouettes with a bow and stern rather than SPEC's one-brass-square-per-
cell: brass ownership is preserved, but a carrier still reads as a single
five-cell vessel, which earlier playtest feedback specifically asked for.

### 18. Draw the fleet as SVG vessels rather than importing ship artwork

Playtest feedback was blunt: "i want my waters to show literal boats." The
offer on the table was PNG artwork, and the honest answer was that PNG is the
wrong format for this board. Cells are 40px, so a raster ship is either soft on
a high-DPI screen or a 4x asset shipped for no reason; the cell size can never
change again; and — the deciding factor — a damaged hull has to recolour, which
with sprites means a second red copy of every ship. So `src/ships.js` draws
each class instead: one SVG authored bow-right in a `length * 100` by `100`
viewBox, hull plus superstructure, no files to source and nothing binary in a
repo that deploys to GitHub Pages.

Two structural constraints shaped the implementation. First, a vessel has to
span all of its cells as one object, so it is drawn on a `.fleet-art` overlay
rather than per cell — and that overlay must be a *sibling* of the board, since
`cellElAt` indexes the board's children positionally as its 100 cells. Second,
the art cannot bury the game state: the overlay sits above the cells but below
the hit and sunk marks, so a struck segment still shows its klaxon `✕` on top
of the hull. Ship boxes are measured off the live cell elements instead of
recomputed from the cell/gap tokens, which is why bumping `--cell` from 34px to
40px (for detail legibility) needed no changes to the art code. A vertical ship
reuses the bow-right drawing rotated a quarter turn about its centre, which
lands exactly inside the transposed footprint.

Detail is budgeted to the size it renders at: each class is distinguished by
one silhouette-level cue (the carrier's full-length flight deck, the
battleship's three turrets, the submarine's capsule hull and conning tower) and
the 2-cell destroyer deliberately carries less furniture than the others,
because at ~80px anything more turns to mush.

**Assessment: Good decision.** It replaces the previous per-cell hull
silhouettes, which the same feedback round had called "nothing cool". Two
things to keep honest: fair information is unchanged — enemy vessels are drawn
only once `sunk`, which the player already knows — and the layer is additive,
wrapped so that a failure leaves the cell states, which convey ship/hit/miss/
sunk on their own, as the fallback.

### 18. Surveyed the public Battleship landscape, then chose three "legible AI" features over decorative polish
- **Rationale:** Before committing more build time, searched GitHub across
  animation/3D/canvas/WebGL/general Battleship queries to establish what the
  competitive bar actually is, rather than assuming.
- **Findings:** The ceiling is `bigardone/phoenix-battleship` (523★,
  Elixir/Phoenix realtime multiplayer), followed by terminal implementations
  in Rust (~90★) and a cluster of Odin Project curriculum solutions (~24★).
  Anything self-describing as animated, 3D, canvas, or WebGL tops out at
  **six stars**. Notably, the genuinely creative work in public is
  *conceptual*, not visual — zero-knowledge-proof implementations
  (`risc0/battleship-example`, `Shigoto-dev19/ZK-Battleships-Solana`) are the
  standouts. No public implementation treats the AI's reasoning as the
  feature.
- **Assessment: Good decision to survey first.** It falsified the implicit
  assumption that we'd be competing on visual polish. Two conclusions: the
  visual bar is low enough that modest polish differentiates, and the real
  open gap is legibility of the AI — which is where this repo already has
  unique assets (a fair-by-construction AI, a probability map, a history log).
  Chose three features on that axis:
  1. **Provable fairness** — surface the existing `gatherFairKnowledge`
     guarantee as a live, in-browser check (shuffle unsunk ships, recompute,
     compare hashes). The ZK repos confirm players genuinely care about this;
     nobody has made it interactive. Doubles as a direct analogy for trust in
     autonomous agents.
  2. **AI vs AI exhibition match** — two AIs, dual live heatmaps. Highest
     visual payoff per unit of build risk, since it reuses the existing
     engine/AI and owns its own state.
  3. **Post-game coach** — replay the player's shots through the probability
     engine and grade them against Bayesian-optimal. Reframes the AI as a
     teaching tool and is a literal instance of auditing human vs. machine
     decision quality.
- **Honest risk:** this is three more features on top of an unfinished
  harness, an undeployed GitHub Pages site, and a missing `BUGS.md` — with
  the M1 demo and leadership presentation still at zero. Battleship is 10 of
  50 evaluated minutes. Capping the creative work here and treating these
  three as the last additions is the discipline this decision depends on.
- **Parallelisation decision:** all three features want to render, and
  `src/ui.js` is already 1,056 lines — three concurrent sessions editing it
  would collide. Mitigated structurally: each brief mandates a self-contained
  module (`fairness.js` / `exhibition.js` / `coach.js`) exposing a single
  `mount*()` entry point, and permits **at most one import line and one call
  site** in `ui.js` plus one container in `index.html`. Any conflict is then
  a one-line resolution. Each brief also carries an explicit "create exactly
  one session" warning, guarding against the duplicate-dispatch failure in
  Decision 17.
- **Outcome:** `planning/session-briefs/05-fairness-brief.md`,
  `06-exhibition-brief.md`, `07-coach-brief.md` written and ready to
  dispatch. Sessions 5-7 can run in parallel with each other and with the
  still-unstarted harness (Session 4).

### 19. Provable fairness: shuffle the player's unsunk fleet live, in the browser
- **Context:** `tests/ai.test.js` already proved the AI ignores unsunk ship
  positions, but that proof was invisible to a player. Session 5 turned it
  into a control in the battle console (`src/fairness.js` for the logic,
  `src/fairness-ui.js` for the rendering, one import + one call site in
  `src/ui.js`, one `#fairness-panel` container in `index.html`).
- **How shuffles are constrained to stay consistent with public knowledge.**
  The public record is derived exactly the way `src/ai.js` derives it — from
  the AI's own shot history plus the cells of ships whose sinking was
  announced. A relocation is accepted only if, for every unsunk ship:
  in bounds and non-overlapping (via `engine.enumerateLegalPlacements`, not
  new placement logic); never on a cell reported as a miss; never on a sunk
  ship's cells (those ships do not move at all); never *fully* covered by
  outstanding hits, since such a ship would already have been announced
  sunk; and strictly different from its real position, so every trial is a
  genuine relocation. On the completed layout, every unresolved hit cell
  must still be covered by some ship — otherwise the alternative board would
  contradict a "hit" the player already reported. `shotsReceived` and
  `history` are carried across untouched; each moved ship's `hits` set is
  recomputed from its new cells so the alternative state is internally
  consistent rather than merely plausible. The search is randomised
  backtracking, largest ship first, trying hit-covering placements before
  free-water ones (outstanding hits are the scarce constraint).
- **Measured result.** Across 10 full self-played games, 404 checks: 389
  returned 5/5 identical hashes, 15 declined with `trials: 0` (all but one
  in the endgame, where the board is nearly saturated). Zero mismatches.
  Worst-case single check 403 ms. In the browser at 1440x700 a live
  mid-game check reported `PASS — moved your unsunk ships 5 times, the AI's
  targeting map never changed (1c1e65af)`.
- **Honest assessment — what this check does *not* prove:**
  - **`history` is held byte-for-byte fixed, including `shipId` on
    unresolved-hit entries.** That field names a ship the AI has not sunk,
    so it is not truly public, and after a shuffle it may name a ship that
    no longer sits on that cell. A cheating AI that read
    `history[i].shipId` for unsunk ships would therefore *not* be caught.
    Holding history fixed was the brief's explicit constraint and keeps the
    check easy to explain; remapping those ids per shuffle would close the
    hole and is the obvious next improvement.
  - **Five trials is evidence, not a proof.** A cheat that only fires on
    rare configurations could survive five samples. The check is a
    falsification attempt, not a verification.
  - **FNV-1a 32-bit is not collision-resistant.** It is a display
    convenience — the grids being compared are computed locally moments
    apart, so an adversarial collision is not a realistic threat here, but
    hash equality alone is not a cryptographic guarantee.
  - **The search is heuristic and time-capped** (3,000 nodes per attempt,
    400 ms total). It can fail to find a relocation that exists, and
    ~4% of positions report `trials: 0`. That is reported as "NOT
    VERIFIABLE", never as a pass — the one thing a fairness checker must
    never do is fabricate a green light.
  - **It runs synchronously on the main thread.** Deferred a frame so the
    "Recomputing…" line paints first, and hard-capped at 400 ms, but a slow
    machine can still see a short jank. A worker would be cleaner and was
    rejected as out of scope for a no-build-step repo.
- **Layout note:** the battle console is a `repeat(auto-fit, minmax(210px,
  1fr))` grid that fits 1440x700 with zero scrolling. The panel was measured
  in headless Chrome and trimmed (12px copy, inline hash strip instead of a
  six-row list, no disclosure toggle) until the page height stayed at
  exactly 700px with results shown — 189px tall against roughly 209px of
  available slack. Klaxon is deliberately not used for a FAIL verdict; per
  `src/tokens.css` it stays reserved for hit/sunk, so failure reads in brass.
### 19. AI vs AI exhibition mode: mirrored state view, shaped heatmap, full-screen overlay
- **Decision:** `src/exhibition.js` runs two instances of the existing AI
  against each other using only `engine.js` and `ai.js`, and renders both
  probability-density heatmaps live, side by side, in a self-contained
  full-screen overlay. Four non-obvious calls sit underneath that:
  1. **`mirrorView(state)` instead of a second AI seat.** `ai.chooseMove` is
     written from one seat: it always attacks `state.playerBoard` and treats
     `actor === "ai"` history entries as its own. Rather than modify that
     contract (explicitly out of bounds) or fork the AI, the exhibition hands
     the second engine a *mirrored view* — the same state with the two boards
     and the two actor labels swapped. ALPHA occupies the engine's "player"
     seat, BRAVO the "ai" seat; every shot still goes through
     `engine.fireAt`, and the engine's own turn flag drives alternation.
  2. **Shaped heatmap intensities (`shapeIntensities`).** Linear alpha on the
     normalised map does not work here and this is the single biggest visual
     call in the feature. `ai.js` multiplies weights by
     `HIT_BOOST_FACTOR ** hitsCovered` (100^n), so the instant either AI lands
     a hit the peak is 100x-10,000x everything else and the board renders as
     one bright cell on black — the viewer sees no reasoning at all. Before
     any hit the density is nearly flat and renders as an even green wash.
     The fix blends a rank (histogram-equalisation) term with the raw
     normalised value, so the field reads as terrain before a hit and as a
     spotlight after one. `ui.js`'s `normalizeProbabilityMap` is still the
     only normaliser; shaping is a display transform layered on top.
  3. **Full-screen overlay, not a panel below the battle view.** The battle
     view was just tuned to fit 1440x700 with zero scrolling. The container
     added to `index.html` is a single `position: fixed` div that is empty
     until mounted, so it contributes nothing to document flow and cannot
     reintroduce scrolling. The entry point is a fixed pill in the bottom-
     right corner for the same reason.
  4. **Styles injected by the module, not added to `style.css`.** Three
     sessions are editing this repo in parallel; a `<style>` element owned by
     `exhibition.js` (and removed by `destroy()`) keeps the merge surface to
     one import line in `ui.js`, one call site, and one `<div>` in the HTML.
- **Timer discipline:** every timeout goes through a module-level `schedule()`
  that registers it in a live set, and `activeTimerCount()` is exported so the
  "stray interval running behind the real game" failure can be *asserted*
  rather than assumed. Verified in a real browser over CDP: 0 outstanding
  timers after closing a finished match, after closing mid-match, and after
  Escape. Headless play schedules no timers at all. A `visibilitychange`
  listener also pauses the match in a background tab.
- **Assessment: good, with three honest weaknesses.**
  - *Risky:* `exhibition.js` imports `normalizeProbabilityMap` from `ui.js`,
    while `ui.js` imports `mountExhibition` — a genuine circular import. It is
    safe today only because both are `export function` declarations (hoisted)
    and neither calls into the other at module-evaluation time. It works, and
    the brief asked for the reuse, but the honest structural fix is to move
    `normalizeProbabilityMap` into a shared module. Left alone deliberately:
    that refactor touches `ui.js` well beyond the one line this session is
    allowed.
  - *Risky:* `mirrorView` shares board objects by reference with the state it
    mirrors. That is safe only because `ai.js` is genuinely pure and only
    reads. If the AI ever gained a cache or a side effect, this would leak
    across seats silently. The tests assert non-mutation of an externally
    supplied `GameState`, which would catch the obvious version of that
    regression but not a subtle one.
  - *Bad, accepted:* the exhibition shows both fleets' real hulls in brass.
    That is unfair information *to the viewer*, not to either AI — neither
    engine reads it — but it does mean the screen is showing something the
    AIs cannot see. It is the whole point (you are watching the heat converge
    on hulls you can see and they cannot), but it is worth being explicit
    that this is a demonstration view, not a playable one.
  - Minor: the overlay's `is-acting` highlight and the heat both use
    `--phosphor`, so at a glance the two sides are distinguished only by the
    brass ALPHA/BRAVO labels and the panel positions. A second accent would
    read better, but the palette reserves `--klaxon` for hit/sunk and adding a
    fourth colour would break the design system for one feature.
- **Outcome:** 40 tests pass (28 pre-existing, 12 new). Over 300 headless
  matches: mean 78 shots total (~39 per side), min 46, max 124. At
  `STEP_MS = 170` that is ~13 seconds typical and ~21 seconds worst case,
  inside the brief's 30-second budget. Verified in headless Chrome at
  1440x700, 1280x720, 1920x1080, 1100x760 and 1024x700 — no scrolling on the
  battle view or inside the overlay at any of them, clean console.
### 19. Post-game coach: mirrored replay for per-turn knowledge, mean shot-efficiency ratio for score
- **Context:** Session 7 (`planning/session-briefs/07-coach-brief.md`). Grade
  the human's shots against the same Bayesian Search Theory engine the AI uses,
  in `src/coach.js` (pure) + `src/coach-ui.js` (render only).

- **Reconstructing per-turn knowledge — the mirrored replay.**
  `ai.computeProbabilityMap(state)` is hard-wired to attack `state.playerBoard`
  using the `actor === "ai"` slice of `state.history`. Rather than fork or
  parameterise the AI (the brief forbids touching its contract, and a fork
  would drift), the coach builds a **mirror state** for each shot `i`: the real
  `aiBoard` is placed in the `playerBoard` slot, and `history.slice(0, i)` of
  the player's shots is relabelled `actor: "ai"`. The AI then grades the human
  using literally the same code path it uses to play.
  `gatherFairKnowledge` reads exactly four things, and each is rebuilt from the
  prefix alone: board size (constant); `shotsReceived` (rebuilt from the prefix
  — the live `aiBoard.shotsReceived` holds every shot of the whole game and is
  the single most obvious leak, so it is never passed through); the relabelled
  prefix history; and `ships[].cells` for ships whose id appears as a `"sunk"`
  result *within that prefix*, which is public information at that point. Each
  ship's `hits`/`sunk` are rewound to the prefix too, even though nothing reads
  them today — belt-and-braces against a future ai.js change silently leaking.
- **Weaknesses, honestly.** (1) The guarantee is *by inspection of ai.js*, not
  structural. If `gatherFairKnowledge` ever starts reading a fifth field off
  the board, the mirror could leak without any test noticing — a
  `Proxy`-trapped board in the tests would catch that and is the obvious next
  hardening. (2) The tests defend the boundary three ways — turn 1 must see a
  virgin 100-cell board, grades must be prefix-invariant when later turns are
  deleted, and a sink on turn *n* must not affect the grade of turn *n-1* —
  which is strong evidence but not a proof. (3) The coach grades the human as
  if they reasoned like the AI. A human cannot enumerate ~2,000 placements in
  their head, so "optimal" here is a machine benchmark, not a fair human one.
  That is stated as the framing, not hidden.

- **Score = mean over graded shots of `probability / bestProbability`**, i.e.
  the share of the turn's available information the shot actually bought.
  Chosen because it grades the *decision, not the dice* — firing at the single
  best cell and missing still scores 1.0 for that turn, which is correct — and
  because every turn contributes a commensurable number in [0,1], so no single
  lucky turn can dominate. Turns with no meaningful choice are skipped, not
  failed: one-or-zero cells left, a uniformly-zero map (every ship already
  sunk), or every open cell carrying identical weight.
- **Weaknesses, honestly.** The AI's `HIT_BOOST_FACTOR` of 100 per covered hit
  means that once a ship is wounded, any cell that cannot complete it scores
  1e-2 to 1e-4 of the best cell. Failing to follow up a hit therefore costs
  almost the whole turn. That is the right *ordering* — wandering off after a
  hit is the most expensive mistake in Battleship — but the *magnitude* is an
  artefact of a constant chosen for the AI's play, not for grading, so the
  scale is not linear in any principled sense. Consequences: a competent human
  heuristic (parity sweep + adjacent follow-up) scores 0.53-0.66, and the
  arithmetic mean is dominated by follow-up turns rather than search turns.
  Considered and rejected: a geometric mean (crushes everything toward zero
  once any single turn is bad) and shots-taken vs. an AI replay of the same
  board (grades luck as much as judgement). Also rejected: rescaling against a
  random-search baseline to make the number look friendlier — that is exactly
  the flattery the brief rules out. **Assessment: defensible but harsh, and
  the harshness is a deliberate, documented choice rather than a calibration.**
- **Vacuous case:** if no turn was gradeable, `score` is 1 ("nothing to get
  wrong") and `formatCoachReport` says so in words rather than printing a
  meaningless percentage. Reporting 0 there would be dishonest in the other
  direction.

- **Integration:** obeyed the Decision 18 budget exactly — one import line and
  one call site (`mountCoach(els.endScreen, () => state)` at the top of
  `renderEndScreen`) in `ui.js`, one `<div id="coach-report">` in
  `index.html`. `mountCoach` is fully wrapped, caches its grade against the
  state object, and clears itself when the game is not over, so a failure
  leaves the end screen and the New Game button untouched. Verified in headless
  Chrome over CDP: full game played, panel rendered, New Game still functional,
  zero console errors.
- **Outcome:** `src/coach.js`, `src/coach-ui.js`, `tests/coach.test.js` (14
  tests), `scripts/coach-sample.mjs` (throwaway demo that produced the sample
  report in the PR). 42 tests pass. Optimal player scores 1.000000; worst-case
  player scores 0.037833 — a gap of 0.96, asserted explicitly in the tests.
### 19. Playtest harness at scale, and an in-game Strategy Arena built from its output

- **Harness (`scripts/harness.js`).** Built to Session 4's brief:
  `simulateGame`, `randomChooseMove` (implemented in the harness, *not* as a
  "dumb mode" in `src/ai.js`), `runBatch` with per-move invariant checking,
  and a CLI entry point. Added a third strategy, classic **hunt-and-target**
  (random search, then adjacent-cell mop-up, preferring to extend an
  established line of hits), because "beats random" is a low bar — the honest
  comparison is against the algorithm most public Battleship AIs actually
  ship.
- **Reproducibility by seeding `Math.random`.** Every game runs inside
  `withSeededRandom(seed, ...)`, which swaps in a mulberry32 PRNG and restores
  the original in a `finally`. Both the engine's fleet placement and the AI's
  tie-breaking go through `Math.random`, so a seed pins an entire game
  end-to-end, and any anomaly replays with
  `node scripts/harness.js --repro <seed> --strategy <name>`. Anomalies still
  carry the full move history as well. *Assessment: good* — monkey-patching a
  global is normally a smell, but it buys total reproducibility without
  changing a single module contract, and it is confined to a dev script.
- **Two measurement modes.** Duel mode is the real alternating game. But duel
  shot counts are *censored*: a lucky random player finishes first in ~52% of
  random-vs-random games, so averaging only the games a strategy won flatters
  weak strategies badly. So the arena numbers come from "clearing" mode, where
  the AI fires every turn until the player's board is clear. The harness pins
  `state.turn` back to `"ai"` between calls; every shot still goes through
  `engine.fireAt` and no rule is reimplemented. *Assessment: slightly risky* —
  it reaches into a state field the engine owns — but the alternative was
  publishing biased numbers, and both modes are run and reported.
- **Results (2,000 games per strategy per mode; 12,000 games total).**
  Shots to clear a 10x10 board: **Bayesian 44.9 avg** (median 44, best 22,
  worst 70, 39.6% hit rate) · **hunt-and-target 60.0** (median 59, best 24,
  worst 100, 30.2%) · **random 95.3** (median 97, best 59, worst 100, 17.9%).
  The real AI is **53% more efficient than random and 25% more efficient than
  hunt-and-target**. In duels against a random-firing player it won
  2000/2000; hunt-and-target won 98.9%; random won 48.4%.
- **Anomalies: zero across 12,000 simulated games.** Every move was checked
  for shot legality, no-op-on-repeat (actively probed by re-firing each shot
  and discarding the result, rather than waiting for a strategy to trip over
  it), monotonic `shotsReceived`, sunk-implies-all-cells-hit and its converse,
  result-vs-board agreement, history numbering/attribution, an
  `isGameOver`/`status` cross-check, and a 200-move (2x cell count)
  termination bound. The engine held up completely under normal play. That's
  a real result, and also a boring one, which is why:
- **`auditEngineContract()` — five real contract violations found.** Normal
  play never produces malformed input, so scale alone proves nothing about
  the edges. Deliberate probes found that `engine.fireAt`: (1) accepts
  **off-board** cells as ordinary misses, (2) accepts **fractional**
  coordinates, permanently inserting an unmatchable `"1.5,2"` key into
  `shotsReceived`, (3) **keeps accepting shots after the game is over**,
  appending history entries and flipping `turn` while `status` stays terminal
  — directly corrupting the history the Battle Report and efficiency stat
  read, (4) never checks the **target board matches whose turn it is**, so a
  caller can shoot its own fleet and be logged as the actor, and (5) silently
  treats **any unrecognised board name** as `"ai"` (the ternary has no third
  branch), so a typo misfires instead of throwing. `planning/technical-design.md`
  says `fireAt` "validates the shot"; today it validates exactly one thing.
  These are reported, not worked around — no engine code was changed here,
  per the brief's boundaries. They are the raw material for `BUGS.md`.
- **Strategy Arena (`src/arena.js`).** The harness writes `src/baseline.js`, a
  generated constants file (avg/median/best/worst/hit-rate plus a bucketed
  distribution per strategy). `mountArena(rootEl)` renders a launcher on the
  *launch* screen that opens a fixed-position overlay — deliberately not
  appended below the battle view, which was just fitted to 1440x700 with zero
  scrolling (verified still 700px, no scroll, no console errors). Costs
  `src/ui.js` one import and one call, and `index.html` one empty `<div>`.
  Everything inside `mountArena` is wrapped in a try/catch that returns
  `false`; the module also injects its own stylesheet, so `src/style.css` is
  untouched.
- **Charts are normalised per strategy, not on a shared vertical axis.**
  Tried shared first: random search's 1,340-game spike in the 95-100 bin
  squashed the other two distributions into invisible slivers. The comparison
  is carried by the shared *horizontal* axis (every chart spans 15-100 shots)
  and the avg-shots figure. *Assessment: good* — but it is a judgement call,
  and a reader who assumes a common y-axis would misread the bar heights,
  which is why each chart is labelled with its own median.
- **Honest weaknesses.** The arena is only reachable from the launch screen,
  so a player who dives straight into a game never sees it. `src/baseline.js`
  is generated but committed, so it silently goes stale if the AI changes —
  there is no CI check that re-runs the harness. And the five contract bugs
  above are documented but unfixed; that fix belongs to whoever owns
  `engine.js`, and until it lands the "validates the shot" line in the
  technical design is aspirational.

## Title / attract screen (`src/title.js`)

- **The game opened on a form.** Load went straight to the fleet-placement
  grid: a roster, a blank 10x10, four buttons. Functional, and completely
  unpersuasive — nothing said what this thing is or why its AI is worth
  playing against. Added a real title screen as the new first phase.
- **Phase state machine extended, not bypassed.** `src/ui.js` already had
  `phase = "placement" | "battle"`; it is now `"title" | "placement" |
  "battle"`, with a single `enterTitlePhase()` that mirrors
  `enterPlacementPhase()`. `render()` returns early on `"title"` (there is
  nothing game-shaped to paint), and a `body.phase-title` class hides the
  in-game masthead and status line rather than each screen toggling its own
  visibility. *Assessment: good* — one entry point per screen, no scattered
  `hidden` flags.
- **Fixed-position, full-viewport — and that is load-bearing.** The battle
  layout was recently fixed to scroll nowhere at 1280x620 through 1920x940.
  A `position: fixed` title layer contributes nothing to
  `documentElement.scrollHeight`, so the zero-scroll guarantee holds by
  construction instead of by another round of height budgeting. Everything
  inside is sized in vh-aware `clamp()`s; at `max-height: 660px` the corner
  HUD, the provenance footnote and the fleet strip drop out.
- **Every number is imported, none typed.** `titleStats()`, `hookLine()` and
  `statsNote()` read `AI_AVG_SHOTS`, `RANDOM_BASELINE_AVG_SHOTS`,
  `EFFICIENCY_VS_RANDOM` and `BASELINE_GAMES_PER_STRATEGY` from the generated
  `src/baseline.js`. Re-running the harness re-words the title screen. Those
  three functions are pure and unit-tested (`tests/title.test.js`, 8 tests),
  which is the whole reason the copy lives in JS rather than in the markup.
- **The buried features are now the two secondary CTAs.** The previous log
  entry's own "honest weakness" was that the Strategy Arena was only
  reachable from the launch screen. Both it and the AI-vs-AI exhibition are
  now on the title screen. The title's buttons click the launchers those
  modules already mount, so neither module's contract changed.
  *Risky bit, flagged:* the in-placement arena instance lives inside
  `#placement-screen`, which is `display: none` while the title is up, so its
  overlay cannot be shown from there. Rather than move it (and change the
  placement screen), a second launcher-less `mountArena()` instance is
  mounted into `#title-arena-root` at body level and CSS hides only its
  button. Two instances of a stateless stats panel is a small, contained
  cost; the alternative was reaching into another module's DOM.
- **Background: CSS, not canvas.** A single rotating conic-gradient wedge with
  a 1px leading beam, over a static grid and ring pattern, masked with
  `radial-gradient(closest-side, ...)` — `closest-side` matters: the default
  `farthest-corner` never finishes fading inside the box and the sweep clips
  as a hard rectangle. One compositor-only transform animation, no JS, no
  dependency, `pointer-events: none`, and fully disabled (as a static wedge)
  under `prefers-reduced-motion`.
- **Stat figures are mono, not the stencil display face.** Big Shoulders
  Stencil cuts slots through digits and "44.9" — the single most important
  string on the screen — read as glitched at 40px. The display face keeps the
  wordmark and tagline; the measured numbers get JetBrains Mono.
- **Failure is survivable.** `mountTitle()` never throws; it returns `false`,
  and `init()` then calls `enterPlacementPhase()` directly, so a broken
  attract screen cannot make the game unreachable (PRD Section 5). The markup
  shell is static in `index.html` for the same reason.
- **Honest weaknesses.** The composition is still a centred text stack — a
  confident one, but a stack; a genuinely art-directed title would carry an
  illustration, and the faint fleet silhouette strip is the only real imagery.
  The radar is decorative rather than diegetic: it is not showing a real
  probability field, which the AI could actually supply. There is no route
  *back* to the title screen once you leave it (New Game returns to
  placement), and no attract-mode timeout that demos a match. The keyboard
  affordance is Enter only.
