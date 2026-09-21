// src/utils/loadingPace.js
//
// A report that's already saved opens in a fraction of a second, which
// feels abrupt -- like nothing happened. This gives every "open a report"
// moment a natural pace: a randomised minimum time on the loading screen
// (mostly about 1-1.5s, sometimes up to 2.5s). A report that genuinely
// takes longer to build isn't delayed any further.

/** Random minimum loading time in ms: ~55% 1.0-1.5s, ~35% 1.5-2.0s, ~10% 2.0-2.5s. */
export function randomLoadDelayMs(random = Math.random) {
  const roll = random();
  const [lo, hi] = roll < 0.55 ? [1000, 1500] : roll < 0.9 ? [1500, 2000] : [2000, 2500];
  return Math.round(lo + random() * (hi - lo));
}

/** Resolves once `minMs` have passed since `startedAt` (immediately if they already have). */
export function waitForMinimum(startedAt, minMs) {
  const remaining = minMs - (Date.now() - startedAt);
  return remaining > 0 ? new Promise((resolve) => setTimeout(resolve, remaining)) : Promise.resolve();
}
