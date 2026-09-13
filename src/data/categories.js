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
// categories like Beverages/Dairy. The id/label/keywords themselves
// live in categoryKeywords.js, kept free of these image imports so
// plain-Node scripts can use the keyword data without Vite in the loop.
import { CATEGORY_KEYWORDS } from './categoryKeywords.js';
import biscuits from '../assets/categories/biscuits.png';
import noodles from '../assets/categories/noodles.png';
import beverages from '../assets/categories/beverages.png';
import snacks from '../assets/categories/snacks.png';
import chocolates from '../assets/categories/chocolates.png';
import spices from '../assets/categories/spices.png';
import dairy from '../assets/categories/dairy.png';
import essentials from '../assets/categories/essentials.png';

const IMAGES = { biscuits, noodles, beverages, snacks, chocolates, spices, dairy, essentials };

export const CATEGORIES = CATEGORY_KEYWORDS.map((c) => ({ ...c, image: IMAGES[c.id] }));
