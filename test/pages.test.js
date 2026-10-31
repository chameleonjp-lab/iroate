import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

test('Pages build excludes development files and stamps the source commit', async()=>{
  const sha='a'.repeat(40);
  const result=spawnSync(process.execPath,['scripts/build-pages.js'],{env:{...process.env,GITHUB_SHA:sha},encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const version=JSON.parse(await readFile('dist/version.json','utf8'));
  assert.equal(version.commit,sha);
  const html=await readFile('dist/index.html','utf8');
  assert.ok(html.includes(`content="${sha}"`));
  assert.ok(html.includes('https://chameleonjp-lab.github.io/iroate/'));
  const verify=spawnSync(process.execPath,['scripts/verify-pages.js'],{encoding:'utf8'});
  assert.equal(verify.status,0,verify.stderr);
});
