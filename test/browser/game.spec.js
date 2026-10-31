import {test,expect} from '@playwright/test';
import {SUPPORTED_LANGUAGES} from '../../js/language-options.js';
import {COLORS} from '../../js/engine.js';
import {colorName, translate, LANGUAGE_STORAGE_KEY} from '../../js/i18n.js';
const rgb = hex => `rgb(${[1,3,5].map(n=>parseInt(hex.slice(n,n+2),16)).join(', ')})`;

async function setup(page,{failure=false,delay=false,storageBlocked=false,audioBlocked=false}={}) {
  const errors=[],submissions=[], pending=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({storageBlocked,audioBlocked})=>{
    if(storageBlocked) Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked')}});
    if(audioBlocked) {
      window.AudioContext = class {constructor(){throw new Error('unavailable')}};
      window.webkitAudioContext = window.AudioContext;
    }
    window.__shares=[];
    Object.defineProperty(navigator,'share',{value:async data=>window.__shares.push(data.text)});
  },{storageBlocked,audioBlocked});
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='127.0.0.1') return route.continue();
    if(!url.pathname.includes('/rest/v1/rpc/')) return route.abort();
    const method=url.pathname.split('/').pop();
    if(method==='submit_score') {
      const body=route.request().postDataJSON();submissions.push(body);
      if(delay) await new Promise(r=>pending.push(r));
      if(failure) return route.fulfill({status:500,json:{message:'offline',code:'TEST'}});
      return route.fulfill({json:[{accepted:true,result_display_name:body.p_display_name,result_first_score:3000,result_best_score:body.p_score,result_play_count:3,is_first_play:false,is_new_best:true}]});
    }
    return route.fulfill({json:[{rank_no:1,display_name:'Player',best_score:2000,first_score:3000,play_count:3},{rank_no:1,display_name:'Peer',best_score:2000,first_score:3000,play_count:1}]});
  });
  await page.clock.install();
  await page.goto('./');
  return {errors,submissions,pending};
}

