// src/services/notifications.js
//
// Opt-in local notifications for the Android app (no server, no Firebase):
//   * "Did you know?"  -- one curated tip a day, at a time the person picks
//   * "New on FoodGuard" -- a recently added product (name + score)
//
// A local notification can't fetch anything while the app is closed, so
// the next few days are scheduled ahead of time -- whenever the app opens
// or comes back to the foreground -- with the real content known at that
// moment (today's tip rotation, the newest products in the catalog). Each
// refresh cancels and re-schedules, so content stays current for anyone
// who opens the app at least once a week.
//
// Off by default. Nothing is scheduled, and no permission is asked, until
// the person turns a toggle on in About > Notifications.
import { Capacitor } from '@capacitor/core';
import { LocalNotifications as LocalNotificationsPlugin } from '@capacitor/local-notifications';
import { getTodaysTip } from '../data/didYouKnowTips.js';

const PREFS_KEY = 'foodguard-notification-prefs';
const CHANNEL_ID = 'foodguard-updates';
const DAYS_AHEAD = 7;
const TIP_ID_BASE = 1000;
const PRODUCT_ID_BASE = 2000;

export const DEFAULT_PREFS = {
  tips: { on: false, time: '09:00' },
  products: { on: false, time: '18:00' },
};

export const isNativeApp = () => {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
};

export function loadPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
    return {
      tips: { ...DEFAULT_PREFS.tips, ...(saved?.tips || {}) },
      products: { ...DEFAULT_PREFS.products, ...(saved?.products || {}) },
    };
  } catch {
    return structuredClone(DEFAULT_PREFS);
  }
}

export function savePrefs(prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* private mode etc. */ }
}

const dayOfYear = (date) => Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);

/** "09:30" -> [9, 30]; falls back to the given default on anything malformed. */
export function parseTime(value, fallback = '09:00') {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
  const [h, min] = m ? [Number(m[1]), Number(m[2])] : parseTime(fallback, '09:00');
  return h >= 0 && h < 24 && min >= 0 && min < 60 ? [h, min] : [9, 0];
}

const clip = (text, n) => (text.length <= n ? text : `${text.slice(0, n - 1).trimEnd()}…`);

/**
 * Pure: turn preferences + the newest products into the notifications to
 * schedule. `now` and `products` are injected so it can be tested.
 * @returns {{id:number, title:string, body:string, largeBody?:string, at:Date, route:string}[]}
 */
export function buildSchedule(prefs, now = new Date(), products = []) {
  const out = [];

  const slot = (dayOffset, time) => {
    const [h, m] = parseTime(time);
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, h, m, 0, 0);
    return at > now ? at : null; // today's slot is skipped once it has passed
  };

  if (prefs.tips?.on) {
    for (let i = 0; i < DAYS_AHEAD; i++) {
      const at = slot(i, prefs.tips.time);
      if (!at) continue;
      const tip = getTodaysTip(dayOfYear(at));
      out.push({ id: TIP_ID_BASE + i, title: '💡 Did you know?', body: clip(tip, 110), largeBody: tip, at, route: '/' });
    }
  }

  if (prefs.products?.on) {
    const usable = products.filter((p) => p?.productName);
    for (let i = 0; i < DAYS_AHEAD; i++) {
      const at = slot(i, prefs.products.time);
      if (!at) continue;
      const p = usable.length ? usable[i % usable.length] : null;
      const scoreText = p && typeof p.score === 'number' ? ` — scored ${p.score}/100${p.verdict ? ` (${p.verdict})` : ''}` : '';
      out.push({
        id: PRODUCT_ID_BASE + i,
        title: '🆕 New on FoodGuard',
        body: p ? `${p.productName}${scoreText}` : 'Fresh products were just added — see what they score.',
        at,
        // Opens Home with the product name in the search box.
        route: p ? `/?q=${encodeURIComponent(p.productName)}` : '/',
      });
    }
  }

  return out;
}

// Never `await` or return-from-async a Capacitor plugin object: it's a proxy,
// so the promise machinery's implicit .then() lookup is treated as a call to
// a plugin method ("LocalNotifications.then() is not implemented").
const plugin = () => LocalNotificationsPlugin;

/** 'granted' | 'denied' | 'prompt' | 'unsupported' */
export async function permissionState() {
  if (!isNativeApp()) return 'unsupported';
  try {
    const { display } = await plugin().checkPermissions();
    return display === 'prompt-with-rationale' ? 'prompt' : display;
  } catch {
    return 'unsupported';
  }
}

/** Ask Android for the notification permission (a one-time system popup). */
export async function requestPermission() {
  if (!isNativeApp()) return 'unsupported';
  try {
    const { display } = await plugin().requestPermissions();
    return display === 'prompt-with-rationale' ? 'prompt' : display;
  } catch {
    return 'unsupported';
  }
}

async function cancelOurs(LocalNotifications) {
  const notifications = [];
  for (let i = 0; i < DAYS_AHEAD; i++) {
    notifications.push({ id: TIP_ID_BASE + i }, { id: PRODUCT_ID_BASE + i });
  }
  try { await LocalNotifications.cancel({ notifications }); } catch { /* nothing pending */ }
}

/**
 * Re-schedule everything from the saved preferences. Safe to call often
 * (app start, resume, after a toggle). Does nothing on the web.
 */
export async function syncNotifications(fetchRecentProducts) {
  if (!isNativeApp()) return;
  try {
    const LocalNotifications = plugin();
    await cancelOurs(LocalNotifications);

    const prefs = loadPrefs();
    if (!prefs.tips.on && !prefs.products.on) return;
    if ((await permissionState()) !== 'granted') return;

    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: 'Daily tips & new products',
      description: 'A daily food tip and newly added products',
      importance: 3,
    }).catch(() => {});

    let products = [];
    if (prefs.products.on && fetchRecentProducts) {
      try { products = await fetchRecentProducts(14); } catch { products = []; }
    }

    const schedule = buildSchedule(prefs, new Date(), products);
    if (schedule.length === 0) return;

    await LocalNotifications.schedule({
      notifications: schedule.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        largeBody: n.largeBody,
        channelId: CHANNEL_ID,
        schedule: { at: n.at, allowWhileIdle: true },
        extra: { route: n.route },
      })),
    });
  } catch {
    // Notifications are a nicety -- never let them break the app.
  }
}

/** Open the right screen when a notification is tapped. */
export async function listenForTaps(navigate) {
  if (!isNativeApp()) return () => {};
  try {
    const LocalNotifications = plugin();
    const handle = await LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
      const route = event?.notification?.extra?.route;
      if (typeof route === 'string' && route.startsWith('/')) navigate(route);
    });
    return () => handle.remove();
  } catch {
    return () => {};
  }
}
