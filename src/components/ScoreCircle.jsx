// src/components/ScoreCircle.jsx
// The score ring. Colour comes from the shared verdict scale, so the ring
// says the same thing as the verdict word next to it.
//
// The number counts up and the ring fills from empty on mount instead of
// just appearing at its final value -- the score is the single moment
// this app exists to deliver, worth a real reveal. Because the colour
// comes from getScoreColor(liveValue) rather than the final score, the
// ring naturally passes through the same red -> amber -> green bands as
// it climbs, with no separate colour-interpolation logic needed. Skips
// straight to the final state under prefers-reduced-motion.
import { useEffect, useRef, useState } from 'react';
import { getScoreColor } from '../utils/storage';

const ANIMATION_MS = 1000;

export default function ScoreCircle({ score, size = 'large', showLabel = false }) {
  const clamped = Math.max(0, Math.min(100, score));
  const finalColors = getScoreColor(clamped);

  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [liveValue, setLiveValue] = useState(prefersReducedMotion ? clamped : 0);
  const frameRef = useRef(null);

  useEffect(() => {
    if (prefersReducedMotion) {
      setLiveValue(clamped);
      return;
    }
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / ANIMATION_MS);
      const eased = 1 - (1 - t) ** 3; // ease-out cubic
      setLiveValue(eased * clamped);
      if (t < 1) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [clamped]); // eslint-disable-line react-hooks/exhaustive-deps

  const liveColors = getScoreColor(liveValue);
  const svgSize = size === 'large' ? 112 : 64;
  const strokeWidth = size === 'large' ? 9 : 6;
  const radius = svgSize / 2 - strokeWidth;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (liveValue / 100) * circumference;

  return (
    <div className="flex flex-col items-center flex-shrink-0">
      <div className="relative" style={{ width: svgSize, height: svgSize }}>
        <svg width={svgSize} height={svgSize} viewBox={`0 0 ${svgSize} ${svgSize}`} className="rotate-[-90deg]">
          <circle
            cx={svgSize / 2}
            cy={svgSize / 2}
            r={radius}
            fill="none"
            stroke="var(--fill)"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={svgSize / 2}
            cy={svgSize / 2}
            r={radius}
            fill="none"
            stroke={liveColors.color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={`${size === 'large' ? 'text-4xl' : 'text-xl'} font-bold leading-none tracking-tight tabular-nums`}
            style={{ color: liveColors.color }}
          >
            {Math.round(liveValue)}
          </span>
          {size === 'large' && (
            <span className="text-xs mt-1" style={{ color: 'var(--label-2)' }}>
              out of 100
            </span>
          )}
        </div>
      </div>

      {showLabel && (
        <span
          className="mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
          style={{ background: finalColors.bg, color: finalColors.color }}
        >
          {finalColors.label}
        </span>
      )}
    </div>
  );
}
