// Strategy Arena — a head-to-head comparison of the three targeting
// strategies, using real measured numbers from `scripts/harness.js`.
//
// Nothing here is computed live: running thousands of games in the browser to
// draw a chart would be absurd. `src/baseline.js` is a generated constants
// file, and this module only formats it.
//
// Self-contained by design: it owns its own markup and its own stylesheet
// (injected once), so integrating it costs `src/ui.js` a single import and a
// single call, and `index.html` a single empty container. Every entry point
// is wrapped — if anything in here throws, the game is untouched and fully
// playable, per the PRD's graceful-degradation NFR.

import { ARENA_STRATEGIES, BASELINE_GAMES_PER_STRATEGY } from "./baseline.js";

const STYLE_ID = "arena-styles";

// ---------------------------------------------------------------------------
// Pure logic (no DOM) — this is the part that's unit tested.
// ---------------------------------------------------------------------------

/**
 * Percentage fewer shots `avg` needs than `reference`. Positive means better.
 * Returns null when the comparison is meaningless.
 */
export function efficiencyPercent(avg, reference) {
  if (!Number.isFinite(avg) || !Number.isFinite(reference) || reference <= 0) {
    return null;
  }
  return Math.round((1 - avg / reference) * 100);
}

/**
 * Turns a compact `{ binSize, min, counts }` histogram into drawable bars.
 * `scale` defaults to the histogram's own peak, which normalises each
 * strategy's chart to its own height. That's deliberate: on a shared vertical
 * axis, random search's enormous 95-100 spike squashes the other two charts
 * into invisible slivers. The comparison lives in the *horizontal* axis —
 * every chart spans the same 15-100 shot range — plus the avg-shots figure.
 */
export function histogramBars(histogram, scale) {
  if (!histogram || !Array.isArray(histogram.counts)) return [];
  const max = Number.isFinite(scale) && scale > 0 ? scale : Math.max(...histogram.counts, 1);
  const { binSize, min } = histogram;
  return histogram.counts.map((count, i) => {
    const lo = min + i * binSize;
    return {
      lo,
      hi: lo + binSize - 1,
      count,
      // Floor non-empty bins at a visible sliver so rare outcomes don't vanish.
      heightPct: count === 0 ? 0 : Math.max(3, Math.round((count / max) * 100)),
    };
  });
}

/**
 * Builds the full view model the arena renders: strategies sorted best-first,
 * each with its efficiency against the random baseline and its bars on a
 * shared scale.
 */
export function buildComparison(strategies = ARENA_STRATEGIES) {
  const usable = (Array.isArray(strategies) ? strategies : []).filter(
    (s) => s && Number.isFinite(s.avgShots) && s.avgShots > 0
  );
  if (usable.length === 0) return null;

  const baseline = usable.find((s) => s.strategy === "random") || usable[0];
  const best = usable.reduce((a, b) => (a.avgShots <= b.avgShots ? a : b));

  const rows = [...usable]
    .sort((a, b) => a.avgShots - b.avgShots)
    .map((s) => ({
      id: s.strategy,
      label: s.label,
      avgShots: s.avgShots,
      medianShots: s.medianShots,
      bestShots: s.bestShots,
      worstShots: s.worstShots,
      hitRatePct: Number.isFinite(s.hitRate) ? Math.round(s.hitRate * 100) : null,
      isBaseline: s.strategy === baseline.strategy,
      isWinner: s.strategy === best.strategy,
      efficiencyVsBaseline:
        s.strategy === baseline.strategy
          ? null
          : efficiencyPercent(s.avgShots, baseline.avgShots),
      bars: histogramBars(s.histogram),
    }));

  const hunt = usable.find((s) => s.strategy === "hunt-and-target");
  return {
    rows,
    games: BASELINE_GAMES_PER_STRATEGY,
    baselineLabel: baseline.label,
    winnerLabel: best.label,
    vsRandom: efficiencyPercent(best.avgShots, baseline.avgShots),
    vsHunt: hunt && hunt !== best ? efficiencyPercent(best.avgShots, hunt.avgShots) : null,
  };
}

