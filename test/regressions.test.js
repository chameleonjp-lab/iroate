import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {scoreForSeconds} from '../js/engine.js';
const source=await readFile(new URL('../js/game.js',import.meta.url),'utf8');

test('last answer time is captured before expensive audio work', async()=>{
  const functions=source.slice(source.indexOf('function handleAnswer('),source.indexOf('function retireGame('));
  let now=1000,score=null;
  const context=vm.createContext({
    isAnswerLocked:false,isGameActive:true,currentIndex:19,TOTAL_QUESTIONS:20,
    currentQuestions:Array.from({length:20},()=>({correctColorId:'red'})),
    missCount:0,penaltySeconds:0,PENALTY_SECONDS:5,startTime:0,finishedTime:0,
    latestResultScore:null,resultState:null,
    performance:{now:()=>now},getElapsedSeconds:()=>now/1000,
    soundEffects:{play(){now+=25;}}, // Artificially expensive synchronous audio.
    flashWrong(){},stopTimer(){},renderQuestion(){},getBestTime:()=>null,
    saveBestTime(){},scoreForSeconds,updateBestTimeDisplay(){},resetRankingUi(){},
    showScreen(){},renderResult(){},async syncScoreAndRankings(value){score=value;}
  });
  vm.runInContext(functions+';handleAnswer("red");',context);
  assert.equal(score,100,'Exactly 1.00 second was elapsed at the final input; audio must not change it.');
});

test('ranking error handler executes and never forwards server message, hint, details or arbitrary codes',()=>{
  const helper=source.slice(source.indexOf('function buildRankingErrorText('),source.indexOf('async function syncScoreAndRankings('));
  const context=vm.createContext({t:x=>x,GAME_SLUG:'iroate',CLIENT_VERSION:'iroate-ranking-v1',SCORE_SCALE:100,PUBLIC_URL:'https://chameleonjp-lab.github.io/iroate/'});
  const render=vm.runInContext(helper+';buildRankingErrorText;',context);
  const text=render({message:'PRIVATEPLAYER',details:'PRIVATEPLAYER',hint:'PRIVATEPLAYER',code:'PRIVATEPLAYER'});
  assert.ok(text.includes('score_scale: 100'));
  assert.ok(text.includes('public_url: https://chameleonjp-lab.github.io/iroate/'));
  assert.ok(!text.includes('PRIVATEPLAYER'));
});

test('rejected named receipt never becomes a submitted result for later language/share rendering',async()=>{
  const functions=source.slice(source.indexOf('function onScoreQueueChange('),source.indexOf('async function syncScoreAndRankings('));
  const context=vm.createContext({scorePlay:{id:'one'},currentScreen:'result',latestRankingResult:null,
    document:{getElementById:()=>({})},rankingStatus:{},copyRankingErrorButton:{},lastRankingErrorText:'',
    setTranslatedText(){},renderRankingSummary(){},buildRankingErrorText:()=>'',localStorage:{setItem(){}}
  });
  vm.runInContext(functions+';onScoreQueueChange({id:"one",state:"rejected"},null);',context);
  assert.equal(context.latestRankingResult,null);
});

test('guest count ACK requires strict acceptance and matching identifiers before dropping pending entry',async()=>{
  const functions=source.slice(source.indexOf('async function sendGuestStart('),source.indexOf('function renderGuestCountStatus('));
  const startId='40000000-0000-4000-8000-000000000001';
  const valid={accepted:true,start_id:startId,game_slug:'iroate',client_version:'iroate-ranking-v1',play_id:'40000000-0000-4000-8000-000000000002'};
  const context=vm.createContext({reply:null,GAME_SLUG:'iroate',CLIENT_VERSION:'iroate-ranking-v1',getSupabaseClient(){return {}},async rankingRpc(){return {data:context.reply,error:null}}});
  const send=vm.runInContext(functions+';sendGuestStart;',context);
  for(const change of [{accepted:false},{accepted:'true'},{accepted:'false'},{start_id:'other'},{game_slug:'takkeu'},{client_version:'wrong'},{play_id:'------------------------------------'}]) {
    context.reply={...valid,...change};
    await assert.rejects(send(startId));
  }
  context.reply=valid;await assert.doesNotReject(send(startId));
});

