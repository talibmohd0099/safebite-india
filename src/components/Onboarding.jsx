// src/components/Onboarding.jsx
// Shown once, the very first time the app is ever opened (gated by
// ONBOARDING_KEY in localStorage) -- not on every load like SplashScreen.
// Answers the three things a brand-new user actually needs before their
// first scan: what this app is, roughly how the score works, and the
// three ways to get a product in. Each slide reuses real visuals from
// elsewhere in the app (the actual logo, the same 3-icon scoring row
// shown in the "Why" modal, the same three Home-screen scan buttons)
// instead of inventing new iconography just for this screen.
import { useState } from 'react';
import headerIcon from '../assets/header-icon.png';
import { useLanguage } from '../contexts/LanguageContext';

export const ONBOARDING_KEY = 'foodguard-onboarding-seen';

const SCORE_STEPS = [
  { icon: '🧪', bg: 'var(--tint-bg)', labelKey: 'scoreModalStep1Title' },
  { icon: '⚙️', bg: 'var(--v-moderate-bg)', labelKey: 'scoreModalStep2Title' },
  { icon: '⭐', bg: 'var(--v-good-bg)', labelKey: 'scoreModalStep3Title' },
];

const SCAN_WAYS = [
  { icon: '📷', labelKey: 'onboardingScanPhoto' },
  { icon: '🔢', labelKey: 'onboardingBarcode' },
  { icon: '📄', labelKey: 'onboardingPaste' },
];

export default function Onboarding({ onDone }) {
  const { t } = useLanguage();
  const [step, setStep] = useState(0);

  const STEPS = [
    { titleKey: 'onboardingStep1Title', bodyKey: 'onboardingStep1Body' },
    { titleKey: 'onboardingStep2Title', bodyKey: 'onboardingStep2Body' },
    { titleKey: 'onboardingStep3Title', bodyKey: 'onboardingStep3Body' },
  ];
  const isLast = step === STEPS.length - 1;

  const finish = () => {
    try { localStorage.setItem(ONBOARDING_KEY, '1'); } catch { /* private mode etc -- just don't persist */ }
    onDone();
  };

  return (
    <div
      className="fixed inset-0 z-[9998] flex flex-col"
      style={{ background: 'var(--bg-card)' }}
    >
      {step < STEPS.length - 1 && (
        <button
          onClick={finish}
          className="tap-scale self-end mt-4 mr-4 px-3 py-1.5 text-[13px] font-semibold"
          style={{ color: 'var(--label-3)' }}
        >
          {t('onboardingSkip')}
        </button>
      )}

      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        {step === 0 && (
          <img src={headerIcon} alt="" className="w-24 h-24 rounded-[22px] shadow-lg mb-6 item-in" />
        )}

        {step === 1 && (
          <div className="flex items-center justify-center gap-2 mb-6 item-in">
            {SCORE_STEPS.map((s, i) => (
              <div key={s.labelKey} className="flex items-center">
                <div className="flex flex-col items-center">
                  <span
                    className="w-14 h-14 rounded-full flex-shrink-0 flex items-center justify-center text-[24px] mb-1.5"
                    style={{ background: s.bg }}
                  >
                    {s.icon}
                  </span>
                  <p className="text-[11px] font-semibold" style={{ color: 'var(--label-2)' }}>{t(s.labelKey)}</p>
                </div>
                {i < SCORE_STEPS.length - 1 && (
                  <span className="text-[16px] px-1.5 pb-4" style={{ color: 'var(--label-3)' }}>→</span>
                )}
              </div>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="flex items-center justify-center gap-3 mb-6 item-in">
            {SCAN_WAYS.map((w) => (
              <div key={w.labelKey} className="flex flex-col items-center">
                <span
                  className="w-14 h-14 rounded-full flex-shrink-0 flex items-center justify-center text-[24px] mb-1.5"
                  style={{ background: 'var(--tint-bg)' }}
                >
                  {w.icon}
                </span>
                <p className="text-[11px] font-semibold" style={{ color: 'var(--label-2)' }}>{t(w.labelKey)}</p>
              </div>
            ))}
          </div>
        )}

        <p className="text-[22px] font-bold tracking-tight leading-tight mb-3" style={{ color: 'var(--label-1)' }}>
          {t(STEPS[step].titleKey)}
        </p>
        <p className="text-[14.5px] leading-relaxed max-w-[320px]" style={{ color: 'var(--label-2)' }}>
          {t(STEPS[step].bodyKey)}
        </p>
      </div>

      <div className="pb-10 px-6">
        <div className="flex items-center justify-center gap-1.5 mb-5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className="rounded-full transition-all"
              style={{
                width: i === step ? '18px' : '6px',
                height: '6px',
                background: i === step ? 'var(--tint)' : 'var(--fill)',
              }}
            />
          ))}
        </div>

        <button
          onClick={() => (isLast ? finish() : setStep((s) => s + 1))}
          className="tap-scale w-full py-3.5 rounded-[14px] text-[15px] font-semibold text-white"
          style={{ background: 'var(--tint)' }}
        >
          {isLast ? t('onboardingGetStarted') : t('onboardingNext')}
        </button>
      </div>
    </div>
  );
}
