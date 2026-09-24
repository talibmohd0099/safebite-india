// src/components/LabelXray.jsx
//
// The label exactly as printed, with every ingredient we analysed lit up
// in its severity colour -- a flagged one filled, a fine one just
// underlined -- and a tap on any of them jumping to its card. Matching
// is in labelXray.js; an ingredient it can't find stays plain text, so
// nothing is ever coloured onto the wrong words.
import { useMemo } from 'react';
import { segmentLabel } from '../services/labelXray';

export default function LabelXray({ text, ingredients, tierOf, t, onPick }) {
  const segments = useMemo(() => segmentLabel(text, ingredients), [text, ingredients]);
  const foundCount = new Set(segments.filter((s) => s.ingredientIndex != null).map((s) => s.ingredientIndex)).size;

  return (
    <div className="relative px-4 py-3.5 overflow-hidden">
      {/* One scan pass over the label as it appears -- the "X-ray" moment. */}
      <span
        aria-hidden="true"
        className="xray-scan pointer-events-none absolute left-0 right-0 h-10"
        style={{ background: 'linear-gradient(180deg, transparent, rgba(59,130,246,0.18), transparent)' }}
      />
      <p className="text-[14px] leading-[1.9] break-words" style={{ color: 'var(--label-2)' }}>
        {segments.map((s, i) => {
          if (s.ingredientIndex == null) return <span key={i}>{s.text}</span>;
          const tier = tierOf(ingredients[s.ingredientIndex]);
          const flagged = tier.key !== 'Fine';
          return (
            <button
              key={i}
              type="button"
              onClick={() => onPick(s.ingredientIndex)}
              className="xray-mark inline rounded-[5px] text-left"
              style={flagged
                ? { background: tier.bg, color: tier.color, fontWeight: 700, padding: '1px 3px', animationDelay: `${Math.min(i * 40, 900)}ms` }
                : { color: 'var(--label-1)', textDecoration: 'underline', textDecorationColor: tier.color, textDecorationThickness: 2, textUnderlineOffset: 3, animationDelay: `${Math.min(i * 40, 900)}ms` }}
            >
              {s.text}
            </button>
          );
        })}
      </p>
      <p className="text-[11.5px] mt-2.5" style={{ color: 'var(--label-3)' }}>
        {t('xrayFound', { found: foundCount, total: ingredients.length })}
      </p>
    </div>
  );
}
