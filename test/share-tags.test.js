import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {translate,SUPPORTED_LANGUAGES} from '../js/i18n.js';
const source=readFileSync(new URL('../js/game.js',import.meta.url),'utf8').match(/function buildShareText\(resultLines = \[\]\) \{[\s\S]*?\n\}/)[0];
const publicUrl='https://chameleonjp-lab.github.io/iroate/';
// Conservative X weighted-length check: URLs weigh 23; other text <=2/codepoint.
function weight(text){return [...text.replace(publicUrl,'x'.repeat(23))].reduce((n,c)=>n+(c.codePointAt(0)<=4351?1:2),0);}
for(const {id} of SUPPORTED_LANGUAGES)test(id+': home/clear/retire share has two exact hashtags and one official URL',()=>{
 const context=vm.createContext({t:(s,p)=>translate(s,p,id),TOTAL_QUESTIONS:20,PUBLIC_URL:publicUrl});vm.runInContext(source,context);
 for(const lines of [[],[translate('最終タイム：{0}',{0:'999999.99'},id),translate('ミス：{0}',{0:'9999'},id)],[translate('結果：リタイア',{},id)]]){
  const text=context.buildShareText(lines);assert.equal(text.split('#イロアテ').length-1,1);assert.equal(text.split('#ゲーム制作').length-1,1);assert.equal(text.split(publicUrl).length-1,1);assert.ok(text.endsWith(publicUrl));assert.ok(weight(text)<=280,id+' '+weight(text));for(const line of lines)assert.ok(text.includes(line));
 }
});
