// src/pages/Browse.jsx
// "See all" destination for the home screen's category teaser grid.
import { useNavigate } from 'react-router-dom';
import { CATEGORIES } from '../data/categories';
import CategoryIcon from '../components/CategoryIcon';

export default function Browse() {
  const navigate = useNavigate();

  return (
    <div className="page-in max-w-2xl mx-auto px-4 py-6 pb-24">
      <button
        onClick={() => navigate(-1)}
        className="tap-scale flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-4 transition-colors"
      >
        ← Back
      </button>
      <h1 className="text-xl font-bold text-slate-800 mb-5">Explore food</h1>

      <div className="grid grid-cols-2 gap-3">
        {CATEGORIES.map((cat, i) => (
          <button
            key={cat.id}
            onClick={() => navigate(`/category/${cat.id}`)}
            style={{ animationDelay: `${i * 40}ms` }}
            className={`item-in tap-scale flex items-center gap-3 p-4 rounded-2xl transition-transform hover:-translate-y-0.5 text-left ${cat.bg}`}
          >
            <span className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${cat.iconBg} ${cat.iconColor}`}>
              <CategoryIcon id={cat.id} className="w-6 h-6" />
            </span>
            <span className="text-sm font-semibold text-slate-700 leading-tight">{cat.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
