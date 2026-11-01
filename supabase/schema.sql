-- Run once in a new Supabase project's SQL Editor.
-- The unguessable link is the aquarium's access key. No accounts are needed.
begin;

create table public.tanks (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table public.fish (
  id uuid primary key default gen_random_uuid(),
  tank_id uuid not null references public.tanks(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  image text not null check (
    octet_length(image) <= 700000
    and image ~ '^data:image/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$'
  ),
  aspect real not null check (aspect between 0.2 and 5),
  facing text not null check (facing in ('left', 'right')),
  created_at timestamptz not null default now()
);

create index fish_tank_id_idx on public.fish(tank_id, created_at, id);
alter table public.tanks enable row level security;
alter table public.fish enable row level security;
revoke all on public.tanks, public.fish from anon, authenticated;

create function public.create_tank()
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare new_token uuid;
begin
  -- Bound anonymous creation for this small MVP deployment.
  perform pg_advisory_xact_lock(71823011);
  if (select count(*) from public.tanks) >= 1000 then
    raise exception 'The aquarium service is full. Ask the owner to make room.';
  end if;
  insert into public.tanks default values returning token into new_token;
  return new_token;
end;
$$;

create function public.list_fish(tank_token uuid)
returns table (id uuid, name text, aspect real, facing text)
language plpgsql security definer set search_path = ''
as $$
declare target_id uuid;
begin
  select t.id into target_id from public.tanks t where t.token = tank_token;
  if target_id is null then raise exception 'Aquarium not found. Check your link.'; end if;
  return query select f.id, f.name, f.aspect, f.facing
    from public.fish f where f.tank_id = target_id order by f.created_at, f.id;
end;
$$;

create function public.get_fish_image(tank_token uuid, fish_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare drawing text;
begin
  select f.image into drawing from public.fish f
    join public.tanks t on t.id = f.tank_id
    where t.token = tank_token and f.id = fish_id;
  if drawing is null then raise exception 'Fish not found in this aquarium.'; end if;
  return drawing;
end;
$$;

create function public.add_fish(
  tank_token uuid, fish_name text, fish_image text, fish_aspect real, fish_facing text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare target_id uuid; new_id uuid;
begin
  -- Lock the tank so concurrent phone uploads cannot bypass the 40-fish limit.
  select t.id into target_id from public.tanks t where t.token = tank_token for update;
  if target_id is null then raise exception 'Aquarium not found. Check your link.'; end if;
  if (select count(*) from public.fish f where f.tank_id = target_id) >= 40 then
    raise exception 'This aquarium is full (40 fish).';
  end if;
  if fish_name is null or char_length(trim(fish_name)) not between 1 and 40
    or fish_image is null or octet_length(fish_image) > 700000
    or fish_image !~ '^data:image/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$'
    or fish_aspect is null or not (fish_aspect between 0.2 and 5)
    or fish_facing is null or fish_facing not in ('left', 'right') then
    raise exception 'Invalid drawing. Use a PNG cutout, a short name, and a valid fish shape.';
  end if;
  insert into public.fish(tank_id, name, image, aspect, facing)
    values (target_id, trim(fish_name), fish_image, fish_aspect, fish_facing)
    returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.create_tank() from public;
revoke all on function public.list_fish(uuid) from public;
revoke all on function public.get_fish_image(uuid, uuid) from public;
revoke all on function public.add_fish(uuid, text, text, real, text) from public;
grant execute on function public.create_tank() to anon;
grant execute on function public.list_fish(uuid) to anon;
grant execute on function public.get_fish_image(uuid, uuid) to anon;
grant execute on function public.add_fish(uuid, text, text, real, text) to anon;

commit;
