// src/components/StoryCards.jsx
//
// The product's story as swipeable cards (Instagram-story style) instead
// of four long text blocks: one idea per card, progress bars on top,
// swipe or tap the edges to move. Each myth is its own card that you tap
// to reveal the fact -- a small "guess first" moment. Same text as
// before (geminiService.js's story), only the presentation changed.
// Native CSS scroll-snap, no library; works with touch, mouse and keys.
import { useEffect, useRef, useState } from 'react';

const LOOK = {
  intro: { icon: '✨', bg: 'var(--tint-bg)', accent: 'var(--tint)' },
  history: { icon: '📜', bg: 'var(--tint-bg)', accent: 'var(--tint)' },
  why: { icon: '⚙️', bg: 'var(--v-good-bg)', accent: 'var(--v-good)' },
  controversy: { icon: '⚠️', bg: 'var(--v-poor-bg)', accent: 'var(--v-poor)' },
  myth: { icon: '🤔', bg: 'var(--v-moderate-bg)', accent: 'var(--v-moderate)' },
};

function MythCard({ pair, t }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <button type="button" onClick={() => setRevealed((v) => !v)} className="w-full text-left" aria-expanded={revealed}>
      <p className="text-[12px] font-bold uppercase tracking-wide" style={{ color: 'var(--v-poor)' }}>✗ {t('mythLabel').replace(/[:：]\s*$/, '')}</p>
      <p className="text-[17px] font-semibold leading-snug mt-1.5" style={{ color: 'var(--label-1)' }}>{pair.myth}</p>
      {revealed ? (
        <div className="item-in mt-4 rounded-xl p-3" style={{ background: 'var(--bg-card)' }}>
          <p className="text-[12px] font-bold uppercase tracking-wide" style={{ color: 'var(--v-good)' }}>✓ {t('factLabel').replace(/[:：]\s*$/, '')}</p>
          <p className="text-[15px] leading-relaxed mt-1" style={{ color: 'var(--label-1)' }}>{pair.fact}</p>
        </div>
      ) : (
        <p className="mt-4 text-[13px] font-semibold" style={{ color: 'var(--tint)' }}>{t('storyTapForFact')} 👆</p>
      )}
    </button>
  );
}

export default function StoryCards({ story, t }) {
  const cards = [
    story.headline && { kind: 'intro', title: t('storyIntro'), text: story.headline },
    story.history && { kind: 'history', title: t('storyHistory'), text: story.history },
    story.whyItsUsed && { kind: 'why', title: t('storyWhyUsed'), text: story.whyItsUsed },
    story.controversy && { kind: 'controversy', title: t('storyControversy'), text: story.controversy },
    ...(story.mythVsFact || []).map((pair) => ({ kind: 'myth', title: t('storyMythVsFact'), pair })),
  ].filter(Boolean);

  const trackRef = useRef(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return undefined;
    const onScroll = () => setIndex(Math.round(el.scrollLeft / el.clientWidth));
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const go = (i) => {
    const el = trackRef.current;
    if (!el) return;
    const next = Math.max(0, Math.min(cards.length - 1, i));
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
  };

  if (cards.length === 0) return null;

  return (
    <div className="mx-4 mt-4">
      {/* Progress bars -- one per card, filled up to the current one */}
      <div className="flex gap-1 mb-2" aria-hidden="true">
        {cards.map((_, i) => (
          <span key={i} className="flex-1 h-[3px] rounded-full" style={{ background: i <= index ? 'var(--tint)' : 'var(--fill)', transition: 'background 250ms' }} />
        ))}
      </div>

      <div
        ref={trackRef}
        className="flex overflow-x-auto rounded-[18px]"
        style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none' }}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') go(index + 1);
          if (e.key === 'ArrowLeft') go(index - 1);
        }}
        aria-label={t('storyCardsLabel', { current: index + 1, total: cards.length })}
      >
        {cards.map((card, i) => {
          const look = LOOK[card.kind];
          return (
            <div
              key={i}
              className="flex-shrink-0 w-full px-5 py-5 flex flex-col"
              style={{ scrollSnapAlign: 'start', background: look.bg, minHeight: 300 }}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[22px]" aria-hidden="true">{look.icon}</span>
                <p className="text-[13px] font-bold uppercase tracking-wide" style={{ color: look.accent }}>{card.title}</p>
                <span className="ml-auto text-[12px] tabular-nums" style={{ color: 'var(--label-3)' }}>{i + 1}/{cards.length}</span>
              </div>
              {card.kind === 'myth' ? (
                <MythCard pair={card.pair} t={t} />
              ) : (
                <p className={`${card.kind === 'intro' ? 'text-[20px] font-bold leading-snug' : 'text-[16px] leading-relaxed'}`} style={{ color: 'var(--label-1)' }}>
                  {card.text}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between mt-2.5">
        <button
          onClick={() => go(index - 1)}
          disabled={index === 0}
          className="tap-scale px-3 py-1.5 rounded-full text-[13px] font-semibold disabled:opacity-30"
          style={{ background: 'var(--fill)', color: 'var(--label-1)' }}
        >
          ‹ {t('storyPrev')}
        </button>
        <p className="text-[12px]" style={{ color: 'var(--label-3)' }}>{t('storySwipeHint')}</p>
        <button
          onClick={() => go(index + 1)}
          disabled={index === cards.length - 1}
          className="tap-scale px-3 py-1.5 rounded-full text-[13px] font-semibold disabled:opacity-30"
          style={{ background: 'var(--tint)', color: '#fff' }}
        >
          {t('storyNext')} ›
        </button>
      </div>
    </div>
  );
}
