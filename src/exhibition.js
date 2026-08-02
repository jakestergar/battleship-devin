// AI vs AI exhibition match.
//
// Two instances of the Bayesian Search Theory AI play a full game against
// each other at speed, with BOTH probability-density heatmaps rendered live,
// side by side, so a viewer can watch each AI's reasoning converge on the
// other's fleet.
//
// Hard rules this module holds itself to:
//   * It reimplements no game rule. Every shot goes through `engine.fireAt`
//     and every decision through `ai.chooseMove`, exactly as the human game
//     does.
//   * It owns its own `GameState` entirely. `engine.fireAt` is pure, and the
//     one derived object this module builds (`mirrorView`) is a shallow,
//     read-only wrapper — nothing passed in from outside is ever mutated.
//   * Every timer it creates is registered in a module-level set and is
//     cancelled by `stop()`/`destroy()`. `activeTimerCount()` exists so this
//     can be asserted from a test or a console, because "a stray interval
//     running behind the real game" is the obvious failure mode here.
//   * It renders only inside the container it is handed, using its own
//     injected stylesheet and its own board elements. It never touches the
//     human game's DOM.
//   * It makes no sound. `src/audio.js` belongs to the main game; an
//     autoplaying match stays silent.
//
// See planning/session-briefs/06-exhibition-brief.md.

import {
  BOARD_SIZE,
  createGame,
  fireAt,
  isGameOver,
  randomFleetLayout,
} from "./engine.js";
import { chooseMove } from "./ai.js";
import { normalizeProbabilityMap } from "./ui.js";

/**
 * Wall-clock delay between consecutive shots. The single tuning knob for the
 * whole exhibition: low enough to finish a ~90-shot match in well under 30
 * seconds, high enough that a human can follow the heatmap converging.
 */
export const STEP_MS = 170;

/** Belt-and-braces cap so a pathological match can never run forever. */
export const MAX_TURNS = BOARD_SIZE * BOARD_SIZE * 2;

export const SIDES = {
  alpha: { id: "alpha", name: "ALPHA", target: "ai", opponent: "bravo" },
  bravo: { id: "bravo", name: "BRAVO", target: "player", opponent: "alpha" },
};

// ---------------------------------------------------------------------------
// Timer discipline
// ---------------------------------------------------------------------------

const liveTimers = new Set();

function schedule(fn, ms) {
  const id = setTimeout(() => {
    liveTimers.delete(id);
    fn();
  }, ms);
  liveTimers.add(id);
  return id;
}

function cancel(id) {
  if (id === null || id === undefined) return;
  clearTimeout(id);
  liveTimers.delete(id);
}

/**
 * How many exhibition timers are currently outstanding, across every mounted
 * instance. Must be 0 whenever no match is running. Exported so a test — or a
 * reviewer in the console — can prove the mode leaks nothing on the way out.
 */
export function activeTimerCount() {
  return liveTimers.size;
}

// ---------------------------------------------------------------------------
// Match logic (DOM-free, so it can be tested headlessly)
// ---------------------------------------------------------------------------

/**
 * `ai.chooseMove` is written from one seat: it always attacks
 * `state.playerBoard` and treats history entries with `actor === "ai"` as its
 * own shots. To let a second AI attack the other board without touching that
 * contract, hand it a *mirrored view* — the same state with the two boards
 * and the two actor labels swapped.
 *
 * Pure and shallow: boards are shared by reference (the AI only reads them)
 * and history entries are copied, so the input state is never mutated.
 */
export function mirrorView(state) {
  return {
    playerBoard: state.aiBoard,
    aiBoard: state.playerBoard,
    turn: state.turn === "player" ? "ai" : "player",
    status: state.status,
    history: state.history.map((h) => ({
      ...h,
      actor: h.actor === "player" ? "ai" : "player",
    })),
  };
}

/**
 * A fresh two-AI game. Both fleets come from `engine.randomFleetLayout`:
 * ALPHA's is handed to `createGame` explicitly, BRAVO's fills the board
 * `createGame` always randomises.
 *
 * ALPHA occupies the engine's "player" seat and shoots at `aiBoard`;
 * BRAVO occupies the "ai" seat and shoots at `playerBoard`.
 */
