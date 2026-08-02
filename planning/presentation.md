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

## Bug stories — for the ~10 minute debrief

Full write-up in `BUGS.md`. These are the three to tell out loud, in this
order. Each is a mini-story: what broke, how I noticed, what the cause
actually turned out to be, how it was fixed.

### 1. "Bugs don't live where the traffic is" — the headline

The harness played **6,000 simulated games**, validating invariants after
every single move. It found **zero** anomalies. The moment it stopped playing
the game properly and started deliberately calling `fireAt` with garbage, it
found **five real bugs** — off-board coordinates accepted, fractional
coordinates producing a key like `"1.5,2"` that matched no cell and could
never be cleared, shots accepted *after* the game had ended (corrupting the
finished history that the post-game report reads), no turn validation so you
could damage your own fleet, and an unknown board name silently defaulting to
the enemy's.

None are reachable by clicking. That's exactly why they survived.

**The point:** volume of testing isn't coverage. I'd been about to call it
done because thousands of normal games looked clean.

**The follow-on:** fixing turn validation broke three tests — which had been
firing twice in a row at the same board and only passed because the engine
was permissive. The tests were wrong too.

### 2. Being handed one wrong number and finding two bugs

A playtester said: "after the AI's first hit it says 100%."

Reproduced it — 94% after one hit, 99.9% after three. But investigating
turned up something *not* reported: a completely symmetric opening position
read **45.7%** for the player, who moves first and should be slightly ahead.
Two separate bugs pushing the same direction.

- **The estimate was treated as a fact.** The simulation used a point-estimate
  hit rate and ran 3,000 trials all assuming it was exactly right. After one
  shot that's 0.262 vs 0.170, and over a race needing ~16 successes that gap
  compounds into near-certainty — from evidence that was almost pure noise.
  The arithmetic was right; the *model* was wrong. Fix: each side's hit rate
  now carries a Beta posterior and every trial draws its own rate from it.
- **Timeouts were silently scored as AI wins.** Once rates are sampled, some
  trials draw ~0.02 and need ~850 shots; the cap was 400 and the loop counted
  "not a player win" as an AI win.

**The point:** the reported symptom was real but it was the smaller half. And
"correct arithmetic, wrong model" is a category of bug that no type system or
test-count catches.

### 3. The bug I caused, that threw no error

Resolving a merge conflict in `style.css` by keeping both sides consumed the
closing brace of a `@media` block. That silently disabled **~70 rules**,
including every responsive fix. Nothing threw. Nothing logged. Tests passed.
The only symptom was 65px of page overflow at one viewport size.

Related, and worse: my *verification harness* had been serving a cached
`ui.js`, so a round of "verified" results was measured against stale files —
producing a false bug report about features that were mounting fine. For a
while the tooling was less trustworthy than the code.

**The fix that matters:** not the brace. I added a Devin `PostToolUse` hook
that runs after any edit to a stylesheet and refuses to leave it unbalanced.
The mistake is now structurally impossible in this repo, for any session.

**The point:** the interesting move isn't fixing the bug, it's making the
class of bug unrepeatable.

### Bonus, if there's time: a hypothesis I got wrong

Ship graphics looked missing. I had a confident, plausible theory — the art
measures cell positions while the board is still hidden, so everything
computes as zero-width and gets skipped, and the graceful-degradation wrapper
would have swallowed it. Reading the code disproved it, and driving a real
browser confirmed all five ships rendering at correct sizes.

Worth telling because a confident wrong diagnosis is normal, and it cost less
to disprove in a browser than to "fix" something that was never broken.

---

## How I debugged — the transferable part

Four habits, in the order they earned their keep:

1. **Run it, don't read it.** The harness executed 6,000 games and interpreted
   the distribution. Suggesting a test and running one at scale are different
   activities.
2. **Probe the edges, don't add traffic.** Zero bugs in normal play, five at
   the contract boundary.
3. **Instrument, don't eyeball.** "The page is a bit long" versus "three of
   your five differentiating features are below the fold, by four pixels."
   Same page, and only one of those is actionable.
4. **Encode the lesson, not just the fix.** A hook turns a resolution into a
   guarantee.

**Accuracy note for the room:** the hook is a Devin CLI feature I actually
used. Playbooks, Knowledge and Automations are the platform equivalents at
team scale — worth mentioning as product capability, but be explicit that I
didn't use them here. Don't blur the two.

---

## Closing framing
Every non-obvious decision in this build — tool choice, scope calls, what to
build vs. what to reject as a poor product fit — is logged in
`decision-log.md`. That log itself is part of the story: it shows the same
kind of structured decision-making I'd bring to a real customer engagement.
