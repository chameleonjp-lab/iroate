-- MANUAL ONLY. Run after PR #1 is merged by the owner, the tested release is
-- live at https://chameleonjp-lab.github.io/iroate/, and its SHA is verified.
-- Never embed this script or privileged credentials in public JS or Actions.
-- Snapshot before values separately before running; this changes only 2 columns.
begin;
select game_slug, game_url, share_text, score_order, score_unit,
       score_scale, score_decimals, submission_mode
from public.games where game_slug = 'iroate';

do $$
declare
  before_row public.games%rowtype;
  changed integer;
  old_url constant text := 'https://chameleonjp.codeberg.page/iroate/';
  new_url constant text := 'https://chameleonjp-lab.github.io/iroate/';
begin
  select * into strict before_row from public.games
  where game_slug = 'iroate' for update;
  if before_row.game_url is distinct from old_url
     or before_row.share_text is null
     or (length(before_row.share_text) - length(replace(before_row.share_text, old_url, ''))) / length(old_url) <> 1
     or before_row.score_order is distinct from 'asc'
     or before_row.score_unit is distinct from '秒'
     or before_row.score_scale is distinct from 100
     or before_row.score_decimals is distinct from 2
     or before_row.submission_mode is distinct from 'shared'
  then raise exception 'Unexpected iroate registration; stop and inspect before values';
  end if;

  update public.games
  set game_url = replace(game_url, old_url, new_url),
      share_text = replace(share_text, old_url, new_url)
  where game_slug = 'iroate' and game_url = old_url
    and share_text = before_row.share_text;
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'Expected exactly one URL update, got %', changed; end if;
  if not exists (
    select 1 from public.games g where g.game_slug = 'iroate'
      and g.game_url = new_url
      and g.share_text = replace(before_row.share_text, old_url, new_url)
      and (to_jsonb(g) - 'game_url' - 'share_text') =
          (to_jsonb(before_row) - 'game_url' - 'share_text')
  ) then raise exception 'Unexpected changes outside the two URL fields'; end if;
end $$;

select game_slug, game_url, share_text, score_order, score_unit,
       score_scale, score_decimals, submission_mode
from public.games where game_slug = 'iroate';
commit;
-- This script never touches game_scores, score_runs or another game row.
