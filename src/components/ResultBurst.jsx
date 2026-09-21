// src/components/ResultBurst.jsx
//
// The "your report is ready" moment: a burst of green/lime/amber particles
// and a shockwave ring radiating out from where the score sits. Pure CSS
// (no canvas, no library), ~1s, non-interactive, and skipped entirely
// under prefers-reduced-motion. Plays once per report per session -- see
// shouldBurst -- so coming back to a report with the Back button doesn't
// replay it.
import { useEffect, useMemo, useState } from 'react';

const shown = new Set();

/**
 * True until a burst has played for this report id this session. Only
 * READS -- the id is recorded when the burst actually mounts, so React's
 * dev double-invoke of effects can't use it up before anything is shown.
 */
export function shouldBurst(id) {
  return Boolean(id) && !shown.has(id);
}

const COLORS = ['#22c55e', '#4ade80', '#a3e635', '#facc15', '#fb923c', '#38bdf8'];
const PARTICLES = 30;

export default function ResultBurst({ id, onDone }) {
  const [alive, setAlive] = useState(true);

  useEffect(() => {
    if (id) shown.add(id);
  }, [id]);

  const particles = useMemo(
    () =>
      Array.from({ length: PARTICLES }, (_, i) => {
        const angle = (i / PARTICLES) * Math.PI * 2 + Math.random() * 0.4;
        const distance = 90 + Math.random() * 130;
        return {
          dx: Math.cos(angle) * distance,
          dy: Math.sin(angle) * distance,
          size: 5 + Math.random() * 6,
          color: COLORS[i % COLORS.length],
          delay: Math.random() * 90,
          round: i % 3 !== 0,
        };
      }),
    []
  );

  useEffect(() => {
    const t = setTimeout(() => {
      setAlive(false);
      onDone?.();
    }, 1300);
    return () => clearTimeout(t);
  }, [onDone]);

  if (!alive) return null;

  return (
    <div className="result-burst" aria-hidden="true">
      <span className="result-burst-ring" />
      {particles.map((p, i) => (
        <span
          key={i}
          className="result-burst-dot"
          style={{
            '--dx': `${p.dx}px`,
            '--dy': `${p.dy}px`,
            width: p.size,
            height: p.size,
            background: p.color,
            borderRadius: p.round ? '9999px' : '2px',
            animationDelay: `${p.delay}ms`,
          }}
        />
      ))}
    </div>
  );
}
