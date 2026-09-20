// src/components/ProductStripCard.jsx
// One compact card for a horizontally-scrolling product row (Recently
// added, Continue where you left off) -- image, name, score badge.
import ProductImage from './ProductImage';
import { getScoreColor } from '../utils/storage';

export default function ProductStripCard({ item, onClick, style, layoutId }) {
  // When a family profile is active, the card carries both scores --
  // general first, personal second ("71 / 68") -- instead of only ever
  // showing the personal one, so it's visible how much (if at all) this
  // specific alternative differs for that person vs. everyone else.
  // Coloured by the personal score when present, since that's the more
  // actionable number for whoever's currently looking at this card.
  const hasPersonal = typeof item.personalScore === 'number';
  const colors = typeof item.score === 'number' ? getScoreColor(hasPersonal ? item.personalScore : item.score) : null;

  return (
    <button
      onClick={onClick}
      style={style}
      className="item-in tap-scale flex-shrink-0 w-28 text-left"
    >
      <ProductImage src={item.imageUrl} size={112} expandable={false} layoutId={layoutId} />
      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 mt-1.5 leading-tight line-clamp-2">
        {item.productName}
      </p>
      {/* Infant formula never shows a numeric score here either -- the
          whole reason Result.jsx stops showing one is defeated if the
          same 0-100 badge still shows up wherever this card is reused
          (homepage strips, alternatives). */}
      {item.isInfantFormula ? (
        <span
          className="inline-block mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
          style={{ background: 'var(--v-moderate-bg)', color: 'var(--v-moderate)' }}
        >
          Specialized
        </span>
      ) : (
        colors && (
          <span
            className="inline-block mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: colors.bg, color: colors.color }}
          >
            {hasPersonal ? `${item.score} / ${item.personalScore}` : `${item.score}/100`}
          </span>
        )
      )}
    </button>
  );
}
