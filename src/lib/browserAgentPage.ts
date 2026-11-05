import type { AgentAction, AgentStepError, PageElement, PageSnapshot } from '@/lib/browserAgent';

// What the browser agent (lib/browserAgent.ts) runs in its tab, each function injected on its own
// with chrome.scripting.executeScript, so none uses anything outside itself. They share the
// page's elements through a global of the extension's isolated world, which lasts until the
// page is left: a snapshot numbers them, and an action finds its element by that number. The
// snapshot runs in each of the page's frames too, and an action in the frame its element is in.

type AgentGlobals = {
  __shizueAgentRefs?: Map<number, Element>;
  __shizueAgentOverlay?: { host: HTMLElement; dot: HTMLElement; label: HTMLElement; button: HTMLElement };
  __shizueAgentRing?: (element: Element | null) => void;
};

// The page as the agent reads it: the text on screen, and the controls on screen and a little
// below, numbered. Inputs give their value, except passwords and card fields.
export function snapshotPage(maxText: number): PageSnapshot {
  const globals = globalThis as unknown as AgentGlobals;
  const refs = new Map<number, Element>();
  globals.__shizueAgentRefs = refs;
  const viewport = window.innerHeight;
  const width = window.innerWidth;
  const clean = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
  const SELECTOR = [
    'a[href]',
    'button',
    'input:not([type=hidden])',
    'textarea',
    'select',
    'summary',
    '[contenteditable=""]',
    '[contenteditable="true"]',
    '[onclick]',
    ...[
      'button',
      'link',
      'checkbox',
      'radio',
      'tab',
      'menuitem',
      'menuitemcheckbox',
      'menuitemradio',
      'option',
      'switch',
      'combobox',
      'textbox',
      'searchbox',
      'slider',
    ].map((role) => `[role="${role}"]`),
  ].join(',');
  const SKIP_TEXT = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG']);
  // Shizue's own buttons and menus on the page.
  const ours = (element: Element) => /^shizue/i.test(element.tagName) || /^shizue/i.test(element.id);

  const visible = (element: Element) => {
    const checkVisibility = (element as HTMLElement).checkVisibility;
    return checkVisibility ? checkVisibility.call(element, { opacityProperty: true, visibilityProperty: true }) : true;
  };

  const nameOf = (element: Element): string => {
    const aria = clean(element.getAttribute('aria-label'));
    if (aria) return aria;
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      const root = element.getRootNode() as Document | ShadowRoot;
      const text = clean(labelledBy.split(/\s+/).map((id) => root.getElementById?.(id)?.textContent ?? '').join(' '));
      if (text) return text;
    }
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
      const label = clean(element.labels?.[0]?.innerText);
      if (label) return label;
      if (element instanceof HTMLInputElement && ['submit', 'button', 'reset'].includes(element.type)) return clean(element.value);
      if (!(element instanceof HTMLSelectElement) && element.placeholder) return clean(element.placeholder);
    }
    const text = clean((element as HTMLElement).innerText);
    if (text) return text.slice(0, 160);
    const title = clean(element.getAttribute('title'));
    if (title) return title;
    const image = element.querySelector('img[alt]');
    if (image) return clean(image.getAttribute('alt'));
    const svgTitle = element.querySelector('svg title');
    if (svgTitle) return clean(svgTitle.textContent);
    return clean(element.getAttribute('name') ?? element.getAttribute('data-testid'));
  };

  const isSecret = (element: Element) => {
    if (!(element instanceof HTMLInputElement)) return false;
    const autocomplete = element.autocomplete.toLowerCase();
    const id = `${element.name} ${element.id}`.toLowerCase();
    return (
      element.type === 'password' ||
      /(^|\s)(cc-|one-time-code|current-password|new-password)/.test(autocomplete) ||
      /card.?num|cvc|cvv|ccnum|security.?code|ssn|주민/.test(id)
    );
  };

  const isSearch = (element: Element) => {
    const role = element.getAttribute('role');
    if ((element instanceof HTMLInputElement && element.type === 'search') || role === 'searchbox') return true;
    const hints = ['name', 'id', 'placeholder', 'aria-label', 'title'].map((name) => element.getAttribute(name) ?? '').join(' ');
    return (
      element.closest('form[role="search"], [role="search"]') !== null ||
      element.getAttribute('name') === 'q' ||
      /search|query|검색|検索|搜索|搜尋|buscar|recherche|suche|cerca|поиск/i.test(hints)
    );
  };

  const hrefOf = (element: Element) => {
    if (!(element instanceof HTMLAnchorElement) || !element.href) return undefined;
    try {
      const url = new URL(element.href);
      if (url.protocol === 'javascript:') return undefined;
      return url.origin === location.origin ? `${url.pathname}${url.search}` : url.href;
    } catch {
      return undefined;
    }
  };

  const onScreen: PageElement[] = [];
  const below: PageElement[] = [];
  const seen = new Set<Element>();
  let next = 1;
  const consider = (element: Element) => {
    if (seen.has(element)) return;
    seen.add(element);
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1 || rect.right < 0 || rect.left > width) return;
    if (rect.bottom < 0 || rect.top > viewport * 3) return;
    if (!visible(element)) return;
    const tag = element.tagName.toLowerCase();
    const secret = isSecret(element);
    const found: PageElement = { ref: next, tag, name: nameOf(element) };
    const role = element.getAttribute('role');
    if (role) found.role = role;
    if (element instanceof HTMLInputElement) {
      found.type = element.type;
      if (element.type === 'checkbox' || element.type === 'radio') found.checked = element.checked;
      else if (!secret && element.value) found.value = element.value.slice(0, 200);
    } else if (element instanceof HTMLTextAreaElement) {
      if (element.value) found.value = element.value.slice(0, 200);
    } else if (element instanceof HTMLSelectElement) {
      found.value = clean(element.selectedOptions[0]?.text);
      found.options = Array.from(element.options, (option) => clean(option.text)).filter(Boolean).slice(0, 25);
    }
    const ariaChecked = element.getAttribute('aria-checked') ?? element.getAttribute('aria-pressed');
    if (found.checked === undefined && (ariaChecked === 'true' || ariaChecked === 'false')) found.checked = ariaChecked === 'true';
    if ((element as HTMLButtonElement).disabled || element.getAttribute('aria-disabled') === 'true') found.disabled = true;
    if (secret) found.secret = true;
    if ((tag === 'input' || tag === 'textarea' || role === 'searchbox' || role === 'combobox') && isSearch(element)) found.search = true;
    const href = hrefOf(element);
    if (href) found.href = href;
    if (rect.top >= viewport) found.below = true;
    refs.set(next, element);
    next++;
    (found.below ? below : onScreen).push(found);
  };

  const visit = (root: Document | ShadowRoot) => {
    root.querySelectorAll(SELECTOR).forEach(consider);
    root.querySelectorAll('*').forEach((element) => {
      if (element.shadowRoot && !ours(element)) visit(element.shadowRoot);
    });
  };
  visit(document);

  // The text on screen, a line for each element it is in.
  const parts: string[] = [];
  let total = 0;
  let lastParent: Element | null = null;
  const shown = new Map<Element, boolean>();
  const isShown = (element: Element) => {
    let value = shown.get(element);
    if (value === undefined) {
      const rect = element.getBoundingClientRect();
      value =
        rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < viewport && rect.right > 0 && rect.left < width && visible(element);
      shown.set(element, value);
    }
    return value;
  };
  const walk = (root: Node) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        node.nodeType === Node.ELEMENT_NODE &&
        (SKIP_TEXT.has((node as Element).tagName.toUpperCase()) || ours(node as Element))
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    });
    for (let node = walker.nextNode(); node && total < maxText; node = walker.nextNode()) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const shadow = (node as Element).shadowRoot;
        if (shadow) walk(shadow);
        continue;
      }
      const text = clean(node.textContent);
      const parent = node.parentElement;
      if (!text || !parent || !isShown(parent)) continue;
      parts.push(parts.length === 0 ? text : parent === lastParent ? ` ${text}` : `\n${text}`);
      lastParent = parent;
      total += text.length + 1;
    }
  };
  if (document.body) walk(document.body);

  const scroller = document.scrollingElement ?? document.documentElement;
  return {
    url: location.href,
    title: document.title,
    text: parts.join('').slice(0, maxText),
    elements: [...onScreen, ...below],
    scroll: { y: Math.round(scroller.scrollTop), height: Math.round(scroller.scrollHeight), viewport },
  };
}

