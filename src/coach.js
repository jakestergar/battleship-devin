// Post-game coach: replays the human player's own shots through the same
// Bayesian Search Theory engine the AI uses (`ai.computeProbabilityMap`) and
// grades how close to optimal they played.
//
// Pure module. Imports engine + ai only. No DOM, no mutation of the state
// passed in. Rendering lives in `src/coach-ui.js`.
//
// See planning/technical-design.md for the GameState / HistoryEntry contract
// and planning/decision-log.md for the reconstruction and scoring rationale.

import { BOARD_SIZE } from "./engine.js";
import { computeProbabilityMap } from "./ai.js";

function key(row, col) {
  return `${row},${col}`;
}

/** Board coordinates as the UI labels them: rows are A-J, columns are 1-10. */
export function formatCell(cell) {
  if (!cell) return "—";
  return `${String.fromCharCode(65 + cell.row)}${cell.col + 1}`;
}

// ---------------------------------------------------------------------------
// Per-turn knowledge reconstruction
// ---------------------------------------------------------------------------
//
// `ai.computeProbabilityMap(state)` is hard-wired to attack `state.playerBoard`
// using the subset of `state.history` where `actor === "ai"`. To grade the
// human we hand it a *mirror* state in which the AI's board occupies the
// `playerBoard` slot and the human's shots are relabelled as the attacker's.
//
// The whole correctness question is: does that mirror contain anything the
// player did not know at that turn? `ai.gatherFairKnowledge` reads exactly
// four things, so each is rebuilt from the prefix `history.slice(0, i)` alone:
//
//   1. `board.size`                 — constant, no leak possible.
//   2. `board.shotsReceived`        — rebuilt from the prefix only. The live
//                                     `aiBoard.shotsReceived` holds every shot
//                                     of the whole game and would be a direct
//                                     leak (it zeroes cells in the map and
//                                     defines "already fired at"), so it is
//                                     never passed through.
//   3. `history` (actor === "ai")   — the prefix, relabelled. Sunk-ship ids and
//                                     unresolved hits are derived from this.
//   4. `board.ships[].cells` for ships whose id appears as a `"sunk"` result
//                                     *in that prefix*. A sunk ship's position
//                                     is public information at that point in
//                                     the game, which is precisely the AI's own
//                                     fairness rule.
//
// `hits` and `sunk` on each ship are additionally rewound to the prefix, even
// though today's `gatherFairKnowledge` never reads them. That is belt-and-
// braces: if ai.js ever starts reading them, this stays honest instead of
// silently leaking the final board.
function mirrorStateAt(state, priorShots) {
  const source = state.aiBoard;
  const size = source.size ?? BOARD_SIZE;

  const shotsReceived = new Set(
    priorShots.map((h) => key(h.cell.row, h.cell.col))
  );

  const ships = source.ships.map((ship) => {
    const cells = ship.cells.map((c) => ({ row: c.row, col: c.col }));
    const hits = new Set(
      cells.map((c) => key(c.row, c.col)).filter((k) => shotsReceived.has(k))
    );
    return {
      id: ship.id,
      length: ship.length,
      cells,
      hits,
      sunk: hits.size === cells.length,
    };
  });

  return {
    playerBoard: { size, ships, shotsReceived },
    // Nothing reads the other board; keep it empty rather than copying the
    // human's real fleet in, so there is nothing there to leak either.
    aiBoard: { size, ships: [], shotsReceived: new Set() },
    turn: "ai",
    status: "in_progress",
    history: priorShots.map((h) => ({
      ...h,
      cell: { row: h.cell.row, col: h.cell.col },
      actor: "ai",
    })),
  };
}

/**
 * Summarises one probability grid: total weight, the peak, a peak cell, and
 * whether the board actually offered a choice this turn.
 */
