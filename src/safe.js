// The graceful-degradation helper the additive layers share.
//
// Every creative layer (heatmap, fleet art, audio, impact effects) is
// wrapped so a failure in it can never break a turn — see
// planning/battleship-prd.md §5. That was a `try {} catch {}` repeated at
// every one of those call sites; it is this function instead.

/**
 * Runs `run`, swallowing anything it throws. Returns `run`'s value, or
 * `onFailure`'s value if it threw (and `undefined` when there is no
 * fallback).
 */
export function attempt(run, onFailure = null) {
  try {
    return run();
  } catch {
    return onFailure ? onFailure() : undefined;
  }
}
