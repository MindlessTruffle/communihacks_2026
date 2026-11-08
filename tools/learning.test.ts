import { test } from 'node:test';
import assert from 'node:assert/strict';
import { improvements, savedReflection, cleanChat, type LearningEvent, type RunNotes } from '../src/game/learning.ts';
const event = (id: string, kind: LearningEvent['kind']): LearningEvent => ({ id, kind, day: 1, concept: 'budgeting', text: 'Check your coins.', tip: 'Check before you buy.' });
const run = (id: string, events: LearningEvent[]): RunNotes => ({ id, events, day: 1, started: '', ended: false, chats: [] });
test('improvement needs real scored evidence and sufficient examples', () => {
  assert.deepEqual(improvements([run('one', [event('a', 'good')])]), []);
  const earlier = run('old', [event('a', 'practice'), event('b', 'practice')]);
  const later = run('new', [event('c', 'good'), event('d', 'good'), event('n', 'note')]);
  assert.equal(improvements([later, earlier]).length, 1);
  assert.ok(improvements([later, earlier])[0].detail.includes('Now: 2 of 2'));
  assert.deepEqual(improvements([earlier, later]), []);
});
test('saved notes remain useful without AI and practice answers are authored', () => {
  const reflection = savedReflection(run('test', [event('a', 'good'), event('b', 'practice')]));
  assert.equal(reflection.good.length, 1); assert.equal(reflection.practice.length, 1);
  assert.equal(reflection.tests[0].answer, 0);
  assert.ok(reflection.memory.includes('Check your coins.'));
  assert.equal(savedReflection(run('empty', [])).tests.length, 0);
});
test('conversation snippets are bounded and redact keys and emails', () => {
  assert.equal(cleanChat('sk-testsecret me@example.com'), '[key removed] [email removed]');
  assert.equal(cleanChat('a'.repeat(500)).length, 320);
});