function summariseGrid(grid, shotsReceived, size) {
  let total = 0;
  let best = -Infinity;
  let worst = Infinity;
  let bestCell = null;
  let available = 0;

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (shotsReceived.has(key(row, col))) continue;
      const w = grid[row]?.[col] ?? 0;
      available++;
      total += w;
      if (w > best) {
        best = w;
        bestCell = { row, col };
      }
      if (w < worst) worst = w;
    }
  }

  return { total, best, worst, bestCell, available };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------
//
// SCORE DEFINITION
// ----------------
//   score = mean over graded shots of (weight of the cell you chose)
//                                   / (weight of the best available cell)
//
// Because both terms are divided by the same grid total, this is identical to
// `probability / bestProbability` — the share of the turn's available
// information the shot actually bought. 1.0 means "you took the best cell on
// the board"; 0.0 means "you took a cell the engine had ruled out entirely".
//
// Why the mean of per-turn ratios rather than, say, comparing total shot
// counts against an AI replay:
//   - It grades the *decision*, not the dice. A player who fires at the single
//     best cell and misses still scores 1.0 for that turn, which is correct:
//     the outcome was luck, the choice was not.
//   - It is per-turn commensurable — every turn contributes a number in [0,1],
//     so no single lucky or unlucky turn can dominate.
//
// It is deliberately unflattering. The AI's HIT_BOOST_FACTOR (100 per covered
// unresolved hit) means that once a ship is wounded, any cell that cannot
// complete it scores on the order of 1e-2 to 1e-4 of the best cell. So failing
// to follow up a hit costs almost the entire turn. That is the right verdict —
// wandering off after a hit is the single most expensive mistake in
// Battleship — but it does mean scores are harsh, and a mid-table human lands
// nearer 0.4-0.6 than 0.8. The number is calibrated against a perfect Bayesian
// searcher, not against other humans.
//
// SKIPPED TURNS
// -------------
// A turn is not graded (and cannot lower the score) when no meaningful choice
// existed:
//   - one or zero unattacked cells remain;
//   - the peak weight is zero (no ship placement is consistent with the shots
//     so far — the engine has no opinion, so neither do we);
//   - every unattacked cell carries identical weight (an unbroken board offers
//     no discrimination), in which case every choice is equally right.
// Skipped turns are still returned in `shots` with `graded: false`.

/**
 * Grades the human player's shots against the Bayesian-optimal choice
 * available at each turn.
 *
 * @param {object} state A finished (or in-progress) GameState. Not mutated.
 * @returns {{shots: object[], score: number, totalShots: number,
 *            gradedShots: number, matchedBest: number, worstShots: object[]}}
 */