export function createExhibitionState() {
  return createGame(randomFleetLayout(BOARD_SIZE));
}

/**
 * Which side is about to move, given the engine's turn flag.
 */
function sideForTurn(turn) {
  return turn === "player" ? SIDES.alpha : SIDES.bravo;
}

/**
 * Drives one AI-vs-AI game, one shot per `step()`. Owns its own state; the
 * optional `initialState` is only ever read (engine functions are pure and
 * `mirrorView` copies what it relabels).
 */
export function createExhibitionMatch({ initialState = null } = {}) {
  let state = initialState ?? createExhibitionState();
  const shots = { alpha: 0, bravo: 0 };
  const maps = { alpha: null, bravo: null };
  const moves = { alpha: null, bravo: null };
  const log = [];

  function winner() {
    if (state.status === "player_won") return "alpha";
    if (state.status === "ai_won") return "bravo";
    return null;
  }

  /**
   * Takes exactly one shot. Returns the record of what happened, or `null`
   * once the match is over (or if the AI somehow has nothing legal to play,
   * which the caller treats as "stop", never as "guess a cell").
   */
  function step() {
    if (isGameOver(state) || log.length >= MAX_TURNS) return null;

    const side = sideForTurn(state.turn);
    const view = side.id === "alpha" ? mirrorView(state) : state;
    const move = chooseMove(view);
    if (!move || !move.cell) return null;

    const { newState, result } = fireAt(state, side.target, move.cell);
    // `fireAt` no-ops on a repeat shot rather than throwing. If that ever
    // happens the AI has broken its own contract, so stop rather than spin.
    if (result === "no-op") return null;

    state = newState;
    shots[side.id] += 1;
    maps[side.id] = move.probabilityMap ?? null;

    const entry = state.history[state.history.length - 1] ?? null;
    const record = {
      turnNumber: log.length + 1,
      side: side.id,
      cell: { ...move.cell },
      result,
      shipId: entry ? entry.shipId : null,
      confidence: move.confidence ?? null,
      explanation: move.explanation ?? null,
      probabilityMap: move.probabilityMap ?? null,
    };
    moves[side.id] = record;
    log.push(record);
    return record;
  }

  return {
    step,
    log,
    get state() {
      return state;
    },
    get shots() {
      return { ...shots };
    },
    /** Latest probability map each side decided from, keyed by attacker. */
    get maps() {
      return { ...maps };
    },
    /** Latest move record each side played, keyed by attacker. */
    get moves() {
      return { ...moves };
    },
    get winner() {
      return winner();
    },
    get over() {
      return isGameOver(state) || log.length >= MAX_TURNS;
    },
    get nextSide() {
      return sideForTurn(state.turn).id;
    },
  };
}

/**
 * Runs a whole match to completion with no timers and no DOM — the headless
 * form used by the tests (and handy for the playtest harness).
 */
