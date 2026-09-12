// src/data/categories.js
//
// A small, curated set of home-screen browse categories. Matches by
// product-name keyword against the already-cached product_reports
// table (see browseCategoryProducts in services/productCache.js) --
// no new data pipeline, no AI cost, just a free browse over products
// that have already been scored.
//
// `bg` is the tile's pale card background; `iconBg` is the more
// saturated circle behind the icon; `iconColor` tints the icon itself
// (see components/CategoryIcon.jsx) -- same color family, different
// shades, so every tile reads as one consistent set rather than mixed
// emoji of varying visual weight.
export const CATEGORIES = [
  { id: 'biscuits', label: 'Biscuits & Cookies', bg: 'bg-amber-50', iconBg: 'bg-amber-200', iconColor: 'text-amber-700', keywords: ['biscuit', 'cookie', 'cracker', 'rusk'] },
  { id: 'noodles', label: 'Instant Noodles', bg: 'bg-orange-50', iconBg: 'bg-orange-200', iconColor: 'text-orange-700', keywords: ['noodle', 'maggi', 'pasta', 'vermicelli', 'soup', 'instant'] },
  { id: 'beverages', label: 'Beverages', bg: 'bg-sky-50', iconBg: 'bg-sky-200', iconColor: 'text-sky-700', keywords: ['juice', 'drink', 'squash', 'tea', 'coffee'] },
  { id: 'snacks', label: 'Snacks & Namkeen', bg: 'bg-pink-50', iconBg: 'bg-pink-200', iconColor: 'text-pink-700', keywords: ['chips', 'namkeen', 'bhujia', 'sev', 'mixture', 'popcorn', 'wafer'] },
  { id: 'chocolates', label: 'Chocolates & Sweets', bg: 'bg-rose-50', iconBg: 'bg-rose-200', iconColor: 'text-rose-700', keywords: ['chocolate', 'candy', 'toffee', 'eclair', 'chikki'] },
  { id: 'spices', label: 'Spices & Masala', bg: 'bg-red-50', iconBg: 'bg-red-200', iconColor: 'text-red-700', keywords: ['masala', 'spice', 'haldi', 'mirchi', 'garam'] },
  { id: 'dairy', label: 'Dairy & Frozen', bg: 'bg-blue-50', iconBg: 'bg-blue-200', iconColor: 'text-blue-700', keywords: ['milk', 'cheese', 'paneer', 'curd', 'dahi', 'ice cream', 'kulfi', 'ghee', 'butter'] },
  { id: 'essentials', label: 'Cooking Essentials', bg: 'bg-emerald-50', iconBg: 'bg-emerald-200', iconColor: 'text-emerald-700', keywords: ['oil', 'atta', 'flour', 'rice', 'sauce', 'ketchup'] },
];
