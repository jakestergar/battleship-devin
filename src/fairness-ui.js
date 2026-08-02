// The "Verify Fairness" console block: a thin rendering layer over
// src/fairness.js. All of this session's DOM work lives here so the shared
// src/ui.js needs only one import and one call site.
//
// Additive layer, per planning/battleship-prd.md Section 5: every entry
// point is wrapped, and any failure degrades to a panel that says
// verification is unavailable. Nothing in here can throw into the turn loop.

import { verifyFairness } from "./fairness.js";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function describe(result) {
  if (result.trials === 0) {
    return (
      "No alternative fleet layout is still consistent with the shots so far, " +
      "so there is nothing to compare against. This is not a pass."
    );
  }
  if (result.ok) {
    return (
      `Moved your unsunk ships ${result.trials} times — the AI's targeting ` +
      `map never changed (${result.referenceHash}). It cannot see them.`
    );
  }
  const differing = result.trialHashes.filter((h) => h !== result.referenceHash).length;
  return (
    `${differing} of ${result.trials} relocated fleets produced a different ` +
    `map (ref ${result.referenceHash}). The AI's targeting depends on where ` +
    `your unsunk ships are — it is cheating.`
  );
}

function renderResult(out, result) {
  out.textContent = "";
  const status = el(
    "p",
    `fairness-verdict${result.trials === 0 ? " is-inconclusive" : result.ok ? " is-pass" : " is-fail"}`,
    result.trials === 0 ? "NOT VERIFIABLE" : result.ok ? "PASS" : "FAIL"
  );
  out.append(status, el("p", "explain", describe(result)));

  if (result.trials > 0) {
    // Compact inline strip rather than one hash per line: the battle view
    // has to fit 1440x700 without scrolling, and a six-row list does not.
    // The hashes are always visible (no disclosure toggle) — the whole point
    // is that the claim is inspectable rather than asserted. Underlined
    // first entry is the reference; the rest are the trials.
    const list = el("p", "fairness-hash-list");
    list.append(el("span", "fairness-hash-ref", result.referenceHash));
    for (const hash of result.trialHashes) {
      list.append(
        el(
          "span",
          hash === result.referenceHash ? "fairness-hash-ok" : "fairness-hash-bad",
          hash
        )
      );
    }
    out.appendChild(list);
  }
}

/**
 * Mounts the fairness panel into `rootEl`. `getState` must return the live
 * GameState (or null/undefined before a game has started).
 *
 * Safe to call with a missing element or in a non-browser environment: it
 * simply does nothing.
 */
export function mountFairness(rootEl, getState) {
  try {
    if (!rootEl || typeof document === "undefined") return;
    rootEl.textContent = "";

    const heading = el("h3", null, "Verify Fairness");
    const button = el("button", "button button-quiet fairness-run", "Run check");
    button.type = "button";
    const out = el("div", "fairness-out");
    out.append(
      el(
        "p",
        "explain",
        "Relocates your unsunk ships, re-runs the AI's targeting map on each, " +
          "and compares hashes."
      )
    );
    rootEl.append(heading, button, out);

    button.addEventListener("click", () => {
      try {
        const state = getState();
        if (!state || state.status !== "in_progress") {
          out.textContent = "";
          out.append(
            el("p", "explain", "Available while a battle is in progress.")
          );
          return;
        }
        button.disabled = true;
        out.textContent = "";
        out.append(el("p", "explain", "Recomputing…"));
        // Deferred a frame so the "Recomputing…" line actually paints before
        // the synchronous check runs.
        const run = () => {
          try {
            renderResult(out, verifyFairness(state));
          } catch (err) {
            out.textContent = "";
            out.append(
              el("p", "explain", "Verification is unavailable right now.")
            );
          } finally {
            button.disabled = false;
          }
        };
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(() => setTimeout(run, 0));
        } else {
          run();
        }
      } catch {
        /* additive layer — never break the game */
      }
    });
  } catch {
    /* additive layer — never break the game */
  }
}
