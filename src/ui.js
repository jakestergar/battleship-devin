// Rendering and input handling only. All game rules go through engine.js —
// nothing in here recomputes hit/miss/sunk/win logic.

import {
  BOARD_SIZE,
  FLEET,
  cellsForPlacement,
  createGame,
  fireAt,
  isGameOver,
  randomFleetLayout,
  validateFleetLayout,
} from "./engine.js";
import { chooseMove as realChooseMove } from "./ai.js";
import { attempt, reportError } from "./errors.js";
import { shipSvg } from "./ships.js";
import {
  initAudio,
  isMuted,
  playEffect,
  startMusic,
  toggleMuted,
} from "./audio.js";
import {
  fxExplosion,
  fxFire,
  hideReticle,
  klaxonFlash,
  launchMissile,
  positionReticle,
  spawnFx,
  spawnPing,
  triggerShake,
} from "./animations.js";

const HEATMAP_DWELL_MS = 650;
const RESULT_PAUSE_MS = 200;
const IMPACT_MS = 620;
const MISSILE_MS = 650;

function key(row, col) {
  return `${row},${col}`;
}

/**
 * Stand-in for the AI module's `chooseMove` until `src/ai.js` lands: picks a
 * uniformly random unattacked cell on the player's board. Returns the real
 * module's contract shape plus a `probabilityMap` (see notes at the
 * integration point below).
 */
export function mockChooseMove(state) {
  const board = state.playerBoard;
  const open = [];
  for (let row = 0; row < board.size; row++) {
    for (let col = 0; col < board.size; col++) {
      if (!board.shotsReceived.has(key(row, col))) open.push({ row, col });
    }
  }
  const cell = open[Math.floor(Math.random() * open.length)];
  const probabilityMap = open.length
    ? Array.from({ length: board.size }, (_, row) =>
        Array.from({ length: board.size }, (_, col) =>
          board.shotsReceived.has(key(row, col)) ? 0 : Math.random()
        )
      )
    : null;

  return {
    cell,
    confidence: 0.3 + Math.random() * 0.6,
    explanation: cell
      ? `[mock AI] Fired at (${cell.row},${cell.col}) — placeholder reasoning until src/ai.js lands.`
      : null,
    probabilityMap,
  };
}

/**
 * Normalizes a weight grid to 0-1 intensities for the heatmap overlay.
 * Returns `null` for anything that isn't a usable square grid of finite
 * numbers, so callers can silently skip rendering instead of guessing.
 */
export function normalizeProbabilityMap(map, size = BOARD_SIZE) {
  if (!Array.isArray(map) || map.length !== size) return null;
  let peak = 0;
  for (const row of map) {
    if (!Array.isArray(row) || row.length !== size) return null;
    for (const weight of row) {
      if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0) {
        return null;
      }
      if (weight > peak) peak = weight;
    }
  }
  if (peak === 0) return null;
  return map.map((row) => row.map((weight) => weight / peak));
}

/**
 * Whether `cells` can host a ship in an in-progress placement layout:
 * in-bounds and clear of every other ship (the ship being moved, `movingId`,
 * is ignored so a ship can slide over its own footprint).
 */
export function isPlacementLegal(layout, cells, size = BOARD_SIZE, movingId = null) {
  if (!Array.isArray(cells) || cells.length === 0) return false;
  if (
    !cells.every(
      (c) => c.row >= 0 && c.row < size && c.col >= 0 && c.col < size
    )
  ) {
    return false;
  }
  const taken = new Set();
  for (const ship of layout) {
    if (ship.id === movingId) continue;
    for (const cell of ship.cells) taken.add(key(cell.row, cell.col));
  }
  return cells.every((c) => !taken.has(key(c.row, c.col)));
}

const els = {};
let state = null;
let busy = false;
let explainOpen = false;
// Set when something the player needs to know about went wrong; owns the
// status line until the next action clears it.
let failureMessage = null;

/**
 * Reports a failure the player has to be told about: the console gets the
 * error, the status line gets `message`. Used for anything that breaks the
 * turn itself, as opposed to the decorative layers, which degrade quietly
 * (but still report) through `reportError`.
 */
function reportFailure(scope, error, message) {
  reportError(scope, error);
  failureMessage = message;
  attempt("ui: showing the failure message", renderStatusLine);
}

// Placement-phase state. The engine is only handed a layout once the player
// confirms it, so there is no "placing" game status to model in engine.js.
let phase = "placement";
let layout = [];
let orientation = "horizontal";
let selectedShipId = FLEET[0].id;
let placementMessage = "";

