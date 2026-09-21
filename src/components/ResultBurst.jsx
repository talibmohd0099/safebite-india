// src/components/ResultBurst.jsx
//
// The "your report is ready" moment. Two versions, same idea -- the loader
// becomes the score ring:
//
//  * Hand-off (the normal path, from a loading screen): a copy of the
//    finished loading ring is drawn exactly where the loader was, glides
//    and grows across the screen onto the score ring's spot, and lands
//    with an explosion of sparks. The real score ring then fills.
//  * Gather (no loading screen before it, e.g. an unusual entry point):
//    sparks start mid-screen and assemble the ring, then it fills.
//
// Pure CSS + the Web Animations API; non-interactive; skipped under
// prefers-reduced-motion. Plays once per report per session (shouldBurst),
// so coming back with Back doesn't replay it.
//
// The score ring's position is measured from the real element (marked
// data-burst-target, see ScoreCircle), and ScoreCircle waits
// arriveMs(handoff) before it starts filling.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { clearHandoff } from '../utils/reportHandoff';

const shown = new Set();

/**
 * True until a burst has played for this report id this session. Only
 * READS -- the id is recorded when the burst actually mounts, so React's
 * dev double-invoke of effects can't use it up before anything is shown.
 */
export function shouldBurst(id) {
  return Boolean(id) && !shown.has(id);
}

const FLIGHT_MS = 760;          // hand-off: loader ring glides onto the score ring
const GATHER_MS = 800;          // gather: sparks assemble the ring
const TOTAL_MS = 2000;

/** How long the real score ring should stay empty before it starts filling. */
export function arriveMs(hasHandoff) {
  return hasHandoff ? FLIGHT_MS : GATHER_MS;
}

const COLORS = ['#22c55e', '#4ade80', '#a3e635', '#facc15', '#fb923c', '#38bdf8'];
const PARTICLES = 40;

// A static copy of the finished loading ring (same look as LoadingScreen's).
const CLONE_R = 54; // (116 - 8) / 2
const CLONE_C = 2 * Math.PI * CLONE_R;
function RingClone() {
  return (
    <>
      <svg width="116" height="116" viewBox="0 0 116 116" className="-rotate-90" style={{ display: 'block' }}>
        <defs>
          <linearGradient id="handoff-ring-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4ade80" />
            <stop offset="100%" stopColor="#16a34a" />
          </linearGradient>
        </defs>
        <circle cx="58" cy="58" r={CLONE_R} fill="none" stroke="var(--fill)" strokeWidth="8" />
        <circle cx="58" cy="58" r={CLONE_R} fill="none" stroke="url(#handoff-ring-gradient)" strokeWidth="8" strokeLinecap="round" strokeDasharray={CLONE_C} strokeDashoffset="0" />
      </svg>
      <div className="handoff-ring-label absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[26px] font-bold leading-none tabular-nums text-slate-800 dark:text-slate-100">100</span>
        <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 mt-0.5">percent</span>
      </div>
    </>
  );
}

export default function ResultBurst({ id, handoff = null, onDone }) {
  const [alive, setAlive] = useState(true);
  const [geometry, setGeometry] = useState(null);
  const cloneRef = useRef(null);

  useEffect(() => {
    if (id) shown.add(id);
    clearHandoff();
  }, [id]);

  // Measure the real score ring; without one there's nothing to build.
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
      size: rect.width,
      radius,
      startX: window.innerWidth / 2,
      startY: window.innerHeight / 2,
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Hand-off: glide the ring copy from the loader's spot to the score ring.
  useLayoutEffect(() => {
    const node = cloneRef.current;
    if (!node || !handoff || !geometry) return undefined;
    const fromCx = handoff.left + handoff.width / 2;
    const fromCy = handoff.top + handoff.height / 2;
    const dx = geometry.cx - fromCx;
    const dy = geometry.cy - fromCy;
    const scale = geometry.size / handoff.width;
    const flight = node.animate(
      [
        { transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 1, offset: 0.86 },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale * 1.06})`, opacity: 0 },
      ],
      { duration: FLIGHT_MS + 220, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'forwards' },
    );
    return () => flight.cancel();
  }, [geometry, handoff]);

  const particles = useMemo(
    () =>
      Array.from({ length: PARTICLES }, (_, i) => {
        const angle = (i / PARTICLES) * Math.PI * 2;
        return {
          angle,
          size: 5 + Math.random() * 5,
          color: COLORS[i % COLORS.length],
          delay: Math.random() * 180,
          round: i % 3 !== 0,
          reach: 70 + Math.random() * 90,
        };
      }),
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
      {handoff ? (
        <>
          <div
            ref={cloneRef}
            className="handoff-ring"
            style={{ left: handoff.left, top: handoff.top, width: handoff.width, height: handoff.height }}
          >
            <RingClone />
          </div>
          {/* Landing: sparks explode outward from the score ring. */}
          {particles.map((p, i) => (
            <span
              key={i}
              className="result-burst-spark"
              style={{
                left: cx + Math.cos(p.angle) * radius,
                top: cy + Math.sin(p.angle) * radius,
                '--dx': `${Math.cos(p.angle) * p.reach}px`,
                '--dy': `${Math.sin(p.angle) * p.reach}px`,
                width: p.size,
                height: p.size,
                background: p.color,
                borderRadius: p.round ? '9999px' : '2px',
                animationDelay: `${FLIGHT_MS - 40 + p.delay * 0.4}ms`,
              }}
            />
          ))}
        </>
      ) : (
        particles.map((p, i) => {
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
        })
      )}
      <span
        className="result-burst-pulse"
        style={{
          left: cx,
          top: cy,
          width: radius * 2 + 20,
          height: radius * 2 + 20,
          animationDelay: `${arriveMs(Boolean(handoff)) - 50}ms`,
        }}
      />
    </div>
  );
}
