// src/components/IngredientCard.jsx
import { useState } from 'react';
import { getIngredientStatus } from '../utils/storage';

const CATEGORY_ICONS = {
  preservative: '🧪',
  sweetener: '🍬',
  color: '🎨',
  colorant: '🎨',
  emulsifier: '🧴',
  flavour: '👃',
  flavor: '👃',
  'acidity regulator': '⚗️',
  antioxidant: '🛡️',
  stabilizer: '🧷',
  'raising agent': '🫧',
  oil: '🫗',
  fat: '🫗',
  protein: '🥩',
  spice: '🌶️',
  natural: '🌿',
};

function categoryIcon(category) {
  if (!category) return '🔹';
  return CATEGORY_ICONS[category.toLowerCase()] || '🔹';
}

export default function IngredientCard({ ingredient }) {
  const [expanded, setExpanded] = useState(false);
  const statusInfo = getIngredientStatus(ingredient.status);

  const getRegulatoryBadge = (status, label) => {
    const colors = {
      permitted: 'bg-green-100 text-green-700',
      restricted: 'bg-yellow-100 text-yellow-700',
      banned: 'bg-red-100 text-red-700',
      not_regulated: 'bg-gray-100 text-gray-600',
    };
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[status] || colors.not_regulated}`}>
        {label}: {status?.replace('_', ' ') || 'unknown'}
      </span>
    );
  };

  const researchUrl = `https://www.google.com/search?q=${encodeURIComponent(`${ingredient.name} food ingredient health effects`)}`;

  return (
    <div
      className={`ingredient-card rounded-xl border p-3 cursor-pointer transition-shadow hover:shadow-sm ${statusInfo.bg} ${statusInfo.border}`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <span className="text-lg flex-shrink-0 mt-0.5">{statusInfo.icon}</span>
          <div className="flex-1 min-w-0">
            <p className={`font-semibold text-sm ${statusInfo.text} leading-tight`}>
              {ingredient.name}
            </p>
            {ingredient.category && (
              <span className="text-xs text-slate-500 capitalize">
                {categoryIcon(ingredient.category)} {ingredient.category}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${statusInfo.bg} ${statusInfo.text} ${statusInfo.border}`}>
            {statusInfo.label}
          </span>
          <span className="text-slate-400 text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-200 space-y-3">
          {ingredient.reason && (
            <p className="text-sm text-slate-700 leading-relaxed">
              {ingredient.reason}
            </p>
          )}

          {ingredient.whatIsIt && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">What is it?</p>
              <p className="text-sm text-slate-700 leading-relaxed">{ingredient.whatIsIt}</p>
            </div>
          )}

          {ingredient.healthEffects && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">Health effects</p>
              <p className="text-sm text-slate-700 leading-relaxed">{ingredient.healthEffects}</p>
            </div>
          )}

          {ingredient.commonlyFoundIn?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Also found in</p>
              <div className="flex flex-wrap gap-1.5">
                {ingredient.commonlyFoundIn.map((item, i) => (
                  <span key={i} className="bg-white border border-slate-200 text-slate-600 text-xs px-2 py-0.5 rounded-full">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            {ingredient.fssaiStatus && getRegulatoryBadge(ingredient.fssaiStatus, 'FSSAI')}
            {ingredient.euStatus && getRegulatoryBadge(ingredient.euStatus, 'EU')}
          </div>

          <a
            href={researchUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 bg-white border border-blue-200 px-3 py-1.5 rounded-full transition-colors"
          >
            🔎 Research {ingredient.name} further
          </a>
        </div>
      )}
    </div>
  );
}
