import '@/assets/global.css';
import '@/assets/tailwind.css';
import NetflixCaptionToggle from '@/components/Netflix/NetflixCaptionToggle';
import { MESSAGE_INJECT_NETFLIX_BRIDGE } from '@/config/constants';
import { registerContentScriptConnection } from '@/lib/contentScriptConnection';
import { getNetflixCaptions } from '@/lib/netflix/netflixCaptionController';
import { NETFLIX_POPUP_HOST_TAG } from '@/lib/netflix/playerControls';
import { contentScriptLog, errorLog } from '@/logs';
import AntdProvider from '@/providers/AntdProvider';
import LanguageProvider from '@/providers/LanguageProvider';
import { StyleProvider as AntdStyleProvider, createCache } from '@ant-design/cssinjs';
import '@ant-design/v5-patch-for-react-19';
import { ConfigProvider } from 'antd';
import 'antd/dist/reset.css?inline';
import { Provider as JotaiProvider } from 'jotai';
import { StrictMode } from 'react';
import { createRoot, Root } from 'react-dom/client';

const NETFLIX_TOGGLE_SHADOW_HOST_ID = 'shizue-netflix-caption-toggle-shadow-host';

// Netflix and its players' clicks and keys: a click inside the player pauses, and keys seek, change
// the volume or go fullscreen. Our button and menu keep theirs to themselves.
const OWN_EVENTS = ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'keydown', 'keyup'];
const keepEventsInside = (element: HTMLElement) => {
  for (const type of OWN_EVENTS) element.addEventListener(type, (event) => event.stopPropagation());
};

// Where the button goes: before the rightmost button of the bottom row (fullscreen), so it sits
// with the right-hand group. Netflix removes the row while its controls are hidden, and the
// buttons' names differ between films and series, so the row is found by layout.
const findButtonSlot = (): { row: Element; before: Element; height: number } | null => {
  const controls = document.querySelector('[data-uia="controls-standard"]');
  if (!controls) return null;
  const buttons = [...controls.querySelectorAll<HTMLElement>('button[data-uia^="control-"]')]
    .filter((button) => !button.closest(`#${NETFLIX_TOGGLE_SHADOW_HOST_ID}`))
    .map((button) => ({ button, rect: button.getBoundingClientRect() }))
    .filter(({ rect }) => rect.width > 0);
  if (buttons.length < 2) return null;
  const rightmost = buttons.reduce((a, b) => (b.rect.right > a.rect.right ? b : a));
  const middle = (rect: DOMRect) => rect.top + rect.height / 2;
  const neighbour = buttons
    .filter(({ button, rect }) => button !== rightmost.button && Math.abs(middle(rect) - middle(rightmost.rect)) < 10)
    .reduce<(typeof buttons)[number] | null>((a, b) => (!a || b.rect.right > a.rect.right ? b : a), null);
  if (!neighbour) return null;
  let row: Element | null = rightmost.button.parentElement;
  while (row && !row.contains(neighbour.button)) row = row.parentElement;
  if (!row) return null;
  const before = [...row.children].find((child) => child.contains(rightmost.button));
  return before ? { row, before, height: rightmost.rect.height } : null;
};

