// src/services/weeklyReport.js
//
// "Your week": a report card over the products this person CHECKED in
// the last 7 days (their on-device scan history) -- how many, their
// average score and how that compares with the 7 days before, the mix
// of verdicts, the flagged ingredient that kept turning up, the best and
// worst pick, and a day streak. About what was checked, never a claim
// about what was eaten. Pure, no network.
import { getIngredientSeverity } from '../utils/storage.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const TIER_OF = (score) => (score >= 85 ? 'excellent' : score >= 65 ? 'good' : score >= 45 ? 'moderate' : score >= 25 ? 'poor' : 'veryPoor');

const scored = (e) => typeof e?.overallScore === 'number' && !e.isInfantFormula;
const productKey = (e) => e.lookupKey || (e.productName || '').trim().toLowerCase() || e.id;

// One entry per product -- re-opening the same product shouldn't count twice.
function uniqueProducts(entries) {
  const seen = new Map();
  for (const e of entries) if (!seen.has(productKey(e))) seen.set(productKey(e), e);
  return [...seen.values()];
}

function inWindow(history, now, fromDaysAgo, toDaysAgo) {
  const start = now - fromDaysAgo * DAY_MS;
  const end = now - toDaysAgo * DAY_MS;
  return history.filter((e) => {
    const t = Date.parse(e.savedAt);
    return Number.isFinite(t) && t > start && t <= end;
  });
}

const avg = (list) => (list.length ? Math.round(list.reduce((s, e) => s + e.overallScore, 0) / list.length) : null);

/** Consecutive days, ending today (or yesterday, so it isn't lost before today's first scan), with at least one check. */
export function scanStreak(history, now = Date.now()) {
  const days = new Set(history.map((e) => new Date(e.savedAt).toDateString()));
  const d = new Date(now);
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
  let streak = 0;
  while (days.has(d.toDateString())) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}

/**
 * @returns {null | {
 *   count: number, averageScore: number, previousAverage: number|null,
 *   tiers: Record<'excellent'|'good'|'moderate'|'poor'|'veryPoor', number>,
 *   topFlag: null | { name: string, count: number },
 *   best: object, worst: object|null, streak: number,
 * }} null when nothing was checked in the last 7 days.
 */
export function buildWeeklyReport(history, now = Date.now()) {
  const list = Array.isArray(history) ? history : [];
  const week = uniqueProducts(inWindow(list, now, 7, 0).filter(scored));
  if (week.length === 0) return null;
  const previous = uniqueProducts(inWindow(list, now, 14, 7).filter(scored));

  const tiers = { excellent: 0, good: 0, moderate: 0, poor: 0, veryPoor: 0 };
  for (const e of week) tiers[TIER_OF(e.overallScore)]++;

  // The flagged (not "Fine") ingredient found in the most products this week.
  const flagCounts = new Map();
  for (const e of week) {
    const names = new Set((e.ingredients || []).filter((i) => getIngredientSeverity(i).label !== 'Fine').map((i) => i.name));
    for (const n of names) flagCounts.set(n, (flagCounts.get(n) || 0) + 1);
  }
  const [topName, topCount] = [...flagCounts.entries()].sort((a, b) => b[1] - a[1])[0] || [];

  const byScore = [...week].sort((a, b) => b.overallScore - a.overallScore);
  return {
    count: week.length,
    averageScore: avg(week),
    previousAverage: avg(previous),
    tiers,
    // Only worth naming when it turned up in more than one product.
    topFlag: topCount >= 2 ? { name: topName, count: topCount } : null,
    best: byScore[0],
    worst: byScore.length > 1 && byScore.at(-1).overallScore < byScore[0].overallScore ? byScore.at(-1) : null,
    streak: scanStreak(list, now),
  };
}
