// src/services/nutrientProjection.js
//
// "What this adds up to" for sugar, salt and fat together -- each shown
// in a household measure of the SAME substance, so nothing is a vague
// equivalence: sugar as teaspoons of sugar, sodium as teaspoons of salt
// (WHO's own 2.5x conversion), fat as teaspoons of oil (oil IS fat).
// Pure arithmetic on the label's own figures -- never a claim about what
// happens to anyone's body (see sugarProjection.js for why).
//
// Built for products that have MORE THAN ONE thing worth watching (a
// packet of instant noodles is both salty and fatty; a cream biscuit is
// both sugary and fatty): every nutrient that clears its own "worth
// showing" bar comes back, ranked so the UI can open on the most
// concerning one while still showing the rest at a glance. Ranking is by
// share of WHO's 2,000 kcal reference amount -- used ONLY to order the
// tabs, never displayed as a personal "% of your limit" for sugar/fat,
// whose real WHO limits are a share of energy, not flat numbers.
import { getNutrientsPer100 } from './nutrientBasis.js';
import { resolveServing } from './servingResolver.js';
import { isSmallPortionFood } from './dailyHabitCheck.js';
import { buildSugarProjection, isNotEatenAsPacked, GRAMS_PER_TEASPOON } from './sugarProjection.js';

// WHO: sodium x 2.5 = salt; <5g salt (2,000mg sodium) a day for adults
// -- a FLAT limit, so a per-serving "% of the day's limit" is a fair
// thing to say for salt specifically. 5g of salt is about one teaspoon.
export const SALT_PER_SODIUM = 2.5;
export const WHO_DAILY_SALT_G = 5;
export const GRAMS_SALT_PER_TEASPOON = 5;

// A teaspoon of cooking oil is ~4.5g, all of it fat; a litre ~910g.
export const GRAMS_FAT_PER_TEASPOON_OIL = 4.5;
export const GRAMS_FAT_PER_LITRE_OIL = 910;

// Ranking only (2,000 kcal reference amounts): free sugars ~50g, salt
// 5g, total fat ~70g (30% of energy).
const RANKING_REFERENCE = { sugar: 50, salt: 5, fat: 70 };

// "Worth a card" bars, all ~one teaspoon's worth or a tenth of the
// day's reference, same spirit as the sugar card's own 1 tsp minimum.
const MIN_SALT_G_PER_SERVING = 0.5;
const MIN_FAT_G_PER_SERVING = GRAMS_FAT_PER_TEASPOON_OIL;

// Past these per 100g it's a data error, not a food -- checked against
// the live catalog: a kulfi at 4,750mg sodium/100g and a tonic water at
// ~2,100mg/100ml both read as more than a whole day's salt in one
// serving. Real salty foods sit well under: instant noodles ~1,200-2,000,
// namkeen ~600-1,500. Salt/masala/soup powders are excluded by name.
const MAX_PLAUSIBLE_SODIUM_MG_PER_100 = 3000;
const MAX_PLAUSIBLE_BEVERAGE_SODIUM_MG_PER_100 = 400;
// 70, not 100: butter/ghee/oil (80-100) are excluded by name, and the
// fattiest real foods left -- sev/bhujia, chocolate, cheese -- sit at
// 30-50. Live: a "Castella Teacake" at 80g fat/100g, a data error.
const MAX_PLAUSIBLE_FAT_G_PER_100 = 70;
const MAX_PLAUSIBLE_DRINK_FAT_G_PER_100 = 10;

// Nuts/seeds: high fat, mostly the unsaturated kind WHO doesn't limit --
// "a year of almonds = 4 litres of oil" would mislead.
const FAT_EXCLUDED_FOOD_TYPES = new Set(['nuts-seeds']);

const round1 = (n) => Math.round(n * 10) / 10;

function buildSalt(report, per100, serving) {
  // Salt, masala, pickles, papad... are used a pinch at a time. Checked by
  // NAME (null serving forces the name rule), since any serving size a
  // salt pack states is still a statement about the pack, not a meal.
  if (isSmallPortionFood(report.productName, null)) return null;
  const sodiumMg = per100.sodiumMg;
  if (typeof sodiumMg !== 'number' || !Number.isFinite(sodiumMg) || sodiumMg <= 0) return null;
  if (sodiumMg > (report.foodType === 'beverage' ? MAX_PLAUSIBLE_BEVERAGE_SODIUM_MG_PER_100 : MAX_PLAUSIBLE_SODIUM_MG_PER_100)) return null;

  const saltG = round1(((sodiumMg * SALT_PER_SODIUM) / 1000) * (serving.grams / 100));
  if (saltG < MIN_SALT_G_PER_SERVING) return null;
  return {
    key: 'salt',
    gramsPerServing: saltG,
    teaspoonsPerServing: round1(saltG / GRAMS_SALT_PER_TEASPOON),
    percentOfDailyLimit: Math.round((saltG / WHO_DAILY_SALT_G) * 100),
    concern: saltG / RANKING_REFERENCE.salt,
  };
}

