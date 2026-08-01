// Tests the shared board geometry in src/grid.js — the cell vocabulary the
// engine, the AI and the UI all build on.
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildGrid,
  cellKey,
  cellsForPlacement,
  findShipAt,
  forEachCell,
  forEachPlacement,
  key,
  occupiedKeys,
  parseKey,
  placementFits,
  sameCell,
} from "../src/grid.js";

test("cell keys round-trip through parseKey", () => {
  assert.equal(key(3, 7), "3,7");
  assert.equal(cellKey({ row: 3, col: 7 }), "3,7");
  assert.deepEqual(parseKey(key(3, 7)), { row: 3, col: 7 });
});

test("sameCell compares coordinates and tolerates missing cells", () => {
  assert.equal(sameCell({ row: 1, col: 2 }, { row: 1, col: 2 }), true);
  assert.equal(sameCell({ row: 1, col: 2 }, { row: 2, col: 1 }), false);
  assert.equal(sameCell(null, { row: 1, col: 2 }), false);
});

test("cellsForPlacement runs the requested length in the requested direction", () => {
  assert.deepEqual(cellsForPlacement(1, 2, 3, "horizontal"), [
    { row: 1, col: 2 },
    { row: 1, col: 3 },
    { row: 1, col: 4 },
  ]);
  assert.deepEqual(cellsForPlacement(1, 2, 2, "vertical"), [
    { row: 1, col: 2 },
    { row: 2, col: 2 },
  ]);
});

test("forEachCell and buildGrid cover the whole board in row-major order", () => {
  const visited = [];
  forEachCell(3, (row, col) => visited.push(key(row, col)));
  assert.equal(visited.length, 9);
  assert.equal(visited[0], "0,0");
  assert.equal(visited[8], "2,2");

  assert.deepEqual(buildGrid(2), [
    [0, 0],
    [0, 0],
  ]);
  assert.deepEqual(buildGrid(2, (row, col) => row + col), [
    [0, 1],
    [1, 2],
  ]);
});

test("forEachPlacement enumerates every in-bounds placement, both orientations", () => {
  const seen = [];
  forEachPlacement(3, 2, (cells) => seen.push(cells.map(cellKey).join(" ")));
  // 3 rows x 2 horizontal starts + 3 cols x 2 vertical starts.
  assert.equal(seen.length, 12);
  assert.ok(seen.includes("0,0 0,1"));
  assert.ok(seen.includes("1,2 2,2"));
  assert.ok(seen.every((placement) => !placement.includes("3")));

  const tooLong = [];
  forEachPlacement(3, 4, (cells) => tooLong.push(cells));
  assert.equal(tooLong.length, 0);
});

test("occupiedKeys collects a layout's cells and can exclude one ship", () => {
  const layout = [
    { id: "destroyer", cells: [{ row: 0, col: 0 }, { row: 0, col: 1 }] },
    { id: "cruiser", cells: [{ row: 2, col: 2 }] },
  ];
  assert.deepEqual([...occupiedKeys(layout)], ["0,0", "0,1", "2,2"]);
  assert.deepEqual([...occupiedKeys(layout, { exceptId: "destroyer" })], ["2,2"]);
});

test("placementFits rejects off-board and overlapping placements", () => {
  const occupied = new Set(["1,1"]);
  assert.equal(placementFits([{ row: 0, col: 0 }], 3, occupied), true);
  assert.equal(placementFits([{ row: 1, col: 1 }], 3, occupied), false);
  assert.equal(placementFits([{ row: 3, col: 0 }], 3, occupied), false);
  assert.equal(placementFits([{ row: 0, col: -1 }], 3, occupied), false);
});

test("findShipAt returns the ship covering a cell, or undefined", () => {
  const ships = [
    { id: "destroyer", cells: [{ row: 0, col: 0 }, { row: 0, col: 1 }] },
  ];
  assert.equal(findShipAt(ships, { row: 0, col: 1 }).id, "destroyer");
  assert.equal(findShipAt(ships, { row: 5, col: 5 }), undefined);
});