// One action on an element of the last snapshot, shown with a ring around it first.
export async function performAction(action: AgentAction): Promise<{ ok: boolean; error?: AgentStepError }> {
  const globals = globalThis as unknown as AgentGlobals;
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const instant = 'instant' as ScrollBehavior;

  if (action.kind === 'scroll') {
    const amount = Math.round(window.innerHeight * 0.8) * (action.direction === 'up' ? -1 : 1);
    const scroller = document.scrollingElement ?? document.documentElement;
    const before = scroller.scrollTop;
    window.scrollBy({ top: amount, behavior: instant });
    if (Math.abs(scroller.scrollTop - before) < 2) {
      // The page scrolls in a box of its own: the one under the middle of the screen.
      let box = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      while (box && !(box.scrollHeight > box.clientHeight + 4 && /(auto|scroll|overlay)/.test(getComputedStyle(box).overflowY))) {
        box = box.parentElement;
      }
      box?.scrollBy({ top: amount, behavior: instant });
    }
    return { ok: true };
  }

  const element = action.ref !== undefined ? globals.__shizueAgentRefs?.get(action.ref) : undefined;
  if (!element || !element.isConnected) return { ok: false, error: 'not_found' };
  const html = element as HTMLElement;
  html.scrollIntoView?.({ block: 'center', inline: 'nearest', behavior: instant });
  globals.__shizueAgentRing?.(element);
  await sleep(450);

  if (action.kind === 'click') {
    const rect = element.getBoundingClientRect();
    const at = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      button: 0,
    };
    const pointer = { ...at, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    element.dispatchEvent(new PointerEvent('pointerover', pointer));
    element.dispatchEvent(new MouseEvent('mouseover', at));
    element.dispatchEvent(new PointerEvent('pointerdown', pointer));
    element.dispatchEvent(new MouseEvent('mousedown', at));
    html.focus?.({ preventScroll: true });
    element.dispatchEvent(new PointerEvent('pointerup', pointer));
    element.dispatchEvent(new MouseEvent('mouseup', at));
    html.click();
    return { ok: true };
  }

  if (action.kind === 'type') {
    if (element instanceof HTMLInputElement) {
      const autocomplete = element.autocomplete.toLowerCase();
      if (element.type === 'password' || /(^|\s)(cc-|one-time-code|current-password|new-password)/.test(autocomplete)) {
        return { ok: false, error: 'secret_field' };
      }
    }
    const text = action.text ?? '';
    html.focus?.({ preventScroll: true });
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      // The prototype's setter, so a framework's own value tracking sees the change.
      const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, text);
      element.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: text }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (html.isContentEditable) {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      selection?.removeAllRanges();
      selection?.addRange(range);
      // Editors follow the input events this sends; setting the text would bypass them.
      if (!document.execCommand('insertText', false, text)) html.textContent = text;
    } else {
      return { ok: false, error: 'failed' };
    }
    if (action.submit) {
      const key = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true };
      const handled = !element.dispatchEvent(new KeyboardEvent('keydown', key as KeyboardEventInit));
      element.dispatchEvent(new KeyboardEvent('keypress', key as KeyboardEventInit));
      element.dispatchEvent(new KeyboardEvent('keyup', key as KeyboardEventInit));
      // An Enter the page doesn't take submits the field's form, as a real one would.
      if (!handled && element instanceof HTMLInputElement && element.form) element.form.requestSubmit();
    }
    return { ok: true };
  }

  if (action.kind === 'select') {
    if (!(element instanceof HTMLSelectElement)) return { ok: false, error: 'not_select' };
    const wanted = (action.text ?? '').trim().toLowerCase();
    const options = Array.from(element.options);
    const option =
      options.find((o) => o.value.toLowerCase() === wanted || o.text.trim().toLowerCase() === wanted) ??
      options.find((o) => wanted && o.text.toLowerCase().includes(wanted));
    if (!option) return { ok: false, error: 'no_option' };
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    setter ? setter.call(element, option.value) : (element.value = option.value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true };
  }

  return { ok: false, error: 'failed' };
}

