// src/components/Header.jsx
// Just branding now -- Scan/History/About moved to BottomTabBar, since
// 3 top-level destinations belong within thumb reach, not the top edge.
import { Link } from 'react-router-dom';

export default function Header() {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
      <div className="max-w-2xl mx-auto px-4 py-3">
        <Link to="/" className="flex items-center gap-2 group w-fit">
          <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center text-white font-bold text-sm group-hover:bg-green-700 transition-colors">
            🛡️
          </div>
          <div>
            <span className="font-bold text-slate-800 text-lg leading-none">SafeBite</span>
            <span className="block text-xs text-green-600 leading-none font-medium">India</span>
          </div>
        </Link>
      </div>
    </header>
  );
}
