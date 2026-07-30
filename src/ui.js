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
import {
  initAudio,
  isMuted,
  playEffect,
  startMusic,
  toggleMuted,
} from "./audio.js";

const HEATMAP_DWELL_MS = 650;
const RESULT_PAUSE_MS = 200;
const LOCK_ON_MS = 260;
const IMPACT_MS = 620;

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
  renderRosters();
  renderConfidence();
  renderExplain();
  renderShotCount();
  renderStatusLine();
  renderEndScreen();
}

/** Integration hook: a later pass calls this with the generated report text. */
export function renderBattleReport(text) {
  try {
    if (els.battleReport) els.battleReport.textContent = text;
  } catch {
    /* additive layer — never break the game */
  }
}

/** Integration hook: a later pass calls this with the efficiency stat text. */
export function renderEfficiencyStat(text) {
  try {
    if (els.efficiencyStat) els.efficiencyStat.textContent = text;
  } catch {
    /* additive layer — never break the game */
  }
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
  } catch {
    clearHeatmap();
  }
}

function clearHeatmap() {
  try {
    els.heatmap.classList.remove("heatmap-visible");
  } catch {
    /* nothing to clean up */
  }
}

function annotateAiMove(nextState, move, probabilityMap) {
  // The engine logs AI-only HistoryEntry fields as null (it has no knowledge
  // of the AI module); the UI attaches the decision data to the turn the
  // engine just recorded so the heatmap/confidence/explain layers can read it
  // back out of history as the data contract specifies.
  try {
    const entry = nextState.history[nextState.history.length - 1];
    if (!entry || entry.actor !== "ai") return;
    entry.probabilityMapSnapshot = probabilityMap ?? null;
    entry.confidence = typeof move.confidence === "number" ? move.confidence : null;
    entry.explanation = typeof move.explanation === "string" ? move.explanation : null;
  } catch {
    /* metadata is optional — a failure here must not stop the turn */
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Targeting-reticle beat before a shot resolves, then the impact burst.
 * Purely decorative: every step is guarded so a DOM or timing failure can't
 * stall a turn.
 */
async function playLockOn(container, cell) {
  try {
    const cellEl = cellElAt(container, cell.row, cell.col);
    if (!cellEl) return;
    cellEl.classList.add("fx-lock");
    playEffect("fire");
    await sleep(LOCK_ON_MS);
    cellEl.classList.remove("fx-lock");
  } catch {
    /* decorative only */
  }
}

function playImpact(container, cell, result) {
  try {
    const cellEl = cellElAt(container, cell.row, cell.col);
    if (!cellEl) return;
    const fx = result === "miss" ? "fx-splash" : "fx-boom";
    cellEl.classList.add(fx);
    if (result !== "miss") container.classList.add("board-shake");
    if (result === "sunk") container.classList.add("board-sink");
    playEffect(result === "no-op" ? "invalid" : result);
    setTimeout(() => {
      try {
        cellEl.classList.remove(fx);
        container.classList.remove("board-shake", "board-sink");
      } catch {
        /* element already gone */
      }
    }, IMPACT_MS);
  } catch {
    /* decorative only */
  }
}

async function takeAiTurn() {
  const move = realChooseMove(state);
  if (!move || !move.cell) return;

  showHeatmap(move.probabilityMap);
  await sleep(HEATMAP_DWELL_MS);
  clearHeatmap();

  await playLockOn(els.playerBoard, move.cell);
  const { newState, result } = fireAt(state, "player", move.cell);
  annotateAiMove(newState, move, move.probabilityMap);
  state = newState;
  explainOpen = false;
  render();
  playImpact(els.playerBoard, move.cell, result);
  if (isGameOver(state)) playEffect(state.status === "player_won" ? "victory" : "defeat");
}

async function onPlayerShot(cell) {
  if (busy || isGameOver(state)) return;
  if (state.aiBoard.shotsReceived.has(key(cell.row, cell.col))) {
    playEffect("invalid");
    return;
  }

  busy = true;
  els.aiBoard.classList.add("board-locked");
  try {
    await playLockOn(els.aiBoard, cell);
    const { newState, result } = fireAt(state, "ai", cell);
    if (result === "no-op") return; // engine already decided this changes nothing
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
  buildGrid(els.aiBoard, { clickable: true, label: "Enemy cell" });
  buildGrid(els.playerBoard, { clickable: false, label: "Your cell" });
  buildGrid(els.placementBoard, { clickable: true, label: "Deployment cell" });
  buildHeatmapGrid();
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

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}
