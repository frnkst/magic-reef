-- Run after party.sql. Existing drawings become medium; older clients keep working.
begin;

alter table public.fish add column if not exists size text not null default 'medium'
  check (size in ('small', 'medium', 'large'));

create or replace function public.list_sized_drawings(tank_token uuid)
returns table (id uuid, name text, aspect real, facing text, kind text, child text, size text)
language plpgsql security definer set search_path = ''
as $$
declare target_id uuid;
begin
  select t.id into target_id from public.tanks t where t.token = tank_token;
  if target_id is null then raise exception 'Aquarium not found. Check your link.'; end if;
  return query select f.id, f.name, f.aspect, f.facing, f.kind, f.child, f.size
    from public.fish f where f.tank_id = target_id order by f.created_at, f.id;
end;
$$;

create or replace function public.add_sized_drawing(
  tank_token uuid, fish_name text, fish_image text, fish_aspect real, fish_facing text,
  drawing_kind text, child_name text, drawing_size text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare new_id uuid;
begin
  if drawing_size is null or drawing_size not in ('small', 'medium', 'large') then
    raise exception 'Choose a small, medium, or large drawing.';
  end if;
  new_id := public.add_party_drawing(tank_token, fish_name, fish_image, fish_aspect, fish_facing, drawing_kind, child_name);
  update public.fish set size = drawing_size where id = new_id;
  return new_id;
end;
$$;

revoke all on function public.list_sized_drawings(uuid) from public;
grant execute on function public.list_sized_drawings(uuid) to anon, authenticated, service_role;
revoke all on function public.add_sized_drawing(uuid, text, text, real, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.add_sized_drawing(uuid, text, text, real, text, text, text, text)
  to service_role;

commit;
