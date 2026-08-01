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

export function cellsForPlacement(row, col, length, orientation) {
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
export function enumerateLegalPlacements(length, size, occupied) {
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

// A full-board restart is rare (the largest-first order almost always
// succeeds on the first attempt), so an unbounded retry loop only ever spins
// forever on a fleet/board combination that cannot be satisfied at all. Cap
// it and fail loudly instead of hanging the caller.
const MAX_PLACEMENT_ATTEMPTS = 1000;

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

  for (let attempt = 0; attempt < MAX_PLACEMENT_ATTEMPTS; attempt++) {
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

  throw new Error(
    `Could not place the fleet on a ${size}x${size} board after ` +
      `${MAX_PLACEMENT_ATTEMPTS} attempts.`
  );
}

function createBoard(size, ships = placeFleet(size)) {
  return {
    size,
    ships,
    shotsReceived: new Set(),
  };
}

/**
 * Builds a random but legal fleet layout in the `[{ id, length, cells }]`
 * shape `createGame` accepts, for seeding or re-rolling manual placement.
 */
export function randomFleetLayout(size = BOARD_SIZE) {
  return placeFleet(size).map((ship) => ({
    id: ship.id,
    length: ship.length,
    cells: ship.cells.map((c) => ({ ...c })),
  }));
}

/**
 * Validates a proposed fleet layout: exactly the FLEET ships, each a
 * straight, contiguous, in-bounds run of its own length, with no overlaps.
 * Returns `{ valid, error }` rather than throwing so callers (the placement
 * UI) can surface the reason.
 */
export function validateFleetLayout(layout, size = BOARD_SIZE) {
  if (!Array.isArray(layout) || layout.length !== FLEET.length) {
    return { valid: false, error: `Expected ${FLEET.length} ships.` };
  }

  const occupied = new Set();
  for (const { id, length } of FLEET) {
    const ship = layout.find((s) => s && s.id === id);
    if (!ship) return { valid: false, error: `Missing the ${id}.` };
    if (!Array.isArray(ship.cells) || ship.cells.length !== length) {
      return { valid: false, error: `The ${id} must cover ${length} cells.` };
    }
    if (!ship.cells.every((c) => c && inBounds(c, size))) {
      return { valid: false, error: `The ${id} is off the board.` };
    }

    const rows = new Set(ship.cells.map((c) => c.row));
    const cols = new Set(ship.cells.map((c) => c.col));
    const orientation =
      rows.size === 1 ? "horizontal" : cols.size === 1 ? "vertical" : null;
    if (!orientation) {
      return { valid: false, error: `The ${id} must sit in a straight line.` };
    }
    const start = ship.cells.reduce((a, b) =>
      a.row + a.col <= b.row + b.col ? a : b
    );
    const expected = cellsForPlacement(start.row, start.col, length, orientation);
    const actual = new Set(ship.cells.map((c) => key(c.row, c.col)));
    if (!expected.every((c) => actual.has(key(c.row, c.col)))) {
      return { valid: false, error: `The ${id} must occupy adjacent cells.` };
    }

    for (const cell of ship.cells) {
      const cellKey = key(cell.row, cell.col);
      if (occupied.has(cellKey)) {
        return { valid: false, error: `The ${id} overlaps another ship.` };
      }
      occupied.add(cellKey);
    }
  }

  return { valid: true, error: null };
}

function shipsFromLayout(layout) {
  return FLEET.map(({ id, length }) => {
    const ship = layout.find((s) => s.id === id);
    return {
      id,
      length,
      cells: ship.cells.map((c) => ({ ...c })),
      hits: new Set(),
      sunk: false,
    };
  });
}

/**
 * Creates a new game. The player's fleet is randomly placed unless
 * `playerFleetLayout` supplies a layout (the manual placement phase); an
 * invalid layout throws, since continuing would corrupt the board.
 */
export function createGame(playerFleetLayout = null) {
  let playerShips;
  if (playerFleetLayout) {
    const { valid, error } = validateFleetLayout(playerFleetLayout, BOARD_SIZE);
    if (!valid) throw new Error(`Invalid fleet layout: ${error}`);
    playerShips = shipsFromLayout(playerFleetLayout);
  }

  return {
    playerBoard: createBoard(BOARD_SIZE, playerShips),
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

function isCellOnBoard(cell, size) {
  return (
    Boolean(cell) &&
    Number.isInteger(cell.row) &&
    Number.isInteger(cell.col) &&
    inBounds(cell, size)
  );
}

/**
 * Fires at `cell` on `targetBoard` ("player" or "ai") within `state`.
 * Pure: returns { newState, result } and never mutates `state`.
 * Firing at an already-fired-upon cell is a no-op.
 *
 * An unknown target board, an off-board cell, or a shot after the game has
 * ended are caller bugs rather than game events, so they throw: resolving
 * them into a plausible-looking shot would silently corrupt the board and
 * every statistic derived from it.
 */
export function fireAt(state, targetBoard, cell) {
  if (targetBoard !== "player" && targetBoard !== "ai") {
    throw new Error(
      `fireAt: target board must be "player" or "ai", got ${JSON.stringify(targetBoard)}.`
    );
  }
  if (isGameOver(state)) {
    throw new Error(`fireAt: the game is already over (status "${state.status}").`);
  }

  const board = targetBoard === "player" ? state.playerBoard : state.aiBoard;
  if (!isCellOnBoard(cell, board.size)) {
    throw new RangeError(`fireAt: ${JSON.stringify(cell)} is not a cell on the board.`);
  }

  const cellKey = key(cell.row, cell.col);

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