// While the agent works the tab: a soft frame around the page, a pill at the top saying so with a
// button to stop (it sends `labels.stopAction`), and the ring an action draws around its element.
// `null` takes it all away.
export function showAgentOverlay(
  state: { working: string; waiting: string; stop: string; stopAction: string; waitingNow: boolean } | null
) {
  const globals = globalThis as unknown as AgentGlobals;
  if (!state) {
    globals.__shizueAgentOverlay?.host.remove();
    globals.__shizueAgentOverlay = undefined;
    globals.__shizueAgentRing = undefined;
    return;
  }
  let overlay = globals.__shizueAgentOverlay;
  if (!overlay || !overlay.host.isConnected) {
    const host = document.createElement('div');
    host.setAttribute('data-shizue-agent', '');
    Object.assign(host.style, { position: 'fixed', inset: '0', zIndex: '2147483646', pointerEvents: 'none' });
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      .frame { position: fixed; inset: 0; pointer-events: none; box-shadow: inset 0 0 0 2px rgba(50, 204, 188, 0.85), inset 0 0 28px rgba(50, 204, 188, 0.28); animation: breathe 2.4s ease-in-out infinite; }
      .pill { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); display: inline-flex; align-items: center; gap: 10px; box-sizing: border-box; height: 36px; padding: 0 5px 0 14px; border-radius: 9999px; background: rgba(17, 17, 17, 0.88); color: #fff; font: 500 13px/1 system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif; white-space: nowrap; pointer-events: auto; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25); backdrop-filter: blur(8px); animation: drop 240ms ease-out both; }
      .dot { width: 8px; height: 8px; border-radius: 50%; background: #32ccbc; color: rgba(50, 204, 188, 0.6); animation: pulse 1.6s ease-out infinite; flex: none; }
      .dot.waiting { background: #f5b14c; color: rgba(245, 177, 76, 0.6); }
      button { all: unset; cursor: pointer; padding: 7px 12px; border-radius: 9999px; background: rgba(255, 255, 255, 0.12); font-weight: 600; transition: background 150ms ease; }
      button:hover { background: rgba(255, 255, 255, 0.22); }
      button:focus-visible { outline: 2px solid #32ccbc; outline-offset: 2px; }
      .ring { position: fixed; border-radius: 8px; pointer-events: none; opacity: 0; box-shadow: 0 0 0 2px #32ccbc, 0 0 0 6px rgba(50, 204, 188, 0.25); transition: opacity 200ms ease, left 180ms ease, top 180ms ease, width 180ms ease, height 180ms ease; }
      .ring.on { opacity: 1; }
      @keyframes breathe { 0%, 100% { opacity: 0.65; } 50% { opacity: 1; } }
      @keyframes drop { from { opacity: 0; transform: translate(-50%, -6px); } to { opacity: 1; transform: translate(-50%, 0); } }
      @keyframes pulse { 0% { box-shadow: 0 0 0 0 currentColor; } 70%, 100% { box-shadow: 0 0 0 6px transparent; } }
      @media (prefers-reduced-motion: reduce) { .frame, .pill, .dot { animation: none; } .ring { transition: none; } }
    `;
    const frame = document.createElement('div');
    frame.className = 'frame';
    const ring = document.createElement('div');
    ring.className = 'ring';
    const pill = document.createElement('div');
    pill.className = 'pill';
    pill.setAttribute('role', 'status');
    const dot = document.createElement('span');
    const label = document.createElement('span');
    const button = document.createElement('button');
    button.type = 'button';
    for (const type of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup']) {
      pill.addEventListener(type, (event) => event.stopPropagation());
    }
    pill.append(dot, label, button);
    shadow.append(style, frame, ring, pill);
    document.documentElement.append(host);
    overlay = { host, dot, label, button };
    globals.__shizueAgentOverlay = overlay;
    let fade: ReturnType<typeof setTimeout> | undefined;
    globals.__shizueAgentRing = (element) => {
      clearTimeout(fade);
      if (!element) return ring.classList.remove('on');
      const rect = element.getBoundingClientRect();
      Object.assign(ring.style, {
        left: `${rect.left - 4}px`,
        top: `${rect.top - 4}px`,
        width: `${rect.width + 8}px`,
        height: `${rect.height + 8}px`,
      });
      ring.classList.add('on');
      fade = setTimeout(() => ring.classList.remove('on'), 1400);
    };
  }
  const stopAction = state.stopAction;
  overlay.button.onclick = (event) => {
    event.preventDefault();
    void chrome.runtime.sendMessage({ action: stopAction }).catch(() => {});
  };
  overlay.dot.className = state.waitingNow ? 'dot waiting' : 'dot';
  overlay.label.textContent = state.waitingNow ? state.waiting : state.working;
  overlay.button.textContent = state.stop;
}
