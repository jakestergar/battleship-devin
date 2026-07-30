// Top-down ship silhouettes, drawn as SVG rather than shipped as images:
// the board renders at ~40px cells but has to stay sharp at any zoom, and a
// damaged hull recolours from --brass to --klaxon by changing a fill — a
// raster sprite would need a second red copy of every ship.
//
// This module is pure geometry. It knows nothing about game state: it takes a
// ship id and a length and returns markup. Every drawing is authored in a
// viewBox of `length * 100` by `100` units, bow pointing right, and the UI
// rotates it for vertically placed ships.
//
// Detail budget: a 3-cell ship is ~120px across on screen, so shapes have to
// survive being drawn a few pixels tall. Each class is distinguished by one
// silhouette-level cue (carrier: full-length flight deck; battleship: three
// turrets; cruiser: two turrets and a tall bridge; submarine: capsule hull
// with a conning tower; destroyer: single turret and an open afterdeck)
// rather than by fine surface detail that would vanish.

const UNIT = 100;
const BEAM_TOP = 20;
const BEAM_BOTTOM = 80;
const KEEL = (BEAM_TOP + BEAM_BOTTOM) / 2;

/**
 * The shared hull outline: a squared-off stern at the left running out to a
 * pointed bow at the right. Every surface ship is this plus superstructure.
 */
function hullPath(width) {
  const shoulder = width - Math.min(78, width * 0.3);
  return [
    `M 5 ${BEAM_TOP}`,
    `L ${shoulder} ${BEAM_TOP}`,
    `C ${width - 26} ${BEAM_TOP + 2} ${width - 8} ${KEEL - 10} ${width - 1} ${KEEL}`,
    `C ${width - 8} ${KEEL + 10} ${width - 26} ${BEAM_BOTTOM - 2} ${shoulder} ${BEAM_BOTTOM}`,
    `L 5 ${BEAM_BOTTOM}`,
    `Q 0 ${BEAM_BOTTOM} 0 ${BEAM_BOTTOM - 6}`,
    `L 0 ${BEAM_TOP + 6}`,
    `Q 0 ${BEAM_TOP} 5 ${BEAM_TOP}`,
    "Z",
  ].join(" ");
}

/**
 * The recessed weather deck. Deliberately narrower than the hull so brass
 * plating still frames it — the hull, not the deck, is what says "yours".
 */
function deck(width) {
  const end = width - Math.min(104, width * 0.38);
  return `<rect class="ship-deck" x="11" y="${KEEL - 15}" width="${Math.max(
    22,
    end
  )}" height="30" rx="6" />`;
}

/** A gun turret: a pale housing with its barrel trained toward the bow. */
function turret(x, radius = 12) {
  return `<rect class="ship-barrel" x="${x + radius - 2}" y="${KEEL - 2.5}" width="${
    radius * 1.8
  }" height="5" rx="2.5" /><circle class="ship-turret" cx="${x}" cy="${KEEL}" r="${radius}" />`;
}

/** A funnel, drawn wider than tall so it survives at board scale. */
function funnel(x, w = 12) {
  return `<rect class="ship-funnel" x="${x}" y="${KEEL - 11}" width="${w}" height="22" rx="3" />`;
}

/** Bridge / superstructure block, with a mast rising off its front edge. */
function bridge(x, w, h = 34) {
  return `<rect class="ship-tower" x="${x}" y="${KEEL - h / 2}" width="${w}" height="${h}" rx="4" />
    <rect class="ship-mast" x="${x + w * 0.55}" y="${KEEL - h / 2 - 12}" width="4" height="16" rx="2" />`;
}

function surfaceShip(width, superstructure) {
  return `<path class="ship-hull" d="${hullPath(width)}" />${deck(width)}${superstructure}`;
}

/**
 * The carrier reads as a carrier because of the full-length flight deck and
 * the island shouldered off the centreline, not because it is the longest.
 */
function carrier(width) {
  return `<path class="ship-hull" d="${hullPath(width)}" />
    <rect class="ship-flightdeck" x="12" y="26" width="${width - 46}" height="48" rx="8" />
    <path class="ship-runway" d="M 30 ${KEEL} H ${width - 66}" stroke-dasharray="16 14" />
    <rect class="ship-island" x="${width * 0.58}" y="8" width="${
      width * 0.13
    }" height="24" rx="3" />
    <rect class="ship-mast" x="${width * 0.62}" y="0" width="4" height="10" rx="2" />`;
}

function submarine(width) {
  const tower = width * 0.42;
  return `<rect class="ship-hull" x="8" y="26" width="${width - 8}" height="48" rx="24" />
    <path class="ship-deckline" d="M 26 ${KEEL} H ${width - 34}" />
    <rect class="ship-tower" x="${tower}" y="${KEEL - 17}" width="${
      width * 0.19
    }" height="34" rx="14" />
    <rect class="ship-mast" x="${tower + width * 0.085}" y="${KEEL - 32}" width="4" height="18" rx="2" />`;
}

const DRAWINGS = {
  carrier,
  battleship: (w) =>
    surfaceShip(
      w,
      `${turret(w * 0.16)}${turret(w * 0.31)}${funnel(w * 0.55, 14)}${bridge(
        w * 0.4,
        w * 0.12,
        38
      )}${turret(w * 0.68, 11)}`
    ),
  cruiser: (w) =>
    surfaceShip(
      w,
      `${turret(w * 0.2, 12)}${funnel(w * 0.52)}${bridge(w * 0.36, w * 0.13, 36)}${turret(
        w * 0.68,
        10
      )}`
    ),
  submarine,
  // Two cells is barely 80px of drawing, so the destroyer gets one turret and
  // one bridge and nothing else — anything more turns to mush.
  destroyer: (w) =>
    surfaceShip(w, `${bridge(w * 0.3, w * 0.16, 30)}${turret(w * 0.62, 11)}`),
};

/**
 * Markup for one vessel, drawn bow-right across its whole length. Returns an
 * empty string for an unknown id so a fleet change can't break rendering.
 */
export function shipSvg(id, length) {
  const draw = DRAWINGS[id];
  if (!draw || !length) return "";
  const width = length * UNIT;
  return `<svg class="ship-art ship-art-${id}" viewBox="0 0 ${width} ${UNIT}" width="${width}" height="${UNIT}" aria-hidden="true" focusable="false">${draw(
    width
  )}</svg>`;
}
