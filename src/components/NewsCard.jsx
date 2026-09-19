// src/components/NewsCard.jsx
// One news/research item card -- shared between the News page and the
// Result page's "Related reading" section, so both look and behave
// identically rather than maintaining two near-copies.
function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function NewsCard({ item }) {
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="tap-scale block bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 mb-2.5"
    >
      {item.summary ? (
        <>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-snug mb-1">{item.summary}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug mb-1.5 line-clamp-1">{item.title}</p>
        </>
      ) : (
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-snug mb-1">{item.title}</p>
      )}
      <p className="text-xs text-slate-400 dark:text-slate-500">
        {[item.source, formatDate(item.published_at)].filter(Boolean).join(' · ')}
        {item.summary && ' · Read original ›'}
      </p>
    </a>
  );
}
