// Small DOM conveniences shared by the rendering code. No game state and no
// game rules — this module only knows about elements.

/** Creates an element, optionally with a class list and text content. */
export function el(tag, className = "", text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== null) node.textContent = text;
  return node;
}

/** Appends `count` identical elements to `parent` and returns it. */
export function repeat(parent, count, make) {
  for (let i = 0; i < count; i++) parent.appendChild(make(i));
  return parent;
}

/** The `{row, col}` a `.cell` element carries in its dataset. */
export function cellCoords(cellEl) {
  return { row: Number(cellEl.dataset.row), col: Number(cellEl.dataset.col) };
}

/** The `.cell` an event landed in, or `null`. */
export function eventCell(event) {
  return event.target.closest(".cell");
}