export function runExhibitionMatch(options = {}) {
  const match = createExhibitionMatch(options);
  while (!match.over) {
    if (!match.step()) break;
  }
  return {
    winner: match.winner,
    shots: match.shots,
    log: match.log,
    state: match.state,
  };
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

/** Ceiling on a heat tile's alpha, so the hull underneath still reads. */
export const HEAT_MAX_OPACITY = 0.66;

/** How much of the shaped intensity comes from rank vs. raw magnitude. */
const RANK_SHARE = 0.6;

/**
 * Turns a 0-1 probability grid into 0-1 *display* intensities.
 *
 * Straight linear alpha does not work for this map, and it matters enough to
 * be worth spelling out. `ai.js` multiplies a placement's weight by
 * `HIT_BOOST_FACTOR ** hitsCovered`, so the moment either AI lands a hit the
 * peak is 100x-10,000x everything else: normalising against it renders one
 * bright cell on a black field and the viewer sees no reasoning at all.
 * Conversely, before any hit, the density is nearly flat and linear alpha
 * renders an even green wash.
 *
 * So blend two views of the same grid: a rank (histogram-equalisation) term,
 * which always spends the full brightness range on whatever spread exists,
 * and the raw normalised value, which keeps the true peak at full intensity.
 * The result reads as terrain before a hit and as a spotlight after one.
 *
 * Pure — exported so this can be asserted without a browser.
 */
export function shapeIntensities(intensities) {
  const distinct = new Set();
  for (const row of intensities) {
    for (const v of row) if (v > 0) distinct.add(v);
  }
  const sorted = [...distinct].sort((a, b) => a - b);
  const span = sorted.length - 1;
  const rank = new Map(sorted.map((v, i) => [v, span > 0 ? i / span : 1]));

  return intensities.map((row) =>
    row.map((v) => {
      if (v <= 0) return 0;
      const r = rank.get(v) ?? 0;
      // Gamma on the rank term keeps the low end dark so the bright cells
      // still stand out; the raw term guarantees the true peak reaches 1.
      return Math.min(1, RANK_SHARE * r ** 1.6 + (1 - RANK_SHARE) * v + 0.08);
    })
  );
}

const STYLE_ID = "exhibition-styles";

const STYLES = `
#exhibition-root {
  position: fixed;
  inset: 0;
  z-index: 90;
  pointer-events: none;
}
#exhibition-root > * { pointer-events: auto; }

.exh-launch {
  position: fixed;
  right: 18px;
  bottom: 18px;
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 9px 15px;
  border: 1px solid var(--brass-dim);
  border-radius: 999px;
  background: rgba(22, 40, 59, 0.94);
  color: var(--brass);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  cursor: pointer;
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.5);
  transition: color 160ms ease, border-color 160ms ease, transform 160ms ease;
}
.exh-launch:hover {
  color: var(--phosphor);
  border-color: var(--phosphor);
  transform: translateY(-1px);
}
.exh-launch[disabled] { opacity: 0.5; cursor: not-allowed; }
.exh-launch .exh-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--phosphor);
  box-shadow: 0 0 8px var(--phosphor);
  animation: exh-breathe 2.4s ease-in-out infinite;
}
@keyframes exh-breathe { 0%,100% { opacity: 0.35; } 50% { opacity: 1; } }

.exh-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 14px 18px;
  background:
    radial-gradient(circle at 18% 0%, rgba(58, 219, 118, 0.1), transparent 55%),
    radial-gradient(circle at 82% 100%, rgba(201, 154, 62, 0.08), transparent 55%),
    #050a11;
  animation: exh-fade 220ms ease both;
}
.exh-overlay[hidden] { display: none; }
@keyframes exh-fade { from { opacity: 0; } to { opacity: 1; } }

.exh-shell {
  --exh-cell: min(36px, calc((100vh - 250px) / 10), calc((100vw - 440px) / 20));
  --exh-gap: 3px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 1440px;
  max-height: 100%;
}

.exh-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid rgba(201, 154, 62, 0.28);
  padding-bottom: 9px;
}
.exh-head h2 {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 900;
  font-size: clamp(22px, 3.4vh, 34px);
  line-height: 0.95;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--fog);
}
.exh-head h2 em { font-style: normal; color: var(--phosphor); }
.exh-tagline {
  margin: 0;
  flex: 1 1 auto;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--fog-dim);
}
.exh-close {
  border: 1px solid rgba(220, 230, 235, 0.22);
  border-radius: 3px;
  background: transparent;
  color: var(--fog-dim);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  padding: 7px 12px;
  cursor: pointer;
  white-space: nowrap;
}
.exh-close:hover { color: var(--fog); border-color: var(--fog-dim); }

.exh-arena {
  display: grid;
  grid-template-columns: max-content minmax(190px, 1fr) max-content;
  gap: 18px;
  align-items: start;
  justify-content: center;
  min-height: 0;
}

.exh-side { display: flex; flex-direction: column; gap: 7px; }
.exh-side-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.exh-side-name {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 19px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--brass);
}
.exh-side.is-acting .exh-side-name { color: var(--phosphor); }
.exh-side-shots {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  color: var(--fog-dim);
}
.exh-side-shots b { color: var(--fog); font-weight: 500; }
.exh-side-sub {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  color: var(--phosphor-dim);
}

.exh-stack { position: relative; width: max-content; }
.exh-board {
  display: grid;
  grid-template-columns: repeat(10, var(--exh-cell));
  grid-template-rows: repeat(10, var(--exh-cell));
  gap: var(--exh-gap);
  padding: 8px;
  border: 1px solid var(--phosphor-dim);
  border-radius: 4px;
  background: var(--abyss);
  box-shadow: inset 0 0 40px rgba(0, 0, 0, 0.5);
}
.exh-side.is-acting .exh-board { border-color: var(--phosphor); }

.exh-cell {
  position: relative;
  border: 1px solid rgba(58, 219, 118, 0.13);
  border-radius: 2px;
  background: var(--hull);
}
/* Hulls are shown: the whole point is watching the heat find them. Brass
   means ownership, so hulls are brass and stay quiet under the overlay. */
.exh-cell.is-ship {
  background: rgba(201, 154, 62, 0.4);
  border-color: var(--brass);
}
.exh-cell.is-miss::after {
  content: "";
  position: absolute;
  inset: 0;
  margin: auto;
  width: 5px; height: 5px;
  border-radius: 50%;
  background: var(--fog-dim);
  opacity: 0.65;
}
.exh-cell.is-hit {
  background: rgba(232, 67, 46, 0.3);
  border-color: var(--klaxon);
}
.exh-cell.is-hit::after {
  content: "\\2715";
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: calc(var(--exh-cell) * 0.5);
  font-weight: 700;
  color: var(--klaxon);
}
.exh-cell.is-sunk {
  background: rgba(232, 67, 46, 0.55);
  border-color: var(--klaxon-hot);
}
.exh-cell.is-sunk::after { color: var(--klaxon-hot); }
.exh-cell.is-latest {
  outline: 2px solid var(--phosphor);
  outline-offset: -1px;
  z-index: 6;
  animation: exh-ping 420ms ease-out;
}
@keyframes exh-ping {
  from { box-shadow: 0 0 0 0 rgba(58, 219, 118, 0.75); }
  to { box-shadow: 0 0 0 11px rgba(58, 219, 118, 0); }
}

.exh-heat {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: grid;
  grid-template-columns: repeat(10, var(--exh-cell));
  grid-template-rows: repeat(10, var(--exh-cell));
  gap: var(--exh-gap);
  padding: 8px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 220ms ease;
}
.exh-heat.is-visible { opacity: 1; }
/* Tiles are inset a little rather than edge-to-edge: the ring of bare cell
   left showing is what keeps the defender's hull and damage state readable
   underneath a dense field. */
.exh-heat-tile {
  border-radius: 2px;
  opacity: 0;
  transform: scale(0.86);
  background: radial-gradient(circle at 50% 40%, var(--phosphor), var(--phosphor-dim));
  transition: opacity 180ms linear;
}

.exh-centre {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-self: stretch;
  min-width: 0;
}
.exh-vs {
  text-align: center;
  font-family: var(--font-display);
  font-weight: 900;
  font-size: 26px;
  letter-spacing: 0.28em;
  color: var(--brass-dim);
}
.exh-panel {
  padding: 10px 12px;
  border: 1px solid rgba(220, 230, 235, 0.09);
  border-radius: 4px;
  background: var(--hull);
  min-width: 0;
}
.exh-panel h3 {
  margin: 0 0 7px;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--fog-dim);
}
.exh-reasoning {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.55;
  color: var(--fog);
  min-height: 4.6em;
}
.exh-reasoning .exh-who { color: var(--phosphor); }
.exh-meter-row {
  display: grid;
  grid-template-columns: 52px 1fr 40px;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  color: var(--fog-dim);
}
.exh-meter {
  height: 6px;
  border-radius: 3px;
  background: rgba(220, 230, 235, 0.09);
  overflow: hidden;
}
.exh-meter span {
  display: block;
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg, var(--phosphor-dim), var(--phosphor));
  transition: width 200ms ease;
}
.exh-tally {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fog);
}
.exh-tally th, .exh-tally td { padding: 2px 0; text-align: right; font-weight: 400; }
.exh-tally thead th {
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--fog-dim);
  border-bottom: 1px solid rgba(220, 230, 235, 0.09);
  padding-bottom: 4px;
}
.exh-tally tbody th {
  text-align: left;
  letter-spacing: 0.1em;
  color: var(--brass);
}

.exh-legend {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1.7;
  color: var(--fog-dim);
}
.exh-legend b { color: var(--phosphor); font-weight: 500; }
.exh-legend i { font-style: normal; color: var(--brass); }

.exh-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-top: 1px solid rgba(201, 154, 62, 0.22);
  padding-top: 9px;
}
.exh-verdict {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.06em;
  color: var(--phosphor);
  min-height: 1.3em;
}
.exh-verdict.is-idle { color: var(--fog-dim); }
.exh-verdict.is-error { color: var(--klaxon); }
.exh-controls { display: flex; gap: 8px; }
.exh-btn {
  border: 1px solid var(--phosphor-dim);
  border-radius: 3px;
  background: transparent;
  color: var(--phosphor);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  padding: 8px 14px;
  cursor: pointer;
  transition: background 160ms ease, color 160ms ease;
}
.exh-btn:hover { background: rgba(58, 219, 118, 0.12); }
.exh-btn-quiet { border-color: rgba(201, 154, 62, 0.4); color: var(--brass); }
.exh-btn-quiet:hover { background: rgba(201, 154, 62, 0.12); }

/* The cell size already shrinks with both viewport axes, so three columns keep
   fitting well below the width you'd guess. Only stack once they genuinely
   cannot — stacking is what makes the overlay taller than the screen. */
@media (max-width: 940px) {
  .exh-arena { grid-template-columns: max-content max-content; }
  .exh-centre { grid-column: 1 / -1; order: 3; }
  .exh-vs { display: none; }
}
`;

function ensureStyles(doc) {
  if (doc.getElementById(STYLE_ID)) return doc.getElementById(STYLE_ID);
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLES;
  doc.head.appendChild(style);
  return style;
}

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function buildSide(doc, side, opponentName) {
  const root = el(doc, "section", "exh-side");
  root.dataset.side = side.id;

  const head = el(doc, "div", "exh-side-head");
  const name = el(doc, "span", "exh-side-name", `${side.name} fleet`);
  const shots = el(doc, "span", "exh-side-shots");
  shots.innerHTML = `<b>0</b> shots by ${opponentName}`;
  head.append(name, shots);

  const sub = el(
    doc,
    "p",
    "exh-side-sub",
    `heat = ${opponentName}'s probability density`
  );

  const stack = el(doc, "div", "exh-stack");
  const board = el(doc, "div", "exh-board");
  board.setAttribute("role", "img");
  board.setAttribute("aria-label", `${side.name}'s fleet under fire`);
  const cells = [];
  for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i++) {
    const cell = el(doc, "div", "exh-cell");
    cells.push(cell);
    board.appendChild(cell);
  }
  const heat = el(doc, "div", "exh-heat");
  heat.setAttribute("aria-hidden", "true");
  const tiles = [];
  for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i++) {
    const tile = el(doc, "div", "exh-heat-tile");
    tiles.push(tile);
    heat.appendChild(tile);
  }
  stack.append(board, heat);
  root.append(head, sub, stack);

  return { root, shots, cells, tiles, heat };
}

