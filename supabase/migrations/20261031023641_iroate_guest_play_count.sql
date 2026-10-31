-- Refuse to overwrite a concurrently changed shared aggregation function.
do $guard$
begin
  if (select md5(regexp_replace(prosrc, '\s+', '', 'g')) from pg_catalog.pg_proc
      where oid = 'public.get_game_play_stats(text)'::regprocedure)
      is distinct from 'd52054dd8f16b550cd6a68bbcd2de425' then
    raise exception 'get_game_play_stats changed; review its current definition before applying';
  end if;
end;
$guard$;

-- Count-only anonymous starts. Existing named scores and registrations stay intact.
create table private.iroate_guest_plays_v1 (
  start_id uuid primary key,
  play_id uuid not null unique default pg_catalog.gen_random_uuid(),
  client_version text not null check (client_version = 'iroate-ranking-v1'),
  started_at timestamptz not null default pg_catalog.clock_timestamp()
);
create index iroate_guest_plays_v1_started_at_idx on private.iroate_guest_plays_v1 (started_at);
alter table private.iroate_guest_plays_v1 enable row level security;
revoke all on table private.iroate_guest_plays_v1 from public, anon, authenticated;

-- Intentionally public, append-only, count-only endpoint. Authentication is not
-- required for guest play. No user names, scores or other game rows are accepted.
create function public.start_iroate_guest_play_v1(p_start_id uuid, p_game_slug text, p_client_version text)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_existing private.iroate_guest_plays_v1%rowtype;
  v_play_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_start_id is null or p_game_slug is distinct from 'iroate'
     or p_client_version is distinct from 'iroate-ranking-v1' then
    return pg_catalog.jsonb_build_object('accepted', false, 'reason', 'invalid_input');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_start_id::text, 0::bigint));
  select * into v_existing from private.iroate_guest_plays_v1 where start_id = p_start_id for update;
  if found then
    return pg_catalog.jsonb_build_object('accepted', true, 'duplicate', true,
      'start_id', p_start_id, 'play_id', v_existing.play_id,
      'game_slug', 'iroate', 'client_version', v_existing.client_version);
  end if;
  if exists (select 1 from private.game_play_sessions where start_id = p_start_id) then
    return pg_catalog.jsonb_build_object('accepted', false, 'reason', 'start_id_conflict');
  end if;
  perform 1 from public.games where game_slug = 'iroate' and is_active is true and submission_mode = 'shared' for share;
  if not found then
    return pg_catalog.jsonb_build_object('accepted', false, 'reason', 'game_not_available');
  end if;
  -- Coarse flood guard, not proof of a unique person or a genuine game.
  if (select count(*) from private.iroate_guest_plays_v1 where started_at >= v_now - interval '1 minute') >= 10000 then
    return pg_catalog.jsonb_build_object('accepted', false, 'reason', 'play_rate_limited');
  end if;
  insert into private.iroate_guest_plays_v1 (start_id, client_version, started_at)
    values (p_start_id, p_client_version, v_now) returning play_id into v_play_id;
  return pg_catalog.jsonb_build_object('accepted', true, 'duplicate', false,
    'start_id', p_start_id, 'play_id', v_play_id, 'game_slug', 'iroate', 'client_version', p_client_version);
end;
$function$;
revoke all on function public.start_iroate_guest_play_v1(uuid, text, text) from public, anon, authenticated;
grant execute on function public.start_iroate_guest_play_v1(uuid, text, text) to anon, authenticated, service_role;

-- Keep the existing named-player aggregation and Takkeu branch unchanged.
-- Only Iroate receives its isolated anonymous start count; player_count remains named.
create or replace function public.get_game_play_stats(p_game_slug text)
returns table(total_play_count bigint, player_count bigint)
language sql stable security definer set search_path = ''
as $function$
  select named.total_play_count + case
    when pg_catalog.lower(pg_catalog.btrim(coalesce(p_game_slug, ''))) = 'takkeu'
      then (select count(*) from private.takkeu_guest_plays_v1)
    when pg_catalog.lower(pg_catalog.btrim(coalesce(p_game_slug, ''))) = 'iroate'
      then (select count(*) from private.iroate_guest_plays_v1) else 0::bigint end,
    named.player_count
  from (
    select coalesce(sum(pc.play_count), 0)::bigint as total_play_count, count(*)::bigint as player_count
    from private.get_game_player_counts_v1(p_game_slug) as pc
  ) as named;
$function$;
