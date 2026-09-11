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
import { useEffect } from 'react';
import { HashRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import Header from './components/Header';
import Home from './pages/Home';
import Result from './pages/Result';
import History from './pages/History';
import About from './pages/About';

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
  return (
    <HashRouter>
      <AndroidBackButton />
      <div className="min-h-screen" style={{ background: 'var(--bg-grouped)' }}>
        <Header />
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/result/:id" element={<Result />} />
            <Route path="/history" element={<History />} />
            <Route path="/about" element={<About />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
