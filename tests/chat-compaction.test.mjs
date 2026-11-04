import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPACT_AT, KEEP_RECENT_MESSAGES, planCompaction } from '../src/lib/chatCompaction.ts';

// A thread of `n` messages, questions and answers in turn, each `size` tokens.
const thread = (n) =>
  Array.from({ length: n }, (_, i) => ({ role: i % 2 === 0 ? 'human' : 'ai', createdAt: 1000 + i }));
const tokens = (text) => text.length;

test('A chat that fits goes whole', () => {
  const history = thread(10);
  const plan = planCompaction(history, history.map(() => 100), 500, undefined, 10_000, tokens);
  assert.deepEqual(plan, { keepFrom: 0, summary: undefined, tokens: 1500 });
});

test('Past the threshold, all but the latest turns are folded, starting the rest at a question', () => {
  const history = thread(20);
  const plan = planCompaction(history, history.map(() => 100), 0, undefined, 2000 / COMPACT_AT - 1, tokens);
  assert.deepEqual(plan.fold, { from: 0, to: 20 - KEEP_RECENT_MESSAGES });
  assert.equal(history[plan.fold.to].role, 'human');

  // An odd cut moves back to the question before it.
  const odd = thread(21);
  const oddPlan = planCompaction(odd, odd.map(() => 100), 0, undefined, 1000, tokens);
  assert.equal(odd[oddPlan.fold.to].role, 'human');
  assert.ok(odd.length - oddPlan.fold.to >= KEEP_RECENT_MESSAGES);
});

test('A stored summary stands in for the turns it read, and the next fold continues after it', () => {
  const history = thread(30);
  const stored = { text: 'x'.repeat(50), until: history[13].createdAt, count: 14 };
  const fits = planCompaction(history, history.map(() => 10), 0, stored, 10_000, tokens);
  assert.deepEqual(fits, { keepFrom: 14, summary: stored.text, tokens: 50 + 16 * 10 });

  const full = planCompaction(history, history.map(() => 100), 0, stored, 1000, tokens);
  assert.equal(full.summary, stored.text);
  assert.deepEqual(full.fold, { from: 14, to: 30 - KEEP_RECENT_MESSAGES });
});

test('A summary of messages since deleted or retried is left out', () => {
  const history = thread(30);
  // The message it ended at is no longer the 14th.
  const stale = { text: 'old', until: 999, count: 14 };
  assert.equal(planCompaction(history, history.map(() => 10), 0, stale, 10_000, tokens).keepFrom, 0);
  // It covers the whole thread: the answer it read is being retried.
  const whole = { text: 'old', until: history[29].createdAt, count: 30 };
  assert.equal(planCompaction(history, history.map(() => 10), 0, whole, 10_000, tokens).keepFrom, 0);
});

test('A chat too short to fold is sent as it is, however large', () => {
  const history = thread(4);
  const plan = planCompaction(history, [50_000, 50_000, 50_000, 50_000], 0, undefined, 10_000, tokens);
  assert.equal(plan.fold, undefined);
  assert.equal(plan.keepFrom, 0);
});
