-- Run after schema.sql, ai.sql, and drawings.sql. Existing drawings are preserved.
begin;

alter table public.fish add column if not exists child text not null default ''
  check (char_length(child) <= 40);

create or replace function public.list_party_drawings(tank_token uuid)
returns table (id uuid, name text, aspect real, facing text, kind text, child text)
language plpgsql security definer set search_path = ''
as $$
declare target_id uuid;
begin
  select t.id into target_id from public.tanks t where t.token = tank_token;
  if target_id is null then raise exception 'Aquarium not found. Check your link.'; end if;
  return query select f.id, f.name, f.aspect, f.facing, f.kind, f.child
    from public.fish f where f.tank_id = target_id order by f.created_at, f.id;
end;
$$;

create or replace function public.add_party_drawing(
  tank_token uuid, fish_name text, fish_image text, fish_aspect real, fish_facing text,
  drawing_kind text, child_name text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare new_id uuid;
begin
  if child_name is null or char_length(trim(child_name)) > 40 then
    raise exception 'Use a child name of at most 40 characters.';
  end if;
  new_id := public.add_drawing(tank_token, fish_name, fish_image, fish_aspect, fish_facing, drawing_kind);
  update public.fish set child = trim(child_name) where id = new_id;
  return new_id;
end;
$$;

revoke all on function public.list_party_drawings(uuid) from public;
grant execute on function public.list_party_drawings(uuid) to anon, authenticated, service_role;
grant execute on function public.list_drawings(uuid), public.list_fish(uuid),
  public.get_fish_image(uuid, uuid) to authenticated, service_role;

-- Close every old anonymous write path, including the legacy fish-only RPC.
revoke all on function public.create_tank(), public.add_fish(uuid, text, text, real, text),
  public.add_drawing(uuid, text, text, real, text, text),
  public.claim_fish_analysis(uuid), public.add_party_drawing(uuid, text, text, real, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_tank(), public.add_fish(uuid, text, text, real, text),
  public.add_drawing(uuid, text, text, real, text, text),
  public.claim_fish_analysis(uuid), public.add_party_drawing(uuid, text, text, real, text, text, text)
  to service_role;

commit;
