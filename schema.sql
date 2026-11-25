-- SERVICE D'AUTHENTIFICATION — schéma initial
-- À exécuter dans Supabase > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_service_admin()
returns boolean language sql stable security definer
set search_path = public
as $$ select exists(select 1 from public.admin_users where user_id = auth.uid()); $$;

create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null default ('SA-' || upper(substr(encode(gen_random_bytes(6),'hex'),1,10))),
  email text not null check (length(email) between 5 and 254),
  amount numeric(12,2) not null check (amount > 0),
  photo_path text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists requests_created_at_idx on public.requests(created_at desc);
create index if not exists requests_status_idx on public.requests(status);

create table if not exists public.request_history (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.requests(id) on delete cascade,
  reference text not null,
  old_status text,
  new_status text not null,
  admin_user_id uuid,
  admin_email text,
  created_at timestamptz not null default now()
);

create or replace function public.set_request_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists requests_updated_at on public.requests;
create trigger requests_updated_at before update on public.requests
for each row execute function public.set_request_updated_at();

create or replace function public.log_request_status_change()
returns trigger language plpgsql security definer
set search_path = public, auth
as $$
begin
 if new.status is distinct from old.status then
  insert into public.request_history(request_id,reference,old_status,new_status,admin_user_id,admin_email)
  values(new.id,new.reference,old.status,new.status,auth.uid(),(select email from auth.users where id=auth.uid()));
 end if;
 return new;
end; $$;
drop trigger if exists requests_status_history on public.requests;
create trigger requests_status_history after update on public.requests
for each row execute function public.log_request_status_change();

alter table public.admin_users enable row level security;
alter table public.requests enable row level security;
alter table public.request_history enable row level security;

drop policy if exists "admins read admin list" on public.admin_users;
create policy "admins read admin list" on public.admin_users for select to authenticated using (public.is_service_admin());

drop policy if exists "public create requests" on public.requests;
create policy "public create requests" on public.requests for insert to anon, authenticated
with check (
 status='pending' and
 photo_path ~ '^[0-9a-fA-F-]{36}\.(jpg|png|webp)$'
);
drop policy if exists "admins read requests" on public.requests;
create policy "admins read requests" on public.requests for select to authenticated using (public.is_service_admin());
drop policy if exists "admins update requests" on public.requests;
create policy "admins update requests" on public.requests for update to authenticated
using (public.is_service_admin()) with check (public.is_service_admin());

drop policy if exists "admins read history" on public.request_history;
create policy "admins read history" on public.request_history for select to authenticated using (public.is_service_admin());

-- Statut public limité : il faut connaître la référence ET l'adresse e-mail.
create or replace function public.check_request_status(p_reference text,p_email text)
returns table(status text)
language sql security definer
set search_path = public
as $$
 select r.status from public.requests r
 where upper(r.reference)=upper(trim(p_reference))
 and lower(r.email)=lower(trim(p_email))
 limit 1;
$$;
revoke all on function public.check_request_status(text,text) from public;
grant execute on function public.check_request_status(text,text) to anon, authenticated;

-- Bucket privé : aucun accès public direct aux images.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('proofs','proofs',false,8388608,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=8388608,allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists "visitors upload proof" on storage.objects;
create policy "visitors upload proof" on storage.objects for insert to anon, authenticated
with check (bucket_id='proofs' and name ~ '^[0-9a-fA-F-]{36}\.(jpg|png|webp)$');
drop policy if exists "admins view proof" on storage.objects;
create policy "admins view proof" on storage.objects for select to authenticated
using (bucket_id='proofs' and public.is_service_admin());

-- IMPORTANT : après avoir créé le compte via Authentication > Users,
-- ajoutez son UUID ici (remplacez l'exemple) :
-- insert into public.admin_users(user_id) values ('UUID-DU-COMPTE-ADMIN');