function buildFat(report, per100, serving) {
  if (FAT_EXCLUDED_FOOD_TYPES.has(report.foodType)) return null;
  // Butter/ghee/oil by NAME too -- the AI can tag a butter "dairy" rather
  // than oil-fat (live: a white butter read as 32 tsp of oil a serving).
  if (isSmallPortionFood(report.productName, null)) return null;
  const fatPer100 = per100.totalFatG;
  if (typeof fatPer100 !== 'number' || !Number.isFinite(fatPer100) || fatPer100 <= 0) return null;
  if (fatPer100 > MAX_PLAUSIBLE_FAT_G_PER_100) return null;
  // A drink over 10g fat/100ml isn't a ready drink (whole milk ~3.5, a
  // cream cold coffee ~5) -- live: a toddler "milk drink" that's really a
  // powder, at 19g/100ml.
  if (serving.unit === 'ml' && fatPer100 > MAX_PLAUSIBLE_DRINK_FAT_G_PER_100) return null;

  const fatG = round1((fatPer100 * serving.grams) / 100);
  if (fatG < MIN_FAT_G_PER_SERVING) return null;
  const sat = per100.saturatedFatG;
  return {
    key: 'fat',
    gramsPerServing: fatG,
    teaspoonsPerServing: round1(fatG / GRAMS_FAT_PER_TEASPOON_OIL),
    saturatedGramsPerServing: typeof sat === 'number' && sat >= 0 && sat <= fatPer100 ? round1((sat * serving.grams) / 100) : null,
    concern: fatG / RANKING_REFERENCE.fat,
  };
}

/**
 * @returns {null | {
 *   serving: { grams: number, unit: string, source: 'label'|'pack'|'standard' },
 *   items: Array<{ key: 'sugar'|'salt'|'fat', gramsPerServing: number,
 *     teaspoonsPerServing: number, concern: number, ...perNutrient }>,
 * }} items sorted most-concerning first; null when nothing clears its bar.
 */
export function buildNutrientProjections(report) {
  if (!report || isNotEatenAsPacked(report)) return null;
  const per100 = getNutrientsPer100(report);
  if (!per100) return null;
  const serving = resolveServing(report);
  if (!serving) return null;

  const items = [];
  const sugar = buildSugarProjection(report);
  // Same resolver, same report -> same serving; guarded anyway so the tabs
  // can never silently describe two different serving sizes.
  if (sugar && sugar.servingGrams === serving.grams) {
    items.push({
      key: 'sugar',
      gramsPerServing: sugar.gramsPerServing,
      teaspoonsPerServing: sugar.teaspoonsPerServing,
      isAddedSugar: sugar.isAddedSugar,
      concern: sugar.gramsPerServing / RANKING_REFERENCE.sugar,
    });
  }
  const salt = buildSalt(report, per100, serving);
  if (salt) items.push(salt);
  const fat = buildFat(report, per100, serving);
  if (fat) items.push(fat);

  if (items.length === 0) return null;
  items.sort((a, b) => b.concern - a.concern);
  return { serving, items };
}

// Per nutrient: grams in one household spoon, and in one household
// "pack" used for the yearly picture (1 kg sugar / 1 kg salt / 1 L oil).
export const MEASURES = {
  sugar: { gramsPerSpoon: GRAMS_PER_TEASPOON, gramsPerPack: 1000 },
  salt: { gramsPerSpoon: GRAMS_SALT_PER_TEASPOON, gramsPerPack: 1000 },
  fat: { gramsPerSpoon: GRAMS_FAT_PER_TEASPOON_OIL, gramsPerPack: GRAMS_FAT_PER_LITRE_OIL },
};

/**
 * Week / 30-day month / 52-week year totals at a frequency -- plain
 * multiplication, in grams, spoons and household packs.
 */
export function accumulate(key, gramsPerServing, timesPerWeek) {
  const { gramsPerSpoon, gramsPerPack } = MEASURES[key];
  const perWeek = gramsPerServing * timesPerWeek;
  const totals = { week: perWeek, month: (perWeek / 7) * 30, year: perWeek * 52 };
  const out = {};
  for (const [period, grams] of Object.entries(totals)) {
    out[period] = {
      grams: Math.round(grams),
      spoons: Math.round(grams / gramsPerSpoon),
      packs: round1(grams / gramsPerPack),
    };
  }
  return out;
}
