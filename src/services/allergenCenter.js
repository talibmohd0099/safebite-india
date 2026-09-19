// src/services/allergenCenter.js
//
// Pure logic -- no AI, no network. The Allergen Center: a HARD SAFETY
// constraint, deliberately separate from Personal FoodGuard's nutrition
// PRIORITIES (personalAssessment.js), which are preferences that only
// apply when a profile is actively selected. Allergies are checked
// against every product for EVERY family member who has one set,
// regardless of who's currently "active" -- a warning must not depend
// on remembering to switch profiles first.

// The 7 fixed categories requested, plus free-text "custom" entries per
// profile for anything else a family member needs to watch for.
export const ALLERGEN_CATEGORIES = ['milk', 'peanut', 'treeNuts', 'soy', 'wheat', 'egg', 'sesame'];

// Plain English, used by getAllergenWarnings' `label` field as a
// fallback for anything the UI doesn't translate itself (e.g. share
// text). The UI's own translated label should come from
// ALLERGEN_CATEGORY_LABEL_KEY + t() instead wherever i18n is available
// (Family.jsx, Result.jsx) -- same split PRIORITY_LABEL_KEY already
// uses for nutrition priorities.
export const ALLERGEN_CATEGORY_LABEL = {
  milk: 'Milk',
  peanut: 'Peanut',
  treeNuts: 'Tree nuts',
  soy: 'Soy',
  wheat: 'Wheat',
  egg: 'Egg',
  sesame: 'Sesame',
};

export const ALLERGEN_CATEGORY_LABEL_KEY = {
  milk: 'allergenMilk',
  peanut: 'allergenPeanut',
  treeNuts: 'allergenTreeNuts',
  soy: 'allergenSoy',
  wheat: 'allergenWheat',
  egg: 'allergenEgg',
  sesame: 'allergenSesame',
};

// Maps each fixed category to every raw word this could show up as --
// either in ingredientParser.js's own ALLERGEN_WORDS-backed declared-
// allergen extraction (report.allergens) or as a plain ingredient name.
// Deliberately erring toward OVER-matching, since this is a safety
// feature: wheat/gluten/barley/oats/rye are grouped under "wheat" the
// same way ingredientParser.js's own comment already groups them
// ("other gluten-bearing cereals which 'may contain' warnings list
// alongside wheat just as often as wheat itself").
// Real find while testing against a live product (Maggi Masala
// Noodles): its ingredient list has "Hydrolysed Groundnut Protein" --
// "groundnut" is the common Indian-English name for peanut, and the
// bare 'peanut'/'peanuts' list would have silently missed this exact
// real allergen. Also covers common dairy/wheat/sesame terms an Indian
// label uses INSTEAD of the plain English word (paneer/curd/ghee for
// milk, maida/suji for wheat, til/gingelly for sesame) -- each checked
// as its own whole word, since the \b...\b match below doesn't catch a
// word buried inside a longer compound (see the "soybean" entries: the
// bare "soy" wouldn't word-boundary-match inside "Soybean").
const CATEGORY_WORDS = {
  milk: ['milk', 'casein', 'caseinate', 'whey', 'lactose', 'ghee', 'paneer', 'khoya', 'curd', 'yogurt', 'yoghurt', 'buttermilk'],
  peanut: ['peanut', 'peanuts', 'groundnut', 'groundnuts'],
  treeNuts: ['nut', 'nuts', 'tree nuts', 'cashew', 'cashews', 'almond', 'almonds', 'walnut', 'walnuts', 'pistachio', 'pistachios', 'hazelnut', 'hazelnuts'],
  soy: ['soya', 'soy', 'soybean', 'soybeans', 'soyabean', 'soyabeans'],
  wheat: ['wheat', 'gluten', 'barley', 'oats', 'rye', 'maida', 'atta', 'suji', 'sooji', 'semolina'],
  egg: ['egg', 'eggs', 'albumin'],
  sesame: ['sesame', 'til', 'gingelly'],
};

