// src/data/categoryKeywords.js
//
// Category id/label/keyword data, deliberately with NO image imports.
// categories.js (the browser-facing version, with `image` attached) and
// productCache.js both need this list, but productCache.js is also
// imported directly by plain-`node` scripts (generate-reports.js,
// discover-off-products.js) that run outside Vite -- Vite is what turns
// a `.png` import into a usable module, and plain Node's ESM loader
// throws ERR_UNKNOWN_FILE_EXTENSION the moment it meets one. Keeping
// the images only in categories.js keeps this file safe to import from
// either place.
export const CATEGORY_KEYWORDS = [
  { id: 'biscuits', label: 'Biscuits & Cookies', keywords: ['biscuit', 'cookie', 'cracker', 'rusk'] },
  // 'instant' on its own used to be a keyword here too, but it's generic
  // enough to also match things like "Bru Instant Coffee" -- which then
  // surfaced as a "safer alternative" to a pasta product. Every keyword
  // left here is specific to an actual noodle/pasta product.
  { id: 'noodles', label: 'Instant Noodles', keywords: ['noodle', 'maggi', 'pasta', 'vermicelli', 'macaroni', 'soup'] },
  { id: 'beverages', label: 'Beverages', keywords: ['juice', 'drink', 'squash', 'tea', 'coffee'] },
  { id: 'snacks', label: 'Snacks & Namkeen', keywords: ['chips', 'namkeen', 'bhujia', 'sev', 'mixture', 'popcorn', 'wafer'] },
  { id: 'chocolates', label: 'Chocolates & Sweets', keywords: ['chocolate', 'candy', 'toffee', 'eclair', 'chikki'] },
  { id: 'spices', label: 'Spices & Masala', keywords: ['masala', 'spice', 'haldi', 'mirchi', 'garam'] },
  { id: 'dairy', label: 'Dairy & Frozen', keywords: ['milk', 'cheese', 'paneer', 'curd', 'dahi', 'ice cream', 'kulfi', 'ghee', 'butter'] },
  { id: 'essentials', label: 'Cooking Essentials', keywords: ['oil', 'atta', 'flour', 'rice', 'sauce', 'ketchup'] },
];
