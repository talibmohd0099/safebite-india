// src/components/NotificationSettings.jsx
//
// About > Notifications (Android app only): opt in to a daily "Did you
// know?" tip and to "New on FoodGuard" product alerts. Just two switches --
// no time-of-day picker (see TIPS_TIME/PRODUCTS_TIME in notifications.js).
// Turning one on triggers Android's one-time permission popup, then fires
// that kind's real notification within a few seconds so there's immediate,
// visible proof it worked; if permission was refused before, the card says
// where to switch it back on instead of silently doing nothing.
import { useEffect, useState } from 'react';
import { getRecentlyAddedProducts } from '../services/productCache';
import {
  isNativeApp,
  loadPrefs,
  savePrefs,
  permissionState,
  requestPermission,
  syncNotifications,
  notifyNow,
} from '../services/notifications';

function Row({ title, description, on, busy, onToggle }) {
  return (
    <div className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
      </div>
      <button
        role="switch"
        aria-checked={on}
        aria-label={title}
        disabled={busy}
        onClick={onToggle}
        className={`tap-scale relative flex-shrink-0 w-11 h-6 rounded-full transition-colors ${on ? 'bg-green-600' : 'bg-slate-300 dark:bg-slate-600'} ${busy ? 'opacity-60' : ''}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  );
}

export default function NotificationSettings() {
  const [prefs, setPrefs] = useState(loadPrefs);
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(null); // which key is mid-toggle
  const [justSent, setJustSent] = useState(null); // which key just fired a confirmation ping

  useEffect(() => {
    permissionState().then((s) => setBlocked(s === 'denied'));
  }, []);

  if (!isNativeApp()) return null;

  const toggle = async (key) => {
    const turningOn = !prefs[key].on;
    setBusy(key);
    try {
      if (turningOn) {
        let state = await permissionState();
        if (state !== 'granted') state = await requestPermission();
        if (state !== 'granted') {
          setBlocked(true);
          return;
        }
        setBlocked(false);
      }

      const next = { ...prefs, [key]: { on: turningOn } };
      setPrefs(next);
      savePrefs(next);
      await syncNotifications(getRecentlyAddedProducts);

      if (turningOn) {
        await notifyNow(key, getRecentlyAddedProducts);
        setJustSent(key);
        setTimeout(() => setJustSent((k) => (k === key ? null : k)), 6000);
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 mb-4" id="notifications">
      <h2 className="font-bold text-slate-800 dark:text-slate-100 mb-3">🔔 Notifications</h2>
      <div className="divide-y divide-slate-100 dark:divide-slate-700">
        <Row
          title="Daily “Did you know?”"
          description="One short, factual food tip a day."
          on={prefs.tips.on}
          busy={busy === 'tips'}
          onToggle={() => toggle('tips')}
        />
        <Row
          title="New products"
          description="An alert when a product is newly added, with its score."
          on={prefs.products.on}
          busy={busy === 'products'}
          onToggle={() => toggle('products')}
        />
      </div>
      {justSent && (
        <p className="mt-3 text-xs text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950 rounded-lg px-3 py-2">
          Sent — check your notification shade in a few seconds.
        </p>
      )}
      {blocked && (
        <p className="mt-3 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 rounded-lg px-3 py-2">
          Notifications are blocked for this app. Turn them on in your phone’s Settings › Apps › FoodGuard India › Notifications, then switch this on again.
        </p>
      )}
    </div>
  );
}