// 'contains' outranks 'may_contain' -- a confirmed ingredient/declared
// "Contains X" is a stronger signal than a cross-contamination warning,
// and when a family has more than one profile with the same allergen
// selected, the combined warning should show whichever is more certain.
const SEVERITY_RANK = { contains: 2, may_contain: 1 };

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function nameMatchesAnyWord(name, words) {
  const lower = (name || '').toLowerCase();
  return words.some((w) => new RegExp(`\\b${escapeRegex(w)}\\b`, 'i').test(lower));
}

/**
 * Which of the given fixed categories a report actually triggers, and
 * at what severity. 'contains' when the substance is either named
 * directly in the (already-parsed) ingredient list OR explicitly
 * declared ("Contains X") -- checked both ways because a manufacturer's
 * own "Contains" line isn't always present even when the allergen
 * ingredient plainly is in the list. 'may_contain' only when the ONLY
 * signal is a cross-contamination warning ("May [also] contain X"),
 * with no direct ingredient match.
 */
export function detectAllergens(report, categories) {
  const declared = report?.allergens || []; // [{ word, severity }]
  const ingredients = report?.ingredients || [];
  const results = [];

  for (const category of categories || []) {
    const words = CATEGORY_WORDS[category];
    if (!words) continue;

    const declaredMatch = declared.find((a) => words.includes(a.word));
    const ingredientMatch = ingredients.some((i) => nameMatchesAnyWord(i.name, words));

    if (ingredientMatch || declaredMatch?.severity === 'contains') {
      results.push({ category, severity: 'contains' });
    } else if (declaredMatch?.severity === 'may_contain') {
      results.push({ category, severity: 'may_contain' });
    }
  }

  return results;
}

/**
 * Custom allergens -- free text a family member typed themselves, not
 * one of the 7 fixed categories. Matched as a whole-word search against
 * declared allergen words and real ingredient names, since there's no
 * known synonym list to check for something never seen before.
 */
export function detectCustomAllergens(report, customTerms) {
  const ingredients = report?.ingredients || [];
  const declared = report?.allergens || [];
  const results = [];

  for (const term of customTerms || []) {
    const clean = (term || '').trim();
    if (!clean) continue;
    const re = new RegExp(`\\b${escapeRegex(clean.toLowerCase())}`, 'i');

    const ingredientMatch = ingredients.some((i) => re.test((i.name || '').toLowerCase()));
    const declaredMatch = declared.find((a) => re.test(a.word));

    if (ingredientMatch || declaredMatch?.severity === 'contains') {
      results.push({ category: clean, severity: 'contains', custom: true });
    } else if (declaredMatch?.severity === 'may_contain') {
      results.push({ category: clean, severity: 'may_contain', custom: true });
    }
  }

  return results;
}

/**
 * Every allergen warning across a WHOLE family, each tagged with which
 * real profile(s) it applies to -- checked for every profile that has
 * an allergy set, not just whichever one is "active" (see this file's
 * own top comment). Returns
 *   [{ category, label, severity, custom, profiles: [profile, ...] }]
 * sorted worst-severity first (contains before may_contain).
 */
export function getAllergenWarnings(report, profiles) {
  const byKey = new Map();

  for (const profile of profiles || []) {
    const fixed = detectAllergens(report, profile.allergies || []);
    const custom = detectCustomAllergens(report, profile.customAllergies || []);

    for (const hit of [...fixed, ...custom]) {
      const key = hit.custom ? `custom:${hit.category.toLowerCase()}` : hit.category;
      const existing = byKey.get(key);
      if (existing) {
        existing.profiles.push(profile);
        if (SEVERITY_RANK[hit.severity] > SEVERITY_RANK[existing.severity]) existing.severity = hit.severity;
      } else {
        byKey.set(key, {
          category: hit.category,
          label: hit.custom ? hit.category : ALLERGEN_CATEGORY_LABEL[hit.category],
          severity: hit.severity,
          custom: !!hit.custom,
          profiles: [profile],
        });
      }
    }
  }

  return [...byKey.values()].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
}
