// src/pages/Settings.jsx
//
// A single hub for everything that isn't a core scan/browse flow --
// Family profiles, Notifications, and About/how-scoring-works -- so the
// bottom tab bar stays 4 core destinations instead of 5, with the
// less-frequently-tapped ones one level deeper instead of each owning a
// permanent thumb-reach slot.
import { Link } from 'react-router-dom';
import NotificationSettings from '../components/NotificationSettings';
import { isNativeApp } from '../services/notifications';
import { PUBLIC_APP_URL } from '../utils/share';

function NavRow({ to, icon, title, description }) {
  return (
    <Link
      to={to}
      className="tap-scale flex items-center gap-3 py-3.5 px-1 first:pt-0 last:pb-0"
    >
      <span className="w-10 h-10 rounded-xl bg-green-50 dark:bg-green-950 flex items-center justify-center text-lg flex-shrink-0">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-slate-800 dark:text-slate-100">{title}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
      </div>
      <span className="text-slate-300 dark:text-slate-600 text-lg flex-shrink-0">›</span>
    </Link>
  );
}

function shareApp() {
  const text = 'FoodGuard India — check what\'s really in your packaged food, built for Indian labels and FSSAI rules.';
  if (navigator.share) {
    navigator.share({ title: 'FoodGuard India', text, url: PUBLIC_APP_URL }).catch(() => {});
  } else {
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${PUBLIC_APP_URL}`)}`, '_blank', 'noopener');
  }
}

export default function Settings() {
  return (
    <div className="page-in max-w-2xl mx-auto px-4 py-8 pb-24">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-1">Settings</h1>
      <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">Your profiles, alerts, and how FoodGuard works.</p>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 divide-y divide-slate-100 dark:divide-slate-700 mb-4">
        <NavRow to="/family" icon="👪" title="Family" description="Profiles and personal scores for the people you scan for" />
        <NavRow to="/about" icon="🛡️" title="About FoodGuard" description="Our mission, how scoring works, and data sources" />
      </div>

      {/* Self-contained card; renders nothing on the web (Android-only feature). */}
      <NotificationSettings />

      <button
        onClick={shareApp}
        className="tap-scale w-full flex items-center gap-3 py-3.5 px-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl mb-4"
      >
        <span className="w-10 h-10 rounded-xl bg-green-50 dark:bg-green-950 flex items-center justify-center text-lg flex-shrink-0">📤</span>
        <div className="min-w-0 flex-1 text-left">
          <p className="text-[15px] font-semibold text-slate-800 dark:text-slate-100">Share FoodGuard</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Tell someone else to check their food too</p>
        </div>
      </button>

      <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-2">
        FoodGuard India {isNativeApp() ? '· Android app' : ''}
      </p>
    </div>
  );
}