export function gradePlayerShots(state) {
  const empty = {
    shots: [],
    score: 1,
    totalShots: 0,
    gradedShots: 0,
    matchedBest: 0,
    worstShots: [],
  };
  if (!state || !state.aiBoard || !Array.isArray(state.history)) return empty;

  const playerShots = state.history.filter(
    (h) => h && h.actor === "player" && h.cell && h.result !== "no-op"
  );
  if (playerShots.length === 0) return empty;

  const size = state.aiBoard.size ?? BOARD_SIZE;
  const shots = [];
  let ratioSum = 0;
  let gradedShots = 0;
  let matchedBest = 0;

  for (let i = 0; i < playerShots.length; i++) {
    const entry = playerShots[i];
    // Only the turns strictly before this one — the reconstruction boundary.
    const mirror = mirrorStateAt(state, playerShots.slice(0, i));
    const grid = computeProbabilityMap(mirror);
    const shotsReceived = mirror.playerBoard.shotsReceived;
    const { total, best, worst, bestCell, available } = summariseGrid(
      grid,
      shotsReceived,
      size
    );

    const chosen = grid[entry.cell.row]?.[entry.cell.col] ?? 0;
    const meaningful = available > 1 && best > 0 && best !== worst;

    // rank 1 = the player took a joint-best cell.
    let rank = 1;
    if (total > 0) {
      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          if (shotsReceived.has(key(row, col))) continue;
          if ((grid[row]?.[col] ?? 0) > chosen) rank++;
        }
      }
    }

    const probability = total > 0 ? chosen / total : 0;
    const bestProbability = total > 0 ? best / total : 0;
    const record = {
      turnNumber: entry.turnNumber,
      cell: { row: entry.cell.row, col: entry.cell.col },
      result: entry.result,
      probability,
      bestProbability,
      bestCell: bestCell ? { row: bestCell.row, col: bestCell.col } : null,
      rank,
      graded: meaningful,
      // How much probability mass the choice gave up. Used to rank `worstShots`.
      cost: meaningful ? bestProbability - probability : 0,
      choicesAvailable: available,
    };
    shots.push(record);

    if (meaningful) {
      gradedShots++;
      ratioSum += chosen / best;
      if (rank === 1) matchedBest++;
    }
  }

  // No gradeable turn ever occurred, so there was nothing to get wrong.
  // Vacuously perfect rather than vacuously terrible; `formatCoachReport`
  // says so in words instead of printing a meaningless percentage.
  const score = gradedShots > 0 ? ratioSum / gradedShots : 1;

  const worstShots = shots
    .filter((s) => s.graded)
    .sort((a, b) => b.cost - a.cost || a.turnNumber - b.turnNumber)
    .slice(0, 3);

  return {
    shots,
    score,
    totalShots: playerShots.length,
    gradedShots,
    matchedBest,
    worstShots,
  };
}

// ---------------------------------------------------------------------------
// Prose summary
// ---------------------------------------------------------------------------

function pct(x) {
  if (!Number.isFinite(x) || x <= 0) return "0%";
  const p = x * 100;
  if (p < 0.05) return "<0.1%";
  if (p < 0.5) return `${p.toFixed(1)}%`;
  return `${Math.round(p)}%`;
}

function verdict(score) {
  if (score >= 0.9) return "That is very close to machine play.";
  if (score >= 0.7) return "Sound hunting, with a handful of wasted salvos.";
  if (score >= 0.45)
    return "Middling — you left a good deal of information on the table.";
  if (score >= 0.2)
    return "That is well below what the board was telling you at the time.";
  return "That is barely distinguishable from firing blind.";
}

/**
 * Three or four sentences of plain-language assessment. Deliberately not
 * flattering: if the player fired badly, this says so.
 */
export function formatCoachReport(grade) {
  if (!grade || !grade.totalShots) {
    return "No shots to grade — the coach needs a completed engagement.";
  }
  if (!grade.gradedShots) {
    return (
      `You fired ${grade.totalShots} shot${grade.totalShots === 1 ? "" : "s"}, ` +
      "but none of them was a real decision — the board never offered a " +
      "meaningful choice, so there is nothing to grade."
    );
  }

  const sentences = [];
  sentences.push(
    `You fired ${grade.totalShots} shots and played at ${pct(grade.score)} of Bayesian-optimal.`
  );

  const worst = grade.worstShots[0];
  if (worst && worst.cost > 0.005) {
    sentences.push(
      `Your costliest shot was turn ${worst.turnNumber} at ${formatCell(worst.cell)} — ` +
        `a ${pct(worst.probability)} cell when ${formatCell(worst.bestCell)} offered ` +
        `${pct(worst.bestProbability)}.`
    );
  } else if (grade.score >= 0.995) {
    sentences.push("You never left a better target sitting on the board.");
  } else {
    sentences.push(
      "No single shot stands out as a blunder — where you lost ground, you lost it evenly."
    );
  }

  const denominator =
    grade.gradedShots === grade.totalShots
      ? `${grade.totalShots} turns`
      : `${grade.gradedShots} turns that offered a real choice ` +
        `(of ${grade.totalShots})`;
  sentences.push(
    `You matched the optimal target on ${grade.matchedBest} of ${denominator}.`
  );

  sentences.push(verdict(grade.score));

  return sentences.join(" ");
}
