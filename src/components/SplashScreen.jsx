// src/components/SplashScreen.jsx
// The app's launch moment -- shown once per fresh load (like a native
// app's splash screen, not a one-time "first ever visit" thing), then
// fades away on its own. Reuses the same green gradient and shield icon
// as the rest of the brand rather than introducing a new look, with a
// handful of small food icons drifting past to tie it to what the app
// actually does. Auto-dismisses; nothing here blocks real loading, this
// is purely a branding beat.
import { useEffect, useState } from 'react';
import headerIcon from '../assets/header-icon.png';

const FOOD_PARTICLES = [
  { icon: '🍎', left: '18%', delay: '0.2s', size: '20px' },
  { icon: '🌾', left: '78%', delay: '0.6s', size: '22px' },
  { icon: '🥕', left: '32%', delay: '1.0s', size: '18px' },
  { icon: '🥦', left: '64%', delay: '0.4s', size: '20px' },
  { icon: '🍋', left: '50%', delay: '0.8s', size: '16px' },
];

const VISIBLE_MS = 1900;
const FADE_MS = 350;

export default function SplashScreen({ onDone }) {
  const [fading, setFading] = useState(false);
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    // Reduced-motion still gets a brief branded pause, just without the
    // moving parts -- skipping it entirely would jump straight into the
    // app with no beat at all, which reads as broken rather than fast.
    const visibleMs = reducedMotion ? 700 : VISIBLE_MS;
    const fadeTimer = setTimeout(() => setFading(true), visibleMs);
    const doneTimer = setTimeout(onDone, visibleMs + FADE_MS);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone, reducedMotion]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center hero-animated overflow-hidden"
      style={{ opacity: fading ? 0 : 1, transition: `opacity ${FADE_MS}ms ease-out` }}
    >
      {!reducedMotion && FOOD_PARTICLES.map((p, i) => (
        <span
          key={i}
          className="splash-particle absolute"
          style={{ left: p.left, bottom: '38%', fontSize: p.size, animationDelay: p.delay }}
          aria-hidden="true"
        >
          {p.icon}
        </span>
      ))}

      <div className="relative flex items-center justify-center">
        <span className={`absolute w-24 h-24 rounded-full bg-white/25 ${reducedMotion ? '' : 'splash-glow'}`} aria-hidden="true" />
        <img
          src={headerIcon}
          alt=""
          className={`relative w-20 h-20 rounded-2xl shadow-lg ${reducedMotion ? '' : 'splash-icon-in'}`}
        />
      </div>

      <div className={`mt-5 text-center ${reducedMotion ? '' : 'splash-text-in'}`}>
        <p className="text-white text-2xl font-extrabold tracking-tight">
          SafeBite <span className="text-lime-300">India</span>
        </p>
        <p className="text-white/80 text-[13px] font-medium mt-1">Scan. Know. Eat Smarter.</p>
      </div>
    </div>
  );
}
