// Rendering and input handling only. All game rules go through engine.js —
// nothing in here recomputes hit/miss/sunk/win logic.

import { BOARD_SIZE, FLEET, createGame, fireAt, isGameOver } from "./engine.js";

const HEATMAP_DWELL_MS = 650;
const RESULT_PAUSE_MS = 200;

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

const els = {};
let state = null;
let busy = false;
let explainOpen = false;

function cacheElements() {
  els.aiBoard = document.getElementById("ai-board");
  els.playerBoard = document.getElementById("player-board");
  els.heatmap = document.getElementById("heatmap");
  els.statusLine = document.getElementById("status-line");
  els.confidenceBar = document.getElementById("confidence-bar");
  els.confidenceValue = document.getElementById("confidence-value");
  els.explainPanel = document.getElementById("explain-panel");
  els.shotCount = document.getElementById("shot-count");
  els.fleetStatus = document.getElementById("fleet-status");
  els.endScreen = document.getElementById("end-screen");
  els.endTitle = document.getElementById("end-title");
  els.endSummary = document.getElementById("end-summary");
  els.newGame = document.getElementById("new-game");
  els.efficiencyStat = document.getElementById("efficiency-stat");
  els.battleReport = document.getElementById("battle-report");
}

function buildGrid(container, { clickable }) {
  container.textContent = "";
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);
      cell.setAttribute("role", "gridcell");
      cell.setAttribute(
        "aria-label",
        `${clickable ? "Enemy" : "Your"} cell row ${row + 1} column ${col + 1}`
      );
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

function renderFleetStatus() {
  els.fleetStatus.textContent = "";
  for (const { id } of FLEET) {
    const mine = state.playerBoard.ships.find((s) => s.id === id);
    const theirs = state.aiBoard.ships.find((s) => s.id === id);
    const item = document.createElement("li");
    item.className = "fleet-row";
    const name = document.createElement("span");
    name.className = "fleet-name";
    name.textContent = id;
    item.appendChild(name);
    const yours = document.createElement("span");
    yours.className = `pip ${mine.sunk ? "pip-lost" : "pip-alive"}`;
    yours.title = mine.sunk ? "Your ship sunk" : "Your ship afloat";
    const enemy = document.createElement("span");
    enemy.className = `pip ${theirs.sunk ? "pip-killed" : "pip-unknown"}`;
    enemy.title = theirs.sunk ? "Enemy ship sunk" : "Enemy ship not yet sunk";
    item.append(yours, enemy);
    els.fleetStatus.appendChild(item);
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
  renderBoard(els.aiBoard, state.aiBoard, { revealShips: false });
  renderBoard(els.playerBoard, state.playerBoard, { revealShips: true });
  renderFleetStatus();
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

async function takeAiTurn() {
  // TODO(integration): swap mock for real ai.chooseMove
  const move = mockChooseMove(state);
  if (!move || !move.cell) return;

  showHeatmap(move.probabilityMap);
  await sleep(HEATMAP_DWELL_MS);
  clearHeatmap();

  const { newState } = fireAt(state, "player", move.cell);
  annotateAiMove(newState, move, move.probabilityMap);
  state = newState;
  explainOpen = false;
  render();
}

async function onPlayerShot(cell) {
  if (busy || isGameOver(state)) return;
  const { newState, result } = fireAt(state, "ai", cell);
  if (result === "no-op") return; // engine already decided this changes nothing
  state = newState;
  render();
  if (isGameOver(state)) return;

  busy = true;
  els.aiBoard.classList.add("board-locked");
  try {
    await sleep(RESULT_PAUSE_MS);
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

function startNewGame() {
  state = createGame();
  busy = false;
  explainOpen = false;
  clearHeatmap();
  renderBattleReport("");
  renderEfficiencyStat("");
  render();
}

function init() {
  cacheElements();
  buildGrid(els.aiBoard, { clickable: true });
  buildGrid(els.playerBoard, { clickable: false });
  buildHeatmapGrid();

  els.aiBoard.addEventListener("click", (event) => {
    const cellEl = event.target.closest(".cell");
    if (!cellEl) return;
    onPlayerShot({ row: Number(cellEl.dataset.row), col: Number(cellEl.dataset.col) });
  });
  els.playerBoard.addEventListener("click", onPlayerBoardClick);
  els.newGame.addEventListener("click", startNewGame);

  startNewGame();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}
