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
