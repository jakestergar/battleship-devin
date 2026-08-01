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

### 19. Security review: hardening only, since the game has no server or secrets

- **Context:** asked to scan for hardcoded secrets, SQL injection, unvalidated
  input, insecure dependencies, permissive CORS, exposed debug endpoints, and
  missing auth checks.
- **Finding:** none of those classes apply. The game is static HTML/CSS/ES
  modules with zero runtime dependencies, no backend, no database, no network
  calls, no auth, and no secrets in the tree or in git history. The only
  third-party resource is the Google Fonts stylesheet; the only persisted data
  is a boolean mute flag in `localStorage`.
- **Decision:** apply defence-in-depth instead of chasing non-issues — a
  restrictive CSP (`default-src 'none'`, scripts self-only, fonts limited to
  Google's two origins), `no-referrer`, bounds/type validation on `fireAt`,
  an own-property + integer guard in `shipSvg` (the one place where a value
  reaches `innerHTML` inside a class name), and removal of the one gratuitous
  `innerHTML` in the reticle.
- **Honest assessment:** good but small. The residual risk is the unpinnable
  Google Fonts stylesheet — SRI is impossible on it because Google serves
  UA-dependent CSS; self-hosting the woff2 files is the real fix and is
  deliberately deferred as a visual-layer change, with CSP limiting the blast
  radius to styling in the meantime.
