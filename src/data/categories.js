// src/data/categories.js
//
// A small, curated set of home-screen browse categories. Matches by
// product-name keyword against the already-cached product_reports
// table (see browseCategoryProducts in services/productCache.js) --
// no new data pipeline, no AI cost, just a free browse over products
// that have already been scored.
export const CATEGORIES = [
  { id: 'biscuits', label: 'Biscuits & Cookies', icon: '🍪', bg: 'bg-amber-100', keywords: ['biscuit', 'cookie', 'cracker', 'rusk'] },
  { id: 'noodles', label: 'Noodles & Instant', icon: '🍜', bg: 'bg-orange-100', keywords: ['noodle', 'maggi', 'pasta', 'vermicelli', 'soup', 'instant'] },
  { id: 'beverages', label: 'Beverages', icon: '🥤', bg: 'bg-sky-100', keywords: ['juice', 'drink', 'squash', 'tea', 'coffee'] },
  { id: 'snacks', label: 'Snacks & Namkeen', icon: '🍟', bg: 'bg-yellow-100', keywords: ['chips', 'namkeen', 'bhujia', 'sev', 'mixture', 'popcorn', 'wafer'] },
  { id: 'chocolates', label: 'Chocolates & Sweets', icon: '🍫', bg: 'bg-pink-100', keywords: ['chocolate', 'candy', 'toffee', 'eclair', 'chikki'] },
  { id: 'spices', label: 'Spices & Masala', icon: '🌶️', bg: 'bg-red-100', keywords: ['masala', 'spice', 'haldi', 'mirchi', 'garam'] },
  { id: 'dairy', label: 'Dairy & Frozen', icon: '🥛', bg: 'bg-blue-100', keywords: ['milk', 'cheese', 'paneer', 'curd', 'dahi', 'ice cream', 'kulfi', 'ghee', 'butter'] },
  { id: 'essentials', label: 'Cooking Essentials', icon: '🍚', bg: 'bg-emerald-100', keywords: ['oil', 'atta', 'flour', 'rice', 'sauce', 'ketchup'] },
];
