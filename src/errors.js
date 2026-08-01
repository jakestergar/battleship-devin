// Single place for "this failed, but it must not take the game down with it".
//
// The audio, animation, and heatmap layers are additive: the PRD (Section 5)
// requires a failure in any of them to degrade gracefully rather than break
// gameplay. Containing a failure is not the same as hiding it, though — every
// contained failure is reported here so it shows up in the console with the
// scope that produced it, instead of vanishing into an empty catch block.

/** Reports a contained failure. Never throws, whatever `error` is. */
export function reportError(scope, error) {
  try {
    const detail = error instanceof Error ? error : new Error(String(error));
    console.error(`[battleship] ${scope} failed: ${detail.message}`, detail);
  } catch {
    // A console that itself throws is not something we can report about.
  }
}

/**
 * Runs `fn`, containing and reporting any failure. Returns `fallback` (default
 * `undefined`) if it threw, so callers can keep going without a try/catch and
 * without losing the diagnostic.
 */
export function attempt(scope, fn, fallback = undefined) {
  try {
    return fn();
  } catch (error) {
    reportError(scope, error);
    return fallback;
  }
}
