// Pure, immutable Battleship game engine.
// No DOM, no AI decision-making — see planning/technical-design.md for the
// full data contract this module implements.

import {
  cellKey,
  cellsForPlacement,
  findShipAt,
  forEachPlacement,
  inBounds,
  pickRandom,
} from "./grid.js";

export { cellsForPlacement };

export const BOARD_SIZE = 10;

export const FLEET = [
  { id: "carrier", length: 5 },
  { id: "battleship", length: 4 },
  { id: "cruiser", length: 3 },
  { id: "submarine", length: 3 },
  { id: "destroyer", length: 2 },
];

/**
 * Enumerate every legal placement (both orientations, all positions) for a
 * ship of the given length on a board of the given size, given a set of
 * already-occupied cell keys. "Legal" = fully in-bounds, no overlap.
 */
export function enumerateLegalPlacements(length, size, occupied) {
  const placements = [];
  forEachPlacement(size, length, (cells) => {
    if (cells.some((c) => occupied.has(cellKey(c)))) return;
    placements.push(cells);
  });
  return placements;
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
      const cells = pickRandom(placements);
      cells.forEach((c) => occupied.add(cellKey(c)));
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
    const actual = new Set(ship.cells.map(cellKey));
    if (!expected.every((c) => actual.has(cellKey(c)))) {
      return { valid: false, error: `The ${id} must occupy adjacent cells.` };
    }

    for (const cell of ship.cells) {
      if (occupied.has(cellKey(cell))) {
        return { valid: false, error: `The ${id} overlaps another ship.` };
      }
      occupied.add(cellKey(cell));
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

function boardFullySunk(board) {
  return board.ships.every((s) => s.sunk);
}

/**
 * Fires at `cell` on `targetBoard` ("player" or "ai") within `state`.
 * Pure: returns { newState, result } and never mutates `state`.
 * Firing at an already-fired-upon cell is a no-op.
 */
export function fireAt(state, targetBoard, cell) {
  const shotKey = cellKey(cell);
  const board = targetBoard === "player" ? state.playerBoard : state.aiBoard;

  if (board.shotsReceived.has(shotKey)) {
    return { newState: state, result: "no-op" };
  }

  const next = cloneState(state);
  const nextBoard = targetBoard === "player" ? next.playerBoard : next.aiBoard;
  nextBoard.shotsReceived.add(shotKey);

  const ship = findShipAt(nextBoard.ships, cell);
  let result = "miss";
  let shipId = null;

  if (ship) {
    const nextShip = nextBoard.ships.find((s) => s.id === ship.id);
    nextShip.hits.add(shotKey);
    shipId = nextShip.id;
    const isSunk = nextShip.cells.every((c) => nextShip.hits.has(cellKey(c)));
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

/** Every history entry logged by `actor`, oldest first. */
export function shotsBy(state, actor) {
  return state.history.filter((entry) => entry.actor === actor);
}

/** The most recent history entry logged by `actor`, or `null`. */
export function lastShotBy(state, actor) {
  for (let i = state.history.length - 1; i >= 0; i--) {
    if (state.history[i].actor === actor) return state.history[i];
  }
  return null;
}
