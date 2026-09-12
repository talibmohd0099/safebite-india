// src/pages/Browse.jsx
// "See all" destination for the home screen's category teaser grid.
import { useNavigate } from 'react-router-dom';
import { CATEGORIES } from '../data/categories';

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
            className="item-in tap-scale rounded-2xl overflow-hidden transition-transform hover:-translate-y-0.5 shadow-sm"
          >
            <img src={cat.image} alt={cat.label} className="w-full h-full object-cover aspect-[4/5]" />
          </button>
        ))}
      </div>
    </div>
  );
}
