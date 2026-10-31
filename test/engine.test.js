import test from 'node:test';
import assert from 'node:assert/strict';
import { COLORS, TOTAL_QUESTIONS, QUESTIONS_PER_TYPE, PENALTY_SECONDS, SCORE_SCALE, buildCandidateQuestionPool, createGameQuestions, scoreForSeconds } from '../js/engine.js';

test('all color pairs use internal IDs for meaning and ink answers', () => {
  assert.equal(COLORS.length, 8);
  assert.equal(new Set(COLORS.map(c => c.id)).size, 8);
  assert.deepEqual(COLORS.map(c => c.hex), ['#e53935','#1e88e5','#43a047','#fdd835','#8e24aa','#ff80ab','#212121','#f57c00']);
  for (const type of ['meaning', 'color']) {
    const pool = buildCandidateQuestionPool(type);
    assert.equal(pool.length, 50);
    for (const q of pool) {
      assert.notEqual(q.wordColorId, q.textColorId);
      assert.equal(q.correctColorId, type === 'meaning' ? q.wordColorId : q.textColorId);
      assert.equal(q.textColorHex, COLORS.find(c => c.id === q.textColorId).hex);
      assert.equal(q.displayText, undefined);
    }
  }
});

test('existing distribution and scoring constraints survive 200 rounds', () => {
  assert.equal(TOTAL_QUESTIONS, 20);
  assert.equal(QUESTIONS_PER_TYPE, 10);
  assert.equal(PENALTY_SECONDS, 5);
  assert.equal(SCORE_SCALE, 100);
  for (let i = 0; i < 200; i++) {
    const qs = createGameQuestions();
    assert.equal(qs.length, 20);
    assert.equal(qs.filter(q => q.type === 'meaning').length, 10);
    assert.equal(qs.filter(q => q.type === 'color').length, 10);
    for (let n = 3; n < qs.length; n++) assert.ok(!qs.slice(n-3,n+1).every(q => q.type === qs[n].type));
  }
  assert.equal(scoreForSeconds(26.81), 2681);
  assert.equal(scoreForSeconds(26.81 + 5), 3181);
});
