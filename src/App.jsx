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

export default function App() {
  // Shown once per fresh load, like a native app's launch screen -- not
  // a one-time "first ever visit" flag, so it doesn't need localStorage.
  const [showSplash, setShowSplash] = useState(true);

  // Unlike the splash screen, this genuinely is a one-time "first ever
  // visit" flag -- read once at startup so a returning user's very
  // first render never shows onboarding, not even for a flash.
  //
  // Skipped (not marked as seen) when the app was opened from a shared
  // WhatsApp link: that person came to read one specific report, and
  // three intro slides in front of it is a good way to lose them. They
  // still get onboarding the next time they open the app on its own.
  const [showOnboarding, setShowOnboarding] = useState(() => {
    if (window.location.hash.startsWith('#/p/')) return false;
    try { return !localStorage.getItem(ONBOARDING_KEY); } catch { return false; }
  });

  return (
    <LanguageProvider>
      <FamilyProvider>
        <HashRouter>
          <AndroidBackButton />
          <div className="min-h-screen" style={{ background: 'var(--bg-grouped)' }}>
            <Header />
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
              </Routes>
            </main>
            <BottomTabBar />
          </div>
          {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
          {!showSplash && showOnboarding && <Onboarding onDone={() => setShowOnboarding(false)} />}
        </HashRouter>
      </FamilyProvider>
    </LanguageProvider>
  );
}
