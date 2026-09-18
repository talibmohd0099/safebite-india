-- FoodGuard India -- product_reports was missing a DELETE policy.
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).
--
-- schema.sql enabled RLS on product_reports with select/insert/update
-- policies but never added one for delete. adminDeleteProduct
-- (adminProductsRepo.js) issues .delete().eq('id', id) using the anon
-- key -- with RLS on and no matching policy, Postgres just filters
-- that row out of the delete's target set. PostgREST reports this as
-- a normal success (no error), so the admin panel's "Delete" button
-- looked like it worked while silently deleting zero rows every time.
-- Confirmed live: a direct delete().select() on a real row returned
-- error: null but an empty deleted-rows array.

create policy "Anyone can delete cached reports"
  on public.product_reports for delete
  using (true);
