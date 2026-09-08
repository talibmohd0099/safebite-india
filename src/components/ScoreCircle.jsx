// src/components/ScoreCircle.jsx
// Animated circular score display
import { getScoreColor } from '../utils/storage';

export default function ScoreCircle({ score, size = 'large' }) {
  const colors = getScoreColor(score);
  const radius = size === 'large' ? 54 : 36;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  const svgSize = size === 'large' ? 140 : 96;
  const strokeWidth = size === 'large' ? 10 : 7;
  const fontSize = size === 'large' ? 'text-4xl' : 'text-2xl';
  const labelSize = size === 'large' ? 'text-sm' : 'text-xs';

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: svgSize, height: svgSize }}>
        <svg
          width={svgSize}
          height={svgSize}
          viewBox={`0 0 ${svgSize} ${svgSize}`}
          className="rotate-[-90deg]"
        >
          {/* Background circle */}
          <circle
            cx={svgSize / 2}
            cy={svgSize / 2}
            r={radius}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth={strokeWidth}
          />
          {/* Score progress */}
          <circle
            cx={svgSize / 2}
            cy={svgSize / 2}
            r={radius}
            fill="none"
            stroke={colors.stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="score-circle-progress"
            style={{
              transition: 'stroke-dashoffset 1.2s ease-out',
            }}
          />
        </svg>

        {/* Score text in center */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`${fontSize} font-bold ${colors.text} leading-none`}>
            {score}
          </span>
          <span className="text-xs text-slate-500 font-medium">/100</span>
        </div>
      </div>

      {/* Label below circle */}
      <div className={`${colors.bg} ${colors.border} border px-3 py-1 rounded-full`}>
        <span className={`${colors.text} font-semibold ${labelSize}`}>
          {colors.label}
        </span>
      </div>
    </div>
  );
}
