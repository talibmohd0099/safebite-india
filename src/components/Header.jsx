// src/components/Header.jsx
// Just branding now -- Scan/History/About moved to BottomTabBar, since
// 3 top-level destinations belong within thumb reach, not the top edge.
import { Link } from 'react-router-dom';
import headerIcon from '../assets/header-icon.png';
import { useTheme } from '../hooks/useTheme';
import { useLanguage, HINDI_ENABLED } from '../contexts/LanguageContext';

const THEME_SEQUENCE = { light: 'dark', dark: 'system', system: 'light' };
const THEME_ICON = { light: '☀️', dark: '🌙', system: '🌓' };
const THEME_LABEL = { light: 'Light theme', dark: 'Dark theme', system: 'Following system theme' };

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <button
      onClick={() => setTheme(THEME_SEQUENCE[theme])}
      aria-label={`${THEME_LABEL[theme]} — tap to change`}
      title={THEME_LABEL[theme]}
      className="tap-scale w-8 h-8 rounded-full flex items-center justify-center text-[15px] bg-slate-100 dark:bg-slate-800"
    >
      {THEME_ICON[theme]}
    </button>
  );
}

// Shows the OTHER language's label -- tapping it switches you TO that
// language, same convention as most Indian apps' language switchers.
function LanguageToggle() {
  const { language, setLanguage } = useLanguage();
  const next = language === 'en' ? 'hi' : 'en';
  return (
    <button
      onClick={() => setLanguage(next)}
      aria-label={next === 'hi' ? 'हिंदी में बदलें' : 'Switch to English'}
      title={next === 'hi' ? 'हिंदी में बदलें' : 'Switch to English'}
      className="tap-scale w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
    >
      {next === 'hi' ? 'हिं' : 'EN'}
    </button>
  );
}

export default function Header() {
  return (
    <header className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 sticky top-0 z-40">
      <div className="max-w-2xl mx-auto px-4 py-2.5 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group w-fit">
          <img src={headerIcon} alt="" className="w-7 h-7 flex-shrink-0 rounded-lg" />
          {/* One line, not stacked -- "India" reads as an accent on the
              wordmark, not a second row competing for its own line. */}
          <span className="flex items-baseline gap-1.5">
            <span className="font-bold text-slate-800 dark:text-slate-100 text-[15px] leading-none">FoodGuard</span>
            <span className="text-[11px] font-bold text-green-600 dark:text-green-400 leading-none uppercase tracking-wide">India</span>
          </span>
        </Link>
        <div className="flex items-center gap-2">
          {HINDI_ENABLED && <LanguageToggle />}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
