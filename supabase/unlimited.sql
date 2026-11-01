-- Run after movement.sql. Remove usage caps, not owner permissions or input validation.
begin;

create or replace function public.claim_fish_analysis(tank_token uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.tanks where token = tank_token) then
    raise exception 'Aquarium not found. Scan its QR code again.';
  end if;
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
  select t.id into target_id from public.tanks t where t.token = tank_token;
  if target_id is null then raise exception 'Aquarium not found. Check your link.'; end if;
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

create or replace function public.add_fish(
  tank_token uuid, fish_name text, fish_image text, fish_aspect real, fish_facing text
)
returns uuid
language sql security definer set search_path = ''
as $$
  select public.add_drawing(tank_token, fish_name, fish_image, fish_aspect, fish_facing, 'fish');
$$;

revoke all on function public.claim_fish_analysis(uuid),
  public.add_drawing(uuid,text,text,real,text,text), public.add_fish(uuid,text,text,real,text)
  from public, anon, authenticated;
grant execute on function public.claim_fish_analysis(uuid),
  public.add_drawing(uuid,text,text,real,text,text), public.add_fish(uuid,text,text,real,text)
  to service_role;

commit;
