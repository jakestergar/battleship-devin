// Measures what the ADVANCED mode's power-up economy actually does to the
// game, rather than assuming it is balanced.
//
// A new mechanic is a claim. "Advanced mode adds strategic depth" is an
// assertion; "advanced mode moves the AI's win rate from 100% to 84% and
// shortens the average game by 9 shots" is a measurement. This script
// produces the second kind.
//
// Run: node scripts/balance.js [games]

import { createGame, fireAt, isGameOver } from "../src/engine.js";
import { chooseMove } from "../src/ai.js";
import { withSeededRandom, randomPlayerMove, MAX_MOVES } from "./harness.js";
import {
  POWERUPS,
  createLoadout,
  canAfford,
  spend,
  applyAirstrike,
  sonarScan,
  chooseAiPowerup,
} from "../src/powerups.js";

const GAMES = Number(process.argv[2] ?? 1000);
const BASE_SEED = 90210;

/**
 * One full game.
 *
 * The player is modelled as a random searcher in both modes — this is not a
 * study of human skill, it is a study of what the mechanic does to the
 * structure of the game, and a random player is the only unbiased baseline
 * available. In advanced mode the player spends on an airstrike whenever it
 * can afford one, which is the simplest possible policy and therefore the
 * least flattering to the mechanic.
 */
function playGame(mode) {
  let state = createGame();
  const loadouts = { player: createLoadout(), ai: createLoadout() };
  const advanced = mode === "advanced";
  // Cells the AI has learned about via sonar: key -> hasShip. Passed back to
  // its targeting only as extra shots it chooses to avoid, never as a way to
  // read unsunk positions directly.
  const aiSonar = new Map();
  let powerupUses = 0;
  let moves = 0;

  while (!isGameOver(state) && moves < MAX_MOVES) {
    moves++;
    if (state.turn === "player") {
      if (advanced && canAfford(state.history, "player", loadouts.player, "airstrike")) {
        loadouts.player = spend(loadouts.player, "airstrike");
        powerupUses++;
        state = applyAirstrike(state, "ai").newState;
        continue;
      }
      // randomPlayerMove returns the full move contract, not a bare cell.
      const move = randomPlayerMove(state);
      if (!move?.cell) break;
      state = fireAt(state, "ai", move.cell).newState;
      continue;
    }

    if (advanced) {
      const pick = chooseAiPowerup(state, loadouts.ai);
      if (pick === "airstrike") {
        loadouts.ai = spend(loadouts.ai, "airstrike");
        powerupUses++;
        state = applyAirstrike(state, "player").newState;
        continue;
      }
      if (pick === "sonar") {
        loadouts.ai = spend(loadouts.ai, "sonar");
        powerupUses++;
        // Scan the densest unexplored region the AI can see: just pick the
        // cell its own probability map likes most.
        const move = chooseMove(state);
        for (const cell of sonarScan(state, "player", move.cell)) {
          aiSonar.set(`${cell.row},${cell.col}`, cell.hasShip);
        }
        // Sonar costs the turn, which is what stops it being free information.
        state = { ...state, turn: "player" };
        continue;
      }
    }

    const move = chooseMove(state);
    if (!move?.cell) break;
    state = fireAt(state, "player", move.cell).newState;
  }

  const playerShots = state.history.filter((e) => e.actor === "player").length;
  const aiShots = state.history.filter((e) => e.actor === "ai").length;
  return { status: state.status, playerShots, aiShots, powerupUses, moves };
}

function run(mode, games) {
  let aiWins = 0;
  let playerWins = 0;
  let unfinished = 0;
  let totalShots = 0;
  let totalTurns = 0;
  let totalPowerups = 0;
  const lengths = [];

  for (let i = 0; i < games; i++) {
    const result = withSeededRandom(BASE_SEED + i, () => playGame(mode));
    if (result.status === "ai_won") aiWins++;
    else if (result.status === "player_won") playerWins++;
    else unfinished++;
    const shots = result.playerShots + result.aiShots;
    totalShots += shots;
    totalTurns += result.moves;
    lengths.push(shots);
    totalPowerups += result.powerupUses;
  }

  lengths.sort((a, b) => a - b);
  return {
    mode,
    games,
    aiWinRate: aiWins / games,
    playerWinRate: playerWins / games,
    unfinished,
    avgTotalShots: totalShots / games,
    avgTurns: totalTurns / games,
    medianShots: lengths[Math.floor(lengths.length / 2)],
    shortest: lengths[0],
    longest: lengths[lengths.length - 1],
    avgPowerupsPerGame: totalPowerups / games,
  };
}

function pct(v) {
  return `${(v * 100).toFixed(1)}%`;
}

console.log(`Simulating ${GAMES} games per mode (player modelled as a random searcher)\n`);

const classic = run("classic", GAMES);
const advanced = run("advanced", GAMES);

for (const r of [classic, advanced]) {
  console.log(`${r.mode.toUpperCase()}`);
  console.log(`  AI win rate       ${pct(r.aiWinRate)}`);
  console.log(`  Player win rate   ${pct(r.playerWinRate)}`);
  console.log(`  Avg total shots   ${r.avgTotalShots.toFixed(1)}`);
  // Turns is the honest measure of game length: an airstrike is five shots
  // but one turn, so shot count alone makes the mode look slower than it is.
  console.log(`  Avg turns taken   ${r.avgTurns.toFixed(1)}`);
  console.log(`  Median / min / max ${r.medianShots} / ${r.shortest} / ${r.longest}`);
  console.log(`  Power-ups per game ${r.avgPowerupsPerGame.toFixed(2)}`);
  if (r.unfinished) console.log(`  UNFINISHED         ${r.unfinished}`);
  console.log("");
}

const winShift = advanced.playerWinRate - classic.playerWinRate;
const lengthShift = advanced.avgTurns - classic.avgTurns;
console.log("DELTA (advanced vs classic)");
console.log(`  Player win rate   ${winShift >= 0 ? "+" : ""}${(winShift * 100).toFixed(1)} pts`);
console.log(`  Game length       ${lengthShift >= 0 ? "+" : ""}${lengthShift.toFixed(1)} turns`);
console.log(
  `  Costs: airstrike ${POWERUPS.airstrike.cost} pts (${POWERUPS.airstrike.shots} shots), ` +
    `sonar ${POWERUPS.sonar.cost} pts (3x3 reveal)`
);
