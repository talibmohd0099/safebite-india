// src/App.jsx
//
// HashRouter, not BrowserRouter: this deploys to GitHub Pages, which
// serves plain static files with no server-side rewrite rule (unlike
// Netlify's _redirects). A direct link or refresh on a route like
// /result/abc123 would 404 under HashRouter -- HashRouter keeps
// every route after the # (e.g. /#/result/abc123), which GitHub Pages
// always resolves to index.html since it's just a URL fragment as far
// as the server is concerned. The tradeoff is a visible # in the URL.
// It also happens to suit the Android app build just as well, since
// Capacitor serves local files the same server-less way.
import { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { LanguageProvider } from './contexts/LanguageContext';
import { FamilyProvider } from './contexts/FamilyContext';
import Header from './components/Header';
import BottomTabBar from './components/BottomTabBar';
import SplashScreen from './components/SplashScreen';
import Onboarding, { ONBOARDING_KEY } from './components/Onboarding';
import Home from './pages/Home';
import Result from './pages/Result';
import PersonalScore from './pages/PersonalScore';
import SharedProduct from './pages/SharedProduct';
import History from './pages/History';
import Family from './pages/Family';
import About from './pages/About';
import Browse from './pages/Browse';
import Category from './pages/Category';
import PopularSearches from './pages/PopularSearches';
import News from './pages/News';
import AdminLogin from './pages/admin/AdminLogin';
import AdminGuard from './pages/admin/AdminGuard';
import AdminProductList from './pages/admin/AdminProductList';
import AdminProductForm from './pages/admin/AdminProductForm';
import AdminFlagsList from './pages/admin/AdminFlagsList';
import AdminDuplicates from './pages/admin/AdminDuplicates';
import AdminImport from './pages/admin/AdminImport';
import AdminActivityLog from './pages/admin/AdminActivityLog';
import AdminProductHistory from './pages/admin/AdminProductHistory';

// The Android app's hardware/gesture back button doesn't do anything by
// default in a Capacitor WebView -- without this, it would just sit
// there doing nothing instead of the "go back a screen" every Android
// user expects. No-ops entirely on the web build (isNativePlatform is
// false there), so this only ever runs inside the actual app.
function AndroidBackButton() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const listenerPromise = CapacitorApp.addListener('backButton', () => {
      if (location.pathname !== '/') {
        navigate(-1);
      } else {
        CapacitorApp.exitApp();
      }
    });

    return () => { listenerPromise.then((listener) => listener.remove()); };
  }, [location, navigate]);

  return null;
}

// The admin panel is a separate internal tool sharing this same app
// shell for convenience (one deploy, one build) -- it gets its own
// plain layout, not the consumer app's header/bottom tab bar, and
// isn't linked from anywhere in the public UI.
function AppShell() {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-grouped)' }}>
      {!isAdmin && <Header />}
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/result/:id" element={<Result />} />
          <Route path="/result/:id/personal" element={<PersonalScore />} />
          <Route path="/p/:reportId" element={<SharedProduct />} />
          <Route path="/history" element={<History />} />
          <Route path="/family" element={<Family />} />
          <Route path="/about" element={<About />} />
          <Route path="/browse" element={<Browse />} />
          <Route path="/category/:id" element={<Category />} />
          <Route path="/popular" element={<PopularSearches />} />
          <Route path="/news" element={<News />} />
          <Route path="/admin" element={<AdminLogin />} />
          <Route path="/admin/products" element={<AdminGuard><AdminProductList /></AdminGuard>} />
          <Route path="/admin/products/new" element={<AdminGuard><AdminProductForm /></AdminGuard>} />
          <Route path="/admin/products/:id/edit" element={<AdminGuard><AdminProductForm /></AdminGuard>} />
          <Route path="/admin/products/:id/history" element={<AdminGuard><AdminProductHistory /></AdminGuard>} />
          <Route path="/admin/flags" element={<AdminGuard><AdminFlagsList /></AdminGuard>} />
          <Route path="/admin/duplicates" element={<AdminGuard><AdminDuplicates /></AdminGuard>} />
          <Route path="/admin/import" element={<AdminGuard><AdminImport /></AdminGuard>} />
          <Route path="/admin/activity" element={<AdminGuard><AdminActivityLog /></AdminGuard>} />
        </Routes>
      </main>
      {!isAdmin && <BottomTabBar />}
    </div>
  );
}

export default function App() {
  // Shown once per fresh load, like a native app's launch screen -- not
  // a one-time "first ever visit" flag, so it doesn't need localStorage.
  // Native-only: the web build has no equivalent "cold start" moment to
  // paper over (Vite/the browser already shows its own loading state),
  // so it would just be a few extra seconds of green screen for nothing.
  const [showSplash, setShowSplash] = useState(() => Capacitor.isNativePlatform());

  // Unlike the splash screen, this genuinely is a one-time "first ever
  // visit" flag -- read once at startup so a returning user's very
  // first render never shows onboarding, not even for a flash.
  //
  // Skipped (not marked as seen) when the app was opened from a shared
  // WhatsApp link: that person came to read one specific report, and
  // three intro slides in front of it is a good way to lose them. They
  // still get onboarding the next time they open the app on its own.
  const [showOnboarding, setShowOnboarding] = useState(() => {
    if (window.location.hash.startsWith('#/p/') || window.location.hash.startsWith('#/admin')) return false;
    try { return !localStorage.getItem(ONBOARDING_KEY); } catch { return false; }
  });

  return (
    <LanguageProvider>
      <FamilyProvider>
        <HashRouter>
          <AndroidBackButton />
          <AppShell />
          {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
          {!showSplash && showOnboarding && <Onboarding onDone={() => setShowOnboarding(false)} />}
        </HashRouter>
      </FamilyProvider>
    </LanguageProvider>
  );
}
