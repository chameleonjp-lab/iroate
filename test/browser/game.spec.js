import {test,expect} from '@playwright/test';
import {SUPPORTED_LANGUAGES} from '../../js/language-options.js';
import {COLORS} from '../../js/engine.js';
import {translate, LANGUAGE_STORAGE_KEY} from '../../js/i18n.js';
import {EXPECTED_COLOR_LABELS, expectedColorWord} from '../fixtures/color-names.js';
const rgb = hex => `rgb(${[1,3,5].map(n=>parseInt(hex.slice(n,n+2),16)).join(', ')})`;

async function setup(page,{failure=false,delay=false,storageBlocked=false,audioBlocked=false,rows=2,guestFailure=false,invalidAck=false,readFailure=false,namedRejected=false}={}) {
  const errors=[],submissions=[], pending=[],guestStarts=[],reads=[];
  const network={guestFailure};
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({storageBlocked,audioBlocked})=>{
    if(storageBlocked) Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked')}});
    if(audioBlocked) {
      window.AudioContext = class {constructor(){throw new Error('unavailable')}};
      window.webkitAudioContext = window.AudioContext;
    }
    window.__shares=[];
    window.__nativeShares=[];
    Object.defineProperty(navigator,'share',{value:async data=>window.__nativeShares.push(data.text)});
  },{storageBlocked,audioBlocked});
  // This also covers the first request of a newly opened popup; page.route
  // alone cannot intercept that request. No X request reaches the network.
  await page.context().route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin==='https://x.com'&&url.pathname==='/intent/tweet') {
      expect(route.request().method()).toBe('GET');
      const text=url.searchParams.get('text');
      await page.evaluate(value=>window.__shares.push(value),text);
      return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Mock X composer</title>'});
    }
    return route.abort();
  });
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='127.0.0.1') return route.continue();
    if(!url.pathname.includes('/rest/v1/rpc/')) return route.abort();
    const method=url.pathname.split('/').pop();
    if(method==='start_iroate_guest_play_v1') {
      const body=route.request().postDataJSON();guestStarts.push(body);
      if(network.guestFailure)return route.fulfill({status:503,json:{message:'offline'}});
      return route.fulfill({json:{accepted:!invalidAck,start_id:body.p_start_id,game_slug:'iroate',client_version:'iroate-ranking-v1',play_id:'30000000-0000-4000-8000-000000000001'}});
    }
    if(method==='submit_score') {
      const body=route.request().postDataJSON();submissions.push(body);
      if(delay) await new Promise(r=>pending.push(r));
      if(failure) return route.fulfill({status:500,json:{message:'offline',code:'TEST'}});
      return route.fulfill({json:[{accepted:!namedRejected,result_display_name:body.p_display_name,result_first_score:3000,result_best_score:body.p_score,result_play_count:3,is_first_play:false,is_new_best:true}]});
    }
    reads.push({method,...route.request().postDataJSON()});
    if(readFailure)return route.fulfill({status:500,json:{message:'ranking unavailable'}});
    return route.fulfill({json:Array.from({length:rows},(_,i)=>({rank_no:i<2?1:i+1,display_name:i===0?'Player':i===1?'Peer':`Player${i+1}`,best_score:2000+i,first_score:3000+i,play_count:3}))});
  });
  await page.clock.install();
  await page.goto('./');
  return {errors,submissions,pending,guestStarts,reads,network};
}

async function shareOnX(page,selector) {
  const link=page.locator(selector);
  await expect(link).toHaveAttribute('target','_blank');
  await expect(link).toHaveAttribute('rel',/noopener/);
  await expect(link).toHaveAttribute('rel',/noreferrer/);
  const opened=page.waitForEvent('popup');
  await link.click();
  const popup=await opened;
  await popup.waitForLoadState('domcontentloaded');
  const url=new URL(popup.url());
  expect(url.origin).toBe('https://x.com');
  expect(url.pathname).toBe('/intent/tweet');
  expect(url.searchParams.get('text')).toContain('https://chameleonjp-lab.github.io/iroate/');
  await popup.close();
  expect(await page.evaluate(()=>window.__nativeShares)).toEqual([]);
}

