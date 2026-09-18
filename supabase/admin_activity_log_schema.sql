-- FoodGuard India -- admin panel activity log.
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).
--
-- Who changed what, and when -- not needed while there's a single admin,
-- but cheap to have from day one so it's already in place the moment a
-- second person ever gets access. Logging is best-effort from the app's
-- side (see adminActivityRepo.js) -- a missing log row never blocks the
-- action it was supposed to record.

create table if not exists public.admin_activity_log (
  id uuid primary key default gen_random_uuid(),

  actor_email text,                 -- from auth.getUser() at the time of the action
  action text not null,             -- 'create' | 'update' | 'delete' | 'merge' | 'resolve_flag' | 'reopen_flag' | 'import'
  target_type text not null,        -- 'product' | 'flag'
  target_id text,                   -- product_reports.id or product_flags.id, as text
  product_name text,                -- denormalized so the log reads on its own after a delete
  details jsonb,                    -- action-specific extra info (e.g. merged-away ids, CSV row count)

  created_at timestamptz not null default now()
);

create index if not exists admin_activity_log_created_idx on public.admin_activity_log (created_at desc);

alter table public.admin_activity_log enable row level security;

-- Same story as every other table here: no separate user-role system
-- yet, so the anon key (used only from behind the admin login in the
-- app itself) needs open read/write.
create policy "Anyone can read the activity log"
  on public.admin_activity_log for select
  using (true);

create policy "Anyone can write to the activity log"
  on public.admin_activity_log for insert
  with check (true);
