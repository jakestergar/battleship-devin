# Battleship Exercise — Planning Doc

**Role:** Account Director, Enterprise (Cognition)
**Stage:** Pre-M1 exercise, debriefed in first ~10 min of the M1 call

## Why this exercise exists
This isn't a coding test — it's testing "familiarity and empathy for software
engineering work." As an AE selling Devin, I need to be able to speak credibly
about what building/debugging software actually feels like. The debrief will
likely probe: What was hard? What broke? How did you (and Devin) work through
it? That story matters more than the game itself.

## Deliverables (from the prompt)
- [ ] Live, playable link to a simple Battleship game vs. an AI
- [ ] Short document explaining bugs found + how they were fixed (or a link to it)
- [ ] Public GitHub repo with the code

Constraint: can use Devin and/or Windsurf, but no other person may write/edit
code for me.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Primary build tool | **Devin** | Directly relevant to the role — gives me a real, first-hand story about the Devin workflow to reference later in the actual M1 demo/pitch |
| Stack | **Plain HTML/CSS/JS** (no framework) | No coding background yet — simplest to understand, review, and explain line-by-line if asked. Zero build tooling to debug. |
| Hosting | **GitHub Pages** | We need a public GitHub repo anyway — hosting straight from it avoids managing a second platform (e.g. Vercel account) |
| AI opponent logic | **Simple heuristic AI** (random shots, then "hunt mode" adjacent to a hit) | Enough to feel like a real opponent without needing real ML — keeps scope tight |
| Scope | **Single-player vs. AI only**, one board size (e.g. 8x8 or 10x10), standard ship set | Matches "simple" in the prompt; avoids scope creep |

## Step-by-step Plan

1. **Set up the repo first**
   - Create a new public GitHub repo (e.g. `battleship-devin`)
   - This becomes the working directory Devin operates in from the start, so
     the commit history itself shows the build process (useful context for
     the debrief).

2. **Write a clear spec/prompt for Devin**
   - Describe: single-player Battleship, standard rules, AI opponent with
     basic hunt logic, simple grid UI, win/loss state, playable in browser,
     no backend needed.
   - Ask Devin to scaffold the game in the repo and open a PR (or commit
     directly, depending on setup).

3. **Review what Devin builds (even without deep coding background)**
   - Read through file structure at a high level: what files exist, what each
     roughly does (index.html, style.css, game.js / board logic, ai logic).
   - Goal: be able to explain the shape of the app in plain language during
     the debrief, not just "Devin did it."

4. **Play-test manually**
   - Actually play several games start to finish.
   - Note anything that breaks, looks wrong, or feels off (e.g. AI shooting
     the same cell twice, ships rendering incorrectly, win condition not
     triggering, layout issues on smaller screens).

5. **Log every bug as it's found** (see template below) *before* asking Devin
   to fix it — this is what becomes the bug doc deliverable.

6. **Have Devin fix each bug**
   - One at a time where possible, so the fix and root cause stay traceable.
   - Re-test after each fix to confirm it's actually resolved (and didn't
     break something else).

7. **Deploy to GitHub Pages**
   - Enable Pages on the repo (serve from `main` / `docs` or root, depending
     on structure).
   - Confirm the live link actually works in a fresh incognito window.

8. **Write the bug-fix document**
   - Turn the bug log into the short writeup required by the prompt.
   - Can live as `BUGS.md` in the repo, or a separate doc — either is fine per
     the prompt ("send us the document or a link to the document").

9. **Polish the repo for review**
   - Add a short `README.md`: what it is, how to run/play it, link to the
     live version.
   - Make sure repo is actually public.

10. **Prep debrief talking points** (see below) — this is the part that
    actually gets evaluated in the M1 call.

## Bug Log Template

| # | Bug (what happened) | How I found it | Root cause | Fix | Verified? |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |

## Debrief Talking Points (~10 min at start of M1)

Frame the story as: *spec → build → play-test → break → diagnose → fix →
verify* — the same loop a real engineering team runs, just compressed and with
Devin doing the implementation work.

Points to hit:
- **What I asked for and why** (the spec I gave Devin, and any scoping calls I
  made to keep it simple).
- **What surprised me** about watching Devin build it (speed, how it
  structured the code, anything it got wrong on the first pass).
- **1-2 concrete bugs**, told as mini-stories: what broke, how I noticed it,
  what the actual root cause turned out to be (not just "it didn't work"),
  and how it was fixed.
- **How this shapes my empathy for engineers** I'll be selling to — e.g.
  understanding that "simple" features still have edge cases, that
  verification/testing is its own real step, that debugging requires
  isolating root cause vs. just patching symptoms.
- **Tie-in to the AE role** (optional but strong): this is a small preview of
  the exact workflow I'll be demoing to customers in the M1 pitch — plan,
  delegate to Devin, review, verify, ship.

## Open Questions to Resolve While Building
- [ ] Confirm board size and ship set before prompting Devin (keep it standard
      unless there's a reason to simplify further)
- [ ] Decide where `BUGS.md` / bug doc lives (repo root vs. separate doc)
- [ ] Confirm GitHub Pages deploy works from a clean clone, not just locally