test('unpersisted receipt is never described as saved/sent and retry stays available',()=>{const functions=source.slice(source.indexOf('function onScoreQueueChange('),source.indexOf('async function syncScoreAndRankings('));const retry={},status={};const context=vm.createContext({scorePlay:{id:'one'},currentScreen:'result',latestRankingResult:null,document:{getElementById:()=>retry},rankingStatus:status,copyRankingErrorButton:{},lastRankingErrorText:'',setTranslatedText(el,key){el.text=key},renderRankingSummary(){},buildRankingErrorText:()=>'',localStorage:{setItem(){}}});vm.runInContext(functions+';onScoreQueueChange({id:"one",state:"pending",persisted:false},null);',context);assert.equal(status.text,'結果をこのブラウザに保存できません。画面を閉じずに再試行してください。');assert.equal(retry.hidden,false);});

test('leaderboard rows require valid rank/name/integer score, never a false empty success',()=>{const start=source.indexOf('function validateRankingRows(');assert.ok(start>=0);const end=source.indexOf('\nlet rankingRequestId',start);const validate=vm.runInNewContext(source.slice(start,end)+';validateRankingRows');for(const rows of [{},[null],[{rank_no:1,display_name:'A',best_score:'bad'}],[{rank_no:0,display_name:'A',best_score:4}]])assert.throws(()=>validate(rows,'best_score'));const rows=[{rank_no:1,display_name:'A',best_score:-5},{rank_no:1,display_name:'B',best_score:5}];assert.equal(validate(rows,'best_score'),rows)});

test('result restoration validates time, misses, score, language and best display without mutating raw',()=>{const start=source.indexOf('function validResultPresentation(');assert.ok(start>=0);const fn=vm.runInNewContext(source.slice(start,source.indexOf('\n// Restore only',start))+';validResultPresentation',{scoreForSeconds,PENALTY_SECONDS:5,SUPPORTED_LANGUAGES:[{id:'en'}]});const item={payload:{p_score:600},presentation:{finishedTime:1,penaltySeconds:5,missCount:1,roundLanguage:'en',resultState:{retired:false,isNewBest:false,storageFailed:false,oldBest:{finalTime:4}}}};assert.equal(fn(item),true);for(const patch of [{finishedTime:-1},{penaltySeconds:4},{missCount:'1'},{roundLanguage:'xx'},{resultState:{retired:true}},{resultState:{retired:false,isNewBest:false,storageFailed:false,oldBest:{finalTime:'bad'}}}]){const bad=structuredClone(item);Object.assign(bad.presentation,patch);const raw=JSON.stringify(bad);assert.equal(fn(bad),false);assert.equal(JSON.stringify(bad),raw)}item.payload.p_score=599;assert.equal(fn(item),false)});

test('Safari IME keyCode229 cannot start a round when isComposing is false',()=>{let starts=0,handler;vm.runInNewContext(source.slice(source.indexOf("playerNameInput.addEventListener('keydown'"),source.indexOf('bestRankingTab.addEventListener')),{playerNameInput:{addEventListener(n,f){handler=f}},beginStartFlow(){starts++}});handler({key:'Enter',keyCode:229,isComposing:false,preventDefault(){}});assert.equal(starts,0);handler({key:'Enter',keyCode:13,isComposing:false,preventDefault(){}});assert.equal(starts,1)});

test('best storage readback mismatch cannot claim successful save',()=>{const fn=vm.runInNewContext(source.slice(source.indexOf('function saveBestTime('),source.indexOf('function updateBestTimeDisplay('))+';saveBestTime',{BEST_TIME_STORAGE_KEY:'best',localStorage:{setItem(){},getItem(){return 'old'}}});assert.equal(fn({finalTime:2}),false)});

test('restored best-update claim must agree with save status and the previous best',()=>{const start=source.indexOf('function validResultPresentation(');const fn=vm.runInNewContext(source.slice(start,source.indexOf('\n// Restore only',start))+';validResultPresentation',{scoreForSeconds,PENALTY_SECONDS:5,SUPPORTED_LANGUAGES:[{id:'en'}]});const item={payload:{p_score:600},presentation:{finishedTime:1,penaltySeconds:5,missCount:1,roundLanguage:'en',resultState:{retired:false,isNewBest:true,storageFailed:true,oldBest:null}}};assert.equal(fn(item),false);item.presentation.resultState={retired:false,isNewBest:true,storageFailed:false,oldBest:{finalTime:5}};assert.equal(fn(item),false);item.presentation.resultState={retired:false,isNewBest:false,storageFailed:true,oldBest:null};assert.equal(fn(item),true)});