test('Japanese X share uses exact 20-question copy, black and white links, and result records',async({page})=>{
  const f=await setup(page);
  await page.locator('#language-select').selectOption('ja');
  const intro='イロアテ\n文字の「色」か「意味」を20問当てるタイムアタック！';
  for(const selector of ['#share-button','#copy-result-button']) {
    await expect(page.locator(selector)).toHaveText('Xでシェア');
    await expect(page.locator(selector)).toHaveCSS('background-color','rgb(0, 0, 0)');
    await expect(page.locator(selector)).toHaveCSS('color','rgb(255, 255, 255)');
  }
  await shareOnX(page,'#share-button');
  expect(await page.evaluate(()=>window.__shares.at(-1))).toBe(intro+'\nhttps://chameleonjp-lab.github.io/iroate/');
  await start(page);await complete(page,'ja');
  await expect(page.locator('#ranking-status')).toHaveText('ランキングに反映しました');
  // Context menus and middle-click use href without invoking a normal click.
  const readyText=new URL(await page.locator('#copy-result-button').getAttribute('href')).searchParams.get('text');
  expect(readyText).not.toContain('初回挑戦タイム：');
  expect(readyText).not.toContain('ベストタイム：');
  await shareOnX(page,'#copy-result-button');
  const result=await page.evaluate(()=>window.__shares.at(-1));
  expect(result.startsWith(intro+'\n')).toBe(true);
  expect(result).toContain('最終タイム：');
  expect(result.split('https://chameleonjp-lab.github.io/iroate/')).toHaveLength(2);
  expect(f.submissions).toHaveLength(1);expect(f.errors).toEqual([]);
});

async function start(page,{name='Player'}={}) {
  await page.locator('#player-name-input').fill(name);
  await translated(page, await page.locator('html').getAttribute('lang'));
  await noOverflow(page);
  await page.locator('#start-button').click();
  await expect(page.locator('#language-select')).toBeDisabled();
  await translated(page, await page.locator('html').getAttribute('lang'));
  await page.clock.runFor(3100);
  await expect(page.locator('#game-screen')).toBeVisible();
}
async function answerId(page,lang) {
  const type=await page.locator('#instruction-text').getAttribute('data-type');
  const word=await page.locator('#display-word').textContent();
  const ink=await page.locator('#display-word').evaluate(e=>getComputedStyle(e).color);
  return type==='meaning' ? COLORS.find(c=>expectedColorWord(c.id,lang)===word).id : COLORS.find(c=>rgb(c.hex)===ink).id;
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
  await shareOnX(page,'#share-button');
  await start(page);
  await translated(page,lang);
  for(const c of COLORS) await expect(page.locator(`[data-color="${c.id}"]`)).toHaveText(EXPECTED_COLOR_LABELS[lang][c.id]);
  const originalWord=await page.locator('#display-word').textContent();
  for (const c of COLORS) {
    await page.locator('#display-word').evaluate((el,word)=>{el.textContent=word},expectedColorWord(c.id,lang));
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
  await shareOnX(page,'#copy-result-button');
  expect(await page.evaluate(()=>window.__shares)).toHaveLength(2);
  expect(await page.evaluate(()=>window.__shares.every(s=>s.includes('https://chameleonjp-lab.github.io/iroate/')&&!s.includes('codeberg')))).toBe(true);
  // Result messages retranslate too; state is not inferred from displayed text.
  await page.locator('#language-select').selectOption(lang==='en'?'fr':'en');
  await page.locator('#retry-button').click();
  await page.clock.runFor(3100);
  await page.locator('#retire-button').click();
  await expect(page.locator('#ranking-summary')).toBeHidden();
  await shareOnX(page,'#copy-result-button');
  expect(f.submissions).toHaveLength(1);
  expect(f.errors).toEqual([]);
});

