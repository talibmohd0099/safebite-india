// src/data/categories.js
//
// A small, curated set of home-screen browse categories. Matches by
// product-name keyword against the already-cached product_reports
// table (see browseCategoryProducts in services/productCache.js) --
// no new data pipeline, no AI cost, just a free browse over products
// that have already been scored.
//
// `bg` is the tile's pale card background; `iconBg` is the more
// saturated circle behind the emoji -- same color family, two shades.
export const CATEGORIES = [
  { id: 'biscuits', label: 'Biscuits & Cookies', icon: '🍪', bg: 'bg-amber-50', iconBg: 'bg-amber-200', keywords: ['biscuit', 'cookie', 'cracker', 'rusk'] },
  { id: 'noodles', label: 'Instant Noodles', icon: '🍜', bg: 'bg-orange-50', iconBg: 'bg-orange-200', keywords: ['noodle', 'maggi', 'pasta', 'vermicelli', 'soup', 'instant'] },
  { id: 'beverages', label: 'Beverages', icon: '🥤', bg: 'bg-sky-50', iconBg: 'bg-sky-200', keywords: ['juice', 'drink', 'squash', 'tea', 'coffee'] },
  { id: 'snacks', label: 'Snacks & Namkeen', icon: '🍟', bg: 'bg-pink-50', iconBg: 'bg-pink-200', keywords: ['chips', 'namkeen', 'bhujia', 'sev', 'mixture', 'popcorn', 'wafer'] },
  { id: 'chocolates', label: 'Chocolates & Sweets', icon: '🍫', bg: 'bg-rose-50', iconBg: 'bg-rose-200', keywords: ['chocolate', 'candy', 'toffee', 'eclair', 'chikki'] },
  { id: 'spices', label: 'Spices & Masala', icon: '🌶️', bg: 'bg-red-50', iconBg: 'bg-red-200', keywords: ['masala', 'spice', 'haldi', 'mirchi', 'garam'] },
  { id: 'dairy', label: 'Dairy & Frozen', icon: '🥛', bg: 'bg-blue-50', iconBg: 'bg-blue-200', keywords: ['milk', 'cheese', 'paneer', 'curd', 'dahi', 'ice cream', 'kulfi', 'ghee', 'butter'] },
  { id: 'essentials', label: 'Cooking Essentials', icon: '🍚', bg: 'bg-emerald-50', iconBg: 'bg-emerald-200', keywords: ['oil', 'atta', 'flour', 'rice', 'sauce', 'ketchup'] },
];
