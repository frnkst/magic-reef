-- Run after schema.sql and ai.sql. Safe to re-run; existing drawings remain fish.
begin;

alter table public.fish add column if not exists kind text not null default 'fish'
  check (kind in ('fish', 'submarine', 'plant'));

create or replace function public.list_drawings(tank_token uuid)
returns table (id uuid, name text, aspect real, facing text, kind text)
language plpgsql security definer set search_path = ''
as $$
declare target_id uuid;
begin
  select t.id into target_id from public.tanks t where t.token = tank_token;
  if target_id is null then raise exception 'Aquarium not found. Check your link.'; end if;
  return query select f.id, f.name, f.aspect, f.facing, f.kind
    from public.fish f where f.tank_id = target_id order by f.created_at, f.id;
end;
$$;

create or replace function public.add_drawing(
  tank_token uuid, fish_name text, fish_image text, fish_aspect real, fish_facing text, drawing_kind text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare target_id uuid; new_id uuid;
begin
  select t.id into target_id from public.tanks t where t.token = tank_token for update;
  if target_id is null then raise exception 'Aquarium not found. Check your link.'; end if;
  if (select count(*) from public.fish f where f.tank_id = target_id) >= 40 then
    raise exception 'This aquarium is full (40 drawings).';
  end if;
  if fish_name is null or char_length(trim(fish_name)) not between 1 and 40
    or fish_image is null or octet_length(fish_image) > 700000
    or fish_image !~ '^data:image/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$'
    or fish_aspect is null or not (fish_aspect between 0.2 and 5)
    or fish_facing is null or fish_facing not in ('left', 'right')
    or drawing_kind is null or drawing_kind not in ('fish', 'submarine', 'plant') then
    raise exception 'Invalid drawing. Use a PNG cutout, a short name, and a valid subject type.';
  end if;
  insert into public.fish(tank_id, name, image, aspect, facing, kind)
    values(target_id, trim(fish_name), fish_image, fish_aspect, fish_facing, drawing_kind)
    returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.list_drawings(uuid) from public;
revoke all on function public.add_drawing(uuid, text, text, real, text, text) from public;
grant execute on function public.list_drawings(uuid) to anon;
grant execute on function public.add_drawing(uuid, text, text, real, text, text) to anon;
commit;