test('communication failure: error builder runs, results/retry survive; no real writes',async({page})=>{
  const f=await setup(page,{failure:true});
  await page.locator('#language-select').selectOption('en');
  await start(page);await complete(page,'en');
  await expect(page.locator('#copy-ranking-error-button')).toBeVisible();
  await expect(page.locator('#ranking-list li')).toHaveCount(2);
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
  await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed','true');
  await page.locator('#sound-toggle').click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang','tr');
  await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed','false');
  await page.locator('#sound-toggle').click();
  await page.reload();
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
  await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed','true');
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


test('optional-name home and detail-ranking link',async({page})=>{
  await setup(page);
  await expect(page.locator('#title-screen #player-name-input')).toBeVisible();
  await expect(page.locator('#other-games-link')).toHaveAttribute('href','https://chameleonjp-lab.github.io/chameleonjp_lab/ranking.html?game=iroate');
  await page.locator('#start-button').click();
  await expect(page.locator('#countdown-screen')).toBeVisible();
});


for(const {id:lang} of SUPPORTED_LANGUAGES) test(`${lang}: anonymous start/retire counted, top 30 and detail link`,async({page})=>{
  const f=await setup(page,{rows:40});
  await page.locator('#language-select').selectOption(lang);
  await start(page,{name:'   '});
  await expect.poll(()=>f.guestStarts.length).toBe(1);
  expect(f.guestStarts[0]).toMatchObject({p_game_slug:'iroate',p_client_version:'iroate-ranking-v1'});
  expect(Object.keys(f.guestStarts[0]).sort()).toEqual(['p_client_version','p_game_slug','p_start_id']);
  await page.locator('#retire-button').click();
  await expect(page.locator('#guest-count-status')).toHaveText(translate('プレイ回数を記録しました。',{},lang));
  await expect(page.locator('#ranking-list li')).toHaveCount(30);
  expect(f.reads.every(r=>r.p_limit===30&&r.p_game_slug==='iroate')).toBe(true);
  await expect(page.locator('#ranking-detail-link')).toHaveAttribute('href','https://chameleonjp-lab.github.io/chameleonjp_lab/ranking.html?game=iroate');
  await translated(page,lang);await noOverflow(page);
  expect(f.submissions).toHaveLength(0);
  await page.locator('#retry-button').click();await page.clock.runFor(3100);
  await expect.poll(()=>f.guestStarts.length).toBe(2);
  expect(f.guestStarts[0].p_start_id).not.toBe(f.guestStarts[1].p_start_id);
  expect(f.errors).toEqual([]);
});

test('anonymous clear never submits a score; clearing saved name opts out on later visits',async({page})=>{
  const f=await setup(page,{rows:40});
  await page.evaluate(()=>localStorage.setItem('iroAtePlayerName','Existing'));
  await page.reload();
  await expect(page.locator('#player-name-input')).toHaveValue('Existing');
  await start(page,{name:''});
  // A late edit of the hidden input does not enroll an anonymous round.
  await page.locator('#player-name-input').evaluate(el=>{el.value='LateName'});
  await complete(page,'en');
  await expect(page.locator('#ranking-list li')).toHaveCount(30);
  await expect(page.locator('#ranking-summary')).toBeHidden();
  expect(f.submissions).toHaveLength(0);expect(f.guestStarts).toHaveLength(1);
  expect(await page.evaluate(()=>localStorage.getItem('iroAtePlayerName'))).toBe('');
  await page.reload();await expect(page.locator('#player-name-input')).toHaveValue('');
});

test('anonymous count retries the same ID after offline failure while game and result stay usable',async({page})=>{
  const f=await setup(page,{guestFailure:true});
  await start(page,{name:''});
  await expect.poll(()=>f.guestStarts.length).toBe(1);
  await page.locator('#retire-button').click();
  await expect(page.locator('#guest-count-status')).toHaveText('The play count will be retried when the connection returns.');
  await expect(page.locator('#retry-button')).toBeEnabled();
  f.network.guestFailure=false;
  await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await expect(page.locator('#guest-count-status')).toHaveText('Play count recorded.');
  expect(f.guestStarts).toHaveLength(2);
  expect(f.guestStarts[0].p_start_id).toBe(f.guestStarts[1].p_start_id);
  expect(f.submissions).toHaveLength(0);expect(f.errors).toEqual([]);
});

test('unacknowledged anonymous count and ranking read failure do not block a completed game',async({page})=>{
  const f=await setup(page,{invalidAck:true,readFailure:true});
  await start(page,{name:''});await complete(page,'en');
  await expect(page.locator('#guest-count-status')).toHaveText('The play count could not be recorded.');
  await expect(page.locator('#ranking-read-status')).toHaveText('Could not load the leaderboard.');
  await expect(page.locator('#retry-button')).toBeEnabled();
  expect(f.submissions).toHaveLength(0);expect(f.errors).toEqual([]);
});


test('rejected named result stays rejected after language change and sharing',async({page})=>{
  const f=await setup(page,{namedRejected:true});
  await start(page);await complete(page,'en');
  await expect(page.locator('#copy-ranking-error-button')).toBeVisible();
  await expect(page.locator('#ranking-first-score')).toHaveText('--');
  await page.locator('#language-select').selectOption('fr');
  await expect(page.locator('#ranking-best-message')).toBeEmpty();
  await expect(page.locator('#ranking-first-score')).toHaveText('--');
  await shareOnX(page,'#copy-result-button');
  const share=await page.evaluate(()=>window.__shares.at(-1));
  expect(share).not.toContain('Temps du premier essai');
  expect(f.submissions).toHaveLength(1);expect(f.errors).toEqual([]);
});

test('mute as first gesture never initializes audio and zero volume survives reload',async({page})=>{
  await page.addInitScript(()=>{window.__audioCreated=0;window.AudioContext=class{constructor(){window.__audioCreated++;throw Error('test boundary')}};});
  await setup(page);
  await page.click('#sound-toggle');
  expect(await page.evaluate(()=>window.__audioCreated)).toBe(0);
  await page.locator('#sound-volume').fill('0');
  await page.reload();
  await expect(page.locator('#sound-volume')).toHaveValue('0');
  await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed','false');
  await page.click('#sound-toggle');
  expect(await page.evaluate(()=>window.__audioCreated)).toBe(0);
});

test('ranking retry reads records without submitting another play',async({page})=>{
  const f=await setup(page,{readFailure:true});
  await start(page,{name:''});await complete(page,'en');
  const count=f.reads.length;
  await page.click('#reload-ranking');
  await expect.poll(()=>f.reads.length).toBeGreaterThan(count);
  expect(f.submissions).toHaveLength(0);
});
