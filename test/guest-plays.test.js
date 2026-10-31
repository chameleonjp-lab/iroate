import test from 'node:test';
import assert from 'node:assert/strict';
import {createGuestPlayCounter, GUEST_PENDING_PREFIX} from '../js/guest-plays.js';
const ids=['10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003'];
function storage() {
  const map=new Map();
  return {map,get length(){return map.size},key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
}

test('guest starts carry only UUIDs, survive a lost ACK/reload and count once',async()=>{
  const saved=storage(), accepted=new Set(), statuses=[];let first=true;
  const send=async id=>{accepted.add(id);if(first){first=false;throw Error('ACK lost')}};
  const counter=createGuestPlayCounter({storage:saved,send,uuid:()=>ids[0],onStatus:(...v)=>statuses.push(v)});
  assert.equal(counter.record(),ids[0]);
  await counter.retry();
  assert.equal(accepted.size,1);
  const row=JSON.parse(saved.getItem(GUEST_PENDING_PREFIX+ids[0]));
  assert.deepEqual(row,{startId:ids[0]});
  const reloaded=createGuestPlayCounter({storage:saved,send});
  await reloaded.retry();
  assert.equal(accepted.size,1);
  assert.equal(saved.length,0);
  assert.ok(statuses.some(([,status])=>status==='pending'));
});

test('new starts during an in-flight request are drained; separate tab rows are merged',async()=>{
  const saved=storage(),calls=[];let unlock;
  const gate=new Promise(r=>{unlock=r});let n=0;
  const counter=createGuestPlayCounter({storage:saved,uuid:()=>ids[n++],send:async id=>{calls.push(id);if(id===ids[0])await gate}});
  counter.record();counter.record();
  saved.setItem(GUEST_PENDING_PREFIX+ids[2],JSON.stringify({startId:ids[2]}));
  unlock();await counter.retry();await counter.retry();
  assert.deepEqual(new Set(calls),new Set(ids));
  assert.equal(saved.length,0);
});

test('storage refusal does not block starts; permanent failures do not spin',async()=>{
  let calls=0;
  const counter=createGuestPlayCounter({storage:{getItem(){throw Error()},setItem(){throw Error()},get length(){throw Error()}},uuid:()=>ids[0],send:async()=>{calls++;throw Object.assign(Error(),{retryable:false})}});
  counter.record();await counter.retry();await counter.retry();
  assert.equal(calls,1);
});

test('unavailable secure UUID generation cannot interrupt game start',()=>{
  const counter=createGuestPlayCounter({storage:null,uuid(){throw Error('crypto unavailable')},send:async()=>{assert.fail('No request without a secure ID')}});
  assert.doesNotThrow(()=>assert.equal(counter.record(),null));
});
