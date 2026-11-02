import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('fixed social preview metadata points to shipped 1200x630 PNG',()=>{
 const html=readFileSync('index.html','utf8'), url='https://chameleonjp-lab.github.io/iroate/assets/social-preview.png';
 assert.ok(html.includes(`property="og:image" content="${url}"`));
 assert.ok(html.includes(`name="twitter:image" content="${url}"`));
 assert.ok(html.includes('name="twitter:card" content="summary_large_image"'));
 const image=readFileSync('assets/social-preview.png');
 assert.equal(image.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 assert.equal(image.readUInt32BE(16),1200); assert.equal(image.readUInt32BE(20),630);
 assert.ok(readFileSync('scripts/build-pages.js','utf8').includes("'assets/social-preview.png'"));
});
