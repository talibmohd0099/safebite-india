-- FoodGuard India — a user submitting a product that wasn't found by
-- barcode, so it can be added to the shared catalog.
-- Run this once in the Supabase SQL Editor (Project → SQL Editor → New
-- query).
--
-- Same "user submits something → admin reviews it" shape as
-- product_flags (product_flags_schema.sql) -- a snapshot-style row with
-- an open/reviewed status, not a live-editable product itself. Photos
-- are stored the same way every other photo in this app already is (see
-- adminImage.js's own comment): compressed client-side into a plain
-- data: URL, not a separate Storage bucket -- this app has never used
-- Supabase Storage, and three ~150KB data URLs per row is well within a
-- normal Postgres row/column size.

create table if not exists public.product_submissions (
  id uuid primary key default gen_random_uuid(),

  -- The barcode the user scanned that wasn't found -- required, since
  -- this flow only ever starts from a failed barcode lookup (see
  -- Home.jsx). Not a foreign key: the whole point is this barcode does
  -- NOT exist in product_reports yet.
  barcode text not null,
  product_name text,

  -- Compressed data: URLs (see compressImageToDataUrl in adminImage.js).
  -- product_photo becomes the admin form's hero photo; ingredients_photo
  -- and nutrition_photo feed the SAME "Extract from photo" action the
  -- admin form already has (AdminProductForm.jsx's sourcePhotos) -- no
  -- new extraction logic needed. All three nullable: a submitter might
  -- not have a clear nutrition panel to photograph, for example.
  product_photo text,
  ingredients_photo text,
  nutrition_photo text,
  notes text,

  -- 'pending' | 'approved' | 'rejected'. 'approved' is set once an admin
  -- actually creates the product from this submission (AdminProductForm
  -- prefilled from it) -- not a separate manual step, so a submission
  -- can't be marked approved while nothing was actually added.
  status text not null default 'pending',
  admin_notes text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists product_submissions_status_idx on public.product_submissions (status, created_at desc);
create index if not exists product_submissions_barcode_idx on public.product_submissions (barcode);

-- Same RLS story as every other table here (schema.sql) -- no user
-- accounts, so the anon key needs open read/write for this to work at
-- all from the deployed app (including the admin panel, which also
-- writes through the anon key, gated by Supabase Auth client-side, not
-- by RLS -- consistent with every other admin table).
alter table public.product_submissions enable row level security;

create policy "Anyone can submit a product"
  on public.product_submissions for insert
  with check (true);

create policy "Anyone can read submissions"
  on public.product_submissions for select
  using (true);

create policy "Anyone can update a submission"
  on public.product_submissions for update
  using (true);
