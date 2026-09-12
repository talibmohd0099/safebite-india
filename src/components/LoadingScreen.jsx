// src/components/LoadingScreen.jsx
import { useEffect, useState } from 'react';
import ScanBadge from './ScanBadge';

const STEPS = [
  { icon: '📷', label: 'Reading the label' },
  { icon: '🇮🇳', label: 'Checking FSSAI regulations' },
  { icon: '🇪🇺', label: 'Comparing with EU/EFSA standards' },
  { icon: '⚠️', label: 'Flagging concerning additives' },
  { icon: '📊', label: 'Calculating your health score' },
  { icon: '📝', label: 'Preparing your report' },
];

// Progress creeps toward 92% on its own, then jumps to 100% once
// the real API response actually arrives (component unmounts right after).
const MAX_SIMULATED_PROGRESS = 92;
const STEP_DURATION_MS = 1100;

export default function LoadingScreen({ message = 'Analyzing ingredients...' }) {
  const [progress, setProgress] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const progressTimer = setInterval(() => {
      setProgress((p) => (p < MAX_SIMULATED_PROGRESS ? p + 1 : p));
    }, (STEP_DURATION_MS * STEPS.length) / MAX_SIMULATED_PROGRESS);

    const stepTimer = setInterval(() => {
      setStepIndex((i) => (i < STEPS.length - 1 ? i + 1 : i));
    }, STEP_DURATION_MS);

    return () => {
      clearInterval(progressTimer);
      clearInterval(stepTimer);
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      {/* Scanning is literally what's happening right now -- same badge
          as the home hero, larger, as the centerpiece here. */}
      <div className="mb-6">
        <ScanBadge size={80} tone="soft" />
      </div>

      <h2 className="text-xl font-bold text-slate-800 mb-1 text-center">{message}</h2>
      <p className="text-slate-500 text-sm text-center mb-6">
        Generating your health report — usually 5–10 seconds
      </p>

      {/* Progress bar */}
      <div className="w-full max-w-sm mb-6">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-green-700">Analyzing</span>
          <span className="text-xs font-semibold text-slate-500 tabular-nums">{progress}%</span>
        </div>
        <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-green-500 to-green-600 rounded-full transition-all duration-200 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Step checklist */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 max-w-sm w-full space-y-2.5">
        {STEPS.map((step, i) => {
          const done = i < stepIndex;
          const active = i === stepIndex;
          return (
            <div
              key={i}
              className={`text-sm flex items-center gap-2.5 transition-opacity duration-300 ${
                done || active ? 'opacity-100' : 'opacity-40'
              }`}
            >
              <span className="flex-shrink-0 w-5 text-center">
                {done ? (
                  <span className="text-green-600">✓</span>
                ) : active ? (
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                ) : (
                  <span>{step.icon}</span>
                )}
              </span>
              <span className={done ? 'text-slate-400 line-through' : active ? 'text-slate-800 font-medium' : 'text-slate-500'}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
