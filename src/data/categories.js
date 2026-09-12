// src/data/categories.js
//
// A small, curated set of home-screen browse categories. Matches by
// product-name keyword against the already-cached product_reports
// table (see browseCategoryProducts in services/productCache.js) --
// no new data pipeline, no AI cost, just a free browse over products
// that have already been scored.
//
// `image` is a real illustrated photo per category (cropped from a
// reference grid the user supplied, see src/assets/categories/) --
// replaced an earlier line-icon set that wasn't distinctive enough for
// categories like Beverages/Dairy.
import biscuits from '../assets/categories/biscuits.png';
import noodles from '../assets/categories/noodles.png';
import beverages from '../assets/categories/beverages.png';
import snacks from '../assets/categories/snacks.png';
import chocolates from '../assets/categories/chocolates.png';
import spices from '../assets/categories/spices.png';
import dairy from '../assets/categories/dairy.png';
import essentials from '../assets/categories/essentials.png';

export const CATEGORIES = [
  { id: 'biscuits', label: 'Biscuits & Cookies', image: biscuits, keywords: ['biscuit', 'cookie', 'cracker', 'rusk'] },
  // 'instant' on its own used to be a keyword here too, but it's generic
  // enough to also match things like "Bru Instant Coffee" -- which then
  // surfaced as a "safer alternative" to a pasta product. Every keyword
  // left here is specific to an actual noodle/pasta product.
  { id: 'noodles', label: 'Instant Noodles', image: noodles, keywords: ['noodle', 'maggi', 'pasta', 'vermicelli', 'macaroni', 'soup'] },
  { id: 'beverages', label: 'Beverages', image: beverages, keywords: ['juice', 'drink', 'squash', 'tea', 'coffee'] },
  { id: 'snacks', label: 'Snacks & Namkeen', image: snacks, keywords: ['chips', 'namkeen', 'bhujia', 'sev', 'mixture', 'popcorn', 'wafer'] },
  { id: 'chocolates', label: 'Chocolates & Sweets', image: chocolates, keywords: ['chocolate', 'candy', 'toffee', 'eclair', 'chikki'] },
  { id: 'spices', label: 'Spices & Masala', image: spices, keywords: ['masala', 'spice', 'haldi', 'mirchi', 'garam'] },
  { id: 'dairy', label: 'Dairy & Frozen', image: dairy, keywords: ['milk', 'cheese', 'paneer', 'curd', 'dahi', 'ice cream', 'kulfi', 'ghee', 'butter'] },
  { id: 'essentials', label: 'Cooking Essentials', image: essentials, keywords: ['oil', 'atta', 'flour', 'rice', 'sauce', 'ketchup'] },
];
