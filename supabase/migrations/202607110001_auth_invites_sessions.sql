create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'locked' check (status in ('locked', 'active', 'expired', 'revoked')),
  source text not null default 'none' check (source in ('none', 'invite', 'admin', 'payment')),
  invite_code_id uuid,
  granted_at timestamptz,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  code_hint text not null,
  status text not null default 'active' check (status in ('active', 'disabled', 'exhausted')),
  max_redemptions integer not null default 1 check (max_redemptions > 0),
  redemption_count integer not null default 0 check (redemption_count >= 0),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.user_entitlements
  drop constraint if exists user_entitlements_invite_code_id_fkey;
alter table public.user_entitlements
  add constraint user_entitlements_invite_code_id_fkey
  foreign key (invite_code_id) references public.invite_codes(id) on delete set null;

create table if not exists public.invite_redemptions (
  id uuid primary key default gen_random_uuid(),
  invite_code_id uuid not null references public.invite_codes(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  unique (invite_code_id, user_id)
);

create table if not exists public.interview_sessions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  interview_date date not null,
  interview_time text not null,
  duration text not null,
  raw_transcript jsonb not null default '[]'::jsonb,
  source_client_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_client_id)
);

create table if not exists public.interview_feedback (
  session_id text primary key references public.interview_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  overall_score numeric(3, 2) not null,
  feedback_payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists entitlements_set_updated_at on public.user_entitlements;
create trigger entitlements_set_updated_at
before update on public.user_entitlements
for each row execute function public.set_updated_at();

drop trigger if exists sessions_set_updated_at on public.interview_sessions;
create trigger sessions_set_updated_at
before update on public.interview_sessions
for each row execute function public.set_updated_at();

drop trigger if exists feedback_set_updated_at on public.interview_feedback;
create trigger feedback_set_updated_at
before update on public.interview_feedback
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;

  insert into public.user_entitlements (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles (id, display_name)
select id, coalesce(raw_user_meta_data ->> 'display_name', split_part(email, '@', 1))
from auth.users
on conflict (id) do nothing;

insert into public.user_entitlements (user_id)
select id from auth.users
on conflict (user_id) do nothing;

create or replace function public.has_active_entitlement(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_entitlements e
    where e.user_id = p_user_id
      and e.status = 'active'
      and (e.expires_at is null or e.expires_at > now())
  );
$$;

revoke all on function public.has_active_entitlement(uuid) from public;
grant execute on function public.has_active_entitlement(uuid) to authenticated;

create or replace function public.redeem_invite_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_hash text;
  v_code public.invite_codes%rowtype;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  if p_code is null or length(trim(p_code)) < 6 or length(trim(p_code)) > 128 then
    raise exception 'INVALID_INVITE_CODE' using errcode = 'P0001';
  end if;

  if public.has_active_entitlement(v_user_id) then
    return jsonb_build_object('ok', true, 'already_active', true);
  end if;

  v_hash := encode(extensions.digest(convert_to(upper(trim(p_code)), 'UTF8'), 'sha256'), 'hex');

  select *
  into v_code
  from public.invite_codes
  where code_hash = v_hash
  for update;

  if not found
    or v_code.status <> 'active'
    or (v_code.expires_at is not null and v_code.expires_at <= now())
    or v_code.redemption_count >= v_code.max_redemptions then
    raise exception 'INVALID_OR_EXPIRED_INVITE_CODE' using errcode = 'P0001';
  end if;

  insert into public.invite_redemptions (invite_code_id, user_id)
  values (v_code.id, v_user_id)
  on conflict (invite_code_id, user_id) do nothing;

  update public.invite_codes
  set redemption_count = redemption_count + 1,
      status = case
        when redemption_count + 1 >= max_redemptions then 'exhausted'
        else status
      end
  where id = v_code.id;

  insert into public.user_entitlements (
    user_id, status, source, invite_code_id, granted_at, expires_at
  ) values (
    v_user_id, 'active', 'invite', v_code.id, now(), null
  )
  on conflict (user_id) do update
  set status = 'active',
      source = 'invite',
      invite_code_id = excluded.invite_code_id,
      granted_at = excluded.granted_at,
      expires_at = null,
      updated_at = now();

  return jsonb_build_object('ok', true, 'already_active', false);
end;
$$;

revoke all on function public.redeem_invite_code(text) from public, anon;
grant execute on function public.redeem_invite_code(text) to authenticated;

create or replace function public.issue_invite_code(
  p_code text,
  p_max_redemptions integer default 1,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_normalized text := upper(trim(p_code));
begin
  if length(v_normalized) < 6 or length(v_normalized) > 128 then
    raise exception 'Invite code length must be between 6 and 128 characters';
  end if;

  insert into public.invite_codes (
    code_hash, code_hint, max_redemptions, expires_at
  ) values (
    encode(extensions.digest(convert_to(v_normalized, 'UTF8'), 'sha256'), 'hex'),
    left(v_normalized, 3) || '***' || right(v_normalized, 2),
    p_max_redemptions,
    p_expires_at
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.issue_invite_code(text, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.issue_invite_code(text, integer, timestamptz) to service_role;

alter table public.profiles enable row level security;
alter table public.user_entitlements enable row level security;
alter table public.invite_codes enable row level security;
alter table public.invite_redemptions enable row level security;
alter table public.interview_sessions enable row level security;
alter table public.interview_feedback enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
for select to authenticated using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "entitlements_select_own" on public.user_entitlements;
create policy "entitlements_select_own" on public.user_entitlements
for select to authenticated using (user_id = auth.uid());

drop policy if exists "redemptions_select_own" on public.invite_redemptions;
create policy "redemptions_select_own" on public.invite_redemptions
for select to authenticated using (user_id = auth.uid());

drop policy if exists "sessions_select_own_active" on public.interview_sessions;
create policy "sessions_select_own_active" on public.interview_sessions
for select to authenticated
using (user_id = auth.uid() and public.has_active_entitlement(auth.uid()));

drop policy if exists "sessions_insert_own_active" on public.interview_sessions;
create policy "sessions_insert_own_active" on public.interview_sessions
for insert to authenticated
with check (user_id = auth.uid() and public.has_active_entitlement(auth.uid()));

drop policy if exists "sessions_update_own_active" on public.interview_sessions;
create policy "sessions_update_own_active" on public.interview_sessions
for update to authenticated
using (user_id = auth.uid() and public.has_active_entitlement(auth.uid()))
with check (user_id = auth.uid() and public.has_active_entitlement(auth.uid()));

drop policy if exists "sessions_delete_own_active" on public.interview_sessions;
create policy "sessions_delete_own_active" on public.interview_sessions
for delete to authenticated
using (user_id = auth.uid() and public.has_active_entitlement(auth.uid()));

drop policy if exists "feedback_select_own_active" on public.interview_feedback;
create policy "feedback_select_own_active" on public.interview_feedback
for select to authenticated
using (user_id = auth.uid() and public.has_active_entitlement(auth.uid()));

drop policy if exists "feedback_insert_own_active" on public.interview_feedback;
create policy "feedback_insert_own_active" on public.interview_feedback
for insert to authenticated
with check (user_id = auth.uid() and public.has_active_entitlement(auth.uid()));

drop policy if exists "feedback_update_own_active" on public.interview_feedback;
create policy "feedback_update_own_active" on public.interview_feedback
for update to authenticated
using (user_id = auth.uid() and public.has_active_entitlement(auth.uid()))
with check (user_id = auth.uid() and public.has_active_entitlement(auth.uid()));

drop policy if exists "feedback_delete_own_active" on public.interview_feedback;
create policy "feedback_delete_own_active" on public.interview_feedback
for delete to authenticated
using (user_id = auth.uid() and public.has_active_entitlement(auth.uid()));
