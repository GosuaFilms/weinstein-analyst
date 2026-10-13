-- Security hardening before charging users.
-- Applied by hand in the SQL Editor (remote history only tracks 0001–0010).

-- 1. profiles_update_own / profiles_insert_own let a signed-in user write ANY
--    column of their own row — including plan = 'pro'. Billing and Telegram
--    link columns may only change server-side (Stripe webhook, telegram-link),
--    which run as service_role; signup's handle_new_user runs as its owner.
create or replace function public.protect_profile_billing()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.plan                   := 'free';
      new.stripe_customer_id     := null;
      new.stripe_subscription_id := null;
      new.plan_expires_at        := null;
      new.telegram_chat_id       := null;
    elsif (new.plan, new.stripe_customer_id, new.stripe_subscription_id, new.plan_expires_at, new.telegram_chat_id)
          is distinct from
          (old.plan, old.stripe_customer_id, old.stripe_subscription_id, old.plan_expires_at, old.telegram_chat_id) then
      raise exception 'plan, billing and Telegram fields are read-only' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_billing on public.profiles;
create trigger protect_profile_billing
  before insert or update on public.profiles
  for each row execute function public.protect_profile_billing();

-- 2. This policy applied to every role, so anyone with the public key could
--    insert fake rows into the Stage 2 Monitor shown to all users.
--    stage2-daily writes with the service role, which bypasses RLS anyway.
drop policy if exists "service role can insert stage2 snapshots" on public.stage2_snapshots;
