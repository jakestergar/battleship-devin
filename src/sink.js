// Cinematic sink callout.
//
// Sinking a ship is the emotional peak of a Battleship game and, until now,
// it passed by as a status-line sentence. This module gives it a moment: the
// vessel's own portrait, its name, and how many hits it took.
//
// On the artwork: these are 3/4 perspective renders on a near-black
// background with no alpha channel, so they cannot be laid over the grid —
// they will not rotate for vertical ships and their aspect ratio is nothing
// like a 5:1 hull. A full-bleed callout is exactly where perspective art
// works, because nothing has to line up with a cell.
//
// The black background is removed at render time with `mix-blend-mode:
// screen` rather than by editing the files: the art is bright red on near
// black, and screen blending maps black to transparent. No alpha channel, no
// image editing, no build step.
//
// Additive layer, per the PRD's non-functional requirements: every entry
// point is wrapped, and a failure here leaves the roster and status line —
// which already report sinkings — as the fallback.

const ART = {
  carrier: "assets/ships/carrier.png",
  battleship: "assets/ships/battleship.png",
  cruiser: "assets/ships/cruiser.png",
  submarine: "assets/ships/submarine.png",
  destroyer: "assets/ships/destroyer.png",
};

const HOLD_MS = 2100;

/**
 * Preloads the artwork so the first sinking of a session isn't a blank frame
 * while the browser fetches a 200KB image. Failures are ignored: a missing
 * image degrades to a text-only callout.
 */
export function preloadShipArt() {
  try {
    for (const src of Object.values(ART)) {
      const img = new Image();
      img.src = src;
    }
  } catch {
    /* preloading is an optimisation, never a requirement */
  }
}

/**
 * Creates the callout layer. Returns an `announce` function; the caller is
 * responsible for deciding *when* a ship sank (see `ui.js`), this module only
 * decides how it looks.
 *
 * `side` is "enemy" when the player sank an AI ship (a win, drawn in
 * phosphor) and "own" when the player lost one (drawn in klaxon, which the
 * design tokens reserve for damage).
 */
export function mountSinkCallout(rootEl) {
  let layer = null;
  let timer = null;

  try {
    layer = document.createElement("div");
    layer.className = "sink-callout";
    layer.setAttribute("aria-hidden", "true");
    rootEl.appendChild(layer);
    preloadShipArt();
  } catch {
    return { announce() {}, destroy() {} };
  }

  function clear() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    layer.classList.remove("is-live");
    layer.textContent = "";
  }

  function announce(shipId, length, side) {
    try {
      if (!layer) return;
      clear();

      const card = document.createElement("div");
      card.className = `sink-card sink-${side === "own" ? "own" : "enemy"}`;

      const src = ART[shipId];
      if (src) {
        const img = document.createElement("img");
        img.className = "sink-art";
        img.src = src;
        img.alt = "";
        card.appendChild(img);
      }

      const name = document.createElement("p");
      name.className = "sink-name";
      name.textContent = `${shipId} ${side === "own" ? "lost" : "down"}`;
      card.appendChild(name);

      const meta = document.createElement("p");
      meta.className = "sink-meta";
      meta.textContent =
        side === "own"
          ? `${length} sections destroyed`
          : `${length} hits to sink`;
      card.appendChild(meta);

      layer.appendChild(card);
      // Force a reflow so the entry transition actually runs rather than
      // being collapsed into the same frame as the insert.
      void layer.offsetWidth;
      layer.classList.add("is-live");

      timer = setTimeout(clear, HOLD_MS);
    } catch {
      /* decorative — the roster already shows the ship as sunk */
    }
  }

  return {
    announce,
    destroy() {
      try {
        clear();
        layer?.remove();
      } catch {
        /* nothing meaningful to recover */
      }
    },
  };
}
