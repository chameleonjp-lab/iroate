import {test, expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {EXPECTED_COLOR_LABELS, expectedColorWord} from '../fixtures/color-names.js';

// All four crossed cases, with independently specified correct IDs and ink.
const crossed = [
  {type:'meaning',wordColorId:'blue',textColorId:'orange',textColorHex:'#f57c00',correctColorId:'blue'},
  {type:'color',wordColorId:'blue',textColorId:'orange',textColorHex:'#f57c00',correctColorId:'orange'},
  {type:'meaning',wordColorId:'orange',textColorId:'blue',textColorHex:'#1e88e5',correctColorId:'orange'},
  {type:'color',wordColorId:'orange',textColorId:'blue',textColorHex:'#1e88e5',correctColorId:'blue'}
];
const remainingAnswers = ['red','green','yellow','purple','pink','black','red','green','yellow','purple','pink','black','red','green','yellow','purple'];
const hex = {red:'#e53935',blue:'#1e88e5',green:'#43a047',yellow:'#fdd835',purple:'#8e24aa',pink:'#ff80ab',black:'#212121',orange:'#f57c00'};
const questions = [...crossed, ...remainingAnswers.map((id,i) => ({
  type:i%2===0?'meaning':'color', wordColorId:i%2===0?id:'blue',
  textColorId:i%2===0?'blue':id, textColorHex:i%2===0?hex.blue:hex[id], correctColorId:id
}))];
const ink = {blue:'rgb(30, 136, 229)',orange:'rgb(245, 124, 0)'};
const originalEngine = await readFile(new URL('../../js/engine.js',import.meta.url),'utf8');
const engineFixture = originalEngine.replace('export function createGameQuestions() {', 'function originalCreateGameQuestions() {')
  + `\nexport function createGameQuestions() { return ${JSON.stringify(questions)}; }\n`;

for (const language of Object.keys(EXPECTED_COLOR_LABELS)) test(`${language}: blue/orange crossed meaning and ink, wrong choice, narrow layouts`,async({page}) => {
  const errors=[], submissions=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='127.0.0.1') {
      // Only question selection is fixed. Rendering, answer handling, timing,
      // storage, all constants and score conversion run the real application.
      if(url.pathname.endsWith('/js/engine.js')) return route.fulfill({contentType:'application/javascript',body:engineFixture});
      return route.continue();
    }
    const rpc=url.pathname.split('/rpc/')[1];
    if(rpc==='submit_score_once_shared_v1') {
      const body=route.request().postDataJSON();submissions.push(body);
      return route.fulfill({json:[{accepted:true,was_duplicate:false,result_normalized_name:body.p_display_name,result_display_name:body.p_display_name,result_first_score:body.p_score,result_best_score:body.p_score,result_play_count:1,is_first_play:true,is_new_best:true}]});
    }
    if(['get_first_try_ranking','get_best_score_ranking'].includes(rpc)) return route.fulfill({json:[]});
    return route.abort();
  });
  await page.clock.install();
  await page.setViewportSize({width:320,height:568});
  await page.goto('./');
  await page.locator('#language-select').selectOption(language);
  await page.locator('#player-name-input').fill('Color check');
  await page.locator('#start-button').click();
  await expect(page.locator('#language-select')).toBeDisabled();
  await page.clock.runFor(3100);
  await expect(page.locator('#game-screen')).toBeVisible();
  for(const [id,label] of Object.entries(EXPECTED_COLOR_LABELS[language])) {
    const button=page.locator(`[data-color="${id}"]`);
    await expect(button).toHaveText(label);
    await expect(button).toHaveAttribute('aria-label',new RegExp(label));
  }
  for(const id of ['blue','orange']) await expect(page.locator(`[data-color="${id}"]`)).toHaveCSS('background-color',ink[id]);
  await expect(page.locator('[data-color="orange"]')).toHaveCSS('color','rgb(31, 41, 51)');
  for(let index=0;index<questions.length;index++) {
    const question=questions[index];
    await expect(page.locator('#display-word')).toHaveText(expectedColorWord(question.wordColorId,language));
    await expect(page.locator('#instruction-text')).toHaveAttribute('data-type',question.type);
    if(index<4) {
      await page.setViewportSize(index%2===0?{width:320,height:568}:{width:667,height:375});
      await expect(page.locator('#display-word')).toHaveCSS('color',ink[question.textColorId]);
      expect(await page.locator('#display-word, .color-button').evaluateAll(elements=>elements.every(e=>e.scrollWidth<=e.clientWidth+1))).toBe(true);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.locator(`[data-color="${question.correctColorId==='blue'?'orange':'blue'}"]`).click();
      await expect(page.locator('#question-count')).toHaveText(`${index+1} / 20`);
      await expect(page.locator('#display-word')).toHaveText(expectedColorWord(question.wordColorId,language));
    }
    await page.clock.runFor(100);
    await page.locator(`[data-color="${question.correctColorId}"]`).click();
  }
  await expect(page.locator('#result-screen')).toBeVisible();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('iroAteBestTime')));
  expect(saved.missCount).toBe(4);
  expect(saved.finalTime-saved.clearTime).toBeCloseTo(20,9);
  await expect.poll(()=>submissions.length).toBe(1);
  expect(submissions[0].p_game_slug).toBe('iroate');
  // Compare the raw final total rounded once. Subtracting separately rounded
  // times can differ by one at binary floating-point half-centisecond edges.
  expect(submissions[0].p_score).toBe(Math.round(saved.finalTime*100));
  expect(errors).toEqual([]);
});
