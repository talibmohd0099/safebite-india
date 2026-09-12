// src/components/ProductStripCard.jsx
// One compact card for a horizontally-scrolling product row (Recently
// added, Continue where you left off) -- image, name, score badge.
import ProductImage from './ProductImage';
import { getScoreColor } from '../utils/storage';

export default function ProductStripCard({ item, onClick, style }) {
  const colors = typeof item.score === 'number' ? getScoreColor(item.score) : null;

  return (
    <button
      onClick={onClick}
      style={style}
      className="item-in tap-scale flex-shrink-0 w-28 text-left"
    >
      <ProductImage src={item.imageUrl} size={112} expandable={false} />
      <p className="text-xs font-semibold text-slate-700 mt-1.5 leading-tight line-clamp-2">
        {item.productName}
      </p>
      {colors && (
        <span
          className="inline-block mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
          style={{ background: colors.bg, color: colors.color }}
        >
          {item.score}/100
        </span>
      )}
    </button>
  );
}
