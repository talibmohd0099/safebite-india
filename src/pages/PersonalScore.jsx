// src/pages/PersonalScore.jsx
//
// The full "how does this fit this person" breakdown, on its own page
// rather than crammed into an expandable strip on the Result page.
// Everything here is derived from the SAME already-computed report --
// no second analysis, no AI call (see services/personalAssessment.js).
//
// The Result page keeps the compact card (score + "should X eat it?")
// for the quick answer; this page is for the "why", which needs room:
// the two scores side by side, what actually matched, and just as
// importantly what DIDN'T -- a person watching four things wants to see
// the three that came back clean, not only the one that didn't.
import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getHistoryById, getScoreColor } from '../utils/storage';
import { useLanguage } from '../contexts/LanguageContext';
import { useFamily } from '../contexts/FamilyContext';
import {
  calculatePersonalAssessment,
  getPersonalEatAnswerKey,
  PRIORITY_LABEL_KEY,
  PRIORITY_CONCERN_KEY,
  PRIORITY_NOTE_KEY,
} from '../services/personalAssessment';

function ScoreBlock({ caption, score, label, color, bg, dim }) {
  return (
    <div className="flex-1 text-center">
      <p className="text-[12px] font-semibold mb-1.5" style={{ color: 'var(--label-3)' }}>{caption}</p>
      <span
        className="w-[72px] h-[72px] rounded-full mx-auto flex items-center justify-center"
        style={{ background: dim ? 'var(--fill)' : bg }}
      >
        <span className="text-[26px] font-bold tabular-nums" style={{ color: dim ? 'var(--label-2)' : color }}>
          {score}
        </span>
      </span>
      <p className="text-[14px] font-bold mt-1.5" style={{ color: dim ? 'var(--label-2)' : color }}>{label}</p>
    </div>
  );
}