/** The one-line verdict under the table. */
export function verdictText(comparison) {
  if (!comparison) return "";
  const parts = [];
  if (comparison.vsRandom !== null) {
    parts.push(`${comparison.vsRandom}% fewer shots than random search`);
  }
  if (comparison.vsHunt !== null) {
    parts.push(`${comparison.vsHunt}% fewer than hunt-and-target`);
  }
  if (parts.length === 0) return `${comparison.winnerLabel} leads the field.`;
  return `${comparison.winnerLabel} needs ${parts.join(", and ")}.`;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const CSS = `
.arena-launch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 2px 0 12px;
  padding: 8px 14px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--brass);
  background: transparent;
  border: 1px solid var(--brass-dim);
  border-radius: 2px;
  cursor: pointer;
}
.arena-launch:hover { background: rgba(201, 154, 62, 0.08); }
.arena-launch::before {
  content: "";
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--phosphor);
  box-shadow: 0 0 6px var(--phosphor);
}

.arena-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(10, 20, 32, 0.82);
  backdrop-filter: blur(2px);
}
.arena-overlay[hidden] { display: none; }

.arena-panel {
  width: min(880px, 100%);
  max-height: calc(100vh - 48px);
  overflow: auto;
  padding: 20px 24px 22px;
  background: var(--hull);
  border: 1px solid var(--brass-dim);
  border-radius: 4px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
}

.arena-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid rgba(201, 154, 62, 0.25);
  padding-bottom: 12px;
}
.arena-head h2 {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 26px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--brass);
}
.arena-provenance {
  margin: 4px 0 0;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--fog-dim);
}
.arena-close {
  flex: none;
  padding: 4px 10px;
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--fog-dim);
  background: transparent;
  border: 1px solid rgba(220, 230, 235, 0.18);
  border-radius: 2px;
  cursor: pointer;
}
.arena-close:hover { color: var(--fog); border-color: var(--brass-dim); }

.arena-row {
  display: grid;
  grid-template-columns: minmax(150px, 1fr) 96px minmax(180px, 1.4fr);
  gap: 18px;
  align-items: center;
  padding: 14px 0;
  border-bottom: 1px solid rgba(220, 230, 235, 0.07);
}
.arena-row:last-of-type { border-bottom: 0; }

.arena-name {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--fog);
}
.arena-row-winner .arena-name { color: var(--phosphor); }
.arena-sub {
  margin: 5px 0 0;
  font-size: 11px;
  color: var(--fog-dim);
}

.arena-avg {
  font-family: var(--font-mono);
  font-size: 26px;
  line-height: 1;
  color: var(--fog);
}
.arena-row-winner .arena-avg { color: var(--phosphor); }
.arena-avg span {
  display: block;
  margin-top: 4px;
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--fog-dim);
}

.arena-chart {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 52px;
  padding: 0 2px;
  border-bottom: 1px solid var(--brass-dim);
}
.arena-bar {
  flex: 1;
  min-height: 1px;
  border-radius: 1px 1px 0 0;
  background: var(--brass-dim);
}
.arena-row-winner .arena-bar { background: var(--phosphor-dim); }
.arena-scale {
  display: flex;
  justify-content: space-between;
  margin: 4px 0 0;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--fog-dim);
}

.arena-verdict {
  margin: 14px 0 0;
  padding-top: 12px;
  border-top: 1px solid rgba(201, 154, 62, 0.25);
  font-size: 13px;
  line-height: 1.5;
  color: var(--fog);
}
.arena-footnote {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--fog-dim);
}

@media (max-width: 720px) {
  .arena-row { grid-template-columns: 1fr; gap: 8px; }
}
`;

function injectStyles(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderRow(doc, row) {
  const wrapper = el(doc, "div", `arena-row${row.isWinner ? " arena-row-winner" : ""}`);

  const nameCell = el(doc, "div");
  nameCell.appendChild(el(doc, "p", "arena-name", row.label));
  const subParts = [`best ${row.bestShots}`, `worst ${row.worstShots}`];
  if (row.hitRatePct !== null) subParts.push(`${row.hitRatePct}% hit rate`);
  if (row.efficiencyVsBaseline !== null) {
    subParts.push(`${row.efficiencyVsBaseline}% vs random`);
  }
  nameCell.appendChild(el(doc, "p", "arena-sub", subParts.join(" · ")));
  wrapper.appendChild(nameCell);

  const avgCell = el(doc, "div", "arena-avg", String(row.avgShots));
  avgCell.appendChild(el(doc, "span", null, "avg shots"));
  wrapper.appendChild(avgCell);

  const chartCell = el(doc, "div");
  const chart = el(doc, "div", "arena-chart");
  chart.setAttribute("role", "img");
  chart.setAttribute(
    "aria-label",
    `${row.label}: shots-to-clear distribution, median ${row.medianShots}`
  );
  for (const bar of row.bars) {
    const barEl = el(doc, "div", "arena-bar");
    barEl.style.height = `${bar.heightPct}%`;
    barEl.title = `${bar.lo}-${bar.hi} shots: ${bar.count} games`;
    chart.appendChild(barEl);
  }
  chartCell.appendChild(chart);
  const scale = el(doc, "div", "arena-scale");
  const first = row.bars[0];
  const last = row.bars[row.bars.length - 1];
  scale.appendChild(el(doc, "span", null, first ? `${first.lo}` : ""));
  scale.appendChild(el(doc, "span", null, `median ${row.medianShots}`));
  scale.appendChild(el(doc, "span", null, last ? `${last.hi + 1}` : ""));
  chartCell.appendChild(scale);
  wrapper.appendChild(chartCell);

  return wrapper;
}

function buildPanel(doc, comparison) {
  const overlay = el(doc, "div", "arena-overlay");
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Strategy Arena");

  const panel = el(doc, "div", "arena-panel");
  const head = el(doc, "div", "arena-head");
  const heading = el(doc, "div");
  heading.appendChild(el(doc, "h2", null, "Strategy Arena"));
  heading.appendChild(
    el(
      doc,
      "p",
      "arena-provenance",
      `${comparison.games.toLocaleString()} simulated games per strategy · shots to clear a 10x10 board`
    )
  );
  head.appendChild(heading);
  const close = el(doc, "button", "arena-close", "\u2715");
  close.type = "button";
  close.setAttribute("aria-label", "Close the Strategy Arena");
  head.appendChild(close);
  panel.appendChild(head);

  for (const row of comparison.rows) panel.appendChild(renderRow(doc, row));

  panel.appendChild(el(doc, "p", "arena-verdict", verdictText(comparison)));
  panel.appendChild(
    el(
      doc,
      "p",
      "arena-footnote",
      "Measured offline by scripts/harness.js, not recomputed in the browser."
    )
  );

  overlay.appendChild(panel);
  return { overlay, close };
}

/**
 * Mounts the Strategy Arena launcher into `rootEl`. Returns true if it
 * mounted, false if it declined or failed — never throws, so a caller can
 * fire and forget.
 */
export function mountArena(rootEl) {
  try {
    if (!rootEl || !rootEl.ownerDocument) return false;
    const doc = rootEl.ownerDocument;
    const comparison = buildComparison();
    if (!comparison) return false;

    injectStyles(doc);
    rootEl.textContent = "";

    const launch = el(doc, "button", "arena-launch", "Strategy Arena");
    launch.type = "button";
    launch.setAttribute("aria-haspopup", "dialog");

    const { overlay, close } = buildPanel(doc, comparison);

    const setOpen = (open) => {
      overlay.hidden = !open;
      launch.setAttribute("aria-expanded", String(open));
      if (open) close.focus();
      else launch.focus();
    };

    launch.addEventListener("click", () => setOpen(true));
    close.addEventListener("click", () => setOpen(false));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) setOpen(false);
    });
    doc.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !overlay.hidden) setOpen(false);
    });

    rootEl.appendChild(launch);
    rootEl.appendChild(overlay);
    launch.setAttribute("aria-expanded", "false");
    return true;
  } catch (error) {
    // A stats panel must never cost anyone a game of Battleship.
    if (typeof console !== "undefined") {
      console.warn("Strategy Arena failed to mount; continuing without it.", error);
    }
    return false;
  }
}
