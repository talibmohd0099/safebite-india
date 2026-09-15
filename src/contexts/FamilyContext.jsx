// src/contexts/FamilyContext.jsx
//
// Family profiles used by the Personal FoodGuard feature -- a scan is
// analyzed once (buildReport()), and each profile's personal fit is a
// cheap, pure re-derivation on top of that same analysis (see
// services/personalAssessment.js), not a second scan or a second AI call.
//
// Modeled directly on LanguageContext.jsx: real shared state (Context),
// not a bare hook, because switching the active profile has to re-render
// the Result page's personal score card wherever it's mounted.
import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const PROFILES_KEY = 'foodguard-family-profiles';
const ACTIVE_PROFILE_KEY = 'foodguard-active-profile-id';

const RELATION_EMOJI = { me: '👤', partner: '💑', child: '👧', parent: '👨', other: '🧑' };

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

const FamilyContext = createContext(null);

export function FamilyProvider({ children }) {
  const [profiles, setProfiles] = useState(() => loadJson(PROFILES_KEY, []));
  const [activeProfileId, setActiveProfileId] = useState(() => {
    try {
      return localStorage.getItem(ACTIVE_PROFILE_KEY) || null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
    } catch {
      // Private browsing / storage disabled -- profiles just won't persist.
    }
  }, [profiles]);

  useEffect(() => {
    try {
      if (activeProfileId) localStorage.setItem(ACTIVE_PROFILE_KEY, activeProfileId);
      else localStorage.removeItem(ACTIVE_PROFILE_KEY);
    } catch {
      // Same as above.
    }
  }, [activeProfileId]);

  const addProfile = useCallback((data) => {
    const profile = {
      id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(),
      nickname: data.nickname || '',
      relation: data.relation || 'other',
      avatarEmoji: data.avatarEmoji || RELATION_EMOJI[data.relation] || RELATION_EMOJI.other,
      priorities: data.priorities || [],
      isDefault: false,
    };
    setProfiles((prev) => {
      // The very first profile a person creates becomes the default --
      // there's no meaningful "which one is default" choice with only one.
      const next = [...prev, prev.length === 0 ? { ...profile, isDefault: true } : profile];
      return next;
    });
    setActiveProfileId(profile.id);
    return profile.id;
  }, []);

  const updateProfile = useCallback((id, data) => {
    setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, ...data } : p)));
  }, []);

  const deleteProfile = useCallback((id) => {
    setProfiles((prev) => prev.filter((p) => p.id !== id));
    setActiveProfileId((prev) => (prev === id ? null : prev));
  }, []);

  const setDefaultProfile = useCallback((id) => {
    setProfiles((prev) => prev.map((p) => ({ ...p, isDefault: p.id === id })));
  }, []);

  const setActiveProfile = useCallback((id) => setActiveProfileId(id), []);

  return (
    <FamilyContext.Provider
      value={{ profiles, activeProfileId, addProfile, updateProfile, deleteProfile, setDefaultProfile, setActiveProfile }}
    >
      {children}
    </FamilyContext.Provider>
  );
}

export function useFamily() {
  const ctx = useContext(FamilyContext);
  if (!ctx) throw new Error('useFamily must be used within a FamilyProvider');
  return ctx;
}

export { RELATION_EMOJI };