function cacheElements() {
  els.aiBoard = document.getElementById("ai-board");
  els.playerBoard = document.getElementById("player-board");
  els.heatmap = document.getElementById("heatmap");
  els.statusLine = document.getElementById("status-line");
  els.confidenceBar = document.getElementById("confidence-bar");
  els.confidenceValue = document.getElementById("confidence-value");
  els.explainPanel = document.getElementById("explain-panel");
  els.shotCount = document.getElementById("shot-count");
  els.yourFleet = document.getElementById("your-fleet");
  els.enemyFleet = document.getElementById("enemy-fleet");
  els.endScreen = document.getElementById("end-screen");
  els.endTitle = document.getElementById("end-title");
  els.endSummary = document.getElementById("end-summary");
  els.newGame = document.getElementById("new-game");
  els.efficiencyStat = document.getElementById("efficiency-stat");
  els.battleReport = document.getElementById("battle-report");
  els.theatre = document.getElementById("theatre");
  els.placementScreen = document.getElementById("placement-screen");
  els.placementBoard = document.getElementById("placement-board");
  els.placementRoster = document.getElementById("placement-roster");
  els.placementHint = document.getElementById("placement-hint");
  els.missileLayer = document.getElementById("missile-layer");
  els.rotateShip = document.getElementById("rotate-ship");
  els.randomizeFleet = document.getElementById("randomize-fleet");
  els.clearFleet = document.getElementById("clear-fleet");
  els.startBattle = document.getElementById("start-battle");
  els.muteToggle = document.getElementById("mute-toggle");
  els.muteIcon = document.getElementById("mute-icon");
  els.muteLabel = document.getElementById("mute-label");
}

function buildGrid(container, { clickable, label }) {
  container.textContent = "";
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-label", `${label} row ${row + 1} column ${col + 1}`);
      if (!clickable) cell.tabIndex = -1;
      container.appendChild(cell);
    }
  }
}

function buildHeatmapGrid() {
  els.heatmap.textContent = "";
  for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i++) {
    const tile = document.createElement("div");
    tile.className = "heat-tile";
    els.heatmap.appendChild(tile);
  }
}

function frameBoard(element) {
  const frame = document.createElement("div");
  frame.className = "board-frame";
  const topLabels = document.createElement("div");
  topLabels.className = "board-axis board-axis-top";
  for (let col = 0; col < BOARD_SIZE; col++) {
    const label = document.createElement("span");
    label.textContent = String(col + 1);
    topLabels.appendChild(label);
  }

  const sideLabels = document.createElement("div");
  sideLabels.className = "board-axis board-axis-side";
  for (let row = 0; row < BOARD_SIZE; row++) {
    const label = document.createElement("span");
    label.textContent = String.fromCharCode(65 + row);
    sideLabels.appendChild(label);
  }

  const parent = element.parentNode;
  parent.replaceChild(frame, element);
  frame.append(topLabels, sideLabels, element);
}

function cellElAt(container, row, col) {
  return container.children[row * BOARD_SIZE + col] ?? null;
}

function shipCellState(board, cell) {
  const ship = board.ships.find((s) =>
    s.cells.some((c) => c.row === cell.row && c.col === cell.col)
  );
  if (!ship) return { hasShip: false, sunk: false };
  return { hasShip: true, sunk: ship.sunk };
}

/**
 * Whether a ship lies along a row (a single-cell ship counts as horizontal).
 */
export function isHorizontal(ship) {
  return ship.cells.length === 1 || ship.cells.every((c) => c.row === ship.cells[0].row);
}

/**
 * The pixel box a ship occupies inside its board, measured off the real cell
 * elements rather than recomputed from the CSS cell/gap sizes — so the art
 * stays aligned whatever those are set to. Returns `null` if the cells aren't
 * laid out yet.
 */
function shipBox(boardEl, ship) {
  let box = null;
  for (const cell of ship.cells) {
    const cellEl = cellElAt(boardEl, cell.row, cell.col);
    if (!cellEl) return null;
    const left = cellEl.offsetLeft;
    const top = cellEl.offsetTop;
    const right = left + cellEl.offsetWidth;
    const bottom = top + cellEl.offsetHeight;
    box = box
      ? {
          left: Math.min(box.left, left),
          top: Math.min(box.top, top),
          right: Math.max(box.right, right),
          bottom: Math.max(box.bottom, bottom),
        }
      : { left, top, right, bottom };
  }
  if (!box || box.right <= box.left) return null;
  return {
    left: box.left,
    top: box.top,
    width: box.right - box.left,
    height: box.bottom - box.top,
  };
}

/**
 * Draws each ship as one vessel spanning all of its cells, on an overlay above
 * the board. A vertical ship reuses the same bow-right drawing rotated a
 * quarter turn about its centre, which exactly fills the transposed box.
 *
 * Additive layer: any failure leaves the board's own cell states — which
 * already convey ship/hit/miss/sunk on their own — as the fallback.
 */
