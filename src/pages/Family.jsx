// src/pages/Family.jsx
//
// Family profiles for the Personal FoodGuard feature. A profile only
// stores a nickname, a relation (for its emoji avatar), and a set of
// selected nutrition priorities -- no real name, no medical info, no
// date of birth (see the privacy notes in personalAssessment.js and
// the plan this was built from). Everything here is local-only
// (FamilyContext persists to localStorage, nothing is sent anywhere).
import { useState } from 'react';
import { useFamily, RELATION_EMOJI } from '../contexts/FamilyContext';
import { useLanguage } from '../contexts/LanguageContext';

const RELATIONS = ['me', 'partner', 'child', 'parent', 'other'];
const RELATION_LABEL_KEY = {
  me: 'familyRelationMe',
  partner: 'familyRelationPartner',
  child: 'familyRelationChild',
  parent: 'familyRelationParent',
  other: 'familyRelationOther',
};

// Must match the PRIORITY_CHECKS keys in services/personalAssessment.js.
const PRIORITIES = [
  'lowerSugar', 'lowerSodium', 'lowerSatFat', 'higherProtein',
  'lessProcessed', 'fewerAdditives', 'lowerCalories', 'moreWholeFood',
];
const PRIORITY_LABEL_KEY = {
  lowerSugar: 'priorityLowerSugar',
  lowerSodium: 'priorityLowerSodium',
  lowerSatFat: 'priorityLowerSatFat',
  higherProtein: 'priorityHigherProtein',
  lessProcessed: 'priorityLessProcessed',
  fewerAdditives: 'priorityFewerAdditives',
  lowerCalories: 'priorityLowerCalories',
  moreWholeFood: 'priorityMoreWholeFood',
};

function ProfileForm({ initial, onSave, onCancel }) {
  const { t } = useLanguage();
  const [nickname, setNickname] = useState(initial?.nickname || '');
  const [relation, setRelation] = useState(initial?.relation || 'me');
  const [priorities, setPriorities] = useState(initial?.priorities || []);

  const togglePriority = (key) =>
    setPriorities((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));

  return (
    <div className="rounded-[16px] p-4 mb-4 item-in" style={{ background: 'var(--bg-card)' }}>
      <p className="text-[13px] font-semibold mb-2" style={{ color: 'var(--label-2)' }}>
        {t('familyWhoIsThisFor')}
      </p>
      <div className="flex flex-wrap gap-2 mb-4">
        {RELATIONS.map((r) => (
          <button
            key={r}
            onClick={() => setRelation(r)}
            className="tap-scale px-3 py-2 rounded-full text-[13px] font-semibold flex items-center gap-1.5"
            style={{
              background: relation === r ? 'var(--tint)' : 'var(--fill)',
              color: relation === r ? '#fff' : 'var(--label-1)',
            }}
          >
            <span>{RELATION_EMOJI[r]}</span> {t(RELATION_LABEL_KEY[r])}
          </button>
        ))}
      </div>

      <label className="block text-[13px] font-semibold mb-1.5" style={{ color: 'var(--label-2)' }}>
        {t('familyNicknameLabel')}
      </label>
      <input
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        placeholder={t('familyNicknamePlaceholder')}
        className="w-full px-3.5 py-2.5 rounded-[12px] text-[15px] mb-4 outline-none"
        style={{ background: 'var(--fill)', color: 'var(--label-1)' }}
      />

      <p className="text-[15px] font-bold mb-1" style={{ color: 'var(--label-1)' }}>
        {t('familyPrioritiesTitle')}
      </p>
      <p className="text-[12px] mb-3" style={{ color: 'var(--label-3)' }}>
        {t('familyPrioritiesHint')}
      </p>
      <div className="flex flex-wrap gap-2 mb-4">
        {PRIORITIES.map((p) => {
          const active = priorities.includes(p);
          return (
            <button
              key={p}
              onClick={() => togglePriority(p)}
              className="tap-scale px-3 py-2 rounded-full text-[13px] font-semibold"
              style={{
                background: active ? 'var(--tint-bg)' : 'var(--fill)',
                color: active ? 'var(--tint)' : 'var(--label-1)',
              }}
            >
              {active ? '✓ ' : ''}{t(PRIORITY_LABEL_KEY[p])}
            </button>
          );
        })}
      </div>

      <p className="text-[11.5px] leading-relaxed mb-4" style={{ color: 'var(--label-3)' }}>
        {t('familyExplainer')}
      </p>

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="tap-scale flex-1 py-3 rounded-[12px] text-[15px] font-semibold"
          style={{ background: 'var(--fill)', color: 'var(--label-1)' }}
        >
          {t('familyCancel')}
        </button>
        <button
          onClick={() => nickname.trim() && onSave({ nickname: nickname.trim(), relation, priorities })}
          disabled={!nickname.trim()}
          className="tap-scale flex-1 py-3 rounded-[12px] text-[15px] font-semibold text-white"
          style={{ background: 'var(--tint)', opacity: nickname.trim() ? 1 : 0.5 }}
        >
          {t('familySave')}
        </button>
      </div>
    </div>
  );
}

