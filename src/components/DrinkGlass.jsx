// src/components/DrinkGlass.jsx
//
// For drinks: a glass filled to the serving's real volume, with the
// sugar in it drawn as the layer it would make if it settled out -- a
// teaspoon of sugar (~4g) is ~5ml, so a 250ml cola's 6.6 tsp is ~33ml,
// about an eighth of the glass. The layer's height is that real share,
// not a scare-sized exaggeration (floored at a thin visible line). The
// liquid pours in, then the sugar settles. Decorative: the exact
// numbers are always in the text next to it.
const ML_PER_TSP = 5;
const MIN_SUGAR_SHARE = 0.03;

export default function DrinkGlass({ servingMl, teaspoons, color = '#ec4899' }) {
  const sugarMl = teaspoons * ML_PER_TSP;
  const share = Math.max(MIN_SUGAR_SHARE, Math.min(1, sugarMl / servingMl));
  // Glass interior: from y=12 (rim) to y=132 (base), 120 units tall.
  const top = 20;
  const base = 132;
  const h = base - top;
  const sugarH = h * share;
  return (
    <svg viewBox="0 0 100 140" width="84" height="118" role="img" aria-hidden="true" className="flex-shrink-0">
      <defs>
        <clipPath id="drink-glass-clip">
          <path d="M18 12 L82 12 L74 132 Q74 136 70 136 L30 136 Q26 136 26 132 Z" />
        </clipPath>
        <pattern id="sugar-grain" width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="#fff" />
          <circle cx="1.5" cy="1.5" r="0.9" fill="rgba(0,0,0,0.12)" />
          <circle cx="4.5" cy="4.2" r="0.9" fill="rgba(0,0,0,0.12)" />
        </pattern>
      </defs>
      <g clipPath="url(#drink-glass-clip)">
        <rect className="glass-pour" x="0" y={top} width="100" height={h + 10} fill={color} opacity="0.28" />
        <rect className="glass-settle" x="0" y={base - sugarH} width="100" height={sugarH + 10} fill="url(#sugar-grain)" stroke={color} strokeWidth="0.6" />
      </g>
      <path d="M18 12 L82 12 L74 132 Q74 136 70 136 L30 136 Q26 136 26 132 Z" fill="none" stroke="var(--label-3)" strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}
