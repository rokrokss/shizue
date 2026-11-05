import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actionResult,
  agentUrl,
  browserControlMarkSplitter,
  elementLabel,
  formatSnapshot,
  isChallengeFrame,
  looksCommitting,
  needsApproval,
  parseAgentReply,
  withFrames,
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

const snapshotOf = (url, text, elements) => ({ url, title: '', text, elements, scroll: { y: 0, height: 800, viewport: 800 } });

test("A frame's elements are numbered after the page's and keep their frame; a CAPTCHA's frame is only noted", () => {
  const page = snapshotOf('https://shop.test/checkout', 'Checkout', [
    { ref: 1, tag: 'button', name: 'Back' },
    { ref: 2, tag: 'a', name: 'Help', below: true },
  ]);
  const merged = withFrames(page, [
    { frameId: 7, snapshot: snapshotOf('https://pay.test/form', 'Card details', [
      { ref: 1, tag: 'input', type: 'text', name: 'Card number', secret: true },
      { ref: 2, tag: 'button', name: 'Pay $20' },
    ]) },
    { frameId: 8, snapshot: snapshotOf('data:text/html,<p>Inline note</p>', 'Inline note', []) },
    { frameId: 9, snapshot: snapshotOf('https://www.google.com/recaptcha/api2/anchor?k=x', '', [{ ref: 1, tag: 'span', role: 'checkbox', name: "I'm not a robot" }]) },
    { frameId: 11, snapshot: snapshotOf('https://ads.test/slot', '  ', []) },
  ]);
  assert.deepEqual(merged.elements.slice(2), [
    { ref: 3, tag: 'input', type: 'text', name: 'Card number', secret: true, frameId: 7, frameRef: 1 },
    { ref: 4, tag: 'button', name: 'Pay $20', frameId: 7, frameRef: 2 },
  ]);
  assert.deepEqual(merged.frames, [
    { frameId: 7, url: 'https://pay.test/form', text: 'Card details' },
    { frameId: 8, url: 'data:text/html,<p>Inline note</p>', text: 'Inline note' },
  ]);
  assert.equal(merged.challenge, true);
  // A page without frames reads as it did.
  assert.deepEqual(withFrames(page, []), page);

  const text = formatSnapshot(merged);
  assert.match(text, /Elements on screen:\n\[1\] button "Back"\n\nElements further down:\n\[2\] a "Help"\n\nIn a frame from pay\.test:\nCard details\n\[3\] input type=text "Card number" \(sensitive field: never type here\)\n\[4\] button "Pay \$20"\n\nIn a frame:\nInline note\n/);
  assert.match(text, /A CAPTCHA is on this page, in a frame: only the user can solve it\.$/);
  assert.doesNotMatch(text, /not a robot/);
});

test('CAPTCHA frames are known by their address', () => {
  for (const url of [
    'https://www.google.com/recaptcha/api2/anchor?ar=1',
    'https://www.recaptcha.net/recaptcha/enterprise/bframe',
    'https://newassets.hcaptcha.com/captcha/v1/abc/static/hcaptcha.html',
    'https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/turnstile/if/ov2/av0/rcv0/0/abc',
    'https://client-api.arkoselabs.com/fc/gc/',
  ]) {
    assert.equal(isChallengeFrame(url), true, url);
  }
  for (const url of ['https://www.google.com/maps/embed?pb=1', 'https://notgoogle.com/recaptcha/x', 'https://pay.test/form', 'about:blank', '']) {
    assert.equal(isChallengeFrame(url), false, url);
  }
});

test('The model hears what happened, and a declined action is not to be tried again', () => {
  assert.equal(actionResult({ id: 'a', action: { kind: 'click', ref: 1 }, status: 'done' }), 'Result: done.');
  assert.match(actionResult({ id: 'a', action: { kind: 'click', ref: 1 }, status: 'denied' }), /declined.*Do not try it again/);
  assert.match(actionResult({ id: 'a', action: { kind: 'type', ref: 1, text: 'x' }, status: 'failed', error: 'secret_field' }), /Never type/);
});

// The answer as the panel gets it, and how many times the mark was seen.
const splitStream = (chunks) => {
  const splitter = browserControlMarkSplitter();
  let text = '';
  let marks = 0;
  for (const chunk of chunks) {
    const part = splitter.push(chunk);
    text += part.text;
    if (part.marked) marks += 1;
  }
  return { text: text + splitter.flush(), marks };
};

test('The browser control mark comes off an answer, even split across chunks', () => {
  assert.deepEqual(splitStream(['[[brow', 'ser-con', 'trol]]', '\n', '브라우저 조작을 켜면 할 수 있어요.']), {
    text: '브라우저 조작을 켜면 할 수 있어요.',
    marks: 1,
  });
  assert.deepEqual(splitStream(['', '  [[browser-control]]\nI can do it.', ' Turn it on.']), {
    text: 'I can do it. Turn it on.',
    marks: 1,
  });
});

test('An answer without the mark streams as it is, held back only while it could be one', () => {
  const splitter = browserControlMarkSplitter();
  assert.deepEqual(splitter.push('Hello'), { text: 'Hello', marked: false });
  assert.deepEqual(splitter.push(' [[browser-control]]'), { text: ' [[browser-control]]', marked: false });
  assert.deepEqual(splitStream(['[', 'link](https://a.test)']), { text: '[link](https://a.test)', marks: 0 });
  assert.deepEqual(splitStream(['[[bro']), { text: '[[bro', marks: 0 });
});
