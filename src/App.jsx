// src/App.jsx
//
// HashRouter, not HashRouter: this deploys to GitHub Pages, which
// serves plain static files with no server-side rewrite rule (unlike
// Netlify's _redirects). A direct link or refresh on a route like
// /result/abc123 would 404 under HashRouter -- HashRouter keeps
// every route after the # (e.g. /#/result/abc123), which GitHub Pages
// always resolves to index.html since it's just a URL fragment as far
// as the server is concerned. The tradeoff is a visible # in the URL.
import { HashRouter, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Home from './pages/Home';
import Result from './pages/Result';
import History from './pages/History';
import About from './pages/About';

export default function App() {
  return (
    <HashRouter>
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