export default function Family() {
  const { t } = useLanguage();
  const { profiles, addProfile, updateProfile, deleteProfile, setDefaultProfile } = useFamily();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const handleDelete = (id) => {
    if (window.confirm(t('familyDeleteConfirm'))) deleteProfile(id);
  };

  return (
    <div className="page-in max-w-2xl mx-auto px-4 py-6 pb-24">
      <p className="text-[24px] font-bold tracking-tight mb-4" style={{ color: 'var(--label-1)' }}>
        {t('familyTitle')}
      </p>

      {profiles.length === 0 && !creating && (
        <div className="rounded-[16px] p-6 text-center item-in" style={{ background: 'var(--bg-card)' }}>
          <p className="text-[40px] mb-2">👨‍👩‍👧</p>
          <p className="text-[17px] font-bold mb-1.5" style={{ color: 'var(--label-1)' }}>
            {t('familyEmptyTitle')}
          </p>
          <p className="text-[13.5px] leading-relaxed mb-4" style={{ color: 'var(--label-2)' }}>
            {t('familyEmptyBody')}
          </p>
          <button
            onClick={() => setCreating(true)}
            className="tap-scale px-5 py-3 rounded-[12px] text-[15px] font-semibold text-white"
            style={{ background: 'var(--tint)' }}
          >
            {t('familyCreateProfile')}
          </button>
        </div>
      )}

      {profiles.map((p) =>
        editingId === p.id ? (
          <ProfileForm
            key={p.id}
            initial={p}
            onCancel={() => setEditingId(null)}
            onSave={(data) => { updateProfile(p.id, data); setEditingId(null); }}
          />
        ) : (
          <div key={p.id} className="rounded-[16px] p-4 mb-3 item-in" style={{ background: 'var(--bg-card)' }}>
            <div className="flex items-center gap-3">
              <span
                className="w-11 h-11 rounded-full flex items-center justify-center text-[20px] flex-shrink-0"
                style={{ background: 'var(--fill)' }}
              >
                {p.avatarEmoji}
              </span>
              <div className="flex-1 min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className="text-[15px] font-bold" style={{ color: 'var(--label-1)' }}>{p.nickname}</span>
                  {p.isDefault && (
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: 'var(--tint-bg)', color: 'var(--tint)' }}
                    >
                      {t('familyDefaultBadge')}
                    </span>
                  )}
                </span>
                <span className="block text-[12px] truncate mt-0.5" style={{ color: 'var(--label-3)' }}>
                  {p.priorities.length > 0
                    ? p.priorities.map((k) => t(PRIORITY_LABEL_KEY[k])).join(' · ')
                    : t('familyNoPrioritiesTitle')}
                </span>
              </div>
            </div>
            <div className="flex gap-4 mt-3 pt-3" style={{ borderTop: '1px solid var(--separator)' }}>
              <button onClick={() => setEditingId(p.id)} className="tap-scale text-[13px] font-semibold" style={{ color: 'var(--tint)' }}>
                {t('familyEdit')}
              </button>
              {!p.isDefault && (
                <button onClick={() => setDefaultProfile(p.id)} className="tap-scale text-[13px] font-semibold" style={{ color: 'var(--label-2)' }}>
                  {t('familySetDefault')}
                </button>
              )}
              <button onClick={() => handleDelete(p.id)} className="tap-scale text-[13px] font-semibold ml-auto" style={{ color: 'var(--v-poor)' }}>
                {t('familyDelete')}
              </button>
            </div>
          </div>
        ),
      )}

      {creating && (
        <ProfileForm onCancel={() => setCreating(false)} onSave={(data) => { addProfile(data); setCreating(false); }} />
      )}

      {!creating && profiles.length > 0 && (
        <button
          onClick={() => setCreating(true)}
          className="tap-scale w-full py-3 rounded-[12px] text-[15px] font-semibold mt-1"
          style={{ background: 'var(--fill)', color: 'var(--tint)' }}
        >
          {t('familyAddPerson')}
        </button>
      )}
    </div>
  );
}
