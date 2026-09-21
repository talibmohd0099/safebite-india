// src/components/ResultBurst.jsx
//
// The "your report is ready" moment: sparks start in the middle of the
// screen, fly out to points around the score ring and assemble it, then
// the ring pulses as the score fills in. Pure CSS (no canvas/library),
// non-interactive, skipped under prefers-reduced-motion. Plays once per
// report per session -- see shouldBurst -- so coming back to a report with
// the Back button doesn't replay it.
//
// The ring's position is measured from the real score ring (the element
// marked data-burst-target, see ScoreCircle) so the sparks land exactly
// on it. The ring itself waits BURST_ARRIVE_MS before it starts filling
// (Result passes startDelayMs) so the sparks visibly "build" it.
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';

const shown = new Set();

/**
 * True until a burst has played for this report id this session. Only
 * READS -- the id is recorded when the burst actually mounts, so React's
 * dev double-invoke of effects can't use it up before anything is shown.
 */
export function shouldBurst(id) {
  return Boolean(id) && !shown.has(id);
}

/** When the sparks have arrived on the ring -- ScoreCircle waits this long before filling. */
export const BURST_ARRIVE_MS = 800;
const TOTAL_MS = 1700;

const COLORS = ['#22c55e', '#4ade80', '#a3e635', '#facc15', '#fb923c', '#38bdf8'];
const PARTICLES = 40;

export default function ResultBurst({ id, onDone }) {
  const [alive, setAlive] = useState(true);
  const [geometry, setGeometry] = useState(null);

  useEffect(() => {
    if (id) shown.add(id);
  }, [id]);

  // Measure the real score ring; without one (e.g. a report shown without
  // a score ring) there's nothing to build, so skip quietly.
  useLayoutEffect(() => {
    const el = document.querySelector('[data-burst-target]');
    if (!el) {
      onDone?.();
      return;
    }
    const rect = el.getBoundingClientRect();
    const radius = Number(el.getAttribute('data-burst-radius')) || rect.width / 2 - 8;
    setGeometry({
      cx: rect.left + rect.width / 2,
      cy: rect.top + rect.height / 2,
      radius,
      startX: window.innerWidth / 2,
      startY: window.innerHeight / 2,
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const particles = useMemo(
    () =>
      Array.from({ length: PARTICLES }, (_, i) => ({
        angle: (i / PARTICLES) * Math.PI * 2,
        size: 5 + Math.random() * 5,
        color: COLORS[i % COLORS.length],
        delay: Math.random() * 180,
        round: i % 3 !== 0,
      })),
    []
  );

  useEffect(() => {
    const t = setTimeout(() => {
      setAlive(false);
      onDone?.();
    }, TOTAL_MS);
    return () => clearTimeout(t);
  }, [onDone]);

  if (!alive || !geometry) return null;
  const { cx, cy, radius, startX, startY } = geometry;

  return (
    <div className="result-burst" aria-hidden="true">
      {particles.map((p, i) => {
        const tx = cx + Math.cos(p.angle) * radius;
        const ty = cy + Math.sin(p.angle) * radius;
        return (
          <span
            key={i}
            className="result-burst-dot"
            style={{
              left: tx,
              top: ty,
              '--from-x': `${startX - tx}px`,
              '--from-y': `${startY - ty}px`,
              width: p.size,
              height: p.size,
              background: p.color,
              borderRadius: p.round ? '9999px' : '2px',
              animationDelay: `${p.delay}ms`,
            }}
          />
        );
      })}
      <span className="result-burst-pulse" style={{ left: cx, top: cy, width: radius * 2 + 20, height: radius * 2 + 20 }} />
    </div>
  );
}
