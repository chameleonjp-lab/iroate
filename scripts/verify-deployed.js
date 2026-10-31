// Read-only release check. Does not start a game or submit any score.
import assert from 'node:assert/strict';
const commit = process.argv[2];
assert.match(commit || '', /^[a-f0-9]{40}$/, 'Pass the expected full main commit SHA');
const base='https://chameleonjp-lab.github.io/iroate/';
const checked=new Set();
async function fetchText(url) {
  const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,200,url);
  return response.text();
}
const version=JSON.parse(await fetchText(base+'version.json'));
assert.equal(version.commit,commit);
assert.equal(version.canonical_url,base);
async function visit(url) {
  assert.ok(url.startsWith(base));
  if(checked.has(url))return;
  checked.add(url);
  const text=await fetchText(url);
  let refs=[];
  if(url===base) {
    assert.ok(text.includes(`name="chameleonjp-release" content="${commit}"`));
    assert.ok(text.includes(`rel="canonical" href="${base}"`));
    refs=[...text.matchAll(/(?:src|href)="(\.\/[^"?#]+)"/g)].map(m=>m[1]);
  } else if(url.endsWith('.js')&&!url.includes('/vendor/')) refs=[...text.matchAll(/(?:from\s*|import\s*)['"](\.\.?\/[^'"]+)['"]/g)].map(m=>m[1]);
  for(const ref of refs)await visit(new URL(ref,url).href);
}
await visit(base);
assert.ok(checked.size>=24);
console.log(`Verified ${checked.size} deployed assets; commit ${commit}. Browser play and iPhone Safari acceptance still required.`);