async function start(page,{saved=false}={}) {
  await page.locator('#start-button').click();
  if(!saved) {
    await translated(page, await page.locator('html').getAttribute('lang'));
    await noOverflow(page);
    await page.locator('#name-submit-button').click();
    await expect(page.locator('#name-error')).not.toBeEmpty();
    await page.locator('#player-name-input').fill('Player');
    await page.locator('#name-submit-button').click();
    await page.clock.runFor(600);
  }
  await expect(page.locator('#language-select')).toBeDisabled();
  await translated(page, await page.locator('html').getAttribute('lang'));
  await page.clock.runFor(3100);
  await expect(page.locator('#game-screen')).toBeVisible();
}
async function answerId(page,lang) {
  const type=await page.locator('#instruction-text').getAttribute('data-type');
  const word=await page.locator('#display-word').textContent();
  const ink=await page.locator('#display-word').evaluate(e=>getComputedStyle(e).color);
  return type==='meaning' ? COLORS.find(c=>colorName(c.id,lang,true)===word).id : COLORS.find(c=>rgb(c.hex)===ink).id;
}
async function complete(page,lang,{miss=true}={}) {
  const types=[];
  for(let n=0;n<20;n++) {
    const correct=await answerId(page,lang);
    types.push(await page.locator('#instruction-text').getAttribute('data-type'));
    if(n===0 && miss) {
      const wrong=COLORS.find(c=>c.id!==correct).id;
      const word=await page.locator('#display-word').textContent();
      await page.locator(`[data-color="${wrong}"]`).click();
      await expect(page.locator('#question-count')).toHaveText('1 / 20');
      await expect(page.locator('#display-word')).toHaveText(word);
    }
    await page.clock.runFor(100);
    await page.locator(`[data-color="${correct}"]`).click();
  }
  await expect(page.locator('#result-screen')).toBeVisible();
  expect(types.filter(t=>t==='meaning')).toHaveLength(10);
  expect(types.filter(t=>t==='color')).toHaveLength(10);
}
async function noOverflow(page) {
  if(await page.locator('#game-screen').isVisible()) {
    const separated=await page.evaluate(()=>document.getElementById('retire-button').getBoundingClientRect().top >= document.querySelector('.preferences').getBoundingClientRect().bottom);
    expect(separated, 'Retire must not overlap language/sound controls').toBe(true);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const overflowing=await page.locator('.screen-active button, .screen-active .display-word, .screen-active .instruction').evaluateAll(es=>es.filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.id||e.textContent));
  expect(overflowing).toEqual([]);
}
async function translated(page,lang) {
  const text = await page.locator('.screen-active').innerText();
  if(lang !== 'ja') expect(text).not.toMatch(/[\p{Script=Hiragana}\p{Script=Katakana}]/u);
  if(lang !== 'ja' && !lang.startsWith('zh')) expect(text).not.toMatch(/\p{Script=Han}/u);
  const visible=await page.locator('.screen-active [data-i18n]').evaluateAll(es=>es.map(e=>({key:e.dataset.i18n,text:e.textContent})));
  for(const {key,text} of visible) {
    const pattern=translate(key,{},lang).split(/\{\d+\}/g).map(v=>v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.+');
    expect(text).toMatch(new RegExp('^'+pattern+'$'));
    expect(text).not.toMatch(/\{\d+\}/);
  }
}

for(const {id:lang} of SUPPORTED_LANGUAGES) test(`${lang}: every screen, ink/meaning, integer score, share, narrow layout`,async({page})=>{
  const f=await setup(page);
  await page.setViewportSize({width:320,height:568});
  await expect(page.locator('#language-select option')).toHaveCount(15);
  await page.locator('#language-select').selectOption(lang);
  await expect(page.locator('html')).toHaveAttribute('lang',lang);
  await translated(page,lang);await noOverflow(page);
  await page.locator('#rules-button').click();
  await translated(page,lang);await noOverflow(page);
  await page.locator('#back-title-button').click();
  await page.locator('#share-button').click();
  await start(page);
  await translated(page,lang);
  for(const c of COLORS) await expect(page.locator(`[data-color="${c.id}"]`)).toHaveText(colorName(c.id,lang));
  const originalWord=await page.locator('#display-word').textContent();
  for (const c of COLORS) {
    await page.locator('#display-word').evaluate((el,word)=>{el.textContent=word},colorName(c.id,lang,true));
    await noOverflow(page);
  }
  await page.locator('#display-word').evaluate((el,word)=>{el.textContent=word},originalWord);
  await page.setViewportSize({width:667,height:375});
  await noOverflow(page);
  // A synthetic change cannot alter the active round either.
  await page.locator('#language-select').evaluate(el=>{el.value='en';el.dispatchEvent(new Event('change',{bubbles:true}))});
  await expect(page.locator('html')).toHaveAttribute('lang',lang);
  await complete(page,lang);
  await expect(page.locator('#ranking-status')).toHaveText(translate('ランキングに反映しました',{},lang));
  await translated(page,lang);await noOverflow(page);
  expect(f.submissions).toHaveLength(1);
  expect(f.submissions[0]).toMatchObject({p_game_slug:'iroate',p_client_version:'iroate-ranking-v1',p_display_name:'Player'});
  const best=await page.evaluate(()=>JSON.parse(localStorage.getItem('iroAteBestTime')));
  expect(best.missCount).toBe(1);
  expect(best.finalTime - best.clearTime).toBeCloseTo(5, 9);
  expect(f.submissions[0].p_score).toBe(Math.round(best.finalTime*100));
  await expect(page.locator('#miss-count')).toHaveText(translate('{0}回',{0:1},lang));
  await expect(page.locator('#ranking-list .ranking-rank')).toHaveText([translate('{0}位',{0:1},lang),translate('{0}位',{0:1},lang)]);
  await page.locator('#first-ranking-tab').click();
  await page.locator('#copy-result-button').click();
  expect(await page.evaluate(()=>window.__shares.every(s=>s.includes('https://chameleonjp-lab.github.io/iroate/')&&!s.includes('codeberg')))).toBe(true);
  // Result messages retranslate too; state is not inferred from displayed text.
  await page.locator('#language-select').selectOption(lang==='en'?'fr':'en');
  await page.locator('#retry-button').click();
  await page.clock.runFor(3100);
  await page.locator('#retire-button').click();
  await expect(page.locator('#ranking-summary')).toBeHidden();
  await page.locator('#copy-result-button').click();
  expect(f.submissions).toHaveLength(1);
  expect(f.errors).toEqual([]);
});

test('communication failure: error builder runs, results/retry survive; no real writes',async({page})=>{
  const f=await setup(page,{failure:true});
  await page.locator('#language-select').selectOption('en');
  await start(page);await complete(page,'en');
  await expect(page.locator('#copy-ranking-error-button')).toBeVisible();
  await expect(page.locator('#retry-button')).toBeEnabled();
  const diagnostic=await page.evaluate(()=>localStorage.getItem('iroAteRankingLastError'));
  expect(diagnostic).toContain('score_scale: 100');
  expect(diagnostic).not.toContain('Player');
  await page.locator('#retry-button').click();
  await expect(page.locator('#countdown-screen')).toBeVisible();
  expect(f.errors).toEqual([]);
});

test('storage/audio unavailable and unknown saved language do not block play',async({page})=>{
  const f=await setup(page,{storageBlocked:true,audioBlocked:true});
  await page.locator('#sound-toggle').click();
  await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed','true');
  await start(page);await complete(page,'en',{miss:false});
  await expect(page.locator('#best-message')).toHaveText('Your personal best could not be saved in this browser.');
  expect(f.errors).toEqual([]);
});

test('slow old ranking response cannot overwrite a new round; actions stay usable',async({page})=>{
  const f=await setup(page,{delay:true});
  await page.locator('#language-select').selectOption('en');
  await start(page);await complete(page,'en');
  await expect(page.locator('#retry-button')).toBeEnabled();
  await page.locator('#retry-button').click();
  await page.clock.runFor(3100);
  for(const resolve of f.pending) resolve();
  await expect(page.locator('#game-screen')).toBeVisible();
  expect(f.errors).toEqual([]);
});

test('manual language and sound settings persist; invalid saved value falls back',async({page})=>{
  await setup(page);
  await page.locator('#language-select').selectOption('tr');
  await page.locator('#sound-toggle').click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang','tr');
  await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed','true');
  await page.evaluate(key=>localStorage.setItem(key,'not-a-language'),LANGUAGE_STORAGE_KEY);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang','en');
});


test('SE wiring: one event per action, gesture unlock, finish sequence and immediate OFF',async({page})=>{
  const f=await setup(page);
  await page.locator('#language-select').selectOption('en');
  await page.evaluate(async()=>{
    const {SoundEffects}=await import('./js/sound-effects.js');
    const play=SoundEffects.prototype.play;
    window.__sounds=[];
    SoundEffects.prototype.play=function(event,options){
      const result=play.call(this,event,options);
      window.__sounds.push({event,result,running:this.context?.state,voices:this.activeSounds.size});
      window.__soundInstance=this;
      return result;
    };
  });
  await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed','false');
  await page.locator('#sound-toggle').click();
  await start(page);await complete(page,'en');
  const events=await page.evaluate(()=>window.__sounds);
  expect(events.filter(s=>s.event==='countdown')).toHaveLength(3);
  for(const event of ['start','wrong','clear','result','best']) expect(events.filter(s=>s.event===event)).toHaveLength(1);
  expect(events.filter(s=>s.event==='correct')).toHaveLength(20);
  expect(events.some(s=>s.event==='correct'&&s.result&&s.running==='running')).toBe(true);
  expect(events.every(s=>s.voices<=12)).toBe(true);
  await page.locator('#sound-toggle').click();
  expect(await page.evaluate(()=>window.__soundInstance.activeSounds.size)).toBe(0);
  await page.locator('#retry-button').click();await page.clock.runFor(3100);
  await page.locator('#retire-button').click();
  expect(await page.evaluate(()=>window.__sounds.filter(s=>s.event==='retire').length)).toBe(1);
  expect(f.errors).toEqual([]);
});
