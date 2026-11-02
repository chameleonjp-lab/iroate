import test from 'node:test';
import assert from 'node:assert/strict';
import { SoundEffects, SOUND_PREFERENCE_KEY, SOUND_EVENTS } from '../js/sound-effects.js';

function fixture({reject = false} = {}) {
  const values = new Map();
  const storage = {getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
  const param = {setValueAtTime(){},exponentialRampToValueAtTime(){}};
  const nodes = [];
  const context = {state:'suspended',currentTime:0,destination:{},
    async resume(){if(reject) throw Error('not allowed');this.state='running'},
    async suspend(){this.state='suspended'},
    createGain:()=>({gain:param,connect(){},disconnect(){}}),
    createOscillator(){const node={frequency:param,connect(){},disconnect(){},start(){},stop(){this.stopped=true},addEventListener(name,fn){this.end=fn}};nodes.push(node);return node;}
  };
  return {storage,values,context,nodes,sound:new SoundEffects({storage,contextFactory:()=>context})};
}

test('ON by default, waits for interaction to unlock; remembers OFF and stops immediately', async () => {
  const f = fixture();
  assert.equal(f.sound.enabled, true);
  assert.equal(f.sound.play('correct'), false);
  assert.equal(f.sound.context, null);
  await f.sound.unlock();
  assert.equal(f.context.state,'running');
  assert.equal(f.values.has(SOUND_PREFERENCE_KEY),false);
  assert.equal(f.sound.play('correct'),true);
  assert.ok(f.sound.activeSounds.size > 0);
  const pending = f.sound.setEnabled(false);
  assert.equal(f.sound.activeSounds.size,0);
  assert.ok(f.nodes.every(n=>n.stopped));
  await pending;
  assert.equal(new SoundEffects({storage:f.storage}).enabled,false);
});

test('saved OFF is respected without unlocking; missing, invalid or blocked preferences default to ON', async () => {
  for (const [saved,enabled] of [[null,true],['true',true],['false',false],['invalid',true]]) {
    let created=0;
    const sound=new SoundEffects({storage:{getItem:()=>saved},contextFactory(){created++;return null;}});
    assert.equal(sound.enabled,enabled,`saved=${saved}`);
    assert.equal(sound.context,null);
    if(!enabled) assert.equal(await sound.unlock(),false);
    assert.equal(created,0);
  }
  assert.equal(new SoundEffects({storage:null}).enabled,true);
  assert.equal(new SoundEffects({storage:{getItem(){throw Error('blocked')}}}).enabled,true);
});

test('all required events are short and rapid answers cannot accumulate voices', async () => {
  const f=fixture();await f.sound.setEnabled(true);
  assert.deepEqual(Object.keys(SOUND_EVENTS),['select','cancel','countdown','start','correct','wrong','clear','result','best','retire']);
  for (const event of Object.keys(SOUND_EVENTS)) {
    assert.equal(f.sound.play(event),true);
    assert.ok(f.sound.activeSounds.size <= 4);
    assert.ok(SOUND_EVENTS[event].every(([offset,,duration])=>offset+duration < 0.8));
  }
  for(let n=0;n<1000;n++) f.sound.play(n%2?'correct':'wrong');
  assert.ok(f.sound.activeSounds.size<=2);
  f.sound.play('clear');f.sound.play('result',{delay:0.28,append:true});f.sound.play('best',{delay:0.4,append:true});
  assert.ok(f.sound.activeSounds.size <= 12);
  for (const node of f.nodes) node.end?.();
  assert.equal(f.sound.activeSounds.size,0);
});

test('hidden tab, blocked Web Audio, throwing storage and rejected resume never throw', async () => {
  const f=fixture({reject:true});
  await f.sound.setEnabled(true);
  assert.equal(f.sound.play('start'),false);
  f.sound.handleVisibility(true);
  assert.equal(await f.sound.unlock(),false);
  const broken=new SoundEffects({storage:{getItem(){throw Error()},setItem(){throw Error()}},contextFactory(){throw Error()}});
  await broken.setEnabled(true);
  assert.equal(broken.play('start'),false);
  const ok=fixture();await ok.sound.setEnabled(true);ok.sound.play('clear');
  ok.sound.handleVisibility(true);
  assert.equal(ok.sound.activeSounds.size,0);
  assert.equal(ok.sound.play('correct'),false);
  ok.sound.handleVisibility(false);await ok.sound.unlock();
  assert.equal(ok.sound.play('correct'),true);
});

test('volume defaults to existing level, persists zero, and prevents unlocking at zero', async () => {
  const f=fixture();
  assert.equal(f.sound.volume,1);
  await f.sound.unlock();f.sound.play('correct');
  f.sound.setVolume(0);
  assert.equal(f.sound.activeSounds.size,0);
  assert.equal(f.sound.play('correct'),false);
  const restored=new SoundEffects({storage:f.storage,contextFactory(){throw Error('must not create')}});
  assert.equal(restored.volume,0);
  assert.equal(await restored.unlock(),false);
  restored.setVolume(0.4);
  assert.equal(new SoundEffects({storage:f.storage}).volume,0.4);
});

test('partial allocation and independent disconnect failures clean every node',async()=>{const f=fixture();await f.sound.unlock();let oscillatorClean=0,gainClean=0;f.context.createOscillator=()=>({frequency:{setValueAtTime(){}},connect(){},disconnect(){oscillatorClean++;throw Error('lost')},start(){},stop(){},addEventListener(){}});f.context.createGain=()=>({gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){gainClean++}});f.sound.play('select');f.sound.stopActiveSounds();assert.equal(gainClean,1);f.context.createGain=()=>{throw Error('allocation')};f.sound.play('select');assert.equal(oscillatorClean,2);assert.equal(f.sound.activeSounds.size,0)});

test('interrupted context clears old voices before resume even before statechange delivery',async()=>{const f=fixture();await f.sound.unlock();f.sound.play('clear');assert.ok(f.sound.activeSounds.size);f.context.state='interrupted';await f.sound.unlock();assert.equal(f.sound.activeSounds.size,0)});

test('transient master gain allocation failure retries setup before unlock reports success',async()=>{const f=fixture();let gains=0;const create=f.context.createGain;f.context.createGain=()=>{if(++gains===1)throw Error('temporary');return create()};assert.equal(await f.sound.unlock(),false);assert.equal(await f.sound.unlock(),true);assert.equal(gains,2);assert.ok(f.sound.masterGain);assert.equal(f.sound.play('select'),true)});
