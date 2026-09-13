// src/components/BottomTabBar.jsx
// The app's 3 main destinations, thumb-reachable at the bottom instead
// of buried in the top header -- the standard pattern for an app with
// only a handful of top-level screens.
import { Link, useLocation } from 'react-router-dom';

const TABS = [
  { path: '/', label: 'Scan', icon: '🔍' },
  { path: '/history', label: 'History', icon: '📋' },
  { path: '/news', label: 'News', icon: '📰' },
  { path: '/about', label: 'About', icon: '🛡️' },
];

export default function BottomTabBar() {
  const location = useLocation();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="max-w-2xl mx-auto grid grid-cols-4">
        {TABS.map((tab) => {
          const active = location.pathname === tab.path;
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className="tap-scale flex flex-col items-center gap-0.5 py-2.5"
            >
              <span className={`text-xl leading-none transition-transform ${active ? 'scale-110' : 'opacity-50'}`}>
                {tab.icon}
              </span>
              <span className={`text-[11px] font-semibold ${active ? 'text-green-700' : 'text-slate-400'}`}>
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
