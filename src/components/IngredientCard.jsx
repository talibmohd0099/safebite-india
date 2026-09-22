// src/components/IngredientCard.jsx
// One row in the ingredients list: a coloured category icon, name, and a
// colour-coded severity pill (the single place severity is shown, so it
// never fights the icon for attention), expanding in place to the full
// detail -- each field of which gets its own small icon so the panel
// reads as a set of distinct facts, not one wall of text.
import { useState } from 'react';
import { getIngredientSeverity } from '../utils/storage';
import { categoryIcon, categoryColor } from '../utils/categoryIcon';

// Open Food Facts' percent estimates arrive unrounded -- a real one seen
// in production was "0.0000461935997009277% of product", which is noise
// dressed up as precision. Anything under 0.1% is a trace either way, so
// say that instead of printing a number nobody can read.
function formatPercentage(value) {
  if (value < 0.1) return 'Trace amount';
  return `${Number(value.toFixed(1))}% of product`;
}

// "processed meats" -> "Processed meats" -- these come out of the AI
// research call lowercased (it's writing a phrase, not a label), but
// sitting in a chip next to "Bread" and "Snacks" they read like a typo.
function titleCase(text) {
  return text.length > 0 ? text[0].toUpperCase() + text.slice(1) : text;
}

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

// One "icon + label" row with its detail text alongside -- What is it /
// Health effects both use this exact shape, so they read as a matched
// pair rather than two differently-built paragraphs.
function DetailRow({ icon, label, children }) {
  return (
    <div className="flex gap-3">
      <span className="flex-shrink-0 w-[92px] flex items-start gap-1.5 pt-0.5">
        <span className="text-[13px]" aria-hidden="true">{icon}</span>
        <span className="text-[12.5px] font-semibold leading-snug" style={{ color: 'var(--label-3)' }}>{label}</span>
      </span>
      <div className="flex-1 min-w-0 text-[14.5px] leading-relaxed" style={{ color: 'var(--label-1)' }}>
        {children}
      </div>
    </div>
  );
}

export default function IngredientCard({ ingredient, severityLabel, style }) {
  const [expanded, setExpanded] = useState(false);
  const severity = getIngredientSeverity(ingredient);
  const isConcerning = severity.label !== 'Fine';
  const iconColor = categoryColor(ingredient.category);
  const researchUrl = `https://www.google.com/search?q=${encodeURIComponent(`${ingredient.name} food ingredient health effects`)}`;

  return (
    <div
      className="item-in rounded-2xl overflow-hidden"
      style={{
        ...style,
        // A concerning ingredient's whole card carries the severity
        // colour, not just its pill -- the same visual weight Result.jsx
        // already gives a flagged concern elsewhere, so this row doesn't
        // read as calmer than it actually is once expanded.
        border: expanded && isConcerning ? `1px solid ${severity.color}55` : '1px solid transparent',
        background: expanded && isConcerning ? severity.bg : 'transparent',
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="tap-scale w-full flex items-center gap-3 px-4 py-3 text-left min-h-[44px]"
      >
        <span
          className="w-9 h-9 rounded-[10px] flex-shrink-0 flex items-center justify-center text-[17px]"
          style={{ background: iconColor.bg }}
        >
          {categoryIcon(ingredient.category)}
        </span>

        <span className="flex-1 min-w-0">
          <span className="block text-[17px] leading-snug tracking-[-0.01em] truncate" style={{ color: 'var(--label-1)' }}>
            {ingredient.name}
          </span>
          {ingredient.hindiName && (
            <span className="block text-[12.5px] leading-snug" style={{ color: 'var(--label-3)' }}>
              ({ingredient.hindiName})
            </span>
          )}
        </span>

        <span
          className="flex-shrink-0 flex items-center gap-1 text-[11.5px] font-semibold px-2.5 py-1 rounded-full"
          style={{ background: severity.bg, color: severity.color }}
        >
          {isConcerning && <span aria-hidden="true">!</span>}
          {!isConcerning && <span aria-hidden="true">✓</span>}
          {severityLabel || severity.label}
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
        <div className="item-in px-4 pb-4 pl-[64px] space-y-3">
          {ingredient.commonName && (
            <p className="text-[13px]" style={{ color: 'var(--label-2)' }}>
              <span style={{ color: 'var(--label-3)' }}>Common name: </span>
              {ingredient.commonName}
              {ingredient.scientificName && ` (${ingredient.scientificName})`}
            </p>
          )}

          {ingredient.reason && (
            <div
              className="flex items-start gap-2.5 rounded-xl px-3 py-2.5"
              style={{ background: isConcerning ? `${severity.color}1A` : 'var(--fill)' }}
            >
              <span className="text-[15px] flex-shrink-0" aria-hidden="true">{isConcerning ? '⚠️' : '💚'}</span>
              <p className="text-[14.5px] font-semibold leading-relaxed" style={{ color: 'var(--label-1)' }}>
                {ingredient.reason}
              </p>
            </div>
          )}

          {ingredient.whatIsIt && (
            <DetailRow icon="📖" label="What is it?">{ingredient.whatIsIt}</DetailRow>
          )}

          {ingredient.healthEffects && (
            <DetailRow icon="❤️" label="Health effects">{ingredient.healthEffects}</DetailRow>
          )}

          {ingredient.commonlyFoundIn?.length > 0 && (
            <DetailRow icon="🍲" label="Also found in">
              <div className="flex flex-wrap gap-1.5">
                {ingredient.commonlyFoundIn.map((item, i) => (
                  <span
                    key={i}
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--fill)', color: 'var(--label-2)' }}
                  >
                    {titleCase(item)}
                  </span>
                ))}
              </div>
            </DetailRow>
          )}

          {(ingredient.fssaiStatus || ingredient.euStatus || typeof ingredient.percentage === 'number') && (
            <DetailRow icon="📄" label="Regulatory status">
              <div className="flex flex-wrap gap-1.5">
                <Badge label="FSSAI" value={ingredient.fssaiStatus} />
                <Badge label="EU" value={ingredient.euStatus} />
                {typeof ingredient.percentage === 'number' && (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--fill)', color: 'var(--label-2)' }}
                  >
                    {formatPercentage(ingredient.percentage)}
                  </span>
                )}
              </div>
            </DetailRow>
          )}

          <a
            href={researchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="tap-scale flex items-center gap-2 rounded-xl px-3 py-2.5"
            style={{ background: 'var(--tint-bg)' }}
          >
            <span aria-hidden="true">🔗</span>
            <span className="flex-1 text-[14.5px] font-semibold" style={{ color: 'var(--tint)' }}>
              Research this ingredient
            </span>
            <svg viewBox="0 0 8 13" fill="none" className="w-2 h-3 flex-shrink-0" style={{ color: 'var(--tint)' }}>
              <path d="M1.5 1.5L6.5 6.5l-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>
      )}
    </div>
  );
}
