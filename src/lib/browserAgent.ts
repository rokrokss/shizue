// The browser agent (services/background/browserAgentHandler.ts): the chat model works the user's
// tab one action at a time. Each turn it reads the page (browserAgentPage.ts) as its visible text
// and numbered elements, and answers with one action as JSON. An action that sends, deletes, pays
// or can't be undone waits for the user's go-ahead in the panel; a password or card field is
// never typed in. Pure, for the background, the panel and the tests.

export type AgentActionKind = 'click' | 'type' | 'select' | 'scroll' | 'navigate' | 'back' | 'wait' | 'finish';

export type AgentAction = {
  kind: AgentActionKind;
  ref?: number;
  // What to type, the option to pick, or the answer to the user (finish).
  text?: string;
  url?: string;
  direction?: 'up' | 'down';
  // Press Enter after typing.
  submit?: boolean;
};

export type AgentReply = { thought: string; action: AgentAction; sensitive: boolean };

export type PageElement = {
  ref: number;
  tag: string;
  role?: string;
  name: string;
  type?: string;
  value?: string;
  // A dropdown's choices.
  options?: string[];
  href?: string;
  checked?: boolean;
  disabled?: boolean;
  // A search box: what is typed and submitted there only searches.
  search?: boolean;
  // A password, card number or one-time code field.
  secret?: boolean;
  // Below the part of the page on screen.
  below?: boolean;
};

export type PageSnapshot = {
  url: string;
  title: string;
  text: string;
  elements: PageElement[];
  scroll: { y: number; height: number; viewport: number };
};

export type AgentStepStatus = 'running' | 'done' | 'failed' | 'awaiting' | 'denied';

export type AgentStepError =
  | 'not_found'
  | 'secret_field'
  | 'not_select'
  | 'no_option'
  | 'bad_url'
  | 'unreachable'
  | 'failed';

// One action as the panel shows it.
export type AgentStep = {
  id: string;
  action: AgentAction;
  // The element acted on, as the page names it.
  target?: string;
  thought?: string;
  status: AgentStepStatus;
  // It waits, or waited, for the user's go-ahead.
  approval?: boolean;
  error?: AgentStepError;
};

export type AgentOutcome = 'finished' | 'stopped' | 'max_steps' | 'unavailable' | 'failed';

// A browser agent answer's record, kept with the message.
export type AgentRun = { host?: string; steps: AgentStep[]; outcome?: AgentOutcome };

// What the agent's pill on the page says, in the panel's language.
export type AgentLabels = { working: string; waiting: string; stop: string };

export const BROWSER_AGENT_MAX_STEPS = 25;
const MAX_ELEMENTS = 160;
const MAX_NAME = 80;

const KINDS: AgentActionKind[] = ['click', 'type', 'select', 'scroll', 'navigate', 'back', 'wait', 'finish'];

// A web address as the model wrote it, made whole; anything but http(s) is refused.
export const agentUrl = (value: string): string | null => {
  const text = value.trim();
  if (!text) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
};

// The model's JSON, fenced or not, with its action flat or nested; null when it isn't one.
export const parseAgentReply = (answer: string): AgentReply | null => {
  const json = answer.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const nested = parsed.action && typeof parsed.action === 'object' ? (parsed.action as Record<string, unknown>) : null;
  const field = (name: string) => (nested && name in nested ? nested[name] : parsed[name]);
  const kind = String(nested ? nested.type ?? nested.kind ?? nested.action : parsed.action ?? '').toLowerCase();
  if (!KINDS.includes(kind as AgentActionKind)) return null;
  const action: AgentAction = { kind: kind as AgentActionKind };
  const ref = Number(field('ref'));
  if (Number.isInteger(ref) && ref >= 0) action.ref = ref;
  const text = field('text');
  if (typeof text === 'string') action.text = text;
  const url = field('url');
  if (typeof url === 'string') action.url = url;
  const direction = field('direction');
  action.direction = direction === 'up' ? 'up' : 'down';
  if (field('submit') === true) action.submit = true;

  if ((kind === 'click' || kind === 'type' || kind === 'select') && action.ref === undefined) return null;
  if ((kind === 'type' || kind === 'select') && action.text === undefined) return null;
  if (kind === 'navigate') {
    const whole = agentUrl(action.url ?? action.text ?? '');
    if (!whole) return null;
    action.url = whole;
  }
  if (kind === 'finish') action.text = (action.text ?? '').trim();
  if (kind !== 'scroll') delete action.direction;
  const thought = typeof parsed.thought === 'string' ? parsed.thought.trim() : '';
  return { thought, action, sensitive: parsed.sensitive === true || field('sensitive') === true };
};

