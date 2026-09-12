// src/components/Header.jsx
// Just branding now -- Scan/History/About moved to BottomTabBar, since
// 3 top-level destinations belong within thumb reach, not the top edge.
import { Link } from 'react-router-dom';

export default function Header() {
  return (
    <header className="bg-white border-b border-slate-100 sticky top-0 z-40">
      <div className="max-w-2xl mx-auto px-4 py-2.5">
        <Link to="/" className="flex items-center gap-2 group w-fit">
          <div className="w-7 h-7 bg-green-600 rounded-lg flex items-center justify-center text-white text-sm flex-shrink-0 group-hover:bg-green-700 transition-colors">
            🛡️
          </div>
          {/* One line, not stacked -- "India" reads as an accent on the
              wordmark, not a second row competing for its own line. */}
          <span className="flex items-baseline gap-1.5">
            <span className="font-bold text-slate-800 text-[15px] leading-none">SafeBite</span>
            <span className="text-[11px] font-bold text-green-600 leading-none uppercase tracking-wide">India</span>
          </span>
        </Link>
      </div>
    </header>
  );
}
