// Rendering and input handling only. All game rules go through engine.js —
// nothing in here recomputes hit/miss/sunk/win logic.

import {
  BOARD_SIZE,
  FLEET,
  cellsForPlacement,
  createGame,
  fireAt,
  isGameOver,
  lastShotBy,
  randomFleetLayout,
  shotsBy,
  validateFleetLayout,
} from "./engine.js";
import {
  buildGrid,
  cellKey,
  findShipAt,
  forEachCell,
  key,
  occupiedKeys,
  pickRandom,
  placementFits,
  sameCell,
} from "./grid.js";
import { cellCoords, el, eventCell, repeat } from "./dom.js";
import { attempt } from "./safe.js";
import { chooseMove as realChooseMove } from "./ai.js";
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

/**
 * Stand-in for the AI module's `chooseMove` until `src/ai.js` lands: picks a
 * uniformly random unattacked cell on the player's board. Returns the real
 * module's contract shape plus a `probabilityMap` (see notes at the
 * integration point below).
 */
export function mockChooseMove(state) {
  const board = state.playerBoard;
  const open = [];
  forEachCell(board.size, (row, col) => {
    if (!board.shotsReceived.has(key(row, col))) open.push({ row, col });
  });
  const cell = pickRandom(open);
  const probabilityMap = open.length
    ? buildGrid(board.size, (row, col) =>
        board.shotsReceived.has(key(row, col)) ? 0 : Math.random()
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
  return placementFits(cells, size, occupiedKeys(layout, { exceptId: movingId }));
}

const els = {};
let state = null;
let busy = false;
let explainOpen = false;

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

function buildBoardGrid(container, { clickable, label }) {
  container.textContent = "";
  forEachCell(BOARD_SIZE, (row, col) => {
    const cell = el("button", "cell");
    cell.type = "button";
    cell.dataset.row = String(row);
    cell.dataset.col = String(col);
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("aria-label", `${label} row ${row + 1} column ${col + 1}`);
    if (!clickable) cell.tabIndex = -1;
    container.appendChild(cell);
  });
}

function buildHeatmapGrid() {
  els.heatmap.textContent = "";
  repeat(els.heatmap, BOARD_SIZE * BOARD_SIZE, () => el("div", "heat-tile"));
}

function frameBoard(element) {
  const frame = el("div", "board-frame");
  const topLabels = repeat(
    el("div", "board-axis board-axis-top"),
    BOARD_SIZE,
    (col) => el("span", "", String(col + 1))
  );
  const sideLabels = repeat(
    el("div", "board-axis board-axis-side"),
    BOARD_SIZE,
    (row) => el("span", "", String.fromCharCode(65 + row))
  );

  const parent = element.parentNode;
  parent.replaceChild(frame, element);
  frame.append(topLabels, sideLabels, element);
}

function cellElAt(container, row, col) {
  return container.children[row * BOARD_SIZE + col] ?? null;
}

function shipCellState(board, cell) {
  const ship = findShipAt(board.ships, cell);
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
  // Decorative layer — the cell states already carry the game state.
  attempt(() => {
    if (!overlayEl) return;
    overlayEl.textContent = "";
    if (!ships) return;

    for (const ship of ships) {
      const box = shipBox(boardEl, ship);
      const markup = shipSvg(ship.id, ship.cells.length);
      if (!box || !markup) continue;

      const wrap = el("div", "ship-figure");
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
    }
  });
}

/**
 * Wraps a board in a positioned stack (if it isn't already in one) and adds
 * the fleet-art overlay as a sibling. The overlay must not be a child of the
 * board: the board's children are indexed positionally as the 100 cells.
 */
function addFleetArtLayer(boardEl) {
  let stack = boardEl.parentElement;
  if (!stack || !stack.classList.contains("board-stack")) {
    stack = el("div", "board-stack");
    boardEl.parentNode.replaceChild(stack, boardEl);
    stack.appendChild(boardEl);
  }
  const overlay = el("div", "fleet-art");
  overlay.setAttribute("aria-hidden", "true");
  stack.appendChild(overlay);
  return overlay;
}

function latestAiEntry() {
  return lastShotBy(state, "ai");
}

function renderBoard(container, board, { revealShips }) {
  const latest = revealShips ? latestAiEntry() : null;
  for (const cellEl of container.children) {
    const cell = cellCoords(cellEl);
    const fired = board.shotsReceived.has(cellKey(cell));
    const { hasShip, sunk } = shipCellState(board, cell);

    cellEl.classList.toggle("is-ship", revealShips && hasShip && !fired);
    cellEl.classList.toggle("is-miss", fired && !hasShip);
    cellEl.classList.toggle("is-hit", fired && hasShip && !sunk);
    cellEl.classList.toggle("is-sunk", fired && hasShip && sunk);
    cellEl.classList.toggle("is-latest", Boolean(latest && sameCell(latest.cell, cell)));
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
  const item = el("li", `roster-row${ship.sunk ? " roster-sunk" : ""}`);
  const hull = hullStrip(ship.cells.length, (index) =>
    own ? ship.hits.has(cellKey(ship.cells[index])) : ship.sunk
  );

  let status;
  if (ship.sunk) status = "sunk";
  else if (own) status = `${ship.length - ship.hits.size}/${ship.length}`;
  else status = "afloat";

  item.append(
    el("span", "roster-name", ship.id),
    hull,
    el("span", "roster-status", status)
  );
  return item;
}

/** A ship's hull as one segment per cell, `struck` ones marked as damage. */
function hullStrip(length, struck = () => false) {
  return repeat(el("span", "hull"), length, (index) =>
    el("span", `hull-segment${struck(index) ? " hull-hit" : ""}`)
  );
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
    container.appendChild(
      el("li", "roster-summary", `${afloat(board)} of ${FLEET.length} ships afloat`)
    );
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
  const ai = shotsBy(state, "ai").length;
  els.shotCount.textContent = `You ${state.history.length - ai} · AI ${ai}`;
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
  const shots = shotsBy(state, won ? "player" : "ai").length;
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
    cellEl.classList.toggle("launch-point", sameCell(launch, cellCoords(cellEl)));
  }
}

/** Integration hook: a later pass calls this with the generated report text. */
export function renderBattleReport(text) {
  attempt(() => {
    if (els.battleReport) els.battleReport.textContent = text;
  });
}

/** Integration hook: a later pass calls this with the efficiency stat text. */
export function renderEfficiencyStat(text) {
  attempt(() => {
    if (els.efficiencyStat) els.efficiencyStat.textContent = text;
  });
}

function showHeatmap(map) {
  // Additive layer: any bad data or DOM problem silently skips the overlay.
  attempt(() => {
    const intensities = normalizeProbabilityMap(map, BOARD_SIZE);
    if (!intensities) return;
    const tiles = els.heatmap.children;
    forEachCell(BOARD_SIZE, (row, col) => {
      const tile = tiles[row * BOARD_SIZE + col];
      if (tile) tile.style.opacity = String(0.08 + intensities[row][col] * 0.72);
    });
    els.heatmap.classList.add("heatmap-visible");
  }, clearHeatmap);
}

function clearHeatmap() {
  attempt(() => els.heatmap.classList.remove("heatmap-visible"));
}

function annotateAiMove(nextState, move, probabilityMap) {
  // The engine logs AI-only HistoryEntry fields as null (it has no knowledge
  // of the AI module); the UI attaches the decision data to the turn the
  // engine just recorded so the heatmap/confidence/explain layers can read it
  // back out of history as the data contract specifies.
  // Metadata is optional — a failure here must not stop the turn.
  attempt(() => {
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

    attempt(() => {
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
    }, arrive);
  });
}

/**
 * The result beat: a hit is a local flare contained in one cell, a sink
 * breaks that containment with a full explosion and a board shake. Purely
 * decorative and fully guarded.
 */
function playImpact(container, cell, result, { own = false } = {}) {
  attempt(() => {
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
  });
}

/** Scan sweep while the opponent is thinking. */
function setScanning(on) {
  attempt(() => {
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

  const reticle = el("div", "bs-reticle");
  reticle.setAttribute("aria-hidden", "true");
  reticle.innerHTML =
    '<div class="bs-reticle-ring"></div><div class="bs-reticle-cross"></div>';
  frame.appendChild(reticle);
  els.reticle = reticle;

  els.aiBoard.addEventListener("mousemove", (event) => {
    const cellEl = eventCell(event);
    if (!cellEl || busy || isGameOver(state)) {
      hideReticle(reticle);
      return;
    }
    positionReticle(reticle, cellEl, frame);
  });
  els.aiBoard.addEventListener("mouseleave", () => hideReticle(reticle));
}

async function takeAiTurn() {
  const move = realChooseMove(state);
  if (!move || !move.cell) return;

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

async function onPlayerShot(cell) {
  if (busy || isGameOver(state)) return;
  if (state.aiBoard.shotsReceived.has(cellKey(cell))) {
    playEffect("invalid");
    return;
  }

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
  } finally {
    busy = false;
    els.aiBoard.classList.remove("board-locked");
  }
}

function onPlayerBoardClick(event) {
  const cellEl = eventCell(event);
  if (!cellEl) return;
  const entry = latestAiEntry();
  if (!entry || !sameCell(entry.cell, cellCoords(cellEl))) return;
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
    const button = el(
      "button",
      `roster-pick${id === selectedShipId ? " roster-pick-active" : ""}${
        ship ? " roster-pick-placed" : ""
      }`
    );
    button.type = "button";
    button.dataset.shipId = id;
    button.append(
      el("span", "roster-name", id),
      hullStrip(length),
      el("span", "roster-status", ship ? "deployed" : `${length}`)
    );

    const item = el("li");
    item.appendChild(button);
    els.placementRoster.appendChild(item);
  }
}

function renderPlacementBoard() {
  const occupied = new Map();
  for (const ship of layout) {
    for (const cell of ship.cells) occupied.set(cellKey(cell), ship.id);
  }
  for (const cellEl of els.placementBoard.children) {
    const shipId = occupied.get(cellKey(cellCoords(cellEl))) ?? null;
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
  const cellEl = eventCell(event);
  if (!cellEl) return;
  startMusic();
  if (cellEl.dataset.shipId) {
    pickUpShip(cellEl.dataset.shipId);
    return;
  }
  const { row, col } = cellCoords(cellEl);
  placeSelectedShip(row, col);
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
  state = createGame(layout);
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
  phase = "placement";
  state = createGame();
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

function init() {
  cacheElements();
  buildBoardGrid(els.aiBoard, { clickable: true, label: "Enemy cell" });
  buildBoardGrid(els.playerBoard, { clickable: false, label: "Your cell" });
  buildBoardGrid(els.placementBoard, { clickable: true, label: "Deployment cell" });
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
    const cellEl = eventCell(event);
    if (cellEl) onPlayerShot(cellCoords(cellEl));
  });
  els.playerBoard.addEventListener("click", onPlayerBoardClick);
  els.newGame.addEventListener("click", enterPlacementPhase);

  els.placementBoard.addEventListener("click", onPlacementBoardClick);
  els.placementBoard.addEventListener("mouseover", (event) => {
    const cellEl = eventCell(event);
    if (!cellEl) return;
    const { row, col } = cellCoords(cellEl);
    previewPlacement(row, col);
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

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}
