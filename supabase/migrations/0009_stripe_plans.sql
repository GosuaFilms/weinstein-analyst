-- ============================================================================
-- Weinstein Stage Analyst — Stripe subscription & plan gating
-- ============================================================================

alter table public.profiles
  add column if not exists plan text not null default 'free'
    check (plan in ('free', 'pro')),
  add column if not exists stripe_customer_id text default null,
  add column if not exists stripe_subscription_id text default null,
  add column if not exists plan_expires_at timestamptz default null;

create unique index if not exists profiles_stripe_customer_idx
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;
