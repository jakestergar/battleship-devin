// Tests src/ships.js, which is pure markup generation — no DOM, no state.
import test from "node:test";
import assert from "node:assert/strict";

import { FLEET } from "../src/engine.js";
import { shipSvg } from "../src/ships.js";
import { isHorizontal } from "../src/ui.js";

test("every fleet class has a drawing sized to its cell count", () => {
  for (const { id, length } of FLEET) {
    const svg = shipSvg(id, length);
    assert.match(svg, /^<svg /, `${id} produced no drawing`);
    assert.match(
      svg,
      new RegExp(`viewBox="0 0 ${length * 100} 100"`),
      `${id}'s viewBox does not span its ${length} cells`
    );
    assert.match(svg, /class="ship-(hull|art)/);
  }
});

test("an unknown ship or a zero length yields no markup rather than throwing", () => {
  assert.equal(shipSvg("dreadnought", 4), "");
  assert.equal(shipSvg("carrier", 0), "");
  assert.equal(shipSvg(undefined, undefined), "");
});

test("isHorizontal reads orientation off the cells, treating one cell as horizontal", () => {
  assert.equal(
    isHorizontal({ cells: [{ row: 2, col: 1 }, { row: 2, col: 2 }] }),
    true
  );
  assert.equal(
    isHorizontal({ cells: [{ row: 1, col: 3 }, { row: 2, col: 3 }] }),
    false
  );
  assert.equal(isHorizontal({ cells: [{ row: 0, col: 0 }] }), true);
});