export default defineContentScript({
  matches: ['https://www.netflix.com/*'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',
  async main(ctx) {
    ctx.onInvalidated(registerContentScriptConnection('netflix-caption'));
    document.getElementById(NETFLIX_TOGGLE_SHADOW_HOST_ID)?.remove();
    document.querySelectorAll(NETFLIX_POPUP_HOST_TAG).forEach((host) => host.remove());

    const controller = getNetflixCaptions();
    // The bridge is declared in the manifest, but tabs open before an install or update only get
    // this script back through recovery, so bring the bridge back too.
    void controller.pingBridge().then((alive) => {
      if (!alive && !ctx.isInvalid) void chrome.runtime.sendMessage({ action: MESSAGE_INJECT_NETFLIX_BRIDGE });
    });
    ctx.onInvalidated(() => controller.deactivate());

    // One button for the page's life: it is moved into the control row each time Netflix shows its
    // controls, so the menu and its state survive the controls hiding.
    let customDiv: HTMLDivElement | null = null;
    let mounting = false;

    const createUi = async () => {
      mounting = true;
      contentScriptLog('Netflix');
      let root: Root | null = null;
      const div = document.createElement('div');
      div.id = NETFLIX_TOGGLE_SHADOW_HOST_ID;
      // Inline styles: this div is in Netflix's DOM, which our shadow-root stylesheet doesn't reach.
      Object.assign(div.style, {
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0',
        lineHeight: '0',
        position: 'relative',
      });
      keepEventsInside(div);
      document.body.append(div);
      try {
        const ui = await createShadowRootUi(ctx, {
          name: 'shizue-netflix-caption-toggle',
          position: 'inline',
          anchor: `#${NETFLIX_TOGGLE_SHADOW_HOST_ID}`,
          append: 'first',
          mode: 'open',
          onMount: (container, shadow) => {
            root = createRoot(container);
            container.classList.add('sz:h-full', 'sz:flex', 'sz:flex-col', 'sz:m-0');
            const hostStyle = document.createElement('style');
            hostStyle.textContent = `
              :host {
                display: inline-flex !important;
                height: 100% !important;
                line-height: 0 !important;
                vertical-align: middle !important;
              }
              :host > * {
                height: 100% !important;
              }
            `;
            shadow.appendChild(hostStyle);

            // Tooltips and dropdowns open in their own shadow root on <body> (as on YouTube and
            // Twitch), moved into the fullscreen element in fullscreen, which is all that's drawn.
            document.querySelector(NETFLIX_POPUP_HOST_TAG)?.remove();
            const popupHost = document.createElement(NETFLIX_POPUP_HOST_TAG);
            keepEventsInside(popupHost);
            const popupShadow = popupHost.attachShadow({ mode: 'open' });
            const popupContainer = document.createElement('div');
            // Above Netflix's player layers. On the container: the copied WXT reset sets
            // `:host { all: initial !important }`, which overrides styles on the host element.
            Object.assign(popupContainer.style, { position: 'relative', zIndex: '2147483647' });
            popupShadow.append(shadow.querySelector('style')!.cloneNode(true), popupContainer);
            document.body.append(popupHost);
            ctx.onInvalidated(() => popupHost.remove());
            const followFullscreen = () => {
              const fullscreen = document.fullscreenElement;
              const target = fullscreen && !(fullscreen instanceof HTMLVideoElement) ? fullscreen : document.body;
              if (popupHost.parentElement !== target) target.append(popupHost);
            };
            followFullscreen();
            document.addEventListener('fullscreenchange', followFullscreen);
            ctx.onInvalidated(() => document.removeEventListener('fullscreenchange', followFullscreen));

            root.render(
              <StrictMode>
                <JotaiProvider>
                  <LanguageProvider loadingComponent={null}>
                    <AntdStyleProvider container={popupShadow} cache={createCache()}>
                      <AntdProvider>
                        <ConfigProvider getPopupContainer={() => popupContainer}>
                          <NetflixCaptionToggle />
                        </ConfigProvider>
                      </AntdProvider>
                    </AntdStyleProvider>
                  </LanguageProvider>
                </JotaiProvider>
              </StrictMode>
            );
            return root;
          },
          onRemove: () => {
            root?.unmount();
            div.remove();
          },
        });
        if (ctx.isInvalid) {
          ui.remove();
          return;
        }
        ui.mount();
        ctx.onInvalidated(() => ui.remove());
        customDiv = div;
      } catch (error) {
        div.remove();
        throw error;
      } finally {
        mounting = false;
      }
    };

    const place = () => {
      if (ctx.isInvalid || mounting) return;
      const slot = findButtonSlot();
      if (!slot) return;
      if (!customDiv) {
        void createUi()
          .then(place)
          .catch((error) => errorLog('Netflix caption toggle mount failed', error));
        return;
      }
      customDiv.style.height = `${slot.height}px`;
      if (customDiv.parentElement !== slot.row || customDiv.nextElementSibling !== slot.before) {
        slot.row.insertBefore(customDiv, slot.before);
      }
    };

    // Netflix adds the control row when the mouse moves over the player; put the button in the
    // same frame.
    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        place();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    ctx.onInvalidated(() => observer.disconnect());
    place();
  },
});