// Words of buttons that send, delete, pay or commit, in the languages Shizue speaks. Latin and
// Cyrillic words stand alone; Korean, Japanese, Chinese and Thai ones may be part of a word.
const COMMIT_WORDS = new RegExp(
  `(?<![\\p{L}\\p{N}])(${[
    'send',
    'submit',
    'delete',
    'remove',
    'pay',
    'pay now',
    'purchase',
    'buy',
    'buy now',
    'order',
    'place order',
    'checkout',
    'check out',
    'confirm',
    'post',
    'publish',
    'tweet',
    'reply',
    'transfer',
    'subscribe',
    'unsubscribe',
    'book now',
    'reserve',
    'donate',
    'discard',
    'erase',
    'trash',
    'deactivate',
    'sign up',
    'enviar',
    'eliminar',
    'borrar',
    'comprar',
    'pagar',
    'publicar',
    'confirmar',
    'envoyer',
    'supprimer',
    'acheter',
    'payer',
    'commander',
    'publier',
    'confirmer',
    'senden',
    'löschen',
    'kaufen',
    'bezahlen',
    'bestellen',
    'veröffentlichen',
    'bestätigen',
    'invia',
    'elimina',
    'acquista',
    'paga',
    'conferma',
    'отправить',
    'удалить',
    'купить',
    'оплатить',
    'заказать',
    'опубликовать',
    'подтвердить',
    'gönder',
    'sil',
    'satın al',
    'öde',
    'gửi',
    'xóa',
    'mua',
    'thanh toán',
  ].join('|')})(?![\\p{L}\\p{N}])|보내|전송|제출|삭제|지우기|제거|결제|구매|구입|주문|송금|이체|게시|등록|올리기|탈퇴|해지|예약|신청|후원|기부|확인|送信|削除|購入|注文|支払|決済|投稿|確定|予約|发送|發送|提交|删除|刪除|购买|購買|支付|付款|下单|下單|发布|發布|确认|確認|ส่ง|ลบ|ซื้อ|ชำระ`,
  'iu'
);

export const looksCommitting = (label: string) => COMMIT_WORDS.test(label);

// Whether an action waits for the user's go-ahead: the model says it can't be undone, a button
// reads like one that sends, deletes or pays, or typed text is submitted anywhere but a search box.
export const needsApproval = (action: AgentAction, element: PageElement | undefined, sensitive: boolean) => {
  if (action.kind === 'scroll' || action.kind === 'wait' || action.kind === 'finish') return false;
  if (sensitive) return true;
  if (action.kind === 'click') return looksCommitting(`${element?.name ?? ''} ${element?.value ?? ''}`);
  if (action.kind === 'type') return Boolean(action.submit) && !element?.search;
  return false;
};

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

// An element as the panel names it in a step: its label, or what kind of control it is.
export const elementLabel = (element: PageElement | undefined) =>
  element ? clip(element.name.trim() || element.value?.trim() || element.role || element.tag, 60) : undefined;

const elementLine = (element: PageElement) => {
  const kind = element.role || (element.tag === 'input' ? `input${element.type ? ` type=${element.type}` : ''}` : element.tag);
  const parts = [`[${element.ref}] ${kind}`];
  if (element.name) parts.push(JSON.stringify(clip(element.name, MAX_NAME)));
  if (element.value !== undefined && element.value !== '') parts.push(`value=${JSON.stringify(clip(element.value, 60))}`);
  if (element.options?.length) parts.push(`options: ${element.options.map((option) => JSON.stringify(clip(option, 40))).join(', ')}`);
  if (element.checked !== undefined) parts.push(element.checked ? 'checked' : 'unchecked');
  if (element.disabled) parts.push('disabled');
  if (element.secret) parts.push('(sensitive field: never type here)');
  if (element.href) parts.push(`→ ${clip(element.href, 100)}`);
  return parts.join(' ');
};

// The page as the model reads it each turn.
export const formatSnapshot = (snapshot: PageSnapshot) => {
  const { y, height, viewport } = snapshot.scroll;
  const scrollable = height > viewport + 4;
  const position = scrollable
    ? `${Math.round((y / Math.max(1, height - viewport)) * 100)}% down${y + viewport < height - 4 ? ', more below' : ', at the end'}`
    : 'the whole page is on screen';
  const shown = snapshot.elements.filter((element) => !element.below).slice(0, MAX_ELEMENTS);
  const below = snapshot.elements.filter((element) => element.below).slice(0, Math.max(0, MAX_ELEMENTS - shown.length));
  return [
    `URL: ${snapshot.url}`,
    `Title: ${snapshot.title}`,
    `Scroll: ${position}`,
    '',
    '===visible text===',
    snapshot.text.trim() || '(none)',
    '===end of visible text===',
    '',
    'Elements on screen:',
    ...(shown.length ? shown.map(elementLine) : ['(none)']),
    ...(below.length ? ['', 'Elements further down:', ...below.map(elementLine)] : []),
  ].join('\n');
};

// What the model is told after an action.
export const actionResult = (step: AgentStep) => {
  if (step.status === 'denied') return 'Result: the user declined this action. Do not try it again; finish and tell the user what is left for them to do.';
  if (step.status === 'failed') {
    switch (step.error) {
      case 'not_found':
        return 'Result: failed, that element is no longer on the page. Read the new page state below.';
      case 'secret_field':
        return 'Result: refused. Never type into password, card or code fields; finish and ask the user to fill that in.';
      case 'not_select':
        return 'Result: failed, that element is not a dropdown. Click it instead.';
      case 'no_option':
        return 'Result: failed, the dropdown has no such option.';
      case 'bad_url':
        return 'Result: refused, only http and https addresses can be opened.';
      case 'unreachable':
        return 'Result: failed, this page cannot be controlled (a browser page or a site Shizue may not access).';
      default:
        return 'Result: failed. Try another way.';
    }
  }
  return 'Result: done.';
};
