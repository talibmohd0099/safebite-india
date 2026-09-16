-- FoodGuard India — adds the rest of the printed nutrition panel to
-- product_nutrition. Run once in the Supabase SQL Editor.
--
-- The app started extracting these five fields (see
-- src/services/openFoodFacts.js and blinkitProductsRepo.js), and they
-- already show in the Nutrition section, but this dashboard table only
-- ever had columns for the original six.
--
-- MUST run before the code that writes these columns is deployed:
-- upsertProductNutrition() swallows its errors, so writing a column that
-- doesn't exist yet would make every nutrition row fail silently --
-- including the six columns that work today.
--
-- Safe to run more than once.

alter table public.product_nutrition add column if not exists carbohydrate_g numeric;
alter table public.product_nutrition add column if not exists total_sugar_g numeric;
alter table public.product_nutrition add column if not exists total_fat_g numeric;
alter table public.product_nutrition add column if not exists fibre_g numeric;
alter table public.product_nutrition add column if not exists cholesterol_mg numeric;
