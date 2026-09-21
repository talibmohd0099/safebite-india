// src/services/productSubmissions.js
// A user submitting a product FoodGuard couldn't find by barcode -- see
// supabase/product_submissions_schema.sql. Public-facing (called from
// SubmitProduct.jsx); the admin-side read/review lives in
// adminSubmissionsRepo.js, same split as productFlags.js/adminFlagsRepo.js.
import { supabase, isSupabaseConfigured } from './supabaseClient.js';

export async function submitProductSubmission({ barcode, productName, productPhoto, ingredientsPhoto, nutritionPhoto, notes }) {
  if (!isSupabaseConfigured) throw new Error('Submitting products isn’t available right now.');
  if (!barcode?.trim()) throw new Error('Missing barcode.');

  const { error } = await supabase.from('product_submissions').insert({
    barcode: barcode.trim(),
    product_name: productName?.trim() || null,
    product_photo: productPhoto || null,
    ingredients_photo: ingredientsPhoto || null,
    nutrition_photo: nutritionPhoto || null,
    notes: notes?.trim() || null,
  });
  if (error) throw new Error(error.message);
}
