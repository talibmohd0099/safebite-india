-- FoodGuard India -- product_nutrition was missing a DELETE policy.
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).
--
-- Without this, admin edits that change a product's barcode/lookup_key
-- fail with: "update or delete on table product_reports violates
-- foreign key constraint product_nutrition_lookup_key_fkey" --
-- adminUpdateProduct (adminProductsRepo.js) deletes the old
-- product_nutrition row before changing the parent's lookup_key (the
-- foreign key has no ON UPDATE CASCADE), but with RLS enabled and no
-- DELETE policy, that delete silently affected zero rows, leaving the
-- old row behind to block the update.

create policy "Anyone can delete nutrition data"
  on public.product_nutrition for delete
  using (true);