/**
 * Mounts the exhibition control + overlay inside `rootEl`.
 *
 * Returns `{ start(), stop(), destroy() }`. Never throws: if anything about
 * the environment or the build is unusable, it logs, leaves a disabled
 * control (or nothing at all), and returns an inert controller, so the human
 * game behind it stays fully playable — per PRD Section 5.
 */
export function mountExhibition(rootEl) {
  const inert = {
    start() {},
    stop() {},
    destroy() {},
    get running() {
      return false;
    },
  };

  try {
    if (!rootEl || typeof rootEl.appendChild !== "function") return inert;
    const doc = rootEl.ownerDocument;
    if (!doc) return inert;

    ensureStyles(doc);
    rootEl.textContent = "";

    // ---- Launch control -----------------------------------------------
    const launch = el(doc, "button", "exh-launch");
    launch.type = "button";
    launch.append(el(doc, "span", "exh-dot"), el(doc, "span", null, "AI vs AI"));
    launch.title = "Watch two Bayesian Search Theory AIs play each other";

    // ---- Overlay --------------------------------------------------------
    const overlay = el(doc, "div", "exh-overlay");
    overlay.hidden = true;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "AI versus AI exhibition match");

    const shell = el(doc, "div", "exh-shell");

    const head = el(doc, "div", "exh-head");
    const title = el(doc, "h2");
    title.innerHTML = "Exhibition &mdash; <em>AI vs AI</em>";
    const tagline = el(
      doc,
      "p",
      "exh-tagline",
      "Two Bayesian Search Theory engines, each blind to the other's fleet. The green field over each board is the attacker's live probability density."
    );
    const close = el(doc, "button", "exh-close", "Close \u2715");
    close.type = "button";
    head.append(title, tagline, close);

    const arena = el(doc, "div", "exh-arena");
    const alpha = buildSide(doc, SIDES.alpha, SIDES.bravo.name);
    const bravo = buildSide(doc, SIDES.bravo, SIDES.alpha.name);

    const centre = el(doc, "div", "exh-centre");
    const vs = el(doc, "div", "exh-vs", "VS");

    const reasonPanel = el(doc, "div", "exh-panel");
    reasonPanel.append(el(doc, "h3", null, "Latest reasoning"));
    const reasoning = el(
      doc,
      "p",
      "exh-reasoning",
      "Press Run to begin. Each engine enumerates every ship placement still consistent with what it has been told, and fires at the cell the most of them pass through."
    );
    reasonPanel.append(reasoning);

    const meterPanel = el(doc, "div", "exh-panel");
    meterPanel.append(el(doc, "h3", null, "Decision confidence"));
    const meters = {};
    for (const side of [SIDES.alpha, SIDES.bravo]) {
      const row = el(doc, "div", "exh-meter-row");
      const label = el(doc, "span", null, side.name);
      const bar = el(doc, "div", "exh-meter");
      const fill = el(doc, "span");
      bar.appendChild(fill);
      const value = el(doc, "span", null, "\u2014");
      row.append(label, bar, value);
      meterPanel.appendChild(row);
      meters[side.id] = { fill, value };
    }

    const legendPanel = el(doc, "div", "exh-panel");
    legendPanel.append(el(doc, "h3", null, "Reading the board"));
    const legend = el(doc, "p", "exh-legend");
    legend.innerHTML =
      "<b>Green field</b> &mdash; where the attacker believes ships are.<br />" +
      "<i>Brass cells</i> &mdash; the defender's real hulls.<br />" +
      "<b>&#10005;</b> &mdash; a hit. Watch the field collapse around it.";
    legendPanel.append(legend);

    const tallyPanel = el(doc, "div", "exh-panel");
    tallyPanel.append(el(doc, "h3", null, "Tally"));
    const tally = el(doc, "table", "exh-tally");
    tally.innerHTML =
      "<thead><tr><th></th><th>shots</th><th>hits</th><th>acc.</th></tr></thead>" +
      "<tbody>" +
      "<tr data-row='alpha'><th>ALPHA</th><td>0</td><td>0</td><td>&mdash;</td></tr>" +
      "<tr data-row='bravo'><th>BRAVO</th><td>0</td><td>0</td><td>&mdash;</td></tr>" +
      "</tbody>";
    tallyPanel.append(tally);
    const tallyRows = {
      alpha: tally.querySelector("tr[data-row='alpha']"),
      bravo: tally.querySelector("tr[data-row='bravo']"),
    };

    centre.append(vs, reasonPanel, meterPanel, tallyPanel, legendPanel);
    arena.append(alpha.root, centre, bravo.root);

    const foot = el(doc, "div", "exh-foot");
    const verdict = el(doc, "p", "exh-verdict is-idle", "Standing by.");
    const controls = el(doc, "div", "exh-controls");
    const runBtn = el(doc, "button", "exh-btn", "Run match");
    runBtn.type = "button";
    const rematchBtn = el(doc, "button", "exh-btn exh-btn-quiet", "Rematch");
    rematchBtn.type = "button";
    controls.append(runBtn, rematchBtn);
    foot.append(verdict, controls);

    shell.append(head, arena, foot);
    overlay.appendChild(shell);
    rootEl.append(launch, overlay);

    // ---- Runtime state ---------------------------------------------------
    const panes = { alpha, bravo };
    let match = null;
    let timer = null;
    let running = false;
    let destroyed = false;

    function clearTimer() {
      cancel(timer);
      timer = null;
    }

    function paintBoard(pane, board, latestCell) {
      const shipKeys = new Set();
      const sunkKeys = new Set();
      for (const ship of board.ships) {
        for (const c of ship.cells) {
          shipKeys.add(`${c.row},${c.col}`);
          if (ship.sunk) sunkKeys.add(`${c.row},${c.col}`);
        }
      }
      for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
          const k = `${row},${col}`;
          const cell = pane.cells[row * BOARD_SIZE + col];
          if (!cell) continue;
          const shot = board.shotsReceived.has(k);
          const ship = shipKeys.has(k);
          cell.classList.toggle("is-ship", ship && !shot);
          cell.classList.toggle("is-miss", shot && !ship);
          cell.classList.toggle("is-hit", shot && ship);
          cell.classList.toggle("is-sunk", shot && sunkKeys.has(k));
          const isLatest =
            latestCell && latestCell.row === row && latestCell.col === col;
          if (isLatest && !cell.classList.contains("is-latest")) {
            cell.classList.add("is-latest");
          } else if (!isLatest) {
            cell.classList.remove("is-latest");
          }
        }
      }
    }

    function paintHeat(pane, map) {
      const intensities = normalizeProbabilityMap(map, BOARD_SIZE);
      if (!intensities) {
        pane.heat.classList.remove("is-visible");
        return;
      }
      const shaped = shapeIntensities(intensities);
      for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
          const tile = pane.tiles[row * BOARD_SIZE + col];
          if (!tile) continue;
          const v = shaped[row][col];
          tile.style.opacity = v === 0 ? "0" : (v * HEAT_MAX_OPACITY).toFixed(3);
        }
      }
      pane.heat.classList.add("is-visible");
    }

    function renderMove(record) {
      if (!record) return;
      const side = SIDES[record.side];
      const defender = SIDES[side.opponent];
      // A side attacks its opponent's board, so the heat for `record.side`
      // belongs on the *opponent's* pane.
      paintHeat(panes[defender.id], record.probabilityMap);
      const coord = `${String.fromCharCode(65 + record.cell.row)}${record.cell.col + 1}`;
      const outcome =
        record.result === "sunk"
          ? `SUNK ${(record.shipId || "a vessel").toUpperCase()}`
          : record.result.toUpperCase();
      reasoning.innerHTML = "";
      const who = el(doc, "span", "exh-who", `${side.name} \u2192 ${coord} \u00b7 ${outcome}. `);
      reasoning.append(who, doc.createTextNode(record.explanation || ""));

      const meter = meters[record.side];
      if (meter) {
        const pct = Math.max(0, Math.min(1, record.confidence ?? 0));
        meter.fill.style.width = `${(pct * 100).toFixed(1)}%`;
        meter.value.textContent = `${Math.round(pct * 100)}%`;
      }
    }

    function renderFrame() {
      if (!match) return;
      const state = match.state;
      const moves = match.moves;
      paintBoard(panes.alpha, state.playerBoard, moves.bravo && moves.bravo.cell);
      paintBoard(panes.bravo, state.aiBoard, moves.alpha && moves.alpha.cell);
      const shots = match.shots;
      panes.alpha.shots.innerHTML = `<b>${shots.bravo}</b> shots by ${SIDES.bravo.name}`;
      panes.bravo.shots.innerHTML = `<b>${shots.alpha}</b> shots by ${SIDES.alpha.name}`;
      for (const id of ["alpha", "bravo"]) {
        const row = tallyRows[id];
        if (!row) continue;
        const fired = match.log.filter((r) => r.side === id);
        const hits = fired.filter((r) => r.result !== "miss").length;
        const cells = row.children;
        cells[1].textContent = String(fired.length);
        cells[2].textContent = String(hits);
        cells[3].textContent = fired.length
          ? `${Math.round((hits / fired.length) * 100)}%`
          : "\u2014";
      }

      const acting = running && !match.over ? match.nextSide : null;
      alpha.root.classList.toggle("is-acting", acting === "alpha");
      bravo.root.classList.toggle("is-acting", acting === "bravo");
    }

    function announce(text, kind = "") {
      verdict.textContent = text;
      verdict.className = `exh-verdict${kind ? ` ${kind}` : ""}`;
    }

    function finish() {
      running = false;
      clearTimer();
      runBtn.textContent = "Run match";
      alpha.root.classList.remove("is-acting");
      bravo.root.classList.remove("is-acting");
      if (!match) return;
      const w = match.winner;
      const shots = match.shots;
      if (w) {
        const loser = SIDES[SIDES[w].opponent];
        announce(
          `${SIDES[w].name} wins in ${shots[w]} shots \u00b7 ${loser.name} fired ${shots[loser.id]} \u00b7 ${match.log.length} shots total.`
        );
      } else {
        announce(
          `Match halted after ${match.log.length} shots \u2014 no winner.`,
          "is-error"
        );
      }
    }

    function tick() {
      timer = null;
      if (destroyed || !running || !match) return;
      let record = null;
      try {
        record = match.step();
      } catch (err) {
        console.warn("[exhibition] match step failed", err);
        running = false;
        announce("Exhibition mode hit an error and stopped.", "is-error");
        renderFrame();
        return;
      }
      if (!record) {
        renderFrame();
        finish();
        return;
      }
      renderMove(record);
      renderFrame();
      if (match.over) {
        finish();
        return;
      }
      timer = schedule(tick, STEP_MS);
    }

    function reset() {
      clearTimer();
      running = false;
      match = createExhibitionMatch();
      for (const pane of [panes.alpha, panes.bravo]) {
        pane.heat.classList.remove("is-visible");
        for (const tile of pane.tiles) tile.style.opacity = "0";
      }
      for (const id of Object.keys(meters)) {
        meters[id].fill.style.width = "0%";
        meters[id].value.textContent = "\u2014";
      }
      reasoning.textContent =
        "Press Run to begin. Each engine enumerates every ship placement still consistent with what it has been told, and fires at the cell the most of them pass through.";
      runBtn.textContent = "Run match";
      announce("Fleets deployed. Standing by.", "is-idle");
      renderFrame();
    }

    function start() {
      if (destroyed) return;
      if (!match || match.over) reset();
      if (running) return;
      running = true;
      runBtn.textContent = "Pause";
      announce("Match under way\u2026");
      renderFrame();
      clearTimer();
      timer = schedule(tick, STEP_MS);
    }

    function stop() {
      running = false;
      clearTimer();
      if (!destroyed) {
        runBtn.textContent = "Run match";
        alpha.root.classList.remove("is-acting");
        bravo.root.classList.remove("is-acting");
        if (match && !match.over) announce("Paused.", "is-idle");
      }
    }

    function open() {
      if (destroyed) return;
      overlay.hidden = false;
      launch.hidden = true;
      if (!match) reset();
      start();
    }

    function closeOverlay() {
      stop();
      overlay.hidden = true;
      launch.hidden = false;
      match = null; // drop the exhibition's GameState entirely on the way out
    }

    // ---- Listeners (all removed in destroy) ------------------------------
    const listeners = [];
    function on(target, type, handler) {
      target.addEventListener(type, handler);
      listeners.push([target, type, handler]);
    }

    on(launch, "click", open);
    on(close, "click", closeOverlay);
    on(runBtn, "click", () => (running ? stop() : start()));
    on(rematchBtn, "click", () => {
      reset();
      start();
    });
    on(doc, "keydown", (event) => {
      if (overlay.hidden) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeOverlay();
      }
    });
    // Don't burn CPU (or finish the match unseen) in a background tab.
    on(doc, "visibilitychange", () => {
      if (doc.hidden && running) stop();
    });

    function destroy() {
      destroyed = true;
      stop();
      clearTimer();
      match = null;
      for (const [target, type, handler] of listeners) {
        target.removeEventListener(type, handler);
      }
      listeners.length = 0;
      rootEl.textContent = "";
      const style = doc.getElementById(STYLE_ID);
      if (style && style.parentNode) style.parentNode.removeChild(style);
    }

    return {
      start: open,
      stop,
      destroy,
      get running() {
        return running;
      },
    };
  } catch (err) {
    console.warn("[exhibition] unavailable", err);
    try {
      if (rootEl) rootEl.textContent = "";
    } catch {
      /* nothing further to clean up */
    }
    return inert;
  }
}
