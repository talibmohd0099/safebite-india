// src/utils/reportHandoff.js
//
// Carries the loading ring's on-screen position from the loading screen to
// the report page, so the ring can visibly travel across the route change
// and become the score ring (see ResultBurst). Pages are different routes,
// so nothing can be shared between them directly -- this is a one-shot
// note left by the loader and read by the report.

let pending = null;
const MAX_AGE_MS = 5000;

/** Remember where the loading ring is right now. */
export function recordLoaderRect() {
  const el = typeof document !== 'undefined' ? document.querySelector('[data-loader-ring]') : null;
  if (!el) { pending = null; return; }
  const r = el.getBoundingClientRect();
  pending = { left: r.left, top: r.top, width: r.width, height: r.height, at: Date.now() };
}

/** The recorded rect if it is fresh, else null. Does not consume it. */
export function peekHandoff() {
  if (!pending || Date.now() - pending.at > MAX_AGE_MS) return null;
  return pending;
}

export function clearHandoff() {
  pending = null;
}
