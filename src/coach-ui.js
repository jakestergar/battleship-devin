// Rendering surface for the post-game coach.
//
// Additive layer (PRD Section 5): every path is wrapped so that a failure in
// here leaves the end screen — and crucially the New Game button — fully
// functional. The worst case is that the coach panel is simply absent.
//
// All analysis lives in the pure `src/coach.js`; this file only writes DOM.

import { formatCoachReport, formatCell, gradePlayerShots } from "./coach.js";

const CONTAINER_ID = "coach-report";

// Recomputing on every render() would be wasteful (one probability map per
// shot). Cache against the state object and its history length.
let cache = { state: null, turns: -1, grade: null };

function pct(x) {
  if (!Number.isFinite(x) || x <= 0) return "0%";
  const p = x * 100;
  if (p < 0.05) return "<0.1%";
  if (p < 0.5) return `${p.toFixed(1)}%`;
  return `${Math.round(p)}%`;
}

function findContainer(rootEl) {
  if (!rootEl || typeof rootEl.querySelector !== "function") return null;
  if (rootEl.id === CONTAINER_ID) return rootEl;
  return rootEl.querySelector(`#${CONTAINER_ID}`);
}

function buildPanel(doc, grade) {
  const panel = doc.createElement("div");
  panel.className = "coach-panel";

  const heading = doc.createElement("h3");
  heading.className = "coach-heading";
  heading.textContent = "Shot Analysis";
  panel.appendChild(heading);

  const meter = doc.createElement("div");
  meter.className = "coach-meter";
  meter.setAttribute("role", "img");
  meter.setAttribute(
    "aria-label",
    `${pct(grade.score)} of Bayesian-optimal`
  );
  const fill = doc.createElement("span");
  fill.className = "coach-meter-fill";
  const width = Math.max(0, Math.min(1, grade.score)) * 100;
  fill.style.width = `${width.toFixed(1)}%`;
  meter.appendChild(fill);
  panel.appendChild(meter);

  const prose = doc.createElement("p");
  prose.className = "coach-prose";
  prose.textContent = formatCoachReport(grade);
  panel.appendChild(prose);

  if (grade.worstShots.length > 1) {
    const list = doc.createElement("ul");
    list.className = "coach-worst";
    for (const shot of grade.worstShots) {
      const item = doc.createElement("li");
      item.textContent =
        `Turn ${shot.turnNumber} · ${formatCell(shot.cell)} ${pct(shot.probability)} ` +
        `· best ${formatCell(shot.bestCell)} ${pct(shot.bestProbability)}`;
      list.appendChild(item);
    }
    panel.appendChild(list);
  }

  return panel;
}

/**
 * Single entry point. Call with the end-screen root (or the coach container
 * itself) and a getter for the current GameState. Renders the coach when the
 * game is over and clears itself otherwise. Never throws.
 */
export function mountCoach(rootEl, getState) {
  let container = null;
  try {
    container = findContainer(rootEl);
    if (!container) return;

    const state = typeof getState === "function" ? getState() : getState;
    if (!state || state.status === "in_progress" || !Array.isArray(state.history)) {
      container.textContent = "";
      cache = { state: null, turns: -1, grade: null };
      return;
    }

    if (cache.state !== state || cache.turns !== state.history.length) {
      cache = {
        state,
        turns: state.history.length,
        grade: gradePlayerShots(state),
      };
    }
    const grade = cache.grade;
    if (!grade || !grade.totalShots) {
      container.textContent = "";
      return;
    }

    const doc = container.ownerDocument;
    container.textContent = "";
    container.appendChild(buildPanel(doc, grade));
  } catch {
    // Additive layer — never break the end screen or the New Game button.
    try {
      if (container) container.textContent = "";
    } catch {
      /* nothing further we can safely do */
    }
  }
}
