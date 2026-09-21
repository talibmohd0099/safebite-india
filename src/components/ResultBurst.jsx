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
import { getScoreColor } from '../utils/storage';

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

// The celebration matches the result: a great score gets a big, bright
// burst; a poor one a small, quiet one and a slower, more serious fill --
// it would feel wrong to throw confetti at a 6/100. `fillMs` is how long
// the score ring takes to fill; `haptic` is the vibration pattern (ms).
export function celebrationProfile(score) {
  if (score >= 80) return { particles: 56, reach: [90, 190], fillMs: 1100, haptic: [18, 40, 30], colors: ['#22c55e', '#4ade80', '#a3e635', '#facc15', '#38bdf8'] };
  if (score >= 50) return { particles: 40, reach: [70, 160], fillMs: 1000, haptic: [22], colors: ['#84cc16', '#a3e635', '#facc15', '#fbbf24', '#4ade80'] };
  if (score >= 25) return { particles: 22, reach: [50, 110], fillMs: 1300, haptic: [16], colors: ['#f59e0b', '#fb923c', '#fbbf24'] };
  return { particles: 10, reach: [35, 80], fillMs: 1500, haptic: [34], colors: ['#f87171', '#fb923c', '#fca5a5'] };
}

// A static copy of the finished loading ring (same look as LoadingScreen's).
const CLONE_R = 54; // (116 - 8) / 2
const CLONE_C = 2 * Math.PI * CLONE_R;
function RingClone({ scoreColor, landing }) {
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
        {/* The ring takes on the score's colour as it lands -- red for a
            poor score, amber for moderate -- so it becomes THE score ring. */}
        <circle
          cx="58" cy="58" r={CLONE_R} fill="none" stroke={scoreColor} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={CLONE_C} strokeDashoffset="0"
          style={{ opacity: landing ? 1 : 0, transition: 'opacity 0.45s ease-out' }}
        />
      </svg>
      <div className="handoff-ring-label absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[26px] font-bold leading-none tabular-nums text-slate-800 dark:text-slate-100">100</span>
        <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 mt-0.5">percent</span>
      </div>
    </>
  );
}

export default function ResultBurst({ id, score = 60, handoff = null, onDone }) {
  const [alive, setAlive] = useState(true);
  const [geometry, setGeometry] = useState(null);
  const [landing, setLanding] = useState(false); // the copied ring has started taking the score's colour
  const cloneRef = useRef(null);
  const profile = useMemo(() => celebrationProfile(score), [score]);
  const scoreColor = getScoreColor(score).color;

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
      Array.from({ length: profile.particles }, (_, i) => {
        const angle = (i / profile.particles) * Math.PI * 2;
        const [minReach, maxReach] = profile.reach;
        return {
          angle,
          size: 5 + Math.random() * 5,
          color: profile.colors[i % profile.colors.length],
          delay: Math.random() * 180,
          round: i % 3 !== 0,
          reach: minReach + Math.random() * (maxReach - minReach),
        };
      }),
    [profile]
  );

  // Colour hand-off partway through the flight, and a haptic tick at the
  // exact moment the ring lands (silently skipped where unsupported).
  useEffect(() => {
    const landAt = arriveMs(Boolean(handoff));
    const colorTimer = handoff ? setTimeout(() => setLanding(true), landAt * 0.55) : null;
    const hapticTimer = setTimeout(() => {
      try { navigator.vibrate?.(profile.haptic); } catch { /* not supported */ }
    }, landAt);
    return () => {
      clearTimeout(colorTimer);
      clearTimeout(hapticTimer);
    };
  }, [handoff, profile]);

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
            <RingClone scoreColor={scoreColor} landing={landing} />
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
          borderColor: scoreColor,
          animationDelay: `${arriveMs(Boolean(handoff)) - 50}ms`,
        }}
      />
    </div>
  );
}
