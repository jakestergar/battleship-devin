// Pure, immutable Battleship game engine.
// No DOM, no AI decision-making — see planning/technical-design.md for the
// full data contract this module implements.

export const BOARD_SIZE = 10;

export const FLEET = [
  { id: "carrier", length: 5 },
  { id: "battleship", length: 4 },
  { id: "cruiser", length: 3 },
  { id: "submarine", length: 3 },
  { id: "destroyer", length: 2 },
];

function key(row, col) {
  return `${row},${col}`;
}

function cellsForPlacement(row, col, length, orientation) {
  const cells = [];
  for (let i = 0; i < length; i++) {
    cells.push(
      orientation === "horizontal"
        ? { row, col: col + i }
        : { row: row + i, col }
    );
  }
  return cells;
}

function inBounds(cell, size) {
  return cell.row >= 0 && cell.row < size && cell.col >= 0 && cell.col < size;
}

/**
 * Enumerate every legal placement (both orientations, all positions) for a
 * ship of the given length on a board of the given size, given a set of
 * already-occupied cell keys. "Legal" = fully in-bounds, no overlap.
 */
function enumerateLegalPlacements(length, size, occupied) {
  const placements = [];
  for (const orientation of ["horizontal", "vertical"]) {
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const cells = cellsForPlacement(row, col, length, orientation);
        if (!cells.every((c) => inBounds(c, size))) continue;
        if (cells.some((c) => occupied.has(key(c.row, c.col)))) continue;
        placements.push(cells);
      }
    }
  }
  return placements;
}

function randomInt(n) {
  return Math.floor(Math.random() * n);
}

/**
 * Places the full fleet on a board of the given size using a largest-ship-
 * first, enumerate-and-backtrack strategy: process ships largest to
 * smallest, pick a uniformly random legal placement for each, and restart
 * the whole board if any ship runs out of legal placements. This avoids the
 * dead-ends naive trial-and-error placement can hit on small ships placed
 * last (see planning/technical-design.md).
 */
function placeFleet(size) {
  const shipsLargestFirst = [...FLEET].sort((a, b) => b.length - a.length);

  while (true) {
    const occupied = new Set();
    const ships = [];
    let failed = false;

    for (const { id, length } of shipsLargestFirst) {
      const placements = enumerateLegalPlacements(length, size, occupied);
      if (placements.length === 0) {
        failed = true;
        break;
      }
      const cells = placements[randomInt(placements.length)];
      cells.forEach((c) => occupied.add(key(c.row, c.col)));
      ships.push({ id, length, cells, hits: new Set(), sunk: false });
    }

    if (!failed) {
      // Restore original fleet order (not largest-first) for readability.
      const byId = new Map(ships.map((s) => [s.id, s]));
      return FLEET.map((f) => byId.get(f.id));
    }
    // else: retry the whole board from scratch
  }
}

function createBoard(size) {
  return {
    size,
    ships: placeFleet(size),
    shotsReceived: new Set(),
  };
}

export function createGame() {
  return {
    playerBoard: createBoard(BOARD_SIZE),
    aiBoard: createBoard(BOARD_SIZE),
    turn: "player",
    status: "in_progress",
    history: [],
  };
}

function cloneBoard(board) {
  return {
    size: board.size,
    ships: board.ships.map((s) => ({
      ...s,
      cells: s.cells.map((c) => ({ ...c })),
      hits: new Set(s.hits),
    })),
    shotsReceived: new Set(board.shotsReceived),
  };
}

function cloneState(state) {
  return {
    playerBoard: cloneBoard(state.playerBoard),
    aiBoard: cloneBoard(state.aiBoard),
    turn: state.turn,
    status: state.status,
    history: state.history.map((h) => ({ ...h })),
  };
}

function findShipAt(board, cell) {
  return board.ships.find((s) =>
    s.cells.some((c) => c.row === cell.row && c.col === cell.col)
  );
}

function boardFullySunk(board) {
  return board.ships.every((s) => s.sunk);
}

/**
 * Fires at `cell` on `targetBoard` ("player" or "ai") within `state`.
 * Pure: returns { newState, result } and never mutates `state`.
 * Firing at an already-fired-upon cell is a no-op.
 */
export function fireAt(state, targetBoard, cell) {
  const cellKey = key(cell.row, cell.col);
  const board = targetBoard === "player" ? state.playerBoard : state.aiBoard;

  if (board.shotsReceived.has(cellKey)) {
    return { newState: state, result: "no-op" };
  }

  const next = cloneState(state);
  const nextBoard = targetBoard === "player" ? next.playerBoard : next.aiBoard;
  nextBoard.shotsReceived.add(cellKey);

  const ship = findShipAt(nextBoard, cell);
  let result = "miss";
  let shipId = null;

  if (ship) {
    const nextShip = nextBoard.ships.find((s) => s.id === ship.id);
    nextShip.hits.add(cellKey);
    shipId = nextShip.id;
    const isSunk = nextShip.cells.every((c) => nextShip.hits.has(key(c.row, c.col)));
    if (isSunk) {
      nextShip.sunk = true;
      result = "sunk";
    } else {
      result = "hit";
    }
  }

  const turnNumber = next.history.length + 1;
  next.history.push({
    turnNumber,
    actor: state.turn,
    cell: { ...cell },
    result,
    shipId,
    probabilityMapSnapshot: null,
    confidence: null,
    explanation: null,
  });

  if (boardFullySunk(nextBoard)) {
    next.status = targetBoard === "player" ? "ai_won" : "player_won";
  } else {
    next.turn = state.turn === "player" ? "ai" : "player";
  }

  return { newState: next, result };
}

export function isGameOver(state) {
  return state.status !== "in_progress";
}