function renderFleetArt(overlayEl, boardEl, ships) {
  if (!overlayEl) return;
  try {
    overlayEl.textContent = "";
  } catch (error) {
    reportError("ui: clearing the fleet art overlay", error);
    return;
  }
  if (!ships) return;

  // Per ship, so one undrawable vessel costs only its own art.
  for (const ship of ships) {
    attempt(`ui: drawing the ${ship?.id ?? "unknown"}`, () => {
      const box = shipBox(boardEl, ship);
      const markup = shipSvg(ship.id, ship.cells.length);
      if (!box || !markup) return;

      const wrap = document.createElement("div");
      wrap.className = "ship-figure";
      if (ship.sunk) wrap.classList.add("is-sunk");
      else if (ship.hits?.size > 0) wrap.classList.add("is-damaged");
      wrap.style.left = `${box.left}px`;
      wrap.style.top = `${box.top}px`;
      wrap.style.width = `${box.width}px`;
      wrap.style.height = `${box.height}px`;
      if (!isHorizontal(ship)) {
        wrap.classList.add("ship-figure-v");
        wrap.style.setProperty("--ship-long", `${box.height}px`);
        wrap.style.setProperty("--ship-short", `${box.width}px`);
      }
      wrap.innerHTML = markup;
      overlayEl.appendChild(wrap);
    });
  }
}

/**
 * Wraps a board in a positioned stack (if it isn't already in one) and adds
 * the fleet-art overlay as a sibling. The overlay must not be a child of the
 * board: the board's children are indexed positionally as the 100 cells.
 */
function addFleetArtLayer(boardEl) {
  let stack = boardEl.parentElement;
  if (!stack || !stack.classList.contains("board-stack")) {
    stack = document.createElement("div");
    stack.className = "board-stack";
    boardEl.parentNode.replaceChild(stack, boardEl);
    stack.appendChild(boardEl);
  }
  const overlay = document.createElement("div");
  overlay.className = "fleet-art";
  overlay.setAttribute("aria-hidden", "true");
  stack.appendChild(overlay);
  return overlay;
}

function latestAiEntry() {
  for (let i = state.history.length - 1; i >= 0; i--) {
    if (state.history[i].actor === "ai") return state.history[i];
  }
  return null;
}

function renderBoard(container, board, { revealShips }) {
  const latest = revealShips ? latestAiEntry() : null;
  for (const cellEl of container.children) {
    const row = Number(cellEl.dataset.row);
    const col = Number(cellEl.dataset.col);
    const fired = board.shotsReceived.has(key(row, col));
    const { hasShip, sunk } = shipCellState(board, { row, col });

    cellEl.classList.toggle("is-ship", revealShips && hasShip && !fired);
    cellEl.classList.toggle("is-miss", fired && !hasShip);
    cellEl.classList.toggle("is-hit", fired && hasShip && !sunk);
    cellEl.classList.toggle("is-sunk", fired && hasShip && sunk);
    cellEl.classList.toggle(
      "is-latest",
      Boolean(latest && latest.cell.row === row && latest.cell.col === col)
    );
  }
  // Enemy vessels appear only once sunk, which is information the player has
  // already been given — an unsunk enemy ship is never drawn.
  renderFleetArt(
    container === els.aiBoard ? els.aiFleetArt : els.playerFleetArt,
    container,
    revealShips ? board.ships : board.ships.filter((ship) => ship.sunk)
  );
}

/**
 * One roster row: ship name plus a hull strip of per-cell segments. `own`
 * rosters show live damage; the enemy roster only reveals segments once the
 * ship is sunk, since that's all the player is told.
 */
function rosterRow(ship, { own }) {
  const item = document.createElement("li");
  item.className = `roster-row${ship.sunk ? " roster-sunk" : ""}`;

  const name = document.createElement("span");
  name.className = "roster-name";
  name.textContent = ship.id;
  item.appendChild(name);

  const hull = document.createElement("span");
  hull.className = "hull";
  for (const cell of ship.cells) {
    const segment = document.createElement("span");
    const struck = own ? ship.hits.has(key(cell.row, cell.col)) : ship.sunk;
    segment.className = `hull-segment${struck ? " hull-hit" : ""}`;
    hull.appendChild(segment);
  }
  item.appendChild(hull);

  const status = document.createElement("span");
  status.className = "roster-status";
  if (ship.sunk) {
    status.textContent = "sunk";
  } else if (own) {
    status.textContent = `${ship.length - ship.hits.size}/${ship.length}`;
  } else {
    status.textContent = "afloat";
  }
  item.appendChild(status);

  return item;
}

function renderRosters() {
  const afloat = (board) => board.ships.filter((s) => !s.sunk).length;
  for (const [container, board, own] of [
    [els.yourFleet, state.playerBoard, true],
    [els.enemyFleet, state.aiBoard, false],
  ]) {
    container.textContent = "";
    for (const { id } of FLEET) {
      const ship = board.ships.find((s) => s.id === id);
      container.appendChild(rosterRow(ship, { own }));
    }
    const summary = document.createElement("li");
    summary.className = "roster-summary";
    summary.textContent = `${afloat(board)} of ${FLEET.length} ships afloat`;
    container.appendChild(summary);
  }
}

