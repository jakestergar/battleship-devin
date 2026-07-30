# Presentation Notes — Battleship Debrief

Talking points and narrative material to use when presenting/debriefing the
Battleship exercise. Written to be spoken from, not read verbatim.

---

## Story: Exploring "Could Devin itself play the game live?"

**Setup:** Before building, I asked — what's the most creative, boundary-
pushing way to use Devin on this exercise, beyond just "have it write the
code"? One idea I seriously considered: have a live Devin agent actually be
the AI opponent, making real-time decisions during gameplay via the Devin
API.

**What I found when I stress-tested that idea:**
- Technically possible — Devin does expose a session API that could, in
  principle, be wired into a game loop.
- But it's the **wrong tool for that job**:
  - **Latency mismatch** — Devin sessions are full agentic sessions (sandbox,
    reasoning, tool use) built for tasks that take minutes, not sub-second
    game moves. A human opponent would be sitting there waiting minutes per
    shot.
  - **Cost mismatch** — each move would burn real compute/credits for what's
    functionally a single decision. Not what the product is priced or built
    for.
  - **Product-fit mismatch** — Devin is an autonomous software engineer, not
    a low-latency inference engine for game decisions.

**Why I'm telling this story instead of hiding it:** Recognizing when a
"cool" idea is actually a *poor fit* for a product is exactly the judgment
an Account Director needs — knowing where Devin fits and where it doesn't is
more valuable than forcing a flashy demo that misrepresents the product. I'd
rather walk in and be flagged for that exact instinct.

**What I did instead — playing to Devin's actual strengths:**

1. **Devin as an autonomous playtesting/QA agent** (headline differentiator)
   — rather than manually clicking through a handful of games to find bugs,
   I had a Devin session write and run a script that played hundreds/
   thousands of automated games against the AI opponent, headless, logging
   anomalies: crashes, invalid game states, illegal AI moves, win-condition
   failures. This is genuinely inside Devin's real wheelhouse — write code,
   run it, interpret results, iterate — and it's what actually produced the
   substantive bugs in my bug-fix writeup, not just a couple of manual
   playtest quirks.
2. **A live "fix/extend it on the spot" moment** — during this debrief, I'm
   open to taking a live request and having Devin address it in real time.
   This is a preview of the same demo muscle I'll use in the actual M1 pitch.
3. **Devin documenting its own reasoning** — the build sessions were asked to
   explain *why* they made specific implementation choices in their PR
   descriptions, not just *what* changed — which is what I'm narrating from
   here.
4. **Parallel Devin sessions for the build itself** — the game was built by
   decomposing work into independent workstreams (engine/rules, AI opponent
   logic, UI, and the playtest harness) run as separate parallel Devin cloud
   sessions, then integrated — mirroring exactly how I'd pitch a customer to
   parallelize their own engineering backlog with Devin.

---

## Creative differentiation — talking point
Direction from Sebastian was clear: polish and creativity are genuinely
evaluated here, not secondary to reliability. Rather than treat those as
competing priorities, the build holds both simultaneously — creative/visual
features are architected as isolated, gracefully-degrading layers that can
never break the core game, so investing in polish never comes at the cost of
reliability.

The creative direction itself was deliberate: instead of decorative effects
(shaders, particle systems, sound design) that look impressive but don't
demonstrate anything, I focused on features that make the AI's actual
reasoning visible and legible:
- **AI Thinking heatmap** — shows the probability-density calculation live,
  turning "I built a smart AI" from a claim into something you can watch.
- **"Explain this move"** — plain-language reasoning behind each AI shot,
  pulled from the same data the heatmap renders.
- **Live confidence meter** and **efficiency-vs-random-baseline benchmark**
  (powered by the automated playtest harness) — quantify how much smarter
  the AI actually is, not just assert it.
- **Battle Report generator** — turns raw game data into a business-readable
  narrative summary. This one is deliberate: it's a literal demonstration of
  "connect technical work to business impact," the exact skill called out in
  the M1 objective, not just a fun add-on.

Time-permitting extras (replay mode, shareable result card, naval visual
theme) round out the polish without competing with the above for build time.

## AI Opponent — technical talking point
The AI opponent uses **probability-density targeting**: for every empty
cell, it computes how many valid ways a remaining ship could occupy that
cell given the current board state, weighting cells adjacent to unresolved
hits heavily. It fires at the highest-frequency cell each turn. This is a
meaningfully stronger algorithm than the basic "hunt-and-target" approach
that shows up in most public Battleship implementations — chosen
deliberately after researching existing public solutions and identifying
what would actually differentiate this build (see `decision-log.md`,
decisions 4 & 5).

---

## Bug stories (fill in once playtesting/automated runs complete)
- Bug 1: _TBD_
- Bug 2: _TBD_
- Bug 3 (ideally sourced from the automated playtest harness, at scale): _TBD_

---

## Closing framing
Every non-obvious decision in this build — tool choice, scope calls, what to
build vs. what to reject as a poor product fit — is logged in
`decision-log.md`. That log itself is part of the story: it shows the same
kind of structured decision-making I'd bring to a real customer engagement.
