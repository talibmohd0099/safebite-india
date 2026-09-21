// src/services/foodType.js
//
// What KIND of food a product is -- the missing piece behind reports like
// "Bingo Ribbon Pakoda 89/100": a deep-fried namkeen with a short,
// "clean" ingredient list scored as if it were a plain staple. Gemini
// names the type in the same insights call that already runs per product
// (see INSIGHTS_PROMPT); this deterministic keyword pass is the fallback
// for when that call is missing/failed AND the way the bulk backfill
// classifies thousands of existing rows for free.

export const FOOD_TYPES = [
  'fried-snack', 'sweet-snack', 'baked-snack', 'beverage', 'dairy', 'staple',
  'oil-fat', 'nuts-seeds', 'condiment', 'supplement', 'infant', 'ready-meal', 'other',
];

// Order matters: the first rule that matches wins, and the exclusions
// (baked/roasted) run before the fried keywords so "Roasted Chana Chivda"
// or "Baked Chips" never get the fried label.
const RULES = [
  { type: 'infant', re: /\b(infant|baby food|cerelac|lactogen|nan pro|similac|follow[- ]?up formula)\b/i },
  { type: 'supplement', re: /\b(protein (powder|isolate|blend)|whey|mass gainer|multivitamin|supplement|electrolyte|ors\b|creatine|bcaa|health drink mix)\b/i },
  { type: 'oil-fat', re: /\b(oil|ghee|butter|vanaspati|margarine)\b(?!\s*(cookies?|biscuits?|chips|popcorn))/i, notRe: /\b(butter (cookies?|biscuits?|chips|scotch|milk|naan|popcorn)|peanut butter|cocoa butter|butter ?milk|body butter)\b/i },
  { type: 'nuts-seeds', re: /\b(almonds?|cashews?|pistachios?|walnuts?|raisins|dates|figs|makhana|chia|flax|pumpkin seeds?|sunflower seeds?|mixed nuts|dry fruits?|peanuts?)\b/i, notRe: /\b(chikki|bar|butter|namkeen|masala peanuts?|coated|chocolate|cookies?|biscuits?|laddu)\b/i },
  // Things whose names contain a snack-ish word but that aren't snacks:
  // a "Bingo Buttermilk" is a drink, a "Chocos Cereal" is a cereal, a
  // "Choco Chips" bag is baking chips, a KitKat "wafer" is a chocolate bar.
  { type: 'beverage', re: /\b(buttermilk|sharbat|lassi|drink|juice)\b/i },
  { type: 'staple', re: /\bcereals?\b/i },
  { type: 'condiment', re: /\b(peanut butter|nut butter|almond butter|spread)\b/i },
  { type: 'sweet-snack', re: /\b(choco(late)?s?[- ]?(chips|coated|flavou?red)|choco chips|kitkat|loacker|waffy|wafer (roll|bar|cube|pops)|coated wafer|(vanilla|orange|strawberry|chocolate|choco\w*) wafers?|protein bar|cookies?|biscuits?|aam-?papad|candies|chocolates?)\b/i, notRe: /\b(namkeen|potato|banana|nachos)\b/i },
  // Papad/appalam are usually roasted, not fried in the pack sense.
  { type: 'baked-snack', re: /\b(papad|appalam|khichya)\b/i },
  // Branded plain fried moong dal (a namkeen) vs the raw pulse.
  { type: 'fried-snack', re: /\b(haldiram'?s?|prabhuji|bikaji|bikano)\b.*\bmoong dal\b/i, notRe: /\b(chilka|dhuli|washed|split|organic|unpolished|khichdi)\b/i },
  { type: 'baked-snack', re: /\b(baked|roasted|khakhra|air[- ]popped|popcorn|multigrain crackers|oats bar|muesli bar)\b/i },
  { type: 'fried-snack', re: /\b(namkeen|bhujia|sev|chivda|chiwda|mixture|murukku|chakli|papdi|pakoda|pakora|farsan|kachori|samosa|fryums?|papad|wafers?|chips|crisps|nachos|puffs?|kurkure|lays|bingo|banana chips|tapioca chips|potato sticks|rings|shakarpara|namak para|mathri|diet chivda|aloo bhujia|salted peanuts?|masala peanuts?)\b/i },
  { type: 'sweet-snack', re: /\b(biscuits?|cookies?|cake|cakes|pastry|brownie|muffin|cupcake|wafer (bar|cream|cube)|chocolates?|candy|candies|toffee|mithai|barfi|laddu|halwa|rasgulla|gulab jamun|jalebi|pheni|chikki|cream roll|rusk|donut|croissant|wafer cube)\b/i },
  { type: 'beverage', re: /\b(juice|drink|soda|cola|lassi|buttermilk|sharbat|squash|syrup|thandai|energy drink|coffee|tea|milkshake|shake|kombucha|coconut water)\b/i },
  { type: 'dairy', re: /\b(milk|curd|dahi|paneer|cheese|yogurt|yoghurt|cream|khoa|mawa)\b/i },
  { type: 'condiment', re: /\b(masala|sauce|ketchup|pickle|achar|chutney|mayonnaise|spread|seasoning|jam|vinegar|paste|spice)\b/i },
  { type: 'ready-meal', re: /\b(noodles|pasta|soup|ready to eat|instant|frozen|pizza|burger|meal)\b/i },
  { type: 'staple', re: /\b(atta|maida|flour|rice|dal|lentil|pulses?|oats|cornflakes|muesli|bread|besan|sooji|rava|poha|semolina|wheat|millet|ragi|quinoa|sugar|salt|jaggery)\b/i },
];

// Frying oils in an ingredient list are strong evidence that a snack was
// fried rather than baked -- checked only for snack-ish types.
const FRYING_OIL_RE = /\b(palmolein|palm oil|refined (palmolein|vegetable|sunflower|soybean|cottonseed|rice bran|groundnut) oil|edible vegetable oil|vegetable oil)\b/i;

/**
 * @param {{productName?: string, ingredientNames?: string[]}} input
 * @returns {{foodType: string, isDeepFried: boolean}}
 */
export function classifyFoodType({ productName, ingredientNames = [] } = {}) {
  // "No Palm Oil" is a claim about a snack, not a product that IS oil.
  const name = String(productName || '').replace(/\b(no|without|free of|zero|low)\s+(palm\s+)?(oil|fat)\b/gi, ' ');
  let foodType = 'other';
  for (const rule of RULES) {
    if (rule.re.test(name) && !(rule.notRe && rule.notRe.test(name))) { foodType = rule.type; break; }
  }
  const hasFryingOil = FRYING_OIL_RE.test((ingredientNames || []).join(', '));
  // A snack whose name says nothing useful ("Crunchy Bites") but whose
  // ingredients are mostly flour/potato + frying oil is still a fried snack.
  const isDeepFried = foodType === 'fried-snack' || (foodType === 'other' && hasFryingOil && /\b(bites?|sticks?|crunch|crispy|munch|snack)\b/i.test(name));
  if (foodType === 'other' && isDeepFried) foodType = 'fried-snack';
  return { foodType, isDeepFried };
}

export function normalizeFoodType(value) {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return FOOD_TYPES.includes(v) ? v : null;
}
