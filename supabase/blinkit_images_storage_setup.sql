-- FoodGuard India -- Storage bucket for optimized Blinkit product photos.
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).
--
-- First use of Supabase Storage in this app (confirmed via a full repo
-- search before writing this: every other "photo" here is a compressed
-- data: URL inline in a JSONB column, fine for a single admin-entered
-- photo but not for a real downloaded-and-reprocessed image pipeline).
-- Blinkit's own image_url points at a 1000x1000 photo with a lot of
-- white padding around the product -- scripts/optimize-blinkit-images.js
-- downloads it, crops that padding away (sharp's trim()), resizes and
-- compresses to ~15-20KB, and uploads the result here.
--
-- Public bucket: GET requests to the public URL bypass RLS entirely (an
-- anon user's browser needs to load these directly as <img> src, same
-- as every other product photo in the app). Uploads still need an
-- explicit policy below -- this project has no service-role key (only
-- the anon key, same as every other table here), so the anon key needs
-- write access for the pilot script to actually work.

insert into storage.buckets (id, name, public)
values ('blinkit-images', 'blinkit-images', true)
on conflict (id) do nothing;

create policy "Anyone can read blinkit-images"
  on storage.objects for select
  using (bucket_id = 'blinkit-images');

create policy "Anyone can upload to blinkit-images"
  on storage.objects for insert
  with check (bucket_id = 'blinkit-images');

create policy "Anyone can overwrite blinkit-images"
  on storage.objects for update
  using (bucket_id = 'blinkit-images');

-- Tracking columns on blinkit_products -- optimized_image_url is null
-- until a product has actually been processed by the pilot script, so
-- "not yet optimized" and "optimize this next" are the same simple
-- query (see optimize-blinkit-images.js's row selection).
alter table public.blinkit_products add column if not exists optimized_image_url text;
alter table public.blinkit_products add column if not exists optimized_image_bytes integer;
