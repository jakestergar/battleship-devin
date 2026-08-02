// Title / attract screen.
//
// The game used to open on the fleet-placement grid, which reads as a form,
// not as the front of a game. This module owns the copy and the wiring for
// the title screen; its markup lives in index.html (so the shell exists even
// if this module never runs) and its styles live in the "TITLE SCREEN" block
// of src/style.css.
//
// Every number shown here is imported from src/baseline.js — the generated,
// measured harness output — never hardcoded.
//
// Contract: `mountTitle()` never throws. If anything goes wrong it returns
// false and the caller drops straight to the placement screen, so a broken
// attract screen can never make the game unreachable (PRD Section 5).

import {
  AI_AVG_SHOTS,
  RANDOM_BASELINE_AVG_SHOTS,
  EFFICIENCY_VS_RANDOM,
  BASELINE_GAMES_PER_STRATEGY,
} from "./baseline.js";
import { FLEET } from "./engine.js";
import { shipSvg } from "./ships.js";

// ---------------------------------------------------------------------------
// Pure copy logic (no DOM) — this is the part that's unit tested.
// ---------------------------------------------------------------------------

/** 2000 -> "2,000". Plain formatter so the copy reads like prose. */
export function groupThousands(n) {
  if (!Number.isFinite(n)) return "";
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * The three headline figures, in the order they're read: what the AI does,
 * what dumb search does, and the gap between them.
 */
export function titleStats({
  aiAvgShots = AI_AVG_SHOTS,
  randomAvgShots = RANDOM_BASELINE_AVG_SHOTS,
  efficiency = EFFICIENCY_VS_RANDOM,
} = {}) {
  return [
    { value: String(aiAvgShots), unit: "shots", label: "This AI clears the board", key: "ai" },
    { value: String(randomAvgShots), unit: "shots", label: "Random search needs", key: "random" },
    { value: `${efficiency}%`, unit: "fewer", label: "Efficiency gain, measured", key: "gain" },
  ];
}

/** The one-line hook under the wordmark. */
export function hookLine({ efficiency = EFFICIENCY_VS_RANDOM } = {}) {
  return (
    "No guessing. It weighs every ship position still consistent with what it " +
    `has been told, and fires where the odds pile up — ${efficiency}% fewer shots than random search.`
  );
}

/** The provenance footnote under the stat strip. */
export function statsNote({
  games = BASELINE_GAMES_PER_STRATEGY,
  aiAvgShots = AI_AVG_SHOTS,
  randomAvgShots = RANDOM_BASELINE_AVG_SHOTS,
} = {}) {
  return (
    `Mean shots to sink all five ships, measured over ${groupThousands(games)} simulated ` +
    `games per strategy — ${aiAvgShots} vs ${randomAvgShots}. Not an estimate.`
  );
}

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

/**
 * Fills in the measured numbers and wires the three entry points.
 *
 * @param {Element} rootEl  the `#title-screen` section
 * @param {{onStart?: Function, onExhibition?: Function, onArena?: Function}} handlers
 * @returns {boolean} true when the screen is live and interactive
 */
export function mountTitle(rootEl, handlers = {}) {
  try {
    if (!rootEl || !rootEl.ownerDocument) return false;
    const doc = rootEl.ownerDocument;

    const hook = rootEl.querySelector("#about-hook");
    if (hook) hook.textContent = hookLine();

    const note = rootEl.querySelector("#about-note");
    if (note) note.textContent = statsNote();

    const statsEl = rootEl.querySelector("#about-stats");
    if (statsEl) {
      statsEl.textContent = "";
      for (const stat of titleStats()) {
        const li = doc.createElement("li");
        li.className = `about-stat about-stat-${stat.key}`;
        const label = doc.createElement("span");
        label.className = "about-stat-label";
        label.textContent = stat.label;
        const figure = doc.createElement("span");
        figure.className = "about-stat-figure";
        const value = doc.createElement("strong");
        value.textContent = stat.value;
        const unit = doc.createElement("em");
        unit.textContent = stat.unit;
        figure.append(value, unit);
        li.append(label, figure);
        statsEl.appendChild(li);
      }
    }

    // Decorative convoy: the five hulls you're about to deploy. Uses the same
    // silhouettes the board draws, so the title screen is showing the real
    // fleet rather than clip art.
    const fleetEl = rootEl.querySelector("#title-fleet");
    if (fleetEl) {
      fleetEl.textContent = "";
      for (const ship of FLEET) {
        const markup = shipSvg(ship.id, ship.length);
        if (!markup) continue;
        const li = doc.createElement("li");
        li.style.setProperty("--hull-length", String(ship.length));
        li.innerHTML = markup;
        fleetEl.appendChild(li);
      }
    }

    const wire = (id, fn) => {
      const btn = rootEl.querySelector(id);
      if (!btn) return;
      if (typeof fn !== "function") {
        btn.hidden = true;
        return;
      }
      btn.addEventListener("click", () => {
        try {
          fn();
        } catch (error) {
          if (typeof console !== "undefined") console.warn("Title action failed.", error);
        }
      });
    };

    wire("#title-start", handlers.onStart);
    wire("#title-exhibition", handlers.onExhibition);
    wire("#title-arena", handlers.onArena);

    // "How It Works" — the technical detail belongs one click away, not on
    // the front door. A player wants to play; the measured numbers are for
    // whoever goes looking.
    const about = rootEl.querySelector("#about-panel");
    const setAbout = (open) => {
      if (!about) return;
      about.hidden = !open;
    };
    rootEl.querySelector("#title-about")?.addEventListener("click", () => setAbout(true));
    rootEl.querySelector("#about-close")?.addEventListener("click", () => setAbout(false));
    about?.addEventListener("click", (event) => {
      if (event.target === about) setAbout(false);
    });
    doc.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && about && !about.hidden) setAbout(false);
    });

    // Mode picker. Purely presentational here — it reports the choice upward
    // and never starts a game itself, so the CTA stays the single way in.
    const modeButtons = [...rootEl.querySelectorAll(".title-mode")];
    for (const button of modeButtons) {
      button.addEventListener("click", () => {
        try {
          for (const other of modeButtons) {
            const selected = other === button;
            other.classList.toggle("is-selected", selected);
            other.setAttribute("aria-checked", String(selected));
          }
          if (typeof handlers.onModeChange === "function") {
            handlers.onModeChange(button.dataset.mode);
          }
        } catch (error) {
          if (typeof console !== "undefined") console.warn("Mode change failed.", error);
        }
      });
    }

    return true;
  } catch (error) {
    if (typeof console !== "undefined") {
      console.warn("Title screen failed to mount; going straight to placement.", error);
    }
    return false;
  }
}
