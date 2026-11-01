-- Run after schema.sql, including when upgrading an existing aquarium.
begin;

create table if not exists public.fish_analysis_requests (
  id uuid primary key default gen_random_uuid(),
  tank_id uuid not null references public.tanks(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists fish_analysis_requests_created_idx
  on public.fish_analysis_requests(created_at);
create index if not exists fish_analysis_requests_tank_idx
  on public.fish_analysis_requests(tank_id, created_at);
alter table public.fish_analysis_requests enable row level security;
revoke all on public.fish_analysis_requests from anon, authenticated;

create or replace function public.claim_fish_analysis(tank_token uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare target_id uuid;
begin
  -- A shared transaction lock makes the paid-request budget safe across Vercel instances.
  perform pg_advisory_xact_lock(71823012);
  select t.id into target_id from public.tanks t where t.token = tank_token;
  if target_id is null then raise exception 'Aquarium not found. Scan its QR code again.'; end if;
  if (select count(*) from public.fish f where f.tank_id = target_id) >= 40 then
    raise exception 'This aquarium is full (40 fish).';
  end if;
  delete from public.fish_analysis_requests where created_at < now() - interval '1 day';
  if (select count(*) from public.fish_analysis_requests
      where tank_id = target_id and created_at > now() - interval '10 minutes') >= 10 then
    raise exception 'This aquarium has prepared 10 photos recently. Wait 10 minutes and try again.';
  end if;
  if (select count(*) from public.fish_analysis_requests) >= 200 then
    raise exception 'The aquarium service has reached its daily AI limit. Try again tomorrow.';
  end if;
  insert into public.fish_analysis_requests(tank_id) values(target_id);
end;
$$;

revoke all on function public.claim_fish_analysis(uuid) from public;
grant execute on function public.claim_fish_analysis(uuid) to anon;
commit;
