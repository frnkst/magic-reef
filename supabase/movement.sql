-- Run after sizes.sql. Old clients and existing drawings retain their behavior.
begin;

alter table public.fish add column if not exists movement text not null default 'swim'
  check (movement in ('swim', 'walk') and (movement <> 'walk' or kind = 'fish'));

create or replace function public.list_reef_drawings(tank_token uuid)
returns table (id uuid, name text, aspect real, facing text, kind text, child text, size text, movement text)
language plpgsql security definer set search_path = ''
as $$
declare target_id uuid;
begin
  select t.id into target_id from public.tanks t where t.token = tank_token;
  if target_id is null then raise exception 'Aquarium not found. Check your link.'; end if;
  return query select f.id, f.name, f.aspect, f.facing, f.kind, f.child, f.size, f.movement
    from public.fish f where f.tank_id = target_id order by f.created_at, f.id;
end;
$$;

create or replace function public.add_reef_drawing(
  tank_token uuid, fish_name text, fish_image text, fish_aspect real, fish_facing text,
  drawing_kind text, child_name text, drawing_size text, drawing_movement text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare new_id uuid;
begin
  if drawing_movement is null or drawing_movement not in ('swim', 'walk')
    or (drawing_movement = 'walk' and drawing_kind <> 'fish') then
    raise exception 'Choose a valid drawing movement.';
  end if;
  new_id := public.add_sized_drawing(tank_token, fish_name, fish_image, fish_aspect, fish_facing, drawing_kind, child_name, drawing_size);
  update public.fish set movement = drawing_movement where id = new_id;
  return new_id;
end;
$$;

revoke all on function public.list_reef_drawings(uuid) from public;
grant execute on function public.list_reef_drawings(uuid) to anon, authenticated, service_role;
revoke all on function public.add_reef_drawing(uuid, text, text, real, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.add_reef_drawing(uuid, text, text, real, text, text, text, text, text)
  to service_role;

commit;
