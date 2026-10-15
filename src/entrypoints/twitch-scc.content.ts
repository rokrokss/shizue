import { MESSAGE_SCC_CAPTION_SNAPSHOT, MESSAGE_SCC_SET_HIDDEN } from '@/config/constants';

// Stream Closed Captioner is a Twitch extension: its captions come from its own server over a
// socket that needs the JWT Twitch issues to that extension, so they can only be read from the
// page it renders, in a frame nested inside Twitch's extension supervisor frame. This script
// runs in that frame and relays the visible caption text to the Twitch caption script.
const SCC_EXTENSION_ID = 'h1ekceo16erc49snp0sine3k9ccbh9';
const HIDE_STYLE_ID = 'shizue-hide-scc-captions';
const SEND_INTERVAL_MS = 200;
const MAX_SENT_CHARS = 600;

// The caption box is the element made only of <span>s (one per recognized segment, or one for
// the final text plus one for the text being spoken). It is a <main> styled as
// `caption-styles__Captions-…`; fall back to finding it by shape if that name changes, and take
// the one with the most text.
const captionText = () => {
  const named = [...document.querySelectorAll<HTMLElement>('[class*="caption-styles__Captions-"]')];
  const candidates = named.length ? named : [...document.body.querySelectorAll<HTMLElement>('*')];
  let best = '';
  for (const element of candidates) {
    const children = [...element.children];
    if (!children.length || children.some((child) => child.tagName !== 'SPAN')) continue;
    const text = children
      .map((child) => child.textContent?.trim() ?? '')
      .filter(Boolean)
      .join(' ');
    if (text.length > best.length) best = text;
  }
  // The box can hold up to 30 finished segments; only the end can have changed.
  if (best.length <= MAX_SENT_CHARS) return best;
  const cut = best.indexOf(' ', best.length - MAX_SENT_CHARS);
  return best.slice(cut > 0 ? cut + 1 : best.length - MAX_SENT_CHARS);
};

export default defineContentScript({
  matches: [`https://${SCC_EXTENSION_ID}.ext-twitch.tv/*`],
  allFrames: true,
  runAt: 'document_idle',
  main(ctx) {
    let lastSent = '';
    let timer: ReturnType<typeof setTimeout> | null = null;
    const send = () => {
      timer = null;
      const text = captionText();
      if (!text || text === lastSent || ctx.isInvalid) return;
      lastSent = text;
      void chrome.runtime.sendMessage({ action: MESSAGE_SCC_CAPTION_SNAPSHOT, text }).catch(() => {});
    };
    const observer = new MutationObserver(() => {
      timer ??= setTimeout(send, SEND_INTERVAL_MS);
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    ctx.onInvalidated(() => observer.disconnect());

    // Shizue shows these captions in its own overlay. Only the video overlay view sits on the
    // video; the panel view below it stays. #app-container is the only stable hook, so SCC's
    // settings button is hidden along with its captions.
    const isOverlayView = location.pathname.endsWith('/video_overlay.html');
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.action !== MESSAGE_SCC_SET_HIDDEN || !isOverlayView) return;
      document.getElementById(HIDE_STYLE_ID)?.remove();
      if (!message.hidden) return;
      const style = document.createElement('style');
      style.id = HIDE_STYLE_ID;
      style.textContent = '#app-container { visibility: hidden !important; }';
      document.head.append(style);
    });
  },
});
