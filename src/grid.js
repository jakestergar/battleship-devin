// Shared board geometry: the `{row, col}` cell vocabulary that the engine,
// the AI, and the UI all speak. Pure — no game rules, no DOM, no state.
//
// Every module used to carry its own `key()`, its own bounds check and its
// own nested row/col loops; those all live here now so a change to the cell
// encoding is a one-file change.

export const ORIENTATIONS = ["horizontal", "vertical"];

/** The canonical string encoding of a cell, used as Set/Map keys. */
export function key(row, col) {
  return `${row},${col}`;
}

export function cellKey(cell) {
  return key(cell.row, cell.col);
}

export function parseKey(cellKeyString) {
  const [row, col] = cellKeyString.split(",").map(Number);
  return { row, col };
}

export function sameCell(a, b) {
  return Boolean(a && b && a.row === b.row && a.col === b.col);
}

export function inBounds(cell, size) {
  return cell.row >= 0 && cell.row < size && cell.col >= 0 && cell.col < size;
}

/** The cells a ship of `length` covers when its bow-most cell is (row, col). */
export function cellsForPlacement(row, col, length, orientation) {
  const cells = [];
  for (let i = 0; i < length; i++) {
    cells.push(
      orientation === "horizontal" ? { row, col: col + i } : { row: row + i, col }
    );
  }
  return cells;
}

/** Visits every cell of a `size` x `size` board in row-major order. */
export function forEachCell(size, visit) {
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) visit(row, col);
  }
}

/** A `size` x `size` grid, each cell produced by `valueAt` (0 by default). */
export function buildGrid(size, valueAt = () => 0) {
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => valueAt(row, col))
  );
}

/**
 * Visits the cells of every fully in-bounds placement of a ship of `length`
 * on a `size` board, in both orientations. Occupancy is the caller's
 * business: the engine rejects overlaps, the AI weights them.
 */
export function forEachPlacement(size, length, visit) {
  for (const orientation of ORIENTATIONS) {
    const maxRow = orientation === "vertical" ? size - length : size - 1;
    const maxCol = orientation === "horizontal" ? size - length : size - 1;
    for (let row = 0; row <= maxRow; row++) {
      for (let col = 0; col <= maxCol; col++) {
        visit(cellsForPlacement(row, col, length, orientation));
      }
    }
  }
}

/**
 * The keys covered by `ships` (anything with a `cells` array — a Board's
 * ships or an in-progress placement layout). `exceptId` omits one ship, so a
 * ship can be tested against a layout it is itself part of.
 */
export function occupiedKeys(ships, { exceptId = null } = {}) {
  const occupied = new Set();
  for (const ship of ships) {
    if (exceptId !== null && ship.id === exceptId) continue;
    for (const cell of ship.cells) occupied.add(cellKey(cell));
  }
  return occupied;
}

/** Whether `cells` are all in-bounds and clear of the `occupied` keys. */
export function placementFits(cells, size, occupied) {
  return (
    cells.every((cell) => inBounds(cell, size)) &&
    cells.every((cell) => !occupied.has(cellKey(cell)))
  );
}

export function findShipAt(ships, cell) {
  return ships.find((ship) => ship.cells.some((c) => sameCell(c, cell)));
}

export function randomInt(n) {
  return Math.floor(Math.random() * n);
}

export function pickRandom(items) {
  return items[randomInt(items.length)];
}
