import '@/assets/global.css';
import '@/assets/tailwind.css';
import TwitchCaptionToggle from '@/components/Twitch/TwitchCaptionToggle';
import { MESSAGE_INJECT_TWITCH_BRIDGE, MESSAGE_SCC_CAPTION_SNAPSHOT } from '@/config/constants';
import { registerContentScriptConnection } from '@/lib/contentScriptConnection';
import { getTwitchLiveCaptions } from '@/lib/twitch/liveCaptionController';
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

const TWITCH_TOGGLE_SHADOW_HOST_ID = 'shizue-twitch-caption-toggle-shadow-host';
const TWITCH_POPUP_HOST_TAG = 'shizue-twitch-caption-popups';

// Twitch renders a second, hidden set of player controls around the same video; use the one
// that is laid out.
const findControlGroup = () => {
  const groups = [
    ...document.querySelectorAll<HTMLElement>('.player-controls__right-control-group'),
  ].filter((group) => group.closest('.video-player')?.querySelector('video'));
  return groups.find((group) => group.getBoundingClientRect().width > 0) ?? groups[0] ?? null;
};

export default defineContentScript({
  matches: ['https://www.twitch.tv/*', 'https://twitch.tv/*'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',
  async main(ctx) {
    ctx.onInvalidated(registerContentScriptConnection('twitch-caption'));
    document.getElementById(TWITCH_TOGGLE_SHADOW_HOST_ID)?.remove();
    document.querySelectorAll(TWITCH_POPUP_HOST_TAG).forEach((host) => host.remove());

    const controller = getTwitchLiveCaptions();
    // The bridge is declared in the manifest, but tabs open before an install or update only get
    // this script back through recovery, so bring the bridge back too.
    void controller.pingBridge().then((alive) => {
      if (!alive && !ctx.isInvalid) void chrome.runtime.sendMessage({ action: MESSAGE_INJECT_TWITCH_BRIDGE });
    });
    ctx.onInvalidated(() => controller.deactivate());
    const onSccSnapshot = (message: any) => {
      if (message?.action === MESSAGE_SCC_CAPTION_SNAPSHOT && typeof message.text === 'string') {
        controller.handleSccSnapshot(message.text);
      }
    };
    chrome.runtime.onMessage.addListener(onSccSnapshot);
    ctx.onInvalidated(() => {
      try {
        chrome.runtime.onMessage.removeListener(onSccSnapshot);
      } catch {
        // Old extension context.
      }
    });

    let mounting = false;
    const mountUi = async () => {
      if (ctx.isInvalid || mounting) return;
      const anchor = findControlGroup();
      const existing = document.getElementById(TWITCH_TOGGLE_SHADOW_HOST_ID);
      if (existing && anchor?.contains(existing)) return;
      existing?.remove();
      if (!anchor) return;
      mounting = true;
      contentScriptLog('Twitch');

      let root: Root | null = null;
      const customDiv = document.createElement('div');
      customDiv.id = TWITCH_TOGGLE_SHADOW_HOST_ID;
      // Inline styles: this div is in Twitch's DOM, which our shadow-root stylesheet doesn't reach.
      Object.assign(customDiv.style, {
        display: 'inline-flex',
        alignItems: 'center',
        height: '100%',
        padding: '0',
        lineHeight: '0',
        position: 'relative',
      });
      anchor.prepend(customDiv);

      try {
        const ui = await createShadowRootUi(ctx, {
          name: 'shizue-twitch-caption-toggle',
          position: 'inline',
          anchor: `#${TWITCH_TOGGLE_SHADOW_HOST_ID}`,
          append: 'first',
          mode: 'open',
          onMount: (container, shadow) => {
            root = createRoot(container);
            container.classList.add('sz:h-full', 'sz:flex', 'sz:flex-col', 'sz:m-0');
            const hostStyle = document.createElement('style');
            hostStyle.textContent = `
              :host {
                display: inline-flex !important;
                height: 30px !important;
                line-height: 0 !important;
                vertical-align: middle !important;
              }
              :host > * {
                height: 100% !important;
              }
            `;
            shadow.appendChild(hostStyle);

            // Tooltips and dropdowns open on <body>, in their own shadow root that reuses the
            // stylesheet WXT put in this one (as on YouTube).
            document.querySelector(TWITCH_POPUP_HOST_TAG)?.remove();
            const popupHost = document.createElement(TWITCH_POPUP_HOST_TAG);
            const popupShadow = popupHost.attachShadow({ mode: 'open' });
            const popupContainer = document.createElement('div');
            // In theatre mode and fullscreen Twitch's player is a fixed layer (z-index 3000), so
            // the menu needs a higher layer. This goes on the container inside the shadow root:
            // the copied WXT reset sets `:host { all: initial !important }`, which overrides styles
            // on the host element.
            Object.assign(popupContainer.style, { position: 'relative', zIndex: '2147483647' });
            popupShadow.append(shadow.querySelector('style')!.cloneNode(true), popupContainer);
            document.body.append(popupHost);
            ctx.onInvalidated(() => popupHost.remove());
            // In fullscreen only the fullscreen element (Twitch's app root) is drawn, so the menu
            // has to live inside it.
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
                          <TwitchCaptionToggle />
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
            customDiv.remove();
          },
        });

        if (ctx.isInvalid || !customDiv.isConnected) {
          ui.remove();
          return;
        }
        ui.mount();
      } catch (error) {
        customDiv.remove();
        throw error;
      } finally {
        mounting = false;
      }
    };

    const mount = () => {
      void mountUi().catch((error) => errorLog('Twitch caption toggle mount failed', error));
    };
    mount();
    // Twitch is a single-page app and rebuilds the player controls on navigation and in
    // theatre mode, so keep the button attached.
    ctx.setInterval(mount, 1000);
  },
});
