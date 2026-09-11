// src/components/ScoreCircle.jsx
// The score ring. Colour comes from the shared verdict scale, so the ring
// says the same thing as the verdict word next to it.
import { getScoreColor } from '../utils/storage';

export default function ScoreCircle({ score, size = 'large', showLabel = false }) {
  const colors = getScoreColor(score);

  const svgSize = size === 'large' ? 112 : 64;
  const strokeWidth = size === 'large' ? 9 : 6;
  const radius = svgSize / 2 - strokeWidth;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

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
            stroke={colors.color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{ transition: 'stroke-dashoffset 1s ease-out' }}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={`${size === 'large' ? 'text-4xl' : 'text-xl'} font-bold leading-none tracking-tight`}
            style={{ color: colors.color }}
          >
            {score}
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
          style={{ background: colors.bg, color: colors.color }}
        >
          {colors.label}
        </span>
      )}
    </div>
  );
}