function renderConfidence() {
  // Creative layer: missing/invalid confidence just reads as unknown.
  const entry = latestAiEntry();
  const value = entry ? entry.confidence : null;
  const usable = typeof value === "number" && Number.isFinite(value);
  const pct = usable ? Math.round(Math.min(Math.max(value, 0), 1) * 100) : 0;
  els.confidenceBar.style.width = `${pct}%`;
  els.confidenceValue.textContent = usable ? `${pct}%` : "—";
}

function renderExplain() {
  const entry = latestAiEntry();
  if (!explainOpen) {
    els.explainPanel.classList.remove("explain-active");
    els.explainPanel.textContent =
      "Click the AI's most recent shot marker on your fleet to see why it fired there.";
    return;
  }
  els.explainPanel.classList.add("explain-active");
  els.explainPanel.textContent =
    entry && typeof entry.explanation === "string" && entry.explanation
      ? entry.explanation
      : "No reasoning recorded for that shot.";
}

function renderShotCount() {
  let player = 0;
  let ai = 0;
  for (const entry of state.history) {
    if (entry.actor === "ai") ai++;
    else player++;
  }
  els.shotCount.textContent = `You ${player} · AI ${ai}`;
}

function describeResult(entry) {
  if (!entry) return "";
  const who = entry.actor === "player" ? "You" : "The AI";
  const at = `(${entry.cell.row},${entry.cell.col})`;
  if (entry.result === "sunk") return `${who} sank the ${entry.shipId} at ${at}.`;
  if (entry.result === "hit") return `${who} hit a ship at ${at}.`;
  return `${who} missed at ${at}.`;
}

function renderStatusLine() {
  els.statusLine.classList.toggle("status-error", Boolean(failureMessage));
  if (failureMessage) {
    els.statusLine.textContent = failureMessage;
    return;
  }
  if (phase === "placement") {
    const remaining = FLEET.length - layout.length;
    els.statusLine.textContent =
      placementMessage ||
      (remaining > 0
        ? `Deploy your fleet — ${remaining} ship${remaining === 1 ? "" : "s"} left to place.`
        : "Fleet deployed. Start the battle when ready.");
    return;
  }
  if (isGameOver(state)) {
    els.statusLine.textContent =
      state.status === "player_won" ? "Enemy fleet destroyed." : "Your fleet is lost.";
    return;
  }
  const last = state.history[state.history.length - 1];
  els.statusLine.textContent = last
    ? `${describeResult(last)} Your move.`
    : "Your move — fire on the enemy waters.";
}

function renderEndScreen() {
  if (!isGameOver(state)) {
    els.endScreen.hidden = true;
    return;
  }
  const won = state.status === "player_won";
  els.endTitle.textContent = won ? "Victory" : "Defeat";
  const shots = state.history.filter((e) => e.actor === (won ? "player" : "ai")).length;
  els.endSummary.textContent = won
    ? `You sank the enemy fleet in ${shots} shots.`
    : `The AI sank your fleet in ${shots} shots.`;
  els.endScreen.hidden = false;
}

function render() {
  if (phase === "placement") {
    renderPlacement();
    renderStatusLine();
    return;
  }
  renderBoard(els.aiBoard, state.aiBoard, { revealShips: false });
  renderBoard(els.playerBoard, state.playerBoard, { revealShips: true });
  renderLaunchPoint();
  renderRosters();
  renderConfidence();
  renderExplain();
  renderShotCount();
  renderStatusLine();
  renderEndScreen();
}

/** Marks the hull segment the next shot will launch from. */
function renderLaunchPoint() {
  const launch = playerLaunchCell();
  for (const cellEl of els.playerBoard.children) {
    cellEl.classList.toggle(
      "launch-point",
      Boolean(
        launch &&
          Number(cellEl.dataset.row) === launch.row &&
          Number(cellEl.dataset.col) === launch.col
      )
    );
  }
}

/** Integration hook: a later pass calls this with the generated report text. */
export function renderBattleReport(text) {
  attempt("ui: rendering the battle report", () => {
    if (els.battleReport) els.battleReport.textContent = text;
  });
}

/** Integration hook: a later pass calls this with the efficiency stat text. */
export function renderEfficiencyStat(text) {
  attempt("ui: rendering the efficiency stat", () => {
    if (els.efficiencyStat) els.efficiencyStat.textContent = text;
  });
}

function showHeatmap(map) {
  // Additive layer: any bad data or DOM problem silently skips the overlay.
  try {
    const intensities = normalizeProbabilityMap(map, BOARD_SIZE);
    if (!intensities) return;
    const tiles = els.heatmap.children;
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const tile = tiles[row * BOARD_SIZE + col];
        if (!tile) continue;
        tile.style.opacity = String(0.08 + intensities[row][col] * 0.72);
      }
    }
    els.heatmap.classList.add("heatmap-visible");
  } catch (error) {
    reportError("ui: rendering the heatmap overlay", error);
    clearHeatmap();
  }
}

