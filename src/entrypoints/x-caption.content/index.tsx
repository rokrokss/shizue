import '@/assets/global.css';
import '@/assets/tailwind.css';
import XCaptionToggle from '@/components/X/XCaptionToggle';
import { registerContentScriptConnection } from '@/lib/contentScriptConnection';
import { captionTrack, getXCaptions, playerOf } from '@/lib/x/xCaptionController';
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

const X_TOGGLE_SHADOW_HOST_ID = 'shizue-x-caption-toggle-shadow-host';
const X_POPUP_HOST_TAG = 'shizue-x-caption-popups';

// A click on X's player plays, pauses or opens the post. Our button keeps its events to itself.
const OWN_EVENTS = ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'keydown', 'keyup'];
const keepEventsInside = (element: HTMLElement) => {
  for (const type of OWN_EVENTS) element.addEventListener(type, (event) => event.stopPropagation());
};

export default defineContentScript({
  matches: ['https://x.com/*', 'https://twitter.com/*'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',
  async main(ctx) {
    ctx.onInvalidated(registerContentScriptConnection('x-caption'));
    document.getElementById(X_TOGGLE_SHADOW_HOST_ID)?.remove();
    document.querySelectorAll(X_POPUP_HOST_TAG).forEach((host) => host.remove());

    const controller = getXCaptions();
    ctx.onInvalidated(() => controller.deactivate());

    // One button, moved to the player the pointer is over when its video has captions.
    const div = document.createElement('div');
    div.id = X_TOGGLE_SHADOW_HOST_ID;
    // Inline styles: this div is in X's DOM, which our shadow-root stylesheet doesn't reach.
    Object.assign(div.style, {
      position: 'absolute',
      top: '8px',
      right: '8px',
      height: '32px',
      display: 'inline-flex',
      alignItems: 'center',
      borderRadius: '9999px',
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      lineHeight: '0',
      zIndex: '2',
    });
    keepEventsInside(div);
    let root: Root | null = null;
    let video: HTMLVideoElement | null = null;

    const render = () =>
      root?.render(
        <StrictMode>
          <JotaiProvider>
            <LanguageProvider loadingComponent={null}>
              <AntdStyleProvider container={popupShadow} cache={createCache()}>
                <AntdProvider>
                  <ConfigProvider getPopupContainer={() => popupContainer}>
                    <XCaptionToggle video={video} />
                  </ConfigProvider>
                </AntdProvider>
              </AntdStyleProvider>
            </LanguageProvider>
          </JotaiProvider>
        </StrictMode>
      );

    // Tooltips and dropdowns open in their own shadow root on <body>, moved into the fullscreen
    // element in fullscreen, which is all that's drawn.
    const popupHost = document.createElement(X_POPUP_HOST_TAG);
    keepEventsInside(popupHost);
    const popupShadow = popupHost.attachShadow({ mode: 'open' });
    const popupContainer = document.createElement('div');
    Object.assign(popupContainer.style, { position: 'relative', zIndex: '2147483647' });
    const followFullscreen = () => {
      const fullscreen = document.fullscreenElement;
      const target = fullscreen && !(fullscreen instanceof HTMLVideoElement) ? fullscreen : document.body;
      if (popupHost.parentElement !== target) target.append(popupHost);
    };
    document.addEventListener('fullscreenchange', followFullscreen);
    ctx.onInvalidated(() => {
      document.removeEventListener('fullscreenchange', followFullscreen);
      popupHost.remove();
    });

    let mounted: Promise<void> | null = null;
    const mount = () =>
      (mounted ??= (async () => {
        contentScriptLog('X');
        const ui = await createShadowRootUi(ctx, {
          name: 'shizue-x-caption-toggle',
          position: 'inline',
          anchor: `#${X_TOGGLE_SHADOW_HOST_ID}`,
          append: 'first',
          mode: 'open',
          onMount: (container, shadow) => {
            container.classList.add('sz:h-full', 'sz:flex', 'sz:flex-col', 'sz:m-0');
            popupShadow.append(shadow.querySelector('style')!.cloneNode(true), popupContainer);
            followFullscreen();
            root = createRoot(container);
            render();
            return root;
          },
          onRemove: () => {
            root?.unmount();
            root = null;
            div.remove();
          },
        });
        if (ctx.isInvalid) {
          ui.remove();
          return;
        }
        ui.mount();
        ctx.onInvalidated(() => ui.remove());
      })());

    const place = (player: HTMLElement, next: HTMLVideoElement) => {
      if (div.parentElement !== player) player.append(div);
      if (video !== next) {
        video = next;
        render();
      }
      if (!root) {
        void mount().catch((error) => errorLog('X caption toggle mount failed', error));
      }
    };

    // The video under the pointer, found by where it is drawn: X's controls cover it, and signed
    // out its markup names nothing. X adds a video's caption track once its stream loads, so each
    // hover looks again.
    const onPointerOver = (event: PointerEvent) => {
      if (ctx.isInvalid) return;
      const next = Array.from(document.querySelectorAll('video')).find((video) => {
        const rect = video.getBoundingClientRect();
        return event.clientX >= rect.left && event.clientX <= rect.right &&
          event.clientY >= rect.top && event.clientY <= rect.bottom;
      });
      const player = next && captionTrack(next) ? playerOf(next) : null;
      if (next && player) place(player, next);
    };
    document.addEventListener('pointerover', onPointerOver, true);
    ctx.onInvalidated(() => document.removeEventListener('pointerover', onPointerOver, true));
  },
});
