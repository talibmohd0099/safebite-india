// src/components/NotificationSettings.jsx
//
// About > Notifications (Android app only): opt in to a daily "Did you
// know?" tip and to "New on FoodGuard" product alerts, each at a time the
// person picks. Turning one on is what triggers Android's one-time
// permission popup; if it was refused before, the card says where to
// switch it back on instead of silently doing nothing.
import { useEffect, useState } from 'react';
import { getRecentlyAddedProducts } from '../services/productCache';
import {
  isNativeApp,
  loadPrefs,
  savePrefs,
  permissionState,
  requestPermission,
  syncNotifications,
} from '../services/notifications';

function Row({ title, description, on, time, onToggle, onTime }) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
        </div>
        <button
          role="switch"
          aria-checked={on}
          aria-label={title}
          onClick={onToggle}
          className={`tap-scale relative flex-shrink-0 w-11 h-6 rounded-full transition-colors ${on ? 'bg-green-600' : 'bg-slate-300 dark:bg-slate-600'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
        </button>
      </div>
      {on && (
        <label className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          Send at
          <input
            type="time"
            value={time}
            onChange={(e) => onTime(e.target.value)}
            className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm"
          />
        </label>
      )}
    </div>
  );
}

export default function NotificationSettings() {
  const [prefs, setPrefs] = useState(loadPrefs);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    permissionState().then((s) => setBlocked(s === 'denied'));
  }, []);

  if (!isNativeApp()) return null;

  const apply = (next) => {
    setPrefs(next);
    savePrefs(next);
    syncNotifications(getRecentlyAddedProducts);
  };

  const toggle = async (key) => {
    const turningOn = !prefs[key].on;
    if (turningOn) {
      let state = await permissionState();
      if (state !== 'granted') state = await requestPermission();
      if (state !== 'granted') {
        setBlocked(true);
        return;
      }
      setBlocked(false);
    }
    apply({ ...prefs, [key]: { ...prefs[key], on: turningOn } });
  };

  const setTime = (key, time) => {
    if (!time) return;
    apply({ ...prefs, [key]: { ...prefs[key], time } });
  };

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 mb-4" id="notifications">
      <h2 className="font-bold text-slate-800 dark:text-slate-100 mb-3">🔔 Notifications</h2>
      <div className="divide-y divide-slate-100 dark:divide-slate-700">
        <Row
          title="Daily “Did you know?”"
          description="One short, factual food tip a day."
          on={prefs.tips.on}
          time={prefs.tips.time}
          onToggle={() => toggle('tips')}
          onTime={(t) => setTime('tips', t)}
        />
        <Row
          title="New products"
          description="A recently added product and its score."
          on={prefs.products.on}
          time={prefs.products.time}
          onToggle={() => toggle('products')}
          onTime={(t) => setTime('products', t)}
        />
      </div>
      {blocked && (
        <p className="mt-3 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 rounded-lg px-3 py-2">
          Notifications are blocked for this app. Turn them on in your phone’s Settings › Apps › FoodGuard India › Notifications, then switch this on again.
        </p>
      )}
    </div>
  );
}
