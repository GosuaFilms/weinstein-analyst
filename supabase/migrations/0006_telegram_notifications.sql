-- Telegram notification channel for push alerts
alter table public.profiles
  add column if not exists telegram_chat_id  bigint  default null,
  add column if not exists telegram_link_token text   default null;

-- Unique index so we can look up a user by their link token
create unique index if not exists profiles_telegram_link_token_idx
  on public.profiles (telegram_link_token)
  where telegram_link_token is not null;
