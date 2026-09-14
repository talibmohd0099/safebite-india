// src/utils/categoryIcon.js
// Shared between IngredientCard.jsx (the Ingredients tab) and the score
// breakdown modal (Result.jsx) so the same ingredient always gets the
// same icon everywhere in the app, not two slightly different mappings.
//
// Deliberately generic for anything not clearly one of these -- guessing
// a specific food icon for an ambiguous "other" category would be more
// misleading than a neutral placeholder.
const CATEGORY_ICONS = {
  natural: '🌿',
  protein: '🥩',
  spice: '🌶️',
  'flavour enhancer': '👅',
  flavour: '👃',
  flavor: '👃',
  'acidity regulator': '⚗️',
  sweetener: '🍬',
  oil: '🫗',
  fat: '🧈',
  preservative: '🧪',
  antioxidant: '🛡️',
  emulsifier: '🧴',
  color: '🎨',
  colorant: '🎨',
  'raising agent': '🫧',
  stabilizer: '🧷',
};

export function categoryIcon(category) {
  return CATEGORY_ICONS[(category || '').toLowerCase()] || '🔹';
}
