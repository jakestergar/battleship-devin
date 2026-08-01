/* BATTLESTATION — Animation logic (vendored from the design-system package).
   Reusable functions that trigger/position the effects defined in
   animations.css. No game logic (board state, ship placement, hit
   detection) lives here on purpose — call these from your own game
   loop wherever a shot is fired or resolved.

   Requires the animations.css `bs-*` classes to be loaded on the page.

   Vendored verbatim apart from ES-module exports and the Web Animations
   guard in launchMissile(), so a browser without `Element.animate` still
   resolves the shot instead of stalling the turn. */

/**
 * Position a reticle element over a target cell, relative to a
 * positioned container. Call on mousemove.
 */
export function positionReticle(reticleEl, targetCellEl, containerEl) {
  const cRect = containerEl.getBoundingClientRect();
  const tRect = targetCellEl.getBoundingClientRect();
  const x = tRect.left - cRect.left;
  const y = tRect.top - cRect.top;
  reticleEl.style.transform = `translate(${x}px, ${y}px)`;
}

/** Hide a reticle (e.g. on mouseleave). */
export function hideReticle(reticleEl) {
  reticleEl.style.transform = "translate(-9999px,-9999px)";
}

/**
 * Build Web Animations API keyframes for a parabolic arc between two
 * points, with each keyframe rotated to face the direction of travel.
 * Coordinates should already be relative to the same positioned
 * container the missile element lives in.
 */
export function computeArcKeyframes(startX, startY, endX, endY, steps = 24) {
  const dist = Math.hypot(endX - startX, endY - startY);
  const arcHeight = Math.max(60, dist * 0.35);
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = startX + (endX - startX) * t;
    const yLinear = startY + (endY - startY) * t;
    const y = yLinear - Math.sin(Math.PI * t) * arcHeight;
    pts.push({ x, y });
  }
  return pts.map((p, i) => {
    const next = pts[i + 1] || pts[i - 1] || p;
    const angle = (Math.atan2(next.y - p.y, next.x - p.x) * 180) / Math.PI;
    return { transform: `translate(${p.x}px, ${p.y}px) rotate(${angle}deg)` };
  });
}

/**
 * Launch a missile element from source to target inside a container.
 * Creates the element, animates it, removes it, then calls onArrive().
 * sourceEl/targetEl/containerEl are DOM elements; containerEl must be
 * position:relative (or similar) since the missile is positioned
 * absolutely within it.
 *
 * sourceEl should be an actual cell on the player's own fleet board
 * (e.g. the ship closest to the opponent's board) — not an abstract
 * launcher icon — so the shot visibly originates from a real ship.
 */
export function launchMissile(
  containerEl,
  sourceEl,
  targetEl,
  onArrive,
  opts = {}
) {
  const cRect = containerEl.getBoundingClientRect();
  const sRect = sourceEl.getBoundingClientRect();
  const tRect = targetEl.getBoundingClientRect();

  const startX = sRect.left - cRect.left + sRect.width / 2;
  const startY = sRect.top - cRect.top + sRect.height / 3;
  const endX = tRect.left - cRect.left + tRect.width / 2;
  const endY = tRect.top - cRect.top + tRect.height / 2;

  const missile = document.createElement("div");
  missile.className = "bs-missile";
  containerEl.appendChild(missile);

  if (typeof missile.animate !== "function") {
    missile.remove();
    if (onArrive) onArrive();
    return null;
  }

  const keyframes = computeArcKeyframes(startX, startY, endX, endY);
  const anim = missile.animate(keyframes, {
    duration: opts.duration ?? 650,
    easing: "linear",
    fill: "forwards",
  });

  // A cancelled animation never fires `onfinish`, which used to leave the
  // missile node on the board forever and the shot unreported. Both paths
  // land here, and only the first one counts.
  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    missile.remove();
    if (onArrive) onArrive();
  };

  anim.onfinish = settle;
  anim.oncancel = settle;
  anim.onremove = settle;

  return anim;
}

/**
 * Build the "fire" effect node (hit, non-final ship segment):
 * white-hot flash + flickering flame + 5 rising embers.
 * Append to a position:relative cell, remove after ~1.4s.
 */
export function fxFire() {
  const wrap = document.createElement("div");
  wrap.className = "bs-fx-fire";

  const flash = document.createElement("div");
  flash.className = "bs-fx-flash";
  wrap.appendChild(flash);

  const flame = document.createElement("div");
  flame.className = "flame";
  wrap.appendChild(flame);

  for (let i = 0; i < 5; i++) {
    const ember = document.createElement("div");
    ember.className = "ember";
    ember.style.setProperty("--ex", `${Math.random() * 20 - 10}px`);
    ember.style.animationDelay = `${Math.random() * 0.3}s`;
    ember.style.left = `${46 + Math.random() * 10}%`;
    wrap.appendChild(ember);
  }
  return wrap;
}

/**
 * Build the "explosion" effect node (sink, final ship segment):
 * core burst + shockwave ring + 10 flying debris pieces.
 * Append to a position:relative cell, remove after ~1.4s.
 * Deliberately a larger visual magnitude than fxFire().
 */
export function fxExplosion() {
  const wrap = document.createElement("div");
  wrap.className = "bs-fx-explosion";

  const core = document.createElement("div");
  core.className = "core";
  wrap.appendChild(core);

  const shock = document.createElement("div");
  shock.className = "shock";
  wrap.appendChild(shock);

  for (let i = 0; i < 10; i++) {
    const deb = document.createElement("div");
    deb.className = "debris";
    deb.style.setProperty("--ang", `${i * 36}deg`);
    deb.style.animationDelay = `${Math.random() * 0.08}s`;
    wrap.appendChild(deb);
  }
  return wrap;
}

/**
 * Attach an fx node (from fxFire/fxExplosion) to a cell and auto-remove
 * it once its animation has finished playing.
 */
export function spawnFx(cellEl, fxNode, lifespanMs = 1400) {
  cellEl.style.position = "relative";
  cellEl.appendChild(fxNode);
  setTimeout(() => fxNode.remove(), lifespanMs);
}

/** Trigger the screen-shake class on a container, restartable. */
export function triggerShake(containerEl) {
  containerEl.classList.remove("bs-shake");
  void containerEl.offsetWidth; // force reflow so the animation can restart
  containerEl.classList.add("bs-shake");
}

/** Sonar ping on hit confirmation — two expanding phosphor rings. */
export function spawnPing(cellEl, lifespanMs = 2000) {
  const ping = document.createElement("div");
  ping.className = "bs-ping";
  cellEl.style.position = "relative";
  cellEl.appendChild(ping);
  setTimeout(() => ping.remove(), lifespanMs);
}

/** One-shot screen-edge klaxon flash — only when your own ship is hit. */
export function klaxonFlash(lifespanMs = 900) {
  const flash = document.createElement("div");
  flash.className = "bs-klaxon-flash";
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), lifespanMs);
}
