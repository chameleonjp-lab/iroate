const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(new URL('../js/score-queue.js', `file://${__filename}`), 'utf8');
const sandbox = { module: { exports: {} }, Date, Map, Set, JSON };
vm.runInNewContext(source, sandbox);
const { createScoreQueue } = sandbox.module.exports;
const ID = '10000000-0000-4000-8000-000000000001';
function storage() { const m = new Map(); return {get length(){return m.size}, key:i=>[...m.keys()][i],getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)}; }
function ack(overrides={}) { return [{accepted:true,result_normalized_name:'Alice',result_display_name:'Alice',result_first_score:100,result_best_score:100,result_play_count:1,is_first_play:false,is_new_best:false,was_duplicate:false,...overrides}]; }
for (const scoreOrder of ['asc','desc']) {
  const bad = [
    ['first overflow',{result_first_score:2147483648}], ['first underflow',{result_first_score:-2147483649}],
    ['best overflow',{result_best_score:2147483648}], ['best underflow',{result_best_score:-2147483649}],
    ['count overflow',{result_play_count:2147483648}], ['wrong direction',{result_best_score:scoreOrder==='asc'?101:99}]
  ];
  for (const [label, overrides] of bad) test(`${scoreOrder}: ${label} stays pending across reload and retries the same play`, async()=>{
    const disk=storage(), calls=[]; let successes=0;
    const options={gameSlug:'iroate',scoreOrder,storage:disk,uuid:()=>ID,onChange:(_item,receipt)=>{if(receipt)successes++;}};
    const q=createScoreQueue({...options,send:async p=>{calls.push(p);return ack(overrides)}});
    q.enqueue(q.capture('Alice','v1'),100); await q.drain();
    assert.equal(q.list().length,1);assert.equal(q.list()[0].state,'pending');assert.equal(successes,0);
    const restored=createScoreQueue({...options,send:async p=>{calls.push(p);return ack({was_duplicate:true})}});
    await restored.drain(); assert.equal(restored.list().length,0);assert.equal(successes,1);assert.deepEqual(calls[1],calls[0]);
  });
  test(`${scoreOrder}: signed historical first and zero remain valid`,async()=>{
    for(const first of [-2147483648,-1,0,2147483647]) {
      const q=createScoreQueue({gameSlug:'iroate',scoreOrder,storage:storage(),uuid:()=>ID,send:async()=>ack({result_first_score:first,result_best_score:scoreOrder==='asc'?Math.min(first,100):Math.max(first,100),result_play_count:2147483647})});
      q.enqueue(q.capture('Alice','v1'),100);await q.drain();assert.equal(q.list().length,0);
    }
  });
}
test('iroate supplies its confirmed ascending order at the runtime queue call',()=>{
  const game=fs.readFileSync(new URL('../js/game.js',`file://${__filename}`),'utf8');
  assert.match(game,/createScoreQueue\(\{\s*gameSlug: GAME_SLUG,\s*scoreOrder: 'asc'/);
});
