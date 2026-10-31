import test from 'node:test';
import assert from 'node:assert/strict';
import {buildXShareUrl} from '../js/x-share.js';

test('X intent preserves Unicode, newlines and URL characters as one text parameter',()=>{
  const text='イロアテ\n文字の「色」か「意味」を20問当てるタイムアタック！\nhttps://chameleonjp-lab.github.io/iroate/\n& # + % ? = 🎨';
  const url=new URL(buildXShareUrl(text));
  assert.equal(url.origin,'https://x.com');
  assert.equal(url.pathname,'/intent/tweet');
  assert.deepEqual([...url.searchParams],[['text',text]]);
});
