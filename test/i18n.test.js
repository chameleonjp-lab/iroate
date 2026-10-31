import test from 'node:test';
import assert from 'node:assert/strict';
import { SUPPORTED_LANGUAGES, languageFromLocale } from '../js/language-options.js';
import { TRANSLATIONS, COLOR_NAMES } from '../js/translations.js';
import { createI18n, translate, LANGUAGE_STORAGE_KEY, colorName } from '../js/i18n.js';
import { COLORS, buildCandidateQuestionPool, scoreForSeconds } from '../js/engine.js';

test('15 complete dictionaries, eight distinct color names, same meaning/ink answers', () => {
  assert.deepEqual(SUPPORTED_LANGUAGES.map(l => l.id), ['ja','en','es','pt-BR','zh-Hans','fr','de','ko','ru','it','zh-Hant','id','tr','vi','th']);
  for (const { id } of SUPPORTED_LANGUAGES) {
    assert.deepEqual(Object.keys(TRANSLATIONS[id]).sort(), Object.keys(TRANSLATIONS.ja).sort());
    assert.equal(new Set(Object.values(COLOR_NAMES[id])).size, 8);
    assert.deepEqual(Object.keys(COLOR_NAMES[id]), COLORS.map(c => c.id));
    for (const [source, message] of Object.entries(TRANSLATIONS[id])) {
      assert.equal(typeof message, 'string');
      assert.ok(message.length > 0, `${id}: ${source}`);
      assert.deepEqual([...message.matchAll(/\{\d+\}/g)].map(m=>m[0]).sort(), [...source.matchAll(/\{\d+\}/g)].map(m=>m[0]).sort(), `${id}: ${source}`);
      if (id !== 'ja' && !id.startsWith('zh')) assert.ok(!/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(message), `${id}: ${message}`);
    }
    for (const type of ['meaning','color']) for (const q of buildCandidateQuestionPool(type)) {
      assert.ok(colorName(q.wordColorId, id));
      assert.equal(colorName(q.correctColorId, id), colorName(type === 'meaning' ? q.wordColorId : q.textColorId, id));
    }
    assert.equal(scoreForSeconds(31.81), 3181);
  }
});

test('saved language wins; locale detection matches Sainome; unknown values are safe', () => {
  const data = new Map();
  const storage = {getItem:k=>data.get(k), setItem:(k,v)=>data.set(k,v)};
  const i18n = createI18n({storage, navigatorObject:{languages:['xx','zh-Hant-TW'],language:'ja'}});
  assert.equal(i18n.getLanguage(), 'zh-Hant');
  i18n.setLanguage('de');
  assert.equal(data.get(LANGUAGE_STORAGE_KEY), 'de');
  assert.equal(createI18n({storage,navigatorObject:{language:'ja'}}).getLanguage(), 'de');
  i18n.setLanguage('__proto__');
  assert.equal(i18n.getLanguage(), 'de');
  assert.equal(languageFromLocale('zh_HK'), 'zh-Hant');
  assert.equal(languageFromLocale('zh-Hans-TW'), 'zh-Hans');
  assert.equal(languageFromLocale('pt-PT'), 'pt-BR');
  assert.equal(createI18n({storage:null,navigatorObject:{language:'zz'}}).getLanguage(), 'en');
  assert.equal(createI18n({storage:null,navigatorObject:{}}).getLanguage(), 'ja');
  const broken = {getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}};
  const safe = createI18n({storage:broken,navigatorObject:{language:'en'}});
  safe.setLanguage('fr');
  assert.equal(safe.getLanguage(), 'fr');
  assert.equal(translate('unknown {0}', {0:3}, 'xx'), 'unknown 3');
  assert.equal(translate('unknown', {}, '__proto__'), 'unknown');
  assert.ok(colorName('red','xx'));
});
