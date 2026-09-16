// src/contexts/LanguageContext.jsx
//
// Unlike useTheme.js (a CSS class toggle that plain CSS reacts to on its
// own), switching language has to re-render actual text across many
// components at once -- so this needs real shared state (Context), not
// each component reading its own independent localStorage-backed hook.
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { STRINGS, interpolate } from '../i18n/strings';

const STORAGE_KEY = 'safebite-language';
const LanguageContext = createContext(null);

// Hindi is switched off app-wide for now: the app is still growing new
// screens every week, and translating each one as it lands means every
// new feature carries a second, half-checked language with it. One full
// Hindi pass happens once the feature set settles. Flip this to true to
// bring the language toggle back -- nothing else needs changing, and
// everyone's stored language preference is left untouched below, so it
// comes back exactly as they left it.
export const HINDI_ENABLED = false;

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    if (!HINDI_ENABLED) return 'en';
    try {
      return localStorage.getItem(STORAGE_KEY) || 'en';
    } catch {
      return 'en';
    }
  });

  useEffect(() => {
    // While Hindi is off, don't overwrite a stored 'hi' preference with
    // the forced 'en' -- that would quietly erase the choice someone
    // already made and can't currently see.
    if (!HINDI_ENABLED) return;
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // Private browsing / storage disabled -- language just won't persist.
    }
  }, [language]);

  const setLanguage = useCallback((next) => setLanguageState(next), []);

  // Falls back to the English string, then the raw key, so a missing
  // translation renders *something* instead of a blank line.
  const t = useCallback(
    (key, vars) => {
      const template = STRINGS[language]?.[key] ?? STRINGS.en[key] ?? key;
      return vars ? interpolate(template, vars) : template;
    },
    [language]
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}