function clearHeatmap() {
  attempt("ui: hiding the heatmap overlay", () =>
    els.heatmap.classList.remove("heatmap-visible")
  );
}

function annotateAiMove(nextState, move, probabilityMap) {
  // The engine logs AI-only HistoryEntry fields as null (it has no knowledge
  // of the AI module); the UI attaches the decision data to the turn the
  // engine just recorded so the heatmap/confidence/explain layers can read it
  // back out of history as the data contract specifies.
  // Metadata is optional — a failure here must not stop the turn.
  attempt("ui: attaching the AI's decision data to the turn", () => {
    const entry = nextState.history[nextState.history.length - 1];
    if (!entry || entry.actor !== "ai") return;
    entry.probabilityMapSnapshot = probabilityMap ?? null;
    entry.confidence = typeof move.confidence === "number" ? move.confidence : null;
    entry.explanation = typeof move.explanation === "string" ? move.explanation : null;
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The cell a player's shot flies from: the un-sunk hull segment closest to
 * the gap between the two boards, so a shot visibly leaves a real ship
 * rather than an abstract launcher. Enemy Waters sits to the left of Your
 * Fleet, so "closest to the gap" is the lowest column.
 */
function playerLaunchCell() {
  let best = null;
  for (const ship of state.playerBoard.ships) {
    if (ship.sunk) continue;
    for (const cell of ship.cells) {
      if (!best || cell.col < best.col) best = cell;
    }
  }
  return best;
}

/**
 * Where the AI's shot flies from. The enemy's real ship positions are
 * hidden, so this deliberately uses the enemy board's edge on the same row
 * as the target — it leaks nothing about the enemy fleet's layout.
 */
function enemyLaunchCellEl(target) {
  return cellElAt(els.aiBoard, target.row, BOARD_SIZE - 1);
}

/**
 * Fly a missile along its arc and resolve once it lands. Every step is
 * guarded and the promise always settles, so a DOM, layout, or Web
 * Animations failure degrades to an instant shot instead of stalling a turn.
 */
function flyMissile(sourceEl, targetEl) {
  return new Promise((resolve) => {
    let settled = false;
    const arrive = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    try {
      if (!els.missileLayer || !sourceEl || !targetEl) {
        arrive();
        return;
      }
      sourceEl.classList.add("bs-muzzle");
      setTimeout(() => sourceEl.classList.remove("bs-muzzle"), 400);
      playEffect("fire");
      launchMissile(els.missileLayer, sourceEl, targetEl, arrive, {
        duration: MISSILE_MS,
      });
      // Backstop in case the animation never reports finishing.
      setTimeout(arrive, MISSILE_MS + 400);
    } catch (error) {
      reportError("ui: animating the missile", error);
      arrive();
    }
  });
}

/**
 * The result beat: a hit is a local flare contained in one cell, a sink
 * breaks that containment with a full explosion and a board shake. Purely
 * decorative and fully guarded.
 */
function playImpact(container, cell, result, { own = false } = {}) {
  try {
    const cellEl = cellElAt(container, cell.row, cell.col);
    if (!cellEl) return;

    if (result === "hit") {
      spawnFx(cellEl, fxFire(), IMPACT_MS + 780);
      spawnPing(cellEl);
    } else if (result === "sunk") {
      spawnFx(cellEl, fxExplosion(), IMPACT_MS + 780);
      spawnPing(cellEl);
      triggerShake(container);
    }
    // A miss needs no effect node: the cell's own ripple state carries it.

    if (own && result !== "miss") klaxonFlash();
    playEffect(result === "no-op" ? "invalid" : result);
  } catch (error) {
    reportError("ui: playing the impact effect", error);
  }
}

/** Scan sweep while the opponent is thinking. */
function setScanning(on) {
  attempt("ui: toggling the scan sweep", () => {
    const panel = els.playerBoard?.closest(".board-panel");
    if (panel) panel.classList.toggle("bs-scanning", on);
  });
}

/**
 * Targeting reticle: a dashed ring and crosshair that snaps to whichever
 * enemy cell the cursor is over. Kept separate from firing so aiming feels
 * free and the click is the committed action.
 */
function setUpReticle() {
  const frame = els.aiBoard.closest(".board-frame") ?? els.aiBoard.parentElement;
  if (!frame) return;

  const reticle = document.createElement("div");
  reticle.className = "bs-reticle";
  reticle.setAttribute("aria-hidden", "true");
  reticle.innerHTML =
    '<div class="bs-reticle-ring"></div><div class="bs-reticle-cross"></div>';
  frame.appendChild(reticle);
  els.reticle = reticle;

  els.aiBoard.addEventListener("mousemove", (event) => {
    const cellEl = event.target.closest(".cell");
    if (!cellEl || busy || isGameOver(state)) {
      hideReticle(reticle);
      return;
    }
    positionReticle(reticle, cellEl, frame);
  });
  els.aiBoard.addEventListener("mouseleave", () => hideReticle(reticle));
}

/**
 * The AI's move, or `null` if neither the AI module nor the random fallback
 * can produce one. A failure in the Bayesian layer costs the AI its
 * reasoning, not its turn: the fallback keeps the game playable and the real
 * error goes to the console rather than disappearing.
 */
function chooseAiMove() {
  try {
    const move = realChooseMove(state);
    if (move && move.cell) return move;
    reportError(
      "ai: choosing a move",
      new Error("chooseMove returned no cell for an unfinished board")
    );
  } catch (error) {
    reportError("ai: choosing a move", error);
  }
  const fallback = attempt("ai: falling back to a random legal shot", () =>
    mockChooseMove(state)
  );
  return fallback && fallback.cell ? fallback : null;
}

async function runAiTurn() {
  const move = chooseAiMove();
  if (!move) throw new Error("no AI move available");

  setScanning(true);
  showHeatmap(move.probabilityMap);
  await sleep(HEATMAP_DWELL_MS);
  clearHeatmap();
  setScanning(false);

  const { newState, result } = fireAt(state, "player", move.cell);
  await flyMissile(
    enemyLaunchCellEl(move.cell),
    cellElAt(els.playerBoard, move.cell.row, move.cell.col)
  );

  annotateAiMove(newState, move, move.probabilityMap);
  state = newState;
  explainOpen = false;
  render();
  playImpact(els.playerBoard, move.cell, result, { own: true });
  if (isGameOver(state)) playEffect(state.status === "player_won" ? "victory" : "defeat");
}

/**
 * Runs the AI's turn, handing the turn back to the player if it cannot be
 * completed. An unresolved AI turn would otherwise strand the game: the
 * player is locked out while it is the AI's move, and the AI never moves.
 */
async function takeAiTurn() {
  try {
    await runAiTurn();
  } catch (error) {
    if (!isGameOver(state) && state.turn === "ai") {
      state = { ...state, turn: "player" };
    }
    setScanning(false);
    clearHeatmap();
    reportFailure(
      "ui: taking the AI's turn",
      error,
      "The AI could not complete its turn and forfeits this shot. Fire again."
    );
    attempt("ui: re-rendering after a failed AI turn", render);
  }
}

async function onPlayerShot(cell) {
  if (!state || busy || isGameOver(state)) return;
  // The AI's turn only ends when its shot resolves; firing into it would put
  // two player shots on the board in a row.
  if (state.turn !== "player") return;
  if (state.aiBoard.shotsReceived.has(key(cell.row, cell.col))) {
    playEffect("invalid");
    return;
  }

  failureMessage = null;
  busy = true;
  els.aiBoard.classList.add("board-locked");
  if (els.reticle) hideReticle(els.reticle);
  try {
    const { newState, result } = fireAt(state, "ai", cell);
    if (result === "no-op") return; // engine already decided this changes nothing

    const launch = playerLaunchCell();
    await flyMissile(
      launch ? cellElAt(els.playerBoard, launch.row, launch.col) : null,
      cellElAt(els.aiBoard, cell.row, cell.col)
    );

    state = newState;
    render();
    playImpact(els.aiBoard, cell, result);
    if (isGameOver(state)) {
      playEffect("victory");
      return;
    }
    await sleep(RESULT_PAUSE_MS + IMPACT_MS);
    await takeAiTurn();
  } catch (error) {
    // The turn is the one thing that must not fail silently: the engine and
    // the AI are the game, so surface the break instead of leaving the player
    // clicking a board that no longer responds.
    reportFailure(
      "ui: resolving the turn",
      error,
      "That turn could not be resolved. The board is unchanged — try firing again, or start a new game."
    );
    attempt("ui: re-rendering after a failed turn", render);
  } finally {
    busy = false;
    els.aiBoard.classList.remove("board-locked");
  }
}

function onPlayerBoardClick(event) {
  const cellEl = event.target.closest(".cell");
  if (!cellEl) return;
  const entry = latestAiEntry();
  if (
    !entry ||
    entry.cell.row !== Number(cellEl.dataset.row) ||
    entry.cell.col !== Number(cellEl.dataset.col)
  ) {
    return;
  }
  explainOpen = !explainOpen;
  renderExplain();
}

// ---------------------------------------------------------------------------
// Placement phase
// ---------------------------------------------------------------------------

function placedShip(id) {
  return layout.find((s) => s.id === id) ?? null;
}

function nextUnplacedShipId() {
  const pending = FLEET.find(({ id }) => !placedShip(id));
  return pending ? pending.id : null;
}

function selectedFleetEntry() {
  return FLEET.find(({ id }) => id === selectedShipId) ?? null;
}

function renderPlacementRoster() {
  els.placementRoster.textContent = "";
  for (const { id, length } of FLEET) {
    const ship = placedShip(id);
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = `roster-pick${id === selectedShipId ? " roster-pick-active" : ""}${
      ship ? " roster-pick-placed" : ""
    }`;
    button.dataset.shipId = id;

    const name = document.createElement("span");
    name.className = "roster-name";
    name.textContent = id;
    const hull = document.createElement("span");
    hull.className = "hull";
    for (let i = 0; i < length; i++) {
      const segment = document.createElement("span");
      segment.className = "hull-segment";
      hull.appendChild(segment);
    }
    const status = document.createElement("span");
    status.className = "roster-status";
    status.textContent = ship ? "deployed" : `${length}`;

    button.append(name, hull, status);
    item.appendChild(button);
    els.placementRoster.appendChild(item);
  }
}

function renderPlacementBoard() {
  const occupied = new Map();
  for (const ship of layout) {
    for (const cell of ship.cells) occupied.set(key(cell.row, cell.col), ship.id);
  }
  for (const cellEl of els.placementBoard.children) {
    const cellKey = key(Number(cellEl.dataset.row), Number(cellEl.dataset.col));
    const shipId = occupied.get(cellKey) ?? null;
    cellEl.classList.toggle("is-ship", Boolean(shipId));
    cellEl.classList.remove("preview-ok", "preview-bad");
    if (shipId) {
      cellEl.dataset.shipId = shipId;
    } else {
      delete cellEl.dataset.shipId;
    }
  }
  renderFleetArt(els.placementFleetArt, els.placementBoard, layout);
}

function renderPlacement() {
  renderPlacementRoster();
  renderPlacementBoard();
  const entry = selectedFleetEntry();
  els.placementHint.textContent = entry
    ? `${entry.id} (${entry.length} cells), ${orientation}. Click a cell to drop its bow, press R to rotate, or click a deployed ship to pick it back up.`
    : "All ships deployed. Click a deployed ship to reposition it, or start the battle.";
  els.startBattle.disabled = layout.length !== FLEET.length;
}

function previewPlacement(row, col) {
  const entry = selectedFleetEntry();
  renderPlacementBoard();
  if (!entry) return;
  const cells = cellsForPlacement(row, col, entry.length, orientation);
  const legal = isPlacementLegal(layout, cells, BOARD_SIZE, entry.id);
  for (const cell of cells) {
    const cellEl = cellElAt(els.placementBoard, cell.row, cell.col);
    if (cellEl) cellEl.classList.add(legal ? "preview-ok" : "preview-bad");
  }
}

function placeSelectedShip(row, col) {
  const entry = selectedFleetEntry();
  if (!entry) return;
  const cells = cellsForPlacement(row, col, entry.length, orientation);
  if (!isPlacementLegal(layout, cells, BOARD_SIZE, entry.id)) {
    placementMessage = `The ${entry.id} doesn't fit there.`;
    playEffect("invalid");
    render();
    return;
  }
  layout = [
    ...layout.filter((s) => s.id !== entry.id),
    { id: entry.id, length: entry.length, cells },
  ];
  placementMessage = "";
  playEffect("place");
  selectedShipId = nextUnplacedShipId() ?? entry.id;
  render();
}

function pickUpShip(id) {
  layout = layout.filter((s) => s.id !== id);
  selectedShipId = id;
  placementMessage = "";
  playEffect("rotate");
  render();
}

function onPlacementBoardClick(event) {
  const cellEl = event.target.closest(".cell");
  if (!cellEl) return;
  startMusic();
  if (cellEl.dataset.shipId) {
    pickUpShip(cellEl.dataset.shipId);
    return;
  }
  placeSelectedShip(Number(cellEl.dataset.row), Number(cellEl.dataset.col));
}

function rotateSelection() {
  orientation = orientation === "horizontal" ? "vertical" : "horizontal";
  placementMessage = "";
  playEffect("rotate");
  render();
}

function randomizeLayout() {
  layout = randomFleetLayout(BOARD_SIZE);
  selectedShipId = FLEET[0].id;
  placementMessage = "Fleet scattered at random.";
  playEffect("place");
  render();
}

function clearLayout() {
  layout = [];
  selectedShipId = FLEET[0].id;
  placementMessage = "Board cleared.";
  playEffect("invalid");
  render();
}

function startBattle() {
  const { valid, error } = validateFleetLayout(layout, BOARD_SIZE);
  if (!valid) {
    placementMessage = error;
    playEffect("invalid");
    render();
    return;
  }

  let newGame;
  try {
    newGame = createGame(layout);
  } catch (createError) {
    reportFailure(
      "ui: creating the game",
      createError,
      "The battle could not be started. Try randomizing your fleet, then start again."
    );
    return;
  }

  failureMessage = null;
  state = newGame;
  phase = "battle";
  busy = false;
  explainOpen = false;
  placementMessage = "";
  clearHeatmap();
  els.placementScreen.hidden = true;
  els.theatre.hidden = false;
  startMusic();
  playEffect("place");
  render();
}

function enterPlacementPhase() {
  let freshGame;
  try {
    freshGame = createGame();
  } catch (error) {
    reportFailure(
      "ui: preparing a new board",
      error,
      "A new board could not be prepared. Reload the page to try again."
    );
    return;
  }

  failureMessage = null;
  phase = "placement";
  state = freshGame;
  layout = [];
  orientation = "horizontal";
  selectedShipId = FLEET[0].id;
  placementMessage = "";
  busy = false;
  explainOpen = false;
  clearHeatmap();
  renderBattleReport("");
  renderEfficiencyStat("");
  els.endScreen.hidden = true;
  els.theatre.hidden = true;
  els.placementScreen.hidden = false;
  render();
}

function renderMuteButton() {
  const off = isMuted();
  els.muteToggle.setAttribute("aria-pressed", String(off));
  els.muteIcon.textContent = off ? "\u266A\u0338" : "\u266B";
  els.muteLabel.textContent = off ? "Sound off" : "Sound on";
}

function onMuteToggle() {
  toggleMuted();
  if (!isMuted()) startMusic();
  renderMuteButton();
}

function onKeyDown(event) {
  if (phase !== "placement") return;
  if (event.key === "r" || event.key === "R") {
    event.preventDefault();
    rotateSelection();
  }
}

// Every element the code below dereferences unconditionally. A missing id
// used to surface as a bare TypeError from deep inside a render, leaving a
// blank page; naming the gaps up front makes it diagnosable.
const REQUIRED_ELEMENTS = [
  "aiBoard",
  "playerBoard",
  "heatmap",
  "statusLine",
  "confidenceBar",
  "confidenceValue",
  "explainPanel",
  "shotCount",
  "yourFleet",
  "enemyFleet",
  "endScreen",
  "endTitle",
  "endSummary",
  "newGame",
  "theatre",
  "placementScreen",
  "placementBoard",
  "placementRoster",
  "placementHint",
  "rotateShip",
  "randomizeFleet",
  "clearFleet",
  "startBattle",
  "muteToggle",
  "muteIcon",
  "muteLabel",
];

function assertRequiredElements() {
  const missing = REQUIRED_ELEMENTS.filter((name) => !els[name]);
  if (missing.length > 0) {
    throw new Error(`index.html is missing required element(s): ${missing.join(", ")}`);
  }
}

/** Last resort: the game cannot run at all, so say so on the page. */
function showStartupFailure(error) {
  reportError("ui: starting the game", error);
  attempt("ui: showing the start-up failure", () => {
    const line = document.getElementById("status-line");
    if (!line) return;
    line.textContent =
      "The game failed to start. Reload the page — the browser console has the details.";
    line.classList.add("status-error");
  });
}

function setUp() {
  cacheElements();
  assertRequiredElements();
  buildGrid(els.aiBoard, { clickable: true, label: "Enemy cell" });
  buildGrid(els.playerBoard, { clickable: false, label: "Your cell" });
  buildGrid(els.placementBoard, { clickable: true, label: "Deployment cell" });
  buildHeatmapGrid();
  els.aiFleetArt = addFleetArtLayer(els.aiBoard);
  els.playerFleetArt = addFleetArtLayer(els.playerBoard);
  els.placementFleetArt = addFleetArtLayer(els.placementBoard);
  frameBoard(els.aiBoard.parentElement);
  frameBoard(els.playerBoard.parentElement);
  frameBoard(els.placementBoard.parentElement);
  setUpReticle();
  initAudio();
  renderMuteButton();

  els.aiBoard.addEventListener("click", (event) => {
    const cellEl = event.target.closest(".cell");
    if (!cellEl) return;
    onPlayerShot({ row: Number(cellEl.dataset.row), col: Number(cellEl.dataset.col) });
  });
  els.playerBoard.addEventListener("click", onPlayerBoardClick);
  els.newGame.addEventListener("click", enterPlacementPhase);

  els.placementBoard.addEventListener("click", onPlacementBoardClick);
  els.placementBoard.addEventListener("mouseover", (event) => {
    const cellEl = event.target.closest(".cell");
    if (!cellEl) return;
    previewPlacement(Number(cellEl.dataset.row), Number(cellEl.dataset.col));
  });
  els.placementBoard.addEventListener("mouseleave", renderPlacementBoard);
  els.placementRoster.addEventListener("click", (event) => {
    const pick = event.target.closest(".roster-pick");
    if (!pick) return;
    selectedShipId = pick.dataset.shipId;
    placementMessage = "";
    render();
  });
  els.rotateShip.addEventListener("click", rotateSelection);
  els.randomizeFleet.addEventListener("click", randomizeLayout);
  els.clearFleet.addEventListener("click", clearLayout);
  els.startBattle.addEventListener("click", startBattle);
  els.muteToggle.addEventListener("click", onMuteToggle);
  document.addEventListener("keydown", onKeyDown);

  enterPlacementPhase();
}

function init() {
  try {
    setUp();
  } catch (error) {
    showStartupFailure(error);
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}
