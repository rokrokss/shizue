import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actionResult,
  actionSignature,
  agentUrl,
  browserControlMarkSplitter,
  elementLabel,
  formatSnapshot,
  isChallengeFrame,
  looksCommitting,
  needsApproval,
  parseAgentReply,
  timesTried,
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

test('Questions, looks, points, tabs and site tools are read, and incomplete ones refused', () => {
  const action = (json) => parseAgentReply(json)?.action ?? null;
  assert.deepEqual(action('{"thought":"","action":"ask","text":" Which size? "}'), { kind: 'ask', text: 'Which size?' });
  assert.equal(action('{"thought":"","action":"ask","text":"  "}'), null);
  assert.deepEqual(action('{"thought":"","action":"look"}'), { kind: 'look' });
  assert.deepEqual(action('{"thought":"","action":"click_at","x":120.6,"y":"40"}'), { kind: 'click_at', x: 121, y: 40 });
  assert.equal(action('{"thought":"","action":"click_at","x":120}'), null);
  // Coordinates and a tab number belong only to their actions.
  assert.deepEqual(action('{"thought":"","action":"click","ref":2,"x":5,"y":5,"tab":2}'), { kind: 'click', ref: 2 });
  assert.deepEqual(action('{"thought":"","action":"open_tab","url":"example.com"}'), { kind: 'open_tab', url: 'https://example.com/' });
  assert.equal(action('{"thought":"","action":"open_tab","url":"javascript:alert(1)"}'), null);
  assert.deepEqual(action('{"thought":"","action":"switch_tab","tab":2}'), { kind: 'switch_tab', tab: 2 });
  assert.equal(action('{"thought":"","action":"switch_tab","tab":0}'), null);
  // A tool's input comes as a JSON string (the schema can't say "any object"), or as an object.
  assert.deepEqual(action('{"thought":"","action":"tool","name":"search_flights","input":"{\\"to\\":\\"ICN\\"}"}'), {
    kind: 'tool',
    name: 'search_flights',
    input: { to: 'ICN' },
  });
  assert.deepEqual(action('{"thought":"","action":{"type":"tool","name":"cart","input":{"id":3}}}'), { kind: 'tool', name: 'cart', input: { id: 3 } });
  assert.deepEqual(action('{"thought":"","action":"tool","name":"list"}'), { kind: 'tool', name: 'list', input: {} });
  assert.equal(action('{"thought":"","action":"tool","name":"list","input":"{not json"}'), null);
  assert.equal(action('{"thought":"","action":"tool","input":"{}"}'), null);
  // The user's own words are never the model's to send.
  assert.equal(action('{"thought":"","action":"steer","text":"go"}'), null);
});

test('A site tool waits for the go-ahead when the site says it has consequences, or its name sends or pays', () => {
  const tool = (name, flags = {}) => ({ name, description: '', schema: '{}', frameId: 0, ...flags });
  const run = (name) => ({ kind: 'tool', name, input: {} });
  assert.equal(needsApproval(run('search_flights'), undefined, false, tool('search_flights')), false);
  assert.equal(needsApproval(run('add_note'), undefined, false, tool('add_note', { consequential: true })), true);
  assert.equal(needsApproval(run('place_order'), undefined, false, tool('place_order')), true);
  assert.equal(needsApproval(run('delete-item'), undefined, false, tool('delete-item')), true);
  // A tool that only reads never waits, whatever it is called.
  assert.equal(needsApproval(run('order_status'), undefined, false, tool('order_status', { readOnly: true })), false);
  for (const kind of ['ask', 'look', 'switch_tab', 'steer']) {
    assert.equal(needsApproval({ kind }, undefined, true), false);
  }
  assert.equal(needsApproval({ kind: 'open_tab', url: 'https://example.com/' }, undefined, true), true);
});

test('The same action on a page that did not change counts as tried again; a changed page starts over', () => {
  const page = { url: 'https://example.com/', title: 'Shop', text: 'Items', elements: [{ ref: 1, tag: 'button', name: 'More' }], scroll: { y: 0, height: 900, viewport: 900 } };
  const click = { kind: 'click', ref: 1 };
  const tried = [actionSignature(click, page), actionSignature({ kind: 'scroll', direction: 'down' }, page), actionSignature(click, page)];
  assert.equal(timesTried(tried, actionSignature(click, page)), 2);
  assert.equal(timesTried(tried, actionSignature(click, { ...page, text: 'Items and more items' })), 0);
  assert.equal(timesTried(tried, actionSignature(click, { ...page, scroll: { ...page.scroll, y: 300 } })), 0);
  // Only the last few actions count.
  const old = [actionSignature(click, page), ...Array.from({ length: 6 }, (_, i) => actionSignature({ kind: 'wait', text: String(i) }, page))];
  assert.equal(timesTried(old, actionSignature(click, page)), 0);
});

test('The page the model reads lists its tabs and the site\'s tools, and new failures say what to do', () => {
  const text = formatSnapshot({
    url: 'https://example.com/',
    title: 'Shop',
    text: 'Items',
    elements: [],
    scroll: { y: 0, height: 900, viewport: 900 },
    tabs: [
      { number: 1, title: 'Shop', url: 'https://example.com/', current: true },
      { number: 2, title: 'Reviews', url: 'https://reviews.example.org/x', current: false },
    ],
    tools: [{ name: 'search', description: 'Searches\nthe shop', schema: '{"type":"object"}', readOnly: true, frameId: 0 }],
  });
  assert.match(text, /Your tabs: \(1\) example\.com — Shop \[this one\]; \(2\) reviews\.example\.org — Reviews/);
  assert.match(text, /- search \(only reads\): Searches the shop input schema: \{"type":"object"\}/);
  // One tab isn't listed.
  assert.doesNotMatch(formatSnapshot({ url: 'https://example.com/', title: '', text: '', elements: [], scroll: { y: 0, height: 1, viewport: 1 }, tabs: [{ number: 1, title: '', url: 'https://example.com/', current: true }] }), /Your tabs/);
  for (const error of ['not_visible', 'no_screenshot', 'no_tab', 'no_tool', 'repeated']) {
    assert.doesNotMatch(actionResult({ id: 'x', action: { kind: 'look' }, status: 'failed', error }), /Try another way/);
  }
});
