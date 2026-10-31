import assert from 'node:assert/strict';
import {readdir,readFile,stat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
const root=resolve('dist');
const version=JSON.parse(await readFile(root+'/version.json','utf8'));
assert.match(version.commit,/^[a-f0-9]{40}$/);
assert.equal(version.canonical_url,'https://chameleonjp-lab.github.io/iroate/');
const html=await readFile(root+'/index.html','utf8');
assert.ok(html.includes(`name="chameleonjp-release" content="${version.commit}"`));
assert.ok(html.includes(`rel="canonical" href="${version.canonical_url}"`));
const expected=['.nojekyll','index.html','js','styles.css','vendor','version.json'];
assert.deepEqual((await readdir(root)).sort(),expected.sort());
const visited=new Set();
async function check(path) {
  assert.ok(path.startsWith(root+'/'),'Asset leaves deploy directory');
  if(visited.has(path)) return;
  visited.add(path);
  const info=await stat(path);assert.ok(info.isFile(),path);
  const text=await readFile(path,'utf8');
  assert.ok(!text.includes('https://chameleonjp.codeberg.page/iroate/'),path);
  let refs=[];
  if(path.endsWith('.html')) refs=[...text.matchAll(/(?:src|href)="(\.\/[^"?#]+)"/g)].map(m=>m[1]);
  if(path.endsWith('.js') && !path.includes('/vendor/')) refs=[...text.matchAll(/(?:from\s*|import\s*)['"](\.\.?\/[^'"]+)['"]/g)].map(m=>m[1]);
  for(const ref of refs) await check(resolve(dirname(path),ref));
}
await check(root+'/index.html');
for(const lang of ['ja','en','es','pt-BR','zh-Hans','fr','de','ko','ru','it','zh-Hant','id','tr','vi','th']) assert.ok(visited.has(root+`/js/locales/${lang}.js`),lang);
console.log(`Verified ${visited.size} linked assets including all 15 dictionaries; commit ${version.commit}`);
