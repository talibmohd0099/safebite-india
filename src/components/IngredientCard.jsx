// src/components/IngredientCard.jsx
// One row in the ingredients list: severity dot, name, one-line reason,
// expanding in place to the full detail.
import { useState } from 'react';
import { getIngredientSeverity } from '../utils/storage';

function Badge({ label, value }) {
  if (!value) return null;
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full"
      style={{ background: 'var(--fill)', color: 'var(--label-2)' }}
    >
      {label}: {value.replace('_', ' ')}
    </span>
  );
}

export default function IngredientCard({ ingredient }) {
  const [expanded, setExpanded] = useState(false);
  const severity = getIngredientSeverity(ingredient);
  const researchUrl = `https://www.google.com/search?q=${encodeURIComponent(`${ingredient.name} food ingredient health effects`)}`;

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left min-h-[44px]"
      >
        <span
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ background: severity.color }}
        />

        <span className="flex-1 min-w-0">
          <span className="block text-[17px] leading-snug tracking-[-0.01em]" style={{ color: 'var(--label-1)' }}>
            {ingredient.name}
          </span>
          {ingredient.reason && !expanded && (
            <span className="block text-[13px] truncate mt-0.5" style={{ color: 'var(--label-2)' }}>
              {ingredient.reason}
            </span>
          )}
        </span>

        <svg
          viewBox="0 0 8 13"
          fill="none"
          className={`w-2 h-3 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
          style={{ color: 'var(--label-3)' }}
        >
          <path d="M1.5 1.5L6.5 6.5l-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pl-[38px] space-y-3">
          <span
            className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{ background: severity.bg, color: severity.color }}
          >
            {severity.label}
          </span>

          {ingredient.reason && (
            <p className="text-[15px] leading-relaxed" style={{ color: 'var(--label-1)' }}>
              {ingredient.reason}
            </p>
          )}

          {ingredient.whatIsIt && (
            <div>
              <p className="text-[13px] font-semibold mb-0.5" style={{ color: 'var(--label-2)' }}>What is it?</p>
              <p className="text-[15px] leading-relaxed" style={{ color: 'var(--label-1)' }}>{ingredient.whatIsIt}</p>
            </div>
          )}

          {ingredient.healthEffects && (
            <div>
              <p className="text-[13px] font-semibold mb-0.5" style={{ color: 'var(--label-2)' }}>Health effects</p>
              <p className="text-[15px] leading-relaxed" style={{ color: 'var(--label-1)' }}>{ingredient.healthEffects}</p>
            </div>
          )}

          {ingredient.commonlyFoundIn?.length > 0 && (
            <div>
              <p className="text-[13px] font-semibold mb-1.5" style={{ color: 'var(--label-2)' }}>Also found in</p>
              <div className="flex flex-wrap gap-1.5">
                {ingredient.commonlyFoundIn.map((item, i) => (
                  <span
                    key={i}
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--fill)', color: 'var(--label-2)' }}
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            <Badge label="FSSAI" value={ingredient.fssaiStatus} />
            <Badge label="EU" value={ingredient.euStatus} />
            {typeof ingredient.percentage === 'number' && (
              <span
                className="text-xs px-2 py-0.5 rounded-full"
                style={{ background: 'var(--fill)', color: 'var(--label-2)' }}
              >
                {ingredient.percentage}% of product
              </span>
            )}
          </div>

          <a
            href={researchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-[15px]"
            style={{ color: 'var(--tint)' }}
          >
            Research this ingredient →
          </a>
        </div>
      )}
    </div>
  );
}
