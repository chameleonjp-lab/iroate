import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('guest migration enforces permissions, idempotency, game boundaries and preserves existing counts/scores',async()=>{
  const paths=await readdir('supabase/migrations').catch(()=>[]);
  const file=paths.find(p=>p.endsWith('_iroate_guest_play_count.sql'));
  assert.ok(file,'A migration for iroate guest counting is required.');
  const sql=await readFile('supabase/migrations/'+file,'utf8');
  const db=new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema private;
      create table public.games(game_slug text primary key,is_active boolean,submission_mode text);
      insert into public.games values('iroate',true,'shared'),('takkeu',true,'shared'),('other',true,'shared');
      create table private.game_play_sessions(start_id uuid);
      create table private.takkeu_guest_plays_v1(start_id uuid);
      insert into private.takkeu_guest_plays_v1 values(gen_random_uuid());
      create table private.named_counts(game_slug text,play_count integer);
      insert into private.named_counts values('iroate',7),('iroate',10),('takkeu',4),('other',9);
      create function private.get_game_player_counts_v1(p_game_slug text) returns table(play_count integer)
        language sql as $$select play_count from private.named_counts where game_slug=lower(btrim(p_game_slug))$$;
      create table public.game_scores(best_score integer,first_score integer,play_count integer);
      insert into public.game_scores values(2681,3000,10);
      create table public.score_runs(score integer);insert into public.score_runs values(2681);
    `);
    await db.exec(await readFile('test/fixtures/previous-play-stats.sql','utf8'));
    const beforeAcl=(await db.query("select proacl::text as acl from pg_proc where oid='public.get_game_play_stats(text)'::regprocedure")).rows;
    const before=await db.query('select * from public.game_scores');
    await db.exec(sql);
    assert.deepEqual((await db.query("select proacl::text as acl from pg_proc where oid='public.get_game_play_stats(text)'::regprocedure")).rows,beforeAcl);
    const stats=async slug=>(await db.query('select * from public.get_game_play_stats($1)',[slug])).rows[0];
    assert.deepEqual(await stats('iroate'),{total_play_count:17,player_count:2});
    assert.deepEqual(await stats('takkeu'),{total_play_count:5,player_count:1});
    assert.deepEqual(await stats('other'),{total_play_count:9,player_count:1});
    const id='20000000-0000-4000-8000-000000000001';
    const start=async(slug='iroate',version='iroate-ranking-v1',uuid=id)=>(await db.query('select public.start_iroate_guest_play_v1($1::uuid,$2,$3) as v',[uuid,slug,version])).rows[0].v;
    await db.exec('set role anon');
    const first=await start(),second=await start();
    assert.equal(first.accepted,true);assert.equal(second.duplicate,true);assert.equal(first.play_id,second.play_id);
    assert.equal((await start('takkeu')).accepted,false);
    assert.equal((await start('iroate','bad-version')).accepted,false);
    await assert.rejects(db.query('select * from private.iroate_guest_plays_v1'),/permission denied/);
    await db.exec('reset role');
    assert.deepEqual(await stats('iroate'),{total_play_count:18,player_count:2});
    assert.deepEqual(await stats('takkeu'),{total_play_count:5,player_count:1});
    assert.deepEqual(await stats('other'),{total_play_count:9,player_count:1});
    assert.deepEqual((await db.query('select * from public.game_scores')).rows,before.rows);
    assert.deepEqual((await db.query('select * from public.score_runs')).rows,[{score:2681}]);
    assert.equal((await db.query("select relrowsecurity as enabled from pg_class where oid='private.iroate_guest_plays_v1'::regclass")).rows[0].enabled,true);
    await db.exec("update public.games set is_active=false where game_slug='iroate'");
    assert.equal((await start('iroate','iroate-ranking-v1','20000000-0000-4000-8000-000000000002')).accepted,false);
  } finally {await db.close();}
});