export default function PersonalScore() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { profiles, activeProfileId } = useFamily();
  const [result, setResult] = useState(null);

  useEffect(() => {
    const data = getHistoryById(id);
    if (!data) {
      navigate('/');
      return;
    }
    setResult(data);
  }, [id, navigate]);

  const profile = profiles.find((p) => p.id === activeProfileId) || null;

  // Landing here with no profile selected (a stale link, or the profile
  // was deleted from the Family tab in between) has nothing to show --
  // send them back to the result rather than rendering an empty shell.
  useEffect(() => {
    if (result && !profile) navigate(`/result/${id}`, { replace: true });
  }, [result, profile, id, navigate]);

  if (!result || !profile) return null;

  const assessment = calculatePersonalAssessment(result, profile);
  const generalScore = result.overallScore || 0;
  const generalColors = getScoreColor(generalScore);
  const priorities = profile.priorities || [];

  const flaggedKeys = new Set([
    ...assessment.matchedConcerns.map((c) => c.priorityKey),
    ...assessment.notes.map((n) => n.priorityKey),
  ]);
  const clearPriorities = priorities.filter((key) => !flaggedKeys.has(key));

  return (
    <div className="max-w-2xl mx-auto pb-28">
      <div className="px-4 pt-3">
        <Link to={`/result/${id}`} className="tap-scale text-[15px] font-semibold" style={{ color: 'var(--tint)' }}>
          ‹ {t('personalBackToResult')}
        </Link>
      </div>

      <div className="px-5 pt-3 pb-1">
        {profile.avatarEmoji && <span className="text-[26px]">{profile.avatarEmoji}</span>}
        <h1 className="text-[24px] leading-tight font-bold tracking-tight mt-1" style={{ color: 'var(--label-1)' }}>
          {t('personalPageTitle', { name: profile.nickname })}
        </h1>
        <p className="text-[14px] mt-1" style={{ color: 'var(--label-2)' }}>
          {result.productName || 'Unknown Product'}
        </p>
      </div>

      {/* The two scores side by side. Seeing the general score next to
          the personal one is the whole point -- it makes clear the
          product hasn't changed, only how well it fits this person. */}
      <div className="mx-4 mt-3 rounded-[20px] p-5" style={{ background: 'var(--bg-card)' }}>
        <div className="flex items-start gap-3">
          <ScoreBlock
            caption={t('personalScoreCaption')}
            score={generalScore}
            label={generalColors.label}
            color={generalColors.color}
            bg={generalColors.bg}
            dim
          />
          <div className="w-px self-stretch" style={{ background: 'var(--separator)' }} />
          <ScoreBlock
            caption={t('personalScoreTitle', { name: profile.nickname })}
            score={assessment.personalScore}
            label={assessment.tier.label}
            color={assessment.tier.color}
            bg={assessment.tier.bg}
          />
        </div>

        <div className="flex gap-2.5 items-start mt-4 pt-4" style={{ borderTop: '1px solid var(--separator)' }}>
          <span className="text-[18px] leading-none mt-0.5 flex-shrink-0">🍽️</span>
          <p className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[13.5px] font-semibold" style={{ color: 'var(--label-2)' }}>
              {t('shouldXEatIt', { name: profile.nickname })}
            </span>
            <span className="text-[15px] font-bold" style={{ color: assessment.tier.color }}>
              {t(getPersonalEatAnswerKey(assessment.personalScore))}
            </span>
          </p>
        </div>
      </div>

      {/* Nothing matched at all -- say so plainly instead of leaving the
          page looking like something failed to load. */}
      {assessment.hasNothingToShow && (
        <div className="mx-4 mt-3 rounded-[20px] p-5 text-center" style={{ background: 'var(--bg-card)' }}>
          <p className="text-[30px] leading-none mb-2">👍</p>
          <p className="text-[15px] font-bold mb-1" style={{ color: 'var(--label-1)' }}>
            {t('personalAllClearTitle', { name: profile.nickname })}
          </p>
          <p className="text-[13.5px] leading-relaxed" style={{ color: 'var(--label-2)' }}>
            {t('personalAllClearBody')}
          </p>
        </div>
      )}

      {assessment.matchedConcerns.length > 0 && (
        <>
          <p className="px-5 pt-6 pb-1.5 text-[13px]" style={{ color: 'var(--label-2)' }}>
            {t('personalWhyDifferent', { name: profile.nickname })}
          </p>
          <div className="mx-4 space-y-2">
            {assessment.matchedConcerns.map((c) => (
              <div key={c.priorityKey} className="rounded-[14px] p-3.5" style={{ background: 'var(--bg-card)' }}>
                <p className="text-[14px] font-bold" style={{ color: 'var(--v-poor)' }}>
                  ⚠ {t(PRIORITY_CONCERN_KEY[c.priorityKey])}
                </p>
                <p className="text-[13px] leading-relaxed mt-1" style={{ color: 'var(--label-2)' }}>
                  {t('personalPriorityReason', {
                    name: profile.nickname,
                    priority: t(PRIORITY_LABEL_KEY[c.priorityKey]).toLowerCase(),
                  })}
                </p>
              </div>
            ))}
          </div>
        </>
      )}

      {assessment.notes.length > 0 && (
        <>
          <p className="px-5 pt-6 pb-1.5 text-[13px]" style={{ color: 'var(--label-2)' }}>
            {t('personalNotesHeader')}
          </p>
          <div className="mx-4 space-y-2">
            {assessment.notes.map((n) => (
              <div key={n.priorityKey} className="rounded-[14px] p-3.5" style={{ background: 'var(--bg-card)' }}>
                <p className="text-[14px] font-bold" style={{ color: 'var(--label-2)' }}>
                  💡 {t(PRIORITY_NOTE_KEY[n.priorityKey])}
                </p>
                <p className="text-[13px] leading-relaxed mt-1" style={{ color: 'var(--label-3)' }}>
                  {t('personalPriorityNoteReason', {
                    name: profile.nickname,
                    priority: t(PRIORITY_LABEL_KEY[n.priorityKey]).toLowerCase(),
                  })}
                </p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Every priority, including the ones that came back clean. A
          person watching four things wants to see the three that are
          fine here, not just the one that isn't -- and it also makes it
          obvious WHICH preferences this verdict was actually based on. */}
      {priorities.length > 0 && (
        <>
          <p className="px-5 pt-6 pb-1.5 text-[13px]" style={{ color: 'var(--label-2)' }}>
            {t('personalWatchingHeader', { name: profile.nickname })}
          </p>
          <div className="mx-4 rounded-[14px] overflow-hidden" style={{ background: 'var(--bg-card)' }}>
            {priorities.map((key, i) => {
              const isConcern = assessment.matchedConcerns.some((c) => c.priorityKey === key);
              const isNote = assessment.notes.some((n) => n.priorityKey === key);
              const icon = isConcern ? '⚠' : isNote ? '💡' : '✓';
              const statusKey = isConcern
                ? 'personalPriorityFlagged'
                : isNote
                  ? 'personalPriorityNoted'
                  : 'personalPriorityClear';
              return (
                <div
                  key={key}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                  style={i > 0 ? { borderTop: '1px solid var(--separator)' } : undefined}
                >
                  <span className="text-[14px] font-semibold" style={{ color: 'var(--label-1)' }}>
                    {t(PRIORITY_LABEL_KEY[key])}
                  </span>
                  <span
                    className="text-[12.5px] font-semibold flex-shrink-0"
                    style={{ color: isConcern ? 'var(--v-poor)' : isNote ? 'var(--label-2)' : 'var(--v-good)' }}
                  >
                    {icon} {t(statusKey)}
                  </span>
                </div>
              );
            })}
          </div>
          {clearPriorities.length === priorities.length && (
            <p className="px-5 pt-2 text-[12px] leading-relaxed" style={{ color: 'var(--label-3)' }}>
              {t('personalExplainerNote', { name: profile.nickname })}
            </p>
          )}
        </>
      )}

      <div className="px-5 pt-6">
        <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--label-3)' }}>
          {t('personalExplainerNote', { name: profile.nickname })}
        </p>
        {!result.realNutrients && (
          <p className="text-[11.5px] leading-relaxed mt-1.5" style={{ color: 'var(--label-3)' }}>
            {t('personalNoNutritionData')}
          </p>
        )}
      </div>

      <div className="px-4 pt-5">
        <Link
          to="/family"
          className="tap-scale block w-full py-3.5 rounded-[14px] text-[16px] font-semibold text-center"
          style={{ background: 'var(--fill)', color: 'var(--tint)' }}
        >
          {t('personalEditPriorities', { name: profile.nickname })}
        </Link>
      </div>
    </div>
  );
}
