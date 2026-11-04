import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actionResult,
  agentUrl,
  elementLabel,
  formatSnapshot,
  looksCommitting,
  needsApproval,
  parseAgentReply,
} from '../src/lib/browserAgent.ts';

test('A reply is read flat or nested, fenced or not, and bad ones are refused', () => {
  assert.deepEqual(parseAgentReply('{"thought":"검색창에 입력","action":"type","ref":3,"text":"shoes","submit":true}'), {
    thought: '검색창에 입력',
    action: { kind: 'type', ref: 3, text: 'shoes', submit: true },
    sensitive: false,
  });
  assert.deepEqual(parseAgentReply('```json\n{"thought":"","action":{"type":"click","ref":"7"},"sensitive":true}\n```'), {
    thought: '',
    action: { kind: 'click', ref: 7 },
    sensitive: true,
  });
  assert.deepEqual(parseAgentReply('{"thought":"x","action":"scroll"}').action, { kind: 'scroll', direction: 'down' });
  assert.equal(parseAgentReply('{"thought":"x","action":"navigate","url":"example.com/a"}').action.url, 'https://example.com/a');
  assert.equal(parseAgentReply('{"thought":"done","action":"finish","text":"  끝났습니다 "}').action.text, '끝났습니다');
  // A click needs its element, typing its text, and an address must be the web's.
  assert.equal(parseAgentReply('{"action":"click"}'), null);
  assert.equal(parseAgentReply('{"action":"type","ref":2}'), null);
  assert.equal(parseAgentReply('{"action":"navigate","url":"javascript:alert(1)"}'), null);
  assert.equal(parseAgentReply('{"action":"fly"}'), null);
  assert.equal(parseAgentReply('I will click the button.'), null);
});

test('Only web addresses open', () => {
  assert.equal(agentUrl('https://a.com/x?y=1'), 'https://a.com/x?y=1');
  assert.equal(agentUrl('news.ycombinator.com'), 'https://news.ycombinator.com/');
  assert.equal(agentUrl('file:///etc/passwd'), null);
  assert.equal(agentUrl('chrome://settings'), null);
  assert.equal(agentUrl(''), null);
});

test('Buttons that send, delete or pay read as committing, in several languages, but not words inside words', () => {
  for (const label of ['Send', 'Place order', 'Delete repository', 'Buy now', '보내기', '결제하기', '삭제', '購入する', '提交', 'Отправить', 'Löschen', 'Pagar']) {
    assert.equal(looksCommitting(label), true, label);
  }
  for (const label of ['Search', 'Next page', 'Facebook', 'Orders', 'Sender name', 'Settings', '검색', '다음', 'Sort by price']) {
    assert.equal(looksCommitting(label), false, label);
  }
});

test('An action waits for approval when it commits, the model says so, or it submits outside a search box', () => {
  const send = { ref: 1, tag: 'button', name: 'Send' };
  const next = { ref: 2, tag: 'a', name: 'Next' };
  const search = { ref: 3, tag: 'input', name: 'Search', search: true };
  const message = { ref: 4, tag: 'textarea', name: 'Message' };
  assert.equal(needsApproval({ kind: 'click', ref: 1 }, send, false), true);
  assert.equal(needsApproval({ kind: 'click', ref: 2 }, next, false), false);
  assert.equal(needsApproval({ kind: 'click', ref: 2 }, next, true), true);
  assert.equal(needsApproval({ kind: 'type', ref: 3, text: 'x', submit: true }, search, false), false);
  assert.equal(needsApproval({ kind: 'type', ref: 4, text: 'hi', submit: true }, message, false), true);
  assert.equal(needsApproval({ kind: 'type', ref: 4, text: 'hi' }, message, false), false);
  // Looking around never waits.
  assert.equal(needsApproval({ kind: 'scroll', direction: 'down' }, undefined, true), false);
  assert.equal(needsApproval({ kind: 'finish', text: '' }, undefined, true), false);
});

test('The page reads as its place, text and numbered controls; secrets are flagged, not shown', () => {
  const text = formatSnapshot({
    url: 'https://shop.test/cart',
    title: 'Cart',
    text: 'Your cart\n2 items',
    scroll: { y: 0, height: 2400, viewport: 800 },
    elements: [
      { ref: 1, tag: 'button', name: 'Checkout' },
      { ref: 2, tag: 'input', type: 'password', name: 'Password', secret: true },
      { ref: 3, tag: 'select', name: 'Size', value: 'M', options: ['S', 'M', 'L'] },
      { ref: 4, tag: 'a', name: 'Help', href: '/help', below: true },
    ],
  });
  assert.match(text, /URL: https:\/\/shop\.test\/cart/);
  assert.match(text, /Scroll: 0% down, more below/);
  assert.match(text, /\[1\] button "Checkout"/);
  assert.match(text, /\[2\] input type=password "Password" \(sensitive field: never type here\)/);
  assert.match(text, /\[3\] select "Size" value="M" options: "S", "M", "L"/);
  assert.match(text, /Elements further down:\n\[4\] a "Help" → \/help/);
  assert.equal(elementLabel({ ref: 9, tag: 'button', name: '' , role: 'button' }), 'button');
});

test('The model hears what happened, and a declined action is not to be tried again', () => {
  assert.equal(actionResult({ id: 'a', action: { kind: 'click', ref: 1 }, status: 'done' }), 'Result: done.');
  assert.match(actionResult({ id: 'a', action: { kind: 'click', ref: 1 }, status: 'denied' }), /declined.*Do not try it again/);
  assert.match(actionResult({ id: 'a', action: { kind: 'type', ref: 1, text: 'x' }, status: 'failed', error: 'secret_field' }), /Never type/);
});
