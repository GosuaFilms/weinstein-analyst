-- Google sign-ups send their name as full_name / name, not display_name.
-- CREATE OR REPLACE keeps the existing trigger, owner and revoked EXECUTE.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_color)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    'bg-' || (array['amber','emerald','blue','rose','purple','cyan'])[1 + floor(random()*6)] || '-500'
  );
  return new;
end;
$$;
