// Throwaway demo: plays a full game with a plausible *human* strategy
// (parity sweep + adjacent follow-up after a hit) against the real AI, then
// prints the coach's report. Not part of the deployed game.
//
//   node scripts/coach-sample.mjs [seed]

import { BOARD_SIZE, createGame, fireAt, isGameOver } from "../src/engine.js";
import { chooseMove } from "../src/ai.js";
import { formatCoachReport, gradePlayerShots, formatCell } from "../src/coach.js";

// Small deterministic PRNG so the sample is reproducible.
let seed = Number(process.argv[2] ?? 20240607);
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
Math.random = rnd;

const key = (r, c) => `${r},${c}`;

function humanPick(state) {
  const shot = state.aiBoard.shotsReceived;
  const sunkIds = new Set(
    state.history.filter((h) => h.actor === "player" && h.result === "sunk").map((h) => h.shipId)
  );
  // Unresolved hits: hits on ships the player hasn't sunk yet.
  const open = state.history.filter(
    (h) => h.actor === "player" && h.result === "hit" && !sunkIds.has(h.shipId)
  );
  const neighbours = [];
  for (const h of open) {
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const r = h.cell.row + dr;
      const c = h.cell.col + dc;
      if (r < 0 || c < 0 || r >= BOARD_SIZE || c >= BOARD_SIZE) continue;
      if (!shot.has(key(r, c))) neighbours.push({ row: r, col: c });
    }
  }
  if (neighbours.length) return neighbours[Math.floor(rnd() * neighbours.length)];

  const parity = [];
  const any = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (shot.has(key(r, c))) continue;
      any.push({ row: r, col: c });
      if ((r + c) % 2 === 0) parity.push({ row: r, col: c });
    }
  }
  const pool = parity.length ? parity : any;
  return pool[Math.floor(rnd() * pool.length)];
}

let state = createGame();
while (!isGameOver(state)) {
  if (state.turn === "player") {
    state = fireAt(state, "ai", humanPick(state)).newState;
  } else {
    state = fireAt(state, "player", chooseMove(state).cell).newState;
  }
}

const grade = gradePlayerShots(state);
console.log(`status: ${state.status}`);
console.log(`player shots: ${grade.totalShots}  graded: ${grade.gradedShots}`);
console.log(`score: ${grade.score.toFixed(4)}`);
console.log("");
console.log(formatCoachReport(grade));
console.log("");
console.log("costliest:");
for (const s of grade.worstShots) {
  console.log(
    `  turn ${s.turnNumber} ${formatCell(s.cell)} ` +
      `${(s.probability * 100).toFixed(2)}% vs best ${formatCell(s.bestCell)} ` +
      `${(s.bestProbability * 100).toFixed(2)}%  (rank ${s.rank})`
  );
}
